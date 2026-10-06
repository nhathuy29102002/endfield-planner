import { Grid } from '../grid/grid';
import { routeBelt, straightPreview, type BeltGoal, type BeltStart } from '../grid/router';
import {
  cellKey,
  footprintCells,
  opposite,
  step,
  worldPorts,
  type WorldPort,
} from '../model/geometry';
import { beltAt } from '../model/network';
import type {
  BeltTile,
  Blueprint,
  Cell,
  Dataset,
  Dir4,
  Endpoint,
  Layer,
  PlacedMachine,
  PortKey,
  PortKind,
} from '../model/types';
import { tr } from '../i18n';

/**
 * Điểm bắt đầu của một lần đặt băng/ống — đúng bốn trường hợp người chơi gặp:
 *  - `port`    bấm trúng một cổng ra ⇒ chỉ đi từ cổng đó;
 *  - `machine` bấm vào thân máy ⇒ xét **mọi** cổng ra hợp lệ, cổng nào cho đường
 *              ngắn nhất tới con trỏ thì dùng — nên điểm đầu đổi theo khi rê chuột;
 *  - `tile`    bấm vào một ô băng có sẵn ⇒ ô đó bị thay bằng đầu của đoạn mới, và
 *              đoạn mới nhận hàng theo đúng hướng ô ngay trước nó đang đẩy tới;
 *  - `cell`    bấm vào ô trống ⇒ băng bắt đầu từ đó, hướng tự do.
 */
export type StartSpec =
  | { type: 'port'; uid: number; key: PortKey }
  | { type: 'machine'; uid: number }
  | { type: 'tile'; x: number; z: number }
  | { type: 'cell'; x: number; z: number };

interface StartTag {
  port?: Endpoint;
  /** Ô băng cũ sẽ bị thay bằng ô đầu của đoạn mới. */
  replace?: BeltTile;
}
interface GoalTag {
  port?: Endpoint;
}

export interface BeltPlan {
  ok: boolean;
  kind: PortKind;
  cells: Cell[];
  ins: Dir4[];
  outs: Dir4[];
  reason?: string;
  /** Kết thúc vào cổng của máy ⇒ đặt xong là dừng; còn không thì nối tiếp. */
  endsAtPort: boolean;
  replace?: BeltTile;
  from?: Endpoint;
  to?: Endpoint;
  /** Ô cắt ngang một tuyến thẳng có sẵn ⇒ đặt cầu nối ở đó (không đặt ô băng/ống). */
  bridges?: Cell[];
}

const layerOf = (k: PortKind): Layer => (k === 'pipe' ? 1 : 0);

/** Cầu nối tự đặt khi hai tuyến cùng loại cắt nhau. */
export const BRIDGE_OF: Record<PortKind, string> = { belt: 'log_connector', pipe: 'log_pipe_connector' };

/**
 * Tuyến mới đi theo hướng `dir` xuyên qua ô `c` được không, bằng cách **bắc cầu**: ô đó phải
 * là ô **thẳng** cùng loại, chạy **vuông góc** với tuyến mới. Cầu ống chiếm cả mặt đất nên
 * mặt đất ở đó phải trống; cầu băng chỉ nằm ở mặt đất.
 */
function crossableFor(bp: Blueprint, grid: Grid, kind: PortKind) {
  return (c: Cell, dir: Dir4): boolean => {
    const hit = beltAt(bp, kind, c);
    if (!hit) return false;
    const t = hit.tile;
    if (t.in !== t.out || t.in % 2 === dir % 2) return false;
    return kind === 'belt' || grid.free(0, c);
  };
}

function machineCtx(bp: Blueprint, ds: Dataset, uid: number) {
  const m = bp.machines.find((v) => v.uid === uid);
  const def = m ? ds.machines.get(m.machineId) : undefined;
  return m && def ? { m, def, ports: worldPorts(m, def), inside: new Set(footprintCells(m, def).map(cellKey)) } : undefined;
}

/** Ô trống trên tầng của loại tuyến này (hoặc là ô băng đang được thay). */
function freeFor(grid: Grid, kind: PortKind, c: Cell, replacing?: BeltTile): boolean {
  if (replacing && replacing.x === c.x && replacing.z === c.z) return true;
  return grid.free(layerOf(kind), c);
}

/**
 * Ô có băng / ống **cùng loại** — đè lên được (người dùng 2026-10-04: đè nếu giống loại, bất kể hướng). Ô của máy / van
 * / cầu thì không. Băng chuyền vẫn không được ra viền ngoài map.
 * **Ưu tiên cầu** (người dùng 2026-10-04 lần 2): đi vào **vuông góc** với một ô **thẳng** (hai tuyến cắt nhau) thì
 * KHÔNG được đè — chỉ được bắc cầu (`crossableFor`), để tuyến cũ không bị cắt đứt. Ô góc, hoặc đi dọc theo tuyến cũ,
 * thì đè được. (Ô đích do người dùng trỏ vào vẫn đè được — xem `resolveGoals`.)
 */
const overwritableFor =
  (bp: Blueprint, grid: Grid, kind: PortKind) =>
  (c: Cell, dir?: Dir4): boolean => {
    const hit = beltAt(bp, kind, c);
    if (!hit || (kind === 'belt' && !grid.inCore(c))) return false;
    const t = hit.tile;
    if (dir !== undefined && t.in === t.out && t.in % 2 !== dir % 2) return false;
    return true;
  };

/** Các ô sát đế máy, kèm hướng từ máy đi ra ô đó — cho cổng `virtual`. */
function perimeter(inside: Set<string>): { cell: Cell; outward: Dir4 }[] {
  const out: { cell: Cell; outward: Dir4 }[] = [];
  for (const k of inside) {
    const [x, z] = k.split(',').map(Number) as [number, number];
    for (let d = 0 as Dir4; d < 4; d = (d + 1) as Dir4) {
      const n = step({ x, z }, d);
      if (!inside.has(cellKey(n))) out.push({ cell: n, outward: d });
    }
  }
  return out;
}

/** Vật tư đi qua một cổng, nếu đã biết (theo công thức / nguồn đã khai). */
const itemAt = (m: PlacedMachine, key: PortKey): string | null => m.binding[key] ?? null;

export function resolveStarts(
  bp: Blueprint,
  ds: Dataset,
  spec: StartSpec,
  kind: PortKind,
): BeltStart<StartTag>[] {
  const grid = Grid.fromBlueprint(bp, ds);
  if (spec.type === 'tile') {
    const hit = beltAt(bp, kind, spec);
    return hit ? [{ cell: { x: spec.x, z: spec.z }, inDir: hit.tile.in, tag: { replace: hit.tile } }] : [];
  }
  if (spec.type === 'cell') {
    return grid.free(layerOf(kind), spec) ? [{ cell: { x: spec.x, z: spec.z }, inDir: null, tag: {} }] : [];
  }
  const ctx = machineCtx(bp, ds, spec.uid);
  if (!ctx) return [];
  let ports = ctx.ports.filter((p) => p.dir === 'out' && p.kind === kind);
  if (spec.type === 'port') ports = ports.filter((p) => p.key === spec.key);
  else {
    // thân máy: ưu tiên cổng đang thực sự đẩy vật tư ra theo công thức
    const bound = ports.filter((p) => itemAt(ctx.m, p.key));
    if (bound.length > 0) ports = bound;
  }

  const starts: BeltStart<StartTag>[] = [];
  const crossable = crossableFor(bp, grid, kind);
  for (const p of ports) {
    const tag: StartTag = { port: { uid: p.uid, portKey: p.key } };
    if (p.virtual) {
      for (const { cell, outward } of perimeter(ctx.inside))
        if (freeFor(grid, kind, cell)) starts.push({ cell, inDir: outward, tag });
    } else if (freeFor(grid, kind, p.attach)) {
      starts.push({ cell: p.attach, inDir: p.flow, tag });
    } else {
      // Ô ngay trước cổng đã có băng/ống (người dùng chốt 2026-09-29):
      //  - nằm **dọc**, nhận hàng từ chính cổng này ⇒ nối tiếp (merge) băng đó — ô đó được thay;
      //  - nằm **ngang** (thẳng, vuông góc với cổng) ⇒ đi xuyên qua, ô đó thành cầu nối.
      const hit = beltAt(bp, kind, p.attach);
      if (hit && hit.tile.in === p.flow) starts.push({ cell: p.attach, inDir: p.flow, tag: { ...tag, replace: hit.tile } });
      else if (hit && crossable(p.attach, p.flow)) starts.push({ cell: p.attach, inDir: p.flow, tag, cross: true });
    }
  }
  return starts;
}

/**
 * Điểm cuối ứng với vị trí con trỏ.
 *
 * Con trỏ trên thân máy ⇒ mọi cổng vào còn trống của máy đó, ô cuối phải đẩy theo
 * đúng hướng cổng. Biết vật tư đang chở thì chỉ nhắm cổng nhận đúng vật tư đó. Cổng
 * kích hoạt chỉ được chọn khi con trỏ nằm ngay trên nó — nạp khí nhầm vào cổng kích
 * hoạt là lỗi khó thấy.
 */
export function resolveGoals(
  bp: Blueprint,
  ds: Dataset,
  cursor: Cell,
  kind: PortKind,
  opts: { itemId?: string | null; replacing?: BeltTile } = {},
): BeltGoal<GoalTag>[] {
  const grid = Grid.fromBlueprint(bp, ds);
  const occ = grid.at(0, cursor);
  const host =
    occ?.kind === 'machine' ? bp.machines.find((m) => m.uid === occ.uid) : undefined;

  const usable = (c: Cell): boolean => freeFor(grid, kind, c, opts.replacing) || overwritableFor(bp, grid, kind)(c);
  if (!host) {
    return usable(cursor) ? [{ cell: cursor, outDir: null, tag: {} }] : [];
  }

  const ctx = machineCtx(bp, ds, host.uid)!;
  let ports = ctx.ports.filter((p) => p.dir === 'in' && p.kind === kind);
  // Van/cầu 1×1 có mọi cổng chung một ô: "bấm trúng ô cổng" không phân biệt được hướng,
  // nên để tìm đường tự chọn cổng theo hướng băng tới.
  const exact = ctx.def.router
    ? undefined
    : ports.find((p) => !p.virtual && p.cell.x === cursor.x && p.cell.z === cursor.z);
  if (exact) ports = [exact];
  else {
    ports = ports.filter((p) => p.key !== ctx.def.activatorPort);
    if (opts.itemId) {
      const match = ports.filter((p) => itemAt(ctx.m, p.key) === opts.itemId);
      if (match.length > 0) ports = match;
    }
  }

  const goals: BeltGoal<GoalTag>[] = [];
  for (const p of ports) {
    const tag: GoalTag = { port: { uid: p.uid, portKey: p.key } };
    if (p.virtual) {
      for (const { cell, outward } of perimeter(ctx.inside))
        if (usable(cell)) goals.push({ cell, outDir: opposite(outward), tag });
    } else if (usable(p.attach)) {
      // ô trước cổng có tuyến cũ cùng loại ⇒ đè lên (tuyến cũ bị cắt ở đó)
      goals.push({ cell: p.attach, outDir: p.flow, tag });
    }
  }
  return goals;
}

/**
 * Con trỏ nằm đúng trên một **cổng ra** cùng loại của máy (người dùng 2026-10-04 nối ống vào cạnh xả của Lò Mở Rộng):
 * trả về câu giải thích để báo rõ thay vì "vướng vật cản".
 */
function outPortHint(bp: Blueprint, ds: Dataset, cursor: Cell, kind: PortKind): string | null {
  const grid = Grid.fromBlueprint(bp, ds);
  const occ = grid.at(0, cursor);
  if (occ?.kind !== 'machine') return null;
  const ctx = machineCtx(bp, ds, occ.uid);
  if (!ctx || ctx.def.router) return null;
  const out = ctx.ports.find((p) => p.dir === 'out' && p.kind === kind && !p.virtual && p.cell.x === cursor.x && p.cell.z === cursor.z);
  if (!out) return null;
  const noun = kind === 'pipe' ? tr('ống') : tr('băng');
  return ctx.ports.some((p) => p.dir === 'in' && p.kind === kind)
    ? tr('Ô này là cổng RA {0} của {1} — cổng vào {0} nằm ở chỗ khác trên máy (xem sơ đồ cổng trong cửa sổ máy)', noun, ctx.def.name)
    : tr('Ô này là cổng RA {0} của {1} — máy này không nhận {0} vào', noun, ctx.def.name);
}

/** Bấm vào ô này thì bắt đầu đặt từ đâu. */
export function specAt(bp: Blueprint, ds: Dataset, cell: Cell, kind: PortKind): StartSpec | undefined {
  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    if (!def) continue;
    const inside = footprintCells(m, def).some((c) => c.x === cell.x && c.z === cell.z);
    if (!inside) continue;
    const port = def.router
      ? undefined // van/cầu 1×1: mọi cổng chung một ô, không bấm trúng riêng được
      : worldPorts(m, def).find(
          (p) => p.dir === 'out' && p.kind === kind && !p.virtual && p.cell.x === cell.x && p.cell.z === cell.z,
        );
    return port ? { type: 'port', uid: m.uid, key: port.key } : { type: 'machine', uid: m.uid };
  }
  if (beltAt(bp, kind, cell)) return { type: 'tile', x: cell.x, z: cell.z };
  const grid = Grid.fromBlueprint(bp, ds);
  return grid.free(layerOf(kind), cell) ? { type: 'cell', x: cell.x, z: cell.z } : undefined;
}

/** Vật tư mà đoạn băng sắp đặt sẽ chở, suy từ điểm đầu. */
function carriedItem(bp: Blueprint, spec: StartSpec): string | null {
  if (spec.type === 'port') {
    const m = bp.machines.find((v) => v.uid === spec.uid);
    return m ? itemAt(m, spec.key) : null;
  }
  return null;
}

/**
 * Lên phương án đặt từ `spec` tới vị trí con trỏ. Không sửa bản vẽ.
 *
 * Có đường ⇒ `ok`, vẽ preview màu trắng. Không có ⇒ vẫn trả về một đường thẳng-gấp
 * bỏ qua vật cản để vẽ preview màu **đỏ**, cho người dùng thấy băng định đi đâu và
 * vướng ở đâu.
 */
export function planBelt(
  bp: Blueprint,
  ds: Dataset,
  spec: StartSpec,
  cursor: Cell,
  kind: PortKind,
  maxTurns = 3,
): BeltPlan {
  const starts = resolveStarts(bp, ds, spec, kind);
  const replacing = starts[0]?.tag?.replace;
  const goals = resolveGoals(bp, ds, cursor, kind, { itemId: carriedItem(bp, spec), replacing });

  const fail = (reason: string): BeltPlan => {
    const s0 = starts[0] ?? { cell: 'x' in spec ? { x: spec.x, z: spec.z } : cursor, inDir: null };
    const p = straightPreview(s0.cell, s0.inDir, cursor);
    return { ok: false, kind, ...p, reason, endsAtPort: false };
  };

  if (starts.length === 0)
    return fail(
      spec.type === 'machine' || spec.type === 'port'
        ? tr('Máy không còn cổng {0} ra nào trống', kind === 'pipe' ? tr('ống') : tr('băng'))
        : tr('Không bắt đầu được ở đây'),
    );
  const hint = outPortHint(bp, ds, cursor, kind);
  if (goals.length === 0) {
    // băng chuyền không được ra viền ngoài map (người dùng 2026-09-29) — báo rõ thay vì "vướng vật cản"
    if (kind === 'belt' && !Grid.fromBlueprint(bp, ds).inCore(cursor)) return fail(tr('Băng chuyền không đặt được ở viền ngoài map'));
    return fail(hint ?? tr('Vướng vật cản, hoặc máy đích không còn cổng vào trống'));
  }

  const grid = Grid.fromBlueprint(bp, ds);
  const crossable = crossableFor(bp, grid, kind);
  const route = routeBelt(grid, layerOf(kind), starts, goals, {
    maxTurns,
    // ô băng cũ bị thay ở điểm đầu thì không bắc cầu qua chính nó
    crossable: (c, d) => !(replacing && replacing.x === c.x && replacing.z === c.z) && crossable(c, d),
    overwritable: overwritableFor(bp, grid, kind),
  });
  if (!route) return fail(hint ?? tr('Không có đường nào ≤ {0} góc mà không vướng vật cản', maxTurns));

  return {
    ok: true,
    kind,
    cells: route.cells,
    ins: route.ins,
    outs: route.outs,
    endsAtPort: route.goal.tag?.port !== undefined,
    replace: route.start.tag?.replace,
    from: route.start.tag?.port,
    to: route.goal.tag?.port,
    bridges: route.crossings,
  };
}

/**
 * Băng vừa đi vào một **cầu** thì lần đặt tiếp theo nên đi ra phía bên kia cầu, cùng
 * hướng — đó là lý do duy nhất người ta đặt cầu. Trả về cổng ra cùng kênh, nếu có.
 */
export function bridgeExit(bp: Blueprint, ds: Dataset, to: Endpoint): StartSpec | undefined {
  const ctx = machineCtx(bp, ds, to.uid);
  if (!ctx || (ctx.def.type !== 'LogConnector' && ctx.def.type !== 'LogPipeConnector')) return undefined;
  const pin = ctx.ports.find((p) => p.key === to.portKey);
  const pout = pin && ctx.ports.find((p) => p.dir === 'out' && p.flow === pin.flow);
  return pout ? { type: 'port', uid: to.uid, key: pout.key } : undefined;
}

/**
 * Ghi phương án vào bản vẽ. Trả về mã nhóm và ô cuối để nối tiếp.
 *
 * Ô cắt ngang tuyến có sẵn (`plan.bridges`): gỡ ô băng/ống cũ ở đó và đặt **cầu nối** — hai
 * tuyến đi qua nhau mà không trộn hàng, tuyến cũ vẫn thông như trước.
 */
export function commitPlan(bp: Blueprint, plan: BeltPlan): { group: number; last: Cell } {
  if (plan.replace) bp.belts = bp.belts.filter((t) => t !== plan.replace);
  const group = bp.nextUid++;
  const bridges = new Set((plan.bridges ?? []).map(cellKey));
  plan.cells.forEach((c, i) => {
    // bỏ ô trùng (cùng tầng) nếu có — đặt đè thì ô mới thắng
    bp.belts = bp.belts.filter((t) => !(t.kind === plan.kind && t.x === c.x && t.z === c.z));
    if (bridges.has(cellKey(c))) {
      bp.machines.push({
        uid: bp.nextUid++,
        machineId: BRIDGE_OF[plan.kind],
        x: c.x,
        z: c.z,
        rot: 0,
        recipeId: null,
        binding: {},
        count: 1,
      });
      return;
    }
    bp.belts.push({ x: c.x, z: c.z, kind: plan.kind, in: plan.ins[i]!, out: plan.outs[i]!, group });
  });
  return { group, last: plan.cells[plan.cells.length - 1]! };
}

export interface ConnectResult {
  ok: boolean;
  reason?: string;
  group?: number;
}

/**
 * Nối thẳng cổng ra → cổng vào (dùng cho bản mẫu và test).
 * Không giới hạn 3 góc như khi người dùng kéo tay: đây là nối tự động, cứ có đường
 * là được.
 */
export function connect(
  bp: Blueprint,
  ds: Dataset,
  from: Endpoint,
  to: Endpoint,
  opts: { maxTurns?: number } = {},
): ConnectResult {
  const a = machineCtx(bp, ds, from.uid)?.ports.find((p) => p.key === from.portKey);
  const bCtx = machineCtx(bp, ds, to.uid);
  const b = bCtx?.ports.find((p) => p.key === to.portKey);
  if (!a || !b || !bCtx) return { ok: false, reason: tr('Không tìm thấy cổng') };
  if (a.dir !== 'out' || b.dir !== 'in') return { ok: false, reason: tr('Phải nối cổng ra → cổng vào') };
  if (a.kind !== b.kind) return { ok: false, reason: tr('Không nối được băng chuyền với ống') };
  if (a.uid === b.uid) return { ok: false, reason: tr('Không nối máy với chính nó') };

  const starts = resolveStarts(bp, ds, { type: 'port', uid: from.uid, key: from.portKey }, a.kind);
  if (starts.length === 0) return { ok: false, reason: tr('Cổng ra đó đã có băng') };

  const grid = Grid.fromBlueprint(bp, ds);
  const goals: BeltGoal<GoalTag>[] = [];
  const tag = { port: to };
  if (b.virtual) {
    for (const { cell, outward } of perimeter(bCtx.inside))
      if (grid.free(layerOf(b.kind), cell)) goals.push({ cell, outDir: opposite(outward), tag });
  } else if (grid.free(layerOf(b.kind), b.attach)) {
    goals.push({ cell: b.attach, outDir: b.flow, tag });
  }
  if (goals.length === 0) return { ok: false, reason: tr('Cổng vào đó đã có băng') };

  const route = routeBelt(grid, layerOf(a.kind), starts, goals, { maxTurns: opts.maxTurns ?? 12 });
  if (!route)
    return {
      ok: false,
      reason:
        a.kind === 'pipe'
          ? tr('Không còn lối cho ống — công trình chiếm cả tầng trên, thử chừa hành lang')
          : tr('Không còn lối cho băng chuyền'),
    };
  const { group } = commitPlan(bp, {
    ok: true,
    kind: a.kind,
    cells: route.cells,
    ins: route.ins,
    outs: route.outs,
    endsAtPort: true,
  });
  return { ok: true, group };
}

export function removeBeltAt(bp: Blueprint, kind: PortKind, c: Cell): boolean {
  const before = bp.belts.length;
  bp.belts = bp.belts.filter((t) => !(t.kind === kind && t.x === c.x && t.z === c.z));
  return bp.belts.length < before;
}

export function removeBeltGroup(bp: Blueprint, group: number): void {
  bp.belts = bp.belts.filter((t) => t.group !== group);
}

export type { WorldPort };
