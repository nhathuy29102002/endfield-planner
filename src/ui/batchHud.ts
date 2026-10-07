import type { AppState } from '../editor/state';
import { el } from './dom';
import { FINGER, HINT_MS, KEY, MOUSE, swipeAway } from './hints';
import { onPrefs, prefs } from './prefs';
import { tr } from '../i18n';

/**
 * **Hộp hướng dẫn của chế độ chọn nhiều** (phím / nút X — người dùng 2026-10-06, theo khối phím tắt trong game) — tách
 * riêng khỏi hộp hướng dẫn hiện khi mở tab. Người dùng 2026-10-07:
 *  - chỉ hiện khi **vào chế độ X** (không hiện chỉ vì đang chọn máy);
 *  - có **thanh đếm ngược** như hộp hướng dẫn khác (hết giờ thì mờ dần rồi ẩn tới lần vào chế độ sau);
 *  - "Không hiện tooltip" trong Cài đặt tắt luôn hộp này.
 * Máy tính: to hơn hộp thường, chữ to hơn. Điện thoại: vuốt ngang để tắt; tấm cửa sổ Máy (màn dọc) đang mở thì ẩn. Nằm góc
 * phải dưới (cửa sổ Máy đang mở ở đó thì đứng bên trái nó).
 */
export function mountBatchHud(host: HTMLElement, state: AppState, machineWin: HTMLElement): void {
  const touch = (): boolean => document.documentElement.classList.contains('touch-ui');
  const rows = (): [string, string][] =>
    touch()
      ? [
          [FINGER(1) + '·', tr('Chạm máy: chọn / bỏ chọn')],
          [FINGER(1) + '⏱✥', tr('Giữ 0,5 s trên máy: di chuyển cả nhóm')],
          [FINGER(1) + '✥', tr('Rê một ngón: kéo bản đồ')],
          ['✕', tr('Thoát: thoát chế độ chọn nhiều')],
        ]
      : [
          [MOUSE('L'), tr('Chọn / Bỏ chọn')],
          [MOUSE('L') + '▭', tr('Kéo hộp: Chọn nhiều')],
          [MOUSE('R') + '▭', tr('Kéo hộp: Bỏ chọn nhiều')],
          [KEY('X') + KEY('Esc') + MOUSE('R'), tr('Thoát chế độ hàng loạt')],
        ];
  const tip = el('div', { class: 'hint-box batch-tip', hidden: true });
  host.append(tip);
  /** Đang ở chế độ X (lần trước) và hộp của lần vào chế độ này đã xong (hết giờ / vuốt tắt). */
  let wasOn = false;
  let done = false;
  const finish = (): void => {
    done = true;
    tip.classList.remove('out');
    tip.hidden = true;
    document.body.classList.remove('batch-on');
  };
  swipeAway(tip, finish);
  const fill = (): void => {
    tip.textContent = '';
    tip.classList.remove('out');
    const timer = el('div', { class: 'hint-timer', style: `animation-duration:${HINT_MS}ms` });
    // hết giờ ⇒ mờ dần rồi ẩn (như hộp hướng dẫn khi mở tab)
    timer.addEventListener('animationend', () => {
      tip.classList.add('out');
      setTimeout(() => {
        if (tip.classList.contains('out')) finish();
      }, 650);
    });
    tip.append(
      el('div', { class: 'batch-tip-head' }, tr('Chọn nhiều')),
      ...rows().map(([icon, text]) => {
        const ic = el('span', { class: 'hint-ic' });
        ic.innerHTML = icon;
        return el('div', { class: 'hint-row' }, ic, el('span', {}, text));
      }),
      timer,
    );
  };

  const mwOpen = (): boolean => !machineWin.hidden && !machineWin.classList.contains('collapsed') && machineWin.getBoundingClientRect().width > 0;
  /** Sát góc phải dưới; cửa sổ Máy đang mở ở đó thì đứng ngay bên trái nó (không chồng lên). */
  const place = (): void => {
    const r = machineWin.getBoundingClientRect();
    tip.style.right = mwOpen() ? `${Math.round(host.getBoundingClientRect().right - r.left + 10)}px` : '';
  };
  const update = (): void => {
    const on = state.batch && state.tool.kind === 'select';
    if (on && !wasOn) {
      done = false;
      fill();
    }
    wasOn = on;
    // điện thoại màn dọc: tấm cửa sổ Máy phủ nửa dưới ⇒ không hiện hộp
    const sheet = touch() && window.innerHeight > window.innerWidth && mwOpen();
    const show = on && !done && !sheet && !prefs().noTooltips;
    tip.hidden = !show;
    document.body.classList.toggle('batch-on', show);
    if (show) requestAnimationFrame(place);
  };
  state.subscribe((m) => {
    if (m !== 'view') update();
  });
  new MutationObserver(update).observe(machineWin, { attributes: true, attributeFilter: ['class', 'hidden'] });
  onPrefs(() => update());
}
