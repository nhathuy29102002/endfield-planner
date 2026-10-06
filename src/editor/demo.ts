import type { Terrain } from '../grid/grid';
import { emptyBlueprint, portKey, type Blueprint, type Dataset } from '../model/types';
import {
  addMachine,
  connect,
  setDepotItem,
  setInfinite,
  setMode,
  setPairTarget,
  setRecipe,
  setSource,
} from './ops';
import { tr } from '../i18n';

/**
 * Bản vẽ mẫu mở sẵn lần đầu.
 *
 * Trong căn cứ AIC **không có máy khai thác hay bơm khí**: chúng không lấy được tài
 * nguyên trực tiếp từ căn cứ. Nguyên liệu vào bằng hai đường:
 *  - vật rắn: rút từ **kho tổng** qua `unloader` (băng chuyền);
 *  - khí và chất lỏng: không có kho tổng, nên dùng **đầu ra ống ngầm** đặt ở chế độ
 *    nguồn vô hạn (`infinitable` trong game).
 *
 * Dựng bằng chính các hàm `ops` — mỗi tuyến đều phải nối được, không thì ném lỗi ngay
 * lúc mở ứng dụng thay vì lặng lẽ thiếu tuyến.
 */
export function demoPlan(ds: Dataset): { bp: Blueprint; terrain: Terrain } {
  const bp = emptyBlueprint(70, 70);
  // Địa hình (mỏ, đất trồng, nước, đường) đang tắt — xem `TERRAIN_RULES` trong grid.ts.
  const terrain: Terrain = {};

  const put = (id: string, x: number, z: number, rot: 0 | 90 | 180 | 270 = 0): number => {
    const r = addMachine(bp, ds, terrain, id, x, z, rot);
    if (!r.ok || r.uid === undefined) throw new Error(`demo: ${id} — ${r.reason}`);
    return r.uid;
  };
  const wire = (a: number, ai: number, b: number, bi: number): void => {
    const r = connect(bp, ds, { uid: a, portKey: portKey('out', ai) }, { uid: b, portKey: portKey('in', bi) });
    if (!r.ok) throw new Error(tr('demo: nối #{0}.out{1} → #{2}.in{3} — {4}', a, ai, b, bi, r.reason));
  };
  /** Đầu ra ống ngầm ở chế độ nguồn vô hạn — cách đưa khí/lỏng vào căn cứ. */
  const fluidSource = (itemId: string, x: number, z: number): number => {
    const uid = put('udpipe_unloader_1', x, z);
    setInfinite(bp, uid, true);
    setSource(bp, uid, itemId, 0);
    return uid;
  };

  /**
   * Một đoạn tổng tuyến kho hàng nằm ngang (4×8 xoay 90° thành 8×4). Loader/Unloader chỉ
   * thông với kho tổng khi đặt sát đoạn này, ở phía đối diện cổng băng của chúng.
   */
  const bus = (x: number, z: number): number => put('log_hongs_bus', x, z, 90);
  /**
   * Đoạn tổng tuyến phải chạm Cổng Tổng Tuyến (trực tiếp hoặc qua đoạn khác) mới thông với kho tổng (người dùng
   * 2026-10-02) ⇒ mỗi đoạn lẻ trong bản mẫu có một cổng 4×4 sát bên.
   */
  const busStart = (x: number, z: number): number => put('log_hongs_bus_source', x, z);

  // --- điện trước tiên, để băng/ống đặt sau tự tránh
  put('power_diffuser_1', 38, 37); // phủ hai lò
  put('power_diffuser_1', 4, 26); // phủ máy lọc

  // --- nhánh 1: kho tổng → hai lò nối tiếp → nạp lại kho tổng
  bus(32, 49); // tuyến dưới: unloader lấy hàng lên
  put('log_hongs_bus_source', 40, 49); // đầu tuyến
  bus(32, 28); // tuyến trên: loader trả hàng về
  busStart(28, 28);
  const mossIn = put('unloader_1', 33, 48);
  setDepotItem(bp, mossIn, 'item_plant_moss_enr_powder_1');
  const furnaceA = put('furnance_1', 33, 42);
  const furnaceB = put('furnance_1', 33, 36);
  const carbonOut = put('loader_1', 33, 32);
  setRecipe(bp, ds, furnaceA, 'furnance_carbon_enr_powder_1');
  setRecipe(bp, ds, furnaceB, 'furnance_carbon_enr_1');
  wire(mossIn, 0, furnaceA, 0);
  wire(furnaceA, 0, furnaceB, 0);
  wire(furnaceB, 0, carbonOut, 0);

  // --- nhánh 2: khí trơ → máy tạo môi trường; máy lọc nằm trọn trong vùng 13×13
  const vaporizer = put('vaporizer_1', 14, 24);
  const inert = fluidSource('item_gas_inert', 22, 24);
  wire(inert, 0, vaporizer, 0);

  // Heavy Xiragen (Khí Xiranite Đậm Đặc): máy 1 = Máy Tinh Chế nhận Xiragen + Lõi Phân
  // Tách; máy 2 = Máy Khuếch Tán Khí đặt cạnh, nạp khí trơ để tạo môi trường Stable
  const purifier = put('liquid_purifier_1', 9, 19);
  // công thức khí thuộc chế độ Gas & Liquid (B) — chế độ này chỉ mở cổng ống vào giữa (in2) và 5
  // cổng băng vào (`MODE_PORTS`)
  setMode(bp, ds, purifier, 'B');
  setRecipe(bp, ds, purifier, 'liquid_purifier_gas_xiranite_enr_2');
  const xiragen = fluidSource('item_gas_xiranite', 16, 14);
  wire(xiragen, 0, purifier, 2);
  bus(10, 27);
  busStart(6, 27);
  const cores = put('unloader_1', 11, 26);
  setDepotItem(bp, cores, 'item_filter_core');
  wire(cores, 0, purifier, 3);
  const gasStore = put('gas_storager_1', 3, 18);
  wire(purifier, 0, gasStore, 0);

  // --- nhánh 3: rút sắt từ kho tổng rồi nạp thẳng lại
  bus(47, 41);
  busStart(43, 41);
  bus(47, 30);
  busStart(43, 30);
  const ironOut = put('unloader_1', 48, 40);
  const ironIn = put('loader_1', 48, 34);
  setDepotItem(bp, ironOut, 'item_iron_powder');
  wire(ironOut, 0, ironIn, 0);

  // --- nhánh 4: ống ngầm — nạp nước ở một đầu, lấy ra ở đầu kia bản vẽ, không ống nối
  const water = fluidSource('item_gas_water', 14, 6);
  const udIn = put('udpipe_loader_1', 8, 6);
  wire(water, 0, udIn, 0);
  const udOut = put('udpipe_unloader_1', 46, 6);
  setPairTarget(bp, ds, udIn, udOut);
  const waterStore = put('gas_storager_1', 40, 6);
  wire(udOut, 0, waterStore, 0);

  // --- nhánh 5: trạm điện đốt pin lấy từ kho tổng
  bus(55, 27);
  busStart(63, 27);
  const batteries = put('unloader_1', 56, 26);
  setDepotItem(bp, batteries, 'item_proc_battery_1');
  const station = put('power_station_1', 57, 22);
  wire(batteries, 0, station, 1);

  bp.name = tr('Bản vẽ mẫu — tổng tuyến kho hàng, môi trường xúc tác, ống ngầm, trạm điện');
  return { bp, terrain };
}
