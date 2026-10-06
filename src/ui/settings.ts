import { LOCALES, lang, setLang, tr } from '../i18n';
import { el } from './dom';
import { applyTheme, currentTheme, type Theme } from './theme';
import { prefs, setPref } from './prefs';

const GEAR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const SUN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
const MOON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/></svg>';

/**
 * Nút **Cài đặt** (bánh răng) ở góc phải thanh tab — bấm mở bảng cài đặt sổ lên trên (người dùng 2026-10-03: các mục
 * cài đặt nằm **trong** bảng này, sau này còn thêm mục mới — mỗi mục một dòng `.set-row`). Dòng đầu: giao diện +
 * ngôn ngữ trên cùng một dòng:
 *  - nút vuông bo góc **mặt trời** (đang sáng) / **mặt trăng** (đang tối) — bấm để đổi, hai icon xoay / thu phóng
 *    chuyển sang nhau (CSS `.tb-theme.light`);
 *  - ô **ngôn ngữ** thả xuống, danh sách **sổ lên trên** gồm mọi ngôn ngữ trong `LOCALES` (chọn xong tải lại trang —
 *    các tab đã tự lưu trước khi tải lại, xem `beforeunload` ở `main.ts`).
 */
export function mountSettings(root: HTMLElement, onTheme: () => void, extraRows?: () => HTMLElement[]): void {
  let panel: HTMLElement | null = null;
  let langMenu: HTMLElement | null = null;

  const closeLang = (): void => {
    langMenu?.remove();
    langMenu = null;
    panel?.querySelector('.tb-lang')?.classList.remove('open');
  };
  const close = (): void => {
    closeLang();
    panel?.remove();
    panel = null;
    gear.classList.remove('open');
    window.removeEventListener('mousedown', outside, true);
  };
  const outside = (e: MouseEvent): void => {
    const t = e.target as Node;
    if (langMenu?.contains(t)) return;
    if (panel?.contains(t)) {
      if (langMenu && !(t instanceof Element && t.closest('.tb-lang'))) closeLang();
      return;
    }
    if (gear.contains(t)) return;
    close();
  };

  /** Nút sáng / tối: chứa cả hai icon, lớp `light` quyết định icon nào đang hiện (chuyển bằng animation CSS). */
  const themeButton = (): HTMLElement => {
    const btn = el('button', { class: 'tb-theme' });
    btn.innerHTML = `<span class="tb-theme-ic sun">${SUN}</span><span class="tb-theme-ic moon">${MOON}</span>`;
    const draw = (): void => {
      const light = currentTheme() === 'light';
      btn.classList.toggle('light', light);
      btn.title = light ? tr('Giao diện sáng — bấm để chuyển sang tối') : tr('Giao diện tối — bấm để chuyển sang sáng');
    };
    btn.addEventListener('click', () => {
      const next: Theme = currentTheme() === 'light' ? 'dark' : 'light';
      applyTheme(next, true);
      draw();
      onTheme();
    });
    draw();
    return btn;
  };

  const langButton = (): HTMLElement => {
    const btn = el(
      'button',
      { class: 'tb-lang', title: tr('Ngôn ngữ') },
      el('span', { class: 'tb-lang-label' }, lang().label),
      el('span', { class: 'tb-lang-caret' }, '▴'),
    );
    btn.addEventListener('click', () => {
      if (langMenu) return closeLang();
      langMenu = el(
        'div',
        { class: 'tb-menu lang-menu' },
        ...LOCALES.map((l) => {
          const on = l.code === lang().code;
          return el(
            'button',
            {
              class: `tb-menu-item set-opt${on ? ' on' : ''}`,
              onclick: () => {
                close();
                if (on) return;
                setLang(l.code);
                location.reload();
              },
            },
            el('span', { class: 'set-check' }, on ? '✓' : ''),
            el('span', {}, l.label),
          );
        }),
      );
      const r = btn.getBoundingClientRect();
      langMenu.style.left = `${Math.round(r.left)}px`;
      langMenu.style.bottom = `${Math.round(window.innerHeight - r.top + 4)}px`;
      langMenu.style.minWidth = `${Math.round(r.width)}px`;
      document.body.append(langMenu);
      btn.classList.add('open');
    });
    return btn;
  };

  /** Một dòng ô tick. */
  const check = (label: string, title: string, on: boolean, set: (v: boolean) => void): HTMLElement => {
    const box = el('input', { type: 'checkbox' });
    box.checked = on;
    box.addEventListener('change', () => set(box.checked));
    return el('label', { class: 'set-row set-check-row', title }, box, el('span', {}, label));
  };

  /** Thanh gạt hai nấc: nền đơn giản (nền phẳng hiện tại) / nền cỏ (nền nhà máy của EnKAD). */
  const groundToggle = (): HTMLElement => {
    const opts: [('simple' | 'grass'), string][] = [
      ['simple', tr('Nền đơn giản')],
      ['grass', tr('Nền cỏ')],
    ];
    const wrap = el('div', { class: 'set-seg', role: 'radiogroup', title: tr('Nền bản vẽ') });
    const draw = (): void => {
      for (const b of wrap.children) b.classList.toggle('on', (b as HTMLElement).dataset.v === prefs().ground);
      wrap.classList.toggle('right', prefs().ground === 'grass');
    };
    for (const [v, label] of opts)
      wrap.append(
        el('button', { class: 'set-seg-opt', 'data-v': v, role: 'radio', onclick: () => (setPref('ground', v), draw(), onTheme()) }, label),
      );
    draw();
    return el('div', { class: 'set-row' }, wrap);
  };

  const open = (): void => {
    panel = el(
      'div',
      { class: 'tb-menu set-menu' },
      el('div', { class: 'set-head' }, tr('Cài đặt')),
      // dòng 1: giao diện sáng / tối + ngôn ngữ
      el('div', { class: 'set-row' }, themeButton(), langButton()),
      // người dùng 2026-10-05: tooltip, nền bản vẽ, con trỏ ô (`ui/prefs.ts`)
      check(tr('Không hiện tooltip'), tr('Tắt chữ nổi khi rê chuột lên nút / máy / ô'), prefs().noTooltips, (v) => setPref('noTooltips', v)),
      groundToggle(),
      check(tr('Con trỏ ô'), tr('Bật: rê chuột tới ô nào trên Map thì hiện khung ô đó. Tắt: không hiện gì'), prefs().pointer, (v) => setPref('pointer', v)),
      // bản điện thoại: nhạc nền, hiện tên máy, kiểm tra tầm điện chuyển vào đây (người dùng 2026-10-05)
      ...(extraRows?.() ?? []),
    );
    const r = gear.getBoundingClientRect();
    panel.style.right = `${Math.round(window.innerWidth - r.right)}px`;
    panel.style.bottom = `${Math.round(window.innerHeight - r.top + 4)}px`;
    document.body.append(panel);
    gear.classList.add('open');
    window.addEventListener('mousedown', outside, true);
  };

  const gear = el('button', {
    class: 'tb-settings',
    title: tr('Cài đặt'),
    onclick: () => (panel ? close() : open()),
  });
  gear.innerHTML = GEAR;
  root.append(gear);
}

/** Một dòng ô tick cho bảng Cài đặt (dùng cho các dòng thêm của bản điện thoại). */
export function settingsCheck(label: string, title: string, on: boolean, set: (v: boolean) => void): HTMLElement {
  const box = el('input', { type: 'checkbox' });
  box.checked = on;
  box.addEventListener('change', () => set(box.checked));
  return el('label', { class: 'set-row set-check-row', title }, box, el('span', {}, label));
}
