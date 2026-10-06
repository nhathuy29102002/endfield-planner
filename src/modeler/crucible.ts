import type { Dataset, RecipeDef } from '../model/types';
import { CRUCIBLE_LIMITS } from '../sim/solver';

/**
 * **Lò Phản Ứng / Lò Mở Rộng** trên sơ đồ Modeler (người dùng 2026-09-29).
 *
 * - Nút lò **không chọn một công thức**: công thức tự chạy theo những gì được nối vào, như bên Map — công
 *   thức đã tick được xếp trước, rồi tới các công thức khác theo thứ tự game; sản phẩm làm ra trong lò mở
 *   khoá thêm công thức (chuỗi). Lò Mở Rộng: nhiều công thức một lúc, tối đa **8** loại vật phẩm bên trong;
 *   Lò Phản Ứng: **1** công thức, tối đa **5** loại (`CRUCIBLE_LIMITS`, dùng chung với solver của Map).
 * - Vào: tối đa **2 đường ống + 2 đường băng**. Mọi vật phẩm vào được (kể cả để chuyển trung gian).
 * - Ra: mọi vật phẩm trong lò hiện thành ô quanh nút; **bấm vào ô để chọn làm đầu ra** (lỏng/khí: vàng → cam,
 *   hàng băng: đen) — `doc.cycleCrucibleSlot`. Chỉ ô có màu mới nối ra được: 2 chất lỏng/khí (mỗi chất một
 *   đường) + 1 loại hàng băng (tới 4 đường ở Lò Mở Rộng, 2 ở Lò Phản Ứng).
 * - Sản phẩm **cuối** (không công thức nào trong lò dùng tiếp) mà không có đường ra ⇒ lò **kẹt**, như bên Map.
 *   Sản phẩm trung gian thừa chỉ làm chậm công thức làm ra nó.
 */
export const CRUCIBLE_MACHINES = new Set(Object.keys(CRUCIBLE_LIMITS));
export const isCrucible = (machineId: string): boolean => CRUCIBLE_MACHINES.has(machineId);

/** Số đường vào / ra cho phép (người dùng: 2 ống + 2 băng vào; ra 2 chất lỏng + 1 rắn). */
export const CRUCIBLE_IN = { pipe: 2, belt: 2 };
export const crucibleBeltOuts = (machineId: string): number => (machineId === 'mix_pool_1' ? 2 : 4);

/**
 * Công thức lò chạy khi có những vật phẩm `inputs` nối vào: tick trước, rồi thứ tự game; một công thức chạy
 * được khi mọi nguyên liệu có sẵn (từ ngoài vào hoặc do công thức khác trong lò làm ra) và thêm nó không làm
 * số loại vật phẩm trong lò vượt giới hạn.
 */
export function crucibleRun(ds: Dataset, machineId: string, inputs: Iterable<string>, ticked: string[] = []): RecipeDef[] {
  const limit = CRUCIBLE_LIMITS[machineId] ?? { recipes: 1, items: Infinity };
  const all = ds.recipesByMachine.get(machineId) ?? [];
  const order = [...ticked.map((id) => all.find((r) => r.id === id)).filter((r): r is RecipeDef => !!r), ...all.filter((r) => !ticked.includes(r.id))];
  const items = new Set(inputs);
  const have = new Set(items);
  const run: RecipeDef[] = [];
  for (let changed = true; changed; ) {
    changed = false;
    for (const r of order) {
      if (run.includes(r) || run.length >= limit.recipes) continue;
      if (!r.ingredients.every((s) => have.has(s.itemId))) continue;
      const next = new Set(items);
      for (const s of [...r.ingredients, ...r.outcomes]) next.add(s.itemId);
      if (next.size > limit.items) continue;
      run.push(r);
      for (const i of next) items.add(i);
      for (const s of r.outcomes) have.add(s.itemId);
      changed = true;
    }
  }
  return run;
}

/** Vật phẩm lấy ra được từ lò: những gì nối vào (chuyển trung gian) + sản phẩm các công thức đang chạy. */
export function crucibleCandidates(run: RecipeDef[], inputs: Iterable<string>): string[] {
  const out = new Set(inputs);
  for (const r of run) for (const s of r.outcomes) out.add(s.itemId);
  return [...out];
}

export interface CrucibleBalance {
  /** Mức chạy từng công thức (0…1). */
  u: number[];
  /** Tổng làm ra / tiêu thụ bên trong lò, /phút (đã nhân số lò). */
  prod: Map<string, number>;
  cons: Map<string, number>;
  /** Còn lại để đưa ra ngoài theo từng vật phẩm, /phút. */
  out: Map<string, number>;
  /** Lò kẹt vì sản phẩm cuối không có đường ra: tên vật phẩm; `null` = không kẹt. */
  jam: string | null;
}

const EPS = 1e-6;

/** Nhu cầu / sản lượng mỗi phút của công thức `r` khi chạy đủ (một lò). */
export const recipeRates = (r: RecipeDef): { cons: Map<string, number>; prod: Map<string, number> } => {
  const k = 60 / r.seconds;
  const cons = new Map<string, number>();
  const prod = new Map<string, number>();
  for (const s of r.ingredients) cons.set(s.itemId, (cons.get(s.itemId) ?? 0) + s.count * k);
  for (const s of r.outcomes) prod.set(s.itemId, (prod.get(s.itemId) ?? 0) + s.count * k);
  return { cons, prod };
};

/** Nhu cầu ròng từ bên ngoài của từng vật phẩm khi mọi công thức chạy đủ (`count` lò). */
export function crucibleNeed(run: RecipeDef[], count: number): Map<string, number> {
  const net = new Map<string, number>();
  for (const r of run) {
    const { cons, prod } = recipeRates(r);
    for (const [i, v] of cons) net.set(i, (net.get(i) ?? 0) + v * count);
    for (const [i, v] of prod) net.set(i, (net.get(i) ?? 0) - v * count);
  }
  return net;
}

/**
 * Cân bằng bên trong lò với lượng vào `supply` (/phút): bắt đầu từ mọi công thức chạy đủ rồi hạ dần công thức
 * thiếu nguyên liệu, và công thức làm ra sản phẩm trung gian thừa (không có đường ra). Sản phẩm cuối không có
 * đường ra ⇒ kẹt cả lò.
 */
export function crucibleBalance(run: RecipeDef[], count: number, supply: Map<string, number>, linkedOut: Set<string>): CrucibleBalance {
  const rates = run.map(recipeRates);
  const consumedBy = (i: string): boolean => rates.some((r) => r.cons.has(i));
  // sản phẩm cuối không có đường ra ⇒ kẹt
  for (const r of rates)
    for (const [i, v] of r.prod)
      if (v > EPS && !consumedBy(i) && !linkedOut.has(i))
        return { u: run.map(() => 0), prod: new Map(), cons: new Map(), out: new Map(), jam: i };
  const u = run.map(() => 1);
  const totals = (): { prod: Map<string, number>; cons: Map<string, number> } => {
    const prod = new Map<string, number>();
    const cons = new Map<string, number>();
    rates.forEach((r, k) => {
      for (const [i, v] of r.cons) cons.set(i, (cons.get(i) ?? 0) + v * u[k]! * count);
      for (const [i, v] of r.prod) prod.set(i, (prod.get(i) ?? 0) + v * u[k]! * count);
    });
    return { prod, cons };
  };
  for (let it = 0; it < 400; it++) {
    const { prod, cons } = totals();
    let delta = 0;
    rates.forEach((r, k) => {
      let f = 1;
      // thiếu nguyên liệu
      for (const [i] of r.cons) {
        const need = cons.get(i) ?? 0;
        const have = (supply.get(i) ?? 0) + (prod.get(i) ?? 0);
        if (need > have + EPS) f = Math.min(f, have / need);
      }
      // sản phẩm trung gian thừa mà không có đường ra ⇒ công thức làm ra nó chậm lại
      for (const [i] of r.prod) {
        if (linkedOut.has(i)) continue;
        const made = prod.get(i) ?? 0;
        const room = (cons.get(i) ?? 0) - (supply.get(i) ?? 0);
        if (made > room + EPS) f = Math.min(f, Math.max(0, room) / made);
      }
      const next = u[k]! * Math.max(0, Math.min(1, f));
      delta = Math.max(delta, Math.abs(next - u[k]!));
      u[k] = next;
    });
    if (delta < 1e-10) break;
  }
  const { prod, cons } = totals();
  const out = new Map<string, number>();
  for (const i of new Set([...supply.keys(), ...prod.keys()])) {
    const v = (supply.get(i) ?? 0) + (prod.get(i) ?? 0) - (cons.get(i) ?? 0);
    if (v > EPS) out.set(i, v);
  }
  return { u, prod, cons, out, jam: null };
}
