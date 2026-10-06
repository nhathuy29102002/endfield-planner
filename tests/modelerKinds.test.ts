import { describe, expect, it } from 'vitest';
import { computeModeler } from '../src/modeler/calc';
import { emptyModeler, nodePorts, type MEdge, type MNode, type ModelerDoc } from '../src/modeler/doc';
import { ds } from './helpers';

/** Modeler — các loại máy thêm theo yêu cầu người dùng 2026-09-29 (bài toán 2–8). */
const n = (id: string, machineId: string, extra: Partial<MNode> = {}): MNode => ({
  id, machineId, recipeId: null, x: 0, y: 0, limit: null, ...extra,
});
const e = (id: string, from: string, to: string, item: string, slot?: 'act'): MEdge => ({
  id, from: { node: from, item }, to: { node: to, item, ...(slot ? { slot } : {}) },
});
const doc = (nodes: MNode[], edges: MEdge[]): ModelerDoc => ({ ...emptyModeler(), nodes, edges });

describe('chất kích hoạt (Máy Chuyển Hóa Khí - Rắn: Khí Xiranite)', () => {
  const R = 'liquid_transmuter_2_gas_gas_xiranite_1'; // 1 Xiranite → 1 Khí Xiranite, 2s
  it('có cổng kích hoạt riêng; chưa cắm ⇒ 0 %', () => {
    const t = n('t', 'transmuter_2', { recipeId: R, limit: 1 });
    expect(nodePorts(ds, t).some((p) => p.key === 'act:item_gas_xiranite' && p.slot === 'act')).toBe(true);
    const r = computeModeler(ds, doc([n('u', 'unloader_1', { item: 'item_xiranite_powder' }), t], [e('e1', 'u', 't', 'item_xiranite_powder')]));
    expect(r.nodes.get('t')!.actual).toBe(0);
  });
  // Luật đổi 2026-09-30 (người dùng): máy xin 30/phút chất kích hoạt (dù chỉ cần 6) ⇒ nguồn được tính cho 30;
  // người dùng tự đặt giới hạn lưu lượng 6/phút. Nhận 6 = chạy đủ, không cảnh báo; nhận hơn 6 ⇒ `actOver` ("!").
  it('cắm chất kích hoạt: xin 30/phút mỗi máy, cần 6 để chạy đủ; thừa ⇒ cảnh báo; giới hạn 6/phút ⇒ hết cảnh báo', () => {
    const nodes = [
      n('u', 'unloader_1', { item: 'item_xiranite_powder' }),
      n('t', 'transmuter_2', { recipeId: R, limit: 1 }),
      n('g', 'gas_pump_1', { item: 'item_gas_xiranite' }),
    ];
    // Luật đổi 2026-10-04: đường kích hoạt mặc định Tự động (N × 6) — test luật cũ đặt "không giới hạn" (`limit: null`)
    const edges = [e('e1', 'u', 't', 'item_xiranite_powder'), { ...e('e2', 'g', 't', 'item_gas_xiranite', 'act'), limit: null }];
    const r = computeModeler(ds, doc(nodes, edges));
    expect(r.nodes.get('t')!.actual).toBeCloseTo(1);
    expect(r.edges.get('e2')).toBeCloseTo(30);
    expect(r.nodes.get('t')!.actOver).toBeCloseTo(24);
    expect(r.nodes.get('t')!.ports.get('act:item_gas_xiranite')!.state).toBe('ok');
    nodes[2]!.limit = 1; // 120/phút khí
    const r2 = computeModeler(ds, doc(nodes, edges));
    expect(r2.edges.get('e2')).toBeCloseTo(30);
    expect(r2.nodes.get('t')!.actual).toBeCloseTo(1);
    // giới hạn lưu lượng 6/phút trên đường ống ⇒ nhận đúng 6 = chạy đủ, không cảnh báo
    edges[1]!.limit = 6;
    nodes[2]!.limit = null;
    const r3 = computeModeler(ds, doc(nodes, edges));
    expect(r3.edges.get('e2')).toBeCloseTo(6);
    expect(r3.nodes.get('t')!.actual).toBeCloseTo(1);
    expect(r3.nodes.get('t')!.actOver).toBeUndefined();
    expect(r3.nodes.get('g')!.ports.get('out:item_gas_xiranite')!.state).toBe('ok');
  });
  it('nhận dưới 6/phút ⇒ chạy theo tỉ lệ và cổng kích hoạt đỏ', () => {
    const nodes = [
      n('u', 'unloader_1', { item: 'item_xiranite_powder' }),
      n('t', 'transmuter_2', { recipeId: R, limit: 1 }),
      n('g', 'gas_pump_1', { item: 'item_gas_xiranite' }),
    ];
    const edges: MEdge[] = [e('e1', 'u', 't', 'item_xiranite_powder'), { ...e('e2', 'g', 't', 'item_gas_xiranite', 'act'), limit: 6 }];
    nodes[1]!.limit = 2; // 2 máy cần 12, đường chỉ chở 6
    const r = computeModeler(ds, doc(nodes, edges));
    expect(r.nodes.get('t')!.actual).toBeCloseTo(1);
    expect(r.nodes.get('t')!.ports.get('act:item_gas_xiranite')!.state).toBe('short');
    // người dùng 2026-09-30: 200 % mà chỉ có 6/phút ⇒ cảnh báo thiếu (2 máy cần ít nhất 12)
    expect(r.nodes.get('t')!.actShort).toBeCloseTo(6);
  });
  // Luật 2026-09-30 (người dùng): chất kích hoạt tính theo **số máy thật** (làm tròn lên) — mỗi cổng nhận tối đa
  // 30/phút, mỗi máy cần ít nhất 6.
  it('≤ 100 % (kể cả 50 %): nhận tối đa 30, cần 6; 200 %: nhận tối đa 60, cần 12', () => {
    const mk = (limit: number): ReturnType<typeof computeModeler> => {
      const nodes = [
        n('u', 'unloader_1', { item: 'item_xiranite_powder' }),
        n('t', 'transmuter_2', { recipeId: R, limit }),
        n('g', 'gas_pump_1', { item: 'item_gas_xiranite', limit: 1 }), // 120/phút
      ];
      // Luật đổi 2026-10-04: "không giới hạn" phải đặt rõ (`limit: null`), mặc định giờ là Tự động
      return computeModeler(ds, doc(nodes, [e('e1', 'u', 't', 'item_xiranite_powder'), { ...e('e2', 'g', 't', 'item_gas_xiranite', 'act'), limit: null }]));
    };
    const half = mk(0.5);
    expect(half.edges.get('e2')).toBeCloseTo(30); // không phải 15
    expect(half.nodes.get('t')!.actual).toBeCloseTo(0.5);
    expect(half.nodes.get('t')!.actOver).toBeCloseTo(24);
    const two = mk(2);
    expect(two.edges.get('e2')).toBeCloseTo(60);
    expect(two.nodes.get('t')!.actual).toBeCloseTo(2);
    expect(two.nodes.get('t')!.actOver).toBeCloseTo(48);
    expect(two.nodes.get('t')!.actShort).toBeUndefined();
  });
});

describe('môi trường: khí → máy khuếch tán → máy cần môi trường', () => {
  const R = 'gas_reactor_gas_copper_enr2_1'; // cần môi trường Axit
  const base = (): { nodes: MNode[]; edges: MEdge[] } => ({
    nodes: [
      n('a', 'gas_pump_1', { item: 'item_gas_copper_enr' }),
      n('b', 'gas_pump_1', { item: 'item_gas_xiranite' }),
      n('r', 'gas_reactor_1', { recipeId: R, limit: 1 }),
    ],
    edges: [e('e1', 'a', 'r', 'item_gas_copper_enr'), e('e2', 'b', 'r', 'item_gas_xiranite')],
  });
  it('chưa có môi trường ⇒ 0 %', () => {
    const { nodes, edges } = base();
    expect(nodePorts(ds, nodes[2]!).some((p) => p.item === '@env:Acid')).toBe(true);
    expect(computeModeler(ds, doc(nodes, edges)).nodes.get('r')!.actual).toBe(0);
  });
  it('máy khuếch tán cắm Khí Axit nối môi trường Axit ⇒ 100 %; khuếch tán thiếu chất kích hoạt ⇒ 0 %', () => {
    const { nodes, edges } = base();
    nodes.push(n('v', 'vaporizer_1', { item: 'item_gas_acid' }));
    edges.push(e('ev', 'v', 'r', '@env:Acid'));
    expect(computeModeler(ds, doc(nodes, edges)).nodes.get('r')!.actual).toBe(0);
    nodes.push(n('s', 'gas_pump_1', { item: 'item_gas_acid' }));
    // Luật đổi 2026-10-04: "không giới hạn" phải đặt rõ (`limit: null`), mặc định giờ là Tự động
    edges.push({ ...e('es', 's', 'v', 'item_gas_acid', 'act'), limit: null });
    const r = computeModeler(ds, doc(nodes, edges));
    expect(r.nodes.get('v')!.actual).toBeCloseTo(1);
    expect(r.nodes.get('r')!.actual).toBeCloseTo(1);
    // máy khuếch tán xin 30 (luật đổi 2026-09-30) ⇒ thừa 24 ⇒ cảnh báo; giới hạn 6/phút ⇒ chạy đủ, hết cảnh báo
    expect(r.edges.get('es')).toBeCloseTo(30);
    expect(r.nodes.get('v')!.actOver).toBeCloseTo(24);
    edges[edges.length - 1] = { ...edges[edges.length - 1]!, limit: 6 };
    const r2 = computeModeler(ds, doc(nodes, edges));
    expect(r2.edges.get('es')).toBeCloseTo(6);
    expect(r2.nodes.get('v')!.actual).toBeCloseTo(1);
    expect(r2.nodes.get('v')!.actOver).toBeUndefined();
    expect(r2.nodes.get('r')!.actual).toBeCloseTo(1);
  });
});

describe('giới hạn lưu lượng trên đường ống (thay Cảng Kiểm Soát Ống)', () => {
  it('120 tách 3, một đường giới hạn 6/phút ⇒ 6 + 57 + 57 (ví dụ của người dùng)', () => {
    const W = 'item_liquid_water';
    const limited: MEdge = { ...e('a', 'p', 't1', W), limit: 6 };
    const r = computeModeler(
      ds,
      doc(
        [
          n('p', 'pump_2', { item: W, limit: 1 }),
          n('t1', 'liquid_storager_1', { item: W }),
          n('t2', 'liquid_storager_1', { item: W }),
          n('t3', 'liquid_storager_1', { item: W }),
        ],
        [limited, e('b', 'p', 't2', W), e('c', 'p', 't3', W)],
      ),
    );
    expect(r.edges.get('a')).toBeCloseTo(6);
    expect(r.edges.get('b')).toBeCloseTo(57);
    expect(r.edges.get('c')).toBeCloseTo(57);
    // Luật đổi 2026-10-02: bể chứa chỉ chứa, khí / chất lỏng không vào kho tổng
    expect(r.stored.get(W)).toBeUndefined();
    expect(r.tanked.get(W)).toBeCloseTo(120);
  });
  it('giới hạn cũng chặn nhu cầu ngược lên: máy nguồn chỉ cần đủ cho mức giới hạn', () => {
    const W = 'item_liquid_water';
    const r = computeModeler(
      ds,
      doc([n('p', 'pump_2', { item: W }), n('t', 'liquid_storager_1', { item: W, limit: 1 })], [{ ...e('a', 'p', 't', W), limit: 12 }]),
    );
    expect(r.edges.get('a')).toBeCloseTo(12);
    expect(r.nodes.get('p')!.target).toBeCloseTo(12 / 120);
  });
});

describe('nước thải, bộ xử lý, kho', () => {
  it('120 nước thải vào cửa nạp ⇒ Cửa Xả Phụ Phẩm đẩy 4 Xircon Thải ⇒ Bộ Xử Lý xoá sạch', () => {
    const S = 'item_liquid_sewage';
    const X = 'item_liquid_xiranite_poly';
    const r = computeModeler(
      ds,
      doc(
        [
          n('p', 'pump_2', { item: S, limit: 1 }),
          n('in', 'liquid_clean_gate_1', { item: S }),
          n('out', 'liquid_recycle_gate_1'),
          n('c', 'liquid_cleaner_1', { item: X }),
        ],
        [e('a', 'p', 'in', S), e('b', 'out', 'c', X)],
      ),
    );
    expect(r.nodes.get('out')!.through).toBeCloseTo(4);
    expect(r.edges.get('b')).toBeCloseTo(4);
    expect(r.disposed.get(X)).toBeCloseTo(4);
    expect(r.disposed.get(S)).toBeCloseTo(120);
    expect(r.nodes.get('c')!.actual).toBeCloseTo(4 / 30);
  });
  it('Máy Nâng Hàng Kho: đưa thẳng vào kho tổng', () => {
    const I = 'item_iron_powder';
    const r = computeModeler(ds, doc([n('u', 'unloader_1', { item: I, limit: 1 }), n('l', 'loader_1', { item: I })], [e('a', 'u', 'l', I)]));
    expect(r.stored.get(I)).toBeCloseTo(30);
    expect(r.nodes.get('l')!.actual).toBeCloseTo(1);
  });
});
