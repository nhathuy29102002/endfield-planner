import { describe, expect, it } from 'vitest';
import { resolveSlots } from '../src/model/binding';
import { setBinding, setRecipe } from '../src/editor/ops';
import { ds, put, scene } from './helpers';

const def = (id: string) => ds.machines.get(id)!;
const recipe = (id: string) => ds.recipes.get(id)!;

describe('gán item vào cổng', () => {
  it('nhiều slot hơn item ⇒ chế độ chọn, điền slot đầu', () => {
    const slots = resolveSlots(ds, def('furnance_1'), recipe('furnance_carbon_enr_1'));
    const beltIn = slots.filter((s) => s.dir === 'in' && s.kind === 'belt');
    expect(beltIn).toHaveLength(3);
    expect(beltIn.map((s) => s.mode)).toEqual(['choose', 'choose', 'choose']);
    expect(beltIn.map((s) => s.itemId)).toEqual(['item_carbon_enr_powder', null, null]);
  });

  it('slot bằng item ⇒ khoá, không sửa được', () => {
    // dismantler tháo bình: sản phẩm rắn có 6 slot (chọn), nhưng chất lỏng chỉ 1 ống (khoá)
    const slots = resolveSlots(ds, def('dismantler_1'), recipe('dismantler_copper_acid_1'));
    const pipeOut = slots.filter((s) => s.dir === 'out' && s.kind === 'pipe');
    expect(pipeOut).toHaveLength(1);
    expect(pipeOut[0]!.mode).toBe('locked');
    expect(pipeOut[0]!.itemId).toBe('item_liquid_acid');

    // máy thường không chọn cổng ra (luật 2026-09-28): mọi cổng băng ra = sản phẩm cuối, khoá
    const beltOut = slots.filter((s) => s.dir === 'out' && s.kind === 'belt');
    expect(beltOut).toHaveLength(6);
    for (const b of beltOut) expect(b).toMatchObject({ mode: 'locked', itemId: 'item_copper_bottle' });
  });

  it('cổng không dùng trong công thức thì để trống', () => {
    const slots = resolveSlots(ds, def('furnance_1'), recipe('furnance_carbon_enr_1'));
    for (const s of slots.filter((x) => x.kind === 'pipe')) {
      expect(s.mode).toBe('unused');
      expect(s.itemId).toBeNull();
    }
  });

  it('không có công thức thì mọi cổng đều trống', () => {
    for (const s of resolveSlots(ds, def('furnance_1'), null)) expect(s.mode).toBe('unused');
  });

  it('máy thường không chọn được cổng ra — tự đặt theo công thức', () => {
    // Luật 2026-09-28 (người dùng chốt): chỉ lõi, lõi phụ, cửa xả ống, ống dẫn dòng ra, máy dỡ
    // kho, Lò Phản Ứng, Lò Mở Rộng được chọn sản phẩm ra.
    const s = scene();
    const uid = put(s, 'dismantler_1', 5, 5);
    setRecipe(s.bp, ds, uid, 'dismantler_copper_acid_1');
    const r = setBinding(s.bp, ds, uid, 'out3', 'item_copper_bottle');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/không chọn được/);
  });

  it('lò phản ứng: chọn món cho một cổng băng ra ⇒ mọi cổng băng ra đổi theo', () => {
    const s = scene();
    const uid = put(s, 'mix_pool_2', 5, 5);
    const m = s.bp.machines[0]!;
    expect(setBinding(s.bp, ds, uid, 'out2', 'item_xiranite_powder').ok).toBe(true);
    for (let i = 0; i < 4; i++) expect(m.binding[`out${i}`]).toBe('item_xiranite_powder');
  });

  it('mọi cổng băng ra luôn chở chung một món — mặc định cũng vậy', () => {
    // Luật 2026-09-28 (người dùng chốt): bỏ cách giữ Ctrl để chọn riêng một cổng băng; các
    // băng chia nhau đẩy cùng một món. Chưa chọn gì thì mọi cổng băng ra = sản phẩm rắn đầu tiên.
    const s = scene();
    const uid = put(s, 'dismantler_1', 5, 5);
    setRecipe(s.bp, ds, uid, 'dismantler_copper_acid_1');
    const m = s.bp.machines[0]!;
    for (let i = 0; i < 6; i++) expect(m.binding[`out${i}`]).toBe('item_copper_bottle');
  });

  it('không sửa được slot đã khoá', () => {
    const s = scene();
    const uid = put(s, 'dismantler_1', 5, 5);
    setRecipe(s.bp, ds, uid, 'dismantler_copper_acid_1');
    const r = setBinding(s.bp, ds, uid, 'out6', 'item_liquid_acid');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/không chọn được/);
  });

  it('cổng kích hoạt không nằm trong bảng gán — nó không phải nguyên liệu', () => {
    const def = ds.machines.get('transmuter_1')!;
    const recipe = ds.recipes.get('liquid_transmuter_1_gas_gas_xiranite_enr_1')!;
    const keys = resolveSlots(ds, def, recipe).map((s) => s.key);
    expect(def.activatorPort).toBe('in2');
    expect(keys).not.toContain('in2');
    expect(keys).toContain('in0');
  });

  // Thay cho bài đếm "163/318 công thức vừa khoá vừa chọn": luật 2026-09-28 bỏ hẳn việc chọn
  // cổng ra ở máy thường, nên giờ kiểm luật mới trên **mọi** công thức.
  it('mọi công thức: máy thường khoá cổng ra, chỉ lò phản ứng chọn được', () => {
    for (const r of ds.recipes.values()) {
      const d = ds.machines.get(r.machineId);
      if (!d) continue;
      const outs = resolveSlots(ds, d, r).filter((x) => x.dir === 'out' && x.mode !== 'unused');
      const pool = d.type === 'FluidReaction';
      for (const o of outs) expect(o.mode).toBe(pool ? 'choose' : 'locked');
    }
  });
});
