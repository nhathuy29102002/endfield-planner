import { el } from './dom';
import { tr } from '../i18n';

/**
 * **Hộp hướng dẫn thao tác** (người dùng 2026-09-30): cột nhỏ ở **góc phải dưới**, hiện mỗi lần bật một tab
 * (Map và Modeler có nội dung riêng). Sát đáy hộp là **thanh đếm ngược 5 giây** ngắn dần; hết giờ thì hộp mờ
 * dần rồi biến mất. Bật tab khác trước khi hết giờ ⇒ hộp cũ bị thay bằng hộp của tab mới.
 */

/** Icon chuột (nút trái / phải / lăn). */
export const MOUSE = (btn: 'L' | 'R' | 'W'): string =>
  `<svg viewBox="0 0 16 20" width="13" height="16"><rect x="1.5" y="1.5" width="13" height="17" rx="6.5" fill="none" stroke="currentColor" stroke-width="1.3"/>` +
  (btn === 'L' ? '<path d="M8 1.5A6.5 6.5 0 0 0 1.5 8V9H8Z" fill="#e8c547"/>' : btn === 'R' ? '<path d="M8 1.5A6.5 6.5 0 0 1 14.5 8V9H8Z" fill="#e8c547"/>' : '<rect x="7" y="4" width="2" height="5" rx="1" fill="#e8c547"/>') +
  '<path d="M8 1.5V9M1.5 9H14.5" stroke="currentColor" stroke-width="1.1"/></svg>';
/** Icon phím. */
export const KEY = (k: string): string => `<kbd>${k}</kbd>`;

/** Một dòng: [icon (HTML), chữ]. */
export type HintRow = [string, string];

export const MODELER_HINTS: HintRow[] = [
  [MOUSE('L') + '▭', tr('Kéo nền: chọn nhóm')],
  [MOUSE('R') + '✥', tr('Kéo: di chuyển')],
  [MOUSE('W'), 'Zoom'],
  [MOUSE('L') + '⟶', tr('Kéo cổng: nối / máy mới')],
  [MOUSE('L') + '⏱', tr('Giữ cổng: đổi chỗ')],
  [MOUSE('L') + '⌒', tr('Kéo đường: thêm điểm neo')],
  [MOUSE('R') + '•', tr('Điểm neo: xoá')],
  [MOUSE('R') + '✂', tr('Đường nối: bỏ')],
  [KEY('C') + KEY('Del'), tr('Sao chép / xoá')],
  ['✎', tr('Bút vẽ: nút ở cột phải')],
];

export const MAP_HINTS: HintRow[] = [
  [MOUSE('L') + '▭', tr('Bấm: chọn · kéo nền: chọn vùng')],
  [MOUSE('R') + '✥', tr('Kéo: di chuyển')],
  [MOUSE('W'), 'Zoom'],
  [KEY('W') + KEY('A') + KEY('S') + KEY('D'), tr('Di chuyển bản vẽ')],
  [KEY('E') + KEY('Q'), tr('Băng chuyền / ống')],
  [KEY('R'), tr('Xoay máy')],
  [KEY('M') + KEY('C'), tr('Di chuyển / sao chép')],
  [KEY('Space'), tr('Đổi chế độ máy')],
  [KEY('Tab'), tr('Bật / tắt máy đang chọn')],
  [KEY('Caps'), tr('Mặt đất ⇄ trên cao')],
  [KEY('X'), tr('Chọn hàng loạt')],
  [KEY('F'), tr('Xoá đang chọn / tẩy')],
  [KEY('Z'), tr('Đóng / mở danh sách máy')],
  [KEY('1') + '…' + KEY('0'), tr('Máy đã ghim')],
];

/** Icon ngón tay cho hướng dẫn cảm ứng (app Android). */
export const FINGER = (n: 1 | 2): string => (n === 1 ? '☝' : '✌');

/** Hướng dẫn **cảm ứng** của Map (app Android, người dùng 2026-10-05) — thay bảng chuột / phím khi `isTouchUI()`. */
export const TOUCH_MAP_HINTS: HintRow[] = [
  [FINGER(1) + '·', tr('Chạm: chọn máy / ô')],
  [FINGER(1) + '✥', tr('Rê một ngón: kéo bản đồ')],
  [FINGER(2) + '⤢', tr('Hai ngón: kéo + chụm để zoom')],
  [FINGER(1) + '⏱▭', tr('Giữ 0,5 s ô trống: chọn vùng')],
  [FINGER(1) + '⏱✥', tr('Giữ 0,5 s trên máy: di chuyển')],
  [FINGER(1) + '⊕', tr('Chọn máy ở bảng trái, chạm bản đồ: đặt preview, ✓ để đặt')],
  [FINGER(1) + '〰', tr('Băng / ống: rê ngón vẽ đường, ✓ để đặt')],
];

/** Hướng dẫn **cảm ứng** của Modeler. */
export const TOUCH_MODELER_HINTS: HintRow[] = [
  [FINGER(1) + '✥', tr('Rê nền: kéo sơ đồ · hai ngón: zoom')],
  [FINGER(1) + '⏱▭', tr('Giữ 0,5 s nền: chọn nhóm')],
  [FINGER(1) + '✥', tr('Rê máy: di chuyển')],
  [FINGER(1) + '··', tr('Chạm hai lần vào máy: chọn công thức')],
  [FINGER(1) + '⟶', tr('Rê từ cổng: nối · giữ cổng rồi rê: đổi chỗ')],
  [FINGER(1) + '⏱', tr('Giữ lâu cổng / đường: menu, bỏ nối')],
];

/** Thời gian hiện hộp trước khi mờ đi (ms). */
export const HINT_MS = 5000;

let current: HTMLElement | null = null;

const PIN_SVG =
  '<svg viewBox="0 0 24 24"><path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" fill="currentColor"/></svg>';

/**
 * Hiện hộp hướng dẫn trong `host` (thay hộp đang hiện, nếu có).
 *
 * **Ghim** ở góc trên-phải (người dùng 2026-10-02): biến mất cùng hộp khi hết giờ; bấm kịp ⇒ ghim hoá vàng, thanh
 * đếm ngược dừng và hộp ở lại; bấm ghim lần nữa ⇒ hộp mờ dần rồi biến mất.
 */
export function showHints(host: HTMLElement, rows: HintRow[], ms = HINT_MS): HTMLElement {
  current?.remove();
  const bar = el('div', { class: 'hint-timer', style: `animation-duration:${ms}ms` });
  let pinned = false;
  const pin = el('button', {
    class: 'hint-pin',
    title: tr('Ghim hộp hướng dẫn (bấm lần nữa để đóng)'),
    onclick: (e: Event) => {
      e.stopPropagation();
      if (pinned) {
        // bỏ ghim ⇒ mờ dần rồi mới biến mất, như lúc hết giờ (người dùng 2026-10-03)
        pinned = false;
        pin.classList.remove('on');
        box.classList.add('out');
        setTimeout(() => {
          if (!pinned) box.remove();
        }, 800); // dự phòng khi `transitionend` không tới
        return;
      }
      pinned = true;
      pin.classList.add('on');
      pin.title = tr('Bỏ ghim và đóng hộp hướng dẫn');
      bar.remove();
      box.classList.remove('out'); // đang mờ dần mà bấm kịp ⇒ hiện lại rõ
    },
  });
  pin.innerHTML = PIN_SVG;
  pin.addEventListener('mousedown', (e) => e.stopPropagation());
  const box = el(
    'div',
    { class: 'hint-box' },
    pin,
    ...rows.map(([icon, text]) => {
      const ic = el('span', { class: 'hint-ic' });
      ic.innerHTML = icon;
      return el('div', { class: 'hint-row' }, ic, el('span', {}, text));
    }),
    bar,
  );
  // hết giờ (thanh đếm ngược chạy xong) ⇒ mờ dần ⇒ gỡ khỏi trang
  bar.addEventListener('animationend', () => {
    if (pinned) return;
    box.classList.add('out');
    setTimeout(() => {
      if (!pinned) box.remove();
    }, 800); // dự phòng khi `transitionend` không tới (tắt hiệu ứng…)
  });
  box.addEventListener('transitionend', (e) => {
    if (e.target === box && box.classList.contains('out') && !pinned) box.remove();
  });
  host.append(box);
  current = box;
  // điện thoại: vuốt ngang để tắt (người dùng 2026-10-07)
  swipeAway(box, () => box.remove());
  return box;
}

/**
 * Điện thoại (người dùng 2026-10-07): hộp hướng dẫn **vuốt sang trái hoặc phải để tắt** — hộp đi theo ngón tay, thả quá
 * 60 px thì trượt hẳn ra rồi `gone()`, không thì về chỗ cũ.
 */
export function swipeAway(box: HTMLElement, gone: () => void): void {
  if (!document.documentElement.classList.contains('touch-ui')) return;
  let s: { x: number; y: number; dx: number } | null = null;
  box.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    s = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY, dx: 0 } : null;
    box.style.transition = 'none';
  }, { passive: true });
  box.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!s || !t) return;
    s.dx = t.clientX - s.x;
    if (Math.abs(t.clientY - s.y) > Math.abs(s.dx) * 1.5) return;
    e.stopPropagation();
    box.style.transform = `translateX(${s.dx}px)`;
    box.style.opacity = String(Math.max(0.2, 1 - Math.abs(s.dx) / 220));
  }, { passive: true });
  box.addEventListener('touchend', () => {
    if (!s) return;
    const dx = s.dx;
    s = null;
    box.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
    if (Math.abs(dx) > 60) {
      box.style.transform = `translateX(${dx > 0 ? 120 : -120}%)`;
      box.style.opacity = '0';
      setTimeout(() => {
        box.style.transition = box.style.transform = box.style.opacity = '';
        gone();
      }, 210);
    } else {
      box.style.transform = '';
      box.style.opacity = '';
    }
  });
}
