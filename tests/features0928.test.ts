import { describe, expect, it } from 'vitest';
import { hotkeyOf, isInjected, telexKey } from '../src/editor/keys';
import { Camera } from '../src/render/camera';
import { commitPlan, planBelt } from '../src/editor/belts';
import { addMachine, cycleMode, inlineRotations, setBinding, setOutletItem, setRecipe } from '../src/editor/ops';
import { buildNetwork } from '../src/model/network';
import { worldPorts } from '../src/model/geometry';
import { solve } from '../src/sim/solver';
import { loadAutosave, saveNow } from '../src/blueprint/autosave';
import { demoPlan } from '../src/editor/demo';
import { ds, put, scene, source, wire, type Scene } from './helpers';

// ----------------------------------------------------------------- bộ gõ tiếng Việt
describe('bộ lọc phím khi bật bộ gõ tiếng Việt', () => {
  it('ký tự bộ gõ gửi lại ⇒ suy ra phím Telex vừa bấm', () => {
    expect(telexKey('ư')).toBe('w');
    expect(telexKey('ơ')).toBe('w');
    expect(telexKey('ă')).toBe('w');
    expect(telexKey('đ')).toBe('d');
    expect(telexKey('Đ')).toBe('d');
    expect(telexKey('â')).toBe('a');
    expect(telexKey('ê')).toBe('e');
    expect(telexKey('ô')).toBe('o');
    // có dấu thanh ⇒ phím vừa bấm là phím dấu
    expect(telexKey('á')).toBe('s');
    expect(telexKey('à')).toBe('f');
    expect(telexKey('ả')).toBe('r');
    expect(telexKey('ã')).toBe('x');
    expect(telexKey('ạ')).toBe('j');
    expect(telexKey('ấ')).toBe('s');
    expect(telexKey('a')).toBeNull();
  });

  it('ưu tiên phím vật lý; ký tự bộ gõ gửi (code rỗng) thì giải ngược', () => {
    expect(hotkeyOf({ code: 'KeyW', key: 'Process' })).toBe('w'); // IME Telex của Windows
    expect(hotkeyOf({ code: 'KeyE', key: 'ê' })).toBe('e');
    expect(hotkeyOf({ code: '', key: 'ư' })).toBe('w'); // Unikey gửi lại
    expect(hotkeyOf({ code: '', key: 'đ' })).toBe('d');
    expect(hotkeyOf({ code: 'Digit2', key: '@' })).toBe('2');
    expect(hotkeyOf({ code: 'Space', key: ' ' })).toBe('space');
    expect(hotkeyOf({ code: 'Backspace', key: 'Backspace' })).toBe('backspace');
    expect(hotkeyOf({ code: 'Escape', key: 'Escape' })).toBe('escape');
    expect(hotkeyOf({ code: 'ArrowUp', key: 'ArrowUp' })).toBe('arrowup');
    expect(isInjected({ code: '', key: 'ư' })).toBe(true);
    expect(isInjected({ code: 'KeyW', key: 'w' })).toBe(false);
  });
});

// ----------------------------------------------------------------- xoay camera
describe('xoay camera (Ctrl+R)', () => {
  const cam = (): Camera => {
    const c = new Camera();
    c.setView(800, 600);
    c.cell = c.targetCell = 20;
    return c;
  };

  it('xoay giữ nguyên điểm ở tâm màn hình', () => {
    const c = cam();
    const before = c.toCell(400, 300);
    for (let t = 1; t <= 4; t++) {
      c.rotateView(1);
      expect(c.toCell(400, 300)).toEqual(before);
    }
    expect(c.turns).toBe(0);
    c.rotateView(-1);
    expect(c.turns).toBe(3);
  });

  it('xoay 90° theo chiều kim đồng hồ: phía trên bản vẽ hiện ở bên phải màn hình', () => {
    const c = cam();
    c.rotateView(1);
    const center = c.toCell(400, 300);
    const right = c.toCell(500, 300);
    expect(right.x).toBe(center.x);
    expect(right.z).toBeLessThan(center.z);
  });

  it('kéo chuột / WASD vẫn theo hướng màn hình khi đã xoay', () => {
    const c = cam();
    c.rotateView(1);
    const under = c.toCell(500, 300);
    c.pan(100, 0); // kéo sang phải 100px
    expect(c.toCell(600, 300)).toEqual(under);
  });
});

// ----------------------------------------------------------------- cầu nối tự đặt
function straight(s: Scene, kind: 'belt' | 'pipe', a: { x: number; z: number }, b: { x: number; z: number }): void {
  const plan = planBelt(s.bp, ds, { type: 'cell', ...a }, b, kind);
  expect(plan.ok).toBe(true);
  commitPlan(s.bp, plan);
}

describe('hai tuyến cắt nhau ⇒ tự đặt cầu nối', () => {
  it('băng mới cắt ngang băng thẳng có sẵn: đặt cầu băng ở giao điểm, cả hai tuyến vẫn thông', () => {
    const s = scene(30, 30);
    straight(s, 'belt', { x: 2, z: 10 }, { x: 15, z: 10 }); // ngang, chảy sang phải
    const plan = planBelt(s.bp, ds, { type: 'cell', x: 8, z: 16 }, { x: 8, z: 4 }, 'belt'); // dọc, đi lên
    expect(plan.ok).toBe(true);
    expect(plan.bridges).toEqual([{ x: 8, z: 10 }]);
    commitPlan(s.bp, plan);
    const bridge = s.bp.machines.find((m) => m.machineId === 'log_connector')!;
    expect(bridge).toMatchObject({ x: 8, z: 10 });
    expect(s.bp.belts.some((t) => t.x === 8 && t.z === 10)).toBe(false);
    // hai tuyến đi vào cầu, hai tuyến đi ra khỏi cầu
    const chains = buildNetwork(s.bp, ds).chains;
    expect(chains.filter((c) => c.to?.uid === bridge.uid)).toHaveLength(2);
    expect(chains.filter((c) => c.from?.uid === bridge.uid)).toHaveLength(2);
  });

  it('ống cắt ngang ống ⇒ cầu ống', () => {
    const s = scene(30, 30);
    straight(s, 'pipe', { x: 2, z: 10 }, { x: 15, z: 10 });
    const plan = planBelt(s.bp, ds, { type: 'cell', x: 8, z: 16 }, { x: 8, z: 4 }, 'pipe');
    expect(plan.bridges).toEqual([{ x: 8, z: 10 }]);
    commitPlan(s.bp, plan);
    expect(s.bp.machines.map((m) => m.machineId)).toEqual(['log_pipe_connector']);
  });

  it('không bắc cầu qua ô góc hay tuyến chạy song song', () => {
    const s = scene(30, 30);
    straight(s, 'belt', { x: 2, z: 10 }, { x: 8, z: 4 }); // có một ô góc
    const corner = s.bp.belts.find((t) => t.in !== t.out)!;
    const plan = planBelt(s.bp, ds, { type: 'cell', x: corner.x, z: 20 }, { x: corner.x, z: 1 }, 'belt');
    for (const b of plan.bridges ?? []) expect(b).not.toEqual({ x: corner.x, z: corner.z });
  });
});

// ----------------------------------------------------------------- van trên ô thẳng
describe('đặt van / cầu 1×1 lên ô băng / ống thẳng', () => {
  it('đúng chiều ⇒ đặt được, ô băng bị thay, băng nối qua van', () => {
    const s = scene(30, 30);
    straight(s, 'belt', { x: 2, z: 10 }, { x: 15, z: 10 }); // chảy sang phải
    // van tách: cổng vào + cổng ra thẳng hướng lên ở rot 0 ⇒ quay 90° cho hướng sang phải
    const r = addMachine(s.bp, ds, s.terrain, 'log_splitter', 8, 10, 90);
    expect(r.ok).toBe(true);
    expect(s.bp.belts.some((t) => t.x === 8 && t.z === 10)).toBe(false);
    const chains = buildNetwork(s.bp, ds).chains;
    expect(chains.some((c) => c.to?.uid === r.uid)).toBe(true);
    expect(chains.some((c) => c.from?.uid === r.uid)).toBe(true);
  });

  it('sai chiều ⇒ không đặt, nói rõ lý do', () => {
    const s = scene(30, 30);
    straight(s, 'belt', { x: 2, z: 10 }, { x: 15, z: 10 });
    const r = addMachine(s.bp, ds, s.terrain, 'log_splitter', 8, 10, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/đúng chiều/);
    expect(s.bp.belts.some((t) => t.x === 8 && t.z === 10)).toBe(true);
  });

  it('van ống lên ô ống thẳng', () => {
    const s = scene(30, 30);
    straight(s, 'pipe', { x: 10, z: 20 }, { x: 10, z: 3 }); // chảy lên
    expect(addMachine(s.bp, ds, s.terrain, 'log_pipe_converger', 10, 12, 0).ok).toBe(true);
    expect(s.bp.belts.some((t) => t.x === 10 && t.z === 12)).toBe(false);
  });
});

// ----------------------------------------------------------------- tự chạy công thức
const MOSS = 'item_plant_moss_enr_powder_1';
const POWDER = 'item_carbon_enr_powder';

describe('máy tự chạy công thức theo đầu vào', () => {
  it('đặt máy mới không tích sẵn công thức nào', () => {
    const s = scene();
    const f = put(s, 'furnance_1', 10, 10);
    const m = s.bp.machines.find((x) => x.uid === f)!;
    expect(m.recipeId).toBeNull();
    expect(solve(s.bp, ds).machines.get(f)!.recipes).toEqual([]);
  });

  it('nguyên liệu chảy vào ⇒ chạy công thức khớp, không cần tích', () => {
    const s = scene(40, 40);
    const mine = put(s, 'miner_1', 10, 30);
    const f = put(s, 'furnance_1', 10, 24);
    const store = put(s, 'storager_1', 10, 18);
    source(s, mine, MOSS, 30);
    wire(s, mine, 0, f, 0);
    wire(s, f, 0, store, 0);
    const flow = solve(s.bp, ds).machines.get(f)!;
    expect(flow.auto).toEqual(['furnance_carbon_enr_powder_1']);
    expect(flow.running).toEqual(['furnance_carbon_enr_powder_1']);
    expect(flow.utilization).toBeCloseTo(1, 6);
    expect(flow.outputs[0]).toMatchObject({ itemId: POWDER });
  });

  it('Lò Mở Rộng tự nối 2 công thức trong máy: Nước + Xiranite + Nước Thải → 2 loại Xircon', () => {
    // người dùng: "Nước + Xiranite → Xiranite Lỏng" rồi "Xiranite Lỏng + Nước Thải → Xircon
    // Thải + Xircon Trơ Thải" chạy song song, Xiranite Lỏng dùng hết trong máy
    const s = scene(80, 80);
    const pool = put(s, 'mix_pool_2', 30, 30);
    const water = put(s, 'pump_1', 50, 26);
    const sewage = put(s, 'pump_1', 50, 36);
    const miner = put(s, 'miner_1', 32, 50);
    source(s, water, 'item_liquid_water', 60);
    source(s, sewage, 'item_liquid_sewage', 60);
    source(s, miner, 'item_xiranite_powder', 30);
    wire(s, water, 0, pool, 4);
    wire(s, sewage, 0, pool, 5);
    wire(s, miner, 0, pool, 0);
    wire(s, pool, 4, put(s, 'liquid_storager_1', 10, 22), 0);
    wire(s, pool, 5, put(s, 'liquid_storager_1', 10, 40), 0);
    // Luật đổi 2026-09-29: cổng ra của lò phải chọn tay (trước đây lò tự điền 2 chất lỏng)
    expect(setBinding(s.bp, ds, pool, 'out4', 'item_liquid_xiranite_poly').ok).toBe(true);
    expect(setBinding(s.bp, ds, pool, 'out5', 'item_liquid_xiranite_lowpoly').ok).toBe(true);

    const f = solve(s.bp, ds).machines.get(pool)!;
    expect(f.auto).toEqual(['pool_liquid_liquid_xiranite_2', 'pool_liquid_xiranite_poly_2']);
    expect(f.running.sort()).toEqual(['pool_liquid_liquid_xiranite_2', 'pool_liquid_xiranite_poly_2']);
    expect(f.utilization).toBeCloseTo(1, 4);
    // Xiranite Lỏng là trung gian: không vào, không ra
    expect(f.inputs.map((i) => i.itemId).sort()).toEqual(['item_liquid_sewage', 'item_liquid_water', 'item_xiranite_powder']);
    expect(f.outputs.map((o) => o.itemId).sort()).toEqual(['item_liquid_xiranite_lowpoly', 'item_liquid_xiranite_poly']);
    for (const o of f.outputs) expect(o.actual).toBeCloseTo(30, 4);
  });

  // Trước: "Lò Mở Rộng chạy tối đa 2 công thức". Luật 2026-09-28: không giới hạn số phản ứng, chỉ
  // giới hạn 8 món bên trong (xem multirecipe.test.ts). Công thức tích mà thiếu đầu vào thì nằm
  // chờ, không chiếm chỗ của công thức đang chạy.
  it('Lò Mở Rộng: công thức tích mà thiếu đầu vào không chặn công thức tự chạy', () => {
    const s = scene(80, 80);
    const pool = put(s, 'mix_pool_2', 30, 30);
    const water = put(s, 'pump_1', 50, 26);
    const sewage = put(s, 'pump_1', 50, 36);
    const miner = put(s, 'miner_1', 32, 50);
    source(s, water, 'item_liquid_water', 60);
    source(s, sewage, 'item_liquid_sewage', 60);
    source(s, miner, 'item_xiranite_powder', 30);
    wire(s, water, 0, pool, 4);
    wire(s, sewage, 0, pool, 5);
    wire(s, miner, 0, pool, 0);
    setRecipe(s.bp, ds, pool, 'pool_liquid_plant_grass_1_2'); // tích, nhưng không có bột cỏ
    const f = solve(s.bp, ds).machines.get(pool)!;
    expect(f.recipes.map((r) => r.recipeId)).not.toContain('pool_liquid_plant_grass_1_2');
    expect(f.auto).toEqual(['pool_liquid_liquid_xiranite_2', 'pool_liquid_xiranite_poly_2']);
  });

  it('Space đổi chế độ: chế độ kế tiếp rồi quay vòng', () => {
    const s = scene();
    const f = put(s, 'furnance_1', 10, 10);
    const m = s.bp.machines.find((x) => x.uid === f)!;
    expect(cycleMode(s.bp, ds, f).ok).toBe(true);
    expect(m.mode).toBe('B');
    cycleMode(s.bp, ds, f);
    expect(m.mode).toBe('A');
    expect(cycleMode(s.bp, ds, put(s, 'grinder_1', 20, 20)).ok).toBe(false);
  });

  it('một món ra nhiều cổng ⇒ sản lượng chia cho các tuyến, không nhân lên', () => {
    const s = scene(40, 40);
    const mine = put(s, 'miner_1', 11, 32);
    const f = put(s, 'furnance_1', 11, 24);
    source(s, mine, MOSS, 30);
    wire(s, mine, 0, f, 0);
    // máy thường: mọi cổng ra tự là sản phẩm cuối (không cần chọn — luật 2026-09-28)
    const ob = solve(s.bp, ds).machines.get(f)!.outBinding;
    expect([ob.out0, ob.out1, ob.out2]).toEqual([POWDER, POWDER, POWDER]);
    // cổng 0 ở mép phải (bảng game lật trục x) ⇒ kho bên phải nối cổng 0
    wire(s, f, 0, put(s, 'storager_1', 22, 14), 0);
    wire(s, f, 1, put(s, 'storager_1', 11, 4), 0);
    wire(s, f, 2, put(s, 'storager_1', 0, 14), 0);
    const r = solve(s.bp, ds);
    const flow = r.machines.get(f)!;
    expect(flow.utilization).toBeCloseTo(1, 6);
    expect(flow.outputs[0]!.actual).toBeCloseTo(30, 6);
    const shipped = [...r.links.values()].filter((l) => l.itemId === POWDER).reduce((a, l) => a + l.rate, 0);
    expect(shipped).toBeCloseTo(30, 6);
  });
});

// ----------------------------------------------------------------- máy xuất hàng
describe('lõi / máy dỡ kho / cửa xả ống: chọn vật phẩm xuất ra', () => {
  it('lõi: 6 cổng ra chọn độc lập, mỗi cổng một món (người dùng chốt 2026-09-28)', () => {
    const s = scene(40, 40);
    const hub = put(s, 'sp_hub_1', 10, 10);
    const m = s.bp.machines.find((x) => x.uid === hub)!;
    expect(setOutletItem(s.bp, ds, hub, 'out0', 'item_iron_ore').ok).toBe(true);
    expect(m.binding.out0).toBe('item_iron_ore');
    for (let i = 1; i < 6; i++) expect(m.binding[`out${i}`] ?? null).toBeNull();
    expect(setOutletItem(s.bp, ds, hub, 'out1', 'item_copper_ore').ok).toBe(true);
    expect(m.binding.out1).toBe('item_copper_ore');
    expect(m.binding.out0).toBe('item_iron_ore');
    // cổng băng không chở chất lỏng
    expect(setOutletItem(s.bp, ds, hub, 'out0', 'item_liquid_water').ok).toBe(false);
  });

  it('lõi đẩy hàng ra băng như rút kho tổng: 30/phút mỗi băng', () => {
    const s = scene(40, 40);
    const hub = put(s, 'sp_hub_1', 5, 5);
    const store = put(s, 'storager_1', 25, 5);
    setOutletItem(s.bp, ds, hub, 'out0', 'item_iron_ore');
    const port = ds.machines.get('sp_hub_1')!.ports.find((p) => p.dir === 'out' && p.index === 0)!;
    expect(port).toBeTruthy();
    wire(s, hub, 0, store, 0);
    const r = solve(s.bp, ds);
    const flow = r.machines.get(hub)!;
    expect(flow.outputs).toEqual([expect.objectContaining({ itemId: 'item_iron_ore', actual: 30 })]);
    expect(r.depot.get('item_iron_ore')?.out).toBeCloseTo(30, 6);
    expect([...r.links.values()].every((l) => l.invalid === null)).toBe(true);
  });

  it('máy dỡ kho và cửa xả ống', () => {
    const s = scene(40, 40);
    const un = put(s, 'unloader_1', 5, 5);
    const outlet = put(s, 'udpipe_unloader_1', 20, 20);
    expect(setOutletItem(s.bp, ds, un, 'out0', 'item_iron_ore').ok).toBe(true);
    expect(s.bp.machines.find((x) => x.uid === un)!.depotItem).toBe('item_iron_ore');
    expect(setOutletItem(s.bp, ds, outlet, 'out0', 'item_liquid_water').ok).toBe(true);
    const o = s.bp.machines.find((x) => x.uid === outlet)!;
    expect(o).toMatchObject({ infinite: true, source: { itemId: 'item_liquid_water' } });
    setOutletItem(s.bp, ds, outlet, 'out0', null);
    expect(o.infinite).toBe(false);
  });
});

// ----------------------------------------------------------------- tự lưu map
describe('tự lưu map đang làm', () => {
  it('lưu rồi đọc lại đúng bản vẽ', () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
    expect(loadAutosave()).toBeNull();
    const { bp, terrain } = demoPlan(ds);
    setRecipe(bp, ds, bp.machines[0]!.uid, null);
    saveNow({ bp, terrain });
    const back = loadAutosave()!;
    expect(back.bp).toEqual(bp);
    expect(back.terrain).toEqual(terrain);
    store.set('efp:map', '{hỏng');
    expect(loadAutosave()).toBeNull();
  });
});

// ----------------------------------------------------------------- lò phản ứng chọn cổng ra
describe('Lò Phản Ứng / Lò Mở Rộng: chọn sản phẩm cho mọi cổng ra', () => {
  const POLY = 'item_liquid_xiranite_poly';
  const LOW = 'item_liquid_xiranite_lowpoly';

  it('chọn được cả khi lò chưa chạy gì, cả cổng ống lẫn cổng băng; món lò không làm ⇒ từ chối', () => {
    const s = scene(40, 40);
    const pool = put(s, 'mix_pool_2', 10, 10);
    const m = s.bp.machines.find((x) => x.uid === pool)!;
    expect(setBinding(s.bp, ds, pool, 'out4', LOW).ok).toBe(true);
    expect(setBinding(s.bp, ds, pool, 'out5', POLY).ok).toBe(true);
    expect([m.binding.out4, m.binding.out5]).toEqual([LOW, POLY]);
    // cổng ống: chọn lại món đang ở cổng kia ⇒ món **chuyển** sang, cổng kia trống
    expect(setBinding(s.bp, ds, pool, 'out5', LOW).ok).toBe(true);
    expect([m.binding.out4, m.binding.out5]).toEqual([null, LOW]);
    // cổng băng: sản phẩm rắn của lò (vd. Huyết Đồng) chọn được
    const solid = ds.recipes.get('pool_copper_enr_2')!.outcomes.find((o) => ds.items.get(o.itemId)!.phase === 'solid')!.itemId;
    expect(setBinding(s.bp, ds, pool, 'out1', solid).ok).toBe(true);
    // nguyên liệu cũng chọn được ở cổng ra (lò làm bộ chuyển — luật 2026-09-28); món lò không
    // dùng cũng không làm ra thì từ chối
    expect(setBinding(s.bp, ds, pool, 'out4', 'item_liquid_water').ok).toBe(true);
    expect(setBinding(s.bp, ds, pool, 'out0', 'item_iron_ore').ok).toBe(false);
  });

  it('bộ chuyển trung gian: nguyên liệu gán cho cổng ra thì đi thẳng ra, kể cả khi lò không chạy công thức nào', () => {
    const s = scene(60, 60);
    const pool = put(s, 'mix_pool_2', 30, 30);
    const pump = put(s, 'pump_1', 50, 26);
    source(s, pump, 'item_liquid_water', 60);
    wire(s, pump, 0, pool, 4);
    expect(setBinding(s.bp, ds, pool, 'out4', 'item_liquid_water').ok).toBe(true);
    const tank = put(s, 'liquid_storager_1', 10, 22);
    wire(s, pool, 4, tank, 0);
    const r = solve(s.bp, ds);
    const f = r.machines.get(pool)!;
    expect(f.recipes).toEqual([]); // chỉ có nước ⇒ không công thức nào tự chạy
    expect(f.bottleneck).toBeNull();
    expect(f.outputs).toEqual([expect.objectContaining({ itemId: 'item_liquid_water' })]);
    expect(f.outputs[0]!.actual).toBeCloseTo(60, 6);
    expect(r.machines.get(tank)!.inputs[0]).toMatchObject({ itemId: 'item_liquid_water' });
    expect(r.machines.get(tank)!.inputs[0]!.actual).toBeCloseTo(60, 6);
    expect(f.outBinding.out4).toBe('item_liquid_water');
  });

  it('bộ chuyển + công thức cùng lúc: công thức dùng trước, phần dư đi xuyên ra', () => {
    const s = scene(80, 80);
    const pool = put(s, 'mix_pool_2', 30, 30);
    const water = put(s, 'pump_1', 50, 26);
    const miner = put(s, 'miner_1', 32, 50);
    source(s, water, 'item_liquid_water', 60);
    source(s, miner, 'item_xiranite_powder', 15); // Xiranite + Nước → Xiranite Lỏng: dùng 15 nước
    wire(s, water, 0, pool, 4);
    wire(s, miner, 0, pool, 0);
    setBinding(s.bp, ds, pool, 'out4', 'item_liquid_xiranite');
    setBinding(s.bp, ds, pool, 'out5', 'item_liquid_water');
    wire(s, pool, 4, put(s, 'liquid_storager_1', 10, 22), 0);
    wire(s, pool, 5, put(s, 'liquid_storager_1', 10, 40), 0);
    const f = solve(s.bp, ds).machines.get(pool)!;
    const out = Object.fromEntries(f.outputs.map((o) => [o.itemId, o.actual]));
    expect(out.item_liquid_xiranite).toBeCloseTo(15, 4);
    expect(out.item_liquid_water).toBeCloseTo(45, 4); // 60 vào − 15 dùng
  });

  it('không khoá dù số sản phẩm lỏng bằng số cổng ống: đổi chỗ vàng / cam theo ý người chơi', () => {
    const s = scene(80, 80);
    const pool = put(s, 'mix_pool_2', 30, 30);
    const water = put(s, 'pump_1', 50, 26);
    const sewage = put(s, 'pump_1', 50, 36);
    const miner = put(s, 'miner_1', 32, 50);
    source(s, water, 'item_liquid_water', 60);
    source(s, sewage, 'item_liquid_sewage', 60);
    source(s, miner, 'item_xiranite_powder', 30);
    wire(s, water, 0, pool, 4);
    wire(s, sewage, 0, pool, 5);
    wire(s, miner, 0, pool, 0);
    const a = put(s, 'liquid_storager_1', 10, 22);
    const b = put(s, 'liquid_storager_1', 10, 40);
    wire(s, pool, 4, a, 0);
    wire(s, pool, 5, b, 0);
    setBinding(s.bp, ds, pool, 'out4', LOW);
    setBinding(s.bp, ds, pool, 'out5', POLY);
    const r = solve(s.bp, ds);
    const chains = buildNetwork(s.bp, ds).chains;
    const carried = (uid: number): string | null | undefined =>
      r.links.get(chains.find((c) => c.to?.uid === uid)!.id)?.itemId;
    expect(carried(a)).toBe(LOW);
    expect(carried(b)).toBe(POLY);
    expect(r.machines.get(pool)!.utilization).toBeCloseTo(1, 4);
  });
});

// ----------------------------------------------------------------- van trên ô góc + tự xoay
describe('van tách / gộp đặt lên ô góc, tự xoay theo tuyến', () => {
  /** băng chữ L: đi lên rồi rẽ phải — ô góc ở (5, 5) */
  function lBelt(): { s: Scene; corner: { x: number; z: number; in: number; out: number } } {
    const s = scene(30, 30);
    const plan = planBelt(s.bp, ds, { type: 'cell', x: 5, z: 12 }, { x: 12, z: 5 }, 'belt');
    commitPlan(s.bp, plan);
    const corner = s.bp.belts.find((t) => t.in !== t.out)!;
    return { s, corner };
  }

  it('van gộp / van tách có hướng khớp với ô góc; cầu thì không (cầu không rẽ)', () => {
    const { s, corner } = lBelt();
    const conv = ds.machines.get('log_converger')!;
    const split = ds.machines.get('log_splitter')!;
    const bridge = ds.machines.get('log_connector')!;
    expect(inlineRotations(s.bp, ds, conv, corner.x, corner.z).length).toBeGreaterThan(0);
    expect(inlineRotations(s.bp, ds, split, corner.x, corner.z).length).toBeGreaterThan(0);
    expect(inlineRotations(s.bp, ds, bridge, corner.x, corner.z)).toEqual([]);
  });

  it('đặt van tách lên ô góc theo hướng tự xoay ⇒ tuyến vẫn nối qua van', () => {
    const { s, corner } = lBelt();
    const rot = inlineRotations(s.bp, ds, ds.machines.get('log_splitter')!, corner.x, corner.z)[0]!;
    const r = addMachine(s.bp, ds, s.terrain, 'log_splitter', corner.x, corner.z, rot);
    expect(r.ok).toBe(true);
    const chains = buildNetwork(s.bp, ds).chains;
    expect(chains.some((c) => c.to?.uid === r.uid)).toBe(true);
    expect(chains.some((c) => c.from?.uid === r.uid)).toBe(true);
  });

  it('ô thẳng: cầu khớp mọi hướng (R đổi qua cả 4), van tách chỉ một hướng', () => {
    const s = scene(30, 30);
    straight(s, 'belt', { x: 2, z: 10 }, { x: 15, z: 10 });
    expect(inlineRotations(s.bp, ds, ds.machines.get('log_connector')!, 8, 10)).toEqual([0, 90, 180, 270]);
    expect(inlineRotations(s.bp, ds, ds.machines.get('log_splitter')!, 8, 10)).toEqual([90]);
  });
});

// ----------------------------------------------------------------- lỗi cửa xả vô hạn + ghép cặp
describe('cửa xả ống dẫn: nguồn vô hạn đang ghép cặp vẫn ra hàng', () => {
  it('ghép cặp với cửa nạp chở thứ khác ⇒ vẫn đẩy đúng món vô hạn (lỗi #52 của người dùng)', () => {
    const s = scene(60, 60);
    const inlet = put(s, 'udpipe_loader_1', 40, 40);
    const outlet = put(s, 'udpipe_unloader_1', 30, 30);
    const pump = put(s, 'pump_1', 50, 40);
    source(s, pump, 'item_gas_water', 60);
    wire(s, pump, 0, inlet, 0); // cửa nạp nhận Hơi Nước
    const outletM = s.bp.machines.find((x) => x.uid === outlet)!;
    outletM.pairTarget = inlet;
    s.bp.machines.find((x) => x.uid === inlet)!.pairTarget = outlet;
    expect(setOutletItem(s.bp, ds, outlet, 'out0', 'item_liquid_water').ok).toBe(true);
    const tank = put(s, 'liquid_storager_1', 10, 30);
    wire(s, outlet, 0, tank, 0);
    const f = solve(s.bp, ds).machines.get(outlet)!;
    expect(f.outputs.map((o) => o.itemId)).toEqual(['item_liquid_water']);
    expect(f.outputs[0]!.actual).toBeCloseTo(120, 6);
  });
});

describe('cổng kề cổng: van đặt sát cổng ra nối thẳng, không cần ô ống ở giữa', () => {
  it('cửa xả ống vô hạn → van tách ống sát cổng → bể chứa (map #52/#97 của người dùng)', () => {
    const s = scene(60, 60);
    const outlet = put(s, 'udpipe_unloader_1', 30, 30);
    setOutletItem(s.bp, ds, outlet, 'out0', 'item_liquid_water');
    // cổng ra chính ở mép trái, đẩy sang trái ⇒ van quay 270° để nhận hàng từ phải sang trái
    const split = addMachine(s.bp, ds, s.terrain, 'log_pipe_splitter', 29, 31, 270);
    expect(split.ok).toBe(true);
    const tank = put(s, 'liquid_storager_1', 10, 30);
    wire(s, split.uid!, 1, tank, 0);
    const r = solve(s.bp, ds);
    expect([...r.links.values()].every((l) => l.invalid === null)).toBe(true);
    expect(r.machines.get(outlet)!.outputs[0]!.actual).toBeCloseTo(120, 6);
    expect(r.machines.get(tank)!.inputs[0]).toMatchObject({ itemId: 'item_liquid_water' });
  });
});

describe('bộ chuyển: cộng dồn nhiều băng vào, dùng một phần, chuyển phần còn lại', () => {
  it('2 băng Xiranite 30/phút → lò A ăn 60, dùng 30, chuyển 30 sang lò B (lỗi người dùng báo)', () => {
    const s = scene(90, 90);
    const a = put(s, 'mix_pool_2', 40, 50);
    const b = put(s, 'mix_pool_2', 40, 30);
    const m1 = put(s, 'miner_1', 43, 62);
    const m2 = put(s, 'miner_1', 36, 62);
    const wa = put(s, 'pump_1', 62, 46);
    const wb = put(s, 'pump_1', 62, 26);
    source(s, m1, 'item_xiranite_powder', 30);
    source(s, m2, 'item_xiranite_powder', 30);
    source(s, wa, 'item_liquid_water', 60);
    source(s, wb, 'item_liquid_water', 60);
    wire(s, m1, 0, a, 0);
    wire(s, m2, 0, a, 3);
    wire(s, wa, 0, a, 4);
    setBinding(s.bp, ds, a, 'out0', 'item_xiranite_powder'); // cổng băng ra = Xiranite ⇒ đi xuyên
    wire(s, a, 1, b, 1);
    wire(s, wb, 0, b, 4);
    wire(s, a, 4, put(s, 'liquid_storager_1', 10, 46), 0);
    wire(s, b, 4, put(s, 'liquid_storager_1', 10, 26), 0);
    // Luật đổi 2026-09-29: cổng ống ra của lò phải chọn tay (trước đây tự điền Xiranite Lỏng)
    expect(setBinding(s.bp, ds, a, 'out4', 'item_liquid_xiranite').ok).toBe(true);
    expect(setBinding(s.bp, ds, b, 'out4', 'item_liquid_xiranite').ok).toBe(true);
    const r = solve(s.bp, ds);
    const fa = r.machines.get(a)!;
    const fb = r.machines.get(b)!;
    const inA = fa.inputs.find((i) => i.itemId === 'item_xiranite_powder')!;
    expect(inA.actual).toBeCloseTo(60, 4);
    expect(inA.nominal).toBeCloseTo(60, 4);
    expect(fa.utilization).toBeCloseTo(1, 4);
    expect(fa.outputs.find((o) => o.itemId === 'item_xiranite_powder')!.actual).toBeCloseTo(30, 4);
    expect(fb.inputs.find((i) => i.itemId === 'item_xiranite_powder')!.actual).toBeCloseTo(30, 4);
    expect(fb.utilization).toBeCloseTo(1, 4);
  });
});

describe('lò phản ứng mất điện vẫn chuyển tiếp trung gian (người dùng chốt 2026-09-29)', () => {
  it('không có điện: công thức dừng nhưng món đi xuyên vẫn chảy ra', () => {
    const s = scene(60, 60, true); // bật kiểm tra điện, không đặt cột điện nào
    const pool = put(s, 'mix_pool_2', 30, 30);
    const pump = put(s, 'pump_1', 50, 26);
    source(s, pump, 'item_liquid_water', 60);
    wire(s, pump, 0, pool, 4);
    expect(setBinding(s.bp, ds, pool, 'out4', 'item_liquid_water').ok).toBe(true);
    const tank = put(s, 'liquid_storager_1', 10, 22);
    wire(s, pool, 4, tank, 0);
    const r = solve(s.bp, ds);
    expect(r.machines.get(pool)!.powered).toBe(false);
    expect(r.machines.get(tank)!.inputs[0]!.actual).toBeCloseTo(60, 6);
  });
});

describe('phím số 1 → 0 chọn máy đã ghim', () => {
  it('đúng thứ tự ghim, bỏ máy không đặt được', async () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
    store.set('efp:palette', JSON.stringify({ pinned: ['furnance_1', 'khong_co_may_nay', 'mix_pool_2'], collapsed: false, closedGroups: [] }));
    const { pinnedMachineIds } = await import('../src/ui/palette');
    expect(pinnedMachineIds(ds)).toEqual(['furnance_1', 'mix_pool_2']);
    expect(hotkeyOf({ code: 'Digit1', key: '1' })).toBe('1');
    expect(hotkeyOf({ code: 'Digit0', key: '0' })).toBe('0');
  });
});

describe('lò phản ứng: cổng ra chỉ chọn tay (người dùng chốt 2026-09-29)', () => {
  it('tích / bỏ tích / đổi công thức không tự gán cổng ra; để trống được; sao chép giữ nguyên', async () => {
    const { toggleNotedRecipe, copyMachine } = await import('../src/editor/ops');
    const s = scene(60, 60);
    const pool = put(s, 'mix_pool_2', 20, 20);
    const m = s.bp.machines.find((x) => x.uid === pool)!;
    toggleNotedRecipe(s.bp, ds, pool, 'pool_liquid_liquid_xiranite_2');
    setRecipe(s.bp, ds, pool, 'pool_liquid_xiranite_poly_2');
    for (const [k, v] of Object.entries(m.binding)) if (k.startsWith('out')) expect(v ?? null, k).toBeNull();

    expect(setBinding(s.bp, ds, pool, 'out4', 'item_liquid_xiranite_poly').ok).toBe(true);
    toggleNotedRecipe(s.bp, ds, pool, 'pool_liquid_liquid_xiranite_2'); // bỏ tích
    expect(m.binding.out4).toBe('item_liquid_xiranite_poly'); // không bị xoá
    expect(m.binding.out5 ?? null).toBeNull(); // không bị tự điền

    // để trống lại được
    expect(setBinding(s.bp, ds, pool, 'out4', null).ok).toBe(true);
    expect(m.binding.out4).toBeNull();

    // sao chép thì chép nguyên cổng ra
    setBinding(s.bp, ds, pool, 'out5', 'item_liquid_xiranite_lowpoly');
    const c = copyMachine(s.bp, ds, s.terrain, pool, 40, 40, 0);
    expect(s.bp.machines.find((x) => x.uid === c.uid)!.binding.out5).toBe('item_liquid_xiranite_lowpoly');
  });
});

describe('Bộ Cấp Nước tiêu thụ hết chất lỏng nhận vào (người dùng chốt 2026-09-29)', () => {
  it('nhận đủ theo sức ống, không cần điện, không kẹt phía trước', () => {
    const s = scene(40, 40, true); // bật kiểm tra điện, không có cột điện nào
    const p = put(s, 'pump_1', 5, 5);
    source(s, p, 'item_liquid_water', 120);
    const d = put(s, 'dumper_1', 20, 5);
    wire(s, p, 0, d, 0);
    const r = solve(s.bp, ds);
    expect([...r.links.values()].every((l) => l.invalid === null)).toBe(true);
    expect(r.machines.get(d)!.inputs[0]).toMatchObject({ itemId: 'item_liquid_water', actual: 120 });
    expect(r.balance.get('item_liquid_water')!.consumed).toBeCloseTo(120, 6);
  });
});

describe('băng nằm ngay trước cổng ra (người dùng chốt 2026-09-29)', () => {
  const portOf = async (s: Scene, uid: number, key: string) => {
    const { worldPorts } = await import('../src/model/geometry');
    const m = s.bp.machines.find((x) => x.uid === uid)!;
    return worldPorts(m, ds.machines.get(m.machineId)!).find((p) => p.key === key)!;
  };
  const DV = [
    { dx: 0, dz: -1 },
    { dx: 1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: -1, dz: 0 },
  ];

  it('băng nằm ngang chắn trước cổng ra ⇒ kéo băng từ cổng xuyên qua, tự đặt cầu ở ô đó', async () => {
    const s = scene(40, 40);
    const f = put(s, 'furnance_1', 15, 20);
    const p = await portOf(s, f, 'out0');
    const v = DV[p.flow]!;
    // băng thẳng vuông góc với hướng cổng, chạy ngang qua ô chạm của cổng
    const side = { dx: -v.dz, dz: v.dx };
    straight(s, 'belt', { x: p.attach.x - side.dx * 5, z: p.attach.z - side.dz * 5 }, { x: p.attach.x + side.dx * 5, z: p.attach.z + side.dz * 5 });
    const cursor = { x: p.attach.x + v.dx * 6, z: p.attach.z + v.dz * 6 };
    const plan = planBelt(s.bp, ds, { type: 'port', uid: f, key: 'out0' }, cursor, 'belt');
    expect(plan.ok, plan.reason).toBe(true);
    expect(plan.bridges).toEqual([p.attach]);
    commitPlan(s.bp, plan);
    const bridge = s.bp.machines.find((m) => m.machineId === 'log_connector')!;
    expect(bridge).toMatchObject({ x: p.attach.x, z: p.attach.z });
    const chains = buildNetwork(s.bp, ds).chains;
    // tuyến ngang cũ vẫn đi qua cầu; cổng ra của lò đẩy thẳng vào cầu
    expect(chains.filter((c) => c.to?.uid === bridge.uid).length).toBeGreaterThanOrEqual(2);
    expect(chains.some((c) => c.from?.uid === f && c.to?.uid === bridge.uid)).toBe(true);
  });

  it('băng nằm dọc (đang nhận hàng từ chính cổng này) ⇒ preview nối tiếp với nó', async () => {
    const s = scene(40, 40);
    const f = put(s, 'furnance_1', 15, 20);
    const p = await portOf(s, f, 'out0');
    const v = DV[p.flow]!;
    commitPlan(s.bp, planBelt(s.bp, ds, { type: 'port', uid: f, key: 'out0' }, { x: p.attach.x + v.dx * 3, z: p.attach.z + v.dz * 3 }, 'belt'));
    const first = s.bp.belts.find((t) => t.x === p.attach.x && t.z === p.attach.z)!;
    expect(first.in).toBe(p.flow);
    // kéo lại từ cổng, rẽ sang bên: dùng tiếp ô đầu (thay nó), không báo "không còn cổng trống"
    const side = { dx: -v.dz, dz: v.dx };
    const cursor = { x: p.attach.x + side.dx * 5, z: p.attach.z + side.dz * 5 };
    const plan = planBelt(s.bp, ds, { type: 'port', uid: f, key: 'out0' }, cursor, 'belt');
    expect(plan.ok, plan.reason).toBe(true);
    expect(plan.cells[0]).toEqual(p.attach);
    expect(plan.replace).toBe(first);
    expect(plan.bridges ?? []).toEqual([]);
  });
});

/**
 * Người dùng 2026-10-04: "đè đường ống / băng chuyền nếu giống loại bất kể xoay hướng nào, cắt nhau thì thêm cầu".
 * Trước đó điểm đích nằm trên tuyến cũ ⇒ "vướng vật cản", nên cũng không bao giờ tới bước đặt cầu (ảnh 2 của người dùng).
 */
describe('đè lên băng / ống cùng loại (người dùng 2026-10-04)', () => {
  it('kéo ống cắt ngang ống dọc rồi dừng trên ống có sẵn: cầu ở chỗ cắt, ô cuối đè lên ống cũ', () => {
    const s = scene(30, 30);
    straight(s, 'pipe', { x: 10, z: 2 }, { x: 10, z: 20 }); // ống dọc
    straight(s, 'pipe', { x: 12, z: 10 }, { x: 16, z: 10 }); // ống ngang phía bên kia
    const plan = planBelt(s.bp, ds, { type: 'cell', x: 5, z: 10 }, { x: 12, z: 10 }, 'pipe');
    expect(plan.ok).toBe(true);
    expect(plan.bridges).toEqual([{ x: 10, z: 10 }]);
    commitPlan(s.bp, plan);
    expect(s.bp.machines.filter((m) => m.machineId === 'log_pipe_connector').map((m) => [m.x, m.z])).toEqual([[10, 10]]);
    expect(s.bp.belts.filter((t) => t.kind === 'pipe' && t.x === 12 && t.z === 10)).toHaveLength(1); // đè, không trùng
  });

  it('đặt lại y hệt một đoạn có sẵn (cả ô góc) ⇒ được, không sinh ô trùng', () => {
    const s = scene(30, 30);
    straight(s, 'belt', { x: 5, z: 5 }, { x: 12, z: 10 });
    const n = s.bp.belts.length;
    const plan = planBelt(s.bp, ds, { type: 'cell', x: 5, z: 4 }, { x: 12, z: 10 }, 'belt');
    expect(plan.ok).toBe(true);
    commitPlan(s.bp, plan);
    const keys = s.bp.belts.map((t) => `${t.kind}:${t.x},${t.z}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(s.bp.belts.length).toBeGreaterThanOrEqual(n);
  });

  it('trỏ vào cổng RA của máy ⇒ báo rõ đó là cổng ra', () => {
    const s = scene(40, 40);
    const uid = addMachine(s.bp, ds, s.terrain, 'mix_pool_2', 15, 15, 0).uid!;
    const m = s.bp.machines.find((x) => x.uid === uid)!;
    const out = worldPorts(m, ds.machines.get('mix_pool_2')!).find((p) => p.dir === 'out' && p.kind === 'pipe')!;
    // tối đa 1 góc ⇒ không vòng được sang phía cổng vào: phải báo đúng lý do
    const plan = planBelt(s.bp, ds, { type: 'cell', x: out.attach.x + 3, z: out.attach.z - 4 }, out.cell, 'pipe', 1);
    expect(plan.ok).toBe(false);
    expect(plan.reason).toMatch(/cổng RA ống/);
  });
});
