/**
 * Bộ lọc phím tắt cho người dùng **đang bật bộ gõ tiếng Việt** (Unikey, EVKey, Telex/VNI
 * của Windows).
 *
 * Bộ gõ can thiệp vào phím theo hai kiểu, cả hai đều làm hỏng phím tắt nếu đọc `e.key`:
 *  1. Bộ gõ kiểu IME (Telex của Windows): phím đang ghép chữ tới với `key = 'Process'`
 *     (keyCode 229) — nhưng `e.code` vẫn là phím vật lý (`KeyW`…).
 *  2. Bộ gõ kiểu "gửi lại" (Unikey, EVKey): nuốt phím thật, gửi **Backspace** xoá ký tự cũ
 *     rồi gửi ký tự đã bỏ dấu (`ư`, `đ`, `á`…) dưới dạng ký tự Unicode — lúc đó `e.code`
 *     rỗng. Gõ W thành `ư`, gõ D hai lần thành Backspace + `đ`: không lọc thì W không di
 *     chuyển được, còn Backspace thì **xoá mất máy đang chọn**.
 *
 * Cách lọc: ưu tiên phím vật lý (`e.code`); ký tự tiếng Việt do bộ gõ gửi thì suy ngược ra
 * phím đã bấm theo kiểu Telex (dấu sắc ⇒ S, `ư` ⇒ W, `đ` ⇒ D…); Backspace thì hoãn một chút,
 * nếu ngay sau đó có ký tự do bộ gõ gửi tới thì đó là Backspace của bộ gõ ⇒ bỏ qua.
 * Ô nhập chữ (tìm kiếm, tên bản vẽ) không đi qua đây nên vẫn gõ tiếng Việt bình thường.
 */

/** Dấu thanh (dạng tổ hợp sau khi tách NFD) → phím Telex tạo ra nó. */
const TONE_KEY: Record<string, string> = {
  '́': 's', // sắc
  '̀': 'f', // huyền
  '̉': 'r', // hỏi
  '̃': 'x', // ngã
  '̣': 'j', // nặng
};

/**
 * Ký tự tiếng Việt do bộ gõ gửi → phím Telex vừa bấm để ra nó, hoặc `null` nếu không phải
 * chữ tiếng Việt. Có dấu thanh thì phím vừa bấm là phím dấu (á ⇐ S); không có thì theo dấu
 * mũ/móc (ư, ơ, ă ⇐ W; â ⇐ A; ê ⇐ E; ô ⇐ O; đ ⇐ D).
 */
export function telexKey(ch: string): string | null {
  if (ch.length !== 1) return null;
  const lower = ch.toLowerCase();
  if (lower === 'đ') return 'd';
  const parts = lower.normalize('NFD');
  for (const mark of parts.slice(1)) {
    const tone = TONE_KEY[mark];
    if (tone) return tone;
  }
  if (parts.includes('̛') || parts.includes('̆')) return 'w'; // móc (ư, ơ), trăng (ă)
  if (parts.includes('̂')) return parts[0] ?? null; // mũ: â ê ô ⇐ gõ lại a/e/o
  return null;
}

/** Phím này do bộ gõ gửi (không phải phím vật lý)? */
export function isInjected(e: Pick<KeyboardEvent, 'code' | 'key'>): boolean {
  return e.code === '' || e.code === 'Unidentified';
}

/**
 * Tên phím tắt đã chuẩn hoá (chữ thường, `escape`, `backspace`, `arrowup`, `space`…) hoặc
 * `null` nếu không nhận ra.
 */
export function hotkeyOf(e: Pick<KeyboardEvent, 'code' | 'key'>): string | null {
  const code = e.code ?? '';
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1]!.toLowerCase();
  m = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (m) return m[1]!;
  if (code === 'Space') return 'space';
  const key = e.key ?? '';
  if (key === 'Process' || key === 'Unidentified' || key === 'Dead') return null;
  if (key.length === 1) {
    if (/^[\x20-\x7e]$/.test(key)) return key === ' ' ? 'space' : key.toLowerCase();
    return telexKey(key);
  }
  return key.toLowerCase();
}

/** Backspace đợi chừng này ms xem có phải của bộ gõ (theo sau là ký tự gửi lại) không. */
export const BACKSPACE_HOLD_MS = 60;

/** Phím di chuyển do bộ gõ gửi không có keyup tin được ⇒ tự nhả sau chừng này ms. */
export const INJECTED_HOLD_MS = 450;
