import { setSceneTheme } from '../render/renderer';

/**
 * **Giao diện tối / sáng** (người dùng 2026-10-02). Màu của khung giao diện nằm ở biến CSS (`:root` trong
 * `style.css`, bản sáng ở `:root[data-theme='light']`); nền bản vẽ (canvas) đổi qua `setSceneTheme`. Nhớ
 * lựa chọn trong trình duyệt (`efp:theme`); mặc định giữ giao diện tối như trước.
 */
export type Theme = 'dark' | 'light';

const THEME_KEY = 'efp:theme';

export function loadTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/** Áp giao diện cho cả trang; `save` = nhớ lại cho lần mở sau. */
export function applyTheme(theme: Theme, save = false): void {
  document.documentElement.dataset.theme = theme;
  setSceneTheme(theme);
  if (!save) return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* không lưu được thì thôi */
  }
}
