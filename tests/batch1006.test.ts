import { describe, expect, it } from 'vitest';
import { connect } from '../src/editor/ops';
import { solve } from '../src/sim/solver';
import { portKey } from '../src/model/types';
import { canSwitchOff } from '../src/model/switchOff';
import { emptySelection, subtractSelection, unionSelection } from '../src/editor/group';
import { createSimulation } from '../src/simulation/engine';
import { ds, put, scene, source, type Scene } from './helpers';

/**
 * Người dùng 2026-10-06: **Tab tắt / bật máy** (tiết kiệm điện) và **chế độ chọn hàng loạt** (X): chuột phải kéo hộp bỏ
 * chọn nhiều.
 */
const link = (s: Scene, a: number, ai: number, b: number, bi: number): ReturnType<typeof connect> =>
  connect(s.bp, ds, { uid: a, portKey: portKey('out', ai) }, { uid: b, portKey: portKey('in', bi) });
const machine = (s: Scene, uid: number) => s.bp.machines.find((m) => m.uid === uid)!;

describe('tắt máy (Tab)', () => {
  // Luật đổi 2026-10-07: mọi máy tắt được, trừ Cổng Tổng Tuyến / Khu Tổng Tuyến Kho Hàng (trước: chỉ máy dùng điện + trạm
  // điện, van tách không tắt được)
  it('mọi máy tắt được, trừ Cổng Tổng Tuyến và Khu Tổng Tuyến Kho Hàng', () => {
    expect(canSwitchOff(ds.machines.get('furnance_1'))).toBe(true);
    expect(canSwitchOff(ds.machines.get('power_station_1'))).toBe(true);
    expect(canSwitchOff(ds.machines.get('log_splitter'))).toBe(true);
    expect(canSwitchOff(ds.machines.get('unloader_1'))).toBe(true);
    expect(canSwitchOff(ds.machines.get('log_hongs_bus'))).toBe(false);
    expect(canSwitchOff(ds.machines.get('log_hongs_bus_source'))).toBe(false);
  });

  it('máy tắt không ăn điện, không chạy; bật lại thì như cũ', () => {
    const s = scene(40, 40, true);
    put(s, 'power_diffuser_1', 20, 10);
    const a = put(s, 'furnance_1', 16, 10);
    put(s, 'furnance_1', 22, 10);
    expect(solve(s.bp, ds).powerDraw).toBe(10);
    machine(s, a).off = true;
    const r = solve(s.bp, ds);
    expect(r.powerDraw).toBe(5);
    expect(r.machines.get(a)!.utilization).toBe(0);
    expect(r.machines.get(a)!.bottleneck).toMatch(/Đã tắt/);
    delete machine(s, a).off;
    expect(solve(s.bp, ds).powerDraw).toBe(10);
  });

  it('trạm điện tắt không đốt nhiên liệu, không phát điện', () => {
    const s = scene(40, 40);
    const station = put(s, 'power_station_1', 20, 20);
    const src = put(s, 'miner_1', 19, 25);
    source(s, src, 'item_proc_battery_1', 30);
    link(s, src, 0, station, 1);
    expect(solve(s.bp, ds).powerGen).toBeCloseTo(220, 4);
    machine(s, station).off = true;
    const r = solve(s.bp, ds);
    expect(r.powerGen).toBe(0);
    expect(r.machines.get(station)!.inputs.reduce((a, i) => a + i.actual, 0)).toBe(0);
  });

  it('mô phỏng: trạm điện tắt không đốt pin', () => {
    const s = scene(40, 40);
    const station = put(s, 'power_station_1', 20, 20);
    const src = put(s, 'miner_1', 19, 25);
    source(s, src, 'item_proc_battery_1', 30);
    link(s, src, 0, station, 1);
    machine(s, station).off = true;
    const sim = createSimulation(s.bp, ds);
    sim.run(600);
    expect(sim.state().totals.burned.get('item_proc_battery_1') ?? 0).toBe(0);
  });
});

describe('chế độ chọn hàng loạt (X)', () => {
  it('chuột phải kéo hộp = bỏ những gì trong hộp khỏi vùng chọn', () => {
    const a = { machines: new Set([1, 2, 3]), tiles: new Set(['belt:1,1', 'belt:2,1']) };
    const box = { machines: new Set([2, 9]), tiles: new Set(['belt:2,1']) };
    const r = subtractSelection(a, box);
    expect([...r.machines]).toEqual([1, 3]);
    expect([...r.tiles]).toEqual(['belt:1,1']);
    expect(subtractSelection(unionSelection(a, box), emptySelection()).machines.size).toBe(4);
  });
});
