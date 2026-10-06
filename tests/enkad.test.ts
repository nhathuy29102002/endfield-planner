import { describe, expect, it } from 'vitest';
import { decodeEnkad, enkadToPieces, extractCode } from '../src/blueprint/enkad';
import { commitGroup, planPieces } from '../src/editor/group';
import { solve } from '../src/sim/solver';
import { ds, scene } from './helpers';

/**
 * Mã bản vẽ thật của game `EFO011ea0ioia3Ue34O7` (máy chủ EU & US, "LC Valley Battery"), lấy qua API
 * của EnKAD ngày 2026-09-29 — chuỗi base64 `factory.proto`.
 */
const LC_BATTERY = 'CAQQEhgIItwECAMSChAQGBAgAioCCFoSChAQGBAgBioCCFoSChALGAEgBSoCCFoSChADGAEgASoCCFoSCBAPGAgqAghaEgoQExgJIAIqAghaEgoQERgFIAEqAghaEgoQIxgOIAQqAghaEgoQIxgOIAUqAghaEicIARAhGA8gBTIdCg0I////////////ARgBCgAKAhABCgYIARABGAISLQgBECEYDiAGMiMKDRD///////////8BGAEKAAoCEAEKBAgBEAEKBggCEAEYAhIhCAEQIRgNIAQyFwoNCP///////////wEYAQoACgQIARgCEiEIARAhGAggAjIXCg0I////////////ARgBCgAKBAgBGAISPwgBECEYDiADMjUKBBABGAEKAAoLEP///////////wEKDQgBEP///////////wEKDwgCEP///////////wEYAhIlCAEQIRgEIAcyGwoNCP///////////wEYAQoACgIIBAoECAUYAhIhCAEQIRgEIAIyFwoNCP///////////wEYAQoACgQIARgCEiUIARAhGAQgBjIbCg0I////////////ARgBCgAKAggECgQIBRgCEjkIARAhGA8gBDIvCg0I////////////ARgBCgAKCxD///////////8BCg8IARD///////////8BGAISHwgBECEgBjIXCg0I////////////ARgBCgAKBAgBGAISHwgBECEgAjIXCg0I////////////ARgBCgAKBAgBGAISIQgBECEYDSAFMhcKDQj///////////8BGAEKAAoECAEYAiLOAgghEskCCAMQLyACQsACCgIYAQoCCAEKDQgBEP///////////wEKDQgDEP///////////wEKDQgFEP///////////wEKDQgHEP///////////wEKDQgIEP///////////wEKDQgIEP7//////////wEKDQgJEP7//////////wEKDQgJEP7//////////wEKDQgJEP///////////wEKAggJCgIIEQoECBEQAQoECBEQBAoECBEQBQoECBEQBQoECBAQBQoECA8QBQoECA4QBQoECAwQBQoECAkQBQoECAgQBQoECAQQBQoECAMQBQoECAEQBQoECAEQBQoECAEQBAoCEAQKAAoCGAISByM3OGJhNDkaJERleCdzIEJhdHRlcnk6ICB8IEF1dGhvcjogNjYyMTg3MTM1OSIURUZPMDExZWEwaW9pYTNVZTM0Tzc=';

describe('nhập bản vẽ EnKAD / mã bản vẽ của game (người dùng 2026-09-29)', () => {
  it('giải mã: khung 18×8, 9 công trình, 12 đoạn băng', () => {
    const f = decodeEnkad(LC_BATTERY);
    expect(f.width).toBe(18);
    expect(f.height).toBe(8);
    expect(f.entities.filter((e) => e.type === 0).length).toBe(9);
    expect(f.entities.filter((e) => e.type === 1).length).toBe(12);
  });

  it('dựng thành module: máy nối đúng cổng, không tuyến nào hỏng', () => {
    const imp = enkadToPieces(LC_BATTERY, ds);
    expect(imp.failed).toEqual([]);
    expect(imp.pieces.machines.length).toBe(9);
    const s = scene(60, 40);
    const plan = planPieces(ds, s.terrain, imp.pieces, { anchor: { x: 0, z: 0 }, target: { x: 5, z: 5 }, turns: 0 }, s.bp);
    expect(plan.ok).toBe(true);
    commitGroup(s.bp, plan, 'copy');
    const r = solve(s.bp, ds);
    const links = [...r.links.values()];
    expect(links.length).toBeGreaterThan(0);
    // mọi đoạn băng đều chạm cổng đích (không có "băng cụt"); chỉ 2 băng nguyên liệu đi vào từ mép
    // bản vẽ là không có nguồn — y như bản vẽ gốc (int32 âm đọc sai từng làm mọi băng mất nguồn)
    expect(links.filter((l) => l.invalid && /cụt|treo/.test(l.invalid))).toEqual([]);
    expect(links.filter((l) => l.invalid && /không có nguồn/.test(l.invalid)).length).toBe(2);
  });

  it('lấy mã EFO0… ra khỏi chữ dán vào', () => {
    expect(extractCode('Mã: EFO011ea0ioia3Ue34O7 (EU)')).toBe('EFO011ea0ioia3Ue34O7');
    expect(extractCode('abc')).toBeNull();
  });
});
