#!/usr/bin/env node
/**
 * i18n-keys.mjs — liệt kê mọi câu cần dịch trong `src/` (đối số đầu của `tr('…')`).
 *
 * Dùng:
 *   npm run i18n              → in mọi câu, dạng dòng của bảng dịch (mẫu cho ngôn ngữ mới)
 *   npm run i18n -- en        → chỉ in câu file `src/i18n/locales/en.ts` còn thiếu
 *   npm run i18n -- en --unused → in câu thừa trong file dịch (mã không còn dùng)
 *
 * Xem hướng dẫn thêm ngôn ngữ ở đầu `src/i18n/index.ts`.
 */
import ts from 'typescript';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Mọi câu `tr('…')` trong `src/`, theo thứ tự gặp lần đầu. */
export function sourceKeys(root = ROOT) {
  const keys = new Map();
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts')) scan(p);
    }
  };
  const scan = (file) => {
    const src = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true);
    const visit = (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tr') {
        const a = n.arguments[0];
        if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) {
          if (!keys.has(a.text)) keys.set(a.text, `${file.slice(root.length + 1)}:${sf.getLineAndCharacterOfPosition(a.getStart()).line + 1}`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  };
  walk(join(root, 'src'));
  return keys;
}

/** Bảng dịch của một ngôn ngữ (đọc thẳng file `.ts` — phần `strings: { … }`). */
export function localeStrings(code, root = ROOT) {
  const file = join(root, 'src/i18n/locales', `${code}.ts`);
  if (!existsSync(file)) return null;
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
  const out = new Map();
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && n.name.getText(sf) === 'strings' && ts.isObjectLiteralExpression(n.initializer)) {
      for (const p of n.initializer.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const k = ts.isStringLiteral(p.name) || ts.isIdentifier(p.name) ? p.name.text : null;
        const v = p.initializer;
        if (k !== null && (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v))) out.set(k, v.text);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const q = (s) => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [code] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const keys = sourceKeys();
  if (!code) {
    for (const k of keys.keys()) console.log(`    ${q(k)}: ${q(k)},`);
    console.error(`${keys.size} câu`);
  } else {
    const table = localeStrings(code);
    if (!table) {
      console.error(`Không có src/i18n/locales/${code}.ts`);
      process.exit(1);
    }
    if (process.argv.includes('--unused')) {
      for (const k of table.keys()) if (!keys.has(k)) console.log(`    ${q(k)},`);
    } else {
      let n = 0;
      for (const [k, where] of keys) {
        if (table.has(k)) continue;
        n++;
        console.log(`    // ${where}\n    ${q(k)}: ${q(k)},`);
      }
      console.error(`${code}: thiếu ${n}/${keys.size} câu`);
    }
  }
}
