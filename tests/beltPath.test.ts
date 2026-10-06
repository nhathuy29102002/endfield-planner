import { describe, expect, it } from 'vitest';
import { BeltPath, BREAK_CELLS, pathKeys } from '../src/editor/beltPath';
import { commitPlan } from '../src/editor/belts';
import { worldPorts } from '../src/model/geometry';
import { buildNetwork } from '../src/model/network';
import { ds, put, scene } from './helpers';

/** Vẽ một nét: đặt ngón ở ô đầu rồi đi qua lần lượt các ô. */
function stroke(p: BeltPath, ...cells: [number, number][]): boolean {
  const ok = p.begin({ x: cells[0]![0], z: cells[0]![1] });
  for (const [x, z] of cells.slice(1)) p.moveTo({ x, z });
  return ok;
}

describe('vẽ băng / ống bằng ngón tay (app Android, người dùng 2026-10-05)', () => {
  it('đi thẳng rồi rẽ: đúng từng ô ngón tay đi qua, ô góc rẽ đúng hướng', () => {
    const s = scene();
    const p = new BeltPath(s.bp, ds, 'belt');
    stroke(p, [5, 5], [8, 5], [8, 8]);
    const plan = p.plan()!;
    expect(plan.ok).toBe(true);
    expect(pathKeys(plan)).toEqual(['5,5', '6,5', '7,5', '8,5', '8,6', '8,7', '8,8']);
    expect(plan.ins[0]).toBe(1); // ô đầu lấy hướng theo bước đầu (sang phải)
    expect([plan.ins[3], plan.outs[3]]).toEqual([1, 2]); // ô góc: vào từ trái, ra xuống dưới
    expect(plan.outs[6]).toBe(2);
  });

  it('đi ngược vào 1 trong 2 ô liền trước ⇒ tua đầu ống về đó', () => {
    const s = scene();
    const p = new BeltPath(s.bp, ds, 'pipe');
    stroke(p, [5, 5], [10, 5]);
    p.moveTo({ x: 9, z: 5 });
    expect(p.head).toEqual({ x: 9, z: 5 });
    p.moveTo({ x: 7, z: 5 }); // lùi tiếp hai ô
    expect(p.head).toEqual({ x: 7, z: 5 });
    expect(p.length).toBe(3);
  });

  it('cắt vuông góc qua ô thẳng cùng loại ⇒ cầu; đi dọc tuyến cũ ⇒ đè; không rẽ trên cầu', () => {
    const s = scene();
    // tuyến dọc x = 8 có sẵn
    const old = new BeltPath(s.bp, ds, 'belt');
    stroke(old, [8, 2], [8, 9]);
    commitPlan(s.bp, old.plan()!);
    const p = new BeltPath(s.bp, ds, 'belt');
    stroke(p, [5, 5], [11, 5]);
    const plan = p.plan()!;
    expect(plan.bridges).toEqual([{ x: 8, z: 5 }]);
    // rẽ ngay trên cầu: đầu ống đứng lại ở cầu
    const q = new BeltPath(s.bp, ds, 'belt');
    stroke(q, [5, 6], [8, 6], [8, 7]);
    expect(q.head).toEqual({ x: 8, z: 6 });
    expect(q.plan()!.ok).toBe(false);
    // đi dọc tuyến cũ (cùng phương, ngược chiều cũng vậy) ⇒ đè
    const r = new BeltPath(s.bp, ds, 'belt');
    stroke(r, [8, 11], [8, 8]);
    expect(r.plan()!.bridges).toEqual([]);
    expect(pathKeys(r.plan())).toEqual(['8,11', '8,10', '8,9', '8,8']);
  });

  it(`vướng máy: đầu ống đứng lại; ngón tay qua vật cản quá ${BREAK_CELLS} ô ⇒ ngắt ống`, () => {
    const s = scene();
    put(s, 'furnance_1', 10, 4); // 3×3: x 10..12, z 4..6 — hai mặt trái / phải không có cổng
    const p = new BeltPath(s.bp, ds, 'belt');
    stroke(p, [6, 5], [9, 5], [11, 5]);
    expect(p.head).toEqual({ x: 9, z: 5 });
    expect(p.broken).toBe(false);
    p.moveTo({ x: 9, z: 5 }); // quay lại đầu ống: đi tiếp được
    p.moveTo({ x: 8, z: 5 }); // tua lùi một ô
    expect(p.head).toEqual({ x: 8, z: 5 });
    p.moveTo({ x: 9, z: 5 });
    // xuyên qua cả máy: 3 ô máy + 2 ô không kề đầu ống = 5 ô vật cản ⇒ ngắt
    p.moveTo({ x: 15, z: 5 });
    expect(p.broken).toBe(true);
    const head = p.head;
    p.moveTo({ x: 15, z: 9 });
    expect(p.head).toEqual(head);
  });

  it('bắt đầu trên máy: ra qua ô trước cổng ra; đi vào máy kia qua ô trước cổng vào ⇒ cắm vào cổng, đặt xong là nối', () => {
    const s = scene();
    const a = put(s, 'furnance_1', 4, 10);
    const b = put(s, 'furnance_1', 14, 10);
    const ma = s.bp.machines.find((m) => m.uid === a)!;
    const mb = s.bp.machines.find((m) => m.uid === b)!;
    const out = worldPorts(ma, ds.machines.get('furnance_1')!).find((p) => p.dir === 'out' && p.kind === 'belt' && !p.virtual)!;
    const inn = worldPorts(mb, ds.machines.get('furnance_1')!).find((p) => p.dir === 'in' && p.kind === 'belt' && !p.virtual)!;
    const p = new BeltPath(s.bp, ds, 'belt');
    expect(p.begin(out.cell)).toBe(true);
    p.moveTo(out.attach);
    expect(p.plan()!.from).toEqual({ uid: a, portKey: out.key });
    // vòng qua khe giữa hai lò (x = 10) tới ô trước cổng vào (mặt dưới máy B) rồi bước vào máy đúng hướng cổng
    p.moveTo({ x: 10, z: out.attach.z });
    p.moveTo({ x: 10, z: inn.attach.z });
    p.moveTo(inn.attach);
    p.moveTo(inn.cell);
    const plan = p.plan()!;
    expect(plan.ok).toBe(true);
    expect(plan.endsAtPort).toBe(true);
    expect(plan.to).toEqual({ uid: b, portKey: inn.key });
    commitPlan(s.bp, plan);
    // đặt xong: mạng tuyến có đúng một chuỗi đi từ cổng ra của A tới cổng vào của B
    const net = buildNetwork(s.bp, ds);
    expect(net.chains.some((c) => c.from?.uid === a && c.from.portKey === out.key && c.to?.uid === b && c.to.portKey === inn.key)).toBe(true);
  });
});
