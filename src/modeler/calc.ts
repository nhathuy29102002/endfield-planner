import { kindOfItem } from '../model/dataset';
import type { Dataset, RecipeDef } from '../model/types';
import { crucibleBalance, crucibleNeed, crucibleRun, type CrucibleBalance } from './crucible';
import { RATES } from '../sim/rates';
import {
  ACT_MAX,
  ACT_NEED,
  ACTIVATOR,
  PASS_SINKS,
  SEWAGE_OUT,
  SINKS,
  crucibleInputs,
  fromKey,
  isAutoAct,
  isEnvItem,
  kindOfNode,
  recipeOf,
  toKey,
  type MEdge,
  type MNode,
  type ModelerDoc,
  type NodeKind,
} from './doc';

/**
 * **Tính toán Modeler** (đợt 3 + các loại máy thêm 2026-09-29).
 *
 * - Tốc độ mỗi máy: cổng của máy chế biến = số lượng × 60 / giây của công thức; máy nguồn = **một tuyến**
 *   (băng 30, ống 120) lấy từ kho vô hạn; kho / máy xử lý nhận tới `SINKS[..].rate` mỗi máy.
 * - **Mục tiêu** (số máy): ô dưới nếu có; để trống ⇒ tính ngược từ nhu cầu của các máy phía sau. Nút không
 *   điền ô dưới mà không ai cần hàng của nó ⇒ **không tính** (`target = null`). Kho / máy xử lý không điền ô
 *   dưới: nhận hết những gì tới, số máy = lượng nhận / sức nhận một máy (không tạo nhu cầu ngược lên).
 * - **Thực chạy**: mục tiêu × tỉ lệ nguyên liệu thật sự tới (thiếu nhất quyết định). Máy cần **chất kích
 *   hoạt** (Máy Chuyển Hóa, Máy Khuếch Tán): chưa cắm ⇒ 0 %; cần 6/phút mỗi máy để chạy đủ, nhưng **xin và
 *   tiêu thụ tới 30/phút mỗi máy** (người dùng 2026-09-30: ép người dùng đặt giới hạn lưu lượng 6/phút trên
 *   đường ống). Nhận 6 (20 %) = chạy bình thường như 100 %; nhận hơn 6 ⇒ cảnh báo "!" dùng thừa (`actOver`).
 *   Tính theo **số máy thật** = số máy làm tròn lên (người dùng 2026-09-30: mỗi cổng nhận tối đa 30, mỗi máy tốn
 *   ít nhất 6 ⇒ ≤ 100 % nhận tối đa 30; 200 % cần ít nhất 12, nhận tối đa 60); nhận dưới mức ⇒ "!" thiếu (`actShort`).
 *   Công thức cần **môi trường**: phải nối từ một máy khuếch tán đang chạy, không thì 0 %.
 * - Một cổng ra cấp cho nhiều máy: chia đều, máy nào đủ thì phần dư sang máy khác (rót nước). **Đường ống có
 *   giới hạn lưu lượng** (thay Cảng Kiểm Soát Ống) chỉ chở tới mức đã chọn ⇒ phần còn lại tự chia cho các nhánh
 *   khác của nguồn.
 * - Cửa Xả Phụ Phẩm: 30 nước thải vào các Cửa Nạp Nước Thải ⇒ 1 Xircon Thải.
 * - **Chất kích hoạt — Tự động** (người dùng 2026-10-04): đường vào cổng kích hoạt chưa đặt giới hạn chở **đúng 6/phút ×
 *   số máy thật** (N máy ⇒ N × 6), máy chỉ xin chừng đó; đường đặt giới hạn tay / "không giới hạn" giữ luật cũ (xin tới
 *   30/phút mỗi máy). Máy được tự nối sản phẩm của nó vào cổng kích hoạt của chính nó.
 * - **Kho / bể có cổng ra** (`PASS_SINKS`, 2026-10-04): hàng vào được chuyển tiếp ra cổng ra theo nhu cầu phía sau (nhu
 *   cầu đó đi ngược lên đầu vào); phần không ai lấy mới tính là cất vào kho tổng / chứa trong bể.
 * - **Lò phản ứng** (`crucible.ts`): số lò = ô dưới; **trống ⇒ tính theo nhu cầu phía sau như máy thường** (người dùng
 *   2026-10-04 — trước đây trống = 1 lò, dây chuyền thiếu đầu ra), không ai cần ⇒ 0 lò; công thức tự chạy theo những gì nối vào; nhận
 *   đủ cho mọi công thức chạy hết sức (trừ phần tự làm ra bên trong) + phần chuyển trung gian mà phía sau cần;
 *   đưa ra phần còn lại của mỗi vật phẩm đã nối ra. Sản phẩm cuối không có đường ra ⇒ kẹt (0 %).
 * - Sản phẩm không ai dùng không làm kẹt máy — chỉ hiện xanh (dư).
 */

export type PortState = 'ok' | 'short' | 'surplus';

export interface PortCalc {
  /** Vào: lượng muốn nhận (theo mục tiêu). Ra: lượng làm ra (theo thực chạy). /phút */
  want: number;
  /** Vào: lượng thật sự tới. Ra: lượng thật sự đưa đi theo đường nối. /phút */
  flow: number;
  /** Vào: lượng máy thật sự dùng. Ra: = `want`. */
  used: number;
  state: PortState;
  /** Thiếu (đỏ) hoặc dư (xanh), /phút, luôn dương. */
  diff: number;
}

export interface NodeCalc {
  /** Số máy mục tiêu; `null` = không tính. */
  target: number | null;
  /** Số máy thực chạy (thập phân: 0.83 = chạy 83 %). Cửa Xả Phụ Phẩm: 0. */
  actual: number;
  /** Theo khoá cổng `in:item` / `out:item` / `act:item`. */
  ports: Map<string, PortCalc>;
  /** Công thức cần môi trường: đã có môi trường chưa (`null` = không cần). */
  env: boolean | null;
  /** Lượng làm ra (Cửa Xả Phụ Phẩm), /phút. */
  through?: number;
  /** Lò phản ứng: công thức đang chạy + mức chạy (0…1), và vật phẩm làm lò kẹt (nếu có). */
  recipes?: { recipe: RecipeDef; u: number }[];
  jam?: string | null;
  /** Chất kích hoạt nhận nhiều hơn mức cần (6/phút mỗi máy): lượng thừa /phút (người dùng 2026-09-30). */
  actOver?: number;
  /** Chất kích hoạt nhận thiếu so với mức cần (6/phút mỗi máy thật): lượng thiếu /phút. */
  actShort?: number;
}

export interface ModelerCalc {
  nodes: Map<string, NodeCalc>;
  /** Lượng chảy trên từng đường nối, /phút. */
  edges: Map<string, number>;
  /** Đường nối vượt sức chở một băng (30) / một ống (120) ⇒ vẽ dày hơn. */
  over: Set<string>;
  /** Nguyên liệu thô lấy ra từ máy nguồn, theo vật phẩm, /phút. */
  raw: Map<string, number>;
  /** Hàng dư (không ai dùng) của máy chế biến, theo vật phẩm, /phút. */
  surplus: Map<string, number>;
  /** Nguyên liệu còn thiếu so với mục tiêu, theo vật phẩm, /phút. */
  shortage: Map<string, number>;
  /** Đưa vào kho tổng (bể chứa, kho lưu trữ, máy nâng hàng kho), /phút. */
  stored: Map<string, number>;
  /** Bị xoá / nạp đi (bộ xử lý nước thải, cửa nạp nước thải), /phút. */
  disposed: Map<string, number>;
  /** Chứa trong bể (Bể Chứa Khí / Chất Lỏng — không vào kho tổng), /phút. */
  tanked: Map<string, number>;
  /** Theo loại máy: tổng số máy (thập phân) và số máy phải xây (làm tròn lên từng nút). */
  machines: Map<string, { count: number; built: number }>;
  /** Điện: máy đã xây tiêu thụ cả lúc rảnh ⇒ số máy làm tròn lên × điện mỗi máy. */
  power: number;
}

const EPS = 1e-6;
/** Số máy thật của một mục tiêu thập phân (0,83 máy ⇒ 1 máy; 1,5 ⇒ 2) — chất kích hoạt tính theo từng máy. */
const units = (t: number): number => (t > EPS ? Math.ceil(t - 1e-9) : 0);
const lineCap = (ds: Dataset, item: string): number =>
  kindOfItem(ds, item) === 'belt' ? RATES.beltPerMinute : RATES.pipePerMinute;

interface Rates {
  kind: NodeKind;
  /** Cổng vào (khoá `in:` / `act:`) → mỗi máy mỗi phút cần (chất kích hoạt: 6). */
  ins: Map<string, number>;
  /** Cổng ra (khoá `out:`) → mỗi máy mỗi phút làm ra. */
  outs: Map<string, number>;
  /** Khoá cổng chất kích hoạt (nếu máy cần). */
  act: string | null;
  /** Cổng môi trường (nếu công thức cần). */
  env: string | null;
}

/** Tốc độ mỗi máy của từng cổng (vào/ra), /phút. */
export function perMachineRates(ds: Dataset, n: MNode, edges: MEdge[] = []): Rates {
  const kind = kindOfNode(ds, n);
  const r: Rates = { kind, ins: new Map(), outs: new Map(), act: null, env: null };
  if (kind === 'crucible') {
    // cổng sinh theo đường nối; lượng tính riêng (`crucible.ts`)
    for (const i of crucibleInputs(n, edges)) r.ins.set(`in:${i}`, 0);
    for (const e of edges) if (e.from.node === n.id) r.outs.set(`out:${e.from.item}`, 0);
    return r;
  }
  if (kind === 'crafter') {
    const rec = recipeOf(ds, n);
    if (!rec || rec.seconds <= 0) return r;
    const k = 60 / rec.seconds;
    for (const s of rec.ingredients) r.ins.set(`in:${s.itemId}`, (r.ins.get(`in:${s.itemId}`) ?? 0) + s.count * k);
    for (const s of rec.outcomes) r.outs.set(`out:${s.itemId}`, (r.outs.get(`out:${s.itemId}`) ?? 0) + s.count * k);
    const a = ACTIVATOR[n.machineId]?.[0];
    if (a) {
      r.act = `act:${a}`;
      r.ins.set(r.act, ACT_NEED);
    }
    if (rec.catalystEnv && rec.catalystEnv !== 'None') r.env = `in:@env:${rec.catalystEnv}`;
    return r;
  }
  if (kind === 'sewageOut') {
    r.outs.set(`out:${SEWAGE_OUT.output}`, 0); // tính từ tổng nước thải vào các cửa nạp
    return r;
  }
  if (!n.item) return r;
  if (kind === 'source') r.outs.set(`out:${n.item}`, lineCap(ds, n.item));
  else if (kind === 'sink') {
    r.ins.set(`in:${n.item}`, SINKS[n.machineId]!.rate);
    // kho / bể có cổng ra: chuyển tiếp hàng đã vào (lượng tính riêng — `made`)
    if (PASS_SINKS.has(n.machineId)) r.outs.set(`out:${n.item}`, 0);
  }
  else if (kind === 'env') {
    r.act = `act:${n.item}`;
    r.ins.set(r.act, ACT_NEED);
  }
  return r;
}

export function computeModeler(ds: Dataset, doc: ModelerDoc): ModelerCalc {
  const nodes = new Map(doc.nodes.map((n) => [n.id, n]));
  const rates = new Map(doc.nodes.map((n) => [n.id, perMachineRates(ds, n, doc.edges)]));
  const kind = (id: string): NodeKind => rates.get(id)!.kind;
  // đường nối hợp lệ; đường môi trường không chở hàng — xét riêng
  const valid = doc.edges.filter((e) => {
    const a = rates.get(e.from.node);
    const b = rates.get(e.to.node);
    // tự nối: chỉ vào cổng kích hoạt của chính nó (2026-10-04)
    if (!a || !b || (e.from.node === e.to.node && e.to.slot !== 'act')) return false;
    if (isEnvItem(e.from.item)) return kind(e.from.node) === 'env' && b.env === toKey(e);
    return a.outs.has(fromKey(e)) && b.ins.has(toKey(e));
  });
  const envEdges = valid.filter((e) => isEnvItem(e.from.item));
  const edges = valid.filter((e) => !isEnvItem(e.from.item));
  const outEdges = (id: string, key: string): MEdge[] => edges.filter((e) => e.from.node === id && fromKey(e) === key);
  const inEdges = (id: string, key: string): MEdge[] => edges.filter((e) => e.to.node === id && toKey(e) === key);
  const limitOf = (id: string): number | null => nodes.get(id)!.limit;
  // nút có số máy do người dùng chốt (ô dưới) — máy nguồn / chế biến / khuếch tán / kho
  const fixed = (id: string): boolean => limitOf(id) !== null && kind(id) !== 'sewageOut';
  // lò phản ứng: công thức chạy, số lò, nhu cầu ròng khi chạy đủ, vật phẩm đã nối ra
  interface Cru {
    run: RecipeDef[];
    count: number;
    inputs: Set<string>;
    linked: Set<string>;
    net: Map<string, number>;
    pass: Map<string, number>;
    bal: CrucibleBalance | null;
  }
  const cru = new Map<string, Cru>();
  /** Số máy mục tiêu (bước 1) — khai báo sớm vì sức chở đường kích hoạt Tự động phụ thuộc số máy. */
  const T = new Map<string, number>();
  for (const n of doc.nodes) {
    if (kind(n.id) !== 'crucible') continue;
    const inputs = crucibleInputs(n, doc.edges);
    const run = crucibleRun(ds, n.machineId, inputs, n.ticks);
    // ô dưới trống ⇒ số lò tính theo nhu cầu phía sau (bước 1), bắt đầu từ 0
    const count = n.limit ?? 0;
    const linked = new Set(doc.edges.filter((e) => e.from.node === n.id).map((e) => e.from.item));
    cru.set(n.id, { run, count, inputs: new Set(inputs), linked, net: crucibleNeed(run, count), pass: new Map(), bal: null });
  }
  /** Vật phẩm đi thẳng qua lò (nối vào và nối ra). */
  const passes = (c: Cru, item: string): boolean => c.inputs.has(item) && c.linked.has(item);
  /** Đường vào cổng kích hoạt của máy `id`. */
  const actEdges = (id: string): MEdge[] => edges.filter((e) => e.to.node === id && e.to.slot === 'act');
  /** Mọi đường kích hoạt của máy đều Tự động ⇒ máy chỉ xin đúng 6/phút mỗi máy. */
  const allAuto = (id: string): boolean => actEdges(id).every(isAutoAct);
  /** Mức chất kích hoạt máy xin: Tự động = 6 × số máy thật; có đường đặt tay / không giới hạn = tới 30 × số máy. */
  const actWant = (id: string): number => (allAuto(id) ? ACT_NEED : ACT_MAX) * units(T.get(id) ?? 0);
  /**
   * Sức chở của một đường: giới hạn người dùng đặt (đường ống), không thì vô hạn (thừa thì vẽ dày). Đường kích hoạt
   * Tự động lẫn với đường đặt tay: chở phần còn thiếu tới 6 × số máy sau khi trừ các giới hạn tay.
   */
  const edgeCap = (e: MEdge): number => {
    if (!isAutoAct(e) || allAuto(e.to.node)) return e.limit ?? Infinity;
    const all = actEdges(e.to.node);
    const fixedSum = all.reduce((a, x) => a + (typeof x.limit === 'number' ? x.limit : 0), 0);
    const autos = all.filter(isAutoAct).length;
    return Math.max(0, ACT_NEED * units(T.get(e.to.node) ?? 0) - fixedSum) / Math.max(1, autos);
  };
  /** Kho / bể chuyển tiếp: nhu cầu phía sau trên cổng ra (đi ngược lên cổng vào). */
  const storePass = new Map<string, number>();
  const passSink = (id: string): boolean => kind(id) === 'sink' && PASS_SINKS.has(nodes.get(id)!.machineId);

  // ---------------------------------------------------------------- 0. sức làm ra tối đa (tính xuôi)
  /**
   * Mỗi máy chế biến / máy nguồn **làm ra được tối đa** bao nhiêu, xét giới hạn số máy (ô dưới) của chính nó và
   * của mọi máy phía trước (người dùng 2026-10-02, sơ đồ "Bug"): Máy Chuyển Hóa không giới hạn nhưng Lò Tinh Luyện
   * nuôi nó bị chốt 1 máy ⇒ nó chỉ làm được 15 khí đồng; trước đây nhu cầu vẫn chia đều 30/30 cho nó và nhánh
   * kia ⇒ nhánh kia không tăng máy để bù. Không giới hạn ⇒ `BIG`. Vòng lặp: lặp tới khi đứng yên (chỉ giảm dần).
   */
  const BIG = 1e9;
  const maxRun = new Map<string, number>();
  for (const n of doc.nodes) maxRun.set(n.id, BIG);
  /** Sức làm ra tối đa của cổng ra `key` (máy không phải máy chế biến / nguồn: coi như vô hạn). */
  const maxOut = (id: string, key: string): number => {
    const k = kind(id);
    if (k !== 'crafter' && k !== 'source') return BIG;
    const per = rates.get(id)!.outs.get(key) ?? 0;
    return per > EPS ? Math.min(BIG, maxRun.get(id)! * per) : BIG;
  };
  for (let it = 0; it < 200; it++) {
    let changed = false;
    for (const n of doc.nodes) {
      const k = kind(n.id);
      if (k !== 'crafter' && k !== 'source') continue;
      let run = n.limit ?? BIG;
      if (k === 'crafter') {
        const R = rates.get(n.id)!;
        for (const [key, per] of R.ins) {
          // chất kích hoạt / môi trường không giới hạn sản lượng ở đây
          if (key === R.act || per <= EPS) continue;
          const sup = inEdges(n.id, key).reduce((a, e) => a + Math.min(edgeCap(e), maxOut(e.from.node, fromKey(e))), 0);
          run = Math.min(run, sup / per);
        }
      }
      if (run < maxRun.get(n.id)! - 1e-9) {
        maxRun.set(n.id, run);
        changed = true;
      }
    }
    if (!changed) break;
  }
  /** Rót `total` vào các chỗ chứa `caps` (chia đều, chỗ nào đầy thì phần dư sang chỗ khác). */
  const waterFill = (total: number, caps: number[]): number[] => {
    const out = caps.map(() => 0);
    let left = total;
    let open = caps.map((_, i) => i).filter((i) => caps[i]! > EPS);
    while (left > EPS && open.length > 0) {
      const share = left / open.length;
      const next: number[] = [];
      for (const i of open) {
        const take = Math.min(share, caps[i]! - out[i]!);
        out[i] = out[i]! + take;
        left -= take;
        if (caps[i]! - out[i]! > EPS) next.push(i);
      }
      if (next.length === open.length && share <= EPS) break;
      open = next;
    }
    return out;
  };

  // ---------------------------------------------------------------- 1. mục tiêu (tính ngược)
  const demanded = new Set<string>();
  for (const n of doc.nodes) T.set(n.id, cru.get(n.id)?.count ?? n.limit ?? 0);
  /** Nhu cầu của cổng vào (theo mục tiêu). */
  const needAt = (id: string, key: string): number => {
    const k = kind(id);
    if (k === 'sink') return (fixed(id) ? limitOf(id)! * rates.get(id)!.ins.get(key)! : 0) + (storePass.get(id) ?? 0);
    const c = cru.get(id);
    if (c) {
      const item = key.slice(3);
      return Math.max(0, c.net.get(item) ?? 0) + (c.pass.get(item) ?? 0);
    }
    // chất kích hoạt: Tự động = đúng 6/phút mỗi máy (2026-10-04); đặt tay = xin đủ sức nhận 30/phút mỗi máy (2026-09-30)
    if (key === rates.get(id)!.act) return actWant(id);
    return T.get(id)! * rates.get(id)!.ins.get(key)!;
  };
  /** Sản lượng cố định của một nút (không đổi theo nhu cầu) — để trừ trước khi chia nhu cầu. */
  let sewageMade = 0;
  const fixedOut = (id: string, key: string): number | null => {
    if (kind(id) === 'sewageOut') return sewageMade;
    if (passSink(id)) return null; // kho / bể chuyển tiếp: nhu cầu đi ngược lên đầu vào
    const c = cru.get(id);
    if (c) {
      // sản phẩm làm ra trong lò đã chốt số lò: sản lượng cố định; lò tính theo nhu cầu / vật phẩm chuyển trung
      // gian: nhu cầu đi ngược qua lò
      const item = key.slice(4);
      return c.inputs.has(item) || !fixed(id) ? null : Math.max(0, -(c.net.get(item) ?? 0));
    }
    if (!fixed(id)) return null;
    return T.get(id)! * rates.get(id)!.outs.get(key)!;
  };
  const demandOn = (e: MEdge): number => {
    const need = needAt(e.to.node, toKey(e));
    if (need <= EPS) return 0;
    const all = inEdges(e.to.node, toKey(e));
    let covered = 0;
    let open = 0;
    for (const x of all) {
      const f = fixedOut(x.from.node, fromKey(x));
      if (f !== null) covered += f / Math.max(1, outEdges(x.from.node, fromKey(x)).length);
      else open++;
    }
    if (fixedOut(e.from.node, fromKey(e)) !== null) return Math.min(edgeCap(e), need / all.length);
    // các máy cung cấp chưa chốt số máy: chia đều phần còn lại, máy nào không làm ra đủ (bị giới hạn phía trước —
    // `maxOut`) thì phần dư dồn sang máy khác; vẫn còn dư (mọi máy đều thiếu sức) thì chia đều như cũ để máy phía
    // trước vẫn hiện nhu cầu thật
    const opens = all.filter((x) => fixedOut(x.from.node, fromKey(x)) === null);
    const rest = Math.max(0, need - covered);
    const caps = opens.map((x) => Math.min(edgeCap(x), maxOut(x.from.node, fromKey(x))));
    const alloc = waterFill(rest, caps);
    const spare = rest - alloc.reduce((a, b) => a + b, 0);
    const i = opens.indexOf(e);
    if (i < 0) return 0;
    const share = alloc[i]! + (spare > EPS ? spare / Math.max(1, open) : 0);
    return Math.min(edgeCap(e), share);
  };
  for (let it = 0; it < 500; it++) {
    let delta = 0;
    for (const n of doc.nodes) {
      const k = kind(n.id);
      const c = cru.get(n.id);
      if (c) {
        // lò: phía sau cần bao nhiêu hàng chuyển trung gian thì lò xin thêm chừng đó ở đầu vào
        for (const item of c.linked) {
          if (!c.inputs.has(item)) continue;
          let d = 0;
          for (const e of outEdges(n.id, `out:${item}`)) d += demandOn(e);
          delta = Math.max(delta, Math.abs(d - (c.pass.get(item) ?? 0)));
          c.pass.set(item, d);
        }
        if (fixed(n.id)) continue;
        // ô dưới trống: số lò = nhu cầu phía sau / sản lượng ròng một lò của từng sản phẩm đã nối ra (lấy lớn nhất)
        const one = crucibleNeed(c.run, 1);
        let t = 0;
        let any = false;
        for (const item of c.linked) {
          if (c.inputs.has(item)) continue;
          const per = -(one.get(item) ?? 0);
          if (per <= EPS) continue;
          let d = 0;
          for (const e of outEdges(n.id, `out:${item}`)) d += demandOn(e);
          if (d > EPS) any = true;
          t = Math.max(t, d / per);
        }
        t = Math.min(t, 1e6);
        if (any) demanded.add(n.id);
        else demanded.delete(n.id);
        delta = Math.max(delta, Math.abs(t - c.count));
        c.count = t;
        c.net = crucibleNeed(c.run, t);
        T.set(n.id, t);
        continue;
      }
      if (passSink(n.id)) {
        // kho / bể chuyển tiếp: nhu cầu phía sau trên cổng ra
        let d = 0;
        for (const e of edges.filter((x) => x.from.node === n.id)) d += demandOn(e);
        delta = Math.max(delta, Math.abs(d - (storePass.get(n.id) ?? 0)));
        storePass.set(n.id, d);
        continue;
      }
      if (fixed(n.id) || k === 'sink' || k === 'sewageOut') continue;
      let t = 0;
      let any = false;
      if (k === 'env') {
        // một máy khuếch tán phủ được cả vùng: có máy nào đang cần môi trường của nó ⇒ 1 máy
        any = envEdges.some((e) => e.from.node === n.id && (T.get(e.to.node) ?? 0) > EPS);
        t = any ? 1 : 0;
      } else
        for (const [key, per] of rates.get(n.id)!.outs) {
          if (per <= EPS) continue;
          let d = 0;
          for (const e of outEdges(n.id, key)) d += demandOn(e);
          if (d > EPS) any = true;
          t = Math.max(t, d / per);
        }
      t = Math.min(t, 1e6); // vòng lặp tự khuếch đại: chặn lại cho khỏi tràn số
      if (any) demanded.add(n.id);
      else demanded.delete(n.id);
      delta = Math.max(delta, Math.abs(t - T.get(n.id)!));
      T.set(n.id, t);
    }
    if (delta < 1e-9) break;
  }

  // ---------------------------------------------------------------- 2. thực chạy (tính xuôi)
  const A = new Map(T);
  const flow = new Map<string, number>();
  /** Lượng chảy của vòng trước (để biết đã hội tụ chưa). */
  let prev = new Map<string, number>();
  const got = (id: string, key: string): number => inEdges(id, key).reduce((s, e) => s + (flow.get(e.id) ?? 0), 0);
  /** Chỗ còn nhận của một cổng vào (rót nước). */
  const roomAt = (id: string, key: string, depth = 0): number => {
    const k = kind(id);
    if (k === 'sink') {
      if (!fixed(id)) return Infinity;
      // kho / bể đã chốt số máy: sức nhận + phần chuyển tiếp phía sau nhận được
      let r = limitOf(id)! * rates.get(id)!.ins.get(key)!;
      if (passSink(id) && depth < 12) for (const e of edges.filter((x) => x.from.node === id)) r += Math.min(edgeCap(e), roomAt(e.to.node, toKey(e), depth + 1));
      return r;
    }
    const c = cru.get(id);
    if (c) {
      // đủ cho công thức chạy hết sức + phần chuyển trung gian phía sau nhận được
      const item = key.slice(3);
      let r = Math.max(0, c.net.get(item) ?? 0);
      if (passes(c, item) && depth < 12)
        for (const e of outEdges(id, `out:${item}`)) r += Math.min(edgeCap(e), roomAt(e.to.node, toKey(e), depth + 1));
      return r;
    }
    if (key === rates.get(id)!.act) return actWant(id);
    return T.get(id)! * rates.get(id)!.ins.get(key)!;
  };
  const made = (id: string, key: string): number => {
    if (kind(id) === 'sewageOut') return sewageMade;
    // kho / bể chuyển tiếp: mọi thứ đã vào (vòng trước — vòng này lượng chảy vừa xoá về 0) đều đưa ra được; phần không
    // ai lấy ở lại trong kho / bể
    if (passSink(id)) return inEdges(id, `in:${key.slice(4)}`).reduce((s, e) => s + (prev.get(e.id) ?? 0), 0);
    const c = cru.get(id);
    if (c) return c.bal?.out.get(key.slice(4)) ?? 0;
    return A.get(id)! * rates.get(id)!.outs.get(key)!;
  };
  const envOk = (id: string): boolean =>
    envEdges.some((e) => e.to.node === id && (A.get(e.from.node) ?? 0) > EPS);
  const items = new Set(edges.map((e) => e.from.item));
  /** Cân bằng lại lò theo lượng thật sự vào (lần đầu: coi như nhận đủ chỗ — lạc quan, như solver của Map). */
  const balanceCrucibles = (optimistic: boolean): number => {
    let delta = 0;
    for (const [id, c] of cru) {
      const supply = new Map<string, number>();
      for (const i of c.inputs) supply.set(i, optimistic ? roomAt(id, `in:${i}`) : got(id, `in:${i}`));
      const before = c.bal;
      c.bal = crucibleBalance(c.run, c.count, supply, c.linked);
      for (const [i, v] of c.bal.out) delta = Math.max(delta, Math.abs(v - (before?.out.get(i) ?? 0)));
      for (const [i, v] of before?.out ?? []) if (!c.bal.out.has(i)) delta = Math.max(delta, v);
      const a = c.bal.jam || c.run.length === 0 ? 0 : (c.count * c.bal.u.reduce((s, x) => s + x, 0)) / c.run.length;
      delta = Math.max(delta, Math.abs(a - (A.get(id) ?? 0)));
      A.set(id, a);
    }
    return delta;
  };
  balanceCrucibles(true);
  for (let it = 0; it < 300; it++) {
    prev = new Map(flow);
    for (const e of edges) flow.set(e.id, 0);
    // Cửa Xả Phụ Phẩm: từ nước thải các cửa nạp nhận được ở vòng trước
    for (const item of items) {
      const es = edges.filter((e) => e.from.item === item);
      const left = new Map<string, number>(); // máy trước: hàng còn chưa đưa đi (theo `node|khoá`)
      const room = new Map<string, number>(); // máy sau: chỗ còn nhận (theo `node|khoá`)
      const pk = (e: MEdge): string => `${e.from.node}|${fromKey(e)}`;
      const ck = (e: MEdge): string => `${e.to.node}|${toKey(e)}`;
      for (const e of es) {
        if (!left.has(pk(e))) left.set(pk(e), made(e.from.node, fromKey(e)));
        if (!room.has(ck(e))) room.set(ck(e), roomAt(e.to.node, toKey(e)));
      }
      // rót nước: mỗi vòng máy trước chia đều phần còn lại cho các máy sau còn chỗ; máy sau nhận quá chỗ
      // thì nhận theo tỉ lệ; phần bị trả lại vòng sau chia cho những máy còn chỗ
      // sức chở còn lại của từng đường (đường ống có giới hạn lưu lượng)
      const capLeft = new Map(es.map((e) => [e.id, edgeCap(e)]));
      for (let round = 0; round < 80; round++) {
        const offer = new Map<string, number>();
        for (const [p, r] of left) {
          if (r <= EPS) continue;
          const open = es.filter((e) => pk(e) === p && room.get(ck(e))! > EPS && capLeft.get(e.id)! > EPS);
          for (const e of open) offer.set(e.id, Math.min(r / open.length, capLeft.get(e.id)!));
        }
        if (offer.size === 0) break;
        const offered = new Map<string, number>();
        for (const e of es) if (offer.has(e.id)) offered.set(ck(e), (offered.get(ck(e)) ?? 0) + offer.get(e.id)!);
        let moved = 0;
        for (const e of es) {
          const o = offer.get(e.id);
          if (!o) continue;
          const c = ck(e);
          const take = o * Math.min(1, room.get(c)! / offered.get(c)!);
          flow.set(e.id, flow.get(e.id)! + take);
          capLeft.set(e.id, capLeft.get(e.id)! - take);
          left.set(pk(e), left.get(pk(e))! - take);
          moved += take;
        }
        for (const [c, g] of offered) room.set(c, Math.max(0, room.get(c)! - Math.min(g, room.get(c)!)));
        if (moved <= EPS) break;
      }
    }
    // nước thải vào các cửa nạp ⇒ sản lượng Cửa Xả Phụ Phẩm (vòng sau)
    let sewage = 0;
    for (const n of doc.nodes) if (n.machineId === SEWAGE_OUT.inlet && n.item) sewage += got(n.id, `in:${n.item}`);
    let delta = Math.abs(sewage / SEWAGE_OUT.ratio - sewageMade);
    for (const e of edges) delta = Math.max(delta, Math.abs(flow.get(e.id)! - (prev.get(e.id) ?? 0)));
    sewageMade = sewage / SEWAGE_OUT.ratio;
    delta = Math.max(delta, balanceCrucibles(false));
    // máy chạy theo nguyên liệu thiếu nhất (+ chất kích hoạt, + môi trường)
    for (const n of doc.nodes) {
      const k = kind(n.id);
      if (k === 'sewageOut' || k === 'source' || k === 'crucible') continue;
      const R = rates.get(n.id)!;
      let a: number;
      if (k === 'sink') {
        const key = [...R.ins.keys()][0];
        const perMachine = key ? R.ins.get(key)! : 1;
        const g = key ? got(n.id, key) : 0;
        a = fixed(n.id) ? Math.min(limitOf(n.id)!, g / perMachine) : g / perMachine;
      } else {
        const t = T.get(n.id)!;
        let ratio = 1;
        for (const [key] of R.ins) {
          const w = key === R.act ? ACT_NEED * units(t) : t * R.ins.get(key)!;
          if (w <= EPS) continue;
          ratio = Math.min(ratio, got(n.id, key) / w);
        }
        if (R.act && t > EPS && inEdges(n.id, R.act).length === 0) ratio = 0; // chưa cắm chất kích hoạt
        if (R.env && !envOk(n.id)) ratio = 0; // chưa có môi trường
        a = t * Math.max(0, Math.min(1, ratio));
      }
      delta = Math.max(delta, Math.abs(a - A.get(n.id)!));
      A.set(n.id, a);
    }
    if (delta < 1e-9) break;
  }

  // ---------------------------------------------------------------- 3. cổng, tổng hợp
  const res: ModelerCalc = {
    nodes: new Map(),
    edges: flow,
    over: new Set(),
    raw: new Map(),
    surplus: new Map(),
    shortage: new Map(),
    stored: new Map(),
    disposed: new Map(),
    tanked: new Map(),
    machines: new Map(),
    power: 0,
  };
  const add = (m: Map<string, number>, k: string, v: number): void => {
    if (v > EPS) m.set(k, (m.get(k) ?? 0) + v);
  };
  for (const e of edges) if (flow.get(e.id)! > lineCap(ds, e.from.item) + EPS) res.over.add(e.id);
  const inShort = new Map<string, number>(); // `node|khoá` → thiếu
  for (const n of doc.nodes)
    for (const [key] of rates.get(n.id)!.ins) {
      // chất kích hoạt: chỉ thiếu khi dưới mức cần để chạy đủ (6/phút mỗi máy)
      const w = key === rates.get(n.id)!.act ? ACT_NEED * units(T.get(n.id)!) : needAt(n.id, key);
      const g = got(n.id, key);
      if (w - g > EPS) inShort.set(`${n.id}|${key}`, w - g);
    }
  for (const n of doc.nodes) {
    const def = ds.machines.get(n.machineId);
    const k = kind(n.id);
    const R = rates.get(n.id)!;
    const t = T.get(n.id)!;
    const a = A.get(n.id)!;
    const ports = new Map<string, PortCalc>();
    const counted = k === 'sink' ? fixed(n.id) || a > EPS : k === 'sewageOut' ? false : fixed(n.id) || demanded.has(n.id);
    const c = cru.get(n.id);
    for (const [key, per] of R.ins) {
      const g = got(n.id, key);
      const w = c ? needAt(n.id, key) : k === 'sink' ? (fixed(n.id) ? needAt(n.id, key) : g) : key === R.act ? ACT_NEED * units(t) : t * per;
      // lò: mọi thứ vào đều được dùng hoặc chuyển tiếp
      const used = c || k === 'sink' || key === R.act ? g : a * per;
      const short = w - g;
      const extra = g - used;
      const st: PortState = short > EPS ? 'short' : extra > EPS ? 'surplus' : 'ok';
      ports.set(key, { want: w, flow: g, used, state: st, diff: st === 'short' ? short : st === 'surplus' ? extra : 0 });
      if (st === 'short') add(res.shortage, key.slice(key.indexOf(':') + 1), short);
      // kho / bể chuyển tiếp: phần đã đưa ra cổng ra không tính là cất / chứa
      const passed = k === 'sink' ? edges.filter((e) => e.from.node === n.id).reduce((a, e) => a + flow.get(e.id)!, 0) : 0;
      if (k === 'sink') add(SINKS[n.machineId]!.store ? res.stored : SINKS[n.machineId]!.tank ? res.tanked : res.disposed, key.slice(3), g - passed);
    }
    const actGot = R.act && t > EPS ? got(n.id, R.act) : 0;
    const actOver = R.act && t > EPS ? actGot - ACT_NEED * units(t) : 0;
    const actShort = R.act && t > EPS ? ACT_NEED * units(t) - actGot : 0;
    if (R.env) ports.set(R.env, { want: 0, flow: 0, used: 0, state: envOk(n.id) || t <= EPS ? 'ok' : 'short', diff: 0 });
    for (const [key] of R.outs) {
      const mk = made(n.id, key);
      const sent = outEdges(n.id, key).reduce((s, e) => s + flow.get(e.id)!, 0);
      const extra = mk - sent;
      const item = key.slice(4);
      // máy sau nhận thiếu mà máy này hết hàng ⇒ cổng ra cũng đỏ (máy nguồn: đỏ = thiếu)
      let missing = 0;
      if (extra <= EPS)
        for (const e of outEdges(n.id, key)) {
          const s = inShort.get(`${e.to.node}|${toKey(e)}`) ?? 0;
          if (s > EPS) missing += s / inEdges(e.to.node, toKey(e)).length;
        }
      // kho / bể chuyển tiếp: phần không ai lấy ở lại trong kho / bể — không phải hàng dư
      const st: PortState = extra > EPS && k !== 'sink' ? 'surplus' : missing > EPS ? 'short' : 'ok';
      ports.set(key, { want: mk, flow: sent, used: mk, state: st, diff: st === 'surplus' ? extra : st === 'short' ? missing : 0 });
      if (k === 'source') add(res.raw, item, mk);
      else if (k !== 'sink') add(res.surplus, item, extra);
    }
    // cổng ra môi trường của máy khuếch tán: không chở hàng
    if (k === 'env' && n.item)
      for (const e of envEdges.filter((x) => x.from.node === n.id))
        if (!ports.has(fromKey(e))) ports.set(fromKey(e), { want: 0, flow: 0, used: 0, state: 'ok', diff: 0 });
    const through = k === 'sewageOut' ? sewageMade : undefined;
    res.nodes.set(n.id, {
      target: counted ? (k === 'sink' && !fixed(n.id) ? a : t) : null,
      actual: counted ? a : 0,
      ports,
      env: R.env ? envOk(n.id) : null,
      ...(through !== undefined ? { through } : {}),
      ...(c ? { recipes: c.run.map((recipe, i) => ({ recipe, u: c.bal?.u[i] ?? 0 })), jam: c.bal?.jam ?? null } : {}),
      ...(actOver > EPS ? { actOver } : {}),
      ...(actShort > EPS ? { actShort } : {}),
    });
    const built = k === 'sewageOut' ? 1 : counted ? Math.ceil((k === 'sink' && !fixed(n.id) ? a : t) - 1e-9) : 0;
    if (built > 0 || (counted && t > EPS)) {
      const m = res.machines.get(n.machineId) ?? { count: 0, built: 0 };
      m.count += k === 'sewageOut' ? 1 : k === 'sink' && !fixed(n.id) ? a : t;
      m.built += built;
      res.machines.set(n.machineId, m);
      res.power += built * (def?.power ?? 0);
    }
  }
  return res;
}
