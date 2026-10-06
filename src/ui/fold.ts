import { el } from './dom';
import { tr } from '../i18n';

/**
 * **Bảng thu gọn được** trong bảng tổng hợp (người dùng 2026-10-04 cho mô phỏng; 2026-10-05 thêm hiệu ứng và dùng cho
 * cả bảng tổng hợp Map thường): tên bảng có dấu − (đang mở) / + (đang thu gọn) phía trước, bấm để thu gọn / mở.
 * - Dấu vẽ bằng hai vạch CSS: vạch đứng xoay nằm xuống ⇒ "+" biến thành "−" có chuyển động.
 * - Phần nội dung co / giãn bằng `grid-template-rows` 1fr ⇄ 0fr (cùng cách với biểu đồ mô phỏng), mờ dần.
 * Chỉ đổi class — không dựng lại nội dung, nên hiệu ứng chạy cả khi bảng đang được cập nhật số liệu.
 */
export interface Fold {
  /** nút tên bảng */
  readonly head: HTMLButtonElement;
  /** khung co giãn (đặt sau `head`) */
  readonly wrap: HTMLElement;
  /** nơi đặt nội dung bảng */
  readonly content: HTMLElement;
  readonly shut: boolean;
  set(shut: boolean): void;
}

export function createFold(title: string, shut: boolean, onToggle: (shut: boolean) => void): Fold {
  const head = el('button', { class: 'section fold-sec', type: 'button' }, el('span', { class: 'fold-sign', 'aria-hidden': 'true' }), title) as HTMLButtonElement;
  const content = el('div', { class: 'fold-inner' });
  const wrap = el('div', { class: 'fold-body' }, content);
  let cur = !shut;
  const fold: Fold = {
    head,
    wrap,
    content,
    get shut() {
      return cur;
    },
    set(v) {
      if (v === cur) return;
      cur = v;
      head.classList.toggle('shut', v);
      wrap.classList.toggle('shut', v);
      head.title = v ? tr('Mở bảng') : tr('Thu gọn bảng');
      head.setAttribute('aria-expanded', String(!v));
    },
  };
  fold.set(shut);
  head.addEventListener('click', () => {
    fold.set(!cur);
    onToggle(cur);
  });
  return fold;
}

/** Danh sách bảng đang thu gọn, nhớ trong trình duyệt theo `key`. */
export function foldMemory(key: string): { has(id: string): boolean; set(id: string, shut: boolean): void } {
  let ids: Set<string>;
  try {
    ids = new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    ids = new Set<string>();
  }
  return {
    has: (id) => ids.has(id),
    set(id, shut) {
      if (shut) ids.add(id);
      else ids.delete(id);
      try {
        localStorage.setItem(key, JSON.stringify([...ids]));
      } catch {
        /* không lưu được thì thôi */
      }
    },
  };
}
