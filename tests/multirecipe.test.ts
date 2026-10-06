import { describe, expect, it } from 'vitest';
import { setBinding, setRecipe, toggleNotedRecipe } from '../src/editor/ops';
import { roleOf } from '../src/model/roles';
import { solve } from '../src/sim/solver';
import { ds, put, scene, source, wire, type Scene } from './helpers';

/**
 * Lò Mở Rộng (mix_pool_2) tích 2 công thức (đúng ví dụ của người dùng):
 *  A. Bột Xiranite + Nước → Xiranite Lỏng
 *  B. Xiranite Lỏng + Nước Thải → Xircon Thải + Xircon Trơ Thải
 * Xiranite Lỏng của A là nguyên liệu của B — dùng chung kho máy, không cần cổng.
 *
 * Trước 2026-09-28 bộ test này chạy trên Lò Phản Ứng (mix_pool_1). Người dùng chốt: Lò Phản Ứng
 * chỉ chạy **1** phản ứng một lúc (chứa tối đa 5 món); Lò Mở Rộng chạy bao nhiêu phản ứng cũng
 * được, miễn bên trong không quá **8 món khác nhau** — nên chuyển sang Lò Mở Rộng. Cổng Lò Mở Rộng:
 * băng vào 0–3, ống vào 4–5, băng ra 0–3, ống ra 4–5.
 */
const A = 'pool_liquid_liquid_xiranite_2';
const B = 'pool_liquid_xiranite_poly_2';

function reactor(): { s: Scene; pool: number } {
  const s = scene(80, 80);
  const pool = put(s, 'mix_pool_2', 30, 30);
  setRecipe(s.bp, ds, pool, A);
  toggleNotedRecipe(s.bp, ds, pool, B);
  return { s, pool };
}

describe('máy chạy nhiều công thức cùng lúc', () => {
  it('tích 2 công thức: cổng ra chọn trong hợp sản phẩm của cả hai', () => {
    const { s, pool } = reactor();
    const m = s.bp.machines.find((x) => x.uid === pool)!;
    expect(m.recipeId).toBe(A);
    expect(m.notedRecipes).toEqual([B]);
    const r = setBinding(s.bp, ds, pool, 'out4', 'item_liquid_xiranite_poly');
    expect(r.ok).toBe(true);
  });

  it('không có đầu vào nào ⇒ không công thức nào chạy (cả hai đang chờ, không chiếm chỗ trong lò)', () => {
    const { s, pool } = reactor();
    const f = solve(s.bp, ds).machines.get(pool)!;
    expect(f.running).toEqual([]);
    expect(f.recipes).toEqual([]);
  });

  it('sản phẩm trung gian dùng hết trong máy thì không phải đầu ra; sản phẩm dư không có đường ra ⇒ kẹt', () => {
    const { s, pool } = reactor();
    const pumpCu = put(s, 'pump_1', 50, 26);
    const pumpX = put(s, 'pump_1', 50, 36);
    const miner = put(s, 'miner_1', 32, 50);
    expect(roleOf(ds.machines.get('pump_1')!)).toBe('source');
    source(s, pumpCu, 'item_liquid_water', 60);
    source(s, pumpX, 'item_liquid_sewage', 60);
    source(s, miner, 'item_xiranite_powder', 30);
    wire(s, pumpCu, 0, pool, 4);
    wire(s, pumpX, 0, pool, 5);
    wire(s, miner, 0, pool, 0);

    const f = solve(s.bp, ds).machines.get(pool)!;
    // Xiranite Lỏng được B dùng hết ⇒ đầu vào thật chỉ còn ba thứ này
    expect(f.inputs.map((i) => i.itemId).sort()).toEqual(
      ['item_liquid_sewage', 'item_liquid_water', 'item_xiranite_powder'].sort(),
    );
    // chưa nối đường ra ⇒ kho máy đầy ⇒ kẹt, nhưng cả hai công thức vẫn "đang chạy" (đủ đầu vào)
    expect(f.utilization).toBeCloseTo(0, 3);
    expect(f.running.sort()).toEqual([A, B].sort());
    expect(f.limitedBy).toBe('output');
  });

  it('nối đủ đường ra cho mọi sản phẩm dư ⇒ chạy', () => {
    const { s, pool } = reactor();
    const pumpCu = put(s, 'pump_1', 50, 26);
    const pumpX = put(s, 'pump_1', 50, 36);
    const miner = put(s, 'miner_1', 32, 50);
    source(s, pumpCu, 'item_liquid_water', 60);
    source(s, pumpX, 'item_liquid_sewage', 60);
    source(s, miner, 'item_xiranite_powder', 30);
    wire(s, pumpCu, 0, pool, 4);
    wire(s, pumpX, 0, pool, 5);
    wire(s, miner, 0, pool, 0);

    const f0 = solve(s.bp, ds).machines.get(pool)!;
    const liquids = f0.outputs.map((o) => o.itemId).filter((i) => ds.items.get(i)!.phase !== 'solid');
    expect(liquids.length).toBeLessThanOrEqual(2);
    liquids.forEach((i, k) => expect(setBinding(s.bp, ds, pool, `out${4 + k}`, i).ok).toBe(true));
    if (liquids[0]) wire(s, pool, 4, put(s, 'liquid_storager_1', 10, 22), 0);
    if (liquids[1]) wire(s, pool, 5, put(s, 'liquid_storager_1', 10, 40), 0);

    const f = solve(s.bp, ds).machines.get(pool)!;
    expect(f.utilization).toBeGreaterThan(0.1);
    expect(f.running.sort()).toEqual([A, B].sort());
  });
});

describe('giới hạn lò phản ứng (người dùng chốt 2026-09-28)', () => {
  /** Lò có nước + bột xiranite + nước thải + dung dịch huyết đồng + bột sắt chảy vào. */
  function fed(
    machineId: 'mix_pool_1' | 'mix_pool_2',
    tick: string[] = [],
    second = 'item_liquid_copper_enr',
  ): { s: Scene; pool: number } {
    const s = scene(90, 90);
    const pool = put(s, machineId, 40, 40);
    const pipeIn = machineId === 'mix_pool_1' ? [2, 3] : [4, 5];
    const beltIn = machineId === 'mix_pool_1' ? [0, 1] : [0, 3];
    const w = put(s, 'pump_1', 60, 36);
    const cu = put(s, 'pump_1', 60, 46);
    const xi = put(s, 'miner_1', 44, 62);
    const fe = put(s, 'miner_1', 35, 62);
    source(s, w, 'item_liquid_water', 60);
    source(s, cu, second, 60);
    source(s, xi, 'item_xiranite_powder', 30);
    source(s, fe, 'item_iron_powder', 30);
    wire(s, w, 0, pool, pipeIn[0]!);
    wire(s, cu, 0, pool, pipeIn[1]!);
    wire(s, xi, 0, pool, beltIn[0]!);
    wire(s, fe, 0, pool, beltIn[1]!);
    tick.forEach((id, i) => (i === 0 ? setRecipe(s.bp, ds, pool, id) : toggleNotedRecipe(s.bp, ds, pool, id)));
    return { s, pool };
  }

  it('Lò Phản Ứng chỉ chạy 1 phản ứng một lúc — công thức tích tay được xếp chỗ trước', () => {
    const { s, pool } = fed('mix_pool_1');
    expect(solve(s.bp, ds).machines.get(pool)!.recipes).toHaveLength(1);
    const t = fed('mix_pool_1', ['pool_copper_enr_1']);
    expect(solve(t.s.bp, ds).machines.get(t.pool)!.recipes.map((r) => r.recipeId)).toEqual(['pool_copper_enr_1']);
  });

  const itemsOf = (ids: string[]): Set<string> => {
    const items = new Set<string>();
    for (const id of ids) {
      const r = ds.recipes.get(id)!;
      for (const st of [...r.ingredients, ...r.outcomes]) items.add(st.itemId);
    }
    return items;
  };

  it('Lò Mở Rộng chạy hơn 2 phản ứng cùng lúc khi bên trong vẫn ≤ 8 món', () => {
    // nước + bột xiranite + nước thải + bột sắt ⇒ Xiranite Lỏng → 2 loại Xircon → Xircon: 3 phản
    // ứng nối tiếp, đúng 8 món khác nhau
    const { s, pool } = fed('mix_pool_2', [], 'item_liquid_sewage');
    const ids = solve(s.bp, ds).machines.get(pool)!.recipes.map((r) => r.recipeId);
    expect(ids.sort()).toEqual(['pool_liquid_liquid_xiranite_2', 'pool_liquid_xiranite_poly_2', 'pool_xiranite_poly_2'].sort());
    expect(itemsOf(ids).size).toBe(8);
  });

  it('Lò Mở Rộng: công thức làm vượt 8 món thì không chạy (nằm chờ)', () => {
    // thêm dung dịch huyết đồng thay nước thải: 2 phản ứng đầu đã chiếm 7 món, phản ứng Xiranite
    // Lỏng + Nước Thải cần thêm 2 món nữa ⇒ 9 > 8 ⇒ không chạy dù đủ nguyên liệu trong lò
    const { s, pool } = fed('mix_pool_2');
    const ids = solve(s.bp, ds).machines.get(pool)!.recipes.map((r) => r.recipeId);
    expect(ids).not.toContain('pool_liquid_xiranite_poly_2');
    expect(itemsOf(ids).size).toBeLessThanOrEqual(8);
  });
});
