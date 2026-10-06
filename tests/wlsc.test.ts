import { describe, expect, it } from 'vitest';
import fixture from './fixtures/full-wlsc-map.efp.json';
import { importFile } from '../src/blueprint/library';
import { solve } from '../src/sim/solver';
import { ds } from './helpers';

/**
 * Map thật của người dùng (2026-09-29, "Full wlsc map"): Lò Tinh Luyện (Nước Thải) → Lò Mở Rộng #46
 * → Lò Mở Rộng #47 → Máy Đóng Gói (Pin Võ Lăng Tiêu Chuẩn) → 4 trạm điện; Xircon Trơ Thải của cả
 * hai lò xả qua một van gộp ống vào Bộ Cấp Nước.
 *
 * Lỗi cũ: solver hội tụ về **toàn 0** — pin không bao giờ ra, trạm điện không có gì đốt. Nguyên nhân:
 * mức nhận của mỗi tuyến vào (van gộp / máy) bị chặn đúng bằng lượng tuyến đó đang đưa tới, nên
 * một nhịp hụt tạm thời lúc giải khoá luôn sản lượng máy phía trước ("bánh cóc"). Sửa: `fillWithSpare`.
 */
const load = () => importFile(JSON.stringify(fixture), 'x')[0]!.map!.blueprint;

describe('map WLSC của người dùng — dây chuyền pin WLSC chạy đủ', () => {
  it('Lò Tinh Luyện → 2 Lò Mở Rộng → Máy Đóng Gói → 4 trạm điện đều 100%', () => {
    const bp = load();
    const r = solve(bp, ds);
    const byId = (id: string) => bp.machines.filter((m) => m.machineId === id).map((m) => r.machines.get(m.uid)!);
    for (const f of [...byId('mix_pool_2'), ...byId('tools_assebling_mc_1')]) expect(f.utilization).toBeCloseTo(1, 3);
    const pk = byId('tools_assebling_mc_1')[0]!;
    expect(pk.outputs[0]).toMatchObject({ itemId: 'item_proc_battery_5' });
    expect(pk.outputs[0]!.actual).toBeCloseTo(6, 3);
    const wlsc = byId('power_station_1').filter((g) => g.inputs[0]?.itemId === 'item_proc_battery_5');
    expect(wlsc).toHaveLength(4);
    for (const g of wlsc) expect(g.generation).toBeCloseTo(3200, 0);
    // Bộ Cấp Nước nhận hết Xircon Trơ Thải của cả hai lò
    expect(byId('dumper_1')[0]!.inputs[0]!.actual).toBeCloseTo(60, 3);
  });

  it('bật kiểm tra điện: đủ điện nhờ pin WLSC, không sụp', () => {
    const bp = load();
    bp.enforcePower = true;
    const r = solve(bp, ds);
    expect(r.blackout).toBe(false);
    // Luật đổi 2026-10-02 (tổng tuyến phải nối về Cổng Tổng Tuyến): map cũ này có vài đoạn tuyến lẻ ⇒ các trạm đốt
    // nhiên liệu lấy từ đó tắt; 4 trạm pin WLSC vẫn phát đủ 4 × 3200
    expect(r.powerGen).toBeGreaterThanOrEqual(12800 - 1e-3);
  });
});
