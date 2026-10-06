import { describe, expect, it } from 'vitest';
import { setRecipe } from '../src/editor/ops';
import { createSimulation } from '../src/simulation/engine';
import { ds, paint, put, scene, source, wire } from './helpers';

/**
 * Người dùng 2026-10-06: máy có nhiều cổng ra cùng nối băng đi thì phải chia sản phẩm **luân phiên** cho từng cổng như
 * van tách — trước đây cổng đầu nhận hết (băng chở được 30/phút nên chưa bao giờ đầy), cổng kia không có gì.
 */
describe('nhiều cổng ra của một máy', () => {
  it('lò A (30 mẻ/phút) nối 2 cổng ra tới 2 lò ⇒ mỗi lò ≈ 15 mẻ/phút', () => {
    const s = scene(40, 40);
    paint(s.terrain, 'mine', 9, 33, 5, 5);
    const mine = put(s, 'miner_1', 10, 34);
    const a = put(s, 'furnance_1', 10, 26);
    const b1 = put(s, 'furnance_1', 4, 14);
    const b2 = put(s, 'furnance_1', 12, 16);
    source(s, mine, 'item_plant_moss_enr_powder_1', 30);
    setRecipe(s.bp, ds, a, 'furnance_carbon_enr_powder_1');
    setRecipe(s.bp, ds, b1, 'furnance_carbon_enr_1');
    setRecipe(s.bp, ds, b2, 'furnance_carbon_enr_1');
    wire(s, mine, 0, a, 0);
    wire(s, a, 0, b1, 1);
    wire(s, a, 2, b2, 1);
    wire(s, b1, 0, put(s, 'storager_1', 4, 4), 0);
    wire(s, b2, 0, put(s, 'storager_1', 12, 4), 0);
    const sim = createSimulation(s.bp, ds);
    sim.run(3600);
    const c1 = sim.machine(b1)!.stats.cycles / 60;
    const c2 = sim.machine(b2)!.stats.cycles / 60;
    expect(c1 + c2).toBeGreaterThan(29);
    expect(c1).toBeGreaterThan(13.5);
    expect(c2).toBeGreaterThan(13.5);
  });
});
