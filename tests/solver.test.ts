import { describe, expect, it } from 'vitest';
import { removeBeltGroup, setCount, setRecipe } from '../src/editor/ops';
import { solve } from '../src/sim/solver';
import { ds, paint, put, scene, source, wire, type Scene } from './helpers';

const MOSS = 'item_plant_moss_enr_powder_1';
const POWDER = 'item_carbon_enr_powder';
const CARBON = 'item_carbon_enr';

/** mỏ → lò A (bột moss → bột carbon) → lò B (bột carbon → carbon) → kho */
function chain(sourceRate: number): {
  s: Scene;
  ids: Record<string, number>;
  groups: Record<string, number>;
} {
  const s = scene(40, 40);
  paint(s.terrain, 'mine', 9, 29, 5, 5);
  const mine = put(s, 'miner_1', 10, 30);
  const a = put(s, 'furnance_1', 10, 24);
  const b = put(s, 'furnance_1', 10, 18);
  const store = put(s, 'storager_1', 10, 12);

  source(s, mine, MOSS, sourceRate);
  setRecipe(s.bp, ds, a, 'furnance_carbon_enr_powder_1');
  setRecipe(s.bp, ds, b, 'furnance_carbon_enr_1');

  const mineToA = wire(s, mine, 0, a, 0);
  const aToB = wire(s, a, 0, b, 0);
  const bToStore = wire(s, b, 0, store, 0);
  return { s, ids: { mine, a, b, store }, groups: { mineToA, aToB, bToStore } };
}

describe('solver', () => {
  it('nguồn đủ: cả chuỗi chạy 100%', () => {
    const { s, ids } = chain(30);
    const r = solve(s.bp, ds);
    expect([...r.links.values()].every((l) => l.invalid === null)).toBe(true);

    const a = r.machines.get(ids.a!)!;
    const b = r.machines.get(ids.b!)!;
    expect(a.utilization).toBeCloseTo(1, 6);
    expect(b.utilization).toBeCloseTo(1, 6);
    expect(a.cyclesPerMinute).toBeCloseTo(30, 6); // 2s/chu kỳ
    expect(a.bottleneck).toBeNull();
    expect(b.bottleneck).toBeNull();

    expect(r.balance.get(POWDER)).toEqual({ produced: 30, consumed: 30 });
    expect(r.balance.get(CARBON)!.produced).toBeCloseTo(30, 6);
    // chưa có cột/trụ nào ⇒ chưa máy nào nối điện ⇒ tải điện 0
    expect(r.powerDraw).toBe(0);
  });

  it('nguồn thiếu: hệ số chạy tụt theo, lan xuống cuối chuỗi', () => {
    const { s, ids } = chain(15);
    const r = solve(s.bp, ds);
    expect(r.machines.get(ids.a!)!.utilization).toBeCloseTo(0.5, 6);
    expect(r.machines.get(ids.b!)!.utilization).toBeCloseTo(0.5, 6);
    expect(r.machines.get(ids.a!)!.bottleneck).toMatch(/Thiếu/);
  });

  it('nghẽn ở sức chở băng chuyền, không phải ở nguyên liệu', () => {
    const { s, ids } = chain(400);
    // hai cụm 10 máy: nhu cầu 300/phút mỗi bên, nhưng một băng chỉ chở 30
    setCount(s.bp, ids.a!, 10);
    setCount(s.bp, ids.b!, 10);
    const r = solve(s.bp, ds);
    expect(r.machines.get(ids.a!)!.utilization).toBeCloseTo(30 / 300, 4);
    expect(r.machines.get(ids.b!)!.utilization).toBeCloseTo(30 / 300, 4);
    const inLink = [...r.links.values()].find((l) => l.itemId === MOSS)!;
    expect(inLink.rate).toBeCloseTo(30, 4);
    expect(inLink.saturated).toBe(true);
    expect(r.machines.get(ids.a!)!.bottleneck).toMatch(/Thiếu/);
  });

  it('phía sau tiêu thụ ít hơn thì phía trước bị hãm lại (backpressure)', () => {
    const { s, ids } = chain(400);
    setCount(s.bp, ids.a!, 10); // sản xuất tối đa 300/phút
    const r = solve(s.bp, ds);   // nhưng lò B chỉ ăn 30/phút
    expect(r.machines.get(ids.a!)!.utilization).toBeCloseTo(0.1, 4);
    expect(r.machines.get(ids.b!)!.utilization).toBeCloseTo(1, 4);
    expect(r.balance.get(POWDER)!.produced).toBeCloseTo(30, 4);
  });

  it('một băng chở đúng đủ cho một lò 2 giây — không thừa không thiếu', () => {
    const { s, ids } = chain(30);
    const r = solve(s.bp, ds);
    expect(r.machines.get(ids.a!)!.utilization).toBeCloseTo(1, 6);
    expect([...r.links.values()].every((l) => l.saturated)).toBe(true);
  });

  it('sản phẩm không có đường ra thì máy tắc', () => {
    const { s, ids, groups } = chain(30);
    removeBeltGroup(s.bp, groups.bToStore!);
    const r = solve(s.bp, ds);
    const b = r.machines.get(ids.b!)!;
    expect(b.utilization).toBeCloseTo(0, 6);
    expect(b.bottleneck).toMatch(/không có đường ra/);
    // và lò A tắc theo vì B không nhận nữa
    expect(r.machines.get(ids.a!)!.utilization).toBeCloseTo(0, 6);
  });

  it('đổi công thức thì băng giữ nguyên; máy vẫn tự chạy công thức khớp với thứ đang chảy vào', () => {
    // Luật đổi 2026-09-28 (người dùng chốt): máy tự nhận công thức theo nguyên liệu chảy vào.
    // Trước đây tích công thức khác ⇒ đoạn băng bị báo "không khớp"; giờ B tích công thức cần
    // moss (nằm chờ) nhưng vẫn tự nấu bột carbon đang chảy tới.
    const { s, ids } = chain(30);
    const before = s.bp.belts.length;
    setRecipe(s.bp, ds, ids.b!, 'furnance_carbon_enr_powder_1'); // B giờ tích công thức cần moss
    // băng là công trình của người dùng — không tự xoá
    expect(s.bp.belts.length).toBe(before);
    const r = solve(s.bp, ds);
    expect([...r.links.values()].every((l) => l.invalid === null)).toBe(true);
    const b = r.machines.get(ids.b!)!;
    expect(b.auto).toEqual(['furnance_carbon_enr_1']);
    expect(b.running).toEqual(['furnance_carbon_enr_1']); // công thức đã tích (moss) đang chờ
  });

  it('nối hai đầu chở khác nhau thì báo tuyến không hợp lệ chứ không tính bừa', () => {
    // bột carbon vào Máy Lắp Ráp — không công thức nào của máy đó dùng bột carbon
    const s = scene(40, 40);
    const a = put(s, 'furnance_1', 10, 24);
    const b = put(s, 'component_mc_1', 10, 18);
    setRecipe(s.bp, ds, a, 'furnance_carbon_enr_powder_1'); // ra: bột carbon
    wire(s, a, 0, b, 0);
    const r = solve(s.bp, ds);
    const bad = [...r.links.values()].filter((l) => l.invalid !== null);
    expect(bad).toHaveLength(1);
    expect(bad[0]!.invalid).toMatch(/khác nhau/);
  });

  it('máy nguồn chưa khai báo sản lượng thì nói rõ', () => {
    const s = scene(20, 20);
    paint(s.terrain, 'mine', 4, 4, 5, 5);
    const mine = put(s, 'miner_1', 5, 5);
    const r = solve(s.bp, ds);
    expect(r.machines.get(mine)!.bottleneck).toMatch(/sản lượng/);
  });

  it('kho là điểm nhận vô hạn: không hãm máy phía trước', () => {
    const { s, ids } = chain(30);
    const store = r0(s, ids.store!);
    expect(store.inputs[0]!.itemId).toBe(CARBON);
    expect(store.inputs[0]!.actual).toBeCloseTo(30, 6);
  });

  it('hội tụ, không sinh NaN', () => {
    const { s } = chain(37.5);
    const r = solve(s.bp, ds);
    expect(r.iterations).toBeLessThan(300);
    for (const m of r.machines.values()) expect(Number.isFinite(m.utilization)).toBe(true);
    for (const l of r.links.values()) expect(Number.isFinite(l.rate)).toBe(true);
  });
});

function r0(s: Scene, uid: number) {
  return solve(s.bp, ds).machines.get(uid)!;
}
