import { describe, expect, it } from 'vitest';
import { buildNetwork } from '../src/model/network';
import { planBelt, commitPlan } from '../src/editor/belts';
import { setRecipe } from '../src/editor/ops';
import { solve } from '../src/sim/solver';
import { createSimulation } from '../src/simulation/engine';
import { ds, paint, put, scene, source, wire } from './helpers';

/** Luật người dùng 2026-10-04 (lần 2). */
describe('luật 2026-10-04', () => {
  it('cổng ra của máy đặt sát cổng vào của máy khác ⇒ KHÔNG nhận hàng (phải có băng / ống ở giữa)', () => {
    const s = scene(30, 30);
    const a = put(s, 'furnance_1', 8, 10); // cổng ra phía trên (z = 9), cổng vào phía dưới
    const b = put(s, 'furnance_1', 8, 7); // đặt sát phía trên: cổng vào của B nằm đúng chỗ cổng ra của A
    const chains = buildNetwork(s.bp, ds).chains.filter((c) => c.tiles.length === 0);
    expect(chains.filter((c) => c.from?.uid === a && c.to?.uid === b)).toHaveLength(0);
  });

  it('máy → bộ chia (đặt sát) → máy (đặt sát): bộ chia / gộp / van / cầu tính là băng trung gian ⇒ vẫn nhận hàng', () => {
    const s = scene(30, 30);
    const a = put(s, 'furnance_1', 8, 12); // cổng ra giữa ở (9, 11)
    const sp = put(s, 'log_splitter', 9, 11); // bộ chia sát cổng ra
    const b = put(s, 'furnance_1', 8, 8); // cổng vào giữa của B ở (9, 10) — sát bộ chia
    const direct = buildNetwork(s.bp, ds).chains.filter((c) => c.tiles.length === 0);
    expect(direct.some((c) => c.from?.uid === a && c.to?.uid === sp)).toBe(true);
    expect(direct.some((c) => c.from?.uid === sp && c.to?.uid === b)).toBe(true);
  });

  it('van / cầu đặt sát cổng máy vẫn nhận / đẩy hàng như trước', () => {
    const s = scene(30, 30);
    const f = put(s, 'furnance_1', 8, 10);
    put(s, 'log_splitter', 9, 9); // van tách sát cổng ra giữa của lò
    const direct = buildNetwork(s.bp, ds).chains.filter((c) => c.tiles.length === 0 && c.from?.uid === f);
    expect(direct.length).toBe(1);
  });

  it('ống cắt vuông góc ống thẳng mà không đặt được cầu (mặt đất bên dưới có băng) ⇒ đi vòng, không đè cắt đứt tuyến cũ', () => {
    const s = scene(40, 40);
    commitPlan(s.bp, planBelt(s.bp, ds, { type: 'cell', x: 10, z: 2 }, { x: 10, z: 20 }, 'pipe')); // ống dọc
    commitPlan(s.bp, planBelt(s.bp, ds, { type: 'cell', x: 7, z: 10 }, { x: 13, z: 10 }, 'belt')); // băng bên dưới
    const before = s.bp.belts.filter((t) => t.kind === 'pipe').length;
    const plan = planBelt(s.bp, ds, { type: 'cell', x: 4, z: 12 }, { x: 16, z: 12 }, 'pipe');
    // ô (10,12) không có băng bên dưới ⇒ bắc cầu được ⇒ phải là cầu, không đè
    expect(plan.ok).toBe(true);
    expect(plan.bridges).toEqual([{ x: 10, z: 12 }]);
    const blocked = planBelt(s.bp, ds, { type: 'cell', x: 4, z: 10 }, { x: 16, z: 10 }, 'pipe');
    expect(blocked.ok).toBe(true);
    commitPlan(s.bp, blocked);
    // tuyến cũ còn nguyên: mỗi ô của nó vẫn là ống dọc, hoặc đã thành cầu ống (không ô nào bị đè đổi hướng)
    const pipesLeft = s.bp.belts.filter((t) => t.kind === 'pipe' && t.x === 10 && t.in === 2 && t.out === 2).length;
    const bridgesOnLine = s.bp.machines.filter((m) => m.machineId === 'log_pipe_connector' && m.x === 10).length;
    expect(pipesLeft + bridgesOnLine).toBe(before);
    expect(bridgesOnLine).toBe(1);
  });

  it('hàng rắn vào Kho Lưu Trữ Giao Thức = nạp vào kho tổng (bộ giải và mô phỏng)', () => {
    const s = scene(40, 40);
    paint(s.terrain, 'mine', 9, 29, 5, 5);
    const mine = put(s, 'miner_1', 10, 30);
    const furnace = put(s, 'furnance_1', 10, 24);
    const stash = put(s, 'storager_1', 10, 18);
    source(s, mine, 'item_plant_moss_enr_powder_1', 30);
    setRecipe(s.bp, ds, furnace, 'furnance_carbon_enr_powder_1');
    wire(s, mine, 0, furnace, 0);
    wire(s, furnace, 0, stash, 0);
    const r = solve(s.bp, ds);
    expect(r.depot.get('item_carbon_enr_powder')?.in ?? 0).toBeGreaterThan(29);
    const sim = createSimulation(s.bp, ds);
    sim.run(600, 0.5);
    expect(sim.totals.depotIn.get('item_carbon_enr_powder') ?? 0).toBeGreaterThan(200);
    expect(sim.totals.stored.get('item_carbon_enr_powder') ?? 0).toBe(0);
  });
});
