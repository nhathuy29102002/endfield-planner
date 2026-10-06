import { describe, expect, it } from 'vitest';
import { addMachine, setFilterItem, setFilterRate, setRecipe, toggleNotedRecipe } from '../src/editor/ops';
import { buildNetwork } from '../src/model/network';
import { solve, type SolveResult } from '../src/sim/solver';
import { ds, put, scene, source, wire, type Scene } from './helpers';

/**
 * Luật van / cảng kiểm soát / băng lẫn món (người dùng chốt 2026-09-29):
 *  - van tách chia đều theo số nhánh đã nối; nhánh nhận ít hơn thì phần dư sang nhánh khác;
 *  - van gộp cộng dồn nhưng không vượt sức chở tuyến ra (ống 120, băng 30);
 *  - băng chở lẫn được nhiều món (chia nhau 30/phút), ống chỉ một chất;
 *  - cảng kiểm soát: chỉ cho món đã chọn qua, gặp món khác thì cả tuyến vào nghẽn; chưa chọn thì
 *    cho qua mọi thứ; cảng ống còn giới hạn tốc độ (bội số của 6, ≤ 60);
 *  - băng lẫn nhiều món vào máy thường ⇒ kẹt; máy thường chỉ chạy 1 công thức một lúc.
 */

const machineAt = (s: Scene, id: string, x: number, z: number, rot: 0 | 90 | 180 | 270 = 0): number => {
  const r = addMachine(s.bp, ds, s.terrain, id, x, z, rot);
  if (!r.ok || r.uid === undefined) throw new Error(`đặt ${id} thất bại: ${r.reason}`);
  return r.uid;
};

/** Lượng chảy vào máy `uid` (tổng mọi tuyến tới nó). */
function inflow(s: Scene, r: SolveResult, uid: number): number {
  let sum = 0;
  for (const c of buildNetwork(s.bp, ds).chains) if (c.to?.uid === uid) sum += r.links.get(c.id)?.rate ?? 0;
  return sum;
}

/** Bơm nước 120/phút → van tách ống → 3 bể; `limited` = nhánh phải đi qua cảng kiểm soát ống. */
function pipeSplit(limitRate?: number): { s: Scene; tanks: number[]; pump: number } {
  const s = scene(60, 60);
  const pump = put(s, 'pump_1', 19, 40);
  source(s, pump, 'item_liquid_water', 120);
  const split = machineAt(s, 'log_pipe_splitter', 20, 25);
  wire(s, pump, 0, split, 0);
  const left = put(s, 'liquid_storager_1', 5, 20);
  const up = put(s, 'liquid_storager_1', 19, 5);
  const right = put(s, 'liquid_storager_1', 45, 20);
  wire(s, split, 0, left, 0);
  wire(s, split, 1, up, 0);
  if (limitRate === undefined) wire(s, split, 2, right, 0);
  else {
    const gate = machineAt(s, 'log_pipe_conditioner', 30, 25, 90); // dòng chảy sang phải
    wire(s, split, 2, gate, 0);
    wire(s, gate, 0, right, 0);
    expect(setFilterRate(s.bp, ds, gate, limitRate).ok).toBe(true);
  }
  return { s, tanks: [left, up, right], pump };
}

describe('van tách / van gộp', () => {
  it('van tách chia đều theo số nhánh đã nối: 120 ⇒ 40 × 3', () => {
    const { s, tanks } = pipeSplit();
    const r = solve(s.bp, ds);
    for (const t of tanks) expect(inflow(s, r, t)).toBeCloseTo(40, 4);
  });

  it('một nhánh qua cảng kiểm soát ống 6/phút ⇒ 6, phần dư dồn sang 2 nhánh kia: 57 + 57', () => {
    const { s, tanks } = pipeSplit(6);
    const r = solve(s.bp, ds);
    expect(inflow(s, r, tanks[2]!)).toBeCloseTo(6, 4);
    expect(inflow(s, r, tanks[0]!)).toBeCloseTo(57, 4);
    expect(inflow(s, r, tanks[1]!)).toBeCloseTo(57, 4);
  });

  it('van gộp cộng dồn nhưng không vượt 120 của ống: 3 bơm × 60 ⇒ 120', () => {
    const s = scene(60, 60);
    const merge = machineAt(s, 'log_pipe_converger', 25, 30);
    const pumps = [put(s, 'pump_1', 5, 29), put(s, 'pump_1', 24, 45), put(s, 'pump_1', 40, 29)];
    for (const pmp of pumps) source(s, pmp, 'item_liquid_water', 60);
    wire(s, pumps[0]!, 0, merge, 2);
    wire(s, pumps[1]!, 0, merge, 1);
    wire(s, pumps[2]!, 0, merge, 0);
    const tank = put(s, 'liquid_storager_1', 24, 10);
    wire(s, merge, 0, tank, 0);
    const r = solve(s.bp, ds);
    expect(inflow(s, r, tank)).toBeCloseTo(120, 4);
    const shipped = pumps.map((u) => r.machines.get(u)!.outputs[0]!.actual);
    expect(shipped.reduce((a, b) => a + b, 0)).toBeCloseTo(120, 4);
  });

  it('van tách không nối ra đâu ⇒ không nhận gì, phía trước bị hãm', () => {
    const s = scene(60, 60);
    const pump = put(s, 'pump_1', 19, 40);
    source(s, pump, 'item_liquid_water', 120);
    const split = machineAt(s, 'log_pipe_splitter', 20, 25);
    wire(s, pump, 0, split, 0);
    const r = solve(s.bp, ds);
    expect(r.machines.get(pump)!.outputs[0]!.actual).toBeCloseTo(0, 6);
  });
});

/** 2 mỏ (quặng sắt, quặng đồng) → van gộp băng → đích. */
function mixedBelt(dstId: string): { s: Scene; merge: number; dst: number } {
  const s = scene(60, 60);
  const merge = machineAt(s, 'log_converger', 25, 30);
  const a = put(s, 'miner_1', 5, 29);
  const b = put(s, 'miner_1', 40, 29);
  source(s, a, 'item_iron_ore', 30);
  source(s, b, 'item_copper_ore', 30);
  wire(s, a, 0, merge, 2);
  wire(s, b, 0, merge, 0);
  const dst = put(s, dstId, 24, 10);
  return { s, merge, dst };
}

describe('băng chở lẫn nhiều món, ống chỉ một chất', () => {
  it('van gộp băng: 2 món chia nhau 30/phút của băng', () => {
    const { s, merge, dst } = mixedBelt('storager_1');
    wire(s, merge, 0, dst, 0);
    const r = solve(s.bp, ds);
    const f = r.machines.get(dst)!;
    const got = Object.fromEntries(f.inputs.map((i) => [i.itemId, i.actual]));
    expect(got.item_iron_ore).toBeCloseTo(15, 4);
    expect(got.item_copper_ore).toBeCloseTo(15, 4);
    const link = [...r.links.values()].find((l) => l.items.length === 2)!;
    expect(link.rate).toBeCloseTo(30, 4);
  });

  it('băng lẫn món vào máy thường ⇒ kẹt', () => {
    const { s, merge, dst } = mixedBelt('furnance_1');
    wire(s, merge, 0, dst, 0);
    const r = solve(s.bp, ds);
    const bad = [...r.links.values()].filter((l) => l.invalid !== null);
    expect(bad.some((l) => /lẫn nhiều món/.test(l.invalid!))).toBe(true);
    expect(inflow(s, r, dst)).toBeCloseTo(0, 6);
  });

  it('gộp 2 chất khác nhau vào một ống ⇒ kẹt', () => {
    const s = scene(60, 60);
    const merge = machineAt(s, 'log_pipe_converger', 25, 30);
    const a = put(s, 'pump_1', 5, 29);
    const b = put(s, 'pump_1', 40, 29);
    source(s, a, 'item_liquid_water', 60);
    source(s, b, 'item_liquid_sewage', 60);
    wire(s, a, 0, merge, 2);
    wire(s, b, 0, merge, 0);
    wire(s, merge, 0, put(s, 'liquid_storager_1', 24, 10), 0);
    const r = solve(s.bp, ds);
    expect([...r.links.values()].some((l) => /một chất/.test(l.invalid ?? ''))).toBe(true);
  });
});

describe('cảng kiểm soát', () => {
  function gated(filter: string | null): { s: Scene; store: number } {
    const { s, merge } = mixedBelt('storager_1');
    const gate = machineAt(s, 'log_conditioner', 25, 20); // dòng chảy đi lên
    wire(s, merge, 0, gate, 0);
    const store = put(s, 'storager_1', 24, 5);
    wire(s, gate, 0, store, 0);
    if (filter) expect(setFilterItem(s.bp, ds, gate, filter).ok).toBe(true);
    return { s, store };
  }

  it('chưa chọn vật phẩm ⇒ cho qua mọi thứ', () => {
    const { s, store } = gated(null);
    const r = solve(s.bp, ds);
    expect(inflow(s, r, store)).toBeCloseTo(30, 4);
  });

  it('chọn Quặng Sắt mà băng lẫn Quặng Đồng ⇒ cả tuyến vào nghẽn', () => {
    const { s, store } = gated('item_iron_ore');
    const r = solve(s.bp, ds);
    expect([...r.links.values()].some((l) => /cả tuyến bị nghẽn/.test(l.invalid ?? ''))).toBe(true);
    expect(inflow(s, r, store)).toBeCloseTo(0, 6);
  });

  it('cảng băng chỉ lọc vật rắn; chỉ cảng ống mới chỉnh tốc độ (bội số 6, ≤ 60)', () => {
    const s = scene();
    const belt = machineAt(s, 'log_conditioner', 5, 5);
    const pipe = machineAt(s, 'log_pipe_conditioner', 10, 5);
    expect(setFilterItem(s.bp, ds, belt, 'item_liquid_water').ok).toBe(false);
    expect(setFilterItem(s.bp, ds, pipe, 'item_liquid_water').ok).toBe(true);
    expect(setFilterRate(s.bp, ds, belt, 6).ok).toBe(false);
    expect(setFilterRate(s.bp, ds, pipe, 7).ok).toBe(false);
    expect(setFilterRate(s.bp, ds, pipe, 66).ok).toBe(false);
    expect(setFilterRate(s.bp, ds, pipe, 60).ok).toBe(true);
    expect(setFilterRate(s.bp, ds, pipe, null).ok).toBe(true);
  });
});

describe('máy thường chỉ chạy 1 công thức một lúc', () => {
  it('tích 2 công thức, cả hai đủ đầu vào ⇒ chỉ công thức tích trước chạy', () => {
    const s = scene(60, 60);
    const f = put(s, 'furnance_1', 25, 25);
    const moss = put(s, 'miner_1', 26, 40);
    const ore = put(s, 'miner_1', 20, 40);
    source(s, moss, 'item_plant_moss_enr_powder_1', 30);
    source(s, ore, 'item_iron_ore', 30);
    wire(s, moss, 0, f, 0);
    wire(s, ore, 0, f, 2);
    setRecipe(s.bp, ds, f, 'furnance_carbon_enr_powder_1');
    const iron = ds.recipesByMachine.get('furnance_1')!.find((r) => r.ingredients.some((i) => i.itemId === 'item_iron_ore'))!;
    toggleNotedRecipe(s.bp, ds, f, iron.id);
    const flow = solve(s.bp, ds).machines.get(f)!;
    expect(flow.recipes.map((r) => r.recipeId)).toEqual(['furnance_carbon_enr_powder_1']);
  });
});
