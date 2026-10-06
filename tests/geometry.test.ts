import { describe, expect, it } from 'vitest';
import { loadDataset } from '../src/model/dataset';
import { footprint, footprintCells, rotateLocal, worldPorts } from '../src/model/geometry';
import type { Facing, PlacedMachine } from '../src/model/types';

const ds = loadDataset();
const place = (machineId: string, x: number, z: number, rot: Facing): PlacedMachine => ({
  uid: 1,
  machineId,
  x,
  z,
  rot,
  recipeId: null,
  binding: {},
  count: 1,
});

describe('dữ liệu đã trích', () => {
  it('có đủ máy, công thức, item (bộ dữ liệu 1.5)', () => {
    expect(ds.machines.size).toBe(60);
    expect(ds.recipes.size).toBe(318);
    expect(ds.items.size).toBe(210);
  });

  it('1.5 có thêm pha khí, cổng kích hoạt, môi trường xúc tác, kho tổng', () => {
    expect([...ds.items.values()].filter((i) => i.phase === 'gas').length).toBeGreaterThan(0);
    expect([...ds.machines.values()].filter((m) => m.activatorPort).map((m) => m.id).sort()).toEqual([
      'transmuter_1',
      'transmuter_2',
      'vaporizer_1',
    ]);
    expect(ds.machines.get('vaporizer_1')!.aura).toEqual({ w: 13, d: 13, dx: -5, dz: -5, kind: 'env' });
    expect([...ds.recipes.values()].filter((r) => r.catalystEnv !== 'None')).toHaveLength(5);
    expect([...ds.machines.values()].some((m) => m.type === 'Depot')).toBe(true);
  });

  it('cổng kích hoạt của transmuter là cổng ống ở mép khác với hai cổng nguyên liệu', () => {
    const m = ds.machines.get('transmuter_1')!;
    expect(m.activatorPort).toBe('in2');
    const act = m.ports.find((p) => `${p.dir}${p.index}` === m.activatorPort)!;
    const others = m.ports.filter((p) => p.dir === 'in' && `${p.dir}${p.index}` !== m.activatorPort);
    expect(act.facing).toBe(180);
    for (const o of others) expect(o.facing).toBe(90);
  });

  it('furnance_1 đúng kích thước và số cổng', () => {
    const m = ds.machines.get('furnance_1')!;
    expect(m.size).toEqual({ w: 3, d: 3, h: 4 });
    expect(m.ports.filter((p) => p.dir === 'in' && p.kind === 'belt')).toHaveLength(3);
    expect(m.ports.filter((p) => p.dir === 'out' && p.kind === 'belt')).toHaveLength(3);
    expect(m.ports.filter((p) => p.kind === 'pipe')).toHaveLength(2);
  });

  it('chỉ van chia/gộp 1×1 mới dùng chung ô cho cổng vào và ra', () => {
    for (const m of ds.machines.values()) {
      const ins = new Set(m.ports.filter((p) => p.dir === 'in').map((p) => `${p.x},${p.z},${p.level}`));
      const shared = m.ports
        .filter((p) => p.dir === 'out')
        .some((p) => ins.has(`${p.x},${p.z},${p.level}`));
      expect(shared, `${m.id}: dùng chung ô ${shared ? 'có' : 'không'}`).toBe(m.router);
    }
  });

  it('mọi cổng thật đều nằm trên mép footprint (cổng phụ `virtual` thì không)', () => {
    for (const m of ds.machines.values()) {
      for (const p of m.ports) {
        if (p.virtual) continue;
        const onEdge = p.x === 0 || p.z === 0 || p.x === m.size.w - 1 || p.z === m.size.d - 1;
        expect(onEdge, `${m.id} cổng ${p.dir}#${p.index} ở (${p.x},${p.z}) không ở mép`).toBe(true);
      }
    }
  });
});

describe('rotateLocal', () => {
  it('quay 4 lần thì về chỗ cũ', () => {
    const [w, d] = [3, 5];
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        let c = { x, z };
        // mỗi lần quay 90° thì hộp đổi chiều, nên w/d phải hoán vị theo
        let [bw, bd] = [w, d];
        for (let i = 0; i < 4; i++) {
          c = rotateLocal(c.x, c.z, bw, bd, 90);
          [bw, bd] = [bd, bw];
        }
        expect(c).toEqual({ x, z });
      }
    }
  });

  it('là song ánh trong hộp đã quay', () => {
    const def = ds.machines.get('mix_pool_2')!;
    for (const rot of [0, 90, 180, 270] as Facing[]) {
      const box = footprint(def, rot);
      const seen = new Set<string>();
      for (let x = 0; x < def.size.w; x++) {
        for (let z = 0; z < def.size.d; z++) {
          const c = rotateLocal(x, z, def.size.w, def.size.d, rot);
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.z).toBeGreaterThanOrEqual(0);
          expect(c.x).toBeLessThan(box.w);
          expect(c.z).toBeLessThan(box.d);
          seen.add(`${c.x},${c.z}`);
        }
      }
      expect(seen.size).toBe(def.size.w * def.size.d);
    }
  });
});

describe('worldPorts', () => {
  it('furnance_1 chưa quay: vào ở cạnh sau, ra ở cạnh trước', () => {
    const def = ds.machines.get('furnance_1')!;
    // Luật đổi 2026-09-29: cổng ống chỉ có ở chế độ Liquid (B) — chế độ thường không có ống
    const ports = worldPorts({ ...place('furnance_1', 10, 10, 0), mode: 'B' }, def);
    const beltIn = ports.filter((p) => p.dir === 'in' && p.kind === 'belt');
    const beltOut = ports.filter((p) => p.dir === 'out' && p.kind === 'belt');
    // vào: z = 12 (cạnh sau), tuyến chạm vào z = 13
    expect(beltIn.map((p) => p.cell.z)).toEqual([12, 12, 12]);
    expect(beltIn.map((p) => p.attach.z)).toEqual([13, 13, 13]);
    // ra: z = 10 (cạnh trước), tuyến chạm vào z = 9
    expect(beltOut.map((p) => p.cell.z)).toEqual([10, 10, 10]);
    expect(beltOut.map((p) => p.attach.z)).toEqual([9, 9, 9]);
    // ống: bảng game ghi vào ở x=0, nhưng hệ trục game lật x so với màn hình
    // ⇒ trên lưới ống vào ở bên PHẢI (chạm x = 13), ra ở bên TRÁI (chạm x = 9)
    expect(ports.find((p) => p.kind === 'pipe' && p.dir === 'in')!.attach).toEqual({ x: 13, z: 11 });
    expect(ports.find((p) => p.kind === 'pipe' && p.dir === 'out')!.attach).toEqual({ x: 9, z: 11 });
  });

  it('van chia 1×1: một ô, bốn hướng khác nhau', () => {
    const def = ds.machines.get('log_splitter')!;
    const ports = worldPorts(place('log_splitter', 5, 5, 0), def);
    for (const p of ports) expect(p.cell).toEqual({ x: 5, z: 5 });
    const attaches = ports.map((p) => `${p.attach.x},${p.attach.z}`);
    expect(new Set(attaches).size).toBe(4);
    // hàng vào từ +z, ba hướng ra là +x, -z, -x
    expect(ports.find((p) => p.dir === 'in')!.attach).toEqual({ x: 5, z: 6 });
    expect(new Set(ports.filter((p) => p.dir === 'out').map((p) => `${p.attach.x},${p.attach.z}`))).toEqual(
      new Set(['6,5', '5,4', '4,5']),
    );
  });

  it('ống ngầm: đầu nối nằm đúng phía có đầu nối trên sprite', () => {
    // sprite udpipe_loader vẽ đầu nối ở bên phải, udpipe_unloader ở bên trái
    const loader = worldPorts(place('udpipe_loader_1', 10, 10, 0), ds.machines.get('udpipe_loader_1')!);
    const inPort = loader.find((p) => p.dir === 'in')!;
    expect(inPort.cell.x).toBe(12);
    expect(inPort.attach.x).toBe(13);

    const unloader = worldPorts(
      place('udpipe_unloader_1', 10, 10, 0),
      ds.machines.get('udpipe_unloader_1')!,
    );
    const outPort = unloader.find((p) => p.dir === 'out' && !p.virtual)!;
    expect(outPort.cell.x).toBe(10);
    expect(outPort.attach.x).toBe(9);
  });

  it('ống ở layer 1, băng ở layer 0', () => {
    const def = ds.machines.get('furnance_1')!;
    for (const p of worldPorts(place('furnance_1', 0, 0, 0), def)) {
      expect(p.layer).toBe(p.kind === 'pipe' ? 1 : 0);
    }
  });

  it('quay 90° thì cạnh vào chuyển sang trục x', () => {
    const def = ds.machines.get('furnance_1')!;
    const ports = worldPorts(place('furnance_1', 10, 10, 90), def);
    const beltIn = ports.filter((p) => p.dir === 'in' && p.kind === 'belt');
    // footprint 3x3 quay 90°: cạnh sau (+z) thành cạnh -x
    expect(new Set(beltIn.map((p) => p.attach.x))).toEqual(new Set([9]));
    expect(beltIn.map((p) => p.attach.z).sort()).toEqual([10, 11, 12]);
  });

  it('mọi máy, mọi góc: ô cổng nằm trong footprint, ô chạm nằm ngoài', () => {
    for (const def of ds.machines.values()) {
      if (def.ports.length === 0) continue;
      for (const rot of [0, 90, 180, 270] as Facing[]) {
        const p = place(def.id, 20, 20, rot);
        const inside = new Set(footprintCells(p, def).map((c) => `${c.x},${c.z}`));
        for (const wp of worldPorts(p, def)) {
          if (wp.virtual) continue;
          expect(inside.has(`${wp.cell.x},${wp.cell.z}`), `${def.id}@${rot} ${wp.key} ô cổng`).toBe(true);
          expect(inside.has(`${wp.attach.x},${wp.attach.z}`), `${def.id}@${rot} ${wp.key} ô chạm`).toBe(false);
        }
      }
    }
  });
});
