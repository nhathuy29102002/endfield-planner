import { kindOfItem, phaseOf } from '../model/dataset';
import { CRUCIBLE_IN, crucibleBeltOuts, crucibleCandidates, crucibleRun, isCrucible } from './crucible';
import { roleOf } from '../model/roles';
import type { CatalystEnv, Dataset, MachineDef, Phase, RecipeDef } from '../model/types';
import { tr } from '../i18n';

/**
 * Sơ đồ **Modeler** (kiểu Satisfactory Modeler, người dùng 2026-09-29): chỉ tính toán, không có lưới.
 *
 * - **Nút** = một máy + một công thức, hoặc một máy "chọn vật phẩm" (máy nguồn, kho, máy xử lý, máy khuếch
 *   tán — xem `nodeKind`). Cổng của nút = nguyên liệu (vào) và sản phẩm (ra), **mỗi
 *   vật phẩm một cổng**; mặc định vào bên trái, ra bên phải, người dùng đổi được mặt đặt từng cổng.
 * - **Đường nối** = cổng ra của nút này → cổng vào **cùng vật phẩm** của nút khác; uốn được bằng cách kéo
 *   điểm giữa. Cổng **chất kích hoạt** là một cổng vào riêng (`slot: 'act'`); **môi trường** của máy khuếch
 *   tán đi bằng một "vật phẩm" giả `@env:<môi trường>`. Đường ống giới hạn được lưu lượng (`MEdge.limit`, thay
 *   cho Cảng Kiểm Soát Ống — người dùng 2026-09-29).
 * - Hai ô số dưới nút: **dưới** = số máy tối đa được dùng (thập phân, trống = không giới hạn); **trên** =
 *   phần máy thực sự sản xuất, hiện theo %.
 */
export type Side = 'left' | 'right' | 'top' | 'bottom';
export const SIDES: Side[] = ['left', 'top', 'right', 'bottom'];

export interface MNode {
  id: string;
  machineId: string;
  /** Máy chế biến: công thức. Máy khác: `null` (xem `item`). */
  recipeId: string | null;
  /**
   * Máy "chọn vật phẩm": máy nguồn = vật phẩm lấy ra; kho / máy xử lý = vật phẩm nhận vào; máy khuếch tán =
   * khí kích hoạt.
   */
  item?: string;
  /** Góc trên-trái trên sơ đồ (px của sơ đồ). */
  x: number;
  y: number;
  /** Ô dưới: số máy tối đa được dùng; `null` = không giới hạn. */
  limit: number | null;
  /** Mặt đặt cổng đã đổi, theo khoá cổng (`in:item` / `out:item` / `act:item`). */
  sides?: Record<string, Side>;
  /** Thứ tự cổng trên mỗi mặt (người dùng giữ chuột kéo cổng quanh nút) — khoá cổng, trước đứng trước. */
  order?: string[];
  /** Lò phản ứng: công thức đã tick (được xếp chạy trước, như bên Map). */
  ticks?: string[];
  /**
   * Lò phản ứng: vật phẩm được chọn làm **đầu ra** — bấm vào vật phẩm để đổi (người dùng 2026-09-29): chất
   * lỏng/khí bình thường → **vàng** → **cam** → bình thường; vật phẩm băng bình thường → **đen** → bình thường.
   * Mỗi màu một vật phẩm (2 cổng ống ra + 1 loại hàng băng ra).
   */
  outs?: Partial<Record<SlotColor, string>>;
}

/** Màu khung của vật phẩm đầu ra trong lò: vàng / cam = hai cổng ống ra, đen = hàng băng ra. */
export type SlotColor = 'yellow' | 'orange' | 'black';

/** Một đầu đường nối. `slot: 'act'` = cổng chất kích hoạt (không phải nguyên liệu của công thức). */
export interface MEnd {
  node: string;
  item: string;
  slot?: 'act';
}

export interface MEdge {
  id: string;
  from: MEnd;
  to: MEnd;
  /**
   * **Cũ** (trước 2026-09-30): độ lệch của một điểm uốn duy nhất ở giữa đường. Sơ đồ cũ vẫn đọc được — lần đầu
   * uốn lại thì đổi thành một điểm neo trong `points`.
   */
  bend?: { dx: number; dy: number };
  /**
   * Điểm neo (px của sơ đồ, theo thứ tự từ cổng ra tới cổng vào): đường cong đi qua lần lượt từng điểm
   * (`route.ts`). Nắm đường ở đâu kéo ở đó ⇒ thêm điểm neo (người dùng 2026-09-30).
   */
  points?: { x: number; y: number }[];
  /**
   * Đường ống: lưu lượng tối đa mỗi phút (6, 12 … 60; không có = một ống) — bấm icon trên đường để chỉnh,
   * thay cho Cảng Kiểm Soát Ống (người dùng 2026-09-29).
   * Đường vào **cổng chất kích hoạt** (người dùng 2026-10-04): không có (`undefined`) = **Tự động** — đúng số máy × 6/phút
   * (`isAutoAct`); `null` = không giới hạn (máy xin tới 30/phút mỗi máy như luật 2026-09-30); số = giới hạn tay.
   */
  limit?: number | null;
}

export interface ModelerDoc {
  version: 1;
  nodes: MNode[];
  edges: MEdge[];
  /** Vị trí nhìn: dịch + zoom. */
  view?: { x: number; y: number; zoom: number };
  /** Nét vẽ tay + chữ viết bằng bút vẽ (người dùng 2026-09-30) — chỉ để ghi chú, không tham gia tính toán. */
  drawings?: MDrawing[];
  /** Nét vẽ / chữ đang ẩn (nút con mắt, người dùng 2026-10-02) — lưu theo sơ đồ. */
  inkHidden?: boolean;
}

/**
 * Một nét bút / một ô chữ trên sơ đồ (px của sơ đồ). `width` = độ dày nét; với chữ, cỡ chữ suy từ độ dày
 * (`inkTextSize`).
 */
export type MDrawing =
  | { id: string; kind: 'stroke'; color: string; width: number; /** x0, y0, x1, y1, … */ points: number[] }
  | { id: string; kind: 'text'; color: string; width: number; x: number; y: number; text: string }
  /** Khung chữ nhật (chỉ viền), nằm **dưới** các máy — người dùng 2026-10-02. */
  | { id: string; kind: 'rect'; color: string; width: number; x: number; y: number; w: number; h: number };

/** Bảng chọn máy bên trái bấm khi đang ở tab Modeler: `detail` = id máy (`ui/palette.ts` ⇒ `modeler/view.ts`). */
export const MODELER_PICK = 'efp:modeler-pick';
/** Kéo một máy từ bảng chọn thả lên sơ đồ (người dùng 2026-10-02): `detail` = máy + toạ độ màn hình chỗ thả. */
export const MODELER_DROP = 'efp:modeler-drop';
/**
 * Máy vừa chọn ở bảng chọn máy đang **bám theo con trỏ** chờ đặt trên sơ đồ Modeler đổi (vừa cầm / vừa đặt / vừa huỷ) —
 * bảng chọn máy tô sáng máy đó và bấm lại vào nó thì thôi cầm (người dùng 2026-10-05). Đọc bằng `modelerHolding()`.
 */
/** Thêm một sơ đồ (vd. Model hoá từ Thư viện công thức) vào tab Modeler đang mở; các nút mới được chọn. `detail` = `ModelerDoc`. */
export const MODELER_INSERT_EVENT = 'efp:modeler-insert';
export const MODELER_HOLD_EVENT = 'efp:modeler-hold';
let holding: string | null = null;
export const modelerHolding = (): string | null => holding;
export function setModelerHolding(id: string | null): void {
  if (id === holding) return;
  holding = id;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MODELER_HOLD_EVENT));
}
export interface ModelerDrop {
  machineId: string;
  clientX: number;
  clientY: number;
}

export const emptyModeler = (): ModelerDoc => ({ version: 1, nodes: [], edges: [] });

export const newId = (p: string): string => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export interface MPort {
  key: string;
  dir: 'in' | 'out';
  item: string;
  /** Cổng chất kích hoạt. */
  slot?: 'act';
  /** Lò phản ứng: màu khung của vật phẩm đầu ra (vàng / cam / đen). */
  color?: SlotColor;
  /** Số lượng mỗi chu kỳ (máy chế biến). */
  count: number;
  side: Side;
}

// ------------------------------------------------------------------ môi trường (vật phẩm giả)
/** "Vật phẩm" môi trường đi trên đường nối máy khuếch tán → máy cần môi trường. */
export const envItem = (env: CatalystEnv): string => `@env:${env}`;
export const isEnvItem = (item: string): boolean => item.startsWith('@env:');
export const envOf = (item: string): CatalystEnv => item.slice(5) as CatalystEnv;

/** Khoá cổng của một đầu đường nối. */
export const fromKey = (e: MEdge): string => `out:${e.from.item}`;
export const toKey = (e: MEdge): string => (e.to.slot === 'act' ? `act:${e.to.item}` : `in:${e.to.item}`);
/** Tách khoá cổng: `act:` là cổng vào chất kích hoạt. */
export function parseKey(key: string): { dir: 'in' | 'out'; item: string; slot?: 'act' } {
  const [head, item] = key.split(/:(.*)/s) as [string, string];
  if (head === 'act') return { dir: 'in', item, slot: 'act' };
  return { dir: head === 'out' ? 'out' : 'in', item };
}

// ------------------------------------------------------------------ loại nút
/**
 * - `crafter`  — máy chạy công thức (+ cổng chất kích hoạt với Máy Chuyển Hóa, + cổng môi trường khi công
 *   thức cần môi trường xúc tác).
 * - `source`   — máy tạo sản phẩm thô: lấy một vật phẩm từ kho, vô hạn (1 máy = một tuyến: băng 30, ống 120).
 * - `sink`     — kho (Bể Chứa Khí / Chất Lỏng, Kho Lưu Trữ, Máy Nâng Hàng Kho: đưa thẳng vào kho tổng) và máy
 *   xử lý (Bộ Xử Lý Nước Thải: xoá 3 loại chất thải; Cửa Nạp Nước Thải: nhận nước thải).
 * - `env`      — Máy Khuếch Tán: cắm Khí Trơ / Khí Axit (chất kích hoạt) ⇒ đưa môi trường tới máy cần.
 * - `sewageOut`— Cửa Xả Phụ Phẩm: cứ 30 nước thải vào mọi Cửa Nạp Nước Thải ⇒ đẩy ra 1 Xircon Thải.
 * (người dùng 2026-09-29)
 */
export type NodeKind = 'crafter' | 'crucible' | 'source' | 'sink' | 'env' | 'sewageOut';

/**
 * Máy **tạo sản phẩm thô**: Máy Bơm Chống Ăn Mòn Mk II = lỏng, Máy Tách Khí = khí, Máy Dỡ Hàng Kho = rắn;
 * Cửa Xả Ống Dẫn (+ Ống Dẫn Dòng Ra) = lỏng / khí.
 */
const SOURCE_PHASES: Record<string, Phase[]> = {
  pump_1: ['liquid'],
  pump_2: ['liquid'],
  gas_pump_1: ['gas'],
};
/**
 * Giới hạn vật phẩm của từng máy nguồn (người dùng 2026-10-02): Máy Bơm Chất Lỏng giống Máy Bơm Chống Ăn Mòn nhưng
 * **không** bơm được Axit; Máy Tách Khí chỉ lấy **Khí Trơ** và **Khí Xiranite**.
 */
const SOURCE_FILTER: Record<string, (itemId: string) => boolean> = {
  pump_1: (i) => i !== 'item_liquid_acid',
  gas_pump_1: (i) => i === 'item_gas_inert' || i === 'item_gas_xiranite',
};

/** Kho và máy xử lý: nhận vật phẩm nào, bao nhiêu mỗi máy mỗi phút, có tính là "vào kho tổng" không. */
export const SINKS: Record<string, { phases?: Phase[]; items?: string[]; rate: number; store: boolean; tank?: boolean }> = {
  // Bể Chứa Khí / Chất Lỏng: chỉ **chứa** — khí / chất lỏng không vào được kho tổng (người dùng 2026-10-02)
  gas_storager_1: { phases: ['gas'], rate: 120, store: false, tank: true },
  liquid_storager_1: { phases: ['liquid'], rate: 120, store: false, tank: true },
  storager_1: { phases: ['solid'], rate: 90, store: true },
  loader_1: { phases: ['solid'], rate: 30, store: true },
  // Bộ Xử Lý Nước Thải: 3 "công thức" xoá chất thải, tổng 30/phút mỗi máy (như `DISPOSAL` của bản vẽ lưới)
  liquid_cleaner_1: { items: ['item_liquid_xiranite_poly', 'item_liquid_xiranite_lowpoly', 'item_liquid_sewage'], rate: 30, store: false },
  // Cửa Nạp Nước Thải: chỉ nhận nước thải, tới một ống
  liquid_clean_gate_1: { items: ['item_liquid_sewage'], rate: 120, store: false },
};

/** Cửa Xả Phụ Phẩm: `ratio` nước thải vào các cửa nạp ⇒ 1 `output`. Chỉ một trên sơ đồ (như trên map). */
export const SEWAGE_OUT = { machine: 'liquid_recycle_gate_1', inlet: 'liquid_clean_gate_1', output: 'item_liquid_xiranite_poly', ratio: 30 };

/** Máy khuếch tán: khí kích hoạt được nhận ⇒ môi trường tạo ra (người dùng: Khí Trơ hoặc Khí Axit). */
export const ENV_MACHINE = 'vaporizer_1';
export const ENV_GASES: Record<string, CatalystEnv> = { item_gas_inert: 'Stable', item_gas_acid: 'Acid' };

/** Máy cần chất kích hoạt (công thức không ghi) — người dùng 2026-09-29. */
export const ACTIVATOR: Record<string, string[]> = {
  transmuter_1: ['item_liquid_xiranite'], // Máy Chuyển Hóa Khí Lỏng — Xiranite Lỏng
  transmuter_2: ['item_gas_xiranite'], // Máy Chuyển Hóa Khí Rắn — Khí Xiranite
  vaporizer_1: Object.keys(ENV_GASES), // Máy Khuếch Tán — Khí Trơ / Khí Axit
};
/** Chất kích hoạt: đủ 6/phút mỗi máy là chạy 100 %; nhận và tiêu thụ tới 30/phút mỗi máy. */
export const ACT_NEED = 6;
export const ACT_MAX = 30;

/** Giới hạn lưu lượng của một đường ống (thay Cảng Kiểm Soát Ống): chia hết cho 6, tới 60 /phút. */
export const EDGE_RATES = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60];

/**
 * Đường vào cổng chất kích hoạt đang ở chế độ **Tự động** (người dùng 2026-10-04: "tự tính lưu lượng cần để kích hoạt
 * máy — nhiều máy thì N × 6"): chở đúng 6/phút × số máy thật (làm tròn lên). Mặc định của mọi đường kích hoạt, kể cả
 * sơ đồ cũ chưa đặt giới hạn.
 */
export const isAutoAct = (e: MEdge): boolean => e.to.slot === 'act' && e.limit === undefined;

/**
 * Kho / bể có **cổng ra** cùng vật phẩm với cổng vào (người dùng 2026-10-04): hàng vào rồi **chuyển tiếp** ra cổng
 * ra theo nhu cầu phía sau; phần không ai lấy mới tính là cất vào kho tổng / chứa trong bể.
 */
export const PASS_SINKS = new Set(['storager_1', 'gas_storager_1', 'liquid_storager_1']);

export function nodeKind(def: MachineDef): NodeKind | null {
  if (isCrucible(def.id)) return 'crucible';
  if (SOURCE_PHASES[def.id]) return 'source';
  const role = roleOf(def);
  if (role === 'depotOut' || role === 'udpipeOut') return 'source';
  if (SINKS[def.id]) return 'sink';
  if (def.id === ENV_MACHINE) return 'env';
  if (def.id === SEWAGE_OUT.machine) return 'sewageOut';
  return null;
}
export const kindOfNode = (ds: Dataset, n: MNode): NodeKind => {
  const def = ds.machines.get(n.machineId);
  return (def && nodeKind(def)) ?? 'crafter';
};

/** Thể vật phẩm một máy nguồn được lấy ra; `null` = không phải máy nguồn. */
export function sourcePhases(def: MachineDef): Phase[] | null {
  const fixed = SOURCE_PHASES[def.id];
  if (fixed) return fixed;
  const role = roleOf(def);
  if (role === 'depotOut') return ['solid'];
  if (role === 'udpipeOut') return ['liquid', 'gas'];
  return null;
}

/** Máy nguồn nguyên liệu thô trên sơ đồ (chọn một vật phẩm, không có công thức). */
export const isSourceMachine = (def: MachineDef): boolean => sourcePhases(def) !== null;

/** Máy "chọn vật phẩm" (không chạy công thức): nguồn, kho / xử lý, khuếch tán. */
export const choosesItem = (def: MachineDef): boolean => {
  const k = nodeKind(def);
  return k === 'source' || k === 'sink' || k === 'env';
};

/** Vật phẩm máy `def` chọn được (máy nguồn: lấy ra; kho / xử lý: nhận; khuếch tán: khí). */
export const sourceItemsFor = (ds: Dataset, def: MachineDef): string[] => {
  const k = nodeKind(def);
  const all = [...ds.items.values()].map((i) => i.id);
  if (k === 'source') {
    const phases = sourcePhases(def) ?? [];
    const ok = SOURCE_FILTER[def.id] ?? (() => true);
    return all.filter((i) => phases.includes(phaseOf(ds, i)) && ok(i));
  }
  if (k === 'sink') {
    const s = SINKS[def.id]!;
    return s.items ? [...s.items] : all.filter((i) => s.phases!.includes(phaseOf(ds, i)));
  }
  if (k === 'env') return Object.keys(ENV_GASES);
  return [];
};

/** Máy đặt được lên sơ đồ: máy có công thức, hoặc máy thuộc các loại ở `nodeKind`. */
export function modelerMachines(ds: Dataset): MachineDef[] {
  return [...ds.machines.values()].filter(
    (d) => d.quickBar !== 'hidden' && (nodeKind(d) !== null || (ds.recipesByMachine.get(d.id) ?? []).some((r) => r.ingredients.length + r.outcomes.length > 0)),
  );
}

export const recipeOf = (ds: Dataset, n: MNode): RecipeDef | null => (n.recipeId ? (ds.recipes.get(n.recipeId) ?? null) : null);

/** Lò phản ứng: vật phẩm đang nối vào (theo thứ tự đường nối). */
export const crucibleInputs = (n: MNode, edges: MEdge[]): string[] => [
  ...new Set(edges.filter((e) => e.to.node === n.id && !isEnvItem(e.to.item)).map((e) => e.to.item)),
];

/**
 * Lò phản ứng: vật phẩm đầu ra theo màu. Sơ đồ cũ (trước khi có màu) có đường ra mà chưa gán màu ⇒ tự gán
 * màu còn trống theo thứ tự đường nối.
 */
export function crucibleOuts(ds: Dataset, n: MNode, edges: MEdge[]): Partial<Record<SlotColor, string>> {
  const outs: Partial<Record<SlotColor, string>> = { ...(n.outs ?? {}) };
  const has = (i: string): boolean => Object.values(outs).includes(i);
  for (const e of edges) {
    if (e.from.node !== n.id || has(e.from.item)) continue;
    const free: SlotColor[] = kindOfItem(ds, e.from.item) === 'pipe' ? ['yellow', 'orange'] : ['black'];
    const c = free.find((x) => !outs[x]);
    if (c) outs[c] = e.from.item;
  }
  return outs;
}
export const colorOf = (outs: Partial<Record<SlotColor, string>>, item: string): SlotColor | undefined =>
  (Object.keys(outs) as SlotColor[]).find((c) => outs[c] === item);

/** Mọi vật phẩm đang có trong lò: nối vào + nguyên liệu / sản phẩm của công thức đang chạy + đầu ra đã chọn. */
export function crucibleItems(ds: Dataset, n: MNode, edges: MEdge[]): string[] {
  const inputs = crucibleInputs(n, edges);
  const run = crucibleRun(ds, n.machineId, inputs, n.ticks);
  const items = new Set(inputs);
  for (const r of run) for (const s of [...r.ingredients, ...r.outcomes]) items.add(s.itemId);
  for (const i of crucibleCandidates(run, inputs)) items.add(i);
  for (const i of Object.values(crucibleOuts(ds, n, edges))) if (i) items.add(i);
  return [...items];
}

/**
 * Bấm vào một vật phẩm của lò (người dùng 2026-09-29): đổi màu đầu ra theo vòng — lỏng/khí: bình thường → vàng
 * → cam → bình thường; hàng băng: bình thường → đen → bình thường. Màu đã có vật phẩm khác ⇒ vật phẩm đó về bình
 * thường. Thôi làm đầu ra ⇒ gỡ đường ra của vật phẩm đó. Trả về màu mới.
 */
export function cycleCrucibleSlot(ds: Dataset, doc: ModelerDoc, id: string, item: string): SlotColor | undefined {
  const n = doc.nodes.find((x) => x.id === id);
  if (!n) return undefined;
  const outs = crucibleOuts(ds, n, doc.edges);
  const cur = colorOf(outs, item);
  const ring: (SlotColor | undefined)[] = kindOfItem(ds, item) === 'pipe' ? [undefined, 'yellow', 'orange'] : [undefined, 'black'];
  const next = ring[(ring.indexOf(cur) + 1) % ring.length];
  if (cur) delete outs[cur];
  const dropOut = (i: string): void => {
    doc.edges = doc.edges.filter((e) => !(e.from.node === id && e.from.item === i));
  };
  if (next) {
    const other = outs[next];
    if (other && other !== item) dropOut(other);
    outs[next] = item;
  } else dropOut(item);
  if (Object.keys(outs).length) n.outs = outs;
  else delete n.outs;
  return next;
}

/** Cổng của một nút theo loại nút (xem `NodeKind`). Lò phản ứng cần `edges` (cổng sinh theo đường nối). */
export function nodePorts(ds: Dataset, n: MNode, edges: MEdge[] = []): MPort[] {
  const out: MPort[] = [];
  const add = (dir: 'in' | 'out', item: string, count: number, slot?: 'act'): void => {
    const key = slot === 'act' ? `act:${item}` : `${dir}:${item}`;
    if (out.some((p) => p.key === key)) return;
    out.push({ key, dir, item, count, ...(slot ? { slot } : {}), side: n.sides?.[key] ?? (dir === 'in' ? 'left' : 'right') });
  };
  // thứ tự người dùng đã kéo (cổng chưa có trong danh sách giữ thứ tự gốc, đứng sau)
  const sorted = (): MPort[] => {
    if (!n.order?.length) return out;
    const at = (k: string): number => {
      const i = n.order!.indexOf(k);
      return i < 0 ? 1e6 + out.findIndex((p) => p.key === k) : i;
    };
    return [...out].sort((a, b) => at(a.key) - at(b.key));
  };
  const kind = kindOfNode(ds, n);
  if (kind === 'crucible') {
    // Mọi vật phẩm trong lò là một ô (người dùng 2026-09-29): vật phẩm chưa chọn làm đầu ra = ô "bình thường"
    // (khoá `in:` — nối từ ngoài vào được); đầu ra = ô màu (khoá `out:`). Vật phẩm vừa có đường vào vừa được chọn
    // làm đầu ra ⇒ hai ô (bản sao mang màu). Mặc định 3 trái / 3 phải / 2 trên (rồi dưới) cho nút gần vuông; người
    // dùng tự sắp lại (giữ chuột kéo quanh nút).
    const inputs = new Set(crucibleInputs(n, edges));
    const outs = crucibleOuts(ds, n, edges);
    for (const i of crucibleItems(ds, n, edges)) {
      const c = colorOf(outs, i);
      if (!c || inputs.has(i)) add('in', i, 1);
      if (c) {
        add('out', i, 1);
        out[out.length - 1]!.color = c;
      }
    }
    const DEFAULT: Side[] = ['left', 'left', 'left', 'right', 'right', 'right', 'top', 'top'];
    const res = sorted();
    res.forEach((p, i) => {
      if (!n.sides?.[p.key]) p.side = DEFAULT[i] ?? 'bottom';
    });
    return res;
  }
  if (kind === 'crafter') {
    const r = recipeOf(ds, n);
    if (!r) return out;
    for (const s of r.ingredients) add('in', s.itemId, s.count);
    // chất kích hoạt: cổng vào riêng (Máy Chuyển Hóa)
    for (const a of ACTIVATOR[n.machineId] ?? []) add('in', a, 0, 'act');
    // công thức cần môi trường xúc tác: cổng nhận môi trường từ máy khuếch tán
    if (r.catalystEnv && r.catalystEnv !== 'None') add('in', envItem(r.catalystEnv), 0);
    for (const s of r.outcomes) add('out', s.itemId, s.count);
    return sorted();
  }
  if (kind === 'sewageOut') {
    add('out', SEWAGE_OUT.output, 1);
    return out;
  }
  if (!n.item) return out;
  if (kind === 'source') add('out', n.item, 1);
  else if (kind === 'sink') {
    add('in', n.item, 1);
    if (PASS_SINKS.has(n.machineId)) add('out', n.item, 1);
  } else if (kind === 'env') {
    add('in', n.item, 0, 'act');
    const env = ENV_GASES[n.item];
    if (env) add('out', envItem(env), 1);
  }
  return sorted();
}

/** Nối được không: ra → vào, cùng vật phẩm, khác nút, chưa có đường này. Trả lý do nếu không. */
export function canConnect(ds: Dataset, doc: ModelerDoc, from: MEnd, to: MEnd): string | null {
  // máy nối được sản phẩm của chính nó vào **cổng kích hoạt** của nó (người dùng 2026-10-04 — VD Máy Chuyển Hóa Khí Rắn
  // tự làm Khí Xiranite để tự kích hoạt); mọi cổng khác vẫn không tự nối
  if (from.node === to.node && to.slot !== 'act') return tr('Không nối một máy với chính nó (chỉ nối được vào cổng kích hoạt của nó)');
  if (from.item !== to.item) return tr('Chỉ nối được cổng ra với cổng vào cùng vật phẩm');
  const a = doc.nodes.find((n) => n.id === from.node);
  const b = doc.nodes.find((n) => n.id === to.node);
  if (!a || !b) return tr('Không tìm thấy máy');
  if (!nodePorts(ds, a, doc.edges).some((p) => p.dir === 'out' && p.item === from.item)) return tr('Máy nguồn không có cổng ra này');
  if (kindOfNode(ds, b) === 'crucible') {
    // lò phản ứng nhận mọi vật phẩm, tối đa 2 đường ống + 2 đường băng (người dùng 2026-09-29)
    if (isEnvItem(to.item) || to.slot) return tr('Lò phản ứng không nhận cổng này');
    const kind = kindOfItem(ds, to.item);
    const used = doc.edges.filter((e) => e.to.node === b.id && kindOfItem(ds, e.to.item) === kind).length;
    if (used >= CRUCIBLE_IN[kind]) return tr('Lò chỉ nhận tối đa {0} đường {1} vào', CRUCIBLE_IN[kind], kind === 'pipe' ? tr('ống') : tr('băng'));
  } else if (!nodePorts(ds, b, doc.edges).some((p) => p.dir === 'in' && p.item === to.item && (p.slot ?? null) === (to.slot ?? null)))
    return tr('Máy đích không có cổng vào này');
  if (doc.edges.some((e) => e.from.node === from.node && e.to.node === to.node && e.from.item === from.item && (e.to.slot ?? null) === (to.slot ?? null)))
    return tr('Đã có đường nối này');
  return null;
}

/**
 * Thêm một đường nối. Đường ra của lò phản ứng (người dùng 2026-09-29): chỉ từ ô đã chọn màu; mỗi chất lỏng/khí
 * (vàng / cam) **một** đường — nối lại ⇒ đường cũ bị thay; hàng băng (đen) tới 4 đường ở Lò Mở Rộng, 2 ở Lò Phản Ứng
 * — thêm nữa ⇒ gỡ đường sớm nhất. Trả về các đường bị gỡ.
 */
export function addEdge(ds: Dataset, doc: ModelerDoc, e: MEdge): MEdge[] {
  doc.edges.push(e);
  const a = doc.nodes.find((n) => n.id === e.from.node);
  if (!a || kindOfNode(ds, a) !== 'crucible') return [];
  const outs = doc.edges.filter((x) => x.from.node === a.id);
  const removed: MEdge[] = [];
  const drop = (x: MEdge): void => {
    removed.push(x);
    doc.edges = doc.edges.filter((y) => y !== x);
  };
  // ghi lại màu đang hiện (sơ đồ cũ tự gán) để đường nối sau không đổi màu
  a.outs = crucibleOuts(ds, a, doc.edges);
  // nối nhiều lần vào **cùng một máy** (VD Xiranite Lỏng vào cả cổng nguyên liệu lẫn cổng kích hoạt — người dùng
  // 2026-10-04) vẫn tính là một đường ra: chỉ đường tới **máy khác** mới bị thay / tính vào giới hạn
  if (kindOfItem(ds, e.from.item) === 'pipe') {
    // cùng chất đã có đường ra tới máy khác ⇒ đường cũ bị thay
    for (const x of outs) if (x !== e && x.from.item === e.from.item && x.to.node !== e.to.node) drop(x);
  } else {
    const belts = doc.edges.filter((x) => x.from.node === a.id && x.from.item === e.from.item);
    const targets = (): string[] => [...new Set(belts.map((x) => x.to.node))];
    while (targets().length > crucibleBeltOuts(a.machineId)) {
      const first = belts[0]!.to.node;
      for (const x of belts.filter((y) => y.to.node === first)) {
        drop(x);
        belts.splice(belts.indexOf(x), 1);
      }
    }
  }
  return removed;
}

/** Xoá nút + mọi đường nối của nó. */
export function removeNode(doc: ModelerDoc, id: string): void {
  doc.nodes = doc.nodes.filter((n) => n.id !== id);
  doc.edges = doc.edges.filter((e) => e.from.node !== id && e.to.node !== id);
}

/** Bỏ các đường nối của nút `id` không còn cổng tương ứng (sau khi đổi công thức / vật phẩm). */
function dropDangling(ds: Dataset, doc: ModelerDoc, id: string): void {
  const n = doc.nodes.find((x) => x.id === id);
  if (!n) return;
  const keys = new Set(nodePorts(ds, n, doc.edges).map((p) => p.key));
  doc.edges = doc.edges.filter((e) => (e.from.node !== id || keys.has(fromKey(e))) && (e.to.node !== id || keys.has(toKey(e))));
}

/** Đổi công thức của nút: bỏ các đường nối không còn cổng tương ứng. */
export function setNodeRecipe(ds: Dataset, doc: ModelerDoc, id: string, recipeId: string): void {
  const n = doc.nodes.find((x) => x.id === id);
  if (!n) return;
  n.recipeId = recipeId;
  delete n.sides;
  dropDangling(ds, doc, id);
}

/** Một cách nối tiếp: máy + công thức, hoặc máy "chọn vật phẩm" + vật phẩm. */
export interface LinkOption {
  machineId: string;
  recipeId: string | null;
  item?: string;
  /** Nối vào cổng chất kích hoạt của máy đó. */
  slot?: 'act';
  /** Lò phản ứng / lò mở rộng: công thức của lò dùng vật phẩm đó — tạo lò với công thức này đã tick (2026-10-02). */
  tick?: string;
  /**
   * Dòng gộp "Chứa trong lọ / bình" (Máy Chiết Rót, người dùng 2026-10-02): thay cho cả loạt công thức nạp vào
   * từng loại lọ / bình; chọn xong mới hỏi loại lọ / bình.
   */
  fill?: string[];
  /** Kho / bể làm **nguồn** (cổng ra chuyển tiếp hàng đã vào — người dùng 2026-10-04). */
  pass?: boolean;
}

/** Nút chưa chọn công thức / vật phẩm. */
export const isBlank = (ds: Dataset, n: MNode): boolean => {
  const k = kindOfNode(ds, n);
  if (k === 'sewageOut' || k === 'crucible') return false;
  return k === 'crafter' ? !n.recipeId : !n.item;
};

/**
 * Những cách máy `def` nối được với `item` (người dùng 2026-09-29): `need = 'in'` — máy **nhận** item;
 * `need = 'out'` — máy **đẩy** item ra. Máy chế biến: công thức có item là nguyên liệu / sản phẩm (hoặc
 * cần môi trường đó); máy "chọn vật phẩm": vật phẩm đó nếu hợp thể / hợp loại.
 */
export function machineOptions(ds: Dataset, def: MachineDef, item: string, need: 'in' | 'out'): LinkOption[] {
  const kind = nodeKind(def);
  const one = (slot?: 'act'): LinkOption[] => [{ machineId: def.id, recipeId: null, item, ...(slot ? { slot } : {}) }];
  const allowed = (): boolean => sourceItemsFor(ds, def).includes(item);
  if (kind === 'source') return need === 'out' && allowed() ? one() : [];
  if (kind === 'sink') {
    if (need === 'out') return PASS_SINKS.has(def.id) && allowed() ? [{ machineId: def.id, recipeId: null, item, pass: true }] : [];
    return allowed() ? one() : [];
  }
  if (kind === 'sewageOut') return need === 'out' && item === SEWAGE_OUT.output ? [{ machineId: def.id, recipeId: null }] : [];
  if (kind === 'crucible') {
    // lò phản ứng: hiện trong bảng chọn khi có công thức của lò dùng / làm ra vật phẩm đó
    if (isEnvItem(item)) return [];
    const rs = ds.recipesByMachine.get(def.id) ?? [];
    // nhận vật phẩm vào: hiện đúng từng công thức của lò dùng nó (người dùng 2026-10-02)
    if (need === 'in')
      return rs.filter((r) => r.ingredients.some((s) => s.itemId === item)).map((r) => ({ machineId: def.id, recipeId: null, tick: r.id }));
    const hit = rs.some((r) => r.outcomes.some((s) => s.itemId === item));
    return hit ? [{ machineId: def.id, recipeId: null }] : [];
  }
  if (kind === 'env') {
    if (need === 'in') return allowed() ? one('act') : [];
    if (!isEnvItem(item)) return [];
    const gas = Object.keys(ENV_GASES).find((g) => ENV_GASES[g] === envOf(item));
    return gas ? [{ machineId: def.id, recipeId: null, item: gas }] : [];
  }
  return (ds.recipesByMachine.get(def.id) ?? [])
    .filter((r) =>
      need === 'in'
        ? r.ingredients.some((s) => s.itemId === item) || (isEnvItem(item) && r.catalystEnv === envOf(item))
        : r.outcomes.some((s) => s.itemId === item),
    )
    .map((r) => ({ machineId: def.id, recipeId: r.id }));
}

/** Mọi cách nối tiếp `item` trên toàn bộ máy: máy chế biến trước, máy "chọn vật phẩm" sau. */
export function linkOptions(ds: Dataset, item: string, need: 'in' | 'out'): LinkOption[] {
  const all = modelerMachines(ds).flatMap((d) => machineOptions(ds, d, item, need));
  return [...all.filter((o) => o.recipeId), ...all.filter((o) => !o.recipeId)];
}

/** Gán công thức / vật phẩm cho nút theo một cách nối (bỏ đường nối không còn cổng tương ứng). */
export function applyOption(ds: Dataset, doc: ModelerDoc, id: string, opt: LinkOption): void {
  const n = doc.nodes.find((x) => x.id === id);
  if (!n) return;
  if (opt.recipeId) {
    delete n.item;
    setNodeRecipe(ds, doc, id, opt.recipeId);
    return;
  }
  n.recipeId = null;
  if (opt.item) n.item = opt.item;
  delete n.sides;
  dropDangling(ds, doc, id);
}

/** Xoá nhiều nút + mọi đường nối của chúng. */
export function removeNodes(doc: ModelerDoc, ids: Iterable<string>): void {
  const set = new Set(ids);
  doc.nodes = doc.nodes.filter((n) => !set.has(n.id));
  doc.edges = doc.edges.filter((e) => !set.has(e.from.node) && !set.has(e.to.node));
}

/**
 * Sao chép một nhóm nút (người dùng 2026-09-29): bản sao lệch `dx, dy`, id mới; chỉ chép đường nối có **cả
 * hai đầu** trong nhóm — đường có một đầu nằm ngoài tự bị cắt. Trả về id các nút mới.
 */
export function copyNodes(doc: ModelerDoc, ids: Iterable<string>, dx: number, dy: number): string[] {
  const set = new Set(ids);
  const map = new Map<string, string>();
  const fresh: MNode[] = [];
  for (const n of doc.nodes) {
    if (!set.has(n.id)) continue;
    const copy: MNode = JSON.parse(JSON.stringify(n));
    copy.id = newId('n');
    copy.x += dx;
    copy.y += dy;
    map.set(n.id, copy.id);
    fresh.push(copy);
  }
  const edges: MEdge[] = [];
  for (const e of doc.edges) {
    const a = map.get(e.from.node);
    const b = map.get(e.to.node);
    if (!a || !b) continue;
    const copy: MEdge = JSON.parse(JSON.stringify(e));
    copy.id = newId('e');
    copy.from.node = a;
    copy.to.node = b;
    // điểm neo dời theo bản sao (cả hai đầu đều nằm trong nhóm)
    if (copy.points) copy.points = copy.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    edges.push(copy);
  }
  doc.nodes.push(...fresh);
  doc.edges.push(...edges);
  return fresh.map((n) => n.id);
}
