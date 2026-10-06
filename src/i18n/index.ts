/**
 * **Đa ngôn ngữ** (người dùng 2026-10-02: "làm theo hướng module để tương lai thêm ngôn ngữ khác dễ dàng").
 *
 * Cách dùng trong mã: bọc chữ hiển thị bằng `tr('Chữ tiếng Việt')`. Tiếng Việt là **ngôn ngữ gốc**: chính câu
 * tiếng Việt là khoá tra cứu (kiểu gettext) ⇒ mã vẫn đọc được như cũ, ngôn ngữ gốc không cần file dịch.
 * Chỗ trống trong câu viết `{0}`, `{1}`…: `tr('{0} máy', n)`.
 *
 * **Thêm một ngôn ngữ** (vd. tiếng Nhật):
 *  1. Chép `locales/en.ts` thành `locales/ja.ts`, đổi `code`, `label`, `htmlLang`, `gameNames`, dịch từng dòng
 *     (giữ nguyên `{0}`, `{1}`…). Dòng nào chưa dịch thì bỏ đi — sẽ hiện tiếng Việt.
 *  2. Thêm `ja` vào mảng `LOCALES` bên dưới.
 *  3. `npm test`: `tests/i18n.test.ts` liệt kê câu nào trong mã còn thiếu bản dịch.
 *  `npm run i18n` in ra mọi câu cần dịch (mẫu cho ngôn ngữ mới).
 *
 * Tên máy / vật tư lấy từ dữ liệu game (`nameVi`, `nameEn`) — xem `gameNames` và `localName`.
 * Đổi ngôn ngữ thì **tải lại trang** (mọi tab đã tự lưu trước khi tải lại): chữ được dịch ngay lúc dựng
 * giao diện, kể cả các bảng hằng ở cấp module, nên không phải viết lại từng phần cho "đổi nóng".
 */
import { vi } from './locales/vi';
import { en } from './locales/en';

export interface Locale {
  /** Mã ngôn ngữ, lưu trong trình duyệt (`efp:lang`). */
  code: string;
  /** Tên hiển thị trong menu chọn ngôn ngữ — viết bằng chính ngôn ngữ đó. */
  label: string;
  /** Giá trị `<html lang>`. */
  htmlLang: string;
  /** Tên máy / vật tư trong dữ liệu game dùng bản nào (dữ liệu hiện có `vi` và `en`). */
  gameNames: 'vi' | 'en';
  /** Câu tiếng Việt → câu dịch. Ngôn ngữ gốc để trống. */
  strings: Record<string, string>;
}

/** Mọi ngôn ngữ có trong app — thứ tự trong menu. Ngôn ngữ đầu tiên là ngôn ngữ gốc. */
export const LOCALES: readonly Locale[] = [vi, en];
export const SOURCE_LOCALE = vi;

const LANG_KEY = 'efp:lang';

function stored(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

/** Ngôn ngữ đã chọn lần trước; chưa chọn bao giờ ⇒ tiếng Việt (ngôn ngữ gốc). */
function initial(): Locale {
  const code = stored();
  const saved = LOCALES.find((l) => l.code === code);
  if (saved) return saved;
  return SOURCE_LOCALE;
}

let current: Locale = initial();

export const lang = (): Locale => current;

/** Đổi ngôn ngữ và nhớ lại. Giao diện chỉ đổi hết sau khi tải lại trang (xem đầu file). */
export function setLang(code: string): void {
  const next = LOCALES.find((l) => l.code === code);
  if (!next) return;
  current = next;
  try {
    localStorage.setItem(LANG_KEY, code);
  } catch {
    /* không lưu được thì thôi */
  }
}

const fill = (text: string, args: readonly unknown[]): string =>
  args.length === 0 ? text : text.replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m));

/** Dịch một câu tiếng Việt sang ngôn ngữ đang chọn; chưa có bản dịch ⇒ giữ tiếng Việt. */
export function tr(text: string, ...args: unknown[]): string {
  return fill(current.strings[text] ?? text, args);
}

/** Tên hiển thị của một máy / vật tư theo ngôn ngữ đang chọn. */
export function localName(def: { name: string; nameVi?: string; nameEn?: string }): string {
  if (current.gameNames === 'en') return def.nameEn ?? def.name;
  return def.nameVi ?? def.name;
}

/** Tên ở ngôn ngữ còn lại (hiện kèm trong chú thích để dễ tra cứu) — không có thì `undefined`. */
export function otherName(def: { name: string; nameVi?: string; nameEn?: string }): string | undefined {
  const other = current.gameNames === 'en' ? def.nameVi : def.nameEn;
  return other && other !== def.name ? other : undefined;
}
