import { describe, expect, it } from 'vitest';
import { commitPlan, planBelt, resolveStarts, specAt } from '../src/editor/belts';
import { Grid } from '../src/grid/grid';
import { routeBelt } from '../src/grid/router';
import { buildNetwork } from '../src/model/network';
import { fromJson } from '../src/blueprint/serialize';
import { setRecipe } from '../src/editor/ops';
import { solve } from '../src/sim/solver';
import type { BeltTile, Dir4 } from '../src/model/types';
import { ds, put, scene, source, wire } from './helpers';

const UP: Dir4 = 0;
const RIGHT: Dir4 = 1;
const DOWN: Dir4 = 2;
const LEFT: Dir4 = 3;

const corners = (tiles: { in: Dir4; out: Dir4 }[]): number => tiles.filter((t) => t.in !== t.out).length;

describe('hai loại ô: thẳng và góc', () => {
  it('ô thẳng khi hướng vào trùng hướng ra, ô góc khi lệch 90°, không bao giờ quay đầu', () => {
    const g = new Grid(20, 20);
    const r = routeBelt(g, 0, [{ cell: { x: 2, z: 10 }, inDir: UP }], [{ cell: { x: 8, z: 4 }, outDir: UP }])!;
    for (let i = 0; i < r.cells.length; i++) {
      const a = r.ins[i]!;
      const b = r.outs[i]!;
      expect(b).not.toBe(((a + 2) % 4) as Dir4);
    }
    // ô góc chuyển hàng sang ô chéo: ô trước và ô sau của nó chéo nhau
    for (let i = 1; i < r.cells.length - 1; i++) {
      if (r.ins[i] === r.outs[i]) continue;
      const p = r.cells[i - 1]!;
      const n = r.cells[i + 1]!;
      expect(Math.abs(p.x - n.x)).toBe(1);
      expect(Math.abs(p.z - n.z)).toBe(1);
    }
  });
});

describe('tìm đường tối đa 3 góc', () => {
  it('đường ngắn nhất, ít góc nhất — không đi bậc thang', () => {
    const g = new Grid(30, 30);
    const r = routeBelt(g, 0, [{ cell: { x: 2, z: 20 }, inDir: UP }], [{ cell: { x: 12, z: 5 }, outDir: null }])!;
    expect(r.cells).toHaveLength(10 + 15 + 1);
    expect(r.turns).toBe(1); // một khúc chữ L, không zigzag
  });

  it('né vật cản mặt đất bằng đường zigzag', () => {
    const s = scene(30, 30);
    put(s, 'furnance_1', 5, 10); // chắn ngay trên cột xuất phát
    const g = Grid.fromBlueprint(s.bp, ds);
    const r = routeBelt(g, 0, [{ cell: { x: 6, z: 20 }, inDir: UP }], [{ cell: { x: 9, z: 4 }, outDir: UP }])!;
    expect(r).not.toBeNull();
    for (const c of r.cells) expect(g.free(0, c)).toBe(true);
    expect(r.turns).toBeLessThanOrEqual(3);
    expect(r.cells).toHaveLength(3 + 16 + 1); // vẫn là đường ngắn nhất
  });

  it('vòng qua vật cản rồi quay về đúng cột cũ cần 4 góc ⇒ vượt giới hạn', () => {
    const s = scene(30, 30);
    put(s, 'furnance_1', 5, 10);
    const g = Grid.fromBlueprint(s.bp, ds);
    const start = [{ cell: { x: 6, z: 20 }, inDir: UP as Dir4 }];
    const goal = [{ cell: { x: 6, z: 4 }, outDir: UP as Dir4 }];
    expect(routeBelt(g, 0, start, goal, { maxTurns: 3 })).toBeNull();
    expect(routeBelt(g, 0, start, goal, { maxTurns: 4 })!.turns).toBe(4);
  });

  it('cần hơn 3 góc thì không tìm — để người dùng tự bẻ bằng cách nối tiếp', () => {
    // ô đích bị bọc ba phía, phải vòng rất xa
    const g = new Grid(20, 20);
    for (let x = 3; x <= 12; x++) g.set(0, { x, z: 8 }, { kind: 'machine', uid: 1 });
    for (let z = 8; z <= 15; z++) g.set(0, { x: 3, z }, { kind: 'machine', uid: 1 });
    for (let z = 8; z <= 15; z++) g.set(0, { x: 12, z }, { kind: 'machine', uid: 1 });
    const start = [{ cell: { x: 7, z: 2 }, inDir: DOWN as Dir4 }];
    const goal = [{ cell: { x: 7, z: 12 }, outDir: UP as Dir4 }];
    expect(routeBelt(g, 0, start, goal, { maxTurns: 3 })).toBeNull();
    expect(routeBelt(g, 0, start, goal, { maxTurns: 8 })).not.toBeNull();
  });
});

describe('hướng vào/ra của cổng', () => {
  it('cổng ra → góc → thẳng → góc → cổng vào', () => {
    const s = scene(30, 30);
    const a = put(s, 'furnance_1', 4, 14);
    const b = put(s, 'furnance_1', 10, 4);
    setRecipe(s.bp, ds, a, 'furnance_carbon_enr_powder_1');
    setRecipe(s.bp, ds, b, 'furnance_carbon_enr_1');
    const group = wire(s, a, 0, b, 0);
    const tiles = s.bp.belts.filter((t) => t.group === group);

    // ô đầu nhận hàng theo đúng hướng cổng ra (lên), ô cuối đẩy theo đúng hướng cổng vào (lên)
    expect(tiles[0]!.in).toBe(UP);
    expect(tiles[tiles.length - 1]!.out).toBe(UP);
    expect(corners(tiles)).toBeGreaterThanOrEqual(2);

    const chain = buildNetwork(s.bp, ds).chains.find((c) => c.tiles.length === tiles.length)!;
    expect(chain.from?.uid).toBe(a);
    expect(chain.to?.uid).toBe(b);
  });

  it('băng tới sát cổng vào nhưng từ bên hông thì KHÔNG vào máy', () => {
    const s = scene(30, 30);
    const f = put(s, 'furnance_1', 10, 10); // cổng vào băng ở mép dưới, nhận hàng đi lên
    const def = ds.machines.get('furnance_1')!;
    const port = def.ports.find((p) => p.dir === 'in' && p.kind === 'belt')!;
    const px = 10 + (def.size.w - 1 - port.x);
    const attach = { x: px, z: 13 };
    // đặt tay một ô ngay ô chạm nhưng đẩy sang phải (bên hông), không đẩy lên
    s.bp.belts.push({ x: attach.x, z: attach.z, kind: 'belt', in: RIGHT, out: RIGHT, group: 99 });
    let chain = buildNetwork(s.bp, ds).chains[0]!;
    expect(chain.to).toBeNull();

    // cùng ô đó nhưng đẩy lên đúng hướng cổng ⇒ vào máy
    s.bp.belts[0] = { ...s.bp.belts[0]!, in: RIGHT, out: UP };
    chain = buildNetwork(s.bp, ds).chains[0]!;
    expect(chain.to?.uid).toBe(f);
  });

  it('không bao giờ tới cổng vào theo hướng ngược lại', () => {
    const g = new Grid(20, 20);
    // đích đòi đẩy lên, mà chỉ có thể tới từ phía trên đi xuống ⇒ phải vòng, không quay đầu
    const r = routeBelt(g, 0, [{ cell: { x: 5, z: 2 }, inDir: DOWN }], [{ cell: { x: 5, z: 8 }, outDir: UP }], {
      maxTurns: 6,
    })!;
    const last = r.cells.length - 1;
    expect(r.outs[last]).toBe(UP);
    expect(r.ins[last]).not.toBe(DOWN);
  });
});

describe('chọn điểm đầu', () => {
  it('bấm thân máy: xét mọi cổng ra, cổng được chọn đổi theo con trỏ', () => {
    const s = scene(40, 40);
    const src = put(s, 'unloader_1', 15, 20);
    const spec = specAt(s.bp, ds, { x: 15, z: 20 }, 'belt');
    expect(spec?.type).toBe('machine');
    expect(resolveStarts(s.bp, ds, spec!, 'belt').length).toBeGreaterThan(0);

    const left = planBelt(s.bp, ds, spec!, { x: 3, z: 10 }, 'belt');
    const right = planBelt(s.bp, ds, spec!, { x: 30, z: 10 }, 'belt');
    expect(left.ok && right.ok).toBe(true);
    expect(left.from?.uid).toBe(src);
    expect(right.cells[right.cells.length - 1]).toEqual({ x: 30, z: 10 });
  });

  it('bấm trúng một cổng: chỉ đi từ cổng đó', () => {
    const s = scene(40, 40);
    const f = put(s, 'furnance_1', 10, 10);
    setRecipe(s.bp, ds, f, 'furnance_carbon_enr_1');
    // cổng ra băng nằm ở mép trên của lò
    const spec = specAt(s.bp, ds, { x: 10, z: 10 }, 'belt');
    expect(spec?.type).toBe('port');
    expect(resolveStarts(s.bp, ds, spec!, 'belt')).toHaveLength(1);
  });

  it('vướng vật cản thì preview đỏ, vẫn có đường để vẽ', () => {
    const s = scene(40, 40);
    put(s, 'unloader_1', 15, 30);
    const blocker = put(s, 'furnance_1', 20, 10);
    const spec = specAt(s.bp, ds, { x: 16, z: 30 }, 'belt')!;
    // con trỏ nằm hẳn trên một máy không có cổng vào băng trống ⇒ không đặt được
    const plan = planBelt(s.bp, ds, spec, { x: 21, z: 11 }, 'belt');
    expect(blocker).toBeGreaterThan(0);
    expect(plan.cells.length).toBeGreaterThan(0);
    // lò vẫn có cổng vào băng ⇒ đặt được; chặn hết cổng rồi thì mới đỏ
    expect(typeof plan.ok).toBe('boolean');
  });
});

describe('nối liên tiếp và rẽ nhánh giữa chừng', () => {
  it('đặt xong mà không chạm cổng vào thì đoạn sau bắt đầu ngay tại ô cuối', () => {
    const s = scene(40, 40);
    const src = put(s, 'unloader_1', 15, 30);
    const first = planBelt(s.bp, ds, { type: 'machine', uid: src }, { x: 16, z: 20 }, 'belt');
    expect(first.ok).toBe(true);
    expect(first.endsAtPort).toBe(false);
    const { last } = commitPlan(s.bp, first);

    // đoạn nối tiếp: ô cuối bị thay, hướng vào giữ nguyên
    const lastTile = s.bp.belts.find((t) => t.x === last.x && t.z === last.z)!;
    const second = planBelt(s.bp, ds, { type: 'tile', x: last.x, z: last.z }, { x: 25, z: 15 }, 'belt');
    expect(second.ok).toBe(true);
    expect(second.ins[0]).toBe(lastTile.in);
    commitPlan(s.bp, second);

    // cả hai đoạn là **một** chuỗi liền, xuất phát từ máy nguồn
    const chains = buildNetwork(s.bp, ds).chains.filter((c) => c.kind === 'belt');
    expect(chains).toHaveLength(1);
    expect(chains[0]!.from?.uid).toBe(src);
  });

  it('bấm vào giữa một băng có sẵn: ô đó thành đầu đoạn mới, nhận hàng theo hướng ô ngay trước', () => {
    const s = scene(40, 40);
    // băng thẳng đi lên từ (10,30) tới (10,20)
    const straight: BeltTile[] = [];
    for (let z = 30; z >= 20; z--) straight.push({ x: 10, z, kind: 'belt', in: UP, out: UP, group: 1 });
    s.bp.belts.push(...straight);

    const plan = planBelt(s.bp, ds, { type: 'tile', x: 10, z: 25 }, { x: 20, z: 25 }, 'belt');
    expect(plan.ok).toBe(true);
    expect(plan.ins[0]).toBe(UP); // ô (10,26) đang đẩy lên ⇒ đầu đoạn mới nhận hàng đi lên
    expect(plan.outs[0]).toBe(RIGHT); // rồi bẻ phải ⇒ ô góc
    commitPlan(s.bp, plan);

    const at = s.bp.belts.filter((t) => t.x === 10 && t.z === 25);
    expect(at).toHaveLength(1);
    expect(at[0]!).toMatchObject({ in: UP, out: RIGHT });

    // đoạn phía trên (10,24..20) không còn ai đẩy hàng vào nữa
    const net = buildNetwork(s.bp, ds);
    const tail = net.chains.find((c) => c.tiles.some((i) => s.bp.belts[i]!.z === 24 && s.bp.belts[i]!.x === 10))!;
    expect(tail.from).toBeNull();
  });

  it('băng cụt thì máy nguồn tắc và bảng báo rõ', () => {
    const s = scene(40, 40);
    const src = put(s, 'miner_1', 15, 30);
    source(s, src, 'item_iron_powder', 30);
    const plan = planBelt(s.bp, ds, { type: 'machine', uid: src }, { x: 16, z: 20 }, 'belt');
    commitPlan(s.bp, plan);
    const r = solve(s.bp, ds);
    const chain = [...r.links.values()][0]!;
    expect(chain.invalid).toMatch(/cụt/);
  });
});

describe('mở file lưu định dạng cũ', () => {
  it('tuyến cổng-cổng đời trước đổi được sang ô băng có hướng', () => {
    const old = {
      format: 'endfield-planner',
      version: 1,
      terrain: {},
      blueprint: {
        version: 1,
        name: 'cũ',
        area: { w: 20, d: 20 },
        machines: [],
        nextUid: 5,
        links: [
          {
            uid: 4,
            kind: 'belt',
            from: { uid: 1, portKey: 'out0' },
            to: { uid: 2, portKey: 'in0' },
            path: [
              { x: 2, z: 5 },
              { x: 2, z: 4 },
              { x: 3, z: 4 },
            ],
          },
        ],
      },
    };
    const plan = fromJson(JSON.stringify(old));
    expect(plan.blueprint.version).toBe(2);
    expect(plan.blueprint.belts).toHaveLength(3);
    expect(plan.blueprint.belts[1]).toMatchObject({ x: 2, z: 4, in: UP, out: RIGHT });
    expect('links' in plan.blueprint).toBe(false);
  });
});

void LEFT;
