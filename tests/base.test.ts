import { describe, expect, it } from 'vitest';
import { BASE_LOCATIONS, createBase } from '../src/blueprint/base';
import { addMachine, moveMachine, removeMachine } from '../src/editor/ops';
import { boxSelection } from '../src/editor/group';
import { busAttached } from '../src/model/bus';
import { ds } from './helpers';

const preset = (region: string, label: string) => {
  const loc = BASE_LOCATIONS.find((l) => l.region === region)!;
  return { loc, p: loc.presets.find((p) => p.label === label)! };
};

describe('tab Base: cấu hình căn cứ như EnKAD (người dùng 2026-09-29)', () => {
  it('đủ 4 vùng như EnKAD, cỡ đúng', () => {
    expect(BASE_LOCATIONS.map((l) => l.presets.map((p) => `${p.w}x${p.d}`))).toEqual([
      ['70x70', '70x70', '52x52', '38x38'],
      ['40x40', '40x40', '32x32', '24x27'],
      ['80x80', '60x60', '40x40'],
      ['50x50', '40x40', '30x30'],
    ]);
  });

  it('Valley IV "Upgrade 2, depots": khung 80×80, vùng xây 70×70 lệch 5, dải kho tổng đặt sẵn (1 cổng + 18 đoạn)', () => {
    const { loc, p } = preset('valley4', 'Upgrade 2, depots');
    const bp = createBase(loc.region, p, loc.name);
    expect(bp.area).toEqual({ w: 80, d: 80 });
    expect(bp.buildArea).toEqual({ x: 5, z: 5, w: 70, d: 70 });
    expect(bp.machines.filter((m) => m.fixed).length).toBe(19);
    expect(bp.machines.filter((m) => m.machineId === 'log_hongs_bus_source').length).toBe(1);
  });

  it('Valley: không đặt được tổng tuyến; máy phải nằm trong vùng xây', () => {
    const { loc, p } = preset('valley4', 'Upgrade 2, depots');
    const bp = createBase(loc.region, p, loc.name);
    expect(addMachine(bp, ds, {}, 'log_hongs_bus', 20, 20, 0).ok).toBe(false);
    expect(addMachine(bp, ds, {}, 'furnance_1', 1, 30, 0).ok).toBe(false); // ngoài vùng xây
    expect(addMachine(bp, ds, {}, 'furnance_1', 20, 20, 0).ok).toBe(true);
  });

  it('Máy Dỡ Hàng Kho đặt sát mép vùng xây thì gắn vào dải kho tổng đặt sẵn', () => {
    const { loc, p } = preset('valley4', 'Upgrade 2, depots');
    const bp = createBase(loc.region, p, loc.name);
    const ok = ([0, 90, 180, 270] as const).some((rot) => {
      const r = addMachine(bp, ds, {}, 'unloader_1', 20, 5, rot);
      if (!r.ok) return false;
      const on = busAttached(bp, ds).has(r.uid!);
      if (!on) removeMachine(bp, r.uid!);
      return on;
    });
    expect(ok).toBe(true);
  });

  it('công trình đặt sẵn: không xoá, không di chuyển, không lọt vào chọn vùng', () => {
    const { loc, p } = preset('valley4_outpost', 'Upgrade 2, depots');
    const bp = createBase(loc.region, p, loc.name);
    const bus = bp.machines[0]!;
    removeMachine(bp, bus.uid);
    expect(bp.machines.length).toBe(5);
    expect(moveMachine(bp, ds, {}, bus.uid, 10, 10).ok).toBe(false);
    expect(boxSelection(bp, ds, { x: 0, z: 0 }, { x: 49, z: 49 }).machines.size).toBe(0);
  });

  it('Wuling tự đặt tổng tuyến như trước', () => {
    const { loc, p } = preset('wuling', 'Upgrade 2');
    const bp = createBase(loc.region, p, loc.name);
    expect(bp.buildArea).toBeUndefined();
    expect(addMachine(bp, ds, {}, 'log_hongs_bus', 20, 20, 0).ok).toBe(true);
  });
});
