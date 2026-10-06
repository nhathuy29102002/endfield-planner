// Điều khiển WebView của app Android qua giao thức gỡ lỗi (người dùng 2026-10-05, chỉ để thử nghiệm).
// node tools/android/cdp.mjs <script.mjs> — script: export default async ({ ev, touch, tap, swipe, path, pinch, sleep, send }) => kết quả
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const A = `${process.env.HOME}/Android/Sdk/platform-tools/adb`;
const pid = execSync(`${A} shell pidof com.endfield.aicplanner`).toString().trim();
execSync(`${A} forward tcp:9333 localabstract:webview_devtools_remote_${pid}`);
const list = await (await fetch('http://localhost:9333/json')).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
});
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text };
  return r.result?.result?.value;
};
const touch = (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
const tap = async (x, y, hold = 60) => { await touch('touchStart', [[x, y]]); await sleep(hold); await touch('touchEnd', []); await sleep(80); };
/** Rê một ngón qua các điểm [[x,y],…] (bước nhỏ giữa hai điểm). */
const path = async (pts, msPerStep = 16, holdFirst = 0) => {
  await touch('touchStart', [pts[0]]);
  if (holdFirst) await sleep(holdFirst);
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1]; const [x2, y2] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 6));
    for (let k = 1; k <= n; k++) { await touch('touchMove', [[x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n]]); await sleep(msPerStep); }
  }
  await touch('touchEnd', []); await sleep(100);
};
const swipe = (x1, y1, x2, y2, steps = 12, ms = 250, holdFirst = 0) => path([[x1, y1], [x2, y2]], Math.max(4, ms / Math.max(1, Math.hypot(x2 - x1, y2 - y1) / 6)), holdFirst);
const pinch = async (cx, cy, d1, d2, steps = 10) => {
  await touch('touchStart', [[cx - d1 / 2, cy], [cx + d1 / 2, cy]]);
  for (let i = 1; i <= steps; i++) { const d = d1 + ((d2 - d1) * i) / steps; await touch('touchMove', [[cx - d / 2, cy], [cx + d / 2, cy]]); await sleep(25); }
  await touch('touchEnd', []); await sleep(100);
};
await send('Runtime.enable');
const mod = await import(pathToFileURL(resolve(process.argv[2])).href);
const out = await mod.default({ ev, touch, tap, swipe, path, pinch, sleep, send });
console.log(JSON.stringify(out, null, 1));
ws.close();
process.exit(0);
