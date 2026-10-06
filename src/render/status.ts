import type { MachineFlow } from '../sim/solver';

/**
 * Trạng thái hiển thị của một máy (không tính "đang chọn" và "preview" — hai cái đó do
 * thao tác của người dùng quyết định, không do kết quả tính toán).
 *
 * - `unpowered` — máy cần điện mà không chạm cột/trụ nào, hoặc cả nhà máy đang mất điện
 *   ⇒ icon hai phích cắm màu cam. Hiện **cả khi tắt kiểm tra điện**.
 * - `blackout`  — máy **đã nối điện** nhưng cả hệ thống sụp vì thiếu điện ⇒ cùng icon
 *   phích cắm nhưng **đỏ-trắng**.
 * - `working`   — máy đang thực sự sản xuất ⇒ vòng tròn với sản phẩm đầu ra ở giữa.
 *   Chỉ bật khi **có đủ mọi đầu vào**: hệ số chạy > 0 nghĩa là nguyên liệu nào cũng đang
 *   tới (dù ít), đúng môi trường xúc tác, cổng kích hoạt có khí, và có điện — thiếu bất
 *   kỳ thứ gì thì solver đã hãm máy về 0.
 * - `normal`    — còn lại.
 */
export type MachineStatus = 'normal' | 'unpowered' | 'blackout' | 'working' | 'partial' | 'idle' | 'blocked';

/**
 * - `idle`    (ZZ) — máy **ngủ**: không nhận đủ đầu vào để làm ra sản phẩm (thiếu nguyên
 *   liệu, sai môi trường, thiếu khí kích hoạt) nhưng vẫn ăn điện ⇒ hoang phí điện.
 * - `blocked` (⊘) — máy **kẹt**: có đầu vào nhưng băng/ống ra không kéo đi hết sản phẩm,
 *   sản phẩm dồn trong máy nên không sản xuất tương xứng với đầu vào — máy **đứng hẳn** (≈ 0%).
 * - `partial` (!) — máy chạy nhưng **không hết công suất** (0% < tốc độ < 100%, thiếu đầu vào hay
 *   đầu ra thoát không kịp) ⇒ vòng vàng, dấu "!" vàng cạnh sản phẩm (người dùng 2026-09-29; trước
 *   đây đầu ra nghẽn một phần cũng hiện vòng đỏ + biển cấm).
 */
export function machineStatus(flow: MachineFlow | undefined): MachineStatus {
  if (!flow) return 'normal';
  if (flow.powered === false) return flow.blackout ? 'blackout' : 'unpowered';
  if (flow.role !== 'crafter' || !flow.recipeId || flow.outputs.length === 0) return 'normal';
  const u = flow.utilization;
  if (u > 1e-3 && u < 0.999) return 'partial';
  if (flow.limitedBy === 'output') return 'blocked';
  if (u <= 1e-3) return 'idle';
  return 'working';
}

/** Sản phẩm để vẽ giữa vòng tròn: đầu ra chính của công thức. */
export const statusProduct = (flow: MachineFlow): string | undefined => flow.outputs[0]?.itemId;
