import { LOCALES, lang, setLang, tr } from '../i18n';
import { el } from './dom';
import { applyTheme, currentTheme, type Theme } from './theme';
import { prefs, setPref } from './prefs';
import { APP_VERSION, DOWNLOAD, RELEASES_URL } from '../buildFlags';
import { isNativeApp } from '../platform';

const GEAR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
/** Biểu tượng nút tải app (người dùng 2026-10-07: dùng biểu tượng thay cho chữ). */
const WINDOWS_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5.6 10.4 4.6v7H3zM11.4 4.4 21 3v8.6h-9.6zM3 12.4h7.4v7L3 18.4zM11.4 12.4H21V21l-9.6-1.4z"/></svg>';
const ANDROID_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M2.6 18.6a9.4 9.4 0 0 1 18.8 0zM7.3 15.2a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0zM14.5 15.2a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0z"/><path d="M7.4 10.6 5.6 7.4M16.6 10.6l1.8-3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const GITHUB_ICON =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';
/** Đã mở bảng Cài đặt lần nào chưa — chưa ⇒ chấm đỏ trên bánh răng (người dùng 2026-10-07). */
const SEEN_KEY = 'efp:settings-seen';
const seenSettings = (): boolean => {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // không đọc được bộ nhớ thì thôi, không làm phiền
  }
};
/** Chấm đỏ "ping" (chấm + vòng lan ra). */
const ping = (cls: string): HTMLElement => el('span', { class: `set-ping ${cls}`, 'aria-hidden': 'true' });

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

  /**
   * Dòng cuối: **số phiên bản** + (chỉ bản web) **nút tải app** Windows / Android (người dùng 2026-10-06). File lấy từ
   * bản phát hành mới nhất trên GitHub (`buildFlags.ts` `DOWNLOAD`). Trong exe / apk chỉ hiện số phiên bản.
   */
  const appRow = (): HTMLElement => {
    const inApp = '__TAURI_INTERNALS__' in window || isNativeApp();
    // nút biểu tượng Windows / Android / GitHub thay cho chữ (người dùng 2026-10-07)
    const link = (href: string, icon: string, title: string): HTMLElement => {
      const a = el('a', { class: 'tool small set-dl', href, target: '_blank', rel: 'noopener', title, 'aria-label': title });
      a.innerHTML = icon;
      return a;
    };
    return el(
      'div',
      { class: 'set-row set-app' },
      el('span', { class: 'set-ver', title: tr('Phiên bản') }, `v${APP_VERSION}`),
      inApp
        ? null
        : el(
            'span',
            { class: 'set-dl-group' },
            // chấm đỏ ở góc trái trên chữ "T" (người dùng 2026-10-07)
            el('span', { class: 'set-dl-head' }, ping('set-ping-dl'), tr('Tải app:')),
            link(DOWNLOAD.windows, WINDOWS_ICON, tr('Tải bộ cài Windows (.exe) bản mới nhất')),
            link(DOWNLOAD.android, ANDROID_ICON, tr('Tải app Android (.apk) bản mới nhất')),
            link(RELEASES_URL, GITHUB_ICON, tr('Trang các bản phát hành trên GitHub')),
          ),
    );
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
      appRow(),
    );
    const r = gear.getBoundingClientRect();
    panel.style.right = `${Math.round(window.innerWidth - r.right)}px`;
    panel.style.bottom = `${Math.round(window.innerHeight - r.top + 4)}px`;
    document.body.append(panel);
    gear.classList.add('open');
    // đã mở Cài đặt ⇒ tắt chấm đỏ trên bánh răng, nhớ mãi
    gearPing?.remove();
    gearPing = null;
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* không lưu được thì lần sau chấm lại hiện */
    }
    window.addEventListener('mousedown', outside, true);
  };

  const gear = el('button', {
    class: 'tb-settings',
    title: tr('Cài đặt'),
    onclick: () => (panel ? close() : open()),
  });
  gear.innerHTML = GEAR;
  // chưa mở Cài đặt lần nào ⇒ chấm đỏ trên bánh răng (chỉ bản web — nơi có mục Tải app, *suy luận*)
  let gearPing: HTMLElement | null = null;
  const inApp = '__TAURI_INTERNALS__' in window || isNativeApp();
  if (!inApp && !seenSettings()) gear.append((gearPing = ping('set-ping-gear')));
  root.append(gear);
}

/** Một dòng ô tick cho bảng Cài đặt (dùng cho các dòng thêm của bản điện thoại). */
export function settingsCheck(label: string, title: string, on: boolean, set: (v: boolean) => void): HTMLElement {
  const box = el('input', { type: 'checkbox' });
  box.checked = on;
  box.addEventListener('change', () => set(box.checked));
  return el('label', { class: 'set-row set-check-row', title }, box, el('span', {}, label));
}
