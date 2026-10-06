import { describe, expect, it } from 'vitest';
import { addMachine, setMode } from '../src/editor/ops';
import { recipesInMode } from '../src/model/binding';
import { buildNetwork } from '../src/model/network';
import { solve, type SolveResult } from '../src/sim/solver';
import { ds, put, scene, source, wire, type Scene } from './helpers';

const machineAt = (s: Scene, id: string, x: number, z: number): number => {
  const r = addMachine(s.bp, ds, s.terrain, id, x, z, 0);
  if (!r.ok || r.uid === undefined) throw new Error(`đặt ${id} thất bại: ${r.reason}`);
  return r.uid;
};
function inflow(s: Scene, r: SolveResult, uid: number): number {
  let sum = 0;
  for (const c of buildNetwork(s.bp, ds).chains) if (c.to?.uid === uid) sum += r.links.get(c.id)?.rate ?? 0;
  return sum;
}
/** 2 bơm (mỗi bơm `rate`/phút chất `item`) → van gộp ống → máy `dst`. */
function twoIntoMerge(item: string, rate: number, dst: string): { s: Scene; dstUid: number; r: SolveResult } {
  const s = scene(60, 60);
  const merge = machineAt(s, 'log_pipe_converger', 25, 30);
  const a = put(s, 'pump_1', 5, 29);
  const b = put(s, 'pump_1', 40, 29);
  source(s, a, item, rate);
  source(s, b, item, rate);
  wire(s, a, 0, merge, 2);
  wire(s, b, 0, merge, 0);
  const dstUid = put(s, dst, 24, 10);
  wire(s, merge, 0, dstUid, 0);
  return { s, dstUid, r: solve(s.bp, ds) };
}

describe('van gộp: cổng ra giới hạn như một đường ống / băng thường (người dùng 2026-09-29)', () => {
  it('2 đường Xircon Trơ Thải 30/phút vào một van gộp ống ⇒ ra 60/phút (dưới 120 của ống)', () => {
    const { s, dstUid, r } = twoIntoMerge('item_liquid_xiranite_lowpoly', 30, 'dumper_1');
    expect([...r.links.values()].every((l) => l.invalid === null)).toBe(true);
    expect(inflow(s, r, dstUid)).toBeCloseTo(60, 4);
  });
});

describe('Máy Gieo Trồng: 2 chế độ thường / nước (người dùng 2026-09-29)', () => {
  it('có chế độ Thường và Nước; công thức cần Nước Sạch thuộc chế độ nước', () => {
    const def = ds.machines.get('planter_1')!;
    // Luật đổi 2026-09-29: nhãn tiếng Việt cho mọi máy (trước là 'Normal' / 'Water'); nhãn game ở labelEn
    expect(def.modes?.map((m) => m.label)).toEqual(['Bình thường', 'Nước']);
    expect(def.modes?.map((m) => m.labelEn)).toEqual(['Normal', 'Water']);
    expect(def.modeAffectsRecipes).toBe(true);
    for (const r of ds.recipesByMachine.get('planter_1')!) {
      const water = r.ingredients.some((i) => i.itemId === 'item_liquid_water');
      expect(r.mode, r.id).toBe(water ? 'B' : 'A');
    }
    const normal = recipesInMode(ds, { mode: 'A' }, def).map((r) => r.id);
    const wet = recipesInMode(ds, { mode: 'B' }, def).map((r) => r.id);
    expect(wet.sort()).toEqual(['planter_plant_grass_1_1', 'planter_plant_grass_2_1']);
    expect(normal).toContain('planter_plant_moss_3_1');
    expect(normal.some((id) => wet.includes(id))).toBe(false);
  });

  it('đổi chế độ được trên máy đã đặt', () => {
    const s = scene(30, 30);
    const p = put(s, 'planter_1', 5, 5);
    expect(s.bp.machines[0]!.mode).toBe('A');
    expect(setMode(s.bp, ds, p, 'B').ok).toBe(true);
    expect(s.bp.machines[0]!.mode).toBe('B');
  });
});

describe('Bộ Xử Lý Nước Thải: loại bỏ Xircon Thải / Xircon Trơ Thải / Nước Thải, 30/phút (người dùng 2026-09-29)', () => {
  it('2 đường Nước Thải 30/phút ⇒ chỉ loại bỏ tổng 30/phút', () => {
    const { s, dstUid, r } = twoIntoMerge('item_liquid_sewage', 30, 'liquid_cleaner_1');
    expect([...r.links.values()].every((l) => l.invalid === null)).toBe(true);
    expect(inflow(s, r, dstUid)).toBeCloseTo(30, 4);
    expect(r.balance.get('item_liquid_sewage')!.consumed).toBeCloseTo(30, 4);
  });

  it('nhận cả Xircon Thải và Xircon Trơ Thải', () => {
    for (const item of ['item_liquid_xiranite_poly', 'item_liquid_xiranite_lowpoly']) {
      const { s, dstUid, r } = twoIntoMerge(item, 10, 'liquid_cleaner_1');
      expect(inflow(s, r, dstUid), item).toBeCloseTo(20, 4); // dưới 30 ⇒ nhận hết
    }
  });

  it('chất khác (Nước Sạch) vào ⇒ tuyến không hợp lệ', () => {
    const { r } = twoIntoMerge('item_liquid_water', 30, 'liquid_cleaner_1');
    const bad = [...r.links.values()].filter((l) => l.invalid !== null);
    expect(bad.length).toBeGreaterThan(0);
    expect(bad[0]!.invalid).toMatch(/chỉ loại bỏ/);
  });
});
