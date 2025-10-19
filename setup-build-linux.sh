#!/usr/bin/env bash
set -euo pipefail

echo "==> Updating apt and installing packaging toolchain…"
sudo apt update
sudo apt install -y \
  build-essential \
  git curl ca-certificates \
  fakeroot dpkg rpm \
  xz-utils \
  libx11-dev

# Optional but handy if you want to RUN AppImages on this WSL distro:
# (Not required for building, only for running your .AppImage)
sudo apt install -y libfuse2 || true

echo "==> Installing Node.js via nvm (recommended)…"
if [ ! -d "$HOME/.nvm" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
# shellcheck source=/dev/null
source "$HOME/.nvm/nvm.sh"
nvm install --lts
nvm use --lts

echo "==> Node versions:"
node -v
npm -v

# If your repo isn't already here, clone it:
# git clone https://github.com/YAAbdulkadir/dicom-headers.git ~/dicom-headers

cd ~/dicom-headers

echo "==> Installing dependencies…"
# prefer clean, reproducible install
npm ci || npm install

echo "==> Building renderer and electron…"
npm run build:renderer
npm run build:electron

echo "==> Packaging Linux artifacts (AppImage, deb, rpm)…"
npm run dist:linux

echo "==> Done!"
echo "Artifacts are in: $(pwd)/release"
echo "You can open them from Windows Explorer at: \\\\wsl$\\$(lsb_release -is)\\home\\$USER\\dicom-headers\\release"
