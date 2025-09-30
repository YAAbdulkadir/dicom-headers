"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// electron/preload.ts
const electron_1 = require("electron");
/* ----------------------------- Implementation --------------------------- */
const api = {
    // Window controls
    winMinimize: () => electron_1.ipcRenderer.invoke('win:minimize'),
    winMaximize: () => electron_1.ipcRenderer.invoke('win:maximize'),
    winClose: () => electron_1.ipcRenderer.invoke('win:close'),
    winFullScreenToggle: () => electron_1.ipcRenderer.invoke('win:fullscreenToggle'),
    // Dialogs
    chooseDir: () => electron_1.ipcRenderer.invoke('dialog:chooseDir'),
    // Scanning
    startScan: (root, options) => electron_1.ipcRenderer.invoke('scan:start', root, options),
    onScanProgress: (cb) => {
        electron_1.ipcRenderer.on('scan:progress', (_e, msg) => cb(msg));
    },
    onScanResult: (cb) => {
        electron_1.ipcRenderer.on('scan:result', (_e, msg) => cb(msg));
    },
    onScanError: (cb) => {
        electron_1.ipcRenderer.on('scan:error', (_e, msg) => cb(msg));
    },
    // Headers
    getHeaders: (path, options) => electron_1.ipcRenderer.invoke('headers:get', path, options),
    // Headers window & tabs
    openHeaderWindow: (payload) => electron_1.ipcRenderer.invoke('headers:openWindow', payload),
    openHeaderSeries: (payload) => electron_1.ipcRenderer.invoke('headers:openSeries', payload),
    onHeadersAddTab: (cb) => {
        const handler = (_e, payload) => cb(payload);
        electron_1.ipcRenderer.on('headers:add-tab', handler);
        return () => electron_1.ipcRenderer.off('headers:add-tab', handler);
    },
    // small handshake to force a flush if needed
    pingHeaders: () => electron_1.ipcRenderer.invoke('headers:ping'),
};
electron_1.contextBridge.exposeInMainWorld('api', api);
