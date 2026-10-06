import { groupItems, itemName } from '../model/dataset';
import type { AppState } from '../editor/state';
import { clear, el } from './dom';
import { tr } from '../i18n';
import { autoFocus } from '../platform';

/** Bỏ dấu tiếng Việt để gõ "sat" vẫn ra "Sắt". */
const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

export const itemIconSrc = (state: AppState, itemId: string): string =>
  `img/itemicon/${state.ds.items.get(itemId)?.icon ?? itemId}.png`;

let open: { node: HTMLElement; close: () => void } | null = null;

/** Đóng bảng chọn đang mở (nếu có) — gọi khi cửa sổ chứa nó vẽ lại. */
export function closeItemPicker(): void {
  open?.close();
}

export interface PickerOptions {
  /** Có nút "để trống" (×). */
  allowNone?: boolean;
  title?: string;
}

/**
 * Bảng chọn vật phẩm **bằng icon** (người dùng chốt: mọi chỗ chọn vật tư đều dùng icon, không
 * dùng tên). Hiện cạnh nút `anchor`; nhiều lựa chọn thì có ô tìm (không cần dấu). Bấm icon ⇒
 * `onPick(id, event)` — `event.ctrlKey` để nơi gọi phân biệt "chỉ cổng này". Esc / bấm ra
 * ngoài ⇒ đóng. Ô tìm là ô nhập chữ thật nên gõ tiếng Việt bình thường.
 */
export function openItemPicker(
  anchor: HTMLElement,
  state: AppState,
  options: string[],
  current: string | null,
  onPick: (itemId: string | null, e: MouseEvent) => void,
  opts: PickerOptions = {},
): void {
  closeItemPicker();
  const node = el('div', { class: 'item-picker', role: 'dialog' });
  const grid = el('div', { class: 'ip-grid' });
  const search =
    options.length > 12 ? el('input', { class: 'ip-search', type: 'search', placeholder: tr('Tìm vật phẩm… (không cần dấu)') }) : null;
  // dấu × đóng hộp (người dùng 2026-10-05 — trên điện thoại không có Esc / bấm ra ngoài khó)
  node.append(
    el(
      'div',
      { class: 'ip-head' },
      el('div', { class: 'ip-title' }, opts.title ?? ''),
      el('button', { class: 'ip-close', type: 'button', title: tr('Đóng (Esc)'), onclick: () => close() }, '×'),
    ),
  );
  if (search) node.append(search);
  node.append(grid);

  const draw = (): void => {
    clear(grid);
    const q = search ? fold(search.value.trim()) : '';
    if (opts.allowNone)
      grid.append(
        // "Empty" (icon người dùng gửi 2026-09-29) thay cho dấu ×
        el(
          'button',
          { class: `ip-item none${current === null ? ' active' : ''}`, title: tr('Empty — để trống'), onclick: (e: Event) => pick(null, e as MouseEvent) },
          el('img', { src: 'img/ui/empty.png', alt: 'Empty' }),
        ),
      );
    // nhóm: Sản phẩm thô · Sản phẩm khu phức hợp · Cây trồng · Bình chứa khí/lỏng (người dùng 2026-10-02); chỉ một
    // nhóm thì không cần tiêu đề
    const groups = groupItems(state.ds, options);
    for (const g of groups) {
      const shown = g.ids.filter((id) => !q || fold(itemName(state.ds, id)).includes(q) || id.includes(q));
      if (shown.length === 0) continue;
      if (groups.length > 1) grid.append(el('div', { class: 'ip-section' }, g.title));
      for (const id of shown)
        grid.append(
          el(
            'button',
            { class: `ip-item${id === current ? ' active' : ''}`, title: itemName(state.ds, id), onclick: (e: Event) => pick(id, e as MouseEvent) },
            el('img', { src: itemIconSrc(state, id), alt: '', loading: 'lazy' }),
          ),
        );
    }
  };
  const pick = (id: string | null, e: MouseEvent): void => {
    close();
    onPick(id, e);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    close();
  };
  const onDown = (e: MouseEvent): void => {
    if (!node.contains(e.target as Node) && e.target !== anchor && !anchor.contains(e.target as Node)) close();
  };
  const close = (): void => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('mousedown', onDown, true);
    node.remove();
    if (open?.node === node) open = null;
  };
  search?.addEventListener('input', draw);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('mousedown', onDown, true);
  draw();
  document.body.append(node);
  open = { node, close };

  // canh cạnh nút, không tràn khỏi màn hình
  const r = anchor.getBoundingClientRect();
  const w = node.offsetWidth || 260;
  const h = node.offsetHeight || 200;
  const left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2));
  const top = r.top - h - 6 >= 6 ? r.top - h - 6 : Math.min(window.innerHeight - h - 6, r.bottom + 6);
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
  // hiệu ứng mở (điện thoại): nở ra từ phía nút vừa bấm
  node.style.transformOrigin = `${Math.round(r.left + r.width / 2 - left)}px ${top < r.top ? h : 0}px`;
  autoFocus(search);
}

/**
 * Nút hiện icon vật phẩm đang chọn (hoặc ô trống) — bấm để mở bảng chọn. Dùng thay cho
 * `<select>` chữ.
 */
export function itemButton(
  state: AppState,
  current: string | null,
  options: () => string[],
  onPick: (itemId: string | null, e: MouseEvent) => void,
  opts: PickerOptions = {},
): HTMLButtonElement {
  const btn = el(
    'button',
    {
      class: `item-btn${current ? '' : ' empty'}`,
      title: current ? tr('{0} — bấm để đổi', itemName(state.ds, current)) : tr('Chưa chọn — bấm để chọn vật phẩm'),
    },
    current ? el('img', { src: itemIconSrc(state, current), alt: '' }) : '+',
  );
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openItemPicker(btn, state, options(), current, onPick, opts);
  });
  return btn;
}
