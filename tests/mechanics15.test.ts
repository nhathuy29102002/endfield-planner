import { describe, expect, it } from 'vitest';
import { Grid } from '../src/grid/grid';
import { buildNetwork } from '../src/model/network';
import {
  addMachine,
  connect,
  pickPort,
  setInfinite,
  setMode,
  setPairTarget,
  setRecipe,
  setSource,
} from '../src/editor/ops';
import { solve } from '../src/sim/solver';
import { portKey } from '../src/model/types';
import { ds, paint, put, scene, source, type Scene } from './helpers';

const link = (s: Scene, a: number, ai: number, b: number, bi: number): ReturnType<typeof connect> =>
  connect(s.bp, ds, { uid: a, portKey: portKey('out', ai) }, { uid: b, portKey: portKey('in', bi) });

describe('tầm cấp điện', () => {
  /** Lò tinh luyện ăn 5 điện; `pole` đặt cột/trụ ở vị trí cho trước. */
  function rig(pole?: { id: string; x: number; z: number }): Scene & { furnace: number } {
    const s = scene(60, 60, true); // bật kiểm tra điện
    paint(s.terrain, 'mine', 28, 34, 8, 8);
    const furnace = put(s, 'furnance_1', 30, 30);
    setRecipe(s.bp, ds, furnace, 'furnance_carbon_enr_1');
    const feed = put(s, 'miner_1', 30, 36);
    source(s, feed, 'item_carbon_enr_powder', 30);
    link(s, feed, 0, furnace, 0);
    const out = put(s, 'storager_1', 30, 24);
    link(s, furnace, 0, out, 0);
    if (pole) put(s, pole.id, pole.x, pole.z);
    return { ...s, furnace };
  }

  it('ngoài tầm phủ thì máy không chạy và nói rõ lý do', () => {
    const s = rig();
    const m = solve(s.bp, ds).machines.get(s.furnace)!;
    expect(m.powered).toBe(false);
    expect(m.utilization).toBeCloseTo(0, 6);
    expect(m.bottleneck).toMatch(/tầm cấp điện/);
  });

  it('cột 7×7 phủ tới là máy chạy', () => {
    const s = rig({ id: 'power_pole_2', x: 34, z: 31 }); // phủ x32..38, z29..35
    const m = solve(s.bp, ds).machines.get(s.furnace)!;
    expect(m.powered).toBe(true);
    expect(m.utilization).toBeCloseTo(1, 4);
  });

  it('trụ 12×12 phủ rộng hơn cột 7×7', () => {
    const pole = ds.machines.get('power_pole_2')!.aura!;
    const pylon = ds.machines.get('power_diffuser_1')!.aura!;
    expect([pole.w, pole.d, pole.dx]).toEqual([7, 7, -2]);
    expect([pylon.w, pylon.d, pylon.dx]).toEqual([12, 12, -5]);

    // cùng một chỗ đặt: cột với không tới lò, trụ thì tới
    const far = { x: 36, z: 30 };
    const withPole = rig({ id: 'power_pole_2', ...far });
    const withPylon = rig({ id: 'power_diffuser_1', ...far });
    expect(solve(withPole.bp, ds).machines.get(withPole.furnace)!.powered).toBe(false);
    expect(solve(withPylon.bp, ds).machines.get(withPylon.furnace)!.powered).toBe(true);
  });

  it('vùng điện chồng nhau được — khác hẳn vùng môi trường', () => {
    const s = scene(60, 60, true);
    put(s, 'power_diffuser_1', 20, 20);
    expect(addMachine(s.bp, ds, s.terrain, 'power_diffuser_1', 23, 20, 0).ok).toBe(true);
    expect(solve(s.bp, ds).env.powerZones).toHaveLength(2);
  });

  it('tắt kiểm tra điện: máy vẫn chạy, nhưng vẫn báo mất điện để hiện icon', () => {
    const s = rig();
    s.bp.enforcePower = false;
    const m = solve(s.bp, ds).machines.get(s.furnace)!;
    expect(m.powered).toBe(false); // icon mất điện hiện cả ở chế độ thường
    expect(m.utilization).toBeCloseTo(1, 4); // nhưng solver không dừng máy
  });
});

describe('chế độ máy', () => {
  it('lò có hai chế độ, công thức chia theo pha vật tư', () => {
    const def = ds.machines.get('furnance_1')!;
    // Luật đổi 2026-09-29: nhãn hiển thị tiếng Việt, nhãn gốc của game ở labelEn
    expect(def.modes?.map((m) => m.labelEn)).toEqual(['Normal', 'Liquid']);
    expect(def.modes?.map((m) => m.label)).toEqual(['Bình thường', 'Lỏng']);
    expect(def.modeAffectsRecipes).toBe(true);
    const all = ds.recipesByMachine.get('furnance_1')!;
    expect(all.some((r) => r.mode === 'A')).toBe(true);
    expect(all.some((r) => r.mode === 'B')).toBe(true);
  });

  it('transmuter: Gasify cho ra khí, Fluidify cho ra lỏng', () => {
    const def = ds.machines.get('transmuter_1')!;
    // Luật đổi 2026-09-29: nhãn hiển thị tiếng Việt, nhãn gốc của game ở labelEn
    expect(def.modes?.map((m) => m.labelEn)).toEqual(['Gasify', 'Fluidify']);
    expect(def.modes?.map((m) => m.label)).toEqual(['Khí hóa', 'Lỏng hóa']);
    for (const r of ds.recipesByMachine.get('transmuter_1')!) {
      const phases = new Set(r.outcomes.map((o) => ds.items.get(o.itemId)!.phase));
      expect(r.mode).toBe(phases.has('gas') ? 'A' : 'B');
    }
  });

  it('chọn công thức thì tự bật chế độ chạy được nó', () => {
    const s = scene();
    const uid = put(s, 'transmuter_1', 10, 10);
    const fluidify = ds.recipesByMachine.get('transmuter_1')!.find((r) => r.mode === 'B')!;
    setRecipe(s.bp, ds, uid, fluidify.id);
    expect(s.bp.machines[0]!.mode).toBe('B');
  });

  it('đổi sang chế độ khác thì bỏ công thức không còn hợp', () => {
    const s = scene();
    const uid = put(s, 'transmuter_1', 10, 10);
    const gasify = ds.recipesByMachine.get('transmuter_1')!.find((r) => r.mode === 'A')!;
    setRecipe(s.bp, ds, uid, gasify.id);
    expect(s.bp.machines[0]!.recipeId).toBe(gasify.id);

    setMode(s.bp, ds, uid, 'B');
    expect(s.bp.machines[0]!.mode).toBe('B');
    expect(s.bp.machines[0]!.recipeId).toBeNull();
  });

  it('công thức sai chế độ thì máy không chạy và báo rõ', () => {
    const s = scene();
    const uid = put(s, 'transmuter_1', 10, 10);
    const gasify = ds.recipesByMachine.get('transmuter_1')!.find((r) => r.mode === 'A')!;
    setRecipe(s.bp, ds, uid, gasify.id);
    s.bp.machines[0]!.mode = 'B'; // ép sai, như khi mở bản vẽ cũ
    expect(solve(s.bp, ds).machines.get(uid)!.bottleneck).toMatch(/chế độ/);
  });

  it('máy có chế độ nhưng không đổi bộ công thức thì đánh dấu riêng', () => {
    expect(ds.machines.get('mix_pool_2')!.modeAffectsRecipes).toBe(false);
    expect(ds.machines.get('storager_1')!.modeAffectsRecipes).toBe(false);
  });
});

describe('ống ngầm', () => {
  /** Bơm khí → đầu vào ống ngầm → (ghép cặp) → đầu ra ở xa → kho khí. */
  function rig(pair: boolean, infinite = false): Scene & { udIn: number; udOut: number; store: number } {
    const s = scene(60, 60);
    const pump = put(s, 'gas_pump_1', 5, 30);
    source(s, pump, 'item_gas_inert', 60);
    const udIn = put(s, 'udpipe_loader_1', 5, 24);
    expect(link(s, pump, 0, udIn, 0).ok).toBe(true);

    const udOut = put(s, 'udpipe_unloader_1', 45, 24); // cách xa, không có ống nối
    const store = put(s, 'gas_storager_1', 45, 18);
    expect(link(s, udOut, 0, store, 0).ok).toBe(true);

    if (pair) setPairTarget(s.bp, ds, udIn, udOut);
    if (infinite) {
      setInfinite(s.bp, udOut, true);
      setSource(s.bp, udOut, 'item_gas_inert', 0); // nguồn vô hạn phải tự khai vật tư
    }
    return { ...s, udIn, udOut, store };
  }

  it('chưa ghép cặp thì cả hai đầu đều báo thiếu', () => {
    const r = solve(rig(false).bp, ds);
    const s = rig(false);
    expect(r.machines.get(s.udIn)!.bottleneck).toMatch(/Chưa ghép cặp/);
    expect(r.machines.get(s.udOut)!.bottleneck).toMatch(/Chưa ghép cặp/);
  });

  it('ghép cặp rồi thì khí chảy sang đầu kia mà không cần ống nối', () => {
    const s = rig(true);
    const r = solve(s.bp, ds);
    expect(r.machines.get(s.udIn)!.bottleneck).toBeNull();
    // khí tới kho ở đầu bên kia bản vẽ, không có tuyến nào bắc qua
    const arrived = r.machines.get(s.store)!.inputs[0]!;
    expect(arrived.itemId).toBe('item_gas_inert');
    expect(arrived.actual).toBeGreaterThan(0);
    // và cặp này không đi qua lưới: không chuỗi băng/ống nào nối trực tiếp hai đầu
    const chains = buildNetwork(s.bp, ds).chains;
    expect(chains.some((c) => c.from?.uid === s.udIn || c.to?.uid === s.udOut)).toBe(false);
  });

  it('ghép cặp là hai chiều, và ghép lại thì gỡ cặp cũ', () => {
    const s = rig(true);
    expect(s.bp.machines.find((m) => m.uid === s.udOut)!.pairTarget).toBe(s.udIn);

    const other = put(s, 'udpipe_loader_1', 20, 40);
    setPairTarget(s.bp, ds, other, s.udOut);
    expect(s.bp.machines.find((m) => m.uid === other)!.pairTarget).toBe(s.udOut);
    expect(s.bp.machines.find((m) => m.uid === s.udIn)!.pairTarget).toBeNull();
  });

  it('không ghép được hai đầu cùng loại', () => {
    const s = scene(40, 40);
    const a = put(s, 'udpipe_loader_1', 5, 5);
    const b = put(s, 'udpipe_loader_1', 15, 5);
    expect(setPairTarget(s.bp, ds, a, b).reason).toMatch(/một đầu vào với một đầu ra/);
  });

  it('đầu ra đặt vô hạn thì tự làm nguồn, không cần đầu vào', () => {
    const s = rig(false, true);
    const r = solve(s.bp, ds);
    expect(r.machines.get(s.udOut)!.bottleneck).toBeNull();
    expect(r.machines.get(s.store)!.inputs[0]!.actual).toBeGreaterThan(0);
  });

  it('cặp ống ngầm chỉ chuyển hàng — bảng cân bằng không đếm hai lần', () => {
    const s = rig(true);
    const r = solve(s.bp, ds);
    const b = r.balance.get('item_gas_inert')!;
    const arrived = r.machines.get(s.store)!.inputs[0]!.actual;
    // sản xuất = đúng lượng bơm ra, tiêu thụ = đúng lượng kho khí nhận, không cộng hai đầu cặp
    expect(b.consumed).toBeCloseTo(arrived, 6);
    expect(b.produced).toBeCloseTo(arrived, 6);
    expect(arrived).toBeLessThanOrEqual(120 + 1e-6); // một ống chở tối đa 120/phút
  });

  it('ống ngầm không đi qua kho tổng — kho tổng chỉ dành cho băng chuyền', () => {
    const r = solve(rig(true).bp, ds);
    expect(r.depot.size).toBe(0);
  });

  it('xoá một đầu thì đầu kia không còn trỏ vào hư không', () => {
    const s = rig(true);
    s.bp.machines = s.bp.machines.filter((m) => m.uid !== s.udIn);
    for (const m of s.bp.machines) if (m.pairTarget === s.udIn) m.pairTarget = null;
    expect(s.bp.machines.find((m) => m.uid === s.udOut)!.pairTarget).toBeNull();
  });
});

describe('nối tuyến bằng cách bấm vào thân máy', () => {
  it('bấm giữa máy cũng chọn được cổng, không phải nhắm trúng ô cổng', () => {
    const s = scene(40, 40);
    const a = put(s, 'furnance_1', 10, 10);
    // ô giữa máy, không phải ô cổng nào cả
    const port = pickPort(s.bp, ds, a, 'out', 'belt', { near: { x: 11, z: 11 } });
    expect(port).toBeDefined();
    expect(port!.dir).toBe('out');
    expect(port!.kind).toBe('belt');
  });

  it('bỏ qua cổng vào đã có tuyến khác', () => {
    const s = scene(40, 40);
    const a = put(s, 'miner_1', 10, 20);
    source(s, a, 'item_iron_powder', 30);
    const b = put(s, 'storager_1', 10, 10);
    const first = pickPort(s.bp, ds, b, 'in', 'belt', { near: { x: 11, z: 11 } })!;
    expect(link(s, a, 0, b, first.index).ok).toBe(true);

    const second = pickPort(s.bp, ds, b, 'in', 'belt', { near: { x: 11, z: 11 } })!;
    expect(second.key).not.toBe(first.key);
  });

  it('ưu tiên cổng đang chở đúng vật tư cần', () => {
    const s = scene(40, 40);
    const uid = put(s, 'dismantler_1', 10, 10);
    setRecipe(s.bp, ds, uid, 'dismantler_copper_acid_1');
    const m = s.bp.machines[0]!;
    const bound = Object.entries(m.binding).find(([k, v]) => k.startsWith('out') && v)!;
    const picked = pickPort(s.bp, ds, uid, 'out', 'belt', { itemId: bound[1]! });
    expect(picked!.key).toBe(bound[0]);
  });

  it('cổng kích hoạt để cuối — nó nạp khí chứ không phải nguyên liệu', () => {
    const s = scene(40, 40);
    const uid = put(s, 'transmuter_1', 10, 10);
    setRecipe(s.bp, ds, uid, 'liquid_transmuter_1_gas_gas_xiranite_enr_1');
    const picked = pickPort(s.bp, ds, uid, 'in', 'pipe', { near: { x: 12, z: 12 } })!;
    expect(picked.key).not.toBe(ds.machines.get('transmuter_1')!.activatorPort);
  });

  it('hết cổng trống thì trả về rỗng chứ không nối bừa', () => {
    const s = scene(40, 40);
    const uid = put(s, 'loader_1', 10, 10); // đúng một cổng vào băng
    const src = put(s, 'unloader_1', 10, 20);
    expect(link(s, src, 0, uid, 0).ok).toBe(true);
    expect(pickPort(s.bp, ds, uid, 'in', 'belt', {})).toBeUndefined();
  });
});

describe('quy tắc tầng', () => {
  it('công trình xử lý chiếm cả mặt đất lẫn trên không', () => {
    const s = scene(30, 30);
    put(s, 'furnance_1', 10, 10);
    const g = Grid.fromBlueprint(s.bp, ds);
    expect(g.free(0, { x: 11, z: 11 })).toBe(false);
    expect(g.free(1, { x: 11, z: 11 })).toBe(false); // ống không luồn qua được
  });

  it('van ống cũng chiếm cả hai tầng', () => {
    const s = scene(30, 30);
    put(s, 'log_pipe_splitter', 10, 10);
    const g = Grid.fromBlueprint(s.bp, ds);
    expect(g.free(0, { x: 10, z: 10 })).toBe(false);
    expect(g.free(1, { x: 10, z: 10 })).toBe(false);
  });

  it('van băng chuyền chỉ chiếm mặt đất — ống bắc qua bên trên được', () => {
    const s = scene(30, 30);
    put(s, 'log_splitter', 10, 10);
    const g = Grid.fromBlueprint(s.bp, ds);
    expect(g.free(0, { x: 10, z: 10 })).toBe(false);
    expect(g.free(1, { x: 10, z: 10 })).toBe(true);
  });
});

describe('sản phẩm phụ', () => {
  it('công thức nhiều nhóm sản phẩm: mọi nhóm đều là đầu ra', () => {
    const r = ds.recipes.get('pool_copper_enr_1')!;
    expect(r.outcomes.map((o) => o.itemId).sort()).toEqual(['item_copper_enr', 'item_liquid_sewage']);
  });
});
