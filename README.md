# 🩻 DICOM Headers  
*A fast, elegant Electron app to browse and inspect DICOM headers.*

<div align="center">

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-blue?style=flat-square)
![Electron](https://img.shields.io/badge/Built_with-Electron_38.3.0-47848F?style=flat-square&logo=electron)
![React](https://img.shields.io/badge/Frontend-React_18-61DAFB?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/Language-TypeScript_5.4-3178C6?style=flat-square&logo=typescript)
![License](https://img.shields.io/badge/License-LGPL_3.0-green?style=flat-square)
[![GitHub Releases](https://img.shields.io/github/v/release/YAAbdulkadir/dicom-headers?style=flat-square&color=orange)](https://github.com/YAAbdulkadir/dicom-headers/releases)

</div>

---

## 📸 Preview

| Main Window | Header Viewer |
|:-------------:|:---------------:|
| ![Main Window](https://raw.githubusercontent.com/YAAbdulkadir/dicom-headers/refs/heads/main/assets/screenshots/headers_window.png) | ![Headers Viewer](https://raw.githubusercontent.com/YAAbdulkadir/dicom-headers/refs/heads/main/assets/screenshots/headers_window.png) |


---

## 🚀 Overview

**DICOM Headers** is a lightweight, cross-platform viewer for inspecting DICOM metadata.  
It’s designed for researchers, developers, and medical physicists who need a **fast, minimal**, and **accurate** tool to explore `.dcm` and `.ima` files without launching a full-featured PACS.

Built using:
- ⚡ **Electron** + **Vite** for blazing-fast startup
- ⚛️ **React + TypeScript** for modular UI
- 🧠 **dicom-parser** for reliable tag decoding

---

## 📦 Installation

### 🪟 **Windows**

1. Visit the [**Releases**](https://github.com/YAAbdulkadir/dicom-headers/releases) page.  
2. Download **`DICOM Headers Setup X.Y.Z.exe`**.  
   - Double-click to install.  
   - The app will appear in your **Start Menu**.  

### 🐧 **Linux**

#### 🧊 Option 1 — AppImage (recommended)
Works on most distributions (Ubuntu, Fedora, Arch, Pop!_OS, etc.)

```bash
chmod +x "DICOM Headers-0.2.4.AppImage"
./"DICOM Headers-0.2.4.AppImage"
```
To integrate into your application menu:

```bash
./"DICOM Headers-0.2.4.AppImage" --appimage-extract
./squashfs-root/AppRun
```

#### 📦 Option 2 — Debian / Ubuntu (.deb)
```bash
sudo dpkg -i dicom-headers_0.2.4_amd64.deb
sudo apt --fix-broken install  # if needed
dicom-headers
```

#### 🧱 Option 3 — Fedora / RHEL / openSUSE (.rpm)
```bash
sudo dnf install -y ./dicom-headers-0.2.4.x86_64.rpm
dicom-headers

```
#### 📄 Available Artifacts
| File                             | Description                             |
| -------------------------------- | --------------------------------------- |
| `DICOM Headers-X.Y.Z.AppImage`   | Portable all-in-one build (recommended) |
| `dicom-headers_X.Y.Z_amd64.deb`  | Debian / Ubuntu package                 |
| `dicom-headers-X.Y.Z.x86_64.rpm` | Fedora / RHEL / openSUSE package        |

#### 🔄 Auto-Updates
If you include latest.yml (Windows) or latest-linux.yml (Linux) from the GitHub release,
DICOM Headers will automatically check for updates when launched (via electron-updater).

## License
This project is licensed under the LGPL 3.0 License. See the [LICENSE](LICENSE) file for details

## Contacts
**Author:** [Yasin Abdulkadir](mailto:YasinAAbdulkadir@gmail.com)

**GitHub:** [@YAAbdulkadir](https://github.com/YAAbdulkadir)

If you have any questions, suggestions, or bug reports, please reach out or open an issue on the repository.

