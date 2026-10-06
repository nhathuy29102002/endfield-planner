import { describe, expect, it } from 'vitest';
import { buildChain, defaultWay, waysOf, type ChainNode } from '../src/model/recipeBook';
import { chainToModeler } from '../src/modeler/fromChain';
import { fromKey, nodePorts, toKey } from '../src/modeler/doc';
import { ds } from './helpers';

const count = (n: ChainNode): number => 1 + n.inputs.reduce((a, c) => a + count(c), 0);

/** Thư viện công thức / chuỗi sản xuất / Model hoá (người dùng 2026-10-06). */
describe('thư viện công thức', () => {
  it('nước, axit, khí trơ: mặc định là khai thác; đồng: Lò Tinh Luyện từ quặng đồng', () => {
    expect(defaultWay(ds, 'item_liquid_water')).toMatchObject({ kind: 'source', machineId: 'pump_1' });
    expect(defaultWay(ds, 'item_liquid_acid')).toMatchObject({ kind: 'source', machineId: 'pump_2' });
    expect(defaultWay(ds, 'item_gas_inert')).toMatchObject({ kind: 'source', machineId: 'gas_pump_1' });
    const cu = defaultWay(ds, 'item_copper_nugget');
    expect(cu?.kind).toBe('recipe');
    // không có công thức tháo lọ trong các cách làm ra nước
    expect(waysOf(ds, 'item_liquid_water').every((w) => w.kind === 'source' || w.recipe.machineId !== 'dismantler_1')).toBe(true);
  });

  it('dựng được chuỗi cho mọi vật phẩm (không lặp vô hạn, cây vừa phải)', () => {
    for (const id of ds.items.keys()) {
      const c = buildChain(ds, id);
      expect(count(c)).toBeLessThan(3000);
    }
  });

  it('Model hoá: Modeler tính ra cả chuỗi (thành phẩm 1 máy, nguồn có lấy hàng)', async () => {
    const { computeModeler } = await import('../src/modeler/calc');
    const doc = chainToModeler(ds, buildChain(ds, 'item_copper_nugget'));
    const calc = computeModeler(ds, doc);
    const target = doc.nodes.find((n) => n.limit === 1)!;
    expect(target.machineId).toBe('furnance_1');
    expect([...calc.nodes.values()].filter((c) => (c.target ?? 0) > 0).length).toBeGreaterThan(2);
  });

  it('Model hoá: mọi đường nối khớp cổng của hai nút', () => {
    for (const id of ['item_copper_nugget', 'item_equip_script_4_3', ...[...ds.items.keys()].slice(0, 80)]) {
      if (!ds.items.has(id)) continue;
      const doc = chainToModeler(ds, buildChain(ds, id));
      for (const e of doc.edges) {
        const a = doc.nodes.find((n) => n.id === e.from.node)!;
        const b = doc.nodes.find((n) => n.id === e.to.node)!;
        expect(nodePorts(ds, a, doc.edges).some((p) => p.key === fromKey(e)), `${id}: ${a.machineId} không có ${fromKey(e)}`).toBe(true);
        expect(nodePorts(ds, b, doc.edges).some((p) => p.key === toKey(e)), `${id}: ${b.machineId} không có ${toKey(e)}`).toBe(true);
      }
    }
  });
});

describe('Model hoá (lần 2, người dùng 2026-10-06)', () => {
  const nodesOf = (doc: ReturnType<typeof chainToModeler>, m: string) => doc.nodes.filter((n) => n.machineId === m);

  it('cây cần nước (2 cây / hạt): một vòng — máy thu hoạch ngay dưới máy gieo, cổng đảo (vào phải, ra trái)', () => {
    const doc = chainToModeler(ds, buildChain(ds, 'item_plant_grass_1'));
    const [p] = nodesOf(doc, 'planter_1');
    const [h] = nodesOf(doc, 'seedcollector_1');
    expect(nodesOf(doc, 'planter_1')).toHaveLength(1);
    expect(h!.x).toBe(p!.x);
    expect(h!.y).toBeGreaterThan(p!.y);
    expect(h!.sides).toMatchObject({ 'in:item_plant_grass_1': 'right', 'out:item_plant_grass_seed_1': 'left' });
    expect(doc.edges.some((e) => e.from.node === h!.id && e.to.node === p!.id)).toBe(true);
    expect(doc.edges.some((e) => e.from.node === p!.id && e.to.node === h!.id)).toBe(true);
  });

  it('cây không cần nước (1 hạt → 1 cây): thêm một máy gieo — thu hoạch + máy gieo vòng bên trái, máy gieo chính lấy hạt dư', () => {
    const doc = chainToModeler(ds, buildChain(ds, 'item_plant_moss_1'));
    const planters = nodesOf(doc, 'planter_1');
    const [h] = nodesOf(doc, 'seedcollector_1');
    expect(planters).toHaveLength(2);
    const main = planters.find((n) => n.limit === 1)!;
    const loop = planters.find((n) => n !== main)!;
    expect(h!.x).toBeLessThan(main.x);
    expect(loop.x).toBe(h!.x);
    expect(loop.y).toBeGreaterThan(h!.y);
    expect(loop.sides).toMatchObject({ 'in:item_plant_moss_seed_1': 'right', 'out:item_plant_moss_1': 'left' });
    expect(doc.edges.filter((e) => e.from.node === h!.id).map((e) => e.to.node).sort()).toEqual([main.id, loop.id].sort());
  });

  it('không dùng chung nguồn thô: mỗi chỗ cần nước có một máy bơm riêng; mỗi nguyên liệu một hàng', () => {
    const doc = chainToModeler(ds, buildChain(ds, 'item_equip_script_4_3'));
    const pumps = nodesOf(doc, 'pump_1');
    const waterUses = doc.edges.filter((e) => e.from.item === 'item_liquid_water').length;
    expect(pumps.length).toBe(waterUses);
    for (const p of pumps) expect(doc.edges.filter((e) => e.from.node === p.id)).toHaveLength(1);
    // nguyên liệu của cùng một máy nằm ở các hàng khác nhau
    for (const n of doc.nodes) {
      const ins = doc.edges.filter((e) => e.to.node === n.id && !e.to.slot && !e.to.item.startsWith('@')).map((e) => doc.nodes.find((x) => x.id === e.from.node)!);
      const ys = ins.filter((x) => x.x < n.x).map((x) => x.y);
      expect(new Set(ys).size).toBe(ys.length);
    }
  });

  it('lò phản ứng: mọi sản phẩm (cả phụ phẩm) là cổng ra, nằm bên phải; không dùng Lò Mở Rộng', () => {
    const doc = chainToModeler(ds, buildChain(ds, 'item_copper_enr'));
    expect(nodesOf(doc, 'mix_pool_2')).toHaveLength(0);
    expect(nodesOf(doc, 'mix_pool_1').length).toBeGreaterThan(0);
    for (const n of nodesOf(doc, 'mix_pool_1')) {
      const outs = Object.values(n.outs ?? {});
      expect(outs.length).toBeGreaterThan(1);
      for (const i of outs) expect(n.sides?.[`out:${i}`]).toBe('right');
    }
  });
});

describe('Model hoá — luật xếp (lần 3, người dùng 2026-10-06)', () => {
  it('máy khuếch tán ngay trên máy cần môi trường, nguồn khí lùi trái một nấc cùng hàng; thành phẩm cách gấp đôi', () => {
    const doc = chainToModeler(ds, buildChain(ds, 'item_equip_script_4_3'));
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));
    const vaps = doc.nodes.filter((n) => n.machineId === 'vaporizer_1');
    expect(vaps.length).toBeGreaterThan(0);
    for (const v of vaps) {
      const envEdge = doc.edges.find((e) => e.from.node === v.id)!;
      const user = byId.get(envEdge.to.node)!;
      expect(v.x).toBe(user.x);
      expect(v.y).toBeLessThan(user.y);
      const gas = byId.get(doc.edges.find((e) => e.to.node === v.id)!.from.node)!;
      // ngang hàng nguồn khí (nguồn khí nằm trong khối của máy này), cách máy cần môi trường ≥ 1 + 1/3 hàng
      // nguồn khí trong khối (bên trái) ⇒ cùng hàng; vòng về máy tổ tiên (bên phải) thì thôi
      if (gas.x < v.x) expect(gas.y).toBe(v.y);
      expect(user.y - v.y).toBeGreaterThanOrEqual(Math.round(150 * 1.35) - 1);
    }
    const root = doc.nodes.find((n) => n.limit === 1)!;
    const xs = [...new Set(doc.nodes.map((n) => n.x))].sort((a, b) => a - b);
    const step = xs[1]! - xs[0]!;
    expect(root.x - xs[xs.length - 2]!).toBe(2 * step);
  });

  it('vòng gieo cây cần nước: cổng trái — nước trên, hạt dưới', () => {
    const doc = chainToModeler(ds, buildChain(ds, 'item_plant_grass_1'));
    const p = doc.nodes.find((n) => n.machineId === 'planter_1')!;
    expect(p.order).toEqual(['in:item_liquid_water', 'in:item_plant_grass_seed_1']);
  });

  it('nguồn thô được đẩy lên sát máy phía trên cùng cột (trừ khi đã ngang / cao hơn máy nó cấp)', () => {
    const doc = chainToModeler(ds, buildChain(ds, 'item_equip_script_4_3'));
    for (const n of doc.nodes.filter((x) => x.machineId === 'pump_1' || x.machineId === 'unloader_1')) {
      const user = doc.nodes.find((x) => x.id === doc.edges.find((e) => e.from.node === n.id)!.to.node)!;
      const above = doc.nodes.filter((x) => x.x === n.x && x.y < n.y).map((x) => x.y);
      expect(n.y <= user.y || above.length === 0 || n.y - Math.max(...above) <= 150).toBe(true);
    }
  });

  it('máy chính nằm giữa các nguyên liệu (lần 4); cách gấp đôi từ nấc 5 của chuỗi riêng (lần 6)', () => {
    const doc = chainToModeler(ds, buildChain(ds, 'item_equip_script_4_3'));
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));
    let checked = 0;
    for (const n of doc.nodes) {
      if (n.machineId === 'vaporizer_1' || n.machineId === 'seedcollector_1') continue;
      const ins = doc.edges.filter((e) => e.to.node === n.id && !e.to.item.startsWith('@')).map((e) => byId.get(e.from.node)!).filter((x) => x.x < n.x && !['pump_1', 'unloader_1', 'gas_pump_1'].includes(x.machineId));
      if (ins.length < 2) continue;
      const ys = ins.map((x) => x.y);
      expect(Math.abs(n.y - (Math.min(...ys) + Math.max(...ys)) / 2)).toBeLessThanOrEqual(1);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
    // khoảng tới nguyên liệu: gấp đôi khi máy cách đầu chuỗi của chính nó ≥ 5 nấc (Khí Huyết Đồng: bơm → … → 5 nấc), máy
    // ở nhánh ngắn (Xircon Thải, 2 nấc) thì không — dù cột chung của cả sơ đồ đã quá 5 — và thành phẩm luôn gấp đôi
    const gapOf = (item: string): number => {
      const n = doc.nodes.find((x) => [x.recipeId, ...(x.ticks ?? [])].some((r) => r && ds.recipes.get(r)?.outcomes[0]?.itemId === item))!;
      const src = doc.edges.find((e) => e.to.node === n.id && !e.to.item.startsWith('@') && e.to.slot !== 'act')!;
      return n.x - byId.get(src.from.node)!.x;
    };
    const one = gapOf('item_liquid_copper');
    expect(gapOf('item_gas_copper_enr')).toBe(2 * one);
    expect(gapOf('item_liquid_xiranite_poly')).toBe(one);
    const root = doc.nodes.find((n) => n.limit === 1)!;
    const rin = doc.edges.find((e) => e.to.node === root.id)!;
    expect(root.x - byId.get(rin.from.node)!.x).toBe(2 * one);
  });
});
