import { describe, expect, it } from 'vitest';
import {
  boxSelection,
  clickTile,
  commitGroup,
  deleteSelection,
  emptySelection,
  mapCell,
  mapDir,
  mapMachine,
  planGroup,
  pruneSelection,
  segmentKeys,
  tileKeyOf,
  toggleMachine,
  type GroupMove,
  type Selection,
  type Turns,
} from '../src/editor/group';
import { setMode, setRecipe } from '../src/editor/ops';
import { auraRect } from '../src/model/env';
import { cellKey, footprint, footprintCells, worldPorts } from '../src/model/geometry';
import { buildNetwork } from '../src/model/network';
import type { Blueprint, Facing, PlacedMachine } from '../src/model/types';
import { solve } from '../src/sim/solver';
import { ds, paint, put, scene, source, wire, type Scene } from './helpers';

const MOSS = 'item_plant_moss_enr_powder_1';
const ROTS: Facing[] = [0, 90, 180, 270];

/** mỏ → lò A → lò B → kho, đặt so le để băng phải bẻ góc. */
function factory(): { s: Scene; ids: Record<string, number> } {
  const s = scene(60, 60);
  paint(s.terrain, 'mine', 9, 39, 5, 5);
  const mine = put(s, 'miner_1', 10, 40);
  const a = put(s, 'furnance_1', 15, 32);
  const b = put(s, 'furnance_1', 10, 25);
  const store = put(s, 'storager_1', 16, 18);
  source(s, mine, MOSS, 30);
  setRecipe(s.bp, ds, a, 'furnance_carbon_enr_powder_1');
  setRecipe(s.bp, ds, b, 'furnance_carbon_enr_1');
  wire(s, mine, 0, a, 0);
  wire(s, a, 0, b, 0);
  wire(s, b, 0, store, 0);
  return { s, ids: { mine, a, b, store } };
}

const selectAll = (bp: Blueprint): Selection => ({
  machines: new Set(bp.machines.map((m) => m.uid)),
  tiles: new Set(bp.belts.map(tileKeyOf)),
});

/** Các cặp nối trong bản vẽ: `máy:cổng → máy:cổng` cùng độ dài chuỗi. */
function links(bp: Blueprint, uidMap: (u: number) => number = (u) => u): string[] {
  return buildNetwork(bp, ds)
    .chains.map(
      (c) =>
        `${c.kind} ${c.from ? `${uidMap(c.from.uid)}:${c.from.portKey}` : '-'} → ${
          c.to ? `${uidMap(c.to.uid)}:${c.to.portKey}` : '-'
        } (${c.tiles.length})`,
    )
    .sort();
}

function solveSig(bp: Blueprint): string[] {
  const r = solve(bp, ds);
  return bp.machines
    .map((m) => `${m.uid} ${r.machines.get(m.uid)?.utilization.toFixed(4)}`)
    .sort();
}

function moveAll(s: Scene, mv: GroupMove, mode: 'move' | 'copy' = 'move'): Selection {
  const plan = planGroup(s.bp, ds, s.terrain, selectAll(s.bp), mv, mode);
  expect(plan.ok, plan.reason).toBe(true);
  return commitGroup(s.bp, plan, mode);
}

describe('phép quay khối cứng khớp với hình học máy', () => {
  it('mọi máy, mọi hướng, mọi góc quay: đế, cổng, hướng dòng chảy, vùng phủ quay như một khối', () => {
    for (const def of ds.machines.values()) {
      for (const rot of ROTS) {
        for (const turns of [0, 1, 2, 3] as Turns[]) {
          const m: PlacedMachine = { uid: 1, machineId: def.id, x: 20, z: 21, rot, recipeId: null, binding: {}, count: 1 };
          const mv: GroupMove = { anchor: { x: 23, z: 19 }, target: { x: 31, z: 34 }, turns };
          const to = mapMachine(m, footprint(def, rot), mv);
          const moved = { ...m, ...to };
          const tag = `${def.id} rot ${rot} turns ${turns}`;

          const cells = footprintCells(m, def).map((c) => cellKey(mapCell(c, mv))).sort();
          expect(footprintCells(moved, def).map(cellKey).sort(), tag).toEqual(cells);

          const want = worldPorts(m, def)
            .map((p) => `${p.key} ${cellKey(mapCell(p.cell, mv))} ${cellKey(mapCell(p.attach, mv))} ${mapDir(p.flow, turns)}`)
            .sort();
          const got = worldPorts(moved, def)
            .map((p) => `${p.key} ${cellKey(p.cell)} ${cellKey(p.attach)} ${p.flow}`)
            .sort();
          expect(got, tag).toEqual(want);

          const r0 = auraRect(m, def);
          const r1 = auraRect(moved, def);
          if (r0 && r1) {
            const a = mapCell({ x: r0.x, z: r0.z }, mv);
            const b = mapCell({ x: r0.x + r0.w - 1, z: r0.z + r0.d - 1 }, mv);
            expect({ x: r1.x, z: r1.z }, tag).toEqual({ x: Math.min(a.x, b.x), z: Math.min(a.z, b.z) });
          }
        }
      }
    }
  });
});

describe('di chuyển / xoay nhóm', () => {
  it('xoay 90° rồi đặt: mọi nối giữ nguyên, solver cho kết quả y hệt', () => {
    const { s } = factory();
    expect(s.bp.belts.some((t) => t.in !== t.out)).toBe(true); // có ô góc
    const before = links(s.bp);
    const solved = solveSig(s.bp);
    moveAll(s, { anchor: { x: 15, z: 30 }, target: { x: 30, z: 30 }, turns: 1 });
    expect(links(s.bp)).toEqual(before);
    expect(solveSig(s.bp)).toEqual(solved);
    expect(before.filter((l) => !l.includes('-')).length).toBe(3); // 3 tuyến đều hai đầu có máy
  });

  it('mọi góc quay đều giữ nối', () => {
    for (const turns of [1, 2, 3] as Turns[]) {
      const { s } = factory();
      const before = links(s.bp);
      moveAll(s, { anchor: { x: 15, z: 30 }, target: { x: 28, z: 29 }, turns });
      expect(links(s.bp), `turns ${turns}`).toEqual(before);
    }
  });

  it('xoay 4 lần 90° quanh cùng một tâm ⇒ về đúng vị trí và hướng ban đầu', () => {
    const { s } = factory();
    const snap = JSON.stringify({ m: s.bp.machines, t: [...s.bp.belts].map((t) => [t.x, t.z, t.kind, t.in, t.out]).sort() });
    for (let i = 0; i < 4; i++) moveAll(s, { anchor: { x: 20, z: 30 }, target: { x: 20, z: 30 }, turns: 1 });
    expect(JSON.stringify({ m: s.bp.machines, t: [...s.bp.belts].map((t) => [t.x, t.z, t.kind, t.in, t.out]).sort() })).toBe(snap);
  });

  it('config máy giữ nguyên: Lò Tinh Luyện chế độ Liquid, cùng công thức', () => {
    const s = scene(40, 40);
    const uid = put(s, 'furnance_1', 10, 10);
    setMode(s.bp, ds, uid, 'B');
    const liquid = ds.recipesByMachine.get('furnance_1')!.find((r) => r.mode === 'B')!;
    setRecipe(s.bp, ds, uid, liquid.id);
    const before = JSON.parse(JSON.stringify(s.bp.machines[0])) as PlacedMachine;

    moveAll(s, { anchor: { x: 11, z: 11 }, target: { x: 20, z: 20 }, turns: 1 });
    const moved = s.bp.machines[0]!;
    expect(moved).toMatchObject({ uid, mode: 'B', recipeId: liquid.id, binding: before.binding, rot: 90 });

    const sel: Selection = { machines: new Set([uid]), tiles: new Set() };
    const plan = planGroup(s.bp, ds, s.terrain, sel, { anchor: { x: 20, z: 20 }, target: { x: 5, z: 5 }, turns: 0 }, 'copy');
    expect(plan.ok).toBe(true);
    const out = commitGroup(s.bp, plan, 'copy');
    const copy = s.bp.machines.find((m) => out.machines.has(m.uid))!;
    expect(copy.uid).not.toBe(uid);
    expect(copy).toMatchObject({ mode: 'B', recipeId: liquid.id, binding: before.binding, rot: 90, count: before.count });
  });

  it('băng/ống không được chọn thì ở lại chỗ cũ', () => {
    const { s, ids } = factory();
    const sel: Selection = { machines: new Set([ids.a!]), tiles: new Set() };
    const beltsBefore = JSON.stringify(s.bp.belts);
    const plan = planGroup(s.bp, ds, s.terrain, sel, { anchor: { x: 16, z: 33 }, target: { x: 40, z: 33 }, turns: 0 }, 'move');
    expect(plan.ok).toBe(true);
    commitGroup(s.bp, plan, 'move');
    expect(JSON.stringify(s.bp.belts)).toBe(beltsBefore);
    expect(s.bp.machines.find((m) => m.uid === ids.a)).toMatchObject({ x: 39, z: 32 });
  });

  it('chỉ bỏ qua va chạm với chính nhóm đang di chuyển; đè lên thứ khác thì đỏ đúng ô', () => {
    const s = scene(40, 40);
    const a = put(s, 'furnance_1', 10, 10);
    put(s, 'furnance_1', 20, 10); // x20..22
    const sel: Selection = { machines: new Set([a]), tiles: new Set() };
    // dời 1 ô: đè lên chính nó — được
    expect(planGroup(s.bp, ds, s.terrain, sel, { anchor: { x: 10, z: 10 }, target: { x: 11, z: 10 }, turns: 0 }, 'move').ok).toBe(true);
    // dời tới x=18: ô x=20 đè máy kia
    const bad = planGroup(s.bp, ds, s.terrain, sel, { anchor: { x: 10, z: 10 }, target: { x: 18, z: 10 }, turns: 0 }, 'move');
    expect(bad.ok).toBe(false);
    expect(bad.blocked.map((c) => cellKey(c)).sort()).toEqual(['20,10', '20,11', '20,12']);
    // sao chép tại chỗ: bản gốc vẫn chặn
    expect(planGroup(s.bp, ds, s.terrain, sel, { anchor: { x: 10, z: 10 }, target: { x: 10, z: 10 }, turns: 0 }, 'copy').ok).toBe(false);
  });

  it('sao chép nhóm: uid mới, băng nối giữa các bản sao, ô băng mang mã group mới', () => {
    const { s } = factory();
    const n = s.bp.machines.length;
    const oldGroups = new Set(s.bp.belts.map((t) => t.group));
    const before = links(s.bp);
    const out = moveAll(s, { anchor: { x: 15, z: 30 }, target: { x: 40, z: 30 }, turns: 0 }, 'copy');
    expect(s.bp.machines.length).toBe(2 * n);
    const copies = s.bp.belts.filter((t) => out.tiles.has(tileKeyOf(t)));
    expect(copies.every((t) => !oldGroups.has(t.group))).toBe(true);
    // bản gốc + bản sao: mỗi tuyến xuất hiện hai lần
    expect(links(s.bp).length).toBe(before.length * 2);
  });

  it('sao chép cặp ống ngầm: ghép lại giữa hai bản sao khi cả hai đầu cùng trong nhóm', () => {
    const s = scene(40, 40);
    const a = put(s, 'udpipe_loader_1', 5, 5);
    const b = put(s, 'udpipe_unloader_1', 12, 5);
    s.bp.machines.find((m) => m.uid === a)!.pairTarget = b;
    s.bp.machines.find((m) => m.uid === b)!.pairTarget = a;

    const both = moveAll(s, { anchor: { x: 5, z: 5 }, target: { x: 5, z: 20 }, turns: 0 }, 'copy');
    const [ca, cb] = [...both.machines];
    const copyA = s.bp.machines.find((m) => m.uid === ca)!;
    const copyB = s.bp.machines.find((m) => m.uid === cb)!;
    expect(copyA.pairTarget).toBe(cb);
    expect(copyB.pairTarget).toBe(ca);
    // bản gốc không bị đụng tới
    expect(s.bp.machines.find((m) => m.uid === a)!.pairTarget).toBe(b);

    // chỉ một đầu trong nhóm ⇒ bản sao không có cặp
    const one: Selection = { machines: new Set([a]), tiles: new Set() };
    const plan = planGroup(s.bp, ds, s.terrain, one, { anchor: { x: 5, z: 5 }, target: { x: 25, z: 30 }, turns: 0 }, 'copy');
    const lone = commitGroup(s.bp, plan, 'copy');
    expect(s.bp.machines.find((m) => lone.machines.has(m.uid))!.pairTarget).toBeNull();
    expect(s.bp.machines.find((m) => m.uid === b)!.pairTarget).toBe(a);
  });

  it('di chuyển nhóm giữ cặp ống ngầm (uid không đổi)', () => {
    const s = scene(40, 40);
    const a = put(s, 'udpipe_loader_1', 5, 5);
    const b = put(s, 'udpipe_unloader_1', 12, 5);
    s.bp.machines.find((m) => m.uid === a)!.pairTarget = b;
    s.bp.machines.find((m) => m.uid === b)!.pairTarget = a;
    moveAll(s, { anchor: { x: 5, z: 5 }, target: { x: 10, z: 20 }, turns: 2 });
    expect(s.bp.machines.find((m) => m.uid === a)!.pairTarget).toBe(b);
  });
});

describe('chọn', () => {
  it('khung cắt ngang một đoạn băng 10 ô, 4 ô trong khung ⇒ đúng 4 ô', () => {
    const s = scene(40, 40);
    for (let x = 5; x < 15; x++) s.bp.belts.push({ x, z: 10, kind: 'belt', in: 1, out: 1, group: 1 });
    const sel = boxSelection(s.bp, ds, { x: 3, z: 8 }, { x: 8, z: 12 });
    expect([...sel.tiles].sort()).toEqual(['belt:5,10', 'belt:6,10', 'belt:7,10', 'belt:8,10']);
  });

  it('khung chạm một góc máy 5×5 ⇒ chọn cả máy; lấy cả băng lẫn ống', () => {
    const s = scene(40, 40);
    const uid = put(s, 'liquid_purifier_1', 10, 10);
    s.bp.belts.push({ x: 3, z: 3, kind: 'belt', in: 1, out: 1, group: 1 });
    s.bp.belts.push({ x: 3, z: 3, kind: 'pipe', in: 2, out: 2, group: 2 });
    const sel = boxSelection(s.bp, ds, { x: 0, z: 0 }, { x: 10, z: 10 });
    expect([...sel.machines]).toEqual([uid]);
    expect(sel.tiles.size).toBe(2);
  });

  it('Ctrl+bấm cùng một ô băng 3 lần ⇒ 1 ô → cả đoạn → bỏ cả đoạn', () => {
    const s = scene(40, 40);
    for (let x = 5; x < 10; x++) s.bp.belts.push({ x, z: 10, kind: 'belt', in: 1, out: 1, group: 1 });
    const c = { x: 7, z: 10 };
    let sel = clickTile(emptySelection(), s.bp, ds, 'belt', c, true);
    expect([...sel.tiles]).toEqual(['belt:7,10']);
    sel = clickTile(sel, s.bp, ds, 'belt', c, true);
    expect(sel.tiles.size).toBe(5);
    sel = clickTile(sel, s.bp, ds, 'belt', c, true);
    expect(sel.tiles.size).toBe(0);
  });

  it('bấm thường vào ô băng 3 lần ⇒ 1 ô → cả đoạn → bỏ cả đoạn (thay lựa chọn cũ)', () => {
    // Luật đổi 2026-09-29 (người dùng chốt): trước đây bấm thường chọn luôn cả đoạn; giờ bấm lần
    // đầu chỉ chọn đúng ô dưới con trỏ, bấm lại ô đã chọn mới lấy cả đoạn, bấm nữa thì bỏ chọn.
    const s = scene(40, 40);
    const uid = put(s, 'furnance_1', 20, 20);
    for (let x = 5; x < 10; x++) s.bp.belts.push({ x, z: 10, kind: 'belt', in: 1, out: 1, group: 1 });
    let sel = clickTile({ machines: new Set([uid]), tiles: new Set() }, s.bp, ds, 'belt', { x: 5, z: 10 }, false);
    expect(sel.machines.size).toBe(0);
    expect([...sel.tiles]).toEqual(['belt:5,10']);
    sel = clickTile(sel, s.bp, ds, 'belt', { x: 5, z: 10 }, false);
    expect(sel.tiles.size).toBe(5);
    // bấm vào một ô **khác** trong đoạn đã chọn trọn ⇒ bỏ cả đoạn
    sel = clickTile(sel, s.bp, ds, 'belt', { x: 8, z: 10 }, false);
    expect(sel.tiles.size).toBe(0);
  });

  it('bấm thường vào ô chưa chọn khi đang chọn ô khác ⇒ chỉ còn ô mới', () => {
    const s = scene(40, 40);
    for (let x = 5; x < 10; x++) s.bp.belts.push({ x, z: 10, kind: 'belt', in: 1, out: 1, group: 1 });
    for (let x = 5; x < 10; x++) s.bp.belts.push({ x, z: 20, kind: 'belt', in: 1, out: 1, group: 2 });
    let sel = clickTile(emptySelection(), s.bp, ds, 'belt', { x: 5, z: 10 }, false);
    sel = clickTile(sel, s.bp, ds, 'belt', { x: 6, z: 20 }, false);
    expect([...sel.tiles]).toEqual(['belt:6,20']);
  });

  it('đoạn băng bị van tách cắt: chỉ lấy phần trước (hoặc sau) van', () => {
    const s = scene(40, 40);
    const v = put(s, 'log_splitter', 10, 10);
    const def = ds.machines.get('log_splitter')!;
    const m = s.bp.machines.find((x) => x.uid === v)!;
    const ports = worldPorts(m, def);
    const inPort = ports.find((p) => p.dir === 'in')!;
    const outPort = ports.find((p) => p.dir === 'out' && p.flow === inPort.flow)!;
    // 3 ô dẫn vào van, 3 ô đi ra thẳng phía bên kia
    const f = inPort.flow;
    const back = (f + 2) % 4;
    const d = [
      { dx: 0, dz: -1 },
      { dx: 1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: -1, dz: 0 },
    ];
    for (let i = 0; i < 3; i++)
      s.bp.belts.push({ x: inPort.attach.x + d[back]!.dx * i, z: inPort.attach.z + d[back]!.dz * i, kind: 'belt', in: f, out: f, group: 1 });
    for (let i = 0; i < 3; i++)
      s.bp.belts.push({ x: outPort.attach.x + d[f]!.dx * i, z: outPort.attach.z + d[f]!.dz * i, kind: 'belt', in: f, out: f, group: 1 });
    const before = segmentKeys(s.bp, ds, 'belt', inPort.attach);
    const after = segmentKeys(s.bp, ds, 'belt', outPort.attach);
    expect(before).toHaveLength(3);
    expect(after).toHaveLength(3);
    expect(before.some((k) => after.includes(k))).toBe(false);
  });

  it('Ctrl+bấm máy: thêm rồi bỏ', () => {
    let sel = toggleMachine(emptySelection(), 4);
    expect([...sel.machines]).toEqual([4]);
    sel = toggleMachine(sel, 4);
    expect(sel.machines.size).toBe(0);
  });

  it('xoá nhóm gỡ cả cặp ống ngầm của đầu còn lại; lựa chọn tự bỏ thứ đã mất', () => {
    const s = scene(40, 40);
    const a = put(s, 'udpipe_loader_1', 5, 5);
    const b = put(s, 'udpipe_unloader_1', 12, 5);
    s.bp.machines.find((m) => m.uid === a)!.pairTarget = b;
    s.bp.machines.find((m) => m.uid === b)!.pairTarget = a;
    s.bp.belts.push({ x: 20, z: 20, kind: 'belt', in: 1, out: 1, group: 1 });
    const sel: Selection = { machines: new Set([a]), tiles: new Set(['belt:20,20']) };
    deleteSelection(s.bp, sel);
    expect(s.bp.machines.map((m) => m.uid)).toEqual([b]);
    expect(s.bp.machines[0]!.pairTarget).toBeNull();
    expect(s.bp.belts).toHaveLength(0);
    expect(pruneSelection(sel, s.bp)).toEqual(emptySelection());
  });
});
