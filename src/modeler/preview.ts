import type { ModelerDoc } from './doc';
import { INK_LINE, inkBounds, inkTextSize } from './ink';

/**
 * Ảnh xem trước nhỏ của một sơ đồ Modeler cho thẻ trong thư viện (Modeler đợt 4): máy = ô xám viền đen
 * như trên sơ đồ, đường nối = đường thẳng giữa hai máy, nét bút / chữ vẽ đè lên trên. Không vẽ icon (ảnh tải
 * bất đồng bộ).
 */
export function modelerPreview(doc: ModelerDoc, w = 240, h = 150): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  // nền trong suốt (người dùng 2026-10-02): khung ảnh trong thư viện tô màu nền theo giao diện đang bật
  if (doc.nodes.length === 0 && !doc.drawings?.length) return canvas.toDataURL('image/webp', 0.85);
  // cỡ ước lượng của một máy trên sơ đồ (px của sơ đồ)
  const NW = 150;
  const NH = 110;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of doc.nodes) {
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + NW);
    y1 = Math.max(y1, n.y + NH);
  }
  for (const d of doc.drawings ?? []) {
    const b = inkBounds(d);
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  }
  const pad = 10;
  const k = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (y1 - y0), 0.5);
  const ox = (w - (x1 - x0) * k) / 2 - x0 * k;
  const oy = (h - (y1 - y0) * k) / 2 - y0 * k;
  const at = new Map(doc.nodes.map((n) => [n.id, n]));
  ctx.strokeStyle = '#8b949e';
  ctx.lineWidth = 1.5;
  for (const e of doc.edges) {
    const a = at.get(e.from.node);
    const b = at.get(e.to.node);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(ox + (a.x + NW) * k, oy + (a.y + NH / 2) * k);
    ctx.lineTo(ox + b.x * k, oy + (b.y + NH / 2) * k);
    ctx.stroke();
  }
  for (const n of doc.nodes) {
    ctx.fillStyle = n.recipeId || n.item ? '#d9dcdf' : '#9aa0a6';
    ctx.fillRect(ox + n.x * k, oy + n.y * k, NW * k, NH * k);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + n.x * k + 0.5, oy + n.y * k + 0.5, NW * k - 1, NH * k - 1);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const d of doc.drawings ?? []) {
    if (d.kind === 'rect') {
      ctx.strokeStyle = d.color;
      ctx.lineWidth = Math.max(1, d.width * k);
      ctx.strokeRect(ox + d.x * k, oy + d.y * k, d.w * k, d.h * k);
    } else if (d.kind === 'stroke') {
      ctx.strokeStyle = d.color;
      ctx.lineWidth = Math.max(1, d.width * k);
      ctx.beginPath();
      for (let i = 0; i < d.points.length; i += 2) {
        const x = ox + d.points[i]! * k;
        const y = oy + d.points[i + 1]! * k;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (d.points.length === 2) ctx.lineTo(ox + d.points[0]! * k + 0.01, oy + d.points[1]! * k);
      ctx.stroke();
    } else {
      const size = inkTextSize(d.width) * k;
      if (size < 3) continue;
      ctx.fillStyle = d.color;
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      d.text.split('\n').forEach((line, i) => ctx.fillText(line, ox + d.x * k, oy + d.y * k + size * (i * INK_LINE + 0.95)));
    }
  }
  return canvas.toDataURL('image/webp', 0.85);
}
