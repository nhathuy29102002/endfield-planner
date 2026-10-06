#!/usr/bin/env node
/**
 * apply-names.mjs — gắn tên hiển thị thật (tiếng Việt + tiếng Anh) vào dữ liệu.
 *
 * Bảng dữ liệu game không ghi tên mà chỉ ghi **mã hash của tên** (`name: { id: … }`);
 * chữ nằm ở bảng ngôn ngữ riêng, khoá bằng chính mã đó dưới dạng chuỗi thập phân. Có
 * một điểm dễ sai: mã là số nguyên 64-bit nhưng JS đọc nó thành số thực, **làm tròn**,
 * và khoá trong bảng ngôn ngữ là chuỗi của số *đã làm tròn* đó
 * (`-0x6fcc55810fac8c0` → `"-503624390549768400"`, không phải giá trị nguyên chính xác).
 * Nên phải chuyển bằng `String(Number(…))` đúng như JS, chứ không dùng BigInt.
 *
 * Dùng:
 *   node tools/apply-names.mjs <bundle-dữ-liệu.js> <bảng-VN.js> <bảng-EN.js> [thư-mục-data]
 *
 * Máy/vật tư nào không có trong bảng thì giữ tên suy từ mã, và được liệt kê ra.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [bundlePath, vnPath, enPath, dataDir = 'data'] = process.argv.slice(2);
if (!bundlePath || !vnPath || !enPath) {
  console.error('Dùng: node tools/apply-names.mjs <bundle.js> <bảng-VN.js> <bảng-EN.js> [thư-mục-data]');
  process.exit(1);
}

/** Đọc bảng ngôn ngữ dạng `{"<mã>": "chữ", …}` — giá trị có thể nằm trong nháy kép hoặc backtick. */
const table = (p) =>
  Object.fromEntries(
    [...readFileSync(resolve(p), 'utf8').matchAll(/"(-?\d+)":[`"]((?:[^`"\\]|\\.)*)[`"]/g)].map((m) => [
      m[1],
      m[2].replace(/\\(.)/g, '$1'),
    ]),
  );
const vn = table(vnPath);
const en = table(enPath);
const bundle = readFileSync(resolve(bundlePath), 'utf8');

/** Chuỗi khoá y hệt cách JS tạo ra từ một literal số (kể cả hex âm). */
const jsKey = (literal) => {
  const neg = literal.startsWith('-');
  const n = Number(neg ? literal.slice(1) : literal);
  return String(neg ? -n : n);
};

/** Mã tên của một id trong bundle: `id:{ … name:{id:<số>,text …` gần nhất sau khoá. */
function nameKey(id) {
  const re = new RegExp(`\\b${id}:\\{[^]{0,700}?\\bname:\\{id:(-?[0-9a-fx.e]+),text`);
  const m = bundle.match(re);
  return m ? jsKey(m[1]) : undefined;
}

function apply(file, key) {
  const path = resolve(dataDir, file);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const missing = [];
  for (const row of json[key]) {
    const k = nameKey(row.id);
    const vi = k ? vn[k] : undefined;
    const eng = k ? en[k] : undefined;
    if (vi) row.name = vi;
    else if (eng) row.name = eng;
    else missing.push(row.id);
    if (vi) row.nameVi = vi;
    if (eng) row.nameEn = eng;
  }
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  const total = json[key].length;
  console.log(`  ${file.padEnd(15)} có tên thật ${total - missing.length}/${total}`);
  if (missing.length) console.log(`    giữ tên suy từ mã: ${missing.join(', ')}`);
}

apply('machines.json', 'machines');
apply('items.json', 'items');
