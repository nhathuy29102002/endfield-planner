#!/usr/bin/env bash
# Mở Endfield AIC Planner trên trình duyệt bằng một cú bấm (Ubuntu / Linux).
#
# - Chưa có node_modules ⇒ npm install; chưa build hoặc mã nguồn mới hơn bản build ⇒ npm run build.
# - Máy chủ chưa chạy ⇒ bật `vite preview` ở cổng 4178 (chạy nền, log ở /tmp/endfield-planner.log).
# - Mở http://localhost:4178/ bằng trình duyệt mặc định.
#
# Luôn dùng CÙNG cổng 4178: dữ liệu (map, sơ đồ, thư viện) lưu trong trình duyệt theo địa chỉ — đổi cổng là
# thấy "mất" dữ liệu.
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT=4178
URL="http://localhost:${PORT}/"
LOG=/tmp/endfield-planner.log
cd "$DIR"

up() { curl -s -o /dev/null --max-time 1 "$URL"; }

if ! up; then
  [ -d node_modules ] || npm install >>"$LOG" 2>&1
  if [ ! -f dist/index.html ] || [ -n "$(find src public index.html -newer dist/index.html -print -quit 2>/dev/null)" ]; then
    npm run build >>"$LOG" 2>&1
  fi
  nohup npx vite preview --port "$PORT" --strictPort >>"$LOG" 2>&1 &
  for _ in $(seq 1 60); do up && break; sleep 0.25; done
fi
xdg-open "$URL" >/dev/null 2>&1 &
