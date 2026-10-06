/**
 * Nơi ứng dụng đang chạy (người dùng 2026-10-05: bản **app Android** đóng gói bằng Capacitor, `android/`).
 * Capacitor tự gắn `window.Capacitor` vào WebView của app ⇒ không cần nhập thư viện ở đây (mã chạy test trong Node
 * vẫn dùng được file này).
 */
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
}

const cap = (): CapacitorGlobal | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;

/** Đang chạy trong app Android (Capacitor), không phải trình duyệt / Tauri. */
export const isNativeApp = (): boolean => !!cap()?.isNativePlatform?.();

/** Plugin gốc của app (Capacitor) theo tên — `undefined` ngoài app. */
export const nativePlugin = <T>(name: string): T | undefined => (isNativeApp() ? (cap()?.Plugins?.[name] as T | undefined) : undefined);

/**
 * Giao diện cảm ứng: trong app Android, hoặc thiết bị chỉ có màn cảm ứng (không chuột). Bật lớp `touch-ui` trên
 * `<html>` (CSS bố cục điện thoại) và các cử chỉ ở `ui/touch.ts`.
 */
export const isTouchUI = (): boolean =>
  isNativeApp() ||
  (typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(any-pointer: fine)').matches);

/**
 * Đặt con trỏ vào ô tìm kiếm khi mở hộp — **trừ trên điện thoại**: ở đó việc này bật bàn phím ảo che nửa màn hình
 * (người dùng 2026-10-05: "không tự động bật bàn phím, tại tất cả vị trí có thanh tìm kiếm"). Bấm vào ô thì vẫn gõ được.
 */
export function autoFocus(el: HTMLElement | null | undefined, opts?: FocusOptions): void {
  if (!el || isTouchUI()) return;
  el.focus(opts);
}
