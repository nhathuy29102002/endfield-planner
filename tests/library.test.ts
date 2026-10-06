import { describe, expect, it } from 'vitest';
import { exportLibrary, importFile, moduleFromSelection, piecesSize, type SavedBlueprint } from '../src/blueprint/library';
import { toJson } from '../src/blueprint/serialize';
import { boxSelection, commitGroup, planPieces, type Selection } from '../src/editor/group';
import { setMode, setRecipe } from '../src/editor/ops';
import { buildNetwork } from '../src/model/network';
import type { Blueprint } from '../src/model/types';
import { ds, put, scene, wire } from './helpers';

/** Hai lò nối nhau bằng băng có góc; lò A ở chế độ Liquid. */
function cluster(): { bp: Blueprint; a: number; b: number } {
  const s = scene(60, 60);
  const a = put(s, 'furnance_1', 15, 32);
  const b = put(s, 'furnance_1', 10, 25);
  setMode(s.bp, ds, a, 'B');
  const liquid = ds.recipesByMachine.get('furnance_1')!.find((r) => r.mode === 'B')!;
  setRecipe(s.bp, ds, a, liquid.id);
  wire(s, a, 0, b, 0);
  return { bp: s.bp, a, b };
}

const inner = (bp: Blueprint, uids: Set<number>): string[] =>
  buildNetwork(bp, ds)
    .chains.filter((c) => c.from && c.to && uids.has(c.from.uid) && uids.has(c.to.uid))
    .map((c) => `${c.from!.portKey}->${c.to!.portKey} (${c.tiles.length})`);

describe('thư viện bản vẽ — module', () => {
  it('tách nhóm thành module dời về (0,0), không đụng bản vẽ gốc', () => {
    const { bp } = cluster();
    const before = JSON.stringify(bp);
    const sel = boxSelection(bp, ds, { x: 0, z: 0 }, { x: 59, z: 59 });
    const mod = moduleFromSelection(bp, ds, sel);
    expect(JSON.stringify(bp)).toBe(before);
    const minX = Math.min(...mod.machines.map((m) => m.x), ...mod.tiles.map((t) => t.x));
    const minZ = Math.min(...mod.machines.map((m) => m.z), ...mod.tiles.map((t) => t.z));
    expect([minX, minZ]).toEqual([0, 0]);
    expect(piecesSize(ds, mod)).toEqual({ w: 8, d: 10 });
  });

  it('đặt module (có quay): uid mới, nối bên trong giữ nguyên, config giữ nguyên', () => {
    const { bp, a } = cluster();
    const sel = boxSelection(bp, ds, { x: 0, z: 0 }, { x: 59, z: 59 });
    const mod = moduleFromSelection(bp, ds, sel);
    const want = inner(bp, new Set(bp.machines.map((m) => m.uid)));

    const target = scene(60, 60).bp;
    const plan = planPieces(ds, {}, mod, { anchor: { x: 0, z: 0 }, target: { x: 30, z: 5 }, turns: 1 }, target);
    expect(plan.ok, plan.reason).toBe(true);
    const out = commitGroup(target, plan, 'copy');
    expect(inner(target, out.machines)).toEqual(want);
    const liquid = target.machines.find((m) => m.mode === 'B')!;
    expect(liquid.recipeId).toBe(bp.machines.find((m) => m.uid === a)!.recipeId);
    expect(liquid.rot).toBe(90);

    // đặt lần hai chồng lên lần một ⇒ không cho
    const again = planPieces(ds, {}, mod, { anchor: { x: 0, z: 0 }, target: { x: 30, z: 5 }, turns: 1 }, target);
    expect(again.ok).toBe(false);
    expect(again.blocked.length).toBeGreaterThan(0);
  });

  it('cặp ống ngầm trỏ ra ngoài nhóm thì bỏ; cả hai đầu trong nhóm thì giữ', () => {
    const s = scene(40, 40);
    const a = put(s, 'udpipe_loader_1', 5, 5);
    const b = put(s, 'udpipe_unloader_1', 12, 5);
    s.bp.machines.find((m) => m.uid === a)!.pairTarget = b;
    s.bp.machines.find((m) => m.uid === b)!.pairTarget = a;
    const one: Selection = { machines: new Set([a]), tiles: new Set() };
    expect(moduleFromSelection(s.bp, ds, one).machines[0]!.pairTarget).toBeNull();
    const both: Selection = { machines: new Set([a, b]), tiles: new Set() };
    const mod = moduleFromSelection(s.bp, ds, both);
    expect(mod.machines.find((m) => m.uid === a)!.pairTarget).toBe(b);
  });
});

describe('thư viện bản vẽ — nhập / xuất', () => {
  it('xuất rồi nhập lại: giữ nội dung, nhận id mới', () => {
    const { bp } = cluster();
    const item: SavedBlueprint = {
      id: 'x1',
      name: 'Cụm lò',
      icon: 'item_iron_nugget',
      kind: 'module',
      created: 1,
      preview: '',
      module: moduleFromSelection(bp, ds, boxSelection(bp, ds, { x: 0, z: 0 }, { x: 59, z: 59 })),
    };
    const back = importFile(exportLibrary([item]), 'a.json');
    expect(back).toHaveLength(1);
    expect(back[0]!.id).not.toBe('x1');
    expect(back[0]!.module).toEqual(item.module);
    expect(back[0]!.name).toBe('Cụm lò');
  });

  it('file .json kiểu cũ (lưu cả bản vẽ) ⇒ một bản vẽ toàn map', () => {
    const { bp } = cluster();
    const back = importFile(toJson(bp, {}), 'nha-may.json');
    expect(back[0]!.kind).toBe('map');
    expect(back[0]!.map!.blueprint.machines).toHaveLength(2);
  });
});
