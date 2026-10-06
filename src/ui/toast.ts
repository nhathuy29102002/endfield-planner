import { el } from './dom';

/**
 * Cảnh báo nổi giữa phía trên bản vẽ, tự tắt sau vài giây. Dùng cho lỗi người dùng cần
 * thấy ngay (vd. đặt bản vẽ vào chỗ vướng) — thanh trạng thái dưới đáy dễ bị bỏ qua.
 */
let host: HTMLElement | null = null;

export function toast(text: string, kind: 'warn' | 'info' = 'warn'): void {
  if (typeof document === 'undefined') return;
  host ??= document.body.appendChild(el('div', { class: 'toast-host' }));
  const node = el('div', { class: `toast ${kind}` }, text);
  host.append(node);
  setTimeout(() => node.classList.add('out'), 2600);
  setTimeout(() => node.remove(), 3000);
}
