#!/bin/bash
# Chụp màn hình điện thoại: tools/android/shot.sh <thư mục> <tên> [tỉ lệ] ⇒ <thư mục>/<tên>.jpg
OUT=${1:?thư mục}; N=${2:-dev}; S=${3:-0.5}
~/Android/Sdk/platform-tools/adb exec-out screencap -p > "$OUT/$N.png"
python3 -c "
from PIL import Image; im=Image.open('$OUT/$N.png'); s=$S; im.convert('RGB').resize((int(im.size[0]*s), int(im.size[1]*s))).save('$OUT/$N.jpg', quality=82); print(im.size)"
