/**
 * **Simulation — vẽ lên bản vẽ** (giai đoạn 2, người dùng 2026-10-03): món đang chạy trên băng / ống, thanh tiến độ
 * mẻ trên máy chế biến. Chỉ vẽ khi đang ở chế độ Simulation — Map thường vẫn tĩnh như cũ.
 *
 * Vị trí một món suy từ mốc thời gian của nó trên tuyến (`SimItem.entered`, `ready`): đi đều `1 ô / SECONDS_PER_CELL`,
 * không vượt món phía trước (cách ≥ 1 ô); món đầu chạy thẳng tới **mép cổng** máy sau và chỉ đứng đó khi máy chưa nhận
 * (trước 2026-10-03 nó dừng ở giữa ô cuối nửa ô — trông như băng phải chờ dù sức chở vẫn đúng 30/phút).
 */
import { DIRS, footprint } from '../model/geometry';
import { FLUID_COLORS } from '../model/fluidColors';
import type { Blueprint, Dataset, PortKind } from '../model/types';
import type { Camera } from '../render/camera';
import type { IconCache } from '../render/icons';
import { itemColor } from '../render/renderer';
import type { Lane, Simulation } from './engine';

/** Vị trí (tính theo ô, 0 = mép vào ô đầu, L = mép ra ô cuối) của từng món trên tuyến lúc `now`. */
export function lanePositions(lane: Lane, now: number): number[] {
  const L = lane.length;
  const out: number[] = [];
  let ahead = Infinity;
  for (const it of lane.items) {
    const natural = (now - it.entered) / lane.spacing;
    const p = Math.max(0, Math.min(natural, L, ahead - 1));
    out.push(p);
    ahead = p;
  }
  return out;
}

/** Điểm trên lưới (toạ độ ô, số thực) ứng với vị trí `p` dọc theo các ô `tiles` của tuyến. */
function pointAt(bp: Blueprint, tiles: number[], p: number): { x: number; z: number } {
  const n = tiles.length;
  const center = (k: number): { x: number; z: number } => {
    const t = bp.belts[tiles[Math.max(0, Math.min(n - 1, k))]!]!;
    return { x: t.x + 0.5, z: t.z + 0.5 };
  };
  if (p <= 0.5) {
    const c = center(0);
    const d = DIRS[bp.belts[tiles[0]!]!.in]!;
    const e = { x: c.x - d.dx * 0.5, z: c.z - d.dz * 0.5 };
    const f = p / 0.5;
    return { x: e.x + (c.x - e.x) * f, z: e.z + (c.z - e.z) * f };
  }
  if (p >= n - 0.5) {
    // nửa ô cuối: từ tâm ô cuối tới mép ra (cổng máy sau)
    const c = center(n - 1);
    const d = DIRS[bp.belts[tiles[n - 1]!]!.out]!;
    const f = Math.min(1, (p - (n - 0.5)) / 0.5);
    return { x: c.x + d.dx * 0.5 * f, z: c.z + d.dz * 0.5 * f };
  }
  const k = Math.floor(p - 0.5);
  const f = p - 0.5 - k;
  const a = center(k);
  const b = center(k + 1);
  return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
}

export interface SimDrawContext {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  bp: Blueprint;
  ds: Dataset;
  icons: IconCache;
  sim: Simulation;
  /** Lúc vẽ (giữa hai bước lưới — `SimTimeline.view`), mặc định `sim.now`. */
  at?: number;
}

/** Món đang đi trên mọi tuyến loại `kind` (băng: vẽ trên băng, dưới máy; ống: trên ống). */
export function drawSimItems(c: SimDrawContext, kind: PortKind): void {
  const { ctx, camera, bp, ds, icons, sim } = c;
  const cell = camera.cell;
  const now = c.at ?? sim.now;
  const big = cell >= 16; // đủ to thì vẽ icon, nhỏ thì chấm màu
  for (const lane of sim.lanes) {
    if (lane.kind !== kind || lane.tiles.length === 0 || lane.items.length === 0) continue;
    // map vừa sửa mà mô phỏng chưa kịp dựng lại (cùng lượt vẽ): ô cũ có thể không còn ⇒ bỏ qua tuyến này một khung
    if (lane.tiles.some((t) => !bp.belts[t] || bp.belts[t]!.kind !== kind)) continue;
    const pos = lanePositions(lane, now);
    lane.items.forEach((it, i) => {
      const w = pointAt(bp, lane.tiles, pos[i]!);
      const { sx, sy } = camera.toScreen(w);
      if (kind === 'pipe') {
        // khí / lỏng: giọt tròn màu chất
        const r = Math.max(1.5, cell * 0.2);
        ctx.fillStyle = FLUID_COLORS[it.itemId] ?? itemColor(it.itemId);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        return;
      }
      const img = big ? icons.item(ds, it.itemId) : undefined;
      if (img) {
        const s = cell * 0.62;
        ctx.fillStyle = 'rgba(10,12,16,0.55)';
        ctx.beginPath();
        ctx.arc(sx, sy, s * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.drawImage(img, sx - s / 2, sy - s / 2, s, s);
      } else {
        const r = Math.max(1.5, cell * 0.22);
        // thu nhỏ: ô vuông mang màu chủ đạo của ảnh món (người dùng 2026-10-05); ảnh chưa tải xong ⇒ màu tạm theo id
        ctx.fillStyle = icons.itemColor(ds, it.itemId) ?? itemColor(it.itemId);
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 1;
        ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
        ctx.strokeRect(sx - r, sy - r, r * 2, r * 2);
      }
    });
  }
}

/**
 * Thanh tiến độ mẻ trên máy chế biến: xanh = đang chạy, vàng = chờ nguyên liệu, đỏ = kẹt đầu ra, xám = mất điện.
 * Trạm điện: tiến độ cháy của món pin đang đốt.
 */
export function drawSimMachines(c: SimDrawContext, selected: number | null): void {
  const { ctx, camera, bp, ds, sim } = c;
  const cell = camera.cell;
  for (const m of bp.machines) {
    const s = sim.machine(m.uid, c.at);
    if (!s || (s.kind !== 'crafter' && s.kind !== 'generator')) continue;
    const def = ds.machines.get(m.machineId);
    if (!def) continue;
    const fp = footprint(def, m.rot);
    const a = camera.toScreen({ x: m.x, z: m.z });
    const w = fp.w * cell;
    const h = fp.d * cell;
    const bw = w * 0.8;
    const bh = Math.max(3, Math.min(7, cell * 0.22));
    const bx = a.sx + (w - bw) / 2;
    const by = a.sy + h - bh - Math.max(2, cell * 0.12);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    const state = s.state;
    ctx.fillStyle = state === 'running' ? '#3fb950' : state === 'blocked' ? '#f85149' : state === 'unpowered' ? '#8b98a8' : '#d29922';
    const prog = s.kind === 'generator' ? (s.burning?.progress ?? 0) : (s.progress ?? 0);
    ctx.fillRect(bx, by, state === 'running' ? bw * prog : bw, bh);
    if (selected === m.uid) {
      ctx.strokeStyle = '#58a6ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(a.sx + 1, a.sy + 1, w - 2, h - 2);
    }
  }
}
