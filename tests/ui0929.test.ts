import { describe, expect, it } from 'vitest';
import { addMachine, pairCandidates, setPairTarget } from '../src/editor/ops';
import { itemName } from '../src/model/dataset';
import { ds, scene } from './helpers';

/** Đợt sửa giao diện Map (người dùng 2026-09-29). */
describe('bình / lọ đã nạp: tên + icon ghép vỏ với khí/lỏng', () => {
  // Luật đổi 2026-09-30: người dùng "không cần ()" ⇒ vỏ rỗng giữ tên gốc, không thêm "(Rỗng)".
  it('Bình Chứa Đồng (Khí Trơ), Lọ Sắt (Nước Sạch); vỏ rỗng giữ tên gốc', () => {
    expect(itemName(ds, 'item_gasjar_copper_gas_inert')).toBe('Bình Chứa Đồng (Khí Trơ)');
    expect(itemName(ds, 'item_fbottle_iron_water')).toBe('Lọ Sắt (Nước Sạch)');
    expect(itemName(ds, 'item_copper_jar')).toBe('Bình Chứa Đồng');
    expect(itemName(ds, 'item_iron_bottle')).toBe('Lọ Sắt');
    expect(ds.items.get('item_gasjar_copper_gas_inert')!.icon).toBe('filled/item_gasjar_copper_gas_inert');
  });

  it('mọi bình đã nạp đều có icon ghép sẵn trên đĩa', () => {
    const filled = [...ds.items.values()].filter((i) => i.icon.startsWith('filled/'));
    expect(filled.length).toBe(75);
    const files = new Set(Object.keys(import.meta.glob('../public/img/itemicon/filled/*.png')));
    for (const i of filled) expect(files.has(`../public/img/itemicon/${i.icon}.png`)).toBe(true);
  });
});

describe('ghép cặp ống ngầm: chỉ định trên map', () => {
  it('máy ghép được = đầu ngược vai trò; ghép rồi bỏ ghép cả hai đầu', () => {
    const { bp, terrain } = scene(40, 40);
    const a = addMachine(bp, ds, terrain, 'udpipe_loader_1', 2, 2, 0).uid!;
    const b = addMachine(bp, ds, terrain, 'udpipe_unloader_1', 12, 2, 0).uid!;
    const c = addMachine(bp, ds, terrain, 'udpipe_unloader_2', 22, 2, 0).uid!;
    const d = addMachine(bp, ds, terrain, 'udpipe_loader_2', 2, 12, 0).uid!;
    expect(pairCandidates(bp, ds, a).map((m) => m.uid).sort()).toEqual([b, c].sort());
    expect(pairCandidates(bp, ds, b).map((m) => m.uid).sort()).toEqual([a, d].sort());
    expect(setPairTarget(bp, ds, a, b).ok).toBe(true);
    expect(bp.machines.find((m) => m.uid === b)!.pairTarget).toBe(a);
  });
});

describe('Modeler đợt 4 — sơ đồ trong thư viện', () => {
  it('xuất / nhập giữ nguyên sơ đồ Modeler (kind "modeler")', async () => {
    const { exportLibrary, importFile } = await import('../src/blueprint/library');
    const doc = {
      version: 1 as const,
      nodes: [{ id: 'a', machineId: 'furnance_1', recipeId: 'furnance_carbon_enr_1', x: 0, y: 0, limit: 2 }],
      edges: [],
    };
    const text = exportLibrary([{ id: 'x', name: 'Sơ đồ A', icon: null, kind: 'modeler', created: 1, preview: '', modeler: doc }]);
    const got = importFile(text, 'a.efp.json');
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ name: 'Sơ đồ A', kind: 'modeler', modeler: doc });
    expect(got[0]!.id).not.toBe('x');
  });
});

describe('Map: xây thò ra ngoài map tới 5 ô (người dùng 2026-09-29)', () => {
  it('máy đặt được ở viền ngoài 5 ô, quá 5 ô thì không; van băng chuyền thì không được ra ngoài', async () => {
    const { Grid, validatePlacement } = await import('../src/grid/grid');
    const grid = new Grid(20, 20);
    const furnace = ds.machines.get('furnance_1')!;
    expect(validatePlacement(grid, {}, furnace, -3, -3, 0).ok).toBe(true);
    expect(validatePlacement(grid, {}, furnace, 20, 20, 0).ok).toBe(true); // 3×3 ⇒ tới ô 22 < 25
    expect(validatePlacement(grid, {}, furnace, -6, 0, 0).ok).toBe(false);
    expect(validatePlacement(grid, {}, ds.machines.get('log_splitter')!, -1, 5, 0).ok).toBe(false);
    expect(validatePlacement(grid, {}, ds.machines.get('log_splitter')!, 0, 5, 0).ok).toBe(true);
    expect(validatePlacement(grid, {}, ds.machines.get('log_pipe_splitter')!, -1, 5, 0).ok).toBe(true);
  });
  it('băng chuyền không đi ra viền ngoài; ống thì được', async () => {
    const { Grid } = await import('../src/grid/grid');
    const { route } = await import('../src/grid/router');
    const grid = new Grid(20, 20);
    // từ (0,0) tới (0,5): đường thẳng nằm trong map — được; tới (-2,5) — băng không ra ngoài
    expect(route(grid, 0, { x: 0, z: 0 }, { x: -2, z: 5 })).toBeNull();
    expect(route(grid, 1, { x: 0, z: 0 }, { x: -2, z: 5 })).not.toBeNull();
  });
});
