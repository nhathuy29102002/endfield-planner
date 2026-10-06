import { footprint } from '../model/geometry';
import type { Cell, Facing, MachineDef } from '../model/types';

/**
 * Chế độ preview máy:
 *  - `new`  — chọn máy từ bảng trái, đặt bao nhiêu cái cũng được;
 *  - `move` — nhấc máy đang chọn khỏi chỗ cũ; Esc trả về chỗ cũ;
 *  - `copy` — máy gốc giữ nguyên, đặt bản sao; Esc tắt preview.
 */
export type PlaceMode = 'new' | 'move' | 'copy';

/** Góc trên-trái của đế sao cho ô `center` nằm giữa đế — giống cảm giác cầm máy trong game. */
export function originFor(def: MachineDef, rot: Facing, center: Cell): Cell {
  const box = footprint(def, rot);
  return { x: center.x - Math.floor((box.w - 1) / 2), z: center.z - Math.floor((box.d - 1) / 2) };
}

/**
 * Hướng máy theo hướng rê chuột khi đang giữ chuột phải.
 *
 * Hướng 0 của máy là hướng hàng chảy ra (lên trên màn hình); quay 90° là theo chiều kim
 * đồng hồ. Nên rê lên ⇒ 0, rê sang phải ⇒ 90, rê xuống ⇒ 180, rê sang trái ⇒ 270. Rê chưa
 * đủ xa (`threshold` pixel) thì chưa xoay, để giữ chuột phải mà tay hơi rung không làm
 * máy quay lung tung.
 */
export function rotFromDrag(dx: number, dy: number, threshold: number): Facing | null {
  if (Math.hypot(dx, dy) < threshold) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 90 : 270;
  return dy > 0 ? 180 : 0;
}
