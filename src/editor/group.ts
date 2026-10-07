import { Grid, envZonesOf, ghostCells, validatePlacement, type Terrain } from '../grid/grid';
import { footprint, footprintCells } from '../model/geometry';
import { buildNetwork } from '../model/network';
import type { BeltTile, Blueprint, Cell, Dataset, Dir4, Facing, Layer, PlacedMachine, PortKind } from '../model/types';
import { removeMachine } from './ops';
import { UNIQUE_MACHINES } from '../model/roles';
import { tr } from '../i18n';

/**
 * Lựa chọn nhiều vật thể: máy (luôn trọn cả máy) và từng ô băng/ống.
 *
 * Ô băng/ống khoá bằng `kind:x,z` chứ không bằng chỉ số trong `bp.belts` — chỉ số đổi
 * mỗi khi đặt hay xoá ô khác, còn vị trí + tầng thì định danh duy nhất một ô.
 */
export interface Selection {
  machines: Set<number>;
  tiles: Set<string>;
}

export type Turns = 0 | 1 | 2 | 3;

export const emptySelection = (): Selection => ({ machines: new Set(), tiles: new Set() });

export const tileKeyOf = (t: { kind: PortKind; x: number; z: number }): string => `${t.kind}:${t.x},${t.z}`;

export const selectionSize = (s: Selection): number => s.machines.size + s.tiles.size;

/** Đúng một máy và không ô nào — trường hợp bảng thuộc tính và các nút cũ làm việc được. */
export function singleMachine(s: Selection): number | null {
  if (s.machines.size !== 1 || s.tiles.size !== 0) return null;
  return s.machines.values().next().value ?? null;
}

export function unionSelection(a: Selection, b: Selection): Selection {
  return { machines: new Set([...a.machines, ...b.machines]), tiles: new Set([...a.tiles, ...b.tiles]) };
}

/** `a` bỏ đi mọi thứ có trong `b` (chế độ hàng loạt: chuột phải kéo hộp = bỏ chọn nhiều — người dùng 2026-10-06). */
export function subtractSelection(a: Selection, b: Selection): Selection {
  return { machines: new Set([...a.machines].filter((u) => !b.machines.has(u))), tiles: new Set([...a.tiles].filter((k) => !b.tiles.has(k))) };
}

/** Bỏ những gì không còn trên bản vẽ (sau hoàn tác, sau xoá). */
export function pruneSelection(s: Selection, bp: Blueprint): Selection {
  const uids = new Set(bp.machines.map((m) => m.uid));
  const keys = new Set(bp.belts.map(tileKeyOf));
  return {
    machines: new Set([...s.machines].filter((u) => uids.has(u))),
    tiles: new Set([...s.tiles].filter((k) => keys.has(k))),
  };
}

/**
 * Khoá mọi ô của **đoạn** chứa ô `(kind, cell)`.
 *
 * Đoạn = một chuỗi của `buildNetwork`: các ô nối liền nhau, bị cắt tại cổng máy — nên
 * van tách, van gộp và cầu (đều là máy) tự động cắt đoạn.
 */
export function segmentKeys(bp: Blueprint, ds: Dataset, kind: PortKind, cell: Cell): string[] {
  const index = bp.belts.findIndex((t) => t.kind === kind && t.x === cell.x && t.z === cell.z);
  if (index < 0) return [];
  const net = buildNetwork(bp, ds);
  const id = net.chainOf.get(index);
  const chain = net.chains.find((c) => c.id === id);
  if (!chain) return [tileKeyOf(bp.belts[index]!)];
  return chain.tiles.map((i) => tileKeyOf(bp.belts[i]!));
}

/**
 * Bấm vào một ô băng/ống.
 * - Bấm thường (luật đổi 2026-09-29, người dùng chốt): ô chưa chọn ⇒ chọn **đúng ô đó** (thay
 *   lựa chọn cũ); bấm lại ô đã chọn ⇒ chọn **cả đoạn** (thay lựa chọn cũ); bấm vào ô bất kỳ
 *   của một đoạn đã chọn trọn ⇒ **bỏ chọn cả đoạn**.
 * - Ctrl: cùng ba bước đó nhưng **cộng dồn** vào lựa chọn đang có.
 */
export function clickTile(
  sel: Selection,
  bp: Blueprint,
  ds: Dataset,
  kind: PortKind,
  cell: Cell,
  ctrl: boolean,
): Selection {
  const key = tileKeyOf({ kind, ...cell });
  const segment = segmentKeys(bp, ds, kind, cell);
  if (segment.length === 0) return sel;
  if (!ctrl) {
    if (!sel.tiles.has(key)) return { machines: new Set(), tiles: new Set([key]) };
    if (segment.some((k) => !sel.tiles.has(k))) return { machines: new Set(), tiles: new Set(segment) };
    const rest: Selection = { machines: new Set(sel.machines), tiles: new Set(sel.tiles) };
    for (const k of segment) rest.tiles.delete(k);
    return rest;
  }

  const next: Selection = { machines: new Set(sel.machines), tiles: new Set(sel.tiles) };
  if (!sel.tiles.has(key)) next.tiles.add(key);
  else if (segment.some((k) => !sel.tiles.has(k))) for (const k of segment) next.tiles.add(k);
  else for (const k of segment) next.tiles.delete(k);
  return next;
}

/** Ctrl+bấm vào máy: chưa chọn thì thêm, đang chọn thì bỏ. */
export function toggleMachine(sel: Selection, uid: number): Selection {
  const machines = new Set(sel.machines);
  if (machines.has(uid)) machines.delete(uid);
  else machines.add(uid);
  return { machines, tiles: new Set(sel.tiles) };
}

/**
 * Chọn vùng hình chữ nhật (hai góc tính theo ô, lấy cả hai ô góc), **cả hai tầng**.
 * Máy chạm khung dù một ô ⇒ lấy trọn máy. Băng/ống chỉ lấy đúng những ô trong khung.
 */
export function boxSelection(bp: Blueprint, ds: Dataset, a: Cell, b: Cell): Selection {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const z0 = Math.min(a.z, b.z);
  const z1 = Math.max(a.z, b.z);
  const inside = (c: Cell): boolean => c.x >= x0 && c.x <= x1 && c.z >= z0 && c.z <= z1;
  const sel = emptySelection();
  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    if (def && !m.fixed && footprintCells(m, def).some(inside)) sel.machines.add(m.uid);
  }
  for (const t of bp.belts) if (inside(t)) sel.tiles.add(tileKeyOf(t));
  return sel;
}

/** Hộp bao (theo ô) của mọi thứ đang chọn. */
export function selectionBounds(
  bp: Blueprint,
  ds: Dataset,
  sel: Selection,
): { x0: number; z0: number; x1: number; z1: number } | null {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  const add = (c: Cell): void => {
    x0 = Math.min(x0, c.x);
    z0 = Math.min(z0, c.z);
    x1 = Math.max(x1, c.x);
    z1 = Math.max(z1, c.z);
  };
  for (const m of bp.machines) {
    if (!sel.machines.has(m.uid)) continue;
    const def = ds.machines.get(m.machineId);
    if (def) footprintCells(m, def).forEach(add);
  }
  for (const t of bp.belts) if (sel.tiles.has(tileKeyOf(t))) add(t);
  return x0 === Infinity ? null : { x0, z0, x1, z1 };
}

// ------------------------------------------------------------------ biến đổi khối cứng

/**
 * Nhóm được nhấc tại ô `anchor` và đặt xuống tại ô `target`, quay `turns` lần 90° theo
 * chiều kim đồng hồ quanh **tâm ô** `anchor`. Tâm quay là tâm một ô nên mọi toạ độ sau
 * quay vẫn là số nguyên.
 */
export interface GroupMove {
  anchor: Cell;
  target: Cell;
  turns: Turns;
}

/** Quay vector theo chiều kim đồng hồ trên màn hình: lên → phải → xuống → trái. */
function rotateVec(dx: number, dz: number, turns: Turns): { dx: number; dz: number } {
  let x = dx;
  let z = dz;
  for (let i = 0; i < turns; i++) [x, z] = [-z, x];
  return { dx: x, dz: z };
}

export function mapCell(c: Cell, mv: GroupMove): Cell {
  const v = rotateVec(c.x - mv.anchor.x, c.z - mv.anchor.z, mv.turns);
  return { x: mv.target.x + v.dx, z: mv.target.z + v.dz };
}

export const mapDir = (d: Dir4, turns: Turns): Dir4 => ((d + turns) % 4) as Dir4;

/**
 * Vị trí + hướng mới của một máy trong nhóm.
 *
 * Đế máy quay theo cùng phép quay với cả nhóm: hai góc đối của đế đi tới đâu thì góc
 * trên-trái mới là ô nhỏ nhất trong hai ô đó. `rotateLocal` của `geometry.ts` chính là
 * phép quay này cộng một phép tịnh tiến đưa đế về gốc, nên cổng, sprite, vùng phủ đều
 * quay theo đúng như một khối (có test kiểm cho mọi máy).
 */
export function mapMachine(
  m: PlacedMachine,
  size: { w: number; d: number },
  mv: GroupMove,
): { x: number; z: number; rot: Facing } {
  const a = mapCell({ x: m.x, z: m.z }, mv);
  const b = mapCell({ x: m.x + size.w - 1, z: m.z + size.d - 1 }, mv);
  return { x: Math.min(a.x, b.x), z: Math.min(a.z, b.z), rot: (((m.rot + 90 * mv.turns) % 360) as Facing) };
}

export interface GroupPlan {
  ok: boolean;
  reason?: string;
  machines: { src: PlacedMachine; x: number; z: number; rot: Facing }[];
  /** Ô mới (đã dời + quay), cùng thứ tự với `srcTiles`. `group` vẫn là mã cũ. */
  tiles: BeltTile[];
  /** Chỉ số trong `bp.belts` của các ô được chọn. */
  srcTiles: number[];
  /** Ô bị trùng / ra ngoài — để tô đỏ đúng chỗ. */
  blocked: Cell[];
}

/**
 * Một bộ máy + ô băng/ống tách khỏi bản vẽ — nhóm đang chọn, hoặc một bản vẽ trong thư
 * viện. `uid` của máy và `group` của ô chỉ cần nhất quán **trong bộ** (cặp ống ngầm trỏ
 * nhau bằng uid trong bộ).
 */
export interface Pieces {
  machines: PlacedMachine[];
  tiles: BeltTile[];
}

/** Lấy các vật thể đang chọn ra thành một bộ (tham chiếu thẳng vào bản vẽ, không chép). */
export function selectionPieces(bp: Blueprint, sel: Selection): Pieces {
  return {
    machines: bp.machines.filter((m) => sel.machines.has(m.uid)),
    tiles: bp.belts.filter((t) => sel.tiles.has(tileKeyOf(t))),
  };
}

/**
 * Tính trước chỗ đặt của một bộ vật thể và kiểm tra có đặt được lên `rest` không.
 * Giữa các phần tử trong bộ không cần kiểm: phép quay + tịnh tiến giữ nguyên việc
 * chúng không chồng lên nhau.
 */
export function planPieces(
  ds: Dataset,
  terrain: Terrain,
  pieces: Pieces,
  mv: GroupMove,
  rest: Blueprint,
): GroupPlan {
  const machines: GroupPlan['machines'] = [];
  const tiles: BeltTile[] = pieces.tiles.map((t) => {
    const c = mapCell(t, mv);
    return { ...t, x: c.x, z: c.z, in: mapDir(t.in, mv.turns), out: mapDir(t.out, mv.turns) };
  });
  const grid = Grid.fromBlueprint(rest, ds);
  const zones = envZonesOf(rest, ds);

  const blocked = new Map<string, Cell>();
  const mark = (c: Cell): void => void blocked.set(`${c.x},${c.z}`, c);
  let reason: string | undefined;

  for (const m of pieces.machines) {
    const def = ds.machines.get(m.machineId);
    if (!def) continue;
    const to = mapMachine(m, footprint(def, m.rot), mv);
    machines.push({ src: m, ...to });
    const check = validatePlacement(grid, terrain, def, to.x, to.z, to.rot, undefined, zones);
    if (check.ok) continue;
    reason ??= check.reason;
    const cells = ghostCells(grid, def, to.x, to.z, to.rot);
    const some = cells.filter((c) => c.blocked);
    // không trùng ô nào mà vẫn hỏng (vùng môi trường chồng nhau…) ⇒ đỏ cả máy
    for (const c of some.length > 0 ? some : cells) mark(c.cell);
  }
  // công trình chỉ được có một trên map (Cửa Xả Phụ Phẩm)
  for (const id of UNIQUE_MACHINES) {
    const n = rest.machines.filter((m) => m.machineId === id).length + pieces.machines.filter((m) => m.machineId === id).length;
    if (n > 1) reason ??= tr('{0} chỉ có một trên cả map', ds.machines.get(id)?.name ?? id);
  }
  for (const t of tiles) {
    const layer: Layer = t.kind === 'pipe' ? 1 : 0;
    // băng chuyền không được nằm ở viền ngoài map (người dùng 2026-09-29)
    const outside = t.kind === 'belt' && !grid.inCore(t);
    if (grid.free(layer, t) && !outside) continue;
    reason ??= outside ? tr('Băng chuyền không đặt được ở viền ngoài map') : grid.inBounds(t) ? tr('Chồng lên công trình khác') : tr('Ra ngoài khu vực');
    mark(t);
  }
  return { ok: reason === undefined, reason, machines, tiles, srcTiles: [], blocked: [...blocked.values()] };
}

/**
 * Tính trước chỗ đặt của cả nhóm đang chọn và kiểm tra có đặt được không.
 *
 * Chỉ bỏ qua va chạm với **chính các vật thể đang được di chuyển** (chế độ `move`);
 * sao chép thì bản gốc vẫn nằm đó nên vẫn chặn.
 */
export function planGroup(
  bp: Blueprint,
  ds: Dataset,
  terrain: Terrain,
  sel: Selection,
  mv: GroupMove,
  mode: 'move' | 'copy',
): GroupPlan {
  const srcTiles: number[] = [];
  bp.belts.forEach((t, i) => {
    if (sel.tiles.has(tileKeyOf(t))) srcTiles.push(i);
  });
  // phần còn lại của bản vẽ — thứ mà nhóm không được đè lên
  const rest: Blueprint =
    mode === 'move'
      ? {
          ...bp,
          machines: bp.machines.filter((m) => !sel.machines.has(m.uid)),
          belts: bp.belts.filter((t) => !sel.tiles.has(tileKeyOf(t))),
        }
      : bp;
  const plan = planPieces(ds, terrain, selectionPieces(bp, sel), mv, rest);
  plan.srcTiles = srcTiles;
  return plan;
}

/**
 * Ghi nhóm xuống bản vẽ theo `plan` (đã `ok`). Trả về lựa chọn mới trỏ vào chỗ mới.
 *
 * - `move`: máy giữ nguyên `uid` và mọi thiết lập (cặp ống ngầm vẫn còn); ô được chọn
 *   rời chỗ cũ. Ô **không** chọn thì ở lại, có thể bị đứt nối — đúng như trong game.
 * - `copy`: máy mới có `uid` mới, chép mọi thiết lập (công thức, chế độ, gán cổng, số
 *   lượng, nguồn, kho tổng, nguồn vô hạn). Cặp ống ngầm chỉ chép khi **cả hai đầu**
 *   cùng trong nhóm, và ghép lại giữa hai bản sao.
 * - Ô băng/ống nhận mã `group` mới theo từng mã cũ, để xoá-cả-đoạn không vơ nhầm phần
 *   ở lại chỗ cũ.
 */
export function commitGroup(bp: Blueprint, plan: GroupPlan, mode: 'move' | 'copy'): Selection {
  const out = emptySelection();
  const groups = new Map<number, number>();
  const regroup = (g: number): number => {
    let n = groups.get(g);
    if (n === undefined) groups.set(g, (n = bp.nextUid++));
    return n;
  };

  if (mode === 'move') {
    for (const e of plan.machines) {
      e.src.x = e.x;
      e.src.z = e.z;
      e.src.rot = e.rot;
      out.machines.add(e.src.uid);
    }
    const gone = new Set(plan.srcTiles);
    bp.belts = bp.belts.filter((_, i) => !gone.has(i));
  } else {
    const uids = new Map<number, number>();
    for (const e of plan.machines) uids.set(e.src.uid, bp.nextUid++);
    for (const e of plan.machines) {
      const copy = JSON.parse(JSON.stringify(e.src)) as PlacedMachine;
      copy.uid = uids.get(e.src.uid)!;
      copy.x = e.x;
      copy.z = e.z;
      copy.rot = e.rot;
      if (copy.pairTarget !== undefined && copy.pairTarget !== null)
        copy.pairTarget = uids.get(copy.pairTarget) ?? null;
      bp.machines.push(copy);
      out.machines.add(copy.uid);
    }
  }
  for (const t of plan.tiles) {
    const tile = { ...t, group: regroup(t.group) };
    bp.belts.push(tile);
    out.tiles.add(tileKeyOf(tile));
  }
  return out;
}

/** Xoá mọi thứ đang chọn. Máy xoá qua `removeMachine` để gỡ luôn cặp ống ngầm. */
export function deleteSelection(bp: Blueprint, sel: Selection): void {
  for (const uid of sel.machines) removeMachine(bp, uid);
  bp.belts = bp.belts.filter((t) => !sel.tiles.has(tileKeyOf(t)));
}

/** Tâm quay khi xoay nhóm tại chỗ (phím R, không nhấc lên): ô giữa hộp bao. */
export function boundsCenter(b: { x0: number; z0: number; x1: number; z1: number }): Cell {
  return { x: Math.floor((b.x0 + b.x1) / 2), z: Math.floor((b.z0 + b.z1) / 2) };
}
