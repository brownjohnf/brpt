#!/usr/bin/env bash
set -euo pipefail

APPIMAGE=$(find dist -maxdepth 1 -name '*.AppImage' -print -quit 2>/dev/null)
if [ -z "$APPIMAGE" ]; then
    echo "No AppImage found in dist/. Run 'npm run build:linux' first." >&2
    exit 1
fi

INSTALL_DIR=""

if [ $# -ge 1 ]; then
    INSTALL_DIR="$1"
else
    DEFAULT_DIR=""
    if echo "$PATH" | tr ':' '\n' | grep -qx '/usr/local/bin'; then
        DEFAULT_DIR="/usr/local/bin"
    else
        DEFAULT_DIR="$HOME/.local/bin"
    fi

    read -rp "Install directory [$DEFAULT_DIR]: " INSTALL_DIR
    INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_DIR}"
fi

# Expand ~
INSTALL_DIR="${INSTALL_DIR/#\~/$HOME}"

install_files() {
    local dir="$1"
    mkdir -p "$dir"
    cp "$APPIMAGE" "$dir/brpt.AppImage"
    chmod +x "$dir/brpt.AppImage"
    cp resources/brpt "$dir/brpt"
    chmod +x "$dir/brpt"
}

if install_files "$INSTALL_DIR" 2>/dev/null; then
    echo "Installed to $INSTALL_DIR"
else
    echo "Permission denied for $INSTALL_DIR. Retrying with sudo..." >&2
    sudo mkdir -p "$INSTALL_DIR"
    sudo cp "$APPIMAGE" "$INSTALL_DIR/brpt.AppImage"
    sudo chmod +x "$INSTALL_DIR/brpt.AppImage"
    sudo cp resources/brpt "$INSTALL_DIR/brpt"
    sudo chmod +x "$INSTALL_DIR/brpt"
    echo "Installed to $INSTALL_DIR (with sudo)"
fi

if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
    echo ""
    echo "Warning: $INSTALL_DIR is not on your PATH."
    echo "Add it to your shell profile:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
fi
