import { describe, expect, it } from 'vitest';
import { removeBeltGroup, setRecipe } from '../src/editor/ops';
import { solve } from '../src/sim/solver';
import { Lane, clockwiseFrom, createSimulation } from '../src/simulation/engine';
import { SECONDS_PER_CELL, STORE } from '../src/simulation/params';
import { demoPlan } from '../src/editor/demo';
import { buildNetwork } from '../src/model/network';
import { worldPorts } from '../src/model/geometry';
import { importFile } from '../src/blueprint/library';
import wlsc from './fixtures/full-wlsc-map.efp.json';
import { ds, paint, put, scene, source, wire, type Scene } from './helpers';

/**
 * Simulation — giai đoạn 1 (người dùng 2026-10-03, `SIMULATION.md`): bộ máy mô phỏng theo thời gian chạy ngầm.
 * Chạy đủ lâu thì sản lượng trung bình phải khớp bộ giải ổn định.
 */
// Luật đổi 2026-10-04 (người dùng): hàng rắn đưa vào Kho Lưu Trữ Giao Thức (`storager_1`) tính là **nạp vào kho tổng**
// ⇒ các bài dùng kho này làm điểm cuối đọc `totals.depotIn` thay cho `totals.stored`.
const MOSS = 'item_plant_moss_enr_powder_1';
const POWDER = 'item_carbon_enr_powder';
const CARBON = 'item_carbon_enr';

/** mỏ → lò A (bột moss → bột carbon) → lò B (bột carbon → carbon) → kho (như `solver.test.ts`) */
function chain(sourceRate: number): { s: Scene; ids: Record<string, number>; groups: Record<string, number> } {
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

describe('simulation — tuyến băng / ống', () => {
  it('băng 2 s/ô, ống 0,5 s/ô (30 và 120 mỗi phút, mỗi ô một món lúc dày nhất)', () => {
    expect(SECONDS_PER_CELL.belt).toBe(2);
    expect(SECONDS_PER_CELL.pipe).toBe(0.5);
  });

  it('món đi hết tuyến 5 ô mất 10 s; vào cách nhau ≥ 2 s; tuyến 5 ô chứa 5 món + 1 món đang trao tay ở cuối', () => {
    const lane = new Lane('x', 'belt', 5, { uid: 1, portKey: 'out0' }, null);
    expect(lane.push('a', 0, 100)).toBe(0);
    expect(lane.items[0]!.ready).toBe(10);
    expect(lane.push('a', 0, 100)).toBe(2); // phải cách món trước một ô
    for (let i = 0; i < 4; i++) expect(lane.push('a', 0, 100)).not.toBeNull();
    expect(lane.push('a', 0, 100)).toBeNull(); // đầy
    expect(lane.headTime()).toBe(10);
  });

  it('chỗ trống chỉ dùng được từ lúc món trước thật sự ra khỏi tuyến', () => {
    const lane = new Lane('x', 'belt', 1, { uid: 1, portKey: 'out0' }, null);
    lane.push('a', 0, 100);
    lane.push('a', 0, 100);
    lane.shift(7); // món đầu ra lúc 7 s
    expect(lane.push('a', 0, 100)).toBe(7); // món thứ 3 dùng chỗ của món thứ 1
  });

  it('chiều kim đồng hồ quanh van bắt đầu từ bên trái hướng hàng vào', () => {
    // hàng đi lên (0): trái = 3, thẳng = 0, phải = 1
    expect(clockwiseFrom(0).slice(0, 3)).toEqual([3, 0, 1]);
  });
});

describe('simulation — máy và chuỗi', () => {
  it('nguồn đủ: sau 1 giờ mỗi lò ≈ 30 mẻ/phút như bộ giải, thời gian khởi động chỉ làm hụt chút ít', () => {
    const { s, ids } = chain(30);
    const sim = createSimulation(s.bp, ds);
    sim.run(3600);
    const perMin = (uid: number): number => sim.machine(uid)!.stats.cycles / 60;
    expect(perMin(ids.a!)).toBeGreaterThan(29.5);
    expect(perMin(ids.a!)).toBeLessThanOrEqual(30);
    expect(perMin(ids.b!)).toBeGreaterThan(29.3);
    expect(sim.totals.depotIn.get(CARBON)! / 60).toBeGreaterThan(29);
    const r = solve(s.bp, ds);
    expect(r.balance.get(CARBON)!.produced).toBeCloseTo(30, 3);
  });

  it('nguồn thiếu (15/phút): lò chạy khoảng một nửa thời gian', () => {
    const { s, ids } = chain(15);
    const sim = createSimulation(s.bp, ds);
    sim.run(3600);
    const st = sim.machine(ids.a!)!.stats;
    expect(st.cycles / 60).toBeGreaterThan(14.5);
    expect(st.cycles / 60).toBeLessThanOrEqual(15.01);
    expect(st.running / 3600).toBeCloseTo(0.5, 1);
  });

  it('đầu ra không có chỗ đi: ô đầu ra đầy 50 thì máy dừng, kẹt lan ngược về nguồn', () => {
    const { s, ids, groups } = chain(30);
    removeBeltGroup(s.bp, groups.bToStore!);
    const sim = createSimulation(s.bp, ds);
    sim.run(1800);
    const b = sim.machine(ids.b!)!;
    expect(b.output.get(CARBON)).toBe(STORE);
    expect(b.stats.cycles).toBe(STORE);
    expect(b.stats.blocked).toBeGreaterThan(1000);
    // lò A cũng dừng khi băng A→B và ô đầu ra của nó đầy
    const a = sim.machine(ids.a!)!;
    expect(a.output.get(POWDER)).toBe(STORE);
    expect(sim.totals.produced.get(CARBON)).toBe(STORE);
  });

  it('máy không nhận món không phải nguyên liệu của công thức nào ⇒ băng vào kẹt, kho máy vẫn rỗng', () => {
    const furnaceInputs = new Set((ds.recipesByMachine.get('furnance_1') ?? []).flatMap((r) => r.ingredients.map((i) => i.itemId)));
    const stranger = [...ds.items.values()].find((i) => i.phase === 'solid' && !furnaceInputs.has(i.id))!.id;
    const { s, ids } = chain(30);
    source(s, ids.mine!, stranger, 30);
    const sim = createSimulation(s.bp, ds);
    sim.run(600);
    const a = sim.machine(ids.a!)!;
    expect(a.store.size).toBe(0);
    expect(a.stats.cycles).toBe(0);
    const lane = sim.lanes.find((l) => l.from.uid === ids.mine)!;
    expect(lane.items.length).toBe(lane.cap); // băng đầy, món đầu đứng chờ
    expect(lane.delivered).toBe(0);
  });

  it('kết quả gần như không đổi theo bước thời gian (mọi chuyển hàng có mốc thời gian riêng)', () => {
    const { s, ids } = chain(30);
    const fine = createSimulation(s.bp, ds);
    fine.run(1800, 0.1);
    const coarse = createSimulation(s.bp, ds);
    coarse.run(1800, 1);
    const f = fine.machine(ids.b!)!.stats.cycles;
    const c = coarse.machine(ids.b!)!.stats.cycles;
    expect(Math.abs(f - c) / f).toBeLessThan(0.01);
  });
});

describe('simulation — đối chiếu bộ giải trên bản mẫu', () => {
  it('bản mẫu: sau khi chạy ổn định (đo phút 30 → 60), sản lượng máy chế biến và kho tổng ≈ bộ giải (±2%)', () => {
    const bp = demoPlan(ds).bp;
    const r = solve(bp, ds);
    const sim = createSimulation(bp, ds);
    // nửa giờ đầu để các kho máy / trạm điện nạp đầy (trạm điện tích sẵn 50 pin) rồi mới đo
    sim.run(1800, 0.5);
    const produced0 = new Map(sim.totals.produced);
    const depot0 = new Map(sim.totals.depot);
    sim.run(1800, 0.5);
    const rate = (now: Map<string, number>, before: Map<string, number>, item: string): number => ((now.get(item) ?? 0) - (before.get(item) ?? 0)) / 30;
    // sản phẩm của máy chế biến (bộ giải tính cả món rút từ kho tổng vào "làm ra", mô phỏng thì không)
    for (const f of r.machines.values()) {
      if (f.role !== 'crafter') continue;
      for (const o of f.outputs) {
        if (o.actual <= 0) continue;
        const got = rate(sim.totals.produced, produced0, o.itemId);
        expect(Math.abs(got - o.actual) / o.actual, o.itemId).toBeLessThan(0.02);
      }
    }
    for (const [item, d] of r.depot) {
      const want = d.in - d.out;
      if (Math.abs(want) < 1) continue;
      const got = rate(sim.totals.depot, depot0, item);
      expect(Math.abs(got - want) / Math.abs(want), item).toBeLessThan(0.02);
    }
  });
});

describe('simulation — van chia (§2.3)', () => {
  /**
   * Mỏ → van chia; một cổng ra của van **kề thẳng** cổng vào của lò (không băng ở giữa), một cổng ra khác có băng.
   * `deadEnd` = băng đó cụt (không vào máy nào) ⇒ đầy rồi thì hàng mới vào lò.
   */
  function splitterScene(deadEnd: boolean): { sim: ReturnType<typeof createSimulation>; furnace: number; mine: number } {
    const s = scene(40, 40);
    paint(s.terrain, 'mine', 4, 29, 5, 5);
    const mine = put(s, 'miner_1', 5, 30);
    source(s, mine, MOSS, 30);
    const furnace = put(s, 'furnance_1', 20, 20);
    setRecipe(s.bp, ds, furnace, 'furnance_carbon_enr_powder_1');
    const def = ds.machines.get('furnance_1')!;
    const fm = s.bp.machines.find((m) => m.uid === furnace)!;
    const port = worldPorts(fm, def).find((p) => p.key === 'in1')!;
    let splitter = -1;
    for (const rot of [0, 90, 180, 270] as const) {
      splitter = put(s, 'log_splitter', port.attach.x, port.attach.z, rot);
      if (buildNetwork(s.bp, ds).chains.some((c) => c.tiles.length === 0 && c.from?.uid === splitter && c.to?.uid === furnace)) break;
      s.bp.machines = s.bp.machines.filter((m) => m.uid !== splitter);
    }
    const net = buildNetwork(s.bp, ds);
    const direct = net.chains.find((c) => c.tiles.length === 0 && c.from?.uid === splitter)!;
    expect(direct).toBeDefined();
    wire(s, mine, 0, splitter, 0);
    const other = [0, 1, 2].map((i) => `out${i}`).find((k) => k !== direct.from!.portKey)!;
    if (deadEnd) {
      // băng cụt 4 ô: nối tới một kho rồi bỏ kho đi
      const store = put(s, 'storager_1', 28, 10);
      wire(s, splitter, Number(other.slice(3)), store, 0);
      s.bp.machines = s.bp.machines.filter((m) => m.uid !== store);
    } else {
      const store = put(s, 'storager_1', 28, 10);
      wire(s, splitter, Number(other.slice(3)), store, 0);
    }
    // sản phẩm của lò có chỗ đi
    const sink = put(s, 'storager_1', 20, 8);
    wire(s, furnace, 0, sink, 0);
    const sim = createSimulation(s.bp, ds);
    sim.run(900);
    return { sim, furnace, mine };
  }

  it('cổng ra kề thẳng máy chế biến chỉ nhận hàng khi băng còn lại đầy: băng thông ⇒ lò không nhận gì', () => {
    const { sim, furnace } = splitterScene(false);
    expect(sim.machine(furnace)!.stats.cycles).toBe(0);
    expect(sim.totals.depotIn.get(MOSS)! / 15).toBeGreaterThan(25);
  });

  it('băng còn lại cụt (đầy) ⇒ hàng sang lò, lò chạy gần đủ', () => {
    const { sim, furnace } = splitterScene(true);
    expect(sim.machine(furnace)!.stats.cycles / 15).toBeGreaterThan(25);
  });
});

describe('simulation — luật người dùng chốt 2026-10-03 (lần 2)', () => {
  it('vòng hạt giống tự chạy hết công suất; lò chạy mọi công thức đủ nguyên liệu ⇒ map WLSC ra đủ 6 Pin/phút như bộ giải', () => {
    const bp = importFile(JSON.stringify(wlsc), 'x')[0]!.map!.blueprint;
    const sim = createSimulation(bp, ds);
    sim.run(1800, 0.5);
    const before = sim.totals.produced.get('item_proc_battery_5') ?? 0;
    sim.run(1800, 0.5);
    const perMin = ((sim.totals.produced.get('item_proc_battery_5') ?? 0) - before) / 30;
    expect(perMin).toBeGreaterThan(5.9);
    expect(perMin).toBeLessThan(6.05);
  }, 60000);

  it('van gộp nhận luân phiên từng nhánh: hai nguồn 30/phút vào một băng ra ⇒ mỗi món một nửa', () => {
    const s = scene(40, 40);
    paint(s.terrain, 'mine', 0, 29, 12, 5);
    const m1 = put(s, 'miner_1', 0, 30);
    const m2 = put(s, 'miner_1', 6, 30);
    source(s, m1, MOSS, 30);
    source(s, m2, POWDER, 30);
    const conv = put(s, 'log_converger', 7, 20);
    const store = put(s, 'storager_1', 6, 8);
    wire(s, conv, 0, store, 0);
    wire(s, m2, 0, conv, 1);
    wire(s, m1, 0, conv, 0);
    const sim = createSimulation(s.bp, ds);
    sim.run(1800, 0.25);
    const a = sim.totals.depotIn.get(MOSS) ?? 0;
    const b = sim.totals.depotIn.get(POWDER) ?? 0;
    expect(a + b).toBeGreaterThan(850); // băng ra chạy gần hết 30/phút
    // nhánh dài hơn tới muộn hơn lúc đầu, sau đó hai nhánh xen kẽ đều
    expect(Math.abs(a - b) / (a + b)).toBeLessThan(0.03);
  });

  it('kho tổng không vô hạn: bắt đầu rỗng ⇒ Máy Dỡ Hàng Kho không rút được gì; vô hạn (mặc định) thì rút đủ', () => {
    const bp = demoPlan(ds).bp;
    const finite = createSimulation(bp, ds, { infiniteDepot: false });
    finite.run(600, 0.5);
    expect(finite.totals.produced.get(CARBON) ?? 0).toBe(0);
    const inf = createSimulation(bp, ds);
    inf.run(600, 0.5);
    expect(inf.totals.produced.get(CARBON)!).toBeGreaterThan(250);
  });
});

describe('simulation — sửa map trong lúc mô phỏng (người dùng 2026-10-03)', () => {
  it('dựng lại sau khi map đổi: đồng hồ, kho máy, mẻ, hàng trên băng, tổng cộng được giữ; máy mới bắt đầu rỗng', () => {
    const { s, ids } = chain(30);
    const sim = createSimulation(s.bp, ds);
    sim.run(300, 0.25);
    const before = {
      now: sim.now,
      cycles: sim.machine(ids.b!)!.stats.cycles,
      onBelt: sim.lanes.map((l) => l.items.length).reduce((a, b) => a + b, 0),
      made: sim.totals.produced.get(CARBON),
    };
    // thêm một máy không liên quan
    const extra = put(s, 'storager_1', 25, 25);
    const next = createSimulation(s.bp, ds, {}, sim);
    expect(next.now).toBe(before.now);
    expect(next.machine(ids.b!)!.stats.cycles).toBe(before.cycles);
    expect(next.lanes.map((l) => l.items.length).reduce((a, b) => a + b, 0)).toBe(before.onBelt);
    expect(next.totals.produced.get(CARBON)).toBe(before.made);
    expect(next.machine(extra)!.store.size).toBe(0);
    // chạy tiếp vẫn đúng nhịp: thêm 300 s ≈ thêm 150 mẻ
    next.run(300, 0.25);
    expect(next.machine(ids.b!)!.stats.cycles - before.cycles).toBeGreaterThan(145);
  });

  it('xoá băng đầu ra trong lúc chạy: hàng trên băng đó mất, phần còn lại chạy tiếp và kẹt dần', () => {
    const { s, ids, groups } = chain(30);
    const sim = createSimulation(s.bp, ds);
    sim.run(300, 0.25);
    removeBeltGroup(s.bp, groups.bToStore!);
    const next = createSimulation(s.bp, ds, {}, sim);
    next.run(600, 0.25);
    expect(next.machine(ids.b!)!.output.get(CARBON)).toBe(STORE);
  });
});
