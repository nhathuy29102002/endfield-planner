import { describe, expect, it } from 'vitest';
import { computeModeler } from '../src/modeler/calc';
import { emptyModeler, isSourceMachine, modelerMachines, sourceItemsFor, type MEdge, type MNode, type ModelerDoc } from '../src/modeler/doc';
import { phaseOf } from '../src/model/dataset';
import { ds } from './helpers';

/**
 * Modeler đợt 3 — tính toán (người dùng 2026-09-29):
 * ô dưới = số máy tối đa (trống = tính theo nhu cầu phía sau), ô trên = số máy thực chạy (%);
 * máy nguồn 1 máy = một tuyến (băng 30, ống 120), kho vô hạn; một cổng ra chia đều + rót nước;
 * sản phẩm không ai dùng chỉ hiện xanh (không kẹt).
 */
const POWDER = 'furnance_carbon_enr_powder_1'; // Bột Rêu Đặc → Bột Carbon Đặc, 2s (30/phút mỗi máy)
const CARBON = 'furnance_carbon_enr_1'; // Bột Carbon Đặc → Carbon Đặc, 2s
const MOSS = 'item_plant_moss_enr_powder_1';
const CPOW = 'item_carbon_enr_powder';

const n = (id: string, machineId: string, recipeId: string | null, limit: number | null, item?: string): MNode => ({
  id, machineId, recipeId, item, x: 0, y: 0, limit,
});
const e = (id: string, from: string, to: string, item: string): MEdge => ({ id, from: { node: from, item }, to: { node: to, item } });
const doc = (nodes: MNode[], edges: MEdge[]): ModelerDoc => ({ ...emptyModeler(), nodes, edges });

describe('Modeler — máy nguồn nguyên liệu thô', () => {
  it('Máy Bơm Chống Ăn Mòn Mk II = lỏng, Máy Tách Khí = khí, Máy Dỡ Hàng Kho = rắn', () => {
    const ids = modelerMachines(ds).map((d) => d.id);
    for (const id of ['pump_2', 'gas_pump_1', 'unloader_1']) {
      expect(ids).toContain(id);
      expect(isSourceMachine(ds.machines.get(id)!)).toBe(true);
    }
    const phases = (id: string) => new Set(sourceItemsFor(ds, ds.machines.get(id)!).map((i) => phaseOf(ds, i)));
    expect([...phases('pump_2')]).toEqual(['liquid']);
    expect([...phases('gas_pump_1')]).toEqual(['gas']);
    expect([...phases('unloader_1')]).toEqual(['solid']);
  });

  it('1 máy nguồn = một tuyến: băng 30/phút, ống 120/phút; đẩy ra được tính là nguyên liệu thô', () => {
    const r = computeModeler(
      ds,
      doc([n('p', 'pump_2', null, 1, 'item_liquid_water'), n('g', 'gas_pump_1', null, 2, 'item_gas_inert'), n('u', 'unloader_1', null, 1, MOSS)], []),
    );
    expect(r.raw.get('item_liquid_water')).toBeCloseTo(120);
    expect(r.raw.get('item_gas_inert')).toBeCloseTo(240);
    expect(r.raw.get(MOSS)).toBeCloseTo(30);
  });
});

describe('Modeler — tính toán', () => {
  it('ô dưới của máy cuối ⇒ tính ngược số máy phía trước; nguồn trống = vô hạn', () => {
    const r = computeModeler(
      ds,
      doc(
        [n('u', 'unloader_1', null, null, MOSS), n('a', 'furnance_1', POWDER, null), n('b', 'furnance_1', CARBON, 2)],
        [e('e1', 'u', 'a', MOSS), e('e2', 'a', 'b', CPOW)],
      ),
    );
    expect(r.nodes.get('b')).toMatchObject({ target: 2, actual: 2 });
    expect(r.nodes.get('a')!.target).toBeCloseTo(2);
    expect(r.nodes.get('u')!.target).toBeCloseTo(2);
    expect(r.edges.get('e1')).toBeCloseTo(60);
    expect(r.over.has('e1')).toBe(true); // 60 > một băng 30 ⇒ vẽ dày
    expect(r.raw.get(MOSS)).toBeCloseTo(60);
    expect(r.machines.get('furnance_1')).toEqual({ count: 4, built: 4 });
    expect(r.power).toBeCloseTo(4 * ds.machines.get('furnance_1')!.power);
    expect(r.shortage.size).toBe(0);
  });

  it('chốt nguồn thấp hơn nhu cầu: mục tiêu phía sau giữ nguyên, chỉ phần thực chạy giảm; thiếu = đỏ', () => {
    const r = computeModeler(
      ds,
      doc(
        [n('u', 'unloader_1', null, 1, MOSS), n('a', 'furnance_1', POWDER, null), n('b', 'furnance_1', CARBON, 2)],
        [e('e1', 'u', 'a', MOSS), e('e2', 'a', 'b', CPOW)],
      ),
    );
    expect(r.nodes.get('b')!.target).toBe(2);
    expect(r.nodes.get('b')!.actual).toBeCloseTo(1);
    expect(r.nodes.get('a')!.target).toBeCloseTo(2);
    expect(r.nodes.get('a')!.actual).toBeCloseTo(1);
    expect(r.nodes.get('b')!.ports.get(`in:${CPOW}`)).toMatchObject({ state: 'short' });
    expect(r.nodes.get('b')!.ports.get(`in:${CPOW}`)!.diff).toBeCloseTo(30);
    expect(r.nodes.get('u')!.ports.get(`out:${MOSS}`)!.state).toBe('short');
  });

  it('nguồn dư ⇒ xanh; một cổng ra chia đều, máy đủ thì phần dư sang máy khác', () => {
    const r = computeModeler(
      ds,
      doc(
        [n('u', 'unloader_1', null, 1, MOSS), n('a', 'furnance_1', POWDER, 0.25), n('b', 'furnance_1', POWDER, 1)],
        [e('ea', 'u', 'a', MOSS), e('eb', 'u', 'b', MOSS)],
      ),
    );
    expect(r.edges.get('ea')).toBeCloseTo(7.5);
    expect(r.edges.get('eb')).toBeCloseTo(22.5);
    expect(r.nodes.get('b')!.actual).toBeCloseTo(0.75);
    const r2 = computeModeler(ds, doc([n('u', 'unloader_1', null, 2, MOSS), n('a', 'furnance_1', POWDER, 1)], [e('ea', 'u', 'a', MOSS)]));
    expect(r2.nodes.get('u')!.ports.get(`out:${MOSS}`)).toMatchObject({ state: 'surplus' });
    expect(r2.nodes.get('u')!.ports.get(`out:${MOSS}`)!.diff).toBeCloseTo(30);
  });

  it('sản phẩm không ai dùng không làm kẹt máy — chỉ xanh (dư)', () => {
    const r = computeModeler(ds, doc([n('u', 'unloader_1', null, null, MOSS), n('a', 'furnance_1', POWDER, 1)], [e('e1', 'u', 'a', MOSS)]));
    expect(r.nodes.get('a')!.actual).toBeCloseTo(1);
    expect(r.nodes.get('a')!.ports.get(`out:${CPOW}`)).toMatchObject({ state: 'surplus' });
    expect(r.surplus.get(CPOW)).toBeCloseTo(30);
  });

  it('nút cuối không điền ô dưới, không ai cần ⇒ không tính', () => {
    const r = computeModeler(ds, doc([n('u', 'unloader_1', null, null, MOSS), n('a', 'furnance_1', POWDER, null)], [e('e1', 'u', 'a', MOSS)]));
    expect(r.nodes.get('a')!.target).toBeNull();
    expect(r.nodes.get('u')!.target).toBeNull();
    expect(r.raw.size).toBe(0);
    expect(r.machines.size).toBe(0);
  });

  it('cổng vào chưa nối của máy có mục tiêu ⇒ thiếu (đỏ), máy không chạy', () => {
    const r = computeModeler(ds, doc([n('a', 'furnance_1', POWDER, 1.5)], []));
    expect(r.nodes.get('a')!.actual).toBe(0);
    expect(r.shortage.get(MOSS)).toBeCloseTo(45);
  });
});
