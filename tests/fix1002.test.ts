import { describe, expect, it } from 'vitest';
import pyrrolite from './fixtures/pyrrolite.efp.json';
import modelerBug from './fixtures/modeler-bug-1002.efp.json';
import { ds, put, scene, source, wire } from './helpers';
import { emptyBlueprint, type Blueprint } from '../src/model/types';
import { solve } from '../src/sim/solver';
import { setPairTarget, setRecipe, setDepotItem } from '../src/editor/ops';
import { busStatus } from '../src/model/bus';
import { blocksPipeLayer } from '../src/model/geometry';
import { computeModeler } from '../src/modeler/calc';
import { linkOptions, machineOptions, type ModelerDoc } from '../src/modeler/doc';
import { isFilledContainer } from '../src/model/dataset';

/** Đợt sửa lỗi 2026-10-02 (người dùng gửi "Pyrrolite" và "Bug"). */

describe('Map: máy tự kích hoạt bằng chính sản phẩm của nó (module Pyrrolite)', () => {
  it('một máy 30/phút cấp đúng 6/phút cho 5 cổng kích hoạt (kể cả chính nó) qua cảng kiểm soát ⇒ mọi máy chạy đủ', () => {
    const mod = (pyrrolite as { blueprints: { module: { machines: Blueprint['machines']; tiles: Blueprint['belts'] } }[] }).blueprints[0]!.module;
    const bp: Blueprint = { ...emptyBlueprint(40, 40), enforcePower: false };
    bp.machines = mod.machines.map((m) => ({ ...m, x: m.x + 5, z: m.z + 5 }));
    bp.belts = mod.tiles.map((t) => ({ ...t, x: t.x + 5, z: t.z + 5 }));
    bp.nextUid = 1000;
    const r = solve(bp, ds);
    const trans = bp.machines.filter((m) => m.machineId === 'transmuter_2').map((m) => r.machines.get(m.uid)!);
    expect(trans).toHaveLength(5);
    for (const t of trans) expect(t.activator!.supply).toBeCloseTo(6, 3);
    const producer = r.machines.get(238)!; // máy làm Khí Xiranite tự kích hoạt
    expect(producer.utilization).toBeCloseTo(1, 3);
    expect(producer.outputs[0]!.actual).toBeCloseTo(30, 3);
    const reactor = bp.machines.find((m) => m.machineId === 'gas_reactor_1')!;
    expect(r.machines.get(reactor.uid)!.utilization).toBeCloseTo(1, 3);
  });
});

describe('Map: kẹt cổng ra', () => {
  it('2 lò cùng đổ vào một băng 30/phút ⇒ mỗi lò 15/30, báo "Kẹt cổng ra" (không phải "Thiếu …")', () => {
    const s = scene(60, 60);
    const merge = put(s, 'log_converger', 25, 30);
    const a = put(s, 'furnance_1', 10, 28);
    const b = put(s, 'furnance_1', 40, 28);
    for (const f of [a, b]) setRecipe(s.bp, ds, f, 'furnance_carbon_enr_powder_1');
    const ma = put(s, 'miner_1', 10, 40);
    const mb = put(s, 'miner_1', 40, 40);
    source(s, ma, 'item_plant_moss_enr_powder_1', 30);
    source(s, mb, 'item_plant_moss_enr_powder_1', 30);
    wire(s, ma, 0, a, 0);
    wire(s, mb, 0, b, 0);
    wire(s, a, 0, merge, 2);
    wire(s, b, 0, merge, 0);
    const dst = put(s, 'storager_1', 24, 10);
    wire(s, merge, 0, dst, 0);
    const r = solve(s.bp, ds);
    for (const u of [a, b]) {
      const f = r.machines.get(u)!;
      expect(f.limitedBy).toBe('output');
      expect(f.inputs[0]!.actual).toBeCloseTo(15, 3);
      expect(f.outputs[0]!.actual).toBeCloseTo(15, 3);
      expect(f.bottleneck).toMatch(/^Kẹt cổng ra/);
    }
  });

  it('cặp ống ngầm: Cửa Xả không nối ra đâu ⇒ kẹt truyền ngược, cả hai đầu hiện vào/ra', () => {
    const run = (connectOut: boolean) => {
      const s = scene(60, 60);
      const pump = put(s, 'pump_1', 5, 5);
      source(s, pump, 'item_liquid_water', 120);
      const inl = put(s, 'udpipe_loader_1', 5, 20);
      const outl = put(s, 'udpipe_unloader_1', 30, 20);
      wire(s, pump, 0, inl, 0);
      setPairTarget(s.bp, ds, inl, outl);
      if (connectOut) wire(s, outl, 0, put(s, 'liquid_storager_1', 30, 35), 0);
      const r = solve(s.bp, ds);
      return { pump: r.machines.get(pump)!, inl: r.machines.get(inl)!, outl: r.machines.get(outl)! };
    };
    const ok = run(true);
    expect(ok.inl.inputs[0]!.actual).toBeCloseTo(120, 3);
    expect(ok.inl.pairOut![0]!.actual).toBeCloseTo(120, 3);
    const jam = run(false);
    expect(jam.pump.outputs[0]!.actual).toBeCloseTo(0, 3);
    expect(jam.inl.inputs[0]).toMatchObject({ actual: 0, nominal: 120 });
    expect(jam.outl.pairIn![0]).toMatchObject({ actual: 0, nominal: 120 });
    expect(jam.outl.outputs[0]!.nominal).toBeCloseTo(120, 3);
    expect(jam.inl.bottleneck).toMatch(/Kẹt/);
  });
});

describe('Map: tổng tuyến kho hàng', () => {
  it('đoạn tuyến chạm nhau thành dải; chỉ dải chạm Cổng Tổng Tuyến mới thông kho tổng', () => {
    const s = scene(60, 60);
    put(s, 'log_hongs_bus', 4, 20, 90); // x4..11 z20..23
    put(s, 'log_hongs_bus', 12, 20, 90); // x12..19 — chạm đoạn trước
    put(s, 'log_hongs_bus_source', 20, 20); // x20..23 — chạm đoạn thứ hai
    put(s, 'log_hongs_bus', 4, 40, 90); // đoạn lẻ, không chạm gì
    const a = put(s, 'unloader_1', 4, 19);
    const b = put(s, 'unloader_1', 4, 39);
    setDepotItem(s.bp, a, 'item_iron_powder');
    setDepotItem(s.bp, b, 'item_iron_powder');
    const st = busStatus(s.bp, ds);
    expect(st.attached.has(a)).toBe(true);
    expect(st.dangling.has(b)).toBe(true);
    const r = solve(s.bp, ds);
    expect(r.machines.get(a)!.onBus).toBe(true);
    expect(r.machines.get(b)!.onBus).toBe(false);
    expect(r.machines.get(b)!.bottleneck).toMatch(/Cổng Tổng Tuyến/);
  });

  it('Khu Tổng Tuyến, Cổng Tổng Tuyến, Máy Dỡ / Nâng Hàng Kho chỉ chiếm mặt đất', () => {
    for (const id of ['log_hongs_bus', 'unloader_1', 'loader_1']) expect(blocksPipeLayer(ds.machines.get(id)!), id).toBe(false);
    // Luật đổi 2026-10-02 (lần 2): Cổng Tổng Tuyến cũng chỉ chiếm mặt đất
    expect(blocksPipeLayer(ds.machines.get('log_hongs_bus_source')!)).toBe(false);
    expect(blocksPipeLayer(ds.machines.get('furnance_1')!)).toBe(true);
  });
});

describe('Modeler: chia nhu cầu theo sức làm ra của máy cung cấp (sơ đồ "Bug")', () => {
  it('nhánh trên bị lò 1 máy giới hạn ⇒ nhánh dưới tự tăng máy để bù', () => {
    const doc = (modelerBug as { blueprints: { modeler: ModelerDoc }[] }).blueprints[0]!.modeler;
    const r = computeModeler(ds, doc);
    const t = (id: string) => r.nodes.get(id)!.target!;
    expect(t('n-mump9j3g-p4gk')).toBeCloseTo(0.5, 3); // Máy Chuyển Hóa nhánh trên: chỉ làm được 15 khí đồng
    expect(t('n-muqat222-iiys')).toBeCloseTo(1.5, 3); // nhánh dưới gánh 45
    expect(t('n-muqaskh0-ip2n')).toBeCloseTo(1.5, 3); // lò nhánh dưới tăng theo
  });
});

describe('Modeler: lựa chọn khi kéo ra khoảng trống', () => {
  it('lò phản ứng / lò mở rộng: hiện từng công thức của lò dùng vật phẩm đó (tick sẵn)', () => {
    const def = ds.machines.get('mix_pool_2')!;
    const opts = machineOptions(ds, def, 'item_xiranite_powder', 'in');
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(o.tick).toBeTruthy();
      expect(ds.recipes.get(o.tick!)!.ingredients.some((s) => s.itemId === 'item_xiranite_powder')).toBe(true);
    }
  });
  it('Nước Sạch: nhiều công thức Máy Chiết Rót (mỗi loại lọ một) — màn hình gộp thành một dòng', () => {
    const fills = linkOptions(ds, 'item_liquid_water', 'in').filter((o) => o.machineId === 'filling_powder_mc_1');
    expect(fills.length).toBeGreaterThan(1);
    expect(isFilledContainer(ds, 'item_fbottle_iron_water')).toBe(true);
    expect(isFilledContainer(ds, 'item_iron_bottle')).toBe(false);
  });
});
