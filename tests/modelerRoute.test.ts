import { describe, expect, it } from 'vitest';
import { insertIndex, nearestOnRoute, routeMid, routeSegments, segPoint, type RouteEnd } from '../src/modeler/route';
import { copyNodes, emptyModeler, type ModelerDoc } from '../src/modeler/doc';

/** Đường nối Modeler nhiều điểm neo (người dùng 2026-09-30, lần sửa thứ 4 của "uốn đường"). */
const A: RouteEnd = { x: 0, y: 0, d: { x: 1, y: 0 } }; // cổng ra bên phải
const B: RouteEnd = { x: 400, y: 0, d: { x: -1, y: 0 } }; // cổng vào bên trái

describe('đường nối qua các điểm neo', () => {
  it('không có điểm neo: một đoạn cong như cũ, tay nắm theo hướng cổng', () => {
    const s = routeSegments(A, B);
    expect(s).toHaveLength(1);
    expect(s[0]![1]).toEqual({ x: 160, y: 0 }); // 400 / 2.5
    expect(s[0]![2]).toEqual({ x: 240, y: 0 });
  });

  it('đường đi qua **đúng** từng điểm neo; rời / vào cổng đúng hướng', () => {
    const pts = [{ x: 100, y: 120 }, { x: 300, y: -80 }];
    const s = routeSegments(A, B, pts);
    expect(s).toHaveLength(3);
    expect(s[0]![3]).toEqual(pts[0]);
    expect(s[1]![3]).toEqual(pts[1]);
    expect(s[2]![3]).toEqual({ x: 400, y: 0, d: B.d });
    // tay nắm đầu hướng theo cổng ra (+x), tay nắm cuối nằm phía trước cổng vào (−x của cổng ⇒ x nhỏ hơn 400)
    expect(s[0]![1].y).toBe(0);
    expect(s[0]![1].x).toBeGreaterThan(0);
    expect(s[2]![2].y).toBe(0);
    expect(s[2]![2].x).toBeLessThan(400);
    // trơn qua điểm neo: tay nắm hai bên thẳng hàng với điểm neo
    const [p, c2] = [s[0]![3], s[0]![2]];
    const c1 = s[1]![1];
    const cross = (c2.x - p.x) * (c1.y - p.y) - (c2.y - p.y) * (c1.x - p.x);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
  });

  it('nắm đường ở đoạn nào thì điểm neo mới chèn vào đúng đoạn đó; điểm neo cũ giữ nguyên', () => {
    const pts = [{ x: 200, y: 100 }];
    const s = routeSegments(A, B, pts);
    const onFirst = segPoint(s[0]!, 0.5);
    const onSecond = segPoint(s[1]!, 0.5);
    expect(insertIndex(s, onFirst)).toBe(0);
    expect(insertIndex(s, onSecond)).toBe(1);
    expect(nearestOnRoute(s, onSecond).dist).toBeLessThan(2);
    // chèn điểm mới vào đoạn 2 rồi kéo nó ⇒ đường qua điểm cũ và điểm mới
    const next = [...pts];
    next.splice(insertIndex(s, onSecond), 0, { x: 330, y: -60 });
    const s2 = routeSegments(A, B, next);
    expect(s2[0]![3]).toEqual({ x: 200, y: 100 });
    expect(s2[1]![3]).toEqual({ x: 330, y: -60 });
  });

  it('icon giữa đường nằm ở giữa theo độ dài', () => {
    const m = routeMid(routeSegments(A, B));
    expect(m.x).toBeCloseTo(200, 0);
    expect(m.y).toBeCloseTo(0, 5);
  });

  it('sao chép nhóm: điểm neo dời theo bản sao', () => {
    const doc: ModelerDoc = {
      ...emptyModeler(),
      nodes: [
        { id: 'a', machineId: 'x', recipeId: null, x: 0, y: 0, limit: null },
        { id: 'b', machineId: 'x', recipeId: null, x: 300, y: 0, limit: null },
      ],
      edges: [{ id: 'e', from: { node: 'a', item: 'i' }, to: { node: 'b', item: 'i' }, points: [{ x: 150, y: 80 }] }],
    };
    copyNodes(doc, ['a', 'b'], 40, 40);
    expect(doc.edges[1]!.points).toEqual([{ x: 190, y: 120 }]);
    expect(doc.edges[0]!.points).toEqual([{ x: 150, y: 80 }]);
  });
});
