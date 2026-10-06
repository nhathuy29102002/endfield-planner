import { describe, expect, it } from 'vitest';
import { addMachine, connect, setDepotItem, setRecipe } from '../src/editor/ops';
import { TERRAIN_RULES } from '../src/grid/grid';
import { solve } from '../src/sim/solver';
import { portKey } from '../src/model/types';
import { ds, paint, put, scene, source, type Scene } from './helpers';

const INERT = 'item_gas_inert';
const ACID_GAS = 'item_gas_acid';

/** Nối một cổng ra bất kỳ tới cổng vào chỉ định (dùng khi chỉ số cổng không phải 0). */
const link = (s: Scene, a: number, ai: number, b: number, bi: number): ReturnType<typeof connect> =>
  connect(s.bp, ds, { uid: a, portKey: portKey('out', ai) }, { uid: b, portKey: portKey('in', bi) });

describe('cổng kích hoạt', () => {
  /** transmuter_1: 10s/chu kỳ, cổng kích hoạt là `in2`. */
  /**
   * Trên lưới, ống đi từ phải sang trái qua máy: cổng ống vào ở mép phải, ra ở mép
   * trái. Cổng kích hoạt của transmuter ở mép dưới, nhận khí đi lên.
   */
  function rig(activatorRate: number | null): Scene & { uid: number } {
    const s = scene(50, 50);
    const t = put(s, 'transmuter_1', 20, 20);
    setRecipe(s.bp, ds, t, 'liquid_transmuter_1_gas_gas_xiranite_enr_1');

    const feed = put(s, 'gas_pump_1', 27, 20); // bên phải: đẩy sang trái vào máy
    source(s, feed, 'item_liquid_xiranite_enr', 120);
    expect(link(s, feed, 0, t, 0).ok).toBe(true);

    const drain = put(s, 'liquid_storager_1', 14, 20); // bên trái: nhận hàng máy đẩy ra
    expect(link(s, t, 0, drain, 0).ok).toBe(true);

    if (activatorRate !== null) {
      const gas = put(s, 'gas_pump_1', 23, 26); // ngay dưới cổng kích hoạt
      source(s, gas, INERT, activatorRate);
      expect(link(s, gas, 0, t, 2).ok).toBe(true);
    }
    return { ...s, uid: t };
  }

  it('chưa nối thì máy không chạy', () => {
    const s = rig(null);
    const m = solve(s.bp, ds).machines.get(s.uid)!;
    expect(m.utilization).toBeCloseTo(0, 6);
    expect(m.bottleneck).toMatch(/kích hoạt/);
  });

  it('đủ mức sàn 6/phút là chạy 100%', () => {
    const m = solve(rig(6).bp, ds).machines.get(rig(6).uid)!;
    expect(m.utilization).toBeCloseTo(1, 4);
    expect(m.activator!.supply).toBeCloseTo(6, 4);
  });

  it('nạp nhiều hơn mức sàn cũng không nhanh hơn, và rút tối đa 30/phút', () => {
    const s = rig(500);
    const m = solve(s.bp, ds).machines.get(s.uid)!;
    expect(m.utilization).toBeCloseTo(1, 4);
    expect(m.activator!.supply).toBeCloseTo(30, 4); // trần rút, không phải 500
  });

  it('dưới mức sàn thì chậm lại theo tỉ lệ', () => {
    const s = rig(3);
    const m = solve(s.bp, ds).machines.get(s.uid)!;
    expect(m.utilization).toBeCloseTo(0.5, 4);
    expect(m.bottleneck).toMatch(/kích hoạt/);
  });

  it('khí kích hoạt không bị tính là nguyên liệu của công thức', () => {
    const s = rig(30);
    const m = solve(s.bp, ds).machines.get(s.uid)!;
    expect(m.inputs.map((i) => i.itemId)).toEqual(['item_liquid_xiranite_enr']);
  });
});

describe('môi trường xúc tác', () => {
  /**
   * liquid_purifier_1 chạy công thức cần môi trường `Stable`.
   * `offset` đẩy máy lọc ra khỏi vùng phủ để kiểm tra luật "phải nằm trọn bên trong".
   */
  function rig(gas: string | null, offset = 0): Scene & { purifier: number; vapor: number } {
    const s = scene(60, 60);
    const vapor = put(s, 'vaporizer_1', 6, 34); // 3×3 tại x6..8, z34..36 ⇒ vùng phủ x1..13, z29..41
    // đặt máy lọc trước rồi mới kéo ống, để tuyến tự tránh chứ không chắn chỗ
    const purifier = put(s, 'liquid_purifier_1', 9, 30 + offset); // 5×5 tại x9..13
    setRecipe(s.bp, ds, purifier, 'liquid_purifier_gas_copper_enr_2');
    if (gas) {
      const feed = put(s, 'gas_pump_1', 20, 46);
      source(s, feed, gas, 30);
      expect(link(s, feed, 0, vapor, 0).ok).toBe(true);
    }
    return { ...s, purifier, vapor };
  }

  it('không nạp khí thì không có môi trường nào', () => {
    const r = solve(rig(null).bp, ds);
    expect(r.env.zones).toHaveLength(0);
    expect(r.machines.get(rig(null).vapor)!.bottleneck).toMatch(/Chưa nạp khí/);
  });

  it('khí trơ tạo môi trường Stable, máy nằm trọn bên trong thì đủ điều kiện', () => {
    const s = rig(INERT);
    const r = solve(s.bp, ds);
    expect(r.env.zones.map((z) => z.env)).toEqual(['Stable']);
    const m = r.machines.get(s.purifier)!;
    expect(m.env).toBe('Stable');
    expect(m.envRequired).toBe('Stable');
    expect(m.bottleneck).not.toMatch(/môi trường/);
  });

  it('khí axit tạo môi trường Acid — sai loại thì công thức không chạy', () => {
    const s = rig(ACID_GAS);
    const r = solve(s.bp, ds);
    expect(r.env.zones.map((z) => z.env)).toEqual(['Acid']);
    const m = r.machines.get(s.purifier)!;
    expect(m.env).toBe('Acid');
    expect(m.utilization).toBeCloseTo(0, 6);
    expect(m.bottleneck).toMatch(/Cần môi trường/);
  });

  it('máy nào nằm trong vùng cũng được hưởng môi trường; công thức không cần môi trường vẫn chạy như thường (người dùng 2026-10-05)', () => {
    const s = rig(INERT);
    const f = put(s, 'furnance_1', 2, 30); // 3×3 x2..4, z30..32 — trọn trong vùng phủ
    setRecipe(s.bp, ds, f, 'furnance_carbon_enr_1');
    const r = solve(s.bp, ds);
    const m = r.machines.get(f)!;
    expect(m.env).toBe('Stable');
    expect(m.bottleneck ?? '').not.toMatch(/môi trường/);
  });

  it('thò ra ngoài vùng phủ một ô là mất tác dụng', () => {
    const edge = rig(INERT, 7); // z 37..41: ô cuối cùng vẫn nằm trong vùng
    expect(solve(edge.bp, ds).machines.get(edge.purifier)!.env).toBe('Stable');

    const over = rig(INERT, 8); // z 38..42: hở đúng một ô ⇒ mất tác dụng
    const r = solve(over.bp, ds);
    expect(r.machines.get(over.purifier)!.env).toBe('None');
    expect(r.machines.get(over.purifier)!.bottleneck).toMatch(/chưa nằm trọn/);
  });

  it('hai vùng môi trường không được phủ chồng nhau', () => {
    const s = scene(60, 60);
    put(s, 'vaporizer_1', 20, 20);
    const bad = addMachine(s.bp, ds, s.terrain, 'vaporizer_1', 24, 20, 0);
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/chồng/);
    // đủ xa thì đặt được
    expect(addMachine(s.bp, ds, s.terrain, 'vaporizer_1', 40, 20, 0).ok).toBe(true);
  });
});

describe('kho tổng', () => {
  /** Unloader ngồi trên tuyến (tuyến ở dưới), loader nằm dưới tuyến khác (tuyến ở trên). */
  function depotRig(): Scene & { unload: number; load: number } {
    const s = scene(40, 40);
    put(s, 'log_hongs_bus', 4, 31, 90); // x4..11, z31..34
    put(s, 'log_hongs_bus', 4, 16, 90); // x4..11, z16..19
    // Luật đổi 2026-10-02: mỗi đoạn phải chạm Cổng Tổng Tuyến mới thông với kho tổng
    put(s, 'log_hongs_bus_source', 12, 31);
    put(s, 'log_hongs_bus_source', 12, 16);
    const unload = put(s, 'unloader_1', 5, 30);
    const load = put(s, 'loader_1', 5, 20);
    return { ...s, unload, load };
  }

  it('rút ra rồi nạp lại: bảng kho ghi cả hai chiều', () => {
    const s = depotRig();
    const { unload, load } = s;
    setDepotItem(s.bp, unload, 'item_iron_powder');
    expect(link(s, unload, 0, load, 0).ok).toBe(true);

    const r = solve(s.bp, ds);
    const d = r.depot.get('item_iron_powder')!;
    expect(d.out).toBeCloseTo(30, 4); // rút ra, chặn bởi sức chở băng
    expect(d.in).toBeCloseTo(30, 4);
  });

  it('chưa chọn vật tư thì báo rõ chứ không im lặng', () => {
    const s = depotRig();
    expect(solve(s.bp, ds).machines.get(s.unload)!.bottleneck).toMatch(/kho tổng/);
  });

  it('không gắn vào tổng tuyến kho hàng thì không lấy được gì', () => {
    const s = scene(40, 40);
    const unload = put(s, 'unloader_1', 5, 30); // đứng một mình
    setDepotItem(s.bp, unload, 'item_iron_powder');
    const m = solve(s.bp, ds).machines.get(unload)!;
    expect(m.onBus).toBe(false);
    expect(m.bottleneck).toMatch(/tổng tuyến kho hàng/);
  });

  it('tuyến phải nằm ở phía đối diện cổng băng — gắn sai phía thì không tính', () => {
    const s = scene(40, 40);
    put(s, 'log_hongs_bus', 4, 25, 90); // tuyến ở PHÍA TRÊN unloader (z25..28 < 29)
    const unload = put(s, 'unloader_1', 5, 29); // cổng ra đẩy lên ⇒ tuyến phải ở dưới
    setDepotItem(s.bp, unload, 'item_iron_powder');
    expect(solve(s.bp, ds).machines.get(unload)!.onBus).toBe(false);
  });

  it('ràng buộc địa hình đang tắt — đặt đâu cũng được', () => {
    const s = scene(40, 40);
    // dữ liệu vẫn ghi nhận ràng buộc, chỉ là chưa áp dụng
    expect(ds.machines.get('unloader_1')!.placement).toBe('RoadAttach');
    expect(TERRAIN_RULES).toBe(false);
    expect(addMachine(s.bp, ds, s.terrain, 'unloader_1', 11, 12, 0).ok).toBe(true);
    expect(addMachine(s.bp, ds, s.terrain, 'miner_1', 20, 20, 0).ok).toBe(true);
  });
});

describe('van chia và pha khí', () => {
  it('van chia chia đều hàng cho các nhánh có nối', () => {
    // băng chảy từ dưới lên: nguồn ở dưới, van ở giữa, hai kho ở trên
    const s = scene(40, 40);
    const mine = put(s, 'miner_1', 5, 20);
    source(s, mine, 'item_iron_powder', 30);
    const split = put(s, 'log_splitter', 6, 14);
    expect(link(s, mine, 0, split, 0).ok).toBe(true);

    const a = put(s, 'storager_1', 5, 8); // nhận nhánh đi thẳng lên
    const b = put(s, 'storager_1', 12, 8); // nhận nhánh rẽ phải
    expect(link(s, split, 1, a, 0).ok).toBe(true);
    expect(link(s, split, 2, b, 0).ok).toBe(true);

    const r = solve(s.bp, ds);
    expect([...r.links.values()].every((l) => l.invalid === null)).toBe(true);
    const intoA = r.machines.get(a)!.inputs[0]!;
    const intoB = r.machines.get(b)!.inputs[0]!;
    expect(intoA.actual).toBeCloseTo(15, 3);
    expect(intoB.actual).toBeCloseTo(15, 3);
  });

  it('khí đi bằng ống, không nối được vào băng chuyền', () => {
    expect(ds.items.get(INERT)!.phase).toBe('gas');
    const s = scene(40, 40);
    const gas = put(s, 'gas_pump_1', 10, 10);
    source(s, gas, INERT, 30);
    const belt = put(s, 'storager_1', 10, 20); // chỉ có cổng băng
    expect(link(s, gas, 0, belt, 0).reason).toMatch(/băng chuyền với ống/);
  });

  it('không đưa được vật rắn tới cổng kích hoạt', () => {
    const s = scene(50, 50);
    paint(s.terrain, 'mine', 18, 28, 6, 6);
    const t = put(s, 'transmuter_1', 20, 20);
    setRecipe(s.bp, ds, t, 'liquid_transmuter_1_gas_gas_xiranite_enr_1');
    const mine = put(s, 'miner_1', 20, 30); // băng chuyền
    source(s, mine, 'item_iron_powder', 30);
    expect(link(s, mine, 0, t, 2).reason).toMatch(/băng chuyền với ống/);

    // và ngay cả máy nguồn dạng ống cũng không đẩy được vật rắn: không cổng nào hợp
    const pipeSrc = put(s, 'gas_pump_1', 30, 30);
    source(s, pipeSrc, 'item_iron_powder', 30);
    expect(solve(s.bp, ds).machines.get(pipeSrc)!.bottleneck).toMatch(/không có cổng băng/);
  });
});
