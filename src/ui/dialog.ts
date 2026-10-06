import { el } from './dom';
import { tr } from '../i18n';

/**
 * Hộp hỏi lại dùng chung (ngoài cửa sổ Bản vẽ): chữ + Huỷ / nút đồng ý. Esc = huỷ. Trong lúc mở,
 * `body.modal-open` chặn phím tắt của bản vẽ.
 */
export function confirmDialog(text: string, ok: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = el('div', { class: 'bp-overlay confirm' });
    const done = (v: boolean): void => {
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (!document.querySelector('.bp-overlay')) document.body.classList.remove('modal-open');
      resolve(v);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        done(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        done(true);
      }
    };
    overlay.append(
      el(
        'div',
        { class: 'bp-dialog small' },
        el('div', { class: 'bp-dialog-text' }, text),
        el(
          'div',
          { class: 'bp-dialog-buttons' },
          el('button', { class: 'tool', onclick: () => done(false) }, tr('Huỷ')),
          el('button', { class: 'tool danger', onclick: () => done(true) }, ok),
        ),
      ),
    );
    window.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    document.body.classList.add('modal-open');
  });
}
