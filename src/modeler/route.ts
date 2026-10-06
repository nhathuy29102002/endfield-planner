/**
 * **Đường nối nhiều điểm neo** của Modeler (người dùng 2026-09-30).
 *
 * Đường cong đi từ cổng ra `a` qua lần lượt các điểm neo `pts` tới cổng vào `b`. Hai đầu rời / vào cổng đúng
 * hướng cổng (như trước); qua các điểm neo thì mềm (Catmull-Rom ⇒ các đoạn Bézier bậc ba nối trơn). Nắm vào
 * một chỗ bất kỳ trên đường rồi kéo ⇒ thêm một điểm neo **đúng chỗ đó** (`insertIndex`), điểm neo bám con trỏ;
 * các đoạn khác đứng yên vì có điểm neo khác giữ. Không có điểm neo ⇒ đúng đường cong một đoạn như cũ.
 */
export interface Pt {
  x: number;
  y: number;
}
/** Đầu đường nối: vị trí cổng + hướng cổng (vector đơn vị hướng ra ngoài máy). */
export interface RouteEnd extends Pt {
  d: Pt;
}
/** Một đoạn Bézier bậc ba: điểm đầu, hai điểm điều khiển, điểm cuối. */
export type Seg = [Pt, Pt, Pt, Pt];

const dist = (p: Pt, q: Pt): number => Math.hypot(p.x - q.x, p.y - q.y);
/** Độ dài tay nắm ở cổng — như đường cong cũ: tối thiểu 40, dài theo khoảng cách. */
const handle = (p: Pt, q: Pt): number => Math.max(40, dist(p, q) / 2.5);

/** Các đoạn Bézier của đường `a` → `pts…` → `b`. */
export function routeSegments(a: RouteEnd, b: RouteEnd, pts: Pt[] = []): Seg[] {
  if (pts.length === 0) {
    const k = handle(a, b);
    return [[a, { x: a.x + a.d.x * k, y: a.y + a.d.y * k }, { x: b.x + b.d.x * k, y: b.y + b.d.y * k }, b]];
  }
  const K: Pt[] = [a, ...pts, b];
  // đạo hàm tại từng nút (điểm điều khiển = nút ± đạo hàm / 3)
  const T: Pt[] = K.map((p, i) => {
    if (i === 0) {
      const k = 3 * handle(a, K[1]!);
      return { x: a.d.x * k, y: a.d.y * k };
    }
    if (i === K.length - 1) {
      const k = 3 * handle(K[i - 1]!, b);
      return { x: -b.d.x * k, y: -b.d.y * k }; // đi **vào** cổng
    }
    return { x: (K[i + 1]!.x - K[i - 1]!.x) / 2, y: (K[i + 1]!.y - K[i - 1]!.y) / 2 };
  });
  const segs: Seg[] = [];
  for (let i = 0; i < K.length - 1; i++) {
    const p = K[i]!;
    const q = K[i + 1]!;
    segs.push([p, { x: p.x + T[i]!.x / 3, y: p.y + T[i]!.y / 3 }, { x: q.x - T[i + 1]!.x / 3, y: q.y - T[i + 1]!.y / 3 }, q]);
  }
  return segs;
}

const r = (v: number): number => Math.round(v * 10) / 10;
/** Chuỗi `d` của SVG path. */
export function routePath(segs: Seg[]): string {
  if (segs.length === 0) return '';
  let d = `M${r(segs[0]![0].x)},${r(segs[0]![0].y)}`;
  for (const [, c1, c2, q] of segs) d += ` C${r(c1.x)},${r(c1.y)} ${r(c2.x)},${r(c2.y)} ${r(q.x)},${r(q.y)}`;
  return d;
}

/** Điểm trên đoạn Bézier tại tham số `t`. */
export function segPoint([p, c1, c2, q]: Seg, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p.x + b * c1.x + c * c2.x + d * q.x, y: a * p.y + b * c1.y + c * c2.y + d * q.y };
}

const SAMPLES = 32;

/** Điểm gần `p` nhất trên đường: đoạn thứ mấy, tham số, khoảng cách. */
export function nearestOnRoute(segs: Seg[], p: Pt): { seg: number; t: number; point: Pt; dist: number } {
  let best = { seg: 0, t: 0, point: segs[0]?.[0] ?? p, dist: Infinity };
  segs.forEach((s, i) => {
    for (let j = 0; j <= SAMPLES; j++) {
      const t = j / SAMPLES;
      const q = segPoint(s, t);
      const dd = dist(p, q);
      if (dd < best.dist) best = { seg: i, t, point: q, dist: dd };
    }
  });
  return best;
}

/**
 * Chỗ chèn điểm neo mới khi nắm đường tại `p`: điểm neo mới nằm giữa hai nút của đoạn gần nhất ⇒ chỉ số trong
 * danh sách điểm neo = số thứ tự đoạn đó.
 */
export const insertIndex = (segs: Seg[], p: Pt): number => nearestOnRoute(segs, p).seg;

/** Điểm giữa đường (theo độ dài) — chỗ đặt icon + tốc độ. */
export function routeMid(segs: Seg[]): Pt {
  const pts: Pt[] = [];
  for (const s of segs) for (let j = 0; j <= SAMPLES; j++) if (j > 0 || pts.length === 0) pts.push(segPoint(s, j / SAMPLES));
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1]!, pts[i]!);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1]!, pts[i]!);
    if (acc + l >= total / 2 && l > 0) {
      const k = (total / 2 - acc) / l;
      return { x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * k, y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * k };
    }
    acc += l;
  }
  return pts[0] ?? { x: 0, y: 0 };
}
