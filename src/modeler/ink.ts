import type { MDrawing } from './doc';

/**
 * **Bút vẽ** của Modeler (người dùng 2026-09-30): vẽ tự do và viết chữ lên sơ đồ, chỉnh màu bằng bảng màu và
 * độ dày nét riêng. Phần tính toán thuần (không đụng DOM) — màn hình ở `view.ts`.
 */

/** Bảng màu có sẵn (ngoài ra còn ô chọn màu tuỳ ý). */
export const INK_COLORS = ['#e8c547', '#ff6b6b', '#ff9f43', '#3fb950', '#39c5cf', '#58a6ff', '#bc8cff', '#ff7ab6', '#ffffff', '#111111'];
export const INK_MIN = 1;
export const INK_MAX = 24;

export type InkTool = 'draw' | 'rect' | 'text' | 'erase';
export interface InkSettings {
  color: string;
  width: number;
}
export const INK_DEFAULT: InkSettings = { color: INK_COLORS[0]!, width: 3 };

/** Cỡ chữ theo độ dày nét (suy luận: độ dày 1 ⇒ 13px, 3 ⇒ 17px, 24 ⇒ 59px). */
export const inkTextSize = (width: number): number => 11 + width * 2;
/** Khoảng cách dòng của chữ, theo cỡ chữ. */
export const INK_LINE = 1.25;

/**
 * Đường SVG của một nét: nối các điểm bằng cung bậc hai qua trung điểm ⇒ nét mềm. Một điểm ⇒ chấm tròn
 * (đoạn dài 0, đầu nét tròn).
 */
export function inkPath(points: number[]): string {
  const n = points.length / 2;
  if (n === 0) return '';
  const x = (i: number): number => points[2 * i]!;
  const y = (i: number): number => points[2 * i + 1]!;
  const r = (v: number): number => Math.round(v * 10) / 10;
  if (n === 1) return `M${r(x(0))} ${r(y(0))}l0 0.01`;
  if (n === 2) return `M${r(x(0))} ${r(y(0))}L${r(x(1))} ${r(y(1))}`;
  let d = `M${r(x(0))} ${r(y(0))}`;
  for (let i = 1; i < n - 1; i++) {
    const mx = (x(i) + x(i + 1)) / 2;
    const my = (y(i) + y(i + 1)) / 2;
    d += `Q${r(x(i))} ${r(y(i))} ${r(mx)} ${r(my)}`;
  }
  return d + `L${r(x(n - 1))} ${r(y(n - 1))}`;
}

/** Thêm một điểm vào nét, bỏ qua điểm quá sát điểm trước (`minDist` px của sơ đồ). */
export function inkAddPoint(points: number[], x: number, y: number, minDist: number): boolean {
  const n = points.length;
  if (n >= 2 && Math.hypot(x - points[n - 2]!, y - points[n - 1]!) < minDist) return false;
  points.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  return true;
}

/** Hình chữ nhật từ hai góc bất kỳ (kéo theo hướng nào cũng được). */
export const rectFrom = (a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number; w: number; h: number } => ({
  x: Math.round(Math.min(a.x, b.x)),
  y: Math.round(Math.min(a.y, b.y)),
  w: Math.round(Math.abs(b.x - a.x)),
  h: Math.round(Math.abs(b.y - a.y)),
});

/** Khung bao (px của sơ đồ) — dùng cho "Vừa màn hình" và ảnh xem trước. Chữ: ước lượng theo số ký tự. */
export function inkBounds(d: MDrawing): { x0: number; y0: number; x1: number; y1: number } {
  if (d.kind === 'rect') {
    const h = d.width / 2;
    return { x0: d.x - h, y0: d.y - h, x1: d.x + d.w + h, y1: d.y + d.h + h };
  }
  if (d.kind === 'text') {
    const size = inkTextSize(d.width);
    const lines = d.text.split('\n');
    const longest = Math.max(1, ...lines.map((l) => l.length));
    return { x0: d.x, y0: d.y, x1: d.x + longest * size * 0.6, y1: d.y + lines.length * size * INK_LINE };
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < d.points.length; i += 2) {
    x0 = Math.min(x0, d.points[i]!);
    x1 = Math.max(x1, d.points[i]!);
    y0 = Math.min(y0, d.points[i + 1]!);
    y1 = Math.max(y1, d.points[i + 1]!);
  }
  const h = d.width / 2;
  return { x0: x0 - h, y0: y0 - h, x1: x1 + h, y1: y1 + h };
}

const INK_KEY = 'efp:pen';
/** Màu + độ dày bút lần trước (mỗi trình duyệt). */
export function loadInk(): InkSettings {
  try {
    const v = JSON.parse(localStorage.getItem(INK_KEY) ?? 'null') as Partial<InkSettings> | null;
    const width = Number(v?.width);
    return {
      color: typeof v?.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : INK_DEFAULT.color,
      width: Number.isFinite(width) ? Math.max(INK_MIN, Math.min(INK_MAX, width)) : INK_DEFAULT.width,
    };
  } catch {
    return { ...INK_DEFAULT };
  }
}
export function saveInk(s: InkSettings): void {
  try {
    localStorage.setItem(INK_KEY, JSON.stringify(s));
  } catch {
    /* không lưu được thì thôi */
  }
}
