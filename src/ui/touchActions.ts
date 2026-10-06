import type { AppState } from '../editor/state';
import { selectionSize } from '../editor/group';
import { el } from './dom';
import { pressKey, touchModes } from './touch';
import type { MapTouch } from './touchMap';
import { MACHINE_MODE_ICONS, modeIconSvg } from './modeIcons';
import { tr } from '../i18n';

/**
 * **Thanh thao tác bên phải** của app Android (người dùng 2026-10-05, lần 2) — **thay** cột công cụ bên phải (dock) khi:
 *  - đang **đặt máy mới** (đã chọn máy ở bảng chọn máy): Đặt ✓ · Xoay ⟳ · Huỷ ✕;
 *  - đang **chọn** một máy / một nhóm: Đặt (tắt) · Xoay · Huỷ chọn · Sao chép · Di chuyển · Chọn thêm · Chọn vùng, thêm
 *    Xoá và Lưu bản vẽ (*đề xuất thêm* — để không mất hai tính năng của cột cũ);
 *  - đang **di chuyển / sao chép** (preview): chỉ 3 nút đầu dùng được;
 *  - đang **vẽ băng / ống**: chỉ Đặt và Huỷ sáng.
 * Ba nút đầu luôn cùng thứ tự Đặt · Xoay · Huỷ (*suy luận*: người dùng kể "Đặt, Huỷ, Xoay" cho lúc đặt máy nhưng "đặt,
 * xoay, huỷ chọn" cho lúc chọn — dùng một thứ tự cho quen tay).
 *
 * **Thanh chọn chế độ** ở trên cùng: máy (đang đặt / đang chọn / đang dời — một máy) có hai chế độ ⇒ thanh trượt như
 * trong cửa sổ máy (icon EnKAD, con lăn vàng); bấm nửa kia = đổi chế độ (phím Tab).
 */
const ICON: Record<string, string> = {
  commit: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  cancel: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  copy: '<rect class="ta-page" x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  add: '<rect x="3" y="3" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M17 12v8M13 16h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="3.2 2.4"/>',
  remove: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  save: '<path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 4v5h7V4M8 20v-6h8v6" fill="none" stroke="currentColor" stroke-width="1.8"/>',
};

type Ctx = 'none' | 'place' | 'moving' | 'selected' | 'link';

export function mountTouchActions(
  host: HTMLElement,
  app: HTMLElement,
  state: AppState,
  map: MapTouch,
  hooks: { saveSelection(): void },
): () => void {
  const bar = el('div', { class: 'touch-actions' });
  const modeBar = el('div', { class: 'touch-modebar', hidden: true });
  const btn = (icon: string, label: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', { class: 'ta-btn', type: 'button', 'data-act': icon }) as HTMLButtonElement;
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[icon]}</svg>`;
    b.append(el('span', { class: 'ta-label' }, label));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  };
  const commit = btn('commit', tr('Đặt'), () => map.commit());
  const rotate = btn('rotate', tr('Xoay'), () => map.rotate());
  const cancel = btn('cancel', tr('Huỷ'), () => map.cancel());
  // nút thứ 4: lúc chọn = Sao chép; lúc đang đặt / dời / sao chép = **Đặt tiếp** (bật thì trang giấy phía trước tô kín —
  // đặt xong vẫn cầm thứ vừa đặt; người dùng 2026-10-06)
  const copy = btn('copy', tr('Sao chép'), () => {
    const c = ctxNow();
    if (c === 'place' || c === 'moving') {
      touchModes.keep = !touchModes.keep;
      touchModes.changed();
    } else map.copy();
  });
  const move = btn('move', tr('Di chuyển'), () => map.move());
  const add = btn('add', tr('Chọn thêm'), () => {
    touchModes.add = !touchModes.add;
    touchModes.changed();
  });
  const box = btn('box', tr('Chọn vùng'), () => {
    touchModes.box = !touchModes.box;
    touchModes.changed();
  });
  const remove = btn('remove', tr('Xoá'), () => map.remove());
  const save = btn('save', tr('Lưu'), () => hooks.saveSelection());
  commit.classList.add('primary');
  /**
   * Chế độ đặt băng / ống: thêm 4 công trình logistic cùng loại (người dùng 2026-10-05, lần 3) — gộp, tách, cảng kiểm soát
   * (bộ lọc của game) và cầu nối; ẩn khi đang vẽ dở đường, hiện lại khi đã đặt xong mà chưa thoát. Bấm ⇒ cầm công trình
   * đó để đặt.
   */
  const LOGI: Record<'belt' | 'pipe', [string, string][]> = {
    belt: [['log_converger', tr('Gộp')], ['log_splitter', tr('Tách')], ['log_conditioner', tr('Kiểm soát')], ['log_connector', tr('Cầu nối')]],
    pipe: [['log_pipe_converger', tr('Gộp')], ['log_pipe_splitter', tr('Tách')], ['log_pipe_conditioner', tr('Kiểm soát')], ['log_pipe_connector', tr('Cầu nối')]],
  };
  const logiBox = el('div', { class: 'ta-logi' });
  let logiKind = '';
  const renderLogi = (): void => {
    const t = state.tool;
    const kind = t.kind === 'link' ? t.linkKind : null;
    logiBox.hidden = !kind || !(map.path?.empty ?? true);
    if (!kind || kind === logiKind) return;
    logiKind = kind;
    logiBox.textContent = '';
    for (const [id, label] of LOGI[kind]) {
      const def = state.ds.machines.get(id);
      const b = el('button', { class: 'ta-btn ta-logi-btn', type: 'button', title: def?.name ?? id }, el('img', { src: `img/items/${def?.icon ?? id}.png`, alt: '' }), el('span', { class: 'ta-label' }, label));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        map.placeMachine(id);
      });
      logiBox.append(b);
    }
  };
  // 5 nút dưới (Di chuyển … Lưu) nằm trong một khối co / giãn được: chọn máy rồi bấm Sao chép / cầm máy mới ⇒ chỉ khối này
  // rụt lại, 4 nút trên (Đặt · Xoay · Huỷ · Sao chép/Đặt tiếp) đứng yên (người dùng 2026-10-06)
  const more = el('div', { class: 'ta-more' }, el('div', { class: 'ta-more-inner' }, move, add, box, remove, save));
  bar.append(commit, rotate, cancel, logiBox, el('div', { class: 'ta-sep' }), copy, more);
  bar.classList.add('ta-out');
  host.append(bar, modeBar);

  const ctxNow = (): Ctx => {
    const t = state.tool;
    if (t.kind === 'link') return 'link';
    if (t.kind === 'stamp') return 'place';
    if (t.kind === 'place') return (t.mode ?? 'new') === 'new' ? 'place' : 'moving';
    if (t.kind === 'group') return 'moving';
    if (t.kind === 'select' && (state.selection !== null || selectionSize(state.sel) > 0)) return 'selected';
    return 'none';
  };

  /** Máy có hai chế độ đang được thao tác (đặt / chọn / dời một máy) và chế độ hiện tại của nó. */
  const modeTarget = (): { machineId: string; mode: 'A' | 'B' } | null => {
    const t = state.tool;
    if (t.kind === 'place') return { machineId: t.machineId, mode: t.machineMode ?? 'A' };
    const uid =
      t.kind === 'group' ? (state.sel.machines.size === 1 && state.sel.tiles.size === 0 ? [...state.sel.machines][0]! : null) : t.kind === 'select' ? state.selection : null;
    if (uid === null || uid === undefined) return null;
    const m = state.bp.machines.find((v) => v.uid === uid);
    if (!m) return null;
    const mode = t.kind === 'group' ? (t.modes?.[uid] ?? m.mode ?? 'A') : (m.mode ?? 'A');
    return { machineId: m.machineId, mode };
  };
  let modeKey = '';
  /** Cửa sổ máy đang mở (không thu gọn) — nó đã có thanh chế độ riêng ở đầu cửa sổ. */
  const machineWinOpen = (): boolean => {
    const mw = document.querySelector<HTMLElement>('.machine-window');
    return !!mw && !mw.hidden && !mw.classList.contains('collapsed') && mw.offsetWidth > 0;
  };
  const renderMode = (): void => {
    const target = modeTarget();
    const def = target ? state.ds.machines.get(target.machineId) : undefined;
    // cửa sổ máy đang mở ⇒ che / tắt thanh chế độ ở ngoài (người dùng 2026-10-05)
    if (!target || !def?.modes || def.modes.length !== 2 || (state.tool.kind === 'select' && machineWinOpen())) {
      modeBar.hidden = true;
      modeKey = '';
      return;
    }
    const key = `${def.id}|${target.mode}`;
    if (key === modeKey) return;
    const prev = modeKey.split('|');
    const animate = prev[0] === def.id && prev[1] !== target.mode;
    modeKey = key;
    modeBar.hidden = false;
    modeBar.textContent = '';
    const [a, b] = def.modes as [NonNullable<typeof def.modes>[number], NonNullable<typeof def.modes>[number]];
    const icons = MACHINE_MODE_ICONS[def.id];
    const knob = el('span', { class: 'ms-knob' });
    const opt = (o: typeof a, side: 'A' | 'B'): HTMLElement => {
      const icon = icons ? el('span', { class: 'ms-icon' }) : null;
      if (icon && icons) icon.innerHTML = modeIconSvg(icons[side]);
      const label = el('span', { class: 'ms-label' }, o.label);
      const on = target.mode === o.id;
      return el(
        'button',
        { class: `ms-opt${on ? ' on' : ''}`, type: 'button', onclick: () => modeTarget()?.mode !== o.id && pressKey('Tab', 'Tab') },
        ...(side === 'A' ? [icon, label] : [label, icon]),
      );
    };
    // đổi chế độ: vẽ con lăn ở chỗ cũ rồi mới lăn sang (như cửa sổ máy)
    const sw = el('div', { class: `mode-switch${(animate ? prev[1] : target.mode) === b.id ? ' right' : ''}` }, knob, opt(a, 'A'), opt(b, 'B'));
    modeBar.append(sw);
    if (animate) setTimeout(() => sw.classList.toggle('right', target.mode === b.id), 30);
  };

  const render = (): void => {
    const ctx = ctxNow();
    app.classList.toggle('touch-acting', ctx !== 'none');
    // đang đặt / dời / sao chép máy, vẽ băng / ống, xoá ⇒ thanh tab (kể cả nút Cài đặt) trượt xuống khuất; thoát hẳn mới
    // trượt lên lại — chuyển qua lại giữa các chế độ đó thì vẫn ẩn (người dùng 2026-10-05)
    const k = state.tool.kind;
    app.classList.toggle('touch-busy', k === 'place' || k === 'stamp' || k === 'group' || k === 'link' || k === 'erase');
    // trượt vào từ mép phải khi bắt đầu chọn / đặt, trượt ra khi về chế độ xem (người dùng 2026-10-06)
    bar.classList.toggle('ta-out', ctx === 'none');
    if (ctx === 'none' && touchModes.keep) touchModes.keep = false;
    if (ctx !== 'none') bar.dataset.ctx = ctx;
    const holding = ctx === 'place' || ctx === 'moving' || ctx === 'link';
    more.classList.toggle('shut', holding);
    copy.hidden = ctx === 'link';
    bar.querySelector<HTMLElement>('.ta-sep')!.hidden = ctx === 'link';
    rotate.disabled = ctx === 'link';
    for (const b of [move, add, box, remove, save]) b.disabled = holding;
    const keepMode = ctx === 'place' || ctx === 'moving';
    copy.querySelector('.ta-label')!.textContent = keepMode ? tr('Đặt tiếp') : tr('Sao chép');
    copy.classList.toggle('on', keepMode && touchModes.keep);
    copy.classList.toggle('keep', keepMode && touchModes.keep);
    add.classList.toggle('on', touchModes.add);
    box.classList.toggle('on', touchModes.box);
    cancel.querySelector('.ta-label')!.textContent = ctx === 'selected' ? tr('Huỷ chọn') : tr('Huỷ');
    commit.disabled = !map.canCommit();
    renderLogi();
    renderMode();
  };
  touchModes.listeners.add(render);
  // cửa sổ máy mở / thu gọn / đóng ⇒ hiện lại hoặc ẩn thanh chế độ
  const mw = document.querySelector<HTMLElement>('.machine-window');
  if (mw) new MutationObserver(() => renderMode()).observe(mw, { attributes: true, attributeFilter: ['class', 'hidden'] });
  state.subscribe((mode) => {
    if (mode === 'view') {
      commit.disabled = !map.canCommit(); // preview vừa đặt / dời ⇒ nút Đặt sáng lên
      renderLogi(); // bắt đầu / xong vẽ ống ⇒ ẩn / hiện 4 công trình logistic
    }
    else render();
  });
  render();
  return render;
}
