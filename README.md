# DICOM Headers

 A fast, minimal Electron app to browse DICOM headers.
 Built with **vite + React + TypeScript + Electron** and **dicom-parser**.

 ## Install (prebuilt)
 Grab the latest release from **Github Releases** (see "Releasing" below):

 - **Windows:** `DICOM Headers Setup X.Y.Z.exe` (NSIS installer) or `win-unpacked` portable folder
 - **Linux:** `AppImage` or `.deb`

 ## Development

 ```bash
 # 1) install deps
 npm i

 # 2) run renderer dev server
 npm run dev

 # 3) run Electron (loads the dev server URL)
 npm run electron:dev
 ```

 ## Packaging locally
 ### Windows
 ```bash
 npm run build:renderer
 npm run build:electron
 npm run dist:win
 ```

 Artifacts are written to release/:
 * **win-unpacked**/ - portable exe (no install)
 * **DICOM Headers Setup X.Y.Z.exe** - NSIS installer (recommended for end users)

 ### Linux
 ```bash
 npm run build:renderer
 npm run build:electron
 npm run dist:linux
 ```

 Artifacts:
 * ***.AppImage** - portable (recommended)
 * Optionally **.deb**, **.rpm** if configured

## Usage
1. Launch the app.
2. Click Scan and choose a folder with DICOM files.
3. In the Series list, choose **View Headers** to open a tabbed headers window.
4. Click an instance to load its headers; expand sequences as needed.

## License
This project is licensed under the LGPL 3.0 License. See the [LICENSE](LICENSE) file for details

## Contacts
If you have any questions or suggestions, please contact me at YasinAAbdulkadir@gmail.com
