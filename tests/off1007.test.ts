import { describe, expect, it } from 'vitest';
import { connect } from '../src/editor/ops';
import { solve } from '../src/sim/solver';
import { portKey } from '../src/model/types';
import { busStatus } from '../src/model/bus';
import { BASE_LOCATIONS, createBase } from '../src/blueprint/base';
import { boxSelection, planGroup } from '../src/editor/group';
import { createSimulation } from '../src/simulation/engine';
import { ds, put, scene, source, type Scene } from './helpers';

/**
 * Người dùng 2026-10-07: **mọi máy** tắt được (Tab / nút nguồn ở cửa sổ máy), trừ Cổng Tổng Tuyến và Khu Tổng Tuyến Kho
 * Hàng; **Valley IV**: không đặt được tổng tuyến (kể cả dán / sao chép), bù lại mọi đoạn tổng tuyến không cần nối về cổng.
 */
const link = (s: Scene, a: number, ai: number, b: number, bi: number): ReturnType<typeof connect> =>
  connect(s.bp, ds, { uid: a, portKey: portKey('out', ai) }, { uid: b, portKey: portKey('in', bi) });
const machine = (s: Scene, uid: number) => s.bp.machines.find((m) => m.uid === uid)!;
const inflow = (r: ReturnType<typeof solve>, uid: number): number => r.machines.get(uid)!.inputs.reduce((a, i) => a + i.actual, 0);

describe('tắt máy không dùng điện', () => {
  it('kho tắt không nhận hàng; nguồn tắt không đẩy hàng; bật lại như cũ', () => {
    const s = scene(40, 40);
    const src = put(s, 'miner_1', 10, 10);
    source(s, src, 'item_iron_ore', 30);
    const sto = put(s, 'storager_1', 10, 20);
    expect(link(s, src, 0, sto, 0).ok).toBe(true);
    expect(inflow(solve(s.bp, ds), sto)).toBeCloseTo(30, 3);
    machine(s, sto).off = true;
    let r = solve(s.bp, ds);
    expect(inflow(r, sto)).toBe(0);
    expect(r.machines.get(sto)!.bottleneck).toMatch(/Đã tắt/);
    delete machine(s, sto).off;
    machine(s, src).off = true;
    r = solve(s.bp, ds);
    expect(inflow(r, sto)).toBe(0);
    delete machine(s, src).off;
    expect(inflow(solve(s.bp, ds), sto)).toBeCloseTo(30, 3);
  });

  it('mô phỏng: kho tắt không nhận món nào', () => {
    const got = (off: boolean): number => {
      const s = scene(40, 40);
      const src = put(s, 'miner_1', 10, 10);
      source(s, src, 'item_iron_ore', 30);
      const sto = put(s, 'storager_1', 10, 20);
      link(s, src, 0, sto, 0);
      if (off) machine(s, sto).off = true;
      const sim = createSimulation(s.bp, ds);
      sim.run(300);
      const t = sim.state().totals;
      return (t.depotIn.get('item_iron_ore') ?? 0) + (t.stored.get('item_iron_ore') ?? 0);
    };
    expect(got(false)).toBeGreaterThan(0);
    expect(got(true)).toBe(0);
  });

  it('cột điện tắt ⇒ máy trong tầm mất điện', () => {
    const s = scene(40, 40, true);
    const pole = put(s, 'power_diffuser_1', 20, 10);
    const f = put(s, 'furnance_1', 22, 10);
    expect(solve(s.bp, ds).machines.get(f)!.powered).toBe(true);
    machine(s, pole).off = true;
    expect(solve(s.bp, ds).machines.get(f)!.powered).toBe(false);
  });
});

describe('Valley IV: tổng tuyến', () => {
  const valley = () => {
    const loc = BASE_LOCATIONS.find((l) => l.region === 'valley4')!;
    return createBase(loc.region, loc.presets.find((p) => p.label === 'Upgrade 2, depots')!, loc.name);
  };

  it('mọi đoạn tổng tuyến coi như đã nối về cổng (không có đoạn "đứt")', () => {
    const bp = valley();
    // bỏ cổng đi: ở Valley các đoạn vẫn thông
    bp.machines = bp.machines.filter((m) => m.machineId !== 'log_hongs_bus_source');
    expect(busStatus(bp, ds).deadBus.size).toBe(0);
    // ngoài Valley: không có cổng ⇒ đứt hết
    const other = { ...bp, base: { ...bp.base!, region: 'wuling' as const } };
    expect(busStatus(other, ds).deadBus.size).toBeGreaterThan(0);
  });

  it('không dán / sao chép được tổng tuyến vào Valley', () => {
    const s = scene(60, 60);
    put(s, 'log_hongs_bus', 10, 10, 90);
    const sel = boxSelection(s.bp, ds, { x: 0, z: 0 }, { x: 59, z: 59 });
    expect(sel.machines.size).toBe(1);
    const ok = planGroup(s.bp, ds, s.terrain, sel, { anchor: { x: 10, z: 10 }, target: { x: 10, z: 30 }, turns: 0 }, 'copy');
    expect(ok.ok).toBe(true);
    s.bp.base = { ...(s.bp.base ?? {}), region: 'valley4' } as never;
    const no = planGroup(s.bp, ds, s.terrain, sel, { anchor: { x: 10, z: 10 }, target: { x: 10, z: 30 }, turns: 0 }, 'copy');
    expect(no.ok).toBe(false);
    expect(no.reason).toMatch(/Valley IV/);
  });
});
