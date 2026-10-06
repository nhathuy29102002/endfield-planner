import { describe, expect, it } from 'vitest';
import { canConnect, emptyModeler, modelerMachines, nodePorts, removeNode, setNodeRecipe, type MNode } from '../src/modeler/doc';
import { ds } from './helpers';

const node = (id: string, machineId: string, recipeId: string | null, item?: string): MNode => ({
  id,
  machineId,
  recipeId,
  item,
  x: 0,
  y: 0,
  limit: null,
});

describe('Modeler — sơ đồ (đợt 2, người dùng 2026-09-29)', () => {
  it('cổng của nút = nguyên liệu (vào, bên trái) + sản phẩm (ra, bên phải), mỗi vật phẩm một cổng', () => {
    const r = ds.recipes.get('furnance_carbon_enr_1')!;
    const ports = nodePorts(ds, node('a', 'furnance_1', r.id));
    expect(ports.filter((p) => p.dir === 'in').map((p) => p.item)).toEqual(r.ingredients.map((s) => s.itemId));
    expect(ports.filter((p) => p.dir === 'out').map((p) => p.item)).toEqual(r.outcomes.map((s) => s.itemId));
    expect(ports.every((p) => p.side === (p.dir === 'in' ? 'left' : 'right'))).toBe(true);
  });

  it('máy rút hàng: một cổng ra đúng vật phẩm đã chọn; có trong danh sách máy đặt được', () => {
    expect(nodePorts(ds, node('u', 'unloader_1', null, 'item_iron_nugget'))).toMatchObject([{ dir: 'out', item: 'item_iron_nugget' }]);
    const ids = modelerMachines(ds).map((d) => d.id);
    expect(ids).toContain('unloader_1');
    expect(ids).toContain('udpipe_unloader_1');
    expect(ids).toContain('furnance_1');
    expect(ids).not.toContain('log_splitter');
  });

  it('chỉ nối cổng ra → cổng vào cùng vật phẩm, khác máy, không trùng', () => {
    const doc = emptyModeler();
    const powder = ds.recipes.get('furnance_carbon_enr_powder_1')!; // … → Bột Carbon Đặc
    const carbon = ds.recipes.get('furnance_carbon_enr_1')!; // Bột Carbon Đặc → …
    doc.nodes.push(node('a', 'furnance_1', powder.id), node('b', 'furnance_1', carbon.id));
    const item = powder.outcomes[0]!.itemId;
    expect(carbon.ingredients[0]!.itemId).toBe(item);
    expect(canConnect(ds, doc, { node: 'a', item }, { node: 'b', item })).toBeNull();
    expect(canConnect(ds, doc, { node: 'a', item }, { node: 'a', item })).toMatch(/chính nó/);
    expect(canConnect(ds, doc, { node: 'a', item: 'item_iron_nugget' }, { node: 'b', item })).toMatch(/cùng vật phẩm/);
    doc.edges.push({ id: 'e', from: { node: 'a', item }, to: { node: 'b', item } });
    expect(canConnect(ds, doc, { node: 'a', item }, { node: 'b', item })).toMatch(/Đã có/);
  });

  it('xoá nút ⇒ xoá luôn đường nối; đổi công thức ⇒ bỏ đường không còn cổng', () => {
    const doc = emptyModeler();
    const powder = ds.recipes.get('furnance_carbon_enr_powder_1')!;
    const carbon = ds.recipes.get('furnance_carbon_enr_1')!;
    const item = powder.outcomes[0]!.itemId;
    doc.nodes.push(node('a', 'furnance_1', powder.id), node('b', 'furnance_1', carbon.id));
    doc.edges.push({ id: 'e', from: { node: 'a', item }, to: { node: 'b', item } });
    setNodeRecipe(ds, doc, 'b', 'furnance_iron_nugget_1');
    expect(doc.edges).toEqual([]);
    doc.edges.push({ id: 'e2', from: { node: 'a', item }, to: { node: 'b', item } });
    removeNode(doc, 'a');
    expect(doc.nodes.map((n) => n.id)).toEqual(['b']);
    expect(doc.edges).toEqual([]);
  });
});

describe('Modeler — nút chưa có công thức tự chọn khi nối (người dùng 2026-09-29)', () => {
  it('máy nhận Bột Carbon Đặc: chỉ công thức dùng nó; máy nguồn chỉ khi đúng thể', async () => {
    const { machineOptions, linkOptions, applyOption, isBlank } = await import('../src/modeler/doc');
    const item = 'item_carbon_enr_powder';
    const furnace = ds.machines.get('furnance_1')!;
    const opts = machineOptions(ds, furnace, item, 'in');
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) expect(ds.recipes.get(o.recipeId!)!.ingredients.some((s) => s.itemId === item)).toBe(true);
    expect(machineOptions(ds, ds.machines.get('unloader_1')!, item, 'out')).toEqual([{ machineId: 'unloader_1', recipeId: null, item }]);
    expect(machineOptions(ds, ds.machines.get('pump_2')!, item, 'out')).toEqual([]);
    expect(machineOptions(ds, ds.machines.get('unloader_1')!, item, 'in')).toEqual([]);
    // thả ra khoảng trống: mọi máy làm ra item, máy nguồn xếp cuối
    const producers = linkOptions(ds, item, 'out');
    expect(producers.at(-1)!.recipeId).toBeNull();
    expect(producers.some((o) => o.machineId === 'furnance_1')).toBe(true);
    const doc = emptyModeler();
    doc.nodes.push(node('a', 'furnance_1', null));
    expect(isBlank(ds, doc.nodes[0]!)).toBe(true);
    applyOption(ds, doc, 'a', opts[0]!);
    expect(doc.nodes[0]!.recipeId).toBe(opts[0]!.recipeId);
  });
});

describe('Modeler — chọn nhóm: sao chép / xoá (người dùng 2026-09-29)', () => {
  it('sao chép nhóm: chỉ giữ đường nối có cả hai đầu trong nhóm; xoá nhóm xoá luôn đường nối', async () => {
    const { copyNodes, removeNodes } = await import('../src/modeler/doc');
    const doc = emptyModeler();
    const item = 'item_carbon_enr_powder';
    doc.nodes.push(node('a', 'furnance_1', 'furnance_carbon_enr_powder_1'), node('b', 'furnance_1', 'furnance_carbon_enr_1'), node('c', 'furnance_1', 'furnance_carbon_enr_1'));
    doc.edges.push({ id: 'ab', from: { node: 'a', item }, to: { node: 'b', item } }, { id: 'ac', from: { node: 'a', item }, to: { node: 'c', item } });
    const ids = copyNodes(doc, ['a', 'b'], 40, 40);
    expect(ids).toHaveLength(2);
    expect(doc.nodes).toHaveLength(5);
    const copied = doc.edges.filter((e) => ids.includes(e.from.node) || ids.includes(e.to.node));
    expect(copied).toHaveLength(1); // a→b chép theo; a→c bị cắt vì c không nằm trong nhóm
    expect(ids).toContain(copied[0]!.from.node);
    expect(ids).toContain(copied[0]!.to.node);
    removeNodes(doc, ids);
    expect(doc.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(doc.edges.map((e) => e.id)).toEqual(['ab', 'ac']);
  });
});
