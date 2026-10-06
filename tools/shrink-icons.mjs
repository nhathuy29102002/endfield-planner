#!/usr/bin/env node
/**
 * shrink-icons.mjs — thu ảnh về đúng cỡ hiển thị.
 *
 * Biểu tượng gốc ~256px còn sprite công trình tới ~1000px cho một máy 3×3; ứng dụng
 * chỉ vẽ ở cỡ ô lưới nên phần lớn số điểm ảnh đó là lãng phí. Sprite thu theo **bề
 * rộng footprint** (`PX_PER_CELL` điểm ảnh mỗi ô) chứ không phải về một cỡ cố định —
 * máy 5×5 phải to gấp năm máy 1×1 thì trên lưới mới đúng tỉ lệ.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ICON_SIZE = 64;
const PX_PER_CELL = 48;

const machines = JSON.parse(readFileSync(resolve('data/machines.json'), 'utf8')).machines;
const byIcon = new Map(machines.map((m) => [m.icon, m]));

let n = 0;
let before = 0;
let after = 0;

for (const dir of ['itemicon', 'items', 'sprites']) {
  const d = resolve('public/img', dir);
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    before += statSync(p).size;
    if (dir === 'sprites') {
      const m = byIcon.get(f.replace(/\.png$/, ''));
      const width = Math.max(48, (m?.size.w ?? 1) * PX_PER_CELL);
      // chỉ ràng bề rộng; chiều cao tự theo tỉ lệ vì nhiều công trình cao hơn đế của nó
      execFileSync('convert', [p, '-resize', `${width}x`, '-strip', p]);
    } else {
      execFileSync('convert', [p, '-resize', `${ICON_SIZE}x${ICON_SIZE}`, '-strip', p]);
    }
    after += statSync(p).size;
    n++;
  }
}
const mb = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';
console.log(`${n} ảnh: ${mb(before)} → ${mb(after)}`);
