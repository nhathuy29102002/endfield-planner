// Đặt số phiên bản cho cả ba nơi: package.json (web — Cài đặt hiện "vX.Y.Z"), src-tauri/tauri.conf.json và
// src-tauri/Cargo.toml (exe). Android lấy từ biến môi trường APP_VERSION (android/app/build.gradle).
// Dùng: node tools/set-version.mjs v0.2.0   (chữ "v" đầu có hay không đều được) — GitHub Actions gọi theo tag.
import { readFileSync, writeFileSync } from 'node:fs';

const raw = (process.argv[2] ?? '').trim().replace(/^refs\/tags\//, '').replace(/^v/i, '');
if (!/^\d+\.\d+\.\d+$/.test(raw)) {
  console.error(`Số phiên bản không hợp lệ: "${process.argv[2] ?? ''}" (cần dạng 1.2.3 hoặc v1.2.3)`);
  process.exit(1);
}

const json = (path, fn) => {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  fn(data);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
};
json('package.json', (d) => (d.version = raw));
json('src-tauri/tauri.conf.json', (d) => (d.version = raw));
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8').replace(/^version = ".*"$/m, `version = "${raw}"`);
writeFileSync('src-tauri/Cargo.toml', cargo);
console.log(raw);
