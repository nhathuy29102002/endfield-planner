/**
 * **Simulation — bộ máy mô phỏng theo thời gian** (giai đoạn 1, người dùng 2026-10-03; luật ở `SIMULATION.md` §2).
 *
 * Khác bộ giải ổn định (`sim/solver.ts` tính sản lượng mỗi phút khi mọi thứ đã chạy đều), ở đây từng món hàng đi trên
 * băng / ống, máy chờ đủ nguyên liệu mới chạy, kho máy đầy thì kẹt, van chia luân phiên… theo từng bước thời gian.
 *
 * - **Tuyến** (chuỗi ô băng / ống giữa hai cổng, từ `buildNetwork`) = hàng đợi FIFO có mốc thời gian: mỗi món biết lúc
 *   nó tới cuối tuyến (`ready`); vào / ra cách nhau ít nhất `SECONDS_PER_CELL`; tuyến L ô chứa tối đa L món. Chi phí mỗi
 *   bước chỉ tỉ lệ với số tuyến + số máy (không phải số món) ⇒ chạy 24 giờ trong vài giây.
 * - **Máy** theo vai trò (`model/roles.ts`). Điện, môi trường, gắn tổng tuyến, món của từng cổng ra lấy **một lần** từ
 *   kết quả bộ giải lúc tạo (tĩnh — `SIMULATION.md` §3).
 * - Mọi lần chuyển hàng / bắt đầu / xong một mẻ đều mang mốc thời gian chính xác trong bước, nên bước lớn không làm
 *   sai sức chở.
 */
import { isOff } from '../model/switchOff';
import { buildNetwork, type Network } from '../model/network';
import { kindOfItem } from '../model/dataset';
import { recipesInMode } from '../model/binding';
import { roleOf, type Role } from '../model/roles';
import { activePorts, type Blueprint, type Dataset, type Dir4, type MachineDef, type PlacedMachine, type PortKey, type PortKind, type RecipeDef } from '../model/types';
import { worldPorts } from '../model/geometry';
import { CRUCIBLE_LIMITS, DEPOT_STASH, DISPOSAL, SEWAGE, solve, type MachineFlow, type SolveResult } from '../sim/solver';
import { ACTIVATOR_PER_SECOND, CRUCIBLE_PRODUCT_SLOTS, DT, PER_MINUTE, SECONDS_PER_CELL, STORE } from './params';

const EPS = 1e-9;

// ------------------------------------------------------------------ tuyến
export interface SimItem {
  itemId: string;
  /** Lúc món tới cuối tuyến nếu không bị chặn. */
  ready: number;
  /** Lúc món vào tuyến (để vẽ vị trí ở giai đoạn 2). */
  entered: number;
}

export class Lane {
  readonly items: SimItem[] = [];
  readonly cap: number;
  readonly spacing: number;
  readonly travel: number;
  lastIn = -Infinity;
  lastOut = -Infinity;
  delivered = 0;
  /** Số món đã vào tuyến. */
  entered = 0;
  /** Lúc ra của các món gần nhất (tối đa `cap`) — món thứ i chỉ vào được khi món thứ i − cap đã ra (chỗ trống thật). */
  exits: number[] = [];
  constructor(
    readonly id: string,
    readonly kind: PortKind,
    /** Số ô (0 = cổng kề cổng). */
    readonly length: number,
    readonly from: { uid: number; portKey: PortKey },
    readonly to: { uid: number; portKey: PortKey } | null,
    /** Chỉ số các ô băng / ống (`bp.belts`) theo chiều chạy — để vẽ món đang đi. */
    readonly tiles: number[] = [],
  ) {
    // L ô chứa L món; thêm 1 chỗ cho món **đang trao tay** ở cuối tuyến — trong một bước, món vào đầu tuyến được xử lý
    // trước món ra ở cuối, không có chỗ này thì tuyến chạy hết sức (mỗi ô một món) bị hụt nhịp (*xấp xỉ*, xem §4)
    this.cap = length === 0 ? 1 : length + 1;
    this.spacing = SECONDS_PER_CELL[kind];
    this.travel = length * this.spacing;
  }

  /** Đưa một món vào đầu tuyến, sớm nhất lúc `t`, muộn nhất `limit`. Trả về lúc vào, hoặc `null` nếu không được. */
  push(itemId: string, t: number, limit: number): number | null {
    if (this.items.length >= this.cap) return null;
    let te = Math.max(t, this.lastIn + this.spacing);
    if (this.entered >= this.cap) {
      // chỗ trống do món thứ (entered − cap) ra khỏi tuyến tạo nên — không vào sớm hơn lúc nó ra
      const idx = this.entered - this.cap - (this.delivered - this.exits.length);
      const freed = this.exits[idx];
      if (freed !== undefined) te = Math.max(te, freed);
    }
    if (te > limit + EPS) return null;
    const prev = this.items[this.items.length - 1];
    const ready = Math.max(te + this.travel, prev ? prev.ready + this.spacing : -Infinity);
    this.items.push({ itemId, ready, entered: te });
    this.lastIn = te;
    this.entered++;
    return te;
  }

  /** Món đầu tuyến đã ra lúc `at`. */
  shift(at: number): void {
    this.items.shift();
    this.lastOut = at;
    this.delivered++;
    this.exits.push(at);
    if (this.exits.length > this.cap) this.exits.shift();
  }

  /** Lúc món đầu tuyến ra được (đã tới cuối và cách món trước đủ xa). */
  headTime(): number | null {
    const head = this.items[0];
    return head ? Math.max(head.ready, this.lastOut + this.spacing) : null;
  }
}

// ------------------------------------------------------------------ máy
export interface MachineStats {
  /** Giây đang chạy một mẻ / chờ nguyên liệu / kẹt đầu ra / mất điện. */
  running: number;
  idle: number;
  blocked: number;
  unpowered: number;
  cycles: number;
}

interface NodeBase {
  uid: number;
  m: PlacedMachine;
  def: MachineDef;
  role: Role;
  flow: MachineFlow | undefined;
  /** Có điện lúc này (trong tầm phủ và không sụp điện) — đặt lại mỗi bước. */
  powered: boolean;
  /** Trong tầm cột / trụ điện (tĩnh). */
  inRange: boolean;
  needsPower: boolean;
  /** Người dùng đã tắt máy (Tab / nút nguồn) — không nhận, không đẩy hàng (người dùng 2026-10-07). */
  off: boolean;
  /** Kho của máy theo món — máy chế biến: **ô đầu vào** (nguyên liệu nhận từ tuyến). */
  store: Map<string, number>;
  /** Máy chế biến: **ô đầu ra** (sản phẩm chờ đẩy đi) — tách khỏi ô đầu vào, sản phẩm không bị dùng lại làm nguyên liệu. */
  output: Map<string, number>;
  /** Tuyến ra theo cổng. */
  outs: Map<PortKey, Lane>;
  stats: MachineStats;
}

type Node = NodeBase & { kind: NodeKind; data: Record<string, unknown> };
export type NodeKind =
  | 'crafter'
  | 'source'
  | 'sewageOut'
  | 'depotOut'
  | 'hub'
  | 'depotIn'
  | 'sink'
  | 'disposal'
  | 'udpipeIn'
  | 'udpipeOut'
  | 'router'
  | 'bridge'
  | 'generator'
  | 'envgen'
  | 'none';

export interface SimTotals {
  /** Mỗi món: làm ra (máy chế biến xong mẻ, máy khai thác) / dùng hết (máy chế biến bắt đầu mẻ). */
  produced: Map<string, number>;
  consumed: Map<string, number>;
  /** Kho tổng: thay đổi ròng theo món (âm = đã rút ra). */
  depot: Map<string, number>;
  /**
   * Kho tổng: tổng **nạp vào** / **rút ra** theo món (người dùng 2026-10-03: kho vô hạn nhận cả khi quá 80 000 nhưng vẫn
   * phải tính sản lượng — bảng tổng hợp / biểu đồ dùng "nạp vào").
   */
  depotIn: Map<string, number>;
  depotOut: Map<string, number>;
  /** Bể chứa / kho nhận (không phải kho tổng). */
  stored: Map<string, number>;
  /** Máy xử lý nước thải / cửa nạp nước thải. */
  disposed: Map<string, number>;
  /** Nhiên liệu trạm điện, khí kích hoạt đã đốt. */
  burned: Map<string, number>;
}

const add = (m: Map<string, number>, k: string, v: number): void => {
  m.set(k, (m.get(k) ?? 0) + v);
};

export const emptyTotals = (): SimTotals => ({
  produced: new Map(),
  consumed: new Map(),
  depot: new Map(),
  depotIn: new Map(),
  depotOut: new Map(),
  stored: new Map(),
  disposed: new Map(),
  burned: new Map(),
});

/** Thứ tự chiều kim đồng hồ của các hướng ra quanh một van, bắt đầu từ **bên trái** hướng hàng vào (§2.3, *suy luận*). */
export const clockwiseFrom = (inFlow: Dir4): Dir4[] => [((inFlow + 3) % 4) as Dir4, inFlow, ((inFlow + 1) % 4) as Dir4, ((inFlow + 2) % 4) as Dir4];

/** Trạng thái hiện tại của một máy trong mô phỏng (cho màn hình). */
export interface SimMachineView {
  kind: NodeKind;
  /** Ô đầu vào (máy chế biến) / kho của máy. */
  store: Map<string, number>;
  /** Ô đầu ra (máy chế biến thường). */
  output: Map<string, number>;
  stats: MachineStats;
  recipeId: string | null;
  /** Tiến độ mẻ đang chạy 0…1 (`null` = không chạy). */
  progress: number | null;
  state: 'running' | 'idle' | 'blocked' | 'unpowered';
  /** Khí kích hoạt trong máy (máy có cổng kích hoạt / máy khuếch tán khí). */
  activator: number | null;
  /** Mọi mẻ đang chạy (lò: nhiều công thức song song): công thức, tiến độ 0…1, giây còn lại. */
  cycles: { recipeId: string; progress: number; remaining: number }[];
  /** Lò: kho chung (sản phẩm nằm trong `store`, không ở `output`). */
  shared: boolean;
  /** Trạm điện: món đang cháy và công suất (MW) — "công thức" pin ⇒ ⚡ (người dùng 2026-10-03). */
  burning: { itemId: string; power: number; progress: number; remaining: number } | null;
}

export interface Simulation {
  readonly now: number;
  readonly lanes: Lane[];
  readonly totals: SimTotals;
  /** Chạy thêm `seconds` giây (bước `dt`). */
  run(seconds: number, dt?: number): void;
  step(dt?: number): void;
  /** Trạng thái một máy; `at` = lúc vẽ (giữa hai bước — để thanh tiến độ chạy mượt), mặc định `now`. */
  machine(uid: number, at?: number): SimMachineView | undefined;
  /**
   * Xoá sạch món `item` trong ô vào (`in`) / ô ra (`out`) của máy `uid` (người dùng 2026-10-03: chuột phải vào ô ở chế
   * độ mô phỏng). Trả về số món đã xoá.
   */
  clearSlot(uid: number, item: string, side: 'in' | 'out'): number;
  /** Điện các máy cần (MW) — tĩnh, như bộ giải: mọi máy đã nối điện kể cả đang nhàn rỗi. */
  powerDemand(): number;
  /** Điện đang phát lúc `now` (MW): điện nền lõi căn cứ + trạm điện đang cháy pin. */
  powerSupply(): number;
  /** Có kiểm tra điện không (`bp.enforcePower`). */
  readonly enforcePower: boolean;
  /** Bước tới đúng lúc `t` (đồng hồ = `t`, không cộng dồn sai số). */
  stepTo(t: number): void;
  /** Đầu bước: trạm điện đang tắt mà có pin thì châm — để tính điện cả nhóm trước khi các map bước. */
  beginStep(): void;
  machines(): number[];
  /**
   * Toàn bộ trạng thái đang chạy (tham chiếu trực tiếp, không sao chép) — để dựng lại mô phỏng sau khi map đổi mà giữ
   * nguyên những gì đang chạy (`prev`), hoặc chụp lại cho thanh thời gian (`timeline.ts`, giai đoạn 3).
   */
  state(): SimState;
}

/** Trạng thái đang chạy của một máy (không gồm thông số cấu hình `CONFIG_KEYS` — tính lại được từ map). */
export interface SimNodeState {
  machineId: string;
  store: Map<string, number>;
  output: Map<string, number>;
  stats: MachineStats;
  data: Record<string, unknown>;
}

/** Trạng thái đang chạy của một tuyến. */
export interface SimLaneState {
  id: string;
  kind: PortKind;
  from: { uid: number; portKey: PortKey };
  to: { uid: number; portKey: PortKey } | null;
  items: SimItem[];
  lastIn: number;
  lastOut: number;
  delivered: number;
  exits: number[];
}

/**
 * **Trạng thái mô phỏng** tại một thời điểm — đủ để chạy tiếp y hệt (cùng map) hoặc dựng lại trên map đã sửa. Thanh
 * thời gian (giai đoạn 3) lưu các trạng thái này (nén thành chuỗi) để kéo lùi về bất kỳ lúc nào.
 */
export interface SimState {
  now: number;
  /** Thứ tự xoay vòng duyệt tuyến (van gộp) — giữ để chạy tiếp ra đúng kết quả như chạy một mạch. */
  rot: number;
  sewageIn: number;
  depotStock: Map<string, number>;
  totals: SimTotals;
  nodes: Map<number, SimNodeState>;
  lanes: SimLaneState[];
}

/** Những gì chỉ phụ thuộc map (kết quả bộ giải, mạng băng / ống) — tính một lần, dùng lại khi tua thanh thời gian. */
export interface SimBase {
  result: SolveResult;
  net: Network;
}
export const simBase = (bp: Blueprint, ds: Dataset): SimBase => ({ result: solve(bp, ds), net: buildNetwork(bp, ds) });

/** Thông số cấu hình của từng máy (tính lại từ map mới) — mọi khoá khác trong `data` là trạng thái đang chạy, được giữ. */
const CONFIG_KEYS = new Set(['recipes', 'free', 'order', 'ins', 'filter', 'lane', 'item', 'interval', 'portItem', 'infinite', 'items']);

export interface SimOptions {
  /**
   * Kho tổng **vô hạn** (mặc định — người dùng 2026-10-03): nhận hàng kể cả khi đầy và luôn có đủ mọi món để rút.
   * Tắt ⇒ kho tổng bắt đầu rỗng, mỗi món chứa tối đa `depotCapacity`; Máy Dỡ Hàng Kho chỉ rút được món đang có,
   * Máy Nâng Hàng Kho dừng khi món đó đầy.
   */
  infiniteDepot?: boolean;
  /** Sức chứa kho tổng mỗi món khi không vô hạn (mặc định `DEFAULT_DEPOT_CAPACITY`). */
  depotCapacity?: number;
  /**
   * **Tự sinh vào kho tổng** (người dùng 2026-10-04, nút cài đặt của thanh mô phỏng): món → số mỗi phút tự có thêm trong
   * kho tổng (thay vì bật kho tổng vô hạn). Chỉ có tác dụng khi **tắt** kho tổng vô hạn; `SimWorld` cộng cho cả nhóm.
   */
  depotGen?: Record<string, number>;
  /**
   * Dùng chung với các map khác trong **nhóm tab** (người dùng 2026-10-03: các map trong nhóm chung kho tổng + chung
   * điện) — `SimWorld` tạo và giữ. Không có ⇒ map tự có kho tổng, tự tính điện.
   */
  shared?: SimShared;
}

/** Phần dùng chung giữa các map của một nhóm. */
export interface SimShared {
  /** Kho tổng (khi không vô hạn): số đang có theo món. */
  depotStock: Map<string, number>;
  /** Cả nhóm đang sụp điện (đặt mỗi bước bởi `SimWorld`). */
  blackout: boolean;
}

/** Sức chứa của kho tổng cho **mỗi** món khi tắt "kho tổng vô hạn": **80 000** (người dùng 2026-10-03). */
export const DEFAULT_DEPOT_CAPACITY = 80000;

/** Vòng hạt giống (§2 — người dùng 2026-10-03): Máy Gieo Trồng ⇄ Máy Thu Hoạch Hạt nối thành vòng thì luôn chạy hết công suất. */
const SEED_LOOP = { planter: 'planter_1', collector: 'seedcollector_1' };

/**
 * `prev` (người dùng 2026-10-03: được chỉnh sửa map trong lúc mô phỏng): dựng mô phỏng cho map **mới** nhưng giữ trạng
 * thái của mô phỏng cũ — đồng hồ, tổng cộng, kho tổng; máy cùng uid + cùng loại giữ kho, mẻ đang chạy, thống kê; tuyến
 * cùng chỗ (cùng ô đầu, cùng hai đầu nối) giữ hàng đang chạy (tuyến dài / ngắn đi thì cắt bớt cho vừa). Máy, tuyến mới
 * bắt đầu rỗng; máy / tuyến đã xoá thì hàng trong đó mất.
 */
export function createSimulation(bp: Blueprint, ds: Dataset, opts: SimOptions = {}, prev?: Simulation | SimState, base?: SimBase): Simulation {
  const infiniteDepot = opts.infiniteDepot !== false;
  const depotCap = opts.depotCapacity ?? DEFAULT_DEPOT_CAPACITY;
  /** Kho tổng khi không vô hạn: số đang có theo món. */
  const depotStock = opts.shared?.depotStock ?? new Map<string, number>();
  const depotHas = (item: string): boolean => infiniteDepot || (depotStock.get(item) ?? 0) >= 1;
  const depotRoom = (item: string): boolean => infiniteDepot || (depotStock.get(item) ?? 0) < depotCap;
  const depotAdd = (item: string, v: number): void => {
    add(totals.depot, item, v);
    if (v > 0) add(totals.depotIn, item, v);
    else add(totals.depotOut, item, -v);
    if (!infiniteDepot) depotStock.set(item, (depotStock.get(item) ?? 0) + v);
  };
  const enforcePower = bp.enforcePower !== false;
  /** Sụp điện lúc này — tự tính mỗi bước, hoặc lấy của cả nhóm (`opts.shared`). */
  let blackout = false;
  const result = base?.result ?? solve(bp, ds);
  const net = base?.net ?? buildNetwork(bp, ds);
  const nodes = new Map<number, Node>();
  const totals: SimTotals = emptyTotals();
  let now = 0;
  /** Nước thải các cửa nạp đã nhận (Cửa Xả Phụ Phẩm đẩy ra 1 Xircon Thải mỗi `SEWAGE.ratio`). */
  let sewageIn = 0;
  /** Tuyến được duyệt theo thứ tự xoay vòng mỗi bước để van gộp lấy hàng luân phiên các nhánh. */
  let rot = 0;

  // ---------------------------------------------------------------- dựng máy
  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    if (!def) continue;
    const role = roleOf(def);
    const flow = result.machines.get(m.uid);
    // §2.5 thiếu điện ⇒ dừng hẳn. Như bộ giải: tắt "kiểm tra tầm điện" ⇒ bỏ qua tầm cột/trụ. **Tầm phủ** lấy một lần
    // từ bộ giải (máy "sụp điện" trong bộ giải vẫn là trong tầm); **sụp điện** tính lại mỗi bước theo pin đang cháy
    // (người dùng 2026-10-03: nguồn điện phải thật sự tiêu hao pin; thiếu điện ⇒ cả map / cả nhóm dừng)
    const needs = def.power > 0;
    // máy người dùng đã tắt (Tab, 2026-10-06) = như mất điện: không chạy, không nhận hàng (điện cần đã trừ trong bộ giải)
    const off = isOff(m, def);
    const inRange = !off && (!needs || bp.enforcePower === false || flow?.powered !== false || flow?.blackout === true);
    const powered = inRange;
    let kind: NodeKind = 'none';
    if (role === 'crafter') kind = 'crafter';
    else if (role === 'source') kind = m.machineId === SEWAGE.outlet ? 'sewageOut' : 'source';
    else if (role === 'depotOut') kind = 'depotOut';
    else if (role === 'depotIn') kind = 'depotIn';
    else if (role === 'sink') kind = def.type === 'Hub' || def.type === 'SubHub' ? 'hub' : DISPOSAL[m.machineId] ? 'disposal' : 'sink';
    else if (role === 'udpipeIn') kind = 'udpipeIn';
    else if (role === 'udpipeOut') kind = 'udpipeOut';
    else if (role === 'router') kind = 'router';
    else if (role === 'bridge') kind = 'bridge';
    else if (role === 'generator') kind = 'generator';
    else if (role === 'envgen') kind = 'envgen';
    nodes.set(m.uid, {
      uid: m.uid,
      m,
      def,
      role,
      flow,
      powered,
      inRange,
      needsPower: (needs && bp.enforcePower !== false) || off,
      off,
      store: new Map(),
      output: new Map(),
      outs: new Map(),
      stats: { running: 0, idle: 0, blocked: 0, unpowered: 0, cycles: 0 },
      kind,
      data: {},
    });
  }

  // ---------------------------------------------------------------- tuyến
  const lanes: Lane[] = [];
  for (const c of net.chains) {
    if (!c.from || !nodes.has(c.from.uid)) continue; // không ai đẩy hàng vào ⇒ không bao giờ có món
    const lane = new Lane(c.id, c.kind, c.tiles.length, c.from, c.to && nodes.has(c.to.uid) ? c.to : null, c.tiles);
    lanes.push(lane);
    nodes.get(c.from.uid)!.outs.set(c.from.portKey, lane);
  }

  /** Tuyến vào theo máy và cổng (van gộp cần biết nhánh nào đang có hàng chờ). */
  const inLanes = new Map<number, Map<PortKey, Lane>>();
  for (const l of lanes) {
    if (!l.to) continue;
    let m = inLanes.get(l.to.uid);
    if (!m) inLanes.set(l.to.uid, (m = new Map()));
    m.set(l.to.portKey, l);
  }
  /** Máy chế biến mà hàng từ `uid` tới được (đi xuyên van / cầu / ống ngầm, dừng ở máy chế biến đầu tiên). */
  const reach = (uid: number): Set<number> => {
    const seen = new Set<number>([uid]);
    const out = new Set<number>();
    const queue = [uid];
    while (queue.length) {
      const u = queue.shift()!;
      const n = nodes.get(u);
      if (!n) continue;
      const next: number[] = [...n.outs.values()].filter((l) => l.to).map((l) => l.to!.uid);
      if (n.kind === 'udpipeIn' && n.m.pairTarget != null) next.push(n.m.pairTarget);
      for (const v of next) {
        if (seen.has(v)) continue;
        seen.add(v);
        const k = nodes.get(v)?.kind;
        if (k === 'crafter') out.add(v);
        else if (k === 'router' || k === 'bridge' || k === 'udpipeIn' || k === 'udpipeOut') queue.push(v);
      }
    }
    return out;
  };
  /**
   * Vòng hạt giống (người dùng 2026-10-03): Máy Gieo Trồng → Máy Thu Hoạch Hạt → Máy Gieo Trồng nối thành vòng ⇒ hai máy
   * **luôn chạy hết công suất**, không cần đặt sẵn nguyên liệu: món vòng (hạt cho máy gieo, cây cho máy thu hoạch) có thì
   * dùng, thiếu thì vẫn chạy. Ghi vào `free` của từng máy.
   */
  const loopFree = new Map<number, Set<string>>();
  {
    const planters = [...nodes.values()].filter((n) => n.m.machineId === SEED_LOOP.planter);
    const collectors = [...nodes.values()].filter((n) => n.m.machineId === SEED_LOOP.collector);
    const madeBy = (id: string): Set<string> => new Set((ds.recipesByMachine.get(id) ?? []).flatMap((r) => r.outcomes.map((o) => o.itemId)));
    const seeds = madeBy(SEED_LOOP.collector);
    const plants = madeBy(SEED_LOOP.planter);
    const reachOf = new Map([...planters, ...collectors].map((n) => [n.uid, reach(n.uid)]));
    for (const p of planters)
      for (const c of collectors) {
        if (!reachOf.get(p.uid)!.has(c.uid) || !reachOf.get(c.uid)!.has(p.uid)) continue;
        loopFree.set(p.uid, seeds);
        loopFree.set(c.uid, plants);
      }
  }

  // ---------------------------------------------------------------- dữ liệu riêng từng loại máy
  const portFlow = (n: Node): Map<PortKey, Dir4> => new Map(worldPorts(n.m, n.def).map((p) => [p.key, p.flow]));
  for (const n of nodes.values()) {
    const d = n.data;
    switch (n.kind) {
      case 'crafter': {
        const env = n.flow?.env ?? 'None';
        const all = recipesInMode(ds, n.m, n.def).filter((r) => r.catalystEnv === 'None' || r.catalystEnv === env);
        // Nhiều công thức dùng chung nguyên liệu (vd. Lò Tinh Luyện): ưu tiên công thức bộ giải chọn theo món người chơi
        // gán cho cổng ra / công thức đã tích, rồi tới công thức làm ra món đã gán cổng, cuối cùng các công thức còn lại
        // (*suy luận* — §2.6 "tự chọn theo đầu vào" không nói gì khi nhiều công thức cùng nhận một đầu vào).
        const chosen = new Set((n.flow?.recipes ?? []).map((r) => r.recipeId));
        if (n.flow?.recipeId) chosen.add(n.flow.recipeId);
        const bound = new Set(Object.entries(n.flow?.outBinding ?? {}).filter(([, v]) => !!v).map(([, v]) => v as string));
        const rank = (r: RecipeDef): number => (chosen.has(r.id) ? 0 : r.outcomes.some((o) => bound.has(o.itemId)) ? 1 : 2);
        // Lò (kho chung): chạy **mọi** công thức đủ nguyên liệu — tính năng của game (người dùng 2026-10-03)
        d.recipes = [...all].sort((a, b) => rank(a) - rank(b));
        d.cur = null; // công thức chạy gần nhất (giữ cho tới khi đổi)
        d.dirty = true; // có thay đổi từ lần thử bắt đầu mẻ trước
        d.free = loopFree.get(n.uid) ?? new Set<string>(); // món vòng hạt giống: thiếu vẫn chạy
        d.cycles = []; // mẻ đang chạy: { recipe, start, end } — lò chạy nhiều công thức song song
        d.freeAt = new Map<string, number>(); // công thức (máy thường: '') rảnh từ lúc nào — mẻ sau không bắt đầu sớm hơn
        d.outAt = 0; // sản phẩm mới nhất vào ô đầu ra lúc nào — không đẩy đi sớm hơn
        d.itemAt = new Map<string, number>(); // món nguyên liệu có trong máy từ lúc nào — mẻ không bắt đầu sớm hơn
        d.fullUntil = new Map<string, number>(); // ô đầy được dùng bớt lúc nào — món mới chỉ vào từ lúc đó
        d.made = new Set<string>(); // món máy này làm ra (được đẩy ra cổng)
        d.act = 0; // khí kích hoạt trong kho
        d.blocked = false;
        d.rr = new Map<PortKey, number>();
        break;
      }
      case 'source': {
        const s = n.m.source;
        d.item = s?.itemId ?? null;
        d.interval = s && s.perMinute > 0 ? 60 / (s.perMinute * Math.max(1, n.m.count)) : Infinity;
        d.next = 0;
        break;
      }
      case 'depotOut':
        d.item = n.flow?.onBus ? (n.m.depotItem ?? null) : null;
        break;
      case 'hub':
        d.portItem = new Map(Object.entries(n.m.binding).filter(([k, v]) => k.startsWith('out') && !!v) as [PortKey, string][]);
        break;
      case 'udpipeOut':
        d.infinite = n.m.infinite && n.m.source?.itemId ? n.m.source.itemId : null;
        break;
      case 'disposal': {
        const spec = DISPOSAL[n.m.machineId]!;
        d.items = new Set(spec.items);
        d.interval = 60 / spec.rate;
        d.lastIn = -Infinity;
        break;
      }
      case 'router': {
        const flows = portFlow(n);
        const ports = activePorts(n.def, n.m.mode);
        const ins = ports.filter((p) => p.dir === 'in').map((p) => `in${p.index}`);
        const inFlow = flows.get(ins[0] ?? '') ?? (0 as Dir4);
        const outs = ports.filter((p) => p.dir === 'out' && !p.virtual).map((p) => `out${p.index}` as PortKey);
        // §2.3: chiều kim đồng hồ bắt đầu từ bên trái hướng hàng vào
        const order = clockwiseFrom(inFlow);
        outs.sort((a, b) => order.indexOf(flows.get(a) ?? 0) - order.indexOf(flows.get(b) ?? 0));
        d.order = outs;
        d.rr = 0;
        d.ins = ins; // van gộp: nhận luân phiên từng nhánh (người dùng 2026-10-03)
        d.turn = 0;
        d.buffer = null as string | null;
        d.filter =
          n.def.type === 'LogConditioner' || n.def.type === 'LogPipeConditioner' ? { item: n.m.filterItem ?? null, rate: n.def.type === 'LogPipeConditioner' ? (n.m.filterRate ?? null) : null } : null;
        d.lastPass = -Infinity;
        break;
      }
      case 'bridge': {
        const ports = activePorts(n.def, n.m.mode);
        const lane = new Map<PortKey, PortKey>();
        for (const pin of ports.filter((p) => p.dir === 'in')) {
          const pout = ports.find((p) => p.dir === 'out' && p.facing === pin.facing);
          if (pout) lane.set(`in${pin.index}`, `out${pout.index}`);
        }
        d.lane = lane;
        d.buffers = new Map<PortKey, { item: string; at: number }>(); // theo cổng ra: món + lúc vào cầu
        d.freeAt = new Map<PortKey, number>(); // kênh trống lại lúc nào
        break;
      }
      case 'generator':
        d.burnEnd = 0; // món đang cháy hết lúc nào (0 = đang tắt)
        d.burnStart = 0;
        d.burnItem = null as string | null;
        d.burnPower = 0; // MW của món đang cháy
        break;
      case 'envgen':
        d.act = 0;
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- giữ trạng thái của mô phỏng trước (map vừa sửa)
  if (prev) {
    const old: SimState = 'state' in prev && typeof prev.state === 'function' ? prev.state() : (prev as SimState);
    now = old.now;
    rot = old.rot;
    sewageIn = old.sewageIn;
    if (!opts.shared && old.depotStock) for (const [k, v] of old.depotStock) depotStock.set(k, v);
    for (const key of Object.keys(totals) as (keyof SimTotals)[]) for (const [k, v] of old.totals[key] ?? []) totals[key].set(k, v);
    for (const n of nodes.values()) {
      const o = old.nodes.get(n.uid);
      if (!o || o.machineId !== n.m.machineId) continue;
      for (const [k, v] of o.store) n.store.set(k, v);
      for (const [k, v] of o.output) n.output.set(k, v);
      Object.assign(n.stats, o.stats);
      for (const [k, v] of Object.entries(o.data)) if (!CONFIG_KEYS.has(k)) n.data[k] = v;
      if (n.kind === 'crafter') n.data.dirty = true;
    }
    const oldLanes = new Map(old.lanes.map((l) => [l.id, l]));
    const same = (a: { uid: number; portKey: string } | null, b: { uid: number; portKey: string } | null): boolean =>
      a === b || (!!a && !!b && a.uid === b.uid && a.portKey === b.portKey);
    for (const l of lanes) {
      const o = oldLanes.get(l.id);
      if (!o || o.kind !== l.kind || !same(o.from, l.from) || !same(o.to, l.to)) continue;
      const keep = o.items.slice(0, l.cap);
      let prevReady = -Infinity;
      for (const it of keep) {
        const ready = Math.max(it.entered + l.travel, prevReady + l.spacing);
        l.items.push({ itemId: it.itemId, entered: it.entered, ready });
        prevReady = ready;
      }
      l.lastIn = o.lastIn;
      l.lastOut = o.lastOut;
      l.delivered = o.delivered;
      l.entered = o.delivered + keep.length;
      l.exits = o.exits.slice(-l.cap);
    }
  }

  const nodeOf = (uid: number): Node | undefined => nodes.get(uid);
  const count = (n: Node): number => Math.max(1, n.m.count);
  const held = (n: Node, item: string): number => n.store.get(item) ?? 0;
  const put = (n: Node, item: string, v: number): void => {
    const x = held(n, item) + v;
    if (x <= EPS) n.store.delete(item);
    else n.store.set(item, x);
  };
  const made = (n: Node, item: string): number => n.output.get(item) ?? 0;
  const putOut = (n: Node, item: string, v: number): void => {
    const x = made(n, item) + v;
    if (x <= EPS) n.output.delete(item);
    else n.output.set(item, x);
  };

  // ---------------------------------------------------------------- máy chế biến
  type Cycle = { recipe: RecipeDef; start: number; end: number };
  const itemsCache = new Map<RecipeDef, Set<string>>();
  const itemsOf = (r: RecipeDef): Set<string> => {
    let v = itemsCache.get(r);
    if (!v) itemsCache.set(r, (v = new Set([...r.ingredients.map((s) => s.itemId), ...r.outcomes.map((s) => s.itemId)])));
    return v;
  };
  const crucibleSlots = (n: Node): number | undefined => CRUCIBLE_PRODUCT_SLOTS[n.def.id];
  /**
   * Lò Mở Rộng / Lò Phản Ứng: **kho chung** — sản phẩm của công thức này làm nguyên liệu cho công thức kia ngay trong lò
   * (như bộ giải: "các tiến trình dùng chung kho máy"), cổng ra đẩy đúng món đã gán (kể cả món đi xuyên). Máy thường:
   * ô đầu vào và ô đầu ra tách riêng.
   */
  const shared = (n: Node): boolean => crucibleSlots(n) !== undefined;
  /** Số công thức chạy song song: máy thường 1; lò theo `CRUCIBLE_LIMITS` (Lò Phản Ứng 1, Lò Mở Rộng không giới hạn). */
  const parallel = (n: Node): number => CRUCIBLE_LIMITS[n.def.id]?.recipes ?? 1;
  const outStore = (n: Node): Map<string, number> => (shared(n) ? n.store : n.output);
  const outHeld = (n: Node, item: string): number => outStore(n).get(item) ?? 0;
  const putProduct = (n: Node, item: string, v: number): void => (shared(n) ? put(n, item, v) : putOut(n, item, v));
  /** Mọi món đang chiếm ô trong máy (đầu vào + đầu ra; khí kích hoạt để riêng). */
  const heldItems = (n: Node): string[] => [...new Set([...n.store.keys(), ...n.output.keys()])];
  const cyclesOf = (n: Node): Cycle[] => n.data.cycles as Cycle[];

  /** §2.2: máy thường chỉ chứa đúng các món của **một** công thức; lò: món nào là nguyên liệu của một công thức là nhận. */
  const crafterAccepts = (n: Node, item: string): boolean => {
    const recipes = n.data.recipes as RecipeDef[];
    if (held(n, item) >= STORE * count(n)) return false;
    if (shared(n)) return recipes.some((r) => r.ingredients.some((s) => s.itemId === item));
    const have = heldItems(n);
    return recipes.some((r) => r.ingredients.some((s) => s.itemId === item) && have.every((h) => itemsOf(r).has(h)));
  };

  const canRun = (n: Node, r: RecipeDef): 'ok' | 'input' | 'output' => {
    const k = count(n);
    if (cyclesOf(n).some((c) => c.recipe === r)) return 'input';
    const free = n.data.free as Set<string>;
    for (const s of r.ingredients) if (held(n, s.itemId) + EPS < s.count * k && !free.has(s.itemId)) return 'input';
    const slots = crucibleSlots(n);
    if (slots === undefined) {
      // còn món của công thức khác trong máy ⇒ không chạy được công thức này
      const items = itemsOf(r);
      if (heldItems(n).some((h) => !items.has(h))) return 'input';
    } else {
      // ô sản phẩm của lò (8 / 5)
      const products = new Set(r.outcomes.map((o) => o.itemId));
      for (const h of n.store.keys()) if ((n.data.made as Set<string>).has(h)) products.add(h);
      if (products.size > slots) return 'output';
    }
    for (const o of r.outcomes) if (outHeld(n, o.itemId) + o.count * k > STORE * k + EPS) return 'output';
    if (n.def.activatorPort && (n.data.act as number) + EPS < r.seconds * ACTIVATOR_PER_SECOND) return 'input';
    return 'ok';
  };

  /** Bắt đầu mẻ lúc `t` nếu được (đủ điện, đủ nguyên liệu, kho sản phẩm còn chỗ) — lò: nhiều công thức song song. */
  const tryStart = (n: Node, t: number): void => {
    const d = n.data;
    if (!n.powered) return;
    // không có gì đổi từ lần thử trước (không nhận thêm món, không đẩy bớt, không xong mẻ) ⇒ kết quả như cũ
    if (!d.dirty) return;
    d.dirty = false;
    const cycles = cyclesOf(n);
    const recipes = d.recipes as RecipeDef[];
    const cur = d.cur as RecipeDef | null;
    // công thức vừa chạy được thử trước (đổi công thức chỉ khi nó không chạy được nữa)
    const order = cur ? [cur, ...recipes.filter((r) => r !== cur)] : recipes;
    let blocked = false;
    for (const r of order) {
      if (cycles.length >= parallel(n)) break;
      const why = canRun(n, r);
      if (why === 'output') blocked = true;
      if (why !== 'ok') continue;
      const k = count(n);
      const free = d.freeAt as Map<string, number>;
      const slot = parallel(n) > 1 ? r.id : '';
      const itemAt = d.itemAt as Map<string, number>;
      const loopItems = d.free as Set<string>;
      const start = Math.max(t, free.get(slot) ?? 0, ...r.ingredients.filter((s) => !loopItems.has(s.itemId)).map((s) => itemAt.get(s.itemId) ?? 0));
      const fullUntil = d.fullUntil as Map<string, number>;
      for (const s of r.ingredients) {
        if (held(n, s.itemId) >= STORE * k - EPS) fullUntil.set(s.itemId, start);
        const use = Math.min(held(n, s.itemId), s.count * k); // món vòng hạt giống có thể thiếu
        put(n, s.itemId, -use);
        add(totals.consumed, s.itemId, use);
      }
      if (n.def.activatorPort) {
        if ((d.act as number) >= STORE * k - EPS) fullUntil.set('#act', start);
        d.act = (d.act as number) - r.seconds * ACTIVATOR_PER_SECOND;
      }
      cycles.push({ recipe: r, start, end: start + r.seconds });
      d.cur = r;
    }
    d.blocked = cycles.length === 0 && blocked;
  };

  const finishCycles = (n: Node, limit: number): void => {
    const d = n.data;
    const cycles = cyclesOf(n);
    for (;;) {
      let next: Cycle | null = null;
      for (const c of cycles) if (c.end <= limit + EPS && (!next || c.end < next.end)) next = c;
      if (!next) return;
      cycles.splice(cycles.indexOf(next), 1);
      (d.freeAt as Map<string, number>).set(parallel(n) > 1 ? next.recipe.id : '', next.end);
      d.outAt = Math.max(d.outAt as number, next.end);
      const k = count(n);
      for (const o of next.recipe.outcomes) {
        putProduct(n, o.itemId, o.count * k);
        if (shared(n)) (d.itemAt as Map<string, number>).set(o.itemId, next.end);
        add(totals.produced, o.itemId, o.count * k);
        (d.made as Set<string>).add(o.itemId);
      }
      n.stats.cycles++;
      d.dirty = true;
      emit(n, next.end, limit);
      tryStart(n, next.end);
    }
  };

  // ---------------------------------------------------------------- đẩy hàng ra
  /** Món cổng ra `key` của máy được đẩy: theo gán cổng của bộ giải; máy thường chưa gán thì mọi món nó làm ra cùng loại. */
  const crafterOutItems = (n: Node, key: PortKey, kind: PortKind): string[] => {
    const bound = n.flow?.outBinding[key];
    if (shared(n)) return bound ? [bound] : [];
    if (bound) {
      // sản phẩm **cũ** còn trong máy (đổi đầu vào ⇒ đổi công thức) không cổng nào gán ⇒ vẫn đẩy ra cổng cùng loại, nếu
      // không nó nằm lì trong ô ra, máy không nhận nguyên liệu mới và kẹt mãi (lỗi người dùng báo 2026-10-03)
      const boundAll = new Set(Object.values(n.flow?.outBinding ?? {}).filter((v): v is string => !!v));
      const left = [...n.output.keys()].filter((i) => !boundAll.has(i) && kindOfItem(ds, i) === kind);
      return [bound, ...left];
    }
    return [...(n.data.made as Set<string>)].filter((i) => kindOfItem(ds, i) === kind);
  };

  /** Đẩy món trong kho ra các tuyến ra, từ lúc `t` tới `limit`. */
  function emit(n: Node, t: number, limit: number): void {
    if (n.off) return; // máy đã tắt giữ nguyên hàng trong kho
    const d = n.data;
    switch (n.kind) {
      case 'crafter': {
        t = Math.max(t, d.outAt as number);
        if (t > limit + EPS) return;
        if (outStore(n).size === 0) {
          tryStart(n, t);
          return;
        }
        // nhiều cổng ra cùng nối đi: chia **luân phiên từng món** cho các cổng như van tách (người dùng 2026-10-06 — trước
        // đây cổng đầu nhận hết tới khi băng đầy, mà băng chở được cả 30/phút nên cổng kia không bao giờ có hàng)
        const lanes = [...n.outs].map(([key, lane]) => ({ key, lane, opts: crafterOutItems(n, key, lane.kind) })).filter((x) => x.opts.length > 0);
        const rr = d.rr as Map<PortKey, number>;
        let turn = (d.portTurn as number | undefined) ?? 0;
        const done = new Set<number>();
        for (let tries = 0; tries < 64 * Math.max(1, lanes.length) && done.size < lanes.length; tries++) {
          const k = turn % lanes.length;
          turn++;
          if (done.has(k)) continue;
          const { key, lane, opts } = lanes[k]!;
          const avail = opts.filter((x) => outHeld(n, x) >= 1 - EPS);
          if (avail.length === 0) {
            done.add(k);
            continue;
          }
          const i = rr.get(key) ?? 0;
          const item = avail[i % avail.length]!;
          if (lane.push(item, t, limit) === null) {
            done.add(k);
            continue;
          }
          putProduct(n, item, -1);
          d.dirty = true;
          rr.set(key, i + 1);
        }
        d.portTurn = lanes.length > 0 ? turn % lanes.length : 0;
        // lấy bớt sản phẩm ra có thể làm máy chạy lại được
        tryStart(n, t);
        return;
      }
      case 'source':
      case 'sewageOut':
      case 'udpipeOut': {
        t = Math.max(t, (d.outAt as number | undefined) ?? 0);
        if (t > limit + EPS) return;
        const infinite = n.kind === 'udpipeOut' ? (d.infinite as string | null) : null;
        for (const lane of n.outs.values()) {
          for (let tries = 0; tries < 64; tries++) {
            const item = infinite ?? [...n.store.keys()].find((x) => held(n, x) >= 1 - EPS && kindOfItem(ds, x) === lane.kind);
            if (!item || kindOfItem(ds, item) !== lane.kind) break;
            if (lane.push(item, t, limit) === null) break;
            if (!infinite) put(n, item, -1);
          }
        }
        return;
      }
      case 'depotOut': {
        const item = d.item as string | null;
        if (!item) return;
        for (const lane of n.outs.values()) {
          if (kindOfItem(ds, item) !== lane.kind) continue;
          for (let tries = 0; tries < 64; tries++) {
            if (!depotHas(item) || lane.push(item, t, limit) === null) break;
            depotAdd(item, -1);
          }
        }
        return;
      }
      case 'hub': {
        for (const [key, item] of d.portItem as Map<PortKey, string>) {
          const lane = n.outs.get(key);
          if (!lane || kindOfItem(ds, item) !== lane.kind) continue;
          for (let tries = 0; tries < 64; tries++) {
            if (!depotHas(item) || lane.push(item, t, limit) === null) break;
            depotAdd(item, -1);
          }
        }
        return;
      }
      case 'router':
        routerFlush(n, t, limit);
        return;
      case 'bridge': {
        const buf = d.buffers as Map<PortKey, { item: string; at: number }>;
        for (const [key, b] of buf) {
          const lane = n.outs.get(key);
          const te = lane ? lane.push(b.item, Math.max(t, b.at), limit) : null;
          if (te !== null) {
            buf.delete(key);
            (d.freeAt as Map<PortKey, number>).set(key, te);
          }
        }
        return;
      }
      default:
        return;
    }
  }

  /**
   * Van: giữ 1 món, đẩy sang cổng ra kế tiếp theo chiều kim đồng hồ còn nhận (§2.3). Cổng ra **kề thẳng một máy chế
   * biến** (tuyến 0 ô) chỉ được dùng khi mọi cổng ra có băng khác đều đầy.
   */
  function routerFlush(n: Node, t: number, limit: number): void {
    const d = n.data;
    const item = d.buffer as string | null;
    if (!item) return;
    const order = (d.order as PortKey[]).filter((k) => n.outs.has(k));
    if (order.length === 0) return;
    const filter = d.filter as { item: string | null; rate: number | null } | null;
    let at = Math.max(t, (d.bufAt as number | undefined) ?? 0);
    if (at > limit + EPS) return;
    if (filter?.rate) {
      // Cảng Kiểm Soát Ống có giới hạn lưu lượng: món sau cách món trước ít nhất 60 / rate giây
      at = Math.max(at, (d.lastPass as number) + 60 / filter.rate);
      if (at > limit + EPS) return;
    }
    const start = d.rr as number;
    const rotated = order.map((_, i) => order[(start + i) % order.length]!);
    const direct = (k: PortKey): boolean => {
      const lane = n.outs.get(k)!;
      return lane.length === 0 && !!lane.to && nodeOf(lane.to.uid)?.kind === 'crafter';
    };
    // cổng kề thẳng máy chỉ được thử khi mọi tuyến có băng khác đã **đầy** (chưa đầy mà chưa nhận kịp thì van chờ)
    const belts = rotated.filter((k) => !direct(k));
    const allFull = belts.every((k) => n.outs.get(k)!.items.length >= n.outs.get(k)!.cap);
    const tries = allFull ? [...belts, ...rotated.filter(direct)] : belts;
    for (const k of tries) {
      const lane = n.outs.get(k)!;
      const te = lane.push(item, at, limit);
      if (te === null) continue;
      d.buffer = null;
      d.lastPass = te;
      d.freeAt = te;
      d.rr = (order.indexOf(k) + 1) % order.length;
      return;
    }
  }

  // ---------------------------------------------------------------- nhận hàng
  /** Từ lúc nào máy `n` có chỗ cho món `item` ở cổng `key` (0 = không ràng buộc). */
  function spaceAt(n: Node, key: PortKey, item: string): number {
    const d = n.data;
    switch (n.kind) {
      case 'crafter':
        return (d.fullUntil as Map<string, number>).get(key === n.def.activatorPort ? '#act' : item) ?? 0;
      case 'router':
        return (d.freeAt as number | undefined) ?? 0;
      case 'bridge': {
        const out = (d.lane as Map<PortKey, PortKey>).get(key);
        return out ? ((d.freeAt as Map<PortKey, number>).get(out) ?? 0) : 0;
      }
      default:
        return 0;
    }
  }

  /** Máy `n` nhận món `item` ở cổng `key` lúc `t`? */
  function accept(n: Node, key: PortKey, item: string, t: number, limit: number): boolean {
    if (n.off) return false; // máy đã tắt không nhận gì — tuyến vào ứ lại
    const d = n.data;
    switch (n.kind) {
      case 'crafter': {
        if (key === n.def.activatorPort) {
          if ((d.act as number) >= STORE * count(n)) return false;
          d.act = (d.act as number) + 1;
          d.dirty = true;
          tryStart(n, t);
          return true;
        }
        if (!crafterAccepts(n, item)) return false;
        put(n, item, 1);
        d.dirty = true;
        (d.itemAt as Map<string, number>).set(item, t);
        tryStart(n, t);
        return true;
      }
      case 'depotIn':
        if (!n.flow?.onBus || !depotRoom(item)) return false;
        depotAdd(item, 1);
        return true;
      case 'hub':
        if (!depotRoom(item)) return false;
        depotAdd(item, 1);
        return true;
      case 'sink':
        // Kho Lưu Trữ Giao Thức: hàng rắn vào đây = nạp vào kho tổng (người dùng 2026-10-04)
        if (n.m.machineId === DEPOT_STASH && kindOfItem(ds, item) === 'belt') {
          if (!depotRoom(item)) return false;
          depotAdd(item, 1);
          return true;
        }
        add(totals.stored, item, 1);
        return true;
      case 'disposal': {
        if (!(d.items as Set<string>).has(item)) return false;
        if (t < (d.lastIn as number) + (d.interval as number) - EPS) return false;
        d.lastIn = t;
        add(totals.disposed, item, 1);
        if (n.m.machineId === SEWAGE.inlet) sewageIn++;
        return true;
      }
      case 'udpipeIn': {
        const pair = n.m.pairTarget != null ? nodeOf(n.m.pairTarget) : undefined;
        if (!pair || pair.kind !== 'udpipeOut') return false;
        let total = 0;
        for (const v of pair.store.values()) total += v;
        if (total >= STORE) return false;
        put(pair, item, 1);
        pair.data.outAt = Math.max((pair.data.outAt as number | undefined) ?? 0, t);
        emit(pair, t, limit);
        return true;
      }
      case 'router': {
        if (d.buffer) return false;
        const filter = d.filter as { item: string | null } | null;
        if (filter?.item && filter.item !== item) return false; // món khác ⇒ kẹt cả tuyến vào
        const ins = d.ins as PortKey[];
        if (ins.length > 1) {
          // van gộp: tới lượt nhánh khác mà nhánh đó đang có hàng chờ ⇒ nhánh này đợi
          const turn = d.turn as number;
          for (let i = 0; i < ins.length; i++) {
            const k = ins[(turn + i) % ins.length]!;
            if (k === key) break;
            const lane = inLanes.get(n.uid)?.get(k);
            const ht = lane?.headTime();
            if (ht != null && ht <= t + EPS) return false;
          }
          d.turn = (ins.indexOf(key) + 1) % ins.length;
        }
        d.buffer = item;
        d.bufAt = t;
        routerFlush(n, t, limit);
        return true;
      }
      case 'bridge': {
        const out = (d.lane as Map<PortKey, PortKey>).get(key);
        const buf = d.buffers as Map<PortKey, { item: string; at: number }>;
        if (!out || buf.has(out)) return false;
        buf.set(out, { item, at: t });
        emit(n, t, limit);
        return true;
      }
      case 'generator': {
        const fuel = ds.items.get(item)?.fuel;
        if (!fuel || held(n, item) >= STORE) return false;
        put(n, item, 1);
        return true;
      }
      case 'envgen':
        if ((d.act as number) >= STORE) return false;
        d.act = (d.act as number) + 1;
        return true;
      default:
        return false;
    }
  }

  // ---------------------------------------------------------------- một bước
  /** Trạm điện: châm món nhiên liệu kế tiếp lúc `t` nếu đang tắt và còn nhiên liệu. */
  const ignite = (n: Node, t: number): void => {
    const d = n.data;
    if ((d.burnEnd as number) > t + EPS) return;
    // trạm điện đã tắt: không đốt thêm (nhiên liệu đang cháy dở cháy nốt)
    const fuel = n.m.off ? undefined : [...n.store.keys()].find((x) => held(n, x) >= 1 && ds.items.get(x)?.fuel);
    if (!fuel) {
      d.burnItem = null;
      d.burnPower = 0;
      return;
    }
    const f = ds.items.get(fuel)!.fuel!;
    put(n, fuel, -1);
    add(totals.burned, fuel, 1);
    d.burnItem = fuel;
    d.burnStart = t;
    d.burnEnd = t + f.seconds;
    d.burnPower = f.power * count(n);
  };
  const powerDemand = (): number => (enforcePower ? result.powerDraw : 0);
  const powerSupply = (): number => {
    let gen = result.powerBase;
    for (const n of nodes.values()) if (n.kind === 'generator' && (n.data.burnEnd as number) > now + EPS) gen += (n.data.burnPower as number) || 0;
    return gen;
  };

  const step = (dt = DT): void => {
    const t0 = now;
    const t1 = now + dt;
    // 0. điện: trạm điện châm pin, rồi so điện phát với điện cần (nhóm tab: `SimWorld` đã tính cho cả nhóm)
    for (const n of nodes.values()) if (n.kind === 'generator') ignite(n, t0);
    if (!opts.shared) blackout = enforcePower && powerDemand() > powerSupply() + EPS;
    else blackout = opts.shared.blackout;
    for (const n of nodes.values()) n.powered = !n.needsPower || (n.inRange && !blackout);
    // 1. sản xuất / tiêu hao trong máy
    for (const n of nodes.values()) {
      const d = n.data;
      switch (n.kind) {
        case 'crafter': {
          if (!n.powered) {
            // mất điện ⇒ mẻ đang chạy đứng yên (lùi mốc kết thúc theo thời gian mất điện)
            for (const c of cyclesOf(n)) {
              c.start += dt;
              c.end += dt;
            }
            break;
          }
          finishCycles(n, t1);
          tryStart(n, t0);
          finishCycles(n, t1);
          break;
        }
        case 'source': {
          const item = d.item as string | null;
          if (!item || !n.powered) break;
          let next = Math.max(d.next as number, t0);
          while (next <= t1 + EPS && held(n, item) < STORE * count(n)) {
            put(n, item, 1);
            add(totals.produced, item, 1);
            d.outAt = next;
            next += d.interval as number;
          }
          d.next = held(n, item) >= STORE * count(n) ? t1 : next;
          break;
        }
        case 'sewageOut': {
          while (sewageIn >= SEWAGE.ratio && held(n, SEWAGE.output) < STORE) {
            sewageIn -= SEWAGE.ratio;
            d.outAt = t1;
            put(n, SEWAGE.output, 1);
            add(totals.produced, SEWAGE.output, 1);
          }
          break;
        }
        case 'generator': {
          // đốt pin nối tiếp nhau: hết một món thì châm món kế (điện của bước sau tính theo món đang cháy)
          while ((d.burnEnd as number) > 0 && (d.burnEnd as number) <= t1 + EPS && (d.burnItem as string | null)) {
            const end = d.burnEnd as number;
            d.burnEnd = 0;
            ignite(n, end);
            if ((d.burnEnd as number) === 0) break;
          }
          break;
        }
        case 'envgen': {
          const use = Math.min(d.act as number, ACTIVATOR_PER_SECOND * dt);
          d.act = (d.act as number) - use;
          break;
        }
        default:
          break;
      }
    }
    // 2. đẩy hàng ra tuyến
    for (const n of nodes.values()) emit(n, t0, t1);
    // 3. hàng tới cuối tuyến vào máy kế tiếp (lặp vài vòng để hàng đi qua van trong cùng bước)
    const nLanes = lanes.length;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let j = 0; j < nLanes; j++) {
        const lane = lanes[(j + rot) % nLanes]!;
        if (!lane.to) continue;
        const dst = nodeOf(lane.to.uid)!;
        for (;;) {
          const td = lane.headTime();
          if (td === null || td > t1 + EPS) break;
          const head = lane.items[0]!;
          // máy đích chỉ nhận từ lúc nó thật sự có chỗ (van vừa đẩy món trước đi, kho máy vừa dùng bớt…)
          const at = Math.max(td, t0, spaceAt(dst, lane.to.portKey, head.itemId));
          if (at > t1 + EPS) break;
          if (!accept(dst, lane.to.portKey, head.itemId, at, t1)) break;
          lane.shift(at);
          moved = true;
        }
      }
      if (!moved) break;
      for (const n of nodes.values()) if (n.kind === 'router' || n.kind === 'bridge') emit(n, t0, t1);
    }
    rot = nLanes > 0 ? (rot + 1) % nLanes : 0;
    // 4. thống kê thời gian
    for (const n of nodes.values()) {
      if (n.kind !== 'crafter') continue;
      if (!n.powered) n.stats.unpowered += dt;
      else if (cyclesOf(n).length > 0) n.stats.running += dt;
      else if (n.data.blocked) n.stats.blocked += dt;
      else n.stats.idle += dt;
    }
    now = t1;
  };

  return {
    get now() {
      return now;
    },
    state(): SimState {
      const ns = new Map<number, SimNodeState>();
      for (const n of nodes.values()) {
        const data: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(n.data)) if (!CONFIG_KEYS.has(k)) data[k] = v;
        ns.set(n.uid, { machineId: n.m.machineId, store: n.store, output: n.output, stats: n.stats, data });
      }
      return {
        now,
        rot,
        sewageIn,
        depotStock,
        totals,
        nodes: ns,
        lanes: lanes.map((l) => ({
          id: l.id,
          kind: l.kind,
          from: l.from,
          to: l.to,
          items: l.items,
          lastIn: l.lastIn,
          lastOut: l.lastOut,
          delivered: l.delivered,
          exits: l.exits,
        })),
      };
    },
    lanes,
    totals,
    step,
    enforcePower,
    stepTo(t: number): void {
      step(t - now);
      now = t;
    },
    beginStep(): void {
      for (const n of nodes.values()) if (n.kind === 'generator') ignite(n, now);
    },
    powerDemand,
    powerSupply,
    clearSlot(uid, item, side) {
      const n = nodes.get(uid);
      if (!n) return 0;
      const map = side === 'out' && !shared(n) ? n.output : n.store;
      const had = map.get(item) ?? 0;
      if (had <= 0) return 0;
      map.delete(item);
      if (n.kind === 'crafter') {
        (n.data.fullUntil as Map<string, number>).delete(item);
        n.data.dirty = true;
        n.data.blocked = false;
      }
      return had;
    },
    run(seconds: number, dt = DT): void {
      const end = now + seconds;
      while (now < end - EPS) step(Math.min(dt, end - now));
    },
    machine(uid, at = now) {
      const n = nodes.get(uid);
      if (!n) return undefined;
      const c = (n.data.cycles as Cycle[] | undefined)?.[0];
      const burnEnd = (n.data.burnEnd as number | undefined) ?? 0;
      const burning =
        n.kind === 'generator' && burnEnd > now + EPS && n.data.burnItem
          ? {
              itemId: n.data.burnItem as string,
              power: (n.data.burnPower as number) || 0,
              progress: Math.max(0, Math.min(1, (at - (n.data.burnStart as number)) / Math.max(EPS, burnEnd - (n.data.burnStart as number)))),
              remaining: Math.max(0, burnEnd - at),
            }
          : null;
      return {
        kind: n.kind,
        store: n.store,
        output: n.output,
        stats: n.stats,
        recipeId: (n.data.cur as RecipeDef | null | undefined)?.id ?? null,
        progress: c ? Math.max(0, Math.min(1, (at - c.start) / (c.end - c.start))) : null,
        state: !n.powered ? 'unpowered' : c || burning ? 'running' : n.data.blocked ? 'blocked' : 'idle',
        activator: n.def.activatorPort || n.kind === 'envgen' ? ((n.data.act as number | undefined) ?? 0) : null,
        cycles: ((n.data.cycles as Cycle[] | undefined) ?? []).map((x) => ({
          recipeId: x.recipe.id,
          progress: Math.max(0, Math.min(1, (at - x.start) / (x.end - x.start))),
          remaining: Math.max(0, x.end - at),
        })),
        shared: n.kind === 'crafter' && CRUCIBLE_PRODUCT_SLOTS[n.def.id] !== undefined,
        burning,
      };
    },
    machines: () => [...nodes.keys()],
  };
}

/** Món mỗi phút một tuyến chở được — tiện cho bảng tổng hợp. */
export const lanePerMinute = (kind: PortKind): number => PER_MINUTE[kind];
