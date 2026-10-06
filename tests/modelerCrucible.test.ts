import { describe, expect, it } from 'vitest';
import { computeModeler } from '../src/modeler/calc';
import { canConnect, cycleCrucibleSlot, emptyModeler, nodePorts, type MEdge, type MNode, type ModelerDoc } from '../src/modeler/doc';
import { ds } from './helpers';

/**
 * Lò phản ứng trong Modeler (người dùng 2026-09-29): công thức tự chạy theo đầu vào như bên Map, 2 ống + 2 băng
 * vào, ra 2 lỏng + 1 rắn (thay dần), sản phẩm cuối không nối ra ⇒ kẹt. Ví dụ 2 Lò Mở Rộng của người dùng.
 */
const X = 'item_xiranite_powder';
const W = 'item_liquid_water';
const S = 'item_liquid_sewage';
const XW = 'item_liquid_xiranite_poly'; // Xircon thải
const IXW = 'item_liquid_xiranite_lowpoly'; // Xircon trơ thải
const FE = 'item_iron_powder';
const XC = 'item_xiranite_poly'; // Xircon

const n = (id: string, machineId: string, extra: Partial<MNode> = {}): MNode => ({ id, machineId, recipeId: null, x: 0, y: 0, limit: null, ...extra });
const e = (id: string, from: string, to: string, item: string): MEdge => ({ id, from: { node: from, item }, to: { node: to, item } });

const twoCrucibles = (fixedSources: boolean): ModelerDoc => ({
  ...emptyModeler(),
  nodes: [
    n('x1', 'unloader_1', { item: X, limit: fixedSources ? 1 : null }),
    n('x2', 'unloader_1', { item: X, limit: fixedSources ? 1 : null }),
    n('w1', 'pump_2', { item: W, limit: fixedSources ? 0.25 : null }),
    n('s1', 'pump_2', { item: S, limit: fixedSources ? 0.25 : null }),
    // Luật đổi 2026-10-04: ô dưới trống ⇒ số lò theo nhu cầu phía sau (kho không chốt số không tạo nhu cầu ⇒ 0 lò);
    // ví dụ cũ của người dùng = 1 lò mỗi chỗ ⇒ chốt 1
    n('m1', 'mix_pool_2', { limit: 1 }),
    n('m2', 'mix_pool_2', { limit: 1 }),
    n('fe', 'unloader_1', { item: FE, limit: fixedSources ? 1 : null }),
    n('w2', 'pump_2', { item: W, limit: fixedSources ? 0.25 : null }),
    n('t1', 'liquid_storager_1', { item: IXW }),
    n('t2', 'liquid_storager_1', { item: IXW }),
    n('k', 'loader_1', { item: XC }),
  ],
  edges: [
    e('a1', 'x1', 'm1', X),
    e('a2', 'x2', 'm1', X),
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
});

describe('Lò Mở Rộng — ví dụ 2 lò của người dùng', () => {
  it('nguồn chốt đúng lượng: mọi công thức chạy đủ, lò 1 chuyển 30 Xiranite sang lò 2', () => {
    const r = computeModeler(ds, twoCrucibles(true));
    const m1 = r.nodes.get('m1')!;
    const m2 = r.nodes.get('m2')!;
    expect(m1.recipes!.map((x) => x.recipe.id).sort()).toEqual(['pool_liquid_liquid_xiranite_2', 'pool_liquid_xiranite_poly_2']);
    expect(m2.recipes).toHaveLength(3);
    for (const x of [...m1.recipes!, ...m2.recipes!]) expect(x.u).toBeCloseTo(1, 3);
    expect(m1.jam).toBeNull();
    expect(r.edges.get('b1')).toBeCloseTo(30); // Xircon thải
    expect(r.edges.get('b2')).toBeCloseTo(30); // Xiranite chuyển trung gian
    expect(r.edges.get('b3')).toBeCloseTo(30); // Xircon trơ thải
    expect(r.edges.get('d1')).toBeCloseTo(30); // Xircon
    expect(r.edges.get('d2')).toBeCloseTo(30);
    expect(r.nodes.get('m2')!.actual).toBeCloseTo(1, 3);
  });

  it('nguồn không chốt: nhu cầu đi ngược qua 2 lò — Xiranite 60, nước 30 + 30, nước thải 30, bột sắt 30', () => {
    const r = computeModeler(ds, twoCrucibles(false));
    const got = (id: string) => r.edges.get(id)!;
    expect(got('a1') + got('a2')).toBeCloseTo(60);
    expect(got('a3')).toBeCloseTo(30);
    expect(got('a4')).toBeCloseTo(30);
    expect(got('c1')).toBeCloseTo(30);
    expect(got('c2')).toBeCloseTo(30);
    expect(got('d1')).toBeCloseTo(30);
  });

  it('sản phẩm cuối không nối ra ⇒ lò kẹt (như bên Map)', () => {
    const d = twoCrucibles(true);
    d.edges = d.edges.filter((x) => x.id !== 'b3'); // bỏ đường ra Xircon trơ thải của lò 1
    const r = computeModeler(ds, d);
    expect(r.nodes.get('m1')!.jam).toBe(IXW);
    expect(r.nodes.get('m1')!.actual).toBe(0);
  });
});

describe('Lò phản ứng — đường vào / ra', () => {
  it('vào tối đa 2 ống + 2 băng', () => {
    const d = twoCrucibles(true);
    d.nodes.push(n('w3', 'pump_2', { item: W }));
    expect(canConnect(ds, d, { node: 'w3', item: W }, { node: 'm1', item: W })).toMatch(/tối đa 2 đường ống/);
    d.nodes.push(n('x3', 'unloader_1', { item: X }));
    expect(canConnect(ds, d, { node: 'x3', item: X }, { node: 'm1', item: X })).toMatch(/tối đa 2 đường băng/);
  });

  it('ô trong lò: bấm đổi màu đầu ra — lỏng: thường → vàng → cam → thường; băng: thường → đen → thường', () => {
    const d = twoCrucibles(true);
    const m1 = () => d.nodes.find((x) => x.id === 'm1')!;
    const ports = () => nodePorts(ds, m1(), d.edges);
    // mọi vật phẩm trong lò đều có ô; mặc định 3 trái / 3 phải / 2 trên
    const keys = ports().map((p) => p.key);
    expect(keys).toContain('in:item_liquid_xiranite'); // Xiranite lỏng — trung gian, chưa là đầu ra
    expect(ports().slice(0, 3).every((p) => p.side === 'left')).toBe(true);
    expect(ports().slice(3, 6).every((p) => p.side === 'right')).toBe(true);
    expect(ports().slice(6, 8).every((p) => p.side === 'top')).toBe(true);
    // đầu ra đã nối từ sơ đồ cũ tự mang màu: Xircon thải vàng, Xircon trơ thải cam, Xiranite đen
    expect(ports().find((p) => p.key === `out:${XW}`)?.color).toBe('yellow');
    expect(ports().find((p) => p.key === `out:${IXW}`)?.color).toBe('orange');
    expect(ports().find((p) => p.key === `out:${X}`)?.color).toBe('black');
    // Xiranite vừa vào vừa ra ⇒ hai ô (bản sao mang màu)
    expect(keys).toContain(`in:${X}`);
    // bấm Xiranite lỏng: → vàng (Xircon thải mất màu vàng, đường ra của nó bị gỡ)
    expect(cycleCrucibleSlot(ds, d, 'm1', 'item_liquid_xiranite')).toBe('yellow');
    expect(d.edges.some((x) => x.id === 'b1')).toBe(false);
    expect(ports().find((p) => p.key === 'out:item_liquid_xiranite')?.color).toBe('yellow');
    expect(ports().some((p) => p.key === 'in:item_liquid_xiranite')).toBe(false); // không có đường vào ⇒ không bản sao
    expect(cycleCrucibleSlot(ds, d, 'm1', 'item_liquid_xiranite')).toBe('orange'); // Xircon trơ thải mất màu cam
    expect(d.edges.some((x) => x.id === 'b3')).toBe(false);
    expect(cycleCrucibleSlot(ds, d, 'm1', 'item_liquid_xiranite')).toBeUndefined();
    // hàng băng: đen → thường (gỡ đường ra Xiranite)
    expect(cycleCrucibleSlot(ds, d, 'm1', X)).toBeUndefined();
    expect(d.edges.some((x) => x.id === 'b2')).toBe(false);
    expect(cycleCrucibleSlot(ds, d, 'm1', X)).toBe('black');
  });
});
