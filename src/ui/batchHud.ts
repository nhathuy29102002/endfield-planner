import type { AppState } from '../editor/state';
import { el } from './dom';
import { KEY, MOUSE } from './hints';
import { tr } from '../i18n';

/**
 * **Chế độ chọn hàng loạt** (phím X — người dùng 2026-10-06, theo khối phím tắt trong game). Mảng trên = các nút có sẵn ở
 * cột công cụ bên phải, xếp lại theo thứ tự trong game (`dock.ts`): Lưu bản vẽ · Sao chép · Di chuyển · Lưu trữ (F) ·
 * Bật / tắt (Tab). Mảng dưới = **hộp gợi ý ở góc phải dưới** (cùng kiểu hộp hướng dẫn thao tác, hộp đó ẩn đi), hiện suốt lúc
 * đang ở chế độ này:
 *   chuột trái — Chọn / Bỏ chọn · kéo hộp chuột trái — Chọn nhiều · kéo hộp chuột phải — Bỏ chọn nhiều ·
 *   X / Esc / chuột phải — Thoát chế độ hàng loạt.
 * Người dùng: không cần chữ to như ảnh, chỉ cần đúng thứ tự. Chỉ bản máy tính (điện thoại không có phím X).
 */
export function mountBatchHud(host: HTMLElement, state: AppState, machineWin: HTMLElement): void {
  const rows: [string, string][] = [
    [MOUSE('L'), tr('Chọn / Bỏ chọn')],
    [MOUSE('L') + '▭', tr('Kéo hộp: Chọn nhiều')],
    [MOUSE('R') + '▭', tr('Kéo hộp: Bỏ chọn nhiều')],
    [KEY('X') + KEY('Esc') + MOUSE('R'), tr('Thoát chế độ hàng loạt')],
  ];
  const tip = el(
    'div',
    { class: 'hint-box batch-tip', hidden: true },
    el('div', { class: 'batch-tip-head' }, tr('Chọn hàng loạt')),
    ...rows.map(([icon, text]) => {
      const ic = el('span', { class: 'hint-ic' });
      ic.innerHTML = icon;
      return el('div', { class: 'hint-row' }, ic, el('span', {}, text));
    }),
  );
  host.append(tip);

  /** Sát góc phải dưới; cửa sổ Máy đang mở ở đó thì đứng ngay bên trái nó (không chồng lên). */
  const place = (): void => {
    const r = machineWin.getBoundingClientRect();
    const open = !machineWin.hidden && !machineWin.classList.contains('collapsed') && r.width > 0;
    tip.style.right = open ? `${Math.round(host.getBoundingClientRect().right - r.left + 10)}px` : '';
  };
  const update = (): void => {
    const on = state.batch && !document.documentElement.classList.contains('touch-ui');
    tip.hidden = !on;
    document.body.classList.toggle('batch-on', on);
    if (on) requestAnimationFrame(place);
  };
  state.subscribe((mode) => {
    if (mode !== 'view') update();
  });
  update();
}
