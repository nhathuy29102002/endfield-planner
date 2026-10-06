import { DIRS, cellKey, opposite } from '../model/geometry';
import type { Cell, Dir4, Layer } from '../model/types';
import { Grid } from './grid';

/**
 * A* tìm tuyến cho băng chuyền / ống trên **một** layer.
 *
 * Có phạt khúc quanh (`TURN_COST`) nên đường ra thẳng và ít gấp — cùng độ dài thì
 * người chơi luôn muốn đường ít khúc hơn. Trạng thái vì thế là *(ô, hướng tới)*,
 * không phải chỉ *ô*.
 */
const TURN_COST = 3;

interface Node {
  cell: Cell;
  dir: number;
  g: number;
  f: number;
  prev: Node | undefined;
}

/**
 * Heap nhị phân nhỏ cho hàng đợi ưu tiên.
 *
 * Bản đầu quét tuyến tính để tìm phần tử nhỏ nhất; trên lưới 70×70 với trạng thái
 * *(ô, hướng)* thì hàng đợi lên tới hàng chục nghìn phần tử và mỗi lần nối tuyến
 * treo giao diện vài giây.
 */
class Heap {
  private items: Node[] = [];

  get size(): number {
    return this.items.length;
  }

  push(n: Node): void {
    const a = this.items;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent]!.f <= a[i]!.f) break;
      [a[parent], a[i]] = [a[i]!, a[parent]!];
      i = parent;
    }
  }

  pop(): Node | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < a.length && a[l]!.f < a[best]!.f) best = l;
        if (r < a.length && a[r]!.f < a[best]!.f) best = r;
        if (best === i) break;
        [a[best], a[i]] = [a[i]!, a[best]!];
        i = best;
      }
    }
    return top;
  }
}

const stateKey = (c: Cell, dir: number): string => `${c.x},${c.z},${dir}`;

export interface RouteOptions {
  /** Ô được phép đi qua dù lưới báo đã bị chiếm (thường là chính hai đầu tuyến). */
  allow?: Iterable<Cell>;
  maxExpansions?: number;
}

/**
 * Trả về đường đi gồm cả ô đầu và ô cuối, hoặc `null` nếu không có lối.
 *
 * Nhận **danh sách** điểm đầu và điểm cuối vì cổng `virtual` của game không cố định
 * chỗ nối: băng chạm vào cạnh nào của máy cũng được. Nạp mọi điểm đầu vào hàng đợi
 * và lấy heuristic là khoảng cách tới đích *gần nhất* — một lần chạy A* là ra đường
 * ngắn nhất trong mọi cặp, thay vì thử từng cặp một.
 */
export function route(
  grid: Grid,
  layer: Layer,
  starts: Cell | Cell[],
  goals: Cell | Cell[],
  opts: RouteOptions = {},
): Cell[] | null {
  const startList = Array.isArray(starts) ? starts : [starts];
  const goalList = Array.isArray(goals) ? goals : [goals];
  if (startList.length === 0 || goalList.length === 0) return null;

  const allow = new Set<string>();
  for (const c of opts.allow ?? []) allow.add(cellKey(c));
  for (const c of [...startList, ...goalList]) allow.add(cellKey(c));

  // băng chuyền (tầng đất) không được đi ra viền ngoài map (người dùng 2026-09-29)
  const passable = (c: Cell): boolean =>
    grid.inBounds(c) && (layer !== 0 || grid.inCore(c)) && (grid.free(layer, c) || allow.has(cellKey(c)));

  const goalSet = new Set(goalList.filter(passable).map(cellKey));
  const openStarts = startList.filter(passable);
  if (goalSet.size === 0 || openStarts.length === 0) return null;

  const h = (c: Cell): number => {
    let best = Infinity;
    for (const g of goalList) best = Math.min(best, Math.abs(c.x - g.x) + Math.abs(c.z - g.z));
    return best;
  };
  const open = new Heap();
  const best = new Map<string, number>();
  for (const c of openStarts) {
    open.push({ cell: c, dir: -1, g: 0, f: h(c), prev: undefined });
    best.set(stateKey(c, -1), 0);
  }
  const limit = opts.maxExpansions ?? 200_000;

  for (let expanded = 0; open.size > 0 && expanded < limit; expanded++) {
    const cur = open.pop()!;
    // bỏ qua bản sao cũ: không có decrease-key nên một trạng thái có thể vào heap nhiều lần
    if ((best.get(stateKey(cur.cell, cur.dir)) ?? Infinity) < cur.g) continue;

    if (goalSet.has(cellKey(cur.cell))) {
      const path: Cell[] = [];
      for (let n: Node | undefined = cur; n; n = n.prev) path.push(n.cell);
      return path.reverse();
    }

    for (let dir = 0; dir < DIRS.length; dir++) {
      const step = DIRS[dir]!;
      const next = { x: cur.cell.x + step.dx, z: cur.cell.z + step.dz };
      if (!passable(next)) continue;
      const g = cur.g + 1 + (cur.dir !== -1 && cur.dir !== dir ? TURN_COST : 0);
      const key = stateKey(next, dir);
      const prevBest = best.get(key);
      if (prevBest !== undefined && prevBest <= g) continue;
      best.set(key, g);
      open.push({ cell: next, dir, g, f: g + h(next), prev: cur });
    }
  }
  return null;
}


// ============================================================================
// Tìm đường cho băng chuyền / ống theo đúng luật đặt của game
// ============================================================================

/** Điểm đầu có thể: một ô, kèm hướng hàng đi vào ô đó (`null` = tự do). */
export interface BeltStart<T = unknown> {
  cell: Cell;
  inDir: Dir4 | null;
  tag?: T;
  /**
   * Ô xuất phát đang có một tuyến thẳng **vuông góc** đi qua (vd. băng nằm ngang ngay trước
   * cổng ra): tuyến mới đi thẳng xuyên qua, ô này thành cầu nối — như mọi ô cắt ngang khác.
   */
  cross?: boolean;
}

/** Điểm cuối có thể: một ô, kèm hướng hàng phải rời ô đó (`null` = tự do). */
export interface BeltGoal<T = unknown> {
  cell: Cell;
  outDir: Dir4 | null;
  tag?: T;
}

export interface BeltRoute<S = unknown, G = unknown> {
  cells: Cell[];
  /** Hướng vào từng ô. */
  ins: Dir4[];
  /** Hướng ra từng ô. */
  outs: Dir4[];
  /** Số ô góc. */
  turns: number;
  start: BeltStart<S>;
  goal: BeltGoal<G>;
  /** Ô cắt ngang tuyến có sẵn — ở đó đặt cầu nối thay vì ô băng/ống. */
  crossings: Cell[];
}

export interface BeltRouteOptions {
  /** Số ô góc tối đa cho **một lần đặt** — game tính đường ngắn nhất với tối đa 3 góc. */
  maxTurns?: number;
  /** Ô được đi qua dù đang bị chiếm (ô băng cũ sắp bị thay thế). */
  allow?: Iterable<Cell>;
  maxExpansions?: number;
  /**
   * Ô đang bị chiếm nhưng **đi thẳng xuyên qua** được theo hướng `dir` (cắt ngang một tuyến
   * thẳng có sẵn ⇒ đặt cầu nối ở đó). Đi qua ô này thì không được rẽ trong ô.
   */
  crossable?: (c: Cell, dir: Dir4) => boolean;
  /**
   * Ô đang có băng / ống **cùng loại** được **đè lên** (người dùng 2026-10-04: "đè đường ống / băng chuyền nếu giống loại
   * bất kể xoay hướng nào, cắt nhau thì thêm cầu") — ô cũ bị thay bằng ô mới. Tốn thêm `OVERWRITE_COST` để đường tự
   * tìm vẫn ưu tiên ô trống, chỉ đè khi cần (hoặc khi điểm đích nằm trên tuyến cũ).
   */
  overwritable?: (c: Cell, dir: Dir4) => boolean;
}

/** Ưu tiên: ngắn nhất trước, rồi mới tới ít góc nhất. */
const STEP = 64;
/**
 * Phạt nhẹ mỗi cầu nối: cùng độ dài thì chọn đường không phải bắc cầu, nhưng không đến
 * mức đi vòng xa chỉ để tránh một cây cầu.
 */
const CROSS_COST = STEP / 2;
/** Phạt mỗi ô đè lên tuyến cũ — đắt hơn bắc cầu để cắt ngang thì ưu tiên cầu. */
const OVERWRITE_COST = STEP;

interface BeltNode {
  x: number;
  z: number;
  /** hướng đi vào ô; 4 = tự do (chỉ ở điểm đầu không ràng buộc) */
  inc: number;
  turns: number;
  g: number;
  f: number;
  prev: BeltNode | undefined;
  start: number;
  /** ô này cắt ngang tuyến có sẵn (sẽ thành cầu nối) */
  cross?: boolean;
}

class BeltHeap {
  private a: BeltNode[] = [];
  get size(): number {
    return this.a.length;
  }
  push(n: BeltNode): void {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]!.f <= a[i]!.f) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): BeltNode | undefined {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let b = i;
        if (l < a.length && a[l]!.f < a[b]!.f) b = l;
        if (r < a.length && a[r]!.f < a[b]!.f) b = r;
        if (b === i) break;
        [a[b], a[i]] = [a[i]!, a[b]!];
        i = b;
      }
    }
    return top;
  }
}

/**
 * Đường băng/ống ngắn nhất từ **một trong các** điểm đầu tới **một trong các** điểm
 * cuối, với tối đa `maxTurns` ô góc.
 *
 * Trạng thái là *(ô, hướng đi vào, số góc đã dùng)* — cùng một ô mà tới theo hướng
 * khác hoặc đã tốn nhiều góc hơn là hai trạng thái khác nhau. Ràng buộc hướng ở hai
 * đầu là chỗ quan trọng nhất:
 *  - điểm đầu là cổng ra ⇒ ô đầu nhận hàng theo đúng hướng cổng; nếu ô đó bẻ ngay
 *    thì chính nó là một ô góc và bị tính vào giới hạn;
 *  - điểm cuối là cổng vào ⇒ ô cuối phải đẩy hàng theo đúng hướng cổng; tới từ bên
 *    hông thì ô cuối thành ô góc, tới ngược chiều thì không hợp lệ.
 *
 * Cổng ra máy 1 → góc → thẳng → góc → cổng vào máy 2 là đúng loại đường này tìm ra.
 */
export function routeBelt<S, G>(
  grid: Grid,
  layer: Layer,
  starts: BeltStart<S>[],
  goals: BeltGoal<G>[],
  opts: BeltRouteOptions = {},
): BeltRoute<S, G> | null {
  const maxTurns = opts.maxTurns ?? 3;
  const allow = new Set<string>();
  for (const c of opts.allow ?? []) allow.add(cellKey(c));
  for (const s of starts) allow.add(cellKey(s.cell));
  for (const g of goals) allow.add(cellKey(g.cell));
  // băng chuyền (tầng đất) không được đi ra viền ngoài map (người dùng 2026-09-29)
  const passable = (c: Cell): boolean =>
    grid.inBounds(c) && (layer !== 0 || grid.inCore(c)) && (grid.free(layer, c) || allow.has(cellKey(c)));

  const goalsAt = new Map<string, BeltGoal<G>[]>();
  for (const g of goals) {
    if (!passable(g.cell)) continue;
    const k = cellKey(g.cell);
    goalsAt.set(k, [...(goalsAt.get(k) ?? []), g]);
  }
  if (goalsAt.size === 0) return null;

  const h = (x: number, z: number): number => {
    let best = Infinity;
    for (const g of goals) best = Math.min(best, Math.abs(x - g.cell.x) + Math.abs(z - g.cell.z));
    return best * STEP;
  };
  // kèm cờ cầu: cùng ô, cùng hướng, cùng số góc mà đi qua bằng cầu hay đè lên là hai trạng thái khác nhau (đè thì rẽ được)
  const key = (x: number, z: number, inc: number, t: number, cross = false): number =>
    ((((z * grid.w + x) * 5 + inc) * (maxTurns + 2) + t) * 2 + (cross ? 1 : 0)) | 0;

  const open = new BeltHeap();
  const best = new Map<number, number>();
  starts.forEach((s, i) => {
    if (!passable(s.cell)) return;
    const inc = s.inDir ?? 4;
    const n: BeltNode = {
      x: s.cell.x,
      z: s.cell.z,
      inc,
      turns: 0,
      g: STEP + (s.cross ? CROSS_COST : 0),
      f: STEP + (s.cross ? CROSS_COST : 0) + h(s.cell.x, s.cell.z),
      prev: undefined,
      start: i,
      cross: s.cross === true && inc !== 4,
    };
    best.set(key(n.x, n.z, inc, 0, n.cross), n.g);
    open.push(n);
  });

  const limit = opts.maxExpansions ?? 400_000;
  for (let n = 0; open.size > 0 && n < limit; n++) {
    const cur = open.pop()!;
    if ((best.get(key(cur.x, cur.z, cur.inc, cur.turns, cur.cross)) ?? Infinity) < cur.g) continue;

    const here = goalsAt.get(`${cur.x},${cur.z}`);
    if (here) {
      for (const g of here) {
        let extra = 0;
        if (g.outDir !== null && cur.inc !== 4) {
          if (g.outDir === opposite(cur.inc as Dir4)) continue;
          if (g.outDir !== cur.inc) extra = 1;
        }
        if (cur.turns + extra > maxTurns) continue;
        // đi vào ô đích bằng cầu thì không rẽ được trong ô đó
        if (cur.cross && extra > 0) continue;
        return build(cur, starts, g, extra);
      }
    }

    for (let d = 0; d < 4; d++) {
      if (cur.inc !== 4 && d === opposite(cur.inc as Dir4)) continue;
      // trong ô cầu thì chỉ đi thẳng ra phía bên kia
      if (cur.cross && d !== cur.inc) continue;
      const nx = cur.x + DIRS[d]!.dx;
      const nz = cur.z + DIRS[d]!.dz;
      const turn = cur.inc !== 4 && d !== cur.inc ? 1 : 0;
      const t = cur.turns + turn;
      if (t > maxTurns) continue;
      const nc = { x: nx, z: nz };
      // ô trống ⇒ đi bình thường; ô có tuyến cùng loại ⇒ bắc cầu (cắt ngang ô thẳng) và / hoặc đè lên
      const options: { cross: boolean; cost: number }[] = [];
      if (passable(nc)) options.push({ cross: false, cost: 0 });
      else if (grid.inBounds(nc) && (layer !== 0 || grid.inCore(nc))) {
        if (opts.crossable?.(nc, d as Dir4)) options.push({ cross: true, cost: CROSS_COST });
        if (opts.overwritable?.(nc, d as Dir4)) options.push({ cross: false, cost: OVERWRITE_COST });
      }
      for (const o of options) {
        const g = cur.g + STEP + turn + o.cost;
        const k = key(nx, nz, d, t, o.cross);
        if ((best.get(k) ?? Infinity) <= g) continue;
        best.set(k, g);
        open.push({ x: nx, z: nz, inc: d, turns: t, g, f: g + h(nx, nz), prev: cur, start: cur.start, cross: o.cross });
      }
    }
  }
  return null;
}

function build<S, G>(
  end: BeltNode,
  starts: BeltStart<S>[],
  goal: BeltGoal<G>,
  extraTurn: number,
): BeltRoute<S, G> {
  const nodes: BeltNode[] = [];
  for (let n: BeltNode | undefined = end; n; n = n.prev) nodes.push(n);
  nodes.reverse();
  const start = starts[nodes[0]!.start]!;
  const cells = nodes.map((n) => ({ x: n.x, z: n.z }));
  const ins: Dir4[] = [];
  const outs: Dir4[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const next = nodes[i + 1];
    const outDir: Dir4 | null = next
      ? (DIRS.findIndex((d) => d.dx === next.x - n.x && d.dz === next.z - n.z) as Dir4)
      : goal.outDir;
    let inDir: Dir4 | null = n.inc === 4 ? null : (n.inc as Dir4);
    // điểm đầu tự do: ô đầu là ô thẳng theo hướng nó đi ra
    const out = (outDir ?? inDir ?? 2) as Dir4;
    if (inDir === null) inDir = out;
    ins.push(inDir);
    outs.push(out);
  }
  const crossings = nodes.filter((n) => n.cross).map((n) => ({ x: n.x, z: n.z }));
  return { cells, ins, outs, turns: end.turns + extraTurn, start, goal, crossings };
}

/**
 * Đường "lý tưởng" bỏ qua vật cản — chỉ để vẽ preview màu đỏ khi không có lối,
 * cho người dùng thấy băng *định* đi đâu và bị chặn ở đâu.
 */
export function straightPreview(from: Cell, inDir: Dir4 | null, to: Cell): { cells: Cell[]; ins: Dir4[]; outs: Dir4[] } {
  const cells: Cell[] = [{ ...from }];
  // đi theo trục của hướng vào trước, cho giống cách game kéo băng
  const xFirst = inDir === null ? Math.abs(to.x - from.x) >= Math.abs(to.z - from.z) : inDir === 1 || inDir === 3;
  let c = { ...from };
  const walk = (axis: 'x' | 'z'): void => {
    while (c[axis] !== to[axis]) {
      c = { ...c, [axis]: c[axis] + Math.sign(to[axis] - c[axis]) };
      cells.push(c);
    }
  };
  if (xFirst) {
    walk('x');
    walk('z');
  } else {
    walk('z');
    walk('x');
  }
  const ins: Dir4[] = [];
  const outs: Dir4[] = [];
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i - 1];
    const b = cells[i]!;
    const n = cells[i + 1];
    const dir = (p: Cell, q: Cell): Dir4 =>
      DIRS.findIndex((d) => d.dx === q.x - p.x && d.dz === q.z - p.z) as Dir4;
    const inD = a ? dir(a, b) : (inDir ?? (n ? dir(b, n) : 2));
    const outD = n ? dir(b, n) : inD;
    ins.push(inD);
    outs.push(outD);
  }
  return { cells, ins, outs };
}
