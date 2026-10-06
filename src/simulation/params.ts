/**
 * Thông số của **Simulation** (mô phỏng theo thời gian — người dùng 2026-10-03, xem `SIMULATION.md` §2). Tách riêng
 * với bộ giải ổn định (`src/sim/`) nhưng dùng chung sức chở băng / ống của game.
 */
import { RATES } from '../sim/rates';
import type { PortKind } from '../model/types';

/** Món mỗi phút trên một tuyến (băng 30, ống 120) — `SIMULATION.md` §2.1. */
export const PER_MINUTE: Record<PortKind, number> = { belt: RATES.beltPerMinute, pipe: RATES.pipePerMinute };

/**
 * Giây để một món đi hết **một ô** — *suy luận* ("thời gian qua từng ô phải tự tính"): lúc dày đặc nhất mỗi ô một
 * món, nên tốc độ (ô/giây) × 1 món/ô = sức chở ⇒ băng 2 s/ô, ống 0,5 s/ô. Đó cũng là khoảng cách tối thiểu giữa hai
 * món nối đuôi nhau.
 */
export const SECONDS_PER_CELL: Record<PortKind, number> = { belt: 60 / PER_MINUTE.belt, pipe: 60 / PER_MINUTE.pipe };

/** Kho của máy cho **mỗi** loại món (rắn, lỏng, khí như nhau) — §2.2. */
export const STORE = 50;

/**
 * Số ô **sản phẩm** của hai lò (§2.2, *suy luận* thứ tự "8/5": Lò Mở Rộng 8, Lò Phản Ứng 5 — khớp `CRUCIBLE_LIMITS`).
 * Máy khác: đúng số ô của công thức đang chạy (nguyên liệu + sản phẩm).
 */
export const CRUCIBLE_PRODUCT_SLOTS: Record<string, number> = { mix_pool_2: 8, mix_pool_1: 5 };

/** Cổng kích hoạt / máy khuếch tán khí: tiêu 6 mỗi phút khi đang chạy (như bộ giải). */
export const ACTIVATOR_PER_SECOND = RATES.activatorFloorPerMinute / 60;

/** Thời gian mô phỏng dài nhất (§2.7) và tốc độ phát nhanh nhất. */
export const MAX_SECONDS = 24 * 3600;
export const MAX_SPEED = 8;

/** Bước thời gian mặc định (giây). Mọi chuyển hàng đều mang mốc thời gian riêng nên bước lớn không làm sai sức chở. */
export const DT = 0.1;
