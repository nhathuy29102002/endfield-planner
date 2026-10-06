/** Sự kiện cảm ứng hai ngón gửi cho màn hình Modeler (`ui/touch.ts` → `modeler/view.ts`). */
export const TOUCH_VIEW_EVENT = 'efp:touch-view';

/** `dx, dy` = dịch (px màn hình), `factor` = tỉ lệ zoom quanh điểm `(cx, cy)` (toạ độ client). */
export interface TouchViewDetail {
  dx: number;
  dy: number;
  factor: number;
  cx: number;
  cy: number;
}
