import { describe, expect, it } from 'vitest';
import { copyMachine, moveMachine, setRecipe } from '../src/editor/ops';
import { originFor, rotFromDrag } from '../src/editor/placement';
import { Grid, ghostCells } from '../src/grid/grid';
import { ds, put, scene } from './helpers';

describe('xoay bằng cách giữ chuột phải và rê', () => {
  it('rê lên / phải / xuống / trái ⇒ 0 / 90 / 180 / 270', () => {
    expect(rotFromDrag(0, -40, 18)).toBe(0);
    expect(rotFromDrag(40, 0, 18)).toBe(90);
    expect(rotFromDrag(0, 40, 18)).toBe(180);
    expect(rotFromDrag(-40, 0, 18)).toBe(270);
  });

  it('rê chưa đủ xa thì chưa xoay — tay rung không làm máy quay', () => {
    expect(rotFromDrag(5, -8, 18)).toBeNull();
  });

  it('rê chéo thì theo trục trội hơn', () => {
    expect(rotFromDrag(40, -10, 18)).toBe(90);
    expect(rotFromDrag(-10, 40, 18)).toBe(180);
  });
});

describe('preview máy', () => {
  it('con trỏ nằm giữa đế', () => {
    const def = ds.machines.get('liquid_purifier_1')!; // 5×5
    expect(originFor(def, 0, { x: 10, z: 10 })).toEqual({ x: 8, z: 8 });
  });

  it('chỉ tô đỏ đúng những ô chồng lên máy khác', () => {
    const s = scene(40, 40);
    put(s, 'furnance_1', 10, 10); // x10..12, z10..12
    const grid = Grid.fromBlueprint(s.bp, ds);
    const cells = ghostCells(grid, ds.machines.get('furnance_1')!, 12, 12, 0);
    const blocked = cells.filter((c) => c.blocked).map((c) => `${c.cell.x},${c.cell.z}`);
    expect(blocked).toEqual(['12,12']); // chỉ đúng một ô góc bị trùng
    expect(cells).toHaveLength(9);
  });

  it('di chuyển: máy không tự chặn chính nó', () => {
    const s = scene(40, 40);
    const uid = put(s, 'furnance_1', 10, 10);
    const grid = Grid.fromBlueprint(s.bp, ds);
    const cells = ghostCells(grid, ds.machines.get('furnance_1')!, 11, 10, 0, uid);
    expect(cells.every((c) => !c.blocked)).toBe(true);
  });
});

describe('di chuyển và sao chép', () => {
  it('di chuyển sang chỗ mới với hướng mới', () => {
    const s = scene(40, 40);
    const uid = put(s, 'furnance_1', 10, 10);
    expect(moveMachine(s.bp, ds, s.terrain, uid, 20, 20, 90).ok).toBe(true);
    expect(s.bp.machines[0]).toMatchObject({ uid, x: 20, z: 20, rot: 90 });
  });

  it('di chuyển chồng lên máy khác thì không cho', () => {
    const s = scene(40, 40);
    const a = put(s, 'furnance_1', 10, 10);
    put(s, 'furnance_1', 20, 20);
    const r = moveMachine(s.bp, ds, s.terrain, a, 21, 21, 0);
    expect(r.ok).toBe(false);
    expect(s.bp.machines.find((m) => m.uid === a)).toMatchObject({ x: 10, z: 10 });
  });

  it('sao chép: máy gốc giữ nguyên, bản sao mang theo thiết lập', () => {
    const s = scene(40, 40);
    const src = put(s, 'transmuter_1', 5, 5);
    const fluidify = ds.recipesByMachine.get('transmuter_1')!.find((r) => r.mode === 'B')!;
    setRecipe(s.bp, ds, src, fluidify.id);
    s.bp.machines[0]!.count = 3;

    const r = copyMachine(s.bp, ds, s.terrain, src, 20, 5, 180);
    expect(r.ok).toBe(true);
    expect(s.bp.machines).toHaveLength(2);
    const [orig, copy] = s.bp.machines;
    expect(orig).toMatchObject({ x: 5, z: 5, rot: 0 });
    expect(copy).toMatchObject({ x: 20, z: 5, rot: 180, recipeId: fluidify.id, mode: 'B', count: 3 });
    expect(copy!.uid).not.toBe(orig!.uid);
  });

  it('sao chép không lấy mất cặp ống ngầm của máy gốc', () => {
    const s = scene(40, 40);
    const a = put(s, 'udpipe_loader_1', 5, 5);
    const b = put(s, 'udpipe_unloader_1', 20, 5);
    s.bp.machines.find((m) => m.uid === a)!.pairTarget = b;
    s.bp.machines.find((m) => m.uid === b)!.pairTarget = a;
    copyMachine(s.bp, ds, s.terrain, a, 5, 20, 0);
    const copy = s.bp.machines[s.bp.machines.length - 1]!;
    expect(copy.pairTarget ?? null).toBeNull();
    expect(s.bp.machines.find((m) => m.uid === b)!.pairTarget).toBe(a);
  });

  it('sao chép vào chỗ đã có máy thì không cho', () => {
    const s = scene(40, 40);
    const a = put(s, 'furnance_1', 10, 10);
    expect(copyMachine(s.bp, ds, s.terrain, a, 11, 11, 0).ok).toBe(false);
    expect(s.bp.machines).toHaveLength(1);
  });
});
