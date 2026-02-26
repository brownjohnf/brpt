#!/usr/bin/env bash
set -euo pipefail

BRPT_PATH=$(command -v brpt 2>/dev/null || true)
if [ -z "$BRPT_PATH" ]; then
    echo "brpt not found on PATH." >&2
    exit 1
fi

BRPT_REAL=$(realpath "$BRPT_PATH")
INSTALL_DIR=$(dirname "$BRPT_REAL")
APPIMAGE="$INSTALL_DIR/brpt.AppImage"

echo "Removing:"
echo "  $BRPT_REAL"
[ -f "$APPIMAGE" ] && echo "  $APPIMAGE"
echo ""
read -rp "Continue? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Cancelled."
    exit 0
fi

if rm -f "$BRPT_REAL" "$APPIMAGE" 2>/dev/null; then
    echo "Uninstalled."
else
    echo "Permission denied. Retrying with sudo..." >&2
    sudo rm -f "$BRPT_REAL" "$APPIMAGE"
    echo "Uninstalled (with sudo)."
fi
