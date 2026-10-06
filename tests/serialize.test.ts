import { describe, expect, it } from 'vitest';
import { fromJson, toJson } from '../src/blueprint/serialize';
import { demoPlan } from '../src/editor/demo';
import { solve } from '../src/sim/solver';
import { ds } from './helpers';

describe('lưu / mở bản vẽ', () => {
  it('JSON đi vòng tròn giữ nguyên kết quả tính toán', () => {
    const { bp, terrain } = demoPlan(ds);
    const back = fromJson(toJson(bp, terrain));
    expect(back.blueprint).toEqual(bp);
    expect(back.terrain).toEqual(terrain);

    const before = solve(bp, ds);
    const after = solve(back.blueprint, ds);
    for (const [uid, m] of before.machines)
      expect(after.machines.get(uid)!.utilization).toBeCloseTo(m.utilization, 9);
  });

  it('từ chối file lạ', () => {
    expect(() => fromJson('{"format":"khac"}')).toThrow(/không phải|Không phải/i);
  });

  it('bản vẽ mẫu dựng được và chạy đủ tải', () => {
    const { bp } = demoPlan(ds);
    const r = solve(bp, ds);
    // Luật đổi 2026-10-02: thêm 5 Cổng Tổng Tuyến cho các đoạn tuyến lẻ (27 → 32)
    expect(bp.machines).toHaveLength(32);
    // Heavy Xiragen: Máy Tinh Chế trong vùng môi trường Stable của Máy Khuếch Tán Khí
    const purifier = [...r.machines.values()].find((m) => m.machineId === 'liquid_purifier_1')!;
    expect(purifier.recipeId).toBe('liquid_purifier_gas_xiranite_enr_2');
    expect(purifier.env).toBe('Stable');
    expect(purifier.utilization).toBeCloseTo(1, 4);
    expect(purifier.outputs[0]).toMatchObject({ itemId: 'item_gas_xiranite_enr' });
    expect(purifier.outputs[0]!.actual).toBeCloseTo(30, 4); // đúng như ảnh: 30/min
    expect(r.blackout).toBe(false);
    // trạm điện đốt pin cấp 1 từ kho tổng: đủ nhiên liệu ⇒ phát trọn 220
    expect(r.powerGen).toBeCloseTo(220, 4);
    // mọi loader/unloader đều gắn vào tổng tuyến kho hàng
    for (const m of r.machines.values()) if (m.onBus !== null) expect(m.onBus).toBe(true);
    expect([...r.links.values()].every((l) => l.invalid === null)).toBe(true);
    // bản mẫu chạm vào cả bốn cơ chế 1.5
    expect([...r.machines.values()].some((m) => m.activator !== null)).toBe(true);
    expect(r.env.zones.length).toBeGreaterThan(0);
    expect([...r.machines.values()].some((m) => m.envRequired !== 'None' && m.env === m.envRequired)).toBe(true);
    expect(r.depot.size).toBeGreaterThan(0);
    expect([...r.machines.values()].some((m) => m.powered === true)).toBe(true);
    expect(bp.machines.some((m) => m.pairTarget)).toBe(true);
    // và không máy nào bị vướng: bản mẫu phải mở lên là chạy sạch
    const stuck = [...r.machines.values()].filter((m) => m.bottleneck !== null);
    expect(stuck.map((m) => `${m.machineId}: ${m.bottleneck}`)).toEqual([]);
  });
});
