#!/usr/bin/env node
/**
 * fetch-icons.mjs — tải biểu tượng item và máy về `public/img/`.
 *
 * Đây là **art của game (Gryphline)**, không phải tài sản của trang nào tải nó.
 * Để chạy thử cục bộ thì tiện; nếu định phát hành công khai thì nên tự trích asset
 * từ client game thay vì lấy qua trang khác. Tải về đĩa chứ không nhúng link trực
 * tiếp, để ứng dụng không phụ thuộc vào máy chủ của người ta khi chạy.
 *
 * Dùng:  node tools/fetch-icons.mjs [base-url]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] ?? 'https://enkad.enka.network';
const OUT = resolve('public/img');
const CONCURRENCY = 12;

const items = JSON.parse(readFileSync(resolve('data/items.json'), 'utf8')).items;
const machines = JSON.parse(readFileSync(resolve('data/machines.json'), 'utf8')).machines;

const jobs = [
  ...[...new Set(items.map((i) => i.icon))].map((icon) => ({ dir: 'itemicon', name: `${icon}.png` })),
  ...machines.map((m) => ({ dir: 'items', name: `${m.icon}.png` })),
  // sprite nhìn từ trên xuống — hình dạng công trình thật trên lưới, khác hẳn ảnh biểu tượng
  ...machines.map((m) => ({ dir: 'sprites', name: `${m.icon}.png` })),
];

for (const d of ['itemicon', 'items', 'sprites']) mkdirSync(resolve(OUT, d), { recursive: true });

let done = 0;
let missing = 0;
let skipped = 0;

async function run(job) {
  const target = resolve(OUT, job.dir, job.name);
  if (existsSync(target)) {
    skipped++;
    return;
  }
  try {
    const res = await fetch(`${BASE}/img/${job.dir}/${job.name}`);
    if (!res.ok) {
      missing++;
      return;
    }
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    done++;
  } catch {
    missing++;
  }
}

const queue = [...jobs];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await run(job);
  }),
);

console.log(`tải ${done} · có sẵn ${skipped} · không có ${missing} / tổng ${jobs.length}`);
console.log(`Thư mục: ${OUT}`);
console.log('Chạy tiếp `node tools/shrink-icons.mjs` để thu nhỏ trước khi build.');
