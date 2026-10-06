import { describe, expect, it } from 'vitest';
import { computeModeler } from '../src/modeler/calc';
import { addEdge, canConnect, emptyModeler, nodePorts, type MEdge, type MNode, type ModelerDoc } from '../src/modeler/doc';
import { ds } from './helpers';

/**
 * Modeler — sửa lỗi người dùng 2026-10-04:
 * 1. đường kích hoạt Tự động = 6/phút × số máy thật;
 * 2. Lò Phản Ứng / Lò Mở Rộng ô dưới trống ⇒ số lò theo nhu cầu phía sau (không ai cần ⇒ 0);
 * 3. lò nối nhiều đường vào **cùng một máy** (nguyên liệu + kích hoạt) không bị gỡ;
 * 4. Kho Lưu Trữ Giao Thức / Bể Chứa Khí / Bể Chứa Lỏng có cổng ra chuyển tiếp;
 * 5. máy tự nối sản phẩm của nó vào cổng kích hoạt của chính nó.
 */
const n = (id: string, machineId: string, extra: Partial<MNode> = {}): MNode => ({ id, machineId, recipeId: null, x: 0, y: 0, limit: null, ...extra });
const e = (id: string, from: string, to: string, item: string, slot?: 'act'): MEdge => ({
  id, from: { node: from, item }, to: { node: to, item, ...(slot ? { slot } : {}) },
});
const doc = (nodes: MNode[], edges: MEdge[]): ModelerDoc => ({ ...emptyModeler(), nodes, edges });

const GAS = 'item_gas_xiranite';
const POW = 'item_xiranite_powder';
const R_GAS = 'liquid_transmuter_2_gas_gas_xiranite_1'; // 1 Bột Xiranite → 1 Khí Xiranite, 2s (30/phút mỗi máy)
const R_POW = 'liquid_transmuter_2_solid_xiranite_powder_1'; // 1 Khí Xiranite → 1 Bột Xiranite, 2s

describe('1. chất kích hoạt Tự động = N máy × 6/phút', () => {
  const mk = (limit: number) =>
    computeModeler(
      ds,
      doc(
        [n('u', 'unloader_1', { item: POW }), n('t', 'transmuter_2', { recipeId: R_GAS, limit }), n('g', 'gas_pump_1', { item: GAS })],
        [e('e1', 'u', 't', POW), e('e2', 'g', 't', GAS, 'act')],
      ),
    );
  it('3 máy ⇒ đường kích hoạt chở đúng 18, chạy đủ, không cảnh báo', () => {
    const r = mk(3);
    expect(r.edges.get('e2')).toBeCloseTo(18);
    expect(r.nodes.get('t')!.actual).toBeCloseTo(3);
    expect(r.nodes.get('t')!.actOver).toBeUndefined();
    expect(r.nodes.get('t')!.actShort).toBeUndefined();
  });
  it('2,5 máy ⇒ 3 máy thật ⇒ 18; 0,5 máy ⇒ 6', () => {
    expect(mk(2.5).edges.get('e2')).toBeCloseTo(18);
    expect(mk(0.5).edges.get('e2')).toBeCloseTo(6);
  });
  it('lẫn đường đặt tay 6: đường Tự động chở phần còn lại (3 máy ⇒ 12)', () => {
    const r = computeModeler(
      ds,
      doc(
        [
          n('u', 'unloader_1', { item: POW }),
          n('t', 'transmuter_2', { recipeId: R_GAS, limit: 3 }),
          n('g', 'gas_pump_1', { item: GAS }),
          n('h', 'gas_pump_1', { item: GAS }),
        ],
        [e('e1', 'u', 't', POW), { ...e('e2', 'g', 't', GAS, 'act'), limit: 6 }, e('e3', 'h', 't', GAS, 'act')],
      ),
    );
    expect(r.edges.get('e2')).toBeCloseTo(6);
    expect(r.edges.get('e3')).toBeCloseTo(12);
    expect(r.nodes.get('t')!.actual).toBeCloseTo(3);
  });
});

describe('5 + 3. tự kích hoạt chính nó; một nguồn vào cả cổng nguyên liệu lẫn cổng kích hoạt', () => {
  const chain = (): ModelerDoc =>
    doc(
      [n('u', 'unloader_1', { item: POW }), n('g', 'transmuter_2', { recipeId: R_GAS }), n('c', 'transmuter_2', { recipeId: R_POW, limit: 1 })],
      [e('e1', 'u', 'g', POW), e('self', 'g', 'g', GAS, 'act'), e('in', 'g', 'c', GAS), e('act', 'g', 'c', GAS, 'act')],
    );
  it('chỉ cổng kích hoạt của chính nó mới tự nối được', () => {
    const d = chain();
    expect(canConnect(ds, { ...d, edges: [] }, { node: 'g', item: GAS }, { node: 'g', item: GAS, slot: 'act' })).toBeNull();
    expect(canConnect(ds, { ...d, edges: [] }, { node: 'c', item: POW }, { node: 'c', item: POW })).not.toBeNull();
  });
  it('máy sau cần 30 + 6; máy trước tự cấp 12 cho chính nó (2 máy thật) ⇒ 1,6 máy', () => {
    const r = computeModeler(ds, chain());
    expect(r.edges.get('in')).toBeCloseTo(30);
    expect(r.edges.get('act')).toBeCloseTo(6);
    expect(r.edges.get('self')).toBeCloseTo(12);
    expect(r.nodes.get('g')!.target).toBeCloseTo(1.6);
    expect(r.nodes.get('g')!.actual).toBeCloseTo(1.6);
    expect(r.nodes.get('c')!.actual).toBeCloseTo(1);
  });
});

describe('3. lò nối nhiều đường vào cùng một máy', () => {
  const LX = 'item_liquid_xiranite';
  it('nguyên liệu + kích hoạt cùng máy giữ cả hai; nối sang máy khác ⇒ thay đường cũ', () => {
    const d = doc(
      [
        n('m', 'mix_pool_2', { outs: { yellow: LX } }),
        n('t', 'transmuter_1', { recipeId: 'liquid_transmuter_1_gas_gas_xiranite_1' }),
        n('t2', 'transmuter_1', { recipeId: 'liquid_transmuter_1_gas_gas_xiranite_1' }),
      ],
      [],
    );
    expect(addEdge(ds, d, e('a', 'm', 't', LX))).toEqual([]);
    expect(canConnect(ds, d, { node: 'm', item: LX }, { node: 't', item: LX, slot: 'act' })).toBeNull();
    expect(addEdge(ds, d, e('b', 'm', 't', LX, 'act'))).toEqual([]);
    expect(d.edges.map((x) => x.id)).toEqual(['a', 'b']);
    const gone = addEdge(ds, d, e('c', 'm', 't2', LX));
    expect(gone.map((x) => x.id).sort()).toEqual(['a', 'b']);
    expect(d.edges.map((x) => x.id)).toEqual(['c']);
  });
});

describe('2. lò ô dưới trống ⇒ số lò theo nhu cầu phía sau', () => {
  // ví dụ 2 Lò Mở Rộng của người dùng (modelerCrucible.test.ts): lò sau chốt 2 ⇒ lò trước tự lên 2
  const X = 'item_xiranite_powder';
  const W = 'item_liquid_water';
  const S = 'item_liquid_sewage';
  const XW = 'item_liquid_xiranite_poly';
  const IXW = 'item_liquid_xiranite_lowpoly';
  const FE = 'item_iron_powder';
  const XC = 'item_xiranite_poly';
  const make = (m2: number | null): ModelerDoc =>
    doc(
      [
        n('x1', 'unloader_1', { item: X }),
        n('w1', 'pump_2', { item: W }),
        n('s1', 'pump_2', { item: S }),
        n('m1', 'mix_pool_2'),
        n('m2', 'mix_pool_2', { limit: m2 }),
        n('fe', 'unloader_1', { item: FE }),
        n('w2', 'pump_2', { item: W }),
        n('t1', 'liquid_storager_1', { item: IXW }),
        n('t2', 'liquid_storager_1', { item: IXW }),
        n('k', 'loader_1', { item: XC }),
      ],
      [
        e('a1', 'x1', 'm1', X),
        e('a3', 'w1', 'm1', W),
        e('a4', 's1', 'm1', S),
        e('b1', 'm1', 'm2', XW),
        e('b2', 'm1', 'm2', X),
        e('b3', 'm1', 't1', IXW),
        e('c1', 'fe', 'm2', FE),
        e('c2', 'w2', 'm2', W),
        e('d1', 'm2', 'k', XC),
        e('d2', 'm2', 't2', IXW),
      ],
    );
  it('lò sau chốt 2 ⇒ lò trước 2 lò, mọi công thức chạy đủ, Xircon ra 60', () => {
    const r = computeModeler(ds, make(2));
    expect(r.nodes.get('m1')!.target).toBeCloseTo(2);
    for (const x of [...r.nodes.get('m1')!.recipes!, ...r.nodes.get('m2')!.recipes!]) expect(x.u).toBeCloseTo(1, 3);
    expect(r.edges.get('a1')).toBeCloseTo(120);
    expect(r.edges.get('d1')).toBeCloseTo(60);
    expect(r.machines.get('mix_pool_2')!.built).toBe(4);
  });
  it('không ai cần (kho không chốt số) ⇒ 0 lò, không tính', () => {
    const r = computeModeler(ds, make(null));
    expect(r.nodes.get('m2')!.target).toBeNull();
    expect(r.nodes.get('m1')!.target).toBeNull();
  });
});

describe('4. kho / bể có cổng ra chuyển tiếp', () => {
  const MOSS = 'item_plant_moss_enr_powder_1';
  const POWDER = 'furnance_carbon_enr_powder_1'; // 30 Bột Rêu Đặc/phút mỗi máy
  it('Kho Lưu Trữ Giao Thức, Bể Chứa Khí, Bể Chứa Lỏng có cổng ra cùng vật phẩm; Máy Nâng Hàng Kho thì không', () => {
    for (const [m, item] of [['storager_1', MOSS], ['gas_storager_1', GAS], ['liquid_storager_1', 'item_liquid_water']] as const)
      expect(nodePorts(ds, n('s', m, { item })).map((p) => p.key)).toEqual([`in:${item}`, `out:${item}`]);
    expect(nodePorts(ds, n('s', 'loader_1', { item: MOSS })).map((p) => p.key)).toEqual([`in:${MOSS}`]);
  });
  const chain = (src: number | null): ModelerDoc =>
    doc(
      [n('u', 'unloader_1', { item: MOSS, limit: src }), n('s', 'storager_1', { item: MOSS }), n('a', 'furnance_1', { recipeId: POWDER, limit: 2 })],
      [e('e1', 'u', 's', MOSS), e('e2', 's', 'a', MOSS)],
    );
  it('nhu cầu phía sau đi ngược qua kho: máy sau cần 60 ⇒ nguồn 2 máy, không cất gì', () => {
    const r = computeModeler(ds, chain(null));
    expect(r.nodes.get('u')!.target).toBeCloseTo(2);
    expect(r.edges.get('e1')).toBeCloseTo(60);
    expect(r.edges.get('e2')).toBeCloseTo(60);
    expect(r.nodes.get('a')!.actual).toBeCloseTo(2);
    expect(r.stored.get(MOSS) ?? 0).toBeCloseTo(0);
    expect(r.surplus.get(MOSS) ?? 0).toBeCloseTo(0);
  });
  it('vào 90, ra 60 ⇒ 30 còn lại cất vào kho tổng (không phải hàng dư)', () => {
    const r = computeModeler(ds, chain(3));
    expect(r.edges.get('e1')).toBeCloseTo(90);
    expect(r.edges.get('e2')).toBeCloseTo(60);
    expect(r.stored.get(MOSS)).toBeCloseTo(30);
    expect(r.surplus.get(MOSS) ?? 0).toBeCloseTo(0);
  });
});
