import type { Dataset } from '../model/types';
import { itemName } from '../model/dataset';
import { clear, el } from './dom';
import { tr } from '../i18n';
import { autoFocus } from '../platform';

/**
 * **Kho tổng tự sinh** (người dùng 2026-10-04 — nút cài đặt trên thanh điều khiển mô phỏng): bảng hai cột, **trái** = các
 * món đang **tự sinh** vào kho tổng, **phải** = các món không tự sinh. Mỗi món có một ô nhập **số mỗi phút** tự có thêm
 * trong kho tổng — dùng thay cho "Kho tổng vô hạn" (chỉ có tác dụng khi tắt kho vô hạn). Ô tìm theo tên. Nhập số > 0 ⇒
 * món đó **trượt sang cột trái**; xoá / về 0 ⇒ trượt về cột phải (FLIP).
 * Chỉ liệt kê vật phẩm **rắn** (kho tổng chỉ chứa đồ rắn) — *suy luận*.
 */
export type DepotGen = Record<string, number>;

const KEY = 'efp:simgen';
export function loadGen(): DepotGen {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as DepotGen;
    return Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === 'number' && n > 0));
  } catch {
    return {};
  }
}
export function saveGen(g: DepotGen): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    /* không lưu được thì thôi */
  }
}

/** Bỏ dấu tiếng Việt để tìm theo tên gõ không dấu. */
const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

export interface GenPanel {
  el: HTMLElement;
  /** Đổi trạng thái kho vô hạn (chỉ để hiện / ẩn dòng nhắc). */
  setInfinite(on: boolean): void;
  focus(): void;
}

export function createGenPanel(ds: Dataset, initial: DepotGen, infinite: boolean, onChange: (g: DepotGen) => void, onInfinite: (on: boolean) => void): GenPanel {
  const gen: DepotGen = { ...initial };
  const items = [...ds.items.values()].filter((i) => i.phase === 'solid').sort((a, b) => itemName(ds, a.id).localeCompare(itemName(ds, b.id)));
  const search = el('input', { class: 'bp-search sim-gen-search', type: 'search', placeholder: tr('Tìm vật phẩm…') });
  const note = el('div', { class: 'sim-gen-note' }, tr('Đang bật "Kho tổng vô hạn" — tắt đi thì sản lượng tự sinh mới có tác dụng.'));
  const left = el('div', { class: 'sim-gen-list' });
  const right = el('div', { class: 'sim-gen-list' });
  const leftHead = el('div', { class: 'sim-gen-col-head on' });
  const rightHead = el('div', { class: 'sim-gen-col-head' });
  // ô tick "Kho tổng vô hạn" nằm ngay trong bảng này (người dùng 2026-10-04 — chuyển từ thanh điều khiển vào đây)
  const infBox = el('input', { type: 'checkbox', checked: infinite });
  infBox.addEventListener('change', () => onInfinite(infBox.checked));
  const root = el(
    'div',
    { class: 'sim-gen', role: 'dialog' },
    el(
      'div',
      { class: 'sim-gen-top' },
      el('div', { class: 'sim-gen-title' }, tr('Kho tổng tự sinh (mỗi phút)')),
      el('label', { class: 'sim-depot sim-gen-inf', title: tr('Kho tổng nhận hàng kể cả khi đầy và luôn có đủ mọi món để rút. Tắt ⇒ mỗi món chứa tối đa 80 000. Đổi ⇒ chạy lại từ đầu.') }, infBox, tr('Kho tổng vô hạn')),
    ),
    note,
    search,
    el('div', { class: 'sim-gen-cols' }, el('div', { class: 'sim-gen-col' }, leftHead, left), el('div', { class: 'sim-gen-col' }, rightHead, right)),
  );
  // gõ trong bảng không được kích hoạt phím tắt của bản vẽ
  root.addEventListener('keydown', (e) => e.stopPropagation());

  const row = (id: string): HTMLElement => {
    const v = gen[id] ?? 0;
    const input = el('input', { class: 'sim-gen-input', type: 'number', min: '0', step: '1', value: v > 0 ? String(v) : '', placeholder: '0', title: tr('Số mỗi phút tự có thêm trong kho tổng') });
    input.addEventListener('change', () => {
      const n = Math.max(0, Number(input.value) || 0);
      const was = (gen[id] ?? 0) > 0;
      if (n > 0) gen[id] = Math.round(n * 100) / 100;
      else delete gen[id];
      onChange({ ...gen });
      if (was !== n > 0) moveAnimated(id);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
    return el(
      'div',
      { class: `sim-gen-row${v > 0 ? ' on' : ''}`, 'data-id': id },
      el('img', { src: `img/itemicon/${ds.items.get(id)?.icon ?? id}.png`, alt: '' }),
      el('span', { class: 'sim-gen-name', title: itemName(ds, id) }, itemName(ds, id)),
      input,
      el('span', { class: 'sim-gen-unit' }, tr('/ph')),
    );
  };

  const render = (): void => {
    const q = fold(search.value.trim());
    const match = (id: string): boolean => !q || fold(itemName(ds, id)).includes(q) || id.includes(q);
    const on = items.filter((i) => (gen[i.id] ?? 0) > 0);
    const off = items.filter((i) => !((gen[i.id] ?? 0) > 0));
    clear(left);
    clear(right);
    for (const i of on) if (match(i.id)) left.append(row(i.id));
    for (const i of off) if (match(i.id)) right.append(row(i.id));
    leftHead.textContent = tr('Có tự sinh ({0})', on.length);
    rightHead.textContent = tr('Không tự sinh ({0})', off.length);
    if (!left.childElementCount) left.append(el('div', { class: 'sim-gen-empty' }, tr('Nhập số ở cột bên phải để món đó tự sinh vào kho tổng.')));
  };

  /** Món vừa đổi cột: mọi dòng trượt từ chỗ cũ tới chỗ mới; dòng đổi cột bay ngang sang cột kia (FLIP). */
  const moveAnimated = (id: string): void => {
    const before = new Map<string, DOMRect>();
    for (const r of root.querySelectorAll<HTMLElement>('.sim-gen-row')) before.set(r.dataset.id!, r.getBoundingClientRect());
    render();
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    for (const r of root.querySelectorAll<HTMLElement>('.sim-gen-row')) {
      const b = before.get(r.dataset.id!);
      if (!b) continue;
      const a = r.getBoundingClientRect();
      const dx = b.left - a.left;
      const dy = b.top - a.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      const moved = r.dataset.id === id;
      r.animate(
        moved
          ? [
              { transform: `translate(${dx}px, ${dy}px)`, boxShadow: '0 6px 18px rgba(0,0,0,0.45)' },
              { transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(1.04)`, offset: 0.5 },
              { transform: 'none', boxShadow: '0 0 0 rgba(0,0,0,0)' },
            ]
          : [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: moved ? 420 : 260, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
      if (moved) {
        r.classList.add('just-moved');
        setTimeout(() => r.classList.remove('just-moved'), 900);
        r.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  search.addEventListener('input', render);
  let inf = infinite;
  const drawNote = (): void => {
    note.hidden = !inf;
  };
  drawNote();
  render();
  return {
    el: root,
    setInfinite(on) {
      inf = on;
      infBox.checked = on;
      drawNote();
    },
    focus() {
      autoFocus(search, { preventScroll: true });
    },
  };
}
