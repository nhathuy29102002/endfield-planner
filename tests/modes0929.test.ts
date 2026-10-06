import { describe, expect, it } from 'vitest';
import { addMachine, setMode, setRecipe } from '../src/editor/ops';
import { machineStatus } from '../src/render/status';
import { effectiveBinding } from '../src/model/binding';
import { worldPorts } from '../src/model/geometry';
import { solve } from '../src/sim/solver';
import { buildNetwork } from '../src/model/network';
import { ds, put, scene, source, wire } from './helpers';

/** Cổng đang tồn tại của một máy đặt mới ở chế độ `mode`, dạng `in0,in1,…` theo loại. */
function portsIn(id: string, mode: 'A' | 'B'): { belt: string[]; pipe: string[] } {
  const s = scene(40, 40);
  const uid = put(s, id, 10, 10);
  setMode(s.bp, ds, uid, mode);
  const m = s.bp.machines.find((v) => v.uid === uid)!;
  const list = worldPorts(m, ds.machines.get(id)!).filter((p) => !p.virtual);
  const of = (kind: 'belt' | 'pipe'): string[] => list.filter((p) => p.kind === kind).map((p) => p.key).sort();
  return { belt: of('belt'), pipe: of('pipe') };
}

describe('cổng đổi theo chế độ (người dùng 2026-09-29; bảng lấy từ EnKAD `modePortIndices`)', () => {
  it('Máy Đúc: chế độ thường không có cổng ống vào; chế độ khí có', () => {
    expect(portsIn('shaper_1', 'A').pipe).toEqual([]);
    expect(portsIn('shaper_1', 'B').pipe).toEqual(['in3']);
  });

  it('Lò Tinh Luyện: chế độ thường không có ống vào lẫn ống ra', () => {
    expect(portsIn('furnance_1', 'A').pipe).toEqual([]);
    expect(portsIn('furnance_1', 'B').pipe).toEqual(['in3', 'out3']);
    expect(portsIn('furnance_1', 'A').belt).toEqual(['in0', 'in1', 'in2', 'out0', 'out1', 'out2']);
  });

  it('Máy Gieo Trồng: chế độ thường không có cổng ống; chế độ nước có ống vào', () => {
    expect(portsIn('planter_1', 'A').pipe).toEqual([]);
    expect(portsIn('planter_1', 'B').pipe).toEqual(['in5']);
  });

  it('Máy Tinh Chế: chế độ lỏng 2 ống vào, không băng; chế độ khí 1 ống vào + 5 băng vào', () => {
    expect(portsIn('liquid_purifier_1', 'A')).toEqual({ belt: [], pipe: ['in0', 'in1', 'out0', 'out1'] });
    const gas = portsIn('liquid_purifier_1', 'B');
    expect(gas.pipe).toEqual(['in2', 'out0', 'out1']);
    expect(gas.belt).toEqual(['in3', 'in4', 'in5', 'in6', 'in7']);
  });

  it('Máy Chuyển Hóa Khí Rắn: khí hoá = băng vào → ống ra; rắn hoá = ống vào → băng ra', () => {
    // in2 là cổng kích hoạt (ống, mặt sau) — có ở cả hai chế độ
    expect(portsIn('transmuter_2', 'A')).toEqual({ belt: ['in3', 'in4'], pipe: ['in2', 'out0', 'out1'] });
    expect(portsIn('transmuter_2', 'B')).toEqual({ belt: ['out2', 'out3'], pipe: ['in0', 'in1', 'in2'] });
  });

  it('đổi chế độ ⇒ băng đang cắm vào cổng biến mất không còn nối vào máy', () => {
    const s = scene(60, 60);
    const f = put(s, 'furnance_1', 20, 20);
    setMode(s.bp, ds, f, 'B');
    const pump = put(s, 'pump_1', 40, 20);
    source(s, pump, 'item_liquid_water', 30);
    wire(s, pump, 0, f, 3);
    const into = (): number => buildNetwork(s.bp, ds).chains.filter((c) => c.to?.uid === f).length;
    expect(into()).toBe(1);
    setMode(s.bp, ds, f, 'A');
    expect(into()).toBe(0);
  });
});

describe('Quả Cầu Phản Ứng Khí / Máy Tinh Chế: sản phẩm 1 → cửa vàng, sản phẩm 2 → cửa cam (người dùng 2026-09-29)', () => {
  it('Máy Tinh Chế 2 sản phẩm: out0 (vàng) = sản phẩm đầu, out1 (cam) = sản phẩm thứ hai', () => {
    const def = ds.machines.get('liquid_purifier_1')!;
    const r = ds.recipes.get('liquid_purifier_copper_enr_1')!;
    const b = effectiveBinding(ds, def, r, {}, 'A');
    expect(b.out0).toBe(r.outcomes[0]!.itemId);
    expect(b.out1).toBe(r.outcomes[1]!.itemId);
  });

  it('một sản phẩm ⇒ chỉ cửa vàng chở, cửa cam trống (trước đây cả hai cổng cùng chở)', () => {
    const def = ds.machines.get('gas_reactor_1')!;
    const r = ds.recipes.get('gas_reactor_gas_copper_enr2_1')!;
    const b = effectiveBinding(ds, def, r, {});
    expect(b.out0).toBe('item_gas_copper_enr2');
    expect(b.out1).toBeNull();
  });

  it('không chọn được cổng ra (khoá theo công thức)', () => {
    const s = scene(40, 40);
    const g = put(s, 'gas_reactor_1', 10, 10);
    setRecipe(s.bp, ds, g, 'gas_reactor_activity_copper_poly_gas_1');
    expect(s.bp.machines[0]!.binding.out0).toBe('item_activity_copper_poly_gas');
    expect(s.bp.machines[0]!.binding.out1).toBeNull();
  });
});

describe('Bộ Xử Lý Nước Thải phải có điện mới xử lý (người dùng 2026-09-29)', () => {
  it('bật kiểm tra điện, không có cột điện ⇒ không nhận gì', () => {
    const s = scene(60, 60, true);
    const pump = put(s, 'pump_1', 30, 20);
    source(s, pump, 'item_liquid_sewage', 30);
    const cleaner = put(s, 'liquid_cleaner_1', 10, 20);
    wire(s, pump, 0, cleaner, 0);
    const r = solve(s.bp, ds);
    expect(r.balance.get('item_liquid_sewage')?.consumed ?? 0).toBeCloseTo(0, 6);
  });
});

describe('Lõi dùng chung kho tổng (người dùng 2026-09-29)', () => {
  it('đưa vào Lõi Giao Thức-Phụ = nạp vào kho tổng', () => {
    const s = scene(60, 60);
    const hub = put(s, 'sp_sub_hub_1', 20, 20);
    const src = put(s, 'miner_2', 21, 40);
    source(s, src, 'item_iron_nugget', 30);
    wire(s, src, 0, hub, 0);
    const r = solve(s.bp, ds);
    expect(r.depot.get('item_iron_nugget')?.in ?? 0).toBeCloseTo(30, 4);
  });
});

describe('Cửa Nạp Nước Thải ↔ Cửa Xả Phụ Phẩm (người dùng 2026-09-29)', () => {
  it('60 Nước Thải/phút vào cửa nạp ⇒ cửa xả đẩy ra 2 Xircon Thải/phút', () => {
    const s = scene(80, 60);
    const inlet = put(s, 'liquid_clean_gate_1', 10, 10);
    const pump = put(s, 'pump_1', 40, 10);
    source(s, pump, 'item_liquid_sewage', 60);
    wire(s, pump, 0, inlet, 0);
    const outlet = put(s, 'liquid_recycle_gate_1', 10, 30);
    const tank = put(s, 'liquid_storager_1', 40, 30);
    wire(s, outlet, 0, tank, 0);
    const r = solve(s.bp, ds);
    expect([...r.links.values()].every((l) => l.invalid === null)).toBe(true);
    expect(r.balance.get('item_liquid_sewage')!.consumed).toBeCloseTo(60, 4);
    expect(r.balance.get('item_liquid_xiranite_poly')!.produced).toBeCloseTo(2, 4);
  });

  it('cửa nạp chỉ nhận Nước Thải', () => {
    const s = scene(80, 60);
    const inlet = put(s, 'liquid_clean_gate_1', 10, 10);
    const pump = put(s, 'pump_1', 40, 10);
    source(s, pump, 'item_liquid_water', 30);
    wire(s, pump, 0, inlet, 0);
    const bad = [...solve(s.bp, ds).links.values()].filter((l) => l.invalid !== null);
    expect(bad[0]?.invalid).toMatch(/chỉ nhận/);
  });

  it('Cửa Xả Phụ Phẩm chỉ có một trên map', () => {
    const s = scene(80, 60);
    put(s, 'liquid_recycle_gate_1', 10, 10);
    const r = addMachine(s.bp, ds, s.terrain, 'liquid_recycle_gate_1', 10, 30, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/chỉ có một/);
  });
});

describe('biểu tượng trạng thái: chạy không hết công suất ⇒ vòng vàng "!" (người dùng 2026-09-29)', () => {
  it('0 < tốc độ < 100% ⇒ partial', () => {
    const flow = { powered: true, role: 'crafter', recipeId: 'x', outputs: [{ itemId: 'a', nominal: 1, actual: 0.5 }], limitedBy: 'output', utilization: 0.5 };
    expect(machineStatus(flow as never)).toBe('partial');
    expect(machineStatus({ ...flow, utilization: 0 } as never)).toBe('blocked');
    expect(machineStatus({ ...flow, utilization: 1, limitedBy: null } as never)).toBe('working');
  });
});
