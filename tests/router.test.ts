import { describe, expect, it } from 'vitest';
import { Grid } from '../src/grid/grid';
import { route } from '../src/grid/router';
import { ds, put, scene } from './helpers';

const countTurns = (path: { x: number; z: number }[]): number => {
  let turns = 0;
  for (let i = 2; i < path.length; i++) {
    const a = path[i - 2]!;
    const b = path[i - 1]!;
    const c = path[i]!;
    if ((b.x - a.x) * (c.z - b.z) !== (b.z - a.z) * (c.x - b.x)) turns++;
  }
  return turns;
};

describe('router', () => {
  it('lưới trống: đường ngắn nhất theo Manhattan', () => {
    const g = new Grid(20, 20);
    const p = route(g, 0, { x: 2, z: 2 }, { x: 8, z: 2 });
    expect(p).not.toBeNull();
    expect(p!).toHaveLength(7);
    expect(countTurns(p!)).toBe(0);
  });

  it('phạt khúc quanh: chọn đường ít gấp nhất trong các đường cùng độ dài', () => {
    const g = new Grid(20, 20);
    const p = route(g, 0, { x: 2, z: 2 }, { x: 7, z: 7 })!;
    expect(p).toHaveLength(11); // 5 + 5 + 1
    expect(countTurns(p)).toBe(1); // hình chữ L, không zigzag
  });

  it('đi vòng qua máy', () => {
    const s = scene(20, 20);
    put(s, 'furnance_1', 4, 1); // chiếm x 4..6, z 1..3
    const g = Grid.fromBlueprint(s.bp, ds);
    const p = route(g, 0, { x: 2, z: 2 }, { x: 8, z: 2 })!;
    expect(p).not.toBeNull();
    expect(p.length).toBeGreaterThan(7);
    for (const c of p) expect(g.free(0, c) || (c.x === 2 && c.z === 2) || (c.x === 8 && c.z === 2)).toBe(true);
  });

  it('ống bắc qua được bên trên băng chuyền', () => {
    const s = scene(20, 20);
    put(s, 'furnance_1', 4, 1);
    const g = Grid.fromBlueprint(s.bp, ds);
    // layer 0 bị máy chắn; máy cao 4 > 3 nên layer 1 cũng bị chắn
    expect(g.free(0, { x: 5, z: 2 })).toBe(false);
    expect(g.free(1, { x: 5, z: 2 })).toBe(false);
    // nhưng một tuyến băng trên layer 0 thì không chắn layer 1
    g.set(0, { x: 10, z: 10 }, { kind: 'belt', uid: 99, index: 0, linkKind: 'belt' });
    expect(g.free(0, { x: 10, z: 10 })).toBe(false);
    expect(g.free(1, { x: 10, z: 10 })).toBe(true);
    expect(route(g, 1, { x: 8, z: 10 }, { x: 12, z: 10 })).not.toBeNull();
  });

  it('bị vây kín thì trả về null', () => {
    const g = new Grid(5, 5);
    for (const c of [{ x: 1, z: 2 }, { x: 3, z: 2 }, { x: 2, z: 1 }, { x: 2, z: 3 }])
      g.set(0, c, { kind: 'machine', uid: 1 });
    expect(route(g, 0, { x: 2, z: 2 }, { x: 0, z: 0 })).toBeNull();
  });
});

describe('hiệu năng router', () => {
  it('trường hợp xấu nhất (đích bị vây kín trên lưới 70×70) vẫn xong nhanh', () => {
    const g = new Grid(70, 70);
    // vây kín đích để A* phải duyệt gần như toàn bộ không gian trạng thái
    for (const c of [{ x: 69, z: 68 }, { x: 68, z: 69 }]) g.set(0, c, { kind: 'machine', uid: 1 });
    const t0 = performance.now();
    expect(route(g, 0, { x: 0, z: 0 }, { x: 69, z: 69 })).toBeNull();
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it('đường dài xuyên mê cung vẫn ra kết quả', () => {
    const g = new Grid(70, 70);
    for (let z = 2; z < 68; z += 4) {
      const gap = z % 8 === 2 ? 68 : 1;
      for (let x = 1; x < 69; x++) if (x !== gap) g.set(0, { x, z }, { kind: 'machine', uid: 1 });
    }
    const t0 = performance.now();
    const p = route(g, 0, { x: 1, z: 1 }, { x: 68, z: 68 });
    expect(p).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
