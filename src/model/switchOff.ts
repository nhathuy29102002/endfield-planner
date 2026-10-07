import type { MachineDef, PlacedMachine } from './types';
import { roleOf } from './roles';

/**
 * Máy **tắt được** (Tab, nút nguồn ở cửa sổ máy). Luật đổi (người dùng 2026-10-07): **mọi máy** đều tắt được, **trừ Cổng
 * Tổng Tuyến Kho Hàng và Khu Tổng Tuyến Kho Hàng** (vai `bus`). Trước đó (2026-10-06) chỉ máy dùng điện và trạm điện.
 * Máy tắt = không chạy, không nhận / đẩy hàng, không tốn điện; cột / trụ điện tắt thì không cấp điện, máy tạo môi trường
 * tắt thì không tạo môi trường. Công trình đặt sẵn của căn cứ (`fixed`) không đổi được (giống di chuyển / xoá).
 */
export const canSwitchOff = (def: MachineDef | undefined): boolean => !!def && roleOf(def) !== 'bus';

/** Máy này đang bị người dùng tắt (và loại máy đó tắt được). */
export const isOff = (m: PlacedMachine, def: MachineDef | undefined): boolean => m.off === true && canSwitchOff(def);
