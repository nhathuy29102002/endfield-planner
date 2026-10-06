import { describe, expect, it } from 'vitest';
import { bridgeExit, commitPlan, planBelt, specAt } from '../src/editor/belts';
import { setDepotItem } from '../src/editor/ops';
import { Grid } from '../src/grid/grid';
import { roleOf } from '../src/model/roles';
import { solve } from '../src/sim/solver';
import { machineStatus } from '../src/render/status';
import { portKey } from '../src/model/types';
import { connect } from '../src/editor/ops';
import { ds, put, scene, source, type Scene } from './helpers';

const link = (s: Scene, a: number, ai: number, b: number, bi: number): ReturnType<typeof connect> =>
  connect(s.bp, ds, { uid: a, portKey: portKey('out', ai) }, { uid: b, portKey: portKey('in', bi) });

/** Chỉ số cổng của cầu theo hướng dòng chảy (0 lên, 1 phải, 2 xuống, 3 trái). */
function bridgePort(s: Scene, uid: number, dir: 'in' | 'out', flow: number): number {
  const m = s.bp.machines.find((v) => v.uid === uid)!;
  const ports = ds.machines.get(m.machineId)!.ports;
  // hướng sau khi lật x: facing 0→xuống, 90→trái, 180→lên, 270→phải
  const facingOf = [180, 270, 0, 90][flow]!;
  return ports.find((p) => p.dir === dir && p.facing === facingOf)!.index;
}

describe('cầu băng', () => {
  it('là "cầu", không phải van: hai tuyến cắt nhau, không trộn hàng', () => {
    expect(roleOf(ds.machines.get('log_connector')!)).toBe('bridge');
    expect(roleOf(ds.machines.get('log_pipe_connector')!)).toBe('bridge');
    expect(roleOf(ds.machines.get('log_splitter')!)).toBe('router');
  });

  it('hàng dọc ra dọc, hàng ngang ra ngang', () => {
    const s = scene(40, 40);
    const bridge = put(s, 'log_connector', 20, 20);

    // tuyến dọc: nguồn ở dưới, kho ở trên — chở sắt
    const south = put(s, 'miner_1', 19, 28);
    source(s, south, 'item_iron_powder', 30);
    const north = put(s, 'storager_1', 19, 12);
    expect(link(s, south, 0, bridge, bridgePort(s, bridge, 'in', 0)).ok).toBe(true);
    expect(link(s, bridge, bridgePort(s, bridge, 'out', 0), north, 1).ok).toBe(true);

    // tuyến ngang: nguồn bên trái, kho bên phải — chở đồng
    const west = put(s, 'miner_1', 8, 19);
    source(s, west, 'item_copper_powder', 30);
    const east = put(s, 'storager_1', 30, 19, 90);
    expect(link(s, west, 0, bridge, bridgePort(s, bridge, 'in', 1)).ok).toBe(true);
    expect(link(s, bridge, bridgePort(s, bridge, 'out', 1), east, 1).ok).toBe(true);

    const r = solve(s.bp, ds);
    expect([...r.links.values()].every((l) => l.invalid === null)).toBe(true);
    const intoNorth = r.machines.get(north)!.inputs;
    const intoEast = r.machines.get(east)!.inputs;
    expect(intoNorth.map((i) => i.itemId)).toEqual(['item_iron_powder']);
    expect(intoEast.map((i) => i.itemId)).toEqual(['item_copper_powder']);
    expect(intoNorth[0]!.actual).toBeCloseTo(30, 3);
    expect(intoEast[0]!.actual).toBeCloseTo(30, 3);
  });

  it('cầu băng chỉ chiếm mặt đất — ống vẫn đi qua bên trên', () => {
    const s = scene(20, 20);
    put(s, 'log_connector', 5, 5);
    const g = Grid.fromBlueprint(s.bp, ds);
    expect(g.free(0, { x: 5, z: 5 })).toBe(false);
    expect(g.free(1, { x: 5, z: 5 })).toBe(true);
  });

  it('đặt băng đi vào cầu thì tự nối tiếp ra phía bên kia, cùng hướng', () => {
    const s = scene(40, 40);
    const bridge = put(s, 'log_connector', 20, 20);
    // bấm vào cầu: là thân máy chứ không phải một cổng (mọi cổng chung một ô)
    expect(specAt(s.bp, ds, { x: 20, z: 20 }, 'belt')?.type).toBe('machine');

    const plan = planBelt(s.bp, ds, { type: 'cell', x: 20, z: 28 }, { x: 20, z: 20 }, 'belt');
    expect(plan.ok).toBe(true);
    expect(plan.endsAtPort).toBe(true);
    commitPlan(s.bp, plan);
    const next = bridgeExit(s.bp, ds, plan.to!)!;
    expect(next).toMatchObject({ type: 'port', uid: bridge });
    // cổng ra đó đẩy lên — cùng hướng với băng đi vào
    const cont = planBelt(s.bp, ds, next, { x: 20, z: 12 }, 'belt');
    expect(cont.ok).toBe(true);
    expect(cont.cells[0]).toEqual({ x: 20, z: 19 });
    expect(cont.ins[0]).toBe(0);
  });
});

describe('trạm điện', () => {
  function rig(fuel: string, perMinute?: number): Scene & { station: number } {
    const s = scene(40, 40);
    const station = put(s, 'power_station_1', 20, 20);
    const src = put(s, 'miner_1', 19, 25);
    source(s, src, fuel, perMinute ?? 30);
    link(s, src, 0, station, 1);
    return { ...s, station };
  }

  it('đủ nhiên liệu thì phát trọn công suất của nhiên liệu đó', () => {
    const s = rig('item_proc_battery_1');
    const r = solve(s.bp, ds);
    expect(r.machines.get(s.station)!.generation).toBeCloseTo(220, 4);
    expect(r.powerGen).toBeCloseTo(220, 4);
    // pin cháy 40s ⇒ chỉ rút 1.5 cái mỗi phút dù băng chở được 30
    expect(r.machines.get(s.station)!.inputs[0]!.actual).toBeCloseTo(1.5, 4);
  });

  it('pin cấp cao phát nhiều hơn', () => {
    expect(solve(rig('item_proc_battery_5').bp, ds).powerGen).toBeCloseTo(3200, 4);
    expect(solve(rig('item_originium_ore').bp, ds).powerGen).toBeCloseTo(50, 4);
  });

  it('thiếu nhiên liệu thì phát theo tỉ lệ thời gian có lửa', () => {
    const s = rig('item_proc_battery_1', 0.75); // cần 1.5/phút
    const r = solve(s.bp, ds);
    expect(r.powerGen).toBeCloseTo(110, 4);
    expect(r.machines.get(s.station)!.bottleneck).toMatch(/Thiếu nhiên liệu/);
  });

  it('không đốt được thứ không phải nhiên liệu', () => {
    const s = rig('item_iron_powder');
    const r = solve(s.bp, ds);
    expect(r.powerGen).toBe(0);
    expect([...r.links.values()].some((l) => /không đốt được/.test(l.invalid ?? ''))).toBe(true);
  });

  it('điện tổng = điện nền + mọi trạm đang cháy, mỗi trạm theo nhiên liệu riêng', () => {
    // ví dụ đúng như mô tả: quặng 50 + pin võ lăng dung lượng thấp 1600
    // + pin võ lăng dung lượng tiêu chuẩn 3200 + nền 200
    const s = scene(60, 40);
    const fuels = ['item_originium_ore', 'item_proc_battery_4', 'item_proc_battery_5'];
    fuels.forEach((fuel, i) => {
      const station = put(s, 'power_station_1', 10 + i * 12, 20);
      const src = put(s, 'miner_1', 9 + i * 12, 25);
      source(s, src, fuel, 30);
      expect(link(s, src, 0, station, 1).ok).toBe(true);
    });
    const r = solve(s.bp, ds);
    expect(r.powerGen).toBeCloseTo(50 + 1600 + 3200, 4);
    expect(r.powerBase).toBe(200);
    expect(r.powerSupply).toBeCloseTo(5050, 4);
  });

  it('thiếu điện thì CẢ nhà máy dừng, không phải chậm lại', () => {
    const s = scene(60, 40, true);
    put(s, 'power_diffuser_1', 20, 10);
    s.bp.basePower = 10; // nền quá ít, không trạm nào
    const a = put(s, 'furnance_1', 16, 10);
    const b = put(s, 'furnance_1', 22, 10);
    const r = solve(s.bp, ds);
    expect(r.powerDraw).toBe(10); // hai lò × 5, dù chưa có công thức chạy
    expect(r.blackout).toBe(false);

    put(s, 'furnance_1', 16, 4); // thêm một lò trong tầm ⇒ tải 15 > 10
    const r2 = solve(s.bp, ds);
    expect(r2.blackout).toBe(true);
    for (const uid of [a, b]) {
      expect(r2.machines.get(uid)!.powered).toBe(false);
      expect(r2.machines.get(uid)!.bottleneck).toMatch(/Mất điện toàn nhà máy/);
      expect(machineStatus(r2.machines.get(uid))).toBe('blackout'); // phích cắm đỏ-trắng
    }
    // máy không chạm cột/trụ nào vẫn là "chưa nối điện" (cam), kể cả lúc sụp điện
    const lone = put(s, 'furnance_1', 50, 30);
    const r3 = solve(s.bp, ds);
    expect(machineStatus(r3.machines.get(lone))).toBe('unpowered');
  });

  it('máy nhàn rỗi vẫn ăn điện — hoang phí điện', () => {
    const s = scene(40, 40, true);
    put(s, 'power_diffuser_1', 20, 10);
    put(s, 'liquid_purifier_1', 14, 8); // 50 điện, không nguyên liệu nào
    expect(solve(s.bp, ds).powerDraw).toBe(50);
  });

  it('điện nền đổi được theo bản vẽ', () => {
    const s = scene(20, 20);
    s.bp.basePower = 350;
    expect(solve(s.bp, ds).powerSupply).toBe(350);
  });

  it('trạm điện chưa có nhiên liệu thì báo', () => {
    const s = scene(20, 20);
    const st = put(s, 'power_station_1', 5, 5);
    expect(solve(s.bp, ds).machines.get(st)!.bottleneck).toMatch(/nhiên liệu/);
  });
});

describe('tổng tuyến kho hàng', () => {
  it('một đoạn tuyến nuôi được nhiều loader/unloader dọc theo nó', () => {
    const s = scene(40, 40);
    put(s, 'log_hongs_bus', 4, 20, 90); // x4..11, z20..23
    // Luật đổi 2026-10-02: đoạn tuyến phải chạm Cổng Tổng Tuyến mới thông với kho tổng
    put(s, 'log_hongs_bus_source', 12, 20); // x12..15 — sát đầu đoạn
    const a = put(s, 'unloader_1', 4, 19);
    const b = put(s, 'unloader_1', 8, 19);
    setDepotItem(s.bp, a, 'item_iron_powder');
    setDepotItem(s.bp, b, 'item_copper_powder');
    const r = solve(s.bp, ds);
    expect(r.machines.get(a)!.onBus).toBe(true);
    expect(r.machines.get(b)!.onBus).toBe(true);
  });

  it('đầu tuyến (4×4) cũng tính là tuyến', () => {
    const s = scene(40, 40);
    put(s, 'log_hongs_bus_source', 4, 20);
    const a = put(s, 'unloader_1', 4, 19);
    setDepotItem(s.bp, a, 'item_iron_powder');
    expect(solve(s.bp, ds).machines.get(a)!.onBus).toBe(true);
  });
});
