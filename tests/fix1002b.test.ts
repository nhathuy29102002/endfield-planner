import { describe, expect, it } from 'vitest';
import { ds, put, scene } from './helpers';
import { sourceItemsFor, emptyModeler, type MNode, type MEdge } from '../src/modeler/doc';
import { computeModeler } from '../src/modeler/calc';
import { groupItems, itemGroup, phaseOf } from '../src/model/dataset';
import { occupiedLayers } from '../src/model/geometry';
import { addMachine } from '../src/editor/ops';
import { busStatus } from '../src/model/bus';
import { inkBounds, rectFrom } from '../src/modeler/ink';

/** Đợt 2 ngày 2026-10-02 (người dùng). */
describe('Modeler: máy nguồn và bể chứa', () => {
  it('Máy Bơm Chất Lỏng như máy chống ăn mòn nhưng không lấy Axit; Máy Tách Khí chỉ Khí Trơ + Khí Xiranite', () => {
    const p1 = sourceItemsFor(ds, ds.machines.get('pump_1')!);
    const p2 = sourceItemsFor(ds, ds.machines.get('pump_2')!);
    expect(p2).toContain('item_liquid_acid');
    expect(p1).not.toContain('item_liquid_acid');
    expect(p1).toContain('item_liquid_water');
    expect(p2.filter((i) => i !== 'item_liquid_acid').sort()).toEqual([...p1].sort());
    expect(sourceItemsFor(ds, ds.machines.get('gas_pump_1')!).sort()).toEqual(['item_gas_inert', 'item_gas_xiranite']);
  });
  it('"Khí Xiranite-Đồng Nguyên Mẫu" là khí ⇒ máy bơm chất lỏng không lấy được', () => {
    expect(phaseOf(ds, 'item_activity_copper_poly_gas')).toBe('gas');
    expect(sourceItemsFor(ds, ds.machines.get('pump_2')!)).not.toContain('item_activity_copper_poly_gas');
  });
  it('bể chứa khí / chất lỏng chỉ chứa — không vào kho tổng', () => {
    const W = 'item_liquid_water';
    const n = (id: string, machineId: string, extra: Partial<MNode> = {}): MNode => ({ id, machineId, recipeId: null, x: 0, y: 0, limit: null, ...extra });
    const e: MEdge = { id: 'e', from: { node: 'p', item: W }, to: { node: 't', item: W } };
    const r = computeModeler(ds, { ...emptyModeler(), nodes: [n('p', 'pump_2', { item: W, limit: 1 }), n('t', 'liquid_storager_1', { item: W })], edges: [e] });
    expect(r.stored.size).toBe(0);
    expect(r.tanked.get(W)).toBeCloseTo(120);
  });
});

describe('nhóm vật phẩm khi chọn đồ lấy từ kho', () => {
  it('Sản phẩm thô · Sản phẩm khu phức hợp · Cây trồng · Bình chứa khí/lỏng, đúng thứ tự', () => {
    expect(itemGroup(ds, 'item_iron_ore')).toBe('raw');
    expect(itemGroup(ds, 'item_iron_nugget')).toBe('product');
    expect(itemGroup(ds, 'item_plant_moss_1')).toBe('plant');
    expect(itemGroup(ds, 'item_plant_moss_seed_1')).toBe('plant');
    expect(itemGroup(ds, 'item_plant_moss_powder_1')).toBe('product');
    expect(itemGroup(ds, 'item_fbottle_iron_water')).toBe('container');
    const g = groupItems(ds, ['item_fbottle_iron_water', 'item_plant_moss_1', 'item_iron_nugget', 'item_iron_ore']);
    expect(g.map((x) => x.title)).toEqual(['Sản phẩm thô', 'Sản phẩm khu phức hợp', 'Cây trồng', 'Bình chứa khí/lỏng']);
  });
  it('xếp tay (người dùng 2026-10-02): Phân Đà Thú, Giàu Dinh Dưỡng là cây trồng; Xiranite là sản phẩm thô', () => {
    expect(itemGroup(ds, 'item_muck_feces_1')).toBe('plant');
    expect(itemGroup(ds, 'item_muck_xiranite_1')).toBe('plant');
    expect(itemGroup(ds, 'item_xiranite_powder')).toBe('raw');
  });
  it('ống dẫn / cửa xả: chất lỏng và khí thành hai nhóm riêng', () => {
    const g = groupItems(ds, ['item_gas_inert', 'item_liquid_water', 'item_gas_acid', 'item_liquid_acid']);
    expect(g).toEqual([
      { title: 'Chất lỏng', ids: ['item_liquid_water', 'item_liquid_acid'] },
      { title: 'Khí', ids: ['item_gas_inert', 'item_gas_acid'] },
    ]);
  });
});

describe('Map: tầng chiếm', () => {
  it('Cảng Kiểm Soát Ống chỉ chiếm trên cao ⇒ đặt được phía trên băng chuyền', () => {
    expect(occupiedLayers(ds.machines.get('log_pipe_conditioner')!)).toEqual([1]);
    const s = scene(40, 40);
    // một ô băng chuyền ở (10,10) rồi đặt cảng kiểm soát ống ngay trên nó
    s.bp.belts.push({ x: 10, z: 10, kind: 'belt', in: 0, out: 0, group: 999 });
    const r = addMachine(s.bp, ds, s.terrain, 'log_pipe_conditioner', 10, 10, 0);
    expect(r.ok).toBe(true);
    expect(s.bp.belts.some((t) => t.x === 10 && t.z === 10 && t.kind === 'belt')).toBe(true); // băng vẫn còn
    // van băng thì vẫn chỉ mặt đất
    expect(occupiedLayers(ds.machines.get('log_splitter')!)).toEqual([0]);
  });
  it('đoạn tổng tuyến chưa nối về cổng được liệt kê để vẽ icon xích đứt', () => {
    const s = scene(60, 60);
    const live = put(s, 'log_hongs_bus', 4, 20, 90);
    put(s, 'log_hongs_bus_source', 12, 20);
    const dead = put(s, 'log_hongs_bus', 4, 40, 90);
    const st = busStatus(s.bp, ds);
    expect(st.deadBus.has(dead)).toBe(true);
    expect(st.deadBus.has(live)).toBe(false);
  });
});

describe('Modeler: khung chữ nhật của bút vẽ', () => {
  it('kéo theo hướng nào cũng ra khung đúng; khung bao tính cả độ dày', () => {
    expect(rectFrom({ x: 50, y: 40 }, { x: 10, y: 100 })).toEqual({ x: 10, y: 40, w: 40, h: 60 });
    expect(inkBounds({ id: 'r', kind: 'rect', color: '#fff', width: 4, x: 10, y: 40, w: 40, h: 60 })).toEqual({ x0: 8, y0: 38, x1: 52, y1: 102 });
  });
});
