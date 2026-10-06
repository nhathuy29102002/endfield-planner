#!/usr/bin/env bash
# Tạo icon "Endfield AIC Planner" trên Desktop + menu ứng dụng (Ubuntu / GNOME). Chạy một lần:
#   bash tools/install-desktop-icon.sh
# Bấm icon ⇒ tools/launch-linux.sh (bật máy chủ nếu cần rồi mở trình duyệt).
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chmod +x "$DIR/tools/launch-linux.sh"
ICON="$DIR/public/img/items/item_port_mix_pool_2.png"
[ -f "$ICON" ] || ICON="$(ls "$DIR"/public/img/items/*.png | head -n 1)"

ENTRY="[Desktop Entry]
Type=Application
Name=Endfield AIC Planner
Comment=Mở Endfield AIC Planner trên trình duyệt
Exec=/bin/bash \"$DIR/tools/launch-linux.sh\"
Icon=$ICON
Terminal=false
Categories=Utility;Development;
"

APPS="$HOME/.local/share/applications"
mkdir -p "$APPS"
printf '%s' "$ENTRY" > "$APPS/endfield-planner.desktop"
chmod +x "$APPS/endfield-planner.desktop"

DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
if [ -d "$DESKTOP" ]; then
  cp "$APPS/endfield-planner.desktop" "$DESKTOP/"
  chmod +x "$DESKTOP/endfield-planner.desktop"
  # GNOME: đánh dấu tin cậy để bấm là chạy (không phải chuột phải → "Allow Launching")
  gio set "$DESKTOP/endfield-planner.desktop" metadata::trusted true 2>/dev/null || true
fi
echo "Đã tạo icon: $APPS/endfield-planner.desktop${DESKTOP:+ và $DESKTOP/endfield-planner.desktop}"
