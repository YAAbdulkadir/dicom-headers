import { parentPort, workerData } from 'node:worker_threads'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire} from 'node:module'
import * as dicomParser from 'dicom-parser'

type ScanOptions = { ignorePrivate: boolean; ignoreBulk: boolean; redactPHI: boolean }

function listFiles(root: string): string[] {
  const out: string[] = []
  const stack: string[] = [root]
  while (stack.length) {
    const dir = stack.pop()!
    let ents: fs.Dirent[]
    try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const e of ents) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (e.isFile()) out.push(p)
    }
  }
  return out
}

function readMinimalDS(buf: Buffer) {
  const byteArray = new Uint8Array(buf)
  // parse without pixel data for speed/robustness
  const ds = dicomParser.parseDicom(byteArray, { untilTag: 'x7fe00010' })
  const str = (tag: string) => ds.string(tag) || null
  const num = (tag: string) => Number(str(tag) || 0) || null
  const nums = (tag: string, n: number) => {
    const s = str(tag); if (!s) return null
    const a = s.split('\\').map(Number)
    return a.length >= n ? a.slice(0, n) : null
  }
  return {
    PatientName: str('x00100010'),
    PatientID: str('x00100020'),
    StudyInstanceUID: str('x0020000d'),
    SeriesInstanceUID: str('x0020000e'),
    SOPInstanceUID:   str('x00080018'),
    StudyDescription: str('x00081030'),
    SeriesDescription:str('x0008103e'),
    Modality:         str('x00080060'),
    InstanceNumber:   num('x00200013'),
    AcquisitionNumber:num('x00200012'),
    ImageOrientationPatient: nums('x00200037', 6),
    ImagePositionPatient:    nums('x00200032', 3),
    NumberOfFrames:  num('x00280008'),
    Rows:            num('x00280010'),
    Columns:         num('x00280011'),
    PixelSpacing:    nums('x00280030', 2),
    SliceThickness:  num('x00180050'),

    // Times/Dates
    AcquisitionDate:       str('x00080022'),
    AcquisitionTime:       str('x00080032'),
    InstanceCreationDate:  str('x00080012'),
    InstanceCreationTime:  str('x00080013'),
    ContentDate:           str('x00080023'),
    ContentTime:           str('x00080033'),
    SeriesDate:            str('x00080021'),
    SeriesTime:            str('x00080031'),

    Manufacturer:    str('x00080070'),
    ManufacturerModelName: str('x00081090'),
  }
}

async function scanDirectory(jobId: string, rootPath: string, _options: ScanOptions){
  const files = listFiles(rootPath)
  const total = files.length || 1

  type Inst = {
    path: string; instanceNumber: number|null; acquisitionNumber: number|null;
    frameCount: number|null; acqTime: string|null;
    iop?: number[]|null; ipp?: number[]|null;
    _rows?: number|null; _cols?: number|null; _ps?: number[]|null; _st?: number|null;
    _mod?: string|null; _desc?: string|null; _manu?: string|null; _model?: string|null;
    sop?: string|null;  // SOPInstanceUID
    date?: string|null; // best-effort date 
    time?: string|null; // best-effort time
  }

  // patients -> studies -> series -> instances
  const patients: Record<string, {
    name: string|null,
    studies: Record<string, {
      studyUID: string, studyDescription: string|null,
      series: Record<string, Inst[]>
    }>
  }> = {}

  // stats
  let filesParsed = 0
  let instancesCount = 0
  const modalityBySeries: Record<string, number> = {} // count series by modality

  let processed = 0
  for (const file of files) {
    processed++
    if (processed % 50 === 0 || processed === total) {
      parentPort?.postMessage({ type: 'progress', jobId, percent: processed/total, currentPath: file })
    }
    let buf: Buffer
    try { buf = fs.readFileSync(file) } catch { continue }
    if (buf.length < 64) continue

    let nat: any
    try { nat = readMinimalDS(buf) } catch { continue }
    filesParsed++

    const studyUID = nat.StudyInstanceUID
    const seriesUID = nat.SeriesInstanceUID
    if (!studyUID || !seriesUID) continue

    const patientID = nat.PatientID || 'UNKNOWN'
    const patientName = nat.PatientName || null

    patients[patientID] ||= { name: patientName, studies: {} }
    patients[patientID].name ??= patientName

    const study = patients[patientID].studies[studyUID] ||= {
      studyUID,
      studyDescription: nat.StudyDescription || null,
      series: {}
    }

    const date = 
      nat.AcquisitionDate ||
      nat.InstanceCreationDate ||
      nat.ContentDate ||
      nat.SeriesDate || null

    const time = 
      nat.AcquisitionTime || 
      nat.InstanceCreationTime ||
      nat.ContentTime ||
      nat.SeriesTime || null
      

    const inst: Inst = {
      path: file,
      instanceNumber: nat.InstanceNumber,
      acquisitionNumber: nat.AcquisitionNumber,
      frameCount: nat.NumberOfFrames,
      acqTime: nat.AcquisitionTime,
      iop: nat.ImageOrientationPatient,
      ipp: nat.ImagePositionPatient,
      _rows: nat.Rows,
      _cols: nat.Columns,
      _ps: nat.PixelSpacing,
      _st: nat.SliceThickness,
      _mod: nat.Modality,
      _desc: nat.SeriesDescription,
      _manu: nat.Manufacturer,
      _model: nat.ManufacturerModelName,
      sop: nat.SOPInstanceUID,
      date: date,
      time: time,
    }

    const arr = (study.series[seriesUID] ||= [])
    arr.push(inst)
    instancesCount++
  }

  // final progress 100%
  parentPort?.postMessage({ type: 'progress', jobId, percent: 1, currentPath: null })

  // Summarize: patients -> studies -> series[]
  const outPatients: any[] = []
  let studiesCount = 0
  let seriesCount = 0

  for (const [pid, p] of Object.entries(patients)) {
    const outStudies: any[] = []
    for (const [studyUID, s] of Object.entries(p.studies)) {
      studiesCount++
      const outSeries: any[] = []
      for (const [seriesUID, instances] of Object.entries(s.series)) {
        seriesCount++
        const ordered = (instances as Inst[]).slice().sort((a,b)=>{
          const ak = (a.acquisitionNumber||0) - (b.acquisitionNumber||0)
          return ak !== 0 ? ak : (a.instanceNumber||0) - (b.instanceNumber||0)
        })
        const sample = ordered.find(x => (x._rows && x._cols)) || ordered[0] || {}
        const modality = sample._mod || 'UNK'
        modalityBySeries[modality] = (modalityBySeries[modality] || 0) + 1

        outSeries.push({
          seriesUID,
          modality,
          seriesDescription: sample._desc || null,
          studyDescription: (s as any).studyDescription || null,
          count: ordered.length,
          rows: sample._rows || null, cols: sample._cols || null,
          pixelSpacing: sample._ps || null, sliceThickness: sample._st || null,
          orientation: null as any, spacing: null as any,
          manufacturer: sample._manu || null, model: sample._model || null,
          instances: ordered.map(x => ({
            path: x.path,
            sop: x.sop ?? null,
            instanceNumber: x.instanceNumber ?? null,
            date: x.date ?? null,
            time: x.time ?? null,
            acquisitionNumber: x.acquisitionNumber,
            frameCount: x.frameCount,
            acqTime: x.acqTime
          }))
        })
      }
      outStudies.push({ studyUID, studyDescription: s.studyDescription, series: outSeries })
    }
    outPatients.push({ patient_id: pid, patient_name: p.name, studies: outStudies })
  }

  const stats = {
    filesTotal: files.length,
    filesParsed,
    patients: outPatients.length,
    studies: studiesCount,
    series: seriesCount,
    instances: instancesCount,
    modalityBySeries,
  }

  parentPort?.postMessage({ type: 'result', jobId, index: { patients: outPatients, stats } })
}

// ---------- Full DICOM dictionary loading (best-effort) ----------
type DictEntry = { name?: string; keyword?: string; vr?: string }
let FULL_DICT: Record<string, DictEntry> = {}
type HeaderNode = {
  tagHex: string
  keyword: string
  vr: string | null
  length: number | null
  vm: number | null
  dtype: string | null
  preview: string  // short textual preview; blank when no value
  children?: HeaderNode[]
}


// If we're in CJS, `require` exists. If not, synthesize one from a known filesystem path.
declare const require: NodeJS.Require
const nodeRequire: NodeJS.Require = (() => {
  try {
    // CJS / tsconfig module=commonjs
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require
  } catch {
    // ESM build: create a require anchored at the project root (or current cwd)
    try {
      return createRequire(path.join(process.cwd(), 'package.json'))
    } catch {
      return createRequire(path.join(process.cwd(), 'index.js'))
    }
  }
})()

function safeReadJSON(p: string): any | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
}

function loadFullDict(): Record<string, DictEntry> {
  let base: string
  try {
    const pkgPath = nodeRequire.resolve('dicom-data-dictionary/package.json')
    base = path.dirname(pkgPath)
  } catch {
    base = ''
  }

  const candidates = [
    'public.json',
    'full.json',
    path.join('dist', 'public.json'),
    path.join('dist', 'full.json'),
    path.join('data', 'public.json'),
    path.join('data', 'full.json'),
    'index.json',
  ]

  // 1) Try JSON files in the package
  for (const rel of candidates) {
    if (!base) break
    const p = path.join(base, rel)
    if (fs.existsSync(p)) {
      const obj = safeReadJSON(p)
      if (obj && typeof obj === 'object') return normalizeDict(obj)
    }
  }

  // 2) Try requiring the module directly (could export the map)
  try {
    const mod: any = nodeRequire('dicom-data-dictionary')
    const obj = mod?.default ?? mod
    if (obj && typeof obj === 'object') return normalizeDict(obj)
  } catch {
    // ignore
  }

  // 3) Give up (we'll still render tags without keywords)
  return {}
}


/** Normalize various shapes into a canonical { "00080060": {keyword/name, vr}, ... } */
function normalizeDict(raw: any): Record<string, DictEntry> {
  const out: Record<string, DictEntry> = {}

  // Shape A: { "00080060": { "name": "Modality", "vr": "CS" }, ... }
  const keys = Object.keys(raw)
  const looksLikeMap = keys.length > 0 && /^[0-9a-fA-F]{8}$/.test(keys[0])
  if (looksLikeMap) {
    for (const k of keys) {
      const v = raw[k]
      if (v && typeof v === 'object') {
        out[k.toLowerCase()] = {
          name: v.name || v.keyword || '',
          keyword: v.keyword || v.name || '',
          vr: v.vr || null,
        }
      }
    }
    if (Object.keys(out).length) return out
  }

  // Shape B: { "0008,0060": { ... } }
  const looksLikeComma = keys.length > 0 && /^[0-9a-fA-F]{4},[0-9a-fA-F]{4}$/.test(keys[0])
  if (looksLikeComma) {
    for (const k of keys) {
      const key = k.replace(',', '').toLowerCase()
      const v = raw[k]
      if (v && typeof v === 'object') {
        out[key] = {
          name: v.name || v.keyword || '',
          keyword: v.keyword || v.name || '',
          vr: v.vr || null,
        }
      }
    }
    if (Object.keys(out).length) return out
  }

  // Shape C: array of entries like [{ tag:"00080060", name:"Modality", vr:"CS" }, ...]
  if (Array.isArray(raw)) {
    for (const e of raw) {
      const tag = (e?.tag || e?.Tag || '').toString().replace(/[^\da-fA-F]/g, '')
      if (/^[0-9a-fA-F]{8}$/.test(tag)) {
        out[tag.toLowerCase()] = {
          name: e.name || e.keyword || '',
          keyword: e.keyword || e.name || '',
          vr: e.vr || null,
        }
      }
    }
    if (Object.keys(out).length) return out
  }

  // As a last resort, search nested properties that look like a map
  for (const k of keys) {
    const v = raw[k]
    if (v && typeof v === 'object') {
      const nested = normalizeDict(v)
      if (Object.keys(nested).length) return nested
    }
  }

  return out
}

/** Convert "(gggg,eeee)" to many possible dict keys */
function keyVariants(tagHex: string): string[] {
  const m = /\(([0-9a-fA-F]{4}),([0-9a-fA-F]{4})\)/.exec(tagHex)
  if (!m) return []
  const g = m[1], e = m[2]
  const flat = `${g}${e}`
  const flatL = flat.toLowerCase()
  const flatU = flat.toUpperCase()
  return [
    flatL, flatU,           // "00080060"
    `${g},${e}`.toLowerCase(), `${g},${e}`.toUpperCase(), // "0008,0060"
    `x${flatL}`, `x${flatU}`, // "x00080060"
    `${g}-${e}`, `${g}_${e}`, // "0008-0060", "0008_0060"
  ]
}

function lookupDict(tagHex: string): { keyword: string; vr: string | null } {
  if (!FULL_DICT || !Object.keys(FULL_DICT).length) FULL_DICT = loadFullDict()
  const variants = keyVariants(tagHex)
  for (const k of variants) {
    const hit = (FULL_DICT as any)[k]
    if (hit && typeof hit === 'object') {
      const keyword = (hit.keyword || hit.name || '').toString()
      const vr = (hit.vr || null) as string | null
      return { keyword, vr }
    }
  }
  // Not found
  return { keyword: '', vr: null }
}


function isPrivateTag(tagHex: string): boolean {
  const m = /\(([0-9a-fA-F]{4}),([0-9a-fA-F]{4})\)/.exec(tagHex)
  if (!m) return false
  const group = parseInt(m[1], 16)
  return (group % 2) === 1
}

function vmFor(ds: any, tag: string, el: any, vr: string | null): number | null {
  if (vr === 'SQ') return Array.isArray(el?.items) ? el.items.length : 0;
  const len = typeof el?.length === 'number' ? el.length : null;
  if (len == null) return null;

  switch (vr) {
    case 'US':
    case 'SS':
      return Math.max(1, Math.floor(len / 2));
    case 'UL':
    case 'SL':
    case 'FL':
    case 'AT': // tag is 4 bytes per component (group+element)
      return Math.max(1, Math.floor(len / 4));
    case 'FD':
      return Math.max(1, Math.floor(len / 8));
    // String-like VRs: VM from backslashes in the textual value
    default: {
      try {
        const s = ds.string(tag);
        if (s == null || s === '') return 0;
        return s.split('\\').length;
      } catch {
        return null;
      }
    }
  }
}

function readNumericValues(ds: any, tag: string, el: any, vr: string): number[] {
  const len = typeof el?.length === 'number' ? el.length : 0;
  const out: number[] = [];
  const n16 = Math.floor(len / 2);
  const n32 = Math.floor(len / 4);
  const n64 = Math.floor(len / 8);

  switch (vr) {
    case 'US':
      for (let i = 0; i < n16; i++) out.push(ds.uint16(tag, i));
      break;
    case 'SS':
      for (let i = 0; i < n16; i++) out.push(ds.int16(tag, i));
      break;
    case 'UL':
      for (let i = 0; i < n32; i++) out.push(ds.uint32(tag, i));
      break;
    case 'SL':
      for (let i = 0; i < n32; i++) out.push(ds.int32(tag, i));
      break;
    case 'FL':
      for (let i = 0; i < n32; i++) out.push(ds.float(tag, i));
      break;
    case 'FD':
      for (let i = 0; i < n64; i++) out.push(ds.double(tag, i));
      break;
    case 'AT':
      // AT is 4 bytes per component; dicom-parser doesn't have a direct AT getter.
      // You can show it as hex via string(); VM is already correct from length.
      break;
  }
  return out;
}


function isBinaryVR(vr: string | null): boolean {
  return !!vr && /^(OB|OW|OF|OD|OL|UN)$/i.test(vr);
}

function isNumericVR(vr: string | null): boolean {
  return !!vr && /^(US|SS|UL|SL|FL|FD|IS|DS|AT)$/i.test(vr);
}

function isStringVR(vr: string | null): boolean {
  return !!vr && /^(AE|AS|CS|DA|DT|LO|LT|PN|SH|ST|TM|UI|UC|UR|UT|IS|DS)$/i.test(vr);
}

function dtypeForVR(vr: string | null): string | null {
  switch (vr) {
    case 'UI': return 'UID'
    case 'DA': return 'Date'
    case 'TM': return 'Time'
    case 'DT': return 'DateTime'
    case 'PN': case 'LO': case 'LT': case 'SH': case 'ST': case 'UT': case 'CS':
      return 'String'
    case 'IS': case 'DS':
    case 'US': case 'SS': case 'UL': case 'SL': case 'FL': case 'FD':
      return 'Number'
    case 'AT': return 'Tag'
    case 'SQ': return 'Sequence'
    case 'OB': case 'OW': case 'OF': case 'OD': case 'OL': case 'UN':
      return 'Binary'
    default:
      return vr ? 'Other' : null
  }
}


function tagHexFromString(tag: string) {
  // dicom-parser uses "xggggeeee"
  const g = tag.slice(1, 5)
  const e = tag.slice(5, 9)
  return `(${g},${e})`
}

function elementPreview(ds: any, tag: string, el: any, vr: string | null): string {
  // Sequences: show item count
  if (vr === 'SQ' || el.vr === 'SQ' || el.items) {
    const n = (el.items?.length ?? 0);
    return `Items: ${n}`;
  }

  // Binary-ish payloads: don't dump bytes
  if (isBinaryVR(vr)) {
    return ''; // your UI shows "[binary]" and you already display Length
  }

  // Numeric VRs
  if (vr && /^(US|SS|UL|SL|FL|FD)$/i.test(vr)) {
    const vals = readNumericValues(ds, tag, el, vr);
    return vals.length ? vals.join('\\') : '';
  }

  // Numeric as strings (IS/DS): keep textual form with backslashes if VM>1
  if (vr && /^(IS|DS)$/i.test(vr)) {
    try {
      const s = ds.string(tag) || '';
      return s.length > 120 ? (s.slice(0, 117) + '…') : s;
    } catch { return ''; }
  }

  // Text VRs (LO/SH/CS/PN/UI/etc.): use string()
  if (isStringVR(vr)) {
    try {
      const s = ds.string(tag) || '';
      return s.length > 120 ? (s.slice(0, 117) + '…') : s;
    } catch { return ''; }
  }

  // Fallback
  try {
    const s = ds.string(tag);
    if (s && s.length > 0) {
      return s.length > 120 ? (s.slice(0, 117) + '…') : s;
    }
  } catch {}
  const length = typeof el.length === 'number' ? el.length : 0;
  return length > 0 ? `<${length} bytes>` : '';
}

function walkDataSet(ds: any): HeaderNode[] {
  const out: HeaderNode[] = []
  const elements = ds.elements || {}

  for (const tag of Object.keys(elements)) {
    const el = elements[tag]
    const hex = tagHexFromString(tag)

    const d = lookupDict(hex)
    const vr = (el.vr ?? d.vr ?? null) as string | null
    const keyword = d.keyword || (isPrivateTag(hex) ? 'Private Tag' : '')

    const vm = vmFor(ds, tag, el, vr)
    const dtype = dtypeForVR(vr)
    const preview = elementPreview(ds, tag, el, vr)
    const length = typeof el.length === 'number' ? el.length : null

    const node: HeaderNode = {
      tagHex: hex,
      keyword,
      vr,
      length,
      vm,
      dtype,
      preview,
    }

    if (vr === 'SQ' || Array.isArray(el.items)) {
      node.children = []
      const items = el.items || []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        // “Item N” row; leave other columns blank on this row per your spec
        const itemRow: HeaderNode = {
          tagHex: `${hex}[${i}]`,
          keyword: `Item ${i + 1}`,
          vr: null,
          length: null,
          vm: null,
          dtype: null,
          preview: '',   // blank value cell
          children: item?.dataSet ? walkDataSet(item.dataSet) : [],
        }
        node.children.push(itemRow)
      }
    }

    out.push(node)
  }
  return out
}


function headersForFile(filePath: string){
  const buf = fs.readFileSync(filePath)
  const byteArray = new Uint8Array(buf)
  const ds = dicomParser.parseDicom(byteArray, { untilTag: 'x7fe00010' })
  return walkDataSet(ds)
}

;(async ()=>{
  const { jobId, rootPath, options, mode, singleFile } = workerData || {}
  try{
    if (mode === 'headers' && singleFile){
      const headers = headersForFile(singleFile)
      parentPort?.postMessage({ type: 'headers', jobId, headers })
      return
    }
    await scanDirectory(jobId, rootPath, options)
  }catch(err:any){
    parentPort?.postMessage({ type: 'error', jobId, error: String(err?.message||err) })
  }
})()
