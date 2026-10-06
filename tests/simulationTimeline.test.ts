import { describe, expect, it } from 'vitest';
import { createSimulation, DEFAULT_DEPOT_CAPACITY, type SimState, type Simulation } from '../src/simulation/engine';
import { createWorld, type SimWorld, type WorldState } from '../src/simulation/world';
import { decodeState, encodeState, MARK_EVERY, rateBetween, rateSeries, runJob, SimTimeline, SNAP_EVERY, type JobSpawner, type SimMark } from '../src/simulation/timeline';
import { demoPlan } from '../src/editor/demo';
import { setRecipe } from '../src/editor/ops';
import { importFile } from '../src/blueprint/library';
import type { Blueprint } from '../src/model/types';
import wlsc from './fixtures/full-wlsc-map.efp.json';
import { ds, paint, put, scene, source, wire } from './helpers';

/**
 * Simulation — giai đoạn 3 (người dùng 2026-10-03 "Làm bước 3", rồi lần 2: tính sẵn 24 giờ, nhóm map chung kho + điện,
 * điện thật sự đốt pin, xoá ô của máy, sản phẩm cũ không làm kẹt máy).
 */
const wlscMap = (): Blueprint => importFile(JSON.stringify(wlsc), 'x')[0]!.map!.blueprint;
const MOSS = 'item_plant_moss_enr_powder_1';
const POWDER = 'item_carbon_enr_powder';
const BATTERY = 'item_proc_battery_1';

/** Dấu vân tay của trạng thái để so: tổng cộng, kho máy, hàng trên tuyến. */
function fingerprint(sim: Simulation): string {
  const st = sim.state();
  const sorted = (m: Map<string, number>): [string, number][] => [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, Math.round(v * 1e6) / 1e6]);
  return JSON.stringify({
    now: Math.round(st.now * 1e6),
    produced: sorted(st.totals.produced),
    consumed: sorted(st.totals.consumed),
    depot: sorted(st.totals.depot),
    nodes: [...st.nodes].sort((a, b) => a[0] - b[0]).map(([uid, n]) => [uid, sorted(n.store), sorted(n.output), n.stats.cycles]),
    lanes: st.lanes.map((l) => [l.id, l.items.map((i) => `${i.itemId}@${i.ready.toFixed(4)}`)]),
  });
}
const worldPrint = (w: SimWorld): string => [...w.sims.values()].map(fingerprint).join('|');

/** Chạy việc tính sẵn ngay trong test (không worker), tối đa `cap` giây cho nhanh. */
const syncSpawner =
  (cap: number): JobSpawner =>
  (req, onChunk) => {
    runJob({ ...req, until: Math.min(req.until, cap) }, ds, onChunk);
    return () => undefined;
  };

describe('simulation — thanh thời gian (giai đoạn 3)', () => {
  it('sức chứa kho tổng khi tắt "vô hạn" = 80 000 mỗi món (người dùng 2026-10-03)', () => {
    expect(DEFAULT_DEPOT_CAPACITY).toBe(80000);
  });

  for (const [name, map] of [
    ['bản vẽ mẫu', (): Blueprint => demoPlan(ds).bp],
    ['map WLSC của người dùng', wlscMap],
  ] as const) {
    it(`${name}: chụp trạng thái lúc 240 s, dựng lại rồi chạy tiếp ⇒ y hệt chạy một mạch tới 600 s`, () => {
      const bp = map();
      const one = createSimulation(bp, ds);
      one.run(600);
      const a = createSimulation(bp, ds);
      a.run(240);
      const saved = encodeState(a.state());
      a.run(100); // chạy tiếp không làm hỏng bản đã chụp
      const b = createSimulation(bp, ds, {}, decodeState<SimState>(saved, ds));
      expect(b.now).toBeCloseTo(240, 6);
      b.run(360);
      expect(fingerprint(b)).toBe(fingerprint(one));
    });
  }

  it('thế giới (lưới 0,25 s): chụp cả nhóm lúc 240 s rồi chạy tiếp ⇒ y hệt chạy một mạch', () => {
    const bp = wlscMap();
    const one = createWorld([{ key: 'a', bp }], ds);
    one.advanceTo(600);
    expect(one.now).toBe(600);
    const a = createWorld([{ key: 'a', bp }], ds);
    a.advanceTo(240);
    const b = createWorld([{ key: 'a', bp }], ds, {}, decodeState<WorldState>(encodeState(a.state()), ds));
    b.advanceTo(600);
    expect(worldPrint(b)).toBe(worldPrint(one));
  });

  it('tính sẵn rồi tua: về giữa, phát tiếp ⇒ y hệt chạy một mạch; mốc số liệu đủ, ảnh chụp mỗi 2 phút', () => {
    const bp = demoPlan(ds).bp;
    const tl = new SimTimeline(() => [{ key: 'a', bp }], ds, {}, syncSpawner(1200));
    expect(tl.computed).toBe(1200);
    expect(tl.snaps.map((s) => s.t)).toEqual(Array.from({ length: 1200 / SNAP_EVERY + 1 }, (_, i) => i * SNAP_EVERY));
    expect(tl.marks.map((m) => m.t)).toEqual(Array.from({ length: 1200 / MARK_EVERY + 1 }, (_, i) => i * MARK_EVERY));
    tl.seek(333.3);
    expect(tl.view).toBeCloseTo(333.3, 6);
    expect(tl.now).toBe(333.25); // điểm lưới cuối ≤ lúc cần tới
    tl.play(600 - 333.3);
    const one = createWorld([{ key: 'a', bp }], ds);
    one.advanceTo(600);
    expect(worldPrint(tl.world)).toBe(worldPrint(one));
    // không phát quá giới hạn
    tl.play(5000, 900);
    expect(tl.view).toBeCloseTo(900, 6);
    // tổng làm ra lúc 600 s trong mốc số liệu = tổng của bản chạy một mạch
    const made = Object.values(tl.marks[60]!.produced).reduce((a, b) => a + b, 0);
    expect(made).toBeCloseTo([...one.totals().produced.values()].reduce((a, b) => a + b, 0), 6);
  });

  it('sửa map lúc 250 s ⇒ bỏ phần đã tính sau đó, chụp lại đúng lúc 250 s, tính lại tới hết', () => {
    const bp = demoPlan(ds).bp;
    const tl = new SimTimeline(() => [{ key: 'a', bp }], ds, {}, syncSpawner(900));
    tl.seek(250);
    tl.rebuild();
    expect(tl.snaps.map((s) => s.t)).toEqual([0, 120, 240, 250, 360, 480, 600, 720, 840]);
    expect(tl.marks.every((m, i) => m.t === i * MARK_EVERY)).toBe(true);
    expect(tl.computed).toBe(900);
  });

  it('nhóm tab chung kho tổng: hai map rút chung một kho, cả hai đều rút được, tổng không quá số đã có', () => {
    const a = demoPlan(ds).bp;
    const b = demoPlan(ds).bp;
    const stock = new Map([...ds.items.keys()].map((id) => [id, 40]));
    const w = createWorld([{ key: 'a', bp: a }, { key: 'b', bp: b }], ds, { infiniteDepot: false }, { now: 0, depotStock: stock, maps: new Map() });
    w.advanceTo(900);
    const t = w.totals();
    for (const [id, v] of t.depotOut) expect(v).toBeLessThanOrEqual(40 + (t.depotIn.get(id) ?? 0) + 1e-9);
    for (const s of w.sims.values()) expect([...s.totals.depotOut.values()].reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
  });

  it('kho tổng vô hạn: nhận cả khi quá 80 000 và vẫn đếm lượng nạp vào', () => {
    const w = createWorld([{ key: 'a', bp: demoPlan(ds).bp }], ds);
    w.advanceTo(600);
    expect([...w.totals().depotIn.values()].reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
  });

  it('bảng tổng hợp / biểu đồ: trung bình mỗi phút trong một khoảng, chuỗi theo thời gian', () => {
    const marks: SimMark[] = Array.from({ length: 13 }, (_, i) => ({ t: i * 10, produced: { a: i * 5 }, depotIn: {}, depotOut: {} }));
    expect(rateBetween(marks, 0, 60, 'produced', 'a').rate).toBeCloseTo(30); // 5 món / 10 s
    expect(rateBetween(marks, 60, 600, 'produced', 'a').span).toBe(60); // cắt tại phần đã có
    expect(rateSeries(marks, 'a', 60)[0]!.v).toBeCloseTo(30);
    expect(rateSeries(marks, 'b').every((p) => p.v === 0)).toBe(true);
  });
});

describe('simulation — điện, xoá ô, sản phẩm cũ (người dùng 2026-10-03 lần 2)', () => {
  /** mỏ → lò (bột moss → bột carbon) → kho, có kiểm tra điện, cạnh một trạm điện */
  function powered(basePower: number): { bp: Blueprint; furnace: number; station: number } {
    const s = scene(40, 40, true);
    s.bp.basePower = basePower;
    paint(s.terrain, 'mine', 9, 29, 5, 5);
    const mine = put(s, 'miner_1', 10, 30);
    const furnace = put(s, 'furnance_1', 10, 24);
    const store = put(s, 'storager_1', 10, 18);
    const station = put(s, 'power_station_1', 25, 25);
    put(s, 'power_diffuser_1', 15, 27); // phủ điện cho mỏ và lò
    source(s, mine, MOSS, 30);
    setRecipe(s.bp, ds, furnace, 'furnance_carbon_enr_powder_1');
    wire(s, mine, 0, furnace, 0);
    wire(s, furnace, 0, store, 0);
    return { bp: s.bp, furnace, station };
  }

  it('thiếu điện ⇒ cả map dừng; đủ điện ⇒ chạy (điện tính lại mỗi bước)', () => {
    const off = createWorld([{ key: 'a', bp: powered(0).bp }], ds);
    off.advanceTo(300);
    expect(off.totals().produced.get(POWDER) ?? 0).toBe(0);
    const on = createWorld([{ key: 'a', bp: powered(100000).bp }], ds);
    on.advanceTo(300);
    expect(on.totals().produced.get(POWDER)!).toBeGreaterThan(100);
  });

  it('trạm điện đốt pin: mỗi pin cháy đúng thời gian của nó, phát đúng MW khi đang cháy; hết pin ⇒ hết điện', () => {
    const { bp, station } = powered(0);
    const fuel = ds.items.get(BATTERY)!.fuel!;
    const sim = createSimulation(bp, ds);
    sim.state().nodes.get(station)!.store.set(BATTERY, 3);
    sim.run(1, 0.25);
    expect(sim.powerSupply()).toBe(fuel.power);
    expect(sim.machine(station)!.burning?.itemId).toBe(BATTERY);
    sim.run(fuel.seconds * 3 + 5, 0.25);
    expect(sim.totals.burned.get(BATTERY)).toBe(3);
    expect(sim.powerSupply()).toBe(0);
  });

  it('chuột phải vào ô của máy ⇒ xoá sạch món ở ô đó', () => {
    const { bp, furnace } = powered(100000);
    const sim = createSimulation(bp, ds);
    sim.run(120, 0.25);
    sim.state().nodes.get(furnace)!.output.set(POWDER, 20);
    expect(sim.clearSlot(furnace, POWDER, 'out')).toBe(20);
    expect(sim.machine(furnace)!.output.get(POWDER)).toBeUndefined();
  });

  it('trong ô ra còn sản phẩm cũ (đã đổi công thức) ⇒ vẫn được đẩy ra, máy không kẹt', () => {
    const { bp, furnace } = powered(100000);
    const sim = createSimulation(bp, ds);
    sim.run(60, 0.25);
    sim.state().nodes.get(furnace)!.output.set('item_carbon_enr', 10);
    sim.run(120, 0.25);
    expect(sim.machine(furnace)!.output.get('item_carbon_enr') ?? 0).toBe(0);
    expect(sim.machine(furnace)!.state).toBe('running');
  });
});

describe('kho tổng tự sinh (người dùng 2026-10-04)', () => {
  it('tắt kho vô hạn + tự sinh N/phút ⇒ máy dỡ hàng kho rút được; không tự sinh ⇒ không rút được gì', () => {
    const bp = demoPlan(ds).bp;
    const none = createWorld([{ key: 'a', bp }], ds, { infiniteDepot: false });
    none.advanceTo(600);
    const out0 = [...none.totals().depotOut.values()].reduce((a, b) => a + b, 0);
    expect(out0).toBe(0);
    // tự sinh mọi món rắn 60/phút
    const gen = Object.fromEntries([...ds.items.values()].filter((i) => i.phase === 'solid').map((i) => [i.id, 60]));
    const w = createWorld([{ key: 'a', bp }], ds, { infiniteDepot: false, depotGen: gen });
    w.advanceTo(600);
    expect([...w.totals().depotOut.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(100);
  });

  it('tự sinh rất nhiều ⇒ kho vẫn không vượt 80 000 mỗi món', () => {
    const bp = demoPlan(ds).bp;
    const w = createWorld([{ key: 'a', bp }], ds, { infiniteDepot: false, depotGen: { item_iron_nugget: 1e9 } });
    w.advanceTo(10);
    expect(w.state().depotStock.get('item_iron_nugget')).toBe(80000);
  });

  it('mốc số liệu có cả số rút ra ⇒ thâm hụt = nạp vào − rút ra', () => {
    const marks: SimMark[] = Array.from({ length: 7 }, (_, i) => ({ t: i * 10, produced: {}, depotIn: { x: i * 10 }, depotOut: { x: i * 15 } }));
    const net = rateBetween(marks, 0, 60, 'depotIn', 'x').rate - rateBetween(marks, 0, 60, 'depotOut', 'x').rate;
    expect(net).toBeCloseTo(-30);
  });
});
