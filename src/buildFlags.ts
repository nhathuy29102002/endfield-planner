/**
 * Cờ của bản build.
 *
 * `PUBLIC_BUILD` — **bản public** (GitHub / web công khai, người dùng 2026-10-06): `npm run build:public` (= `vite build
 * --mode public`, đọc `.env.public` ⇒ `VITE_PUBLIC=1`). Bản này **tạm bỏ tính năng nhập bản vẽ của EnKAD** (mã game
 * `EFO0…` tra qua API của EnKAD + chuỗi bản vẽ EnKAD) — ô "Nhập mã bản vẽ" trong cửa sổ Bản vẽ không hiện. Bản build
 * thường (`npm run build`, exe, apk) giữ nguyên.
 */
export const PUBLIC_BUILD: boolean = import.meta.env.VITE_PUBLIC === '1';
