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
  // Chọn thêm / Chọn vùng / Di chuyển đã bỏ (người dùng 2026-10-07): chọn nhiều là nút X ở cột công cụ; dời máy vẫn bằng
  // giữ ngón 0,5 s trên máy rồi rê
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
  const more = el('div', { class: 'ta-more' }, el('div', { class: 'ta-more-inner' }, remove, save));
  // thanh thao tác **không thu gọn được** (người dùng 2026-10-07, lần 3) — chỉ trượt xuống / lên khi bật / tắt
  bar.append(commit, rotate, cancel, logiBox, el('div', { class: 'ta-sep' }), copy, more);

  /**
   * **Cột công cụ thường kéo lên / xuống được** (người dùng 2026-10-07; thanh thao tác thì thôi — lần 3).
   * Kéo lên dọc thanh ⇒ thanh trượt lên mép trên, chỉ còn **dải kéo** lòi ra (`FOLD_PEEK` — đủ thấp để không vướng cú kéo
   * thanh thông báo từ mép trên màn hình); kéo xuống hoặc chạm dải ⇒ mở lại. Trạng thái nhớ trong `efp:fold`.
   */
  const FOLD_PEEK = 50; // px tính từ mép trên khung bản đồ tới đáy dải kéo khi thu
  const FOLD_KEY = 'efp:fold';
  const fold = ((): { dock: boolean } => {
    try {
      const v = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}') as { dock?: boolean };
      return { dock: v.dock === true };
    } catch {
      return { dock: false };
    }
  })();
  const saveFold = (): void => {
    try {
      localStorage.setItem(FOLD_KEY, JSON.stringify(fold));
    } catch {
      /* không lưu được thì thôi */
    }
  };
  const dockEl = (): HTMLElement | null => document.querySelector<HTMLElement>('.dock');
  /** Cột công cụ dựng lại liên tục ⇒ gắn lại dải kéo của nó sau mỗi lần dựng. */
  const ensureDockGrip = (): void => {
    const d = dockEl();
    if (!d || d.querySelector('.dock-grip')) return;
    const g = el('div', { class: 'dock-group dock-grip' }, el('i', {}), el('i', {}));
    const drawerG = d.querySelector('.dock-drawer');
    d.insertBefore(g, drawerG);
  };
  const applyFold = (): void => {
    app.classList.toggle('dock-collapsed', fold.dock);
    layoutFold();
  };
  const eatClick = (): void => {
    const eat = (ev: Event): void => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener('click', eat, true);
    setTimeout(() => window.removeEventListener('click', eat, true), 350);
  };
  /**
   * Nhận cú kéo dọc **trên cả diện tích thanh** (người dùng 2026-10-07). Nghe ở cả phần tử được chạm lẫn `window`: cột công
   * cụ dựng lại nút thường xuyên — nút dưới ngón tay bị gỡ khỏi trang thì sự kiện chạm sau đó không còn nổi lên tới cột
   * (trước đây vuốt cột công cụ trượt gần như mọi lần, thanh thao tác thì không).
   */
  const foldable = (root: HTMLElement, which: 'dock', gripSel: string): void => {
    let st: { id: number; x: number; y: number } | null = null;
    const seen = new WeakSet<Event>();
    const move = (e: TouchEvent): void => {
      if (seen.has(e)) return;
      seen.add(e);
      const t = st && [...e.touches].find((v) => v.identifier === st!.id);
      if (!st || !t) return;
      const dy = t.clientY - st.y;
      const dx = t.clientX - st.x;
      if (Math.abs(dy) < 14 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
      e.preventDefault();
      st = null;
      off();
      const shut = dy < 0;
      // tay kéo bảng Tổng hợp nằm ngay dưới cột: vuốt dọc trên nó cũng thu / mở cột (bản ghi chạm thật 2026-10-07: phần lớn
      // cú vuốt lên ở đáy cột rơi trúng tay kéo — trước đây bị bỏ qua); đang hiện thanh thao tác thì cột đang ẩn ⇒ bỏ qua
      if (app.classList.contains('touch-acting')) return;
      if (shut === fold[which]) return;
      fold[which] = shut;
      saveFold();
      applyFold();
      eatClick();
    };
    const end = (e: Event): void => {
      if (seen.has(e)) return;
      seen.add(e);
      st = null;
      off();
    };
    let off = (): void => {};
    root.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      const target = e.target as Element;
      if (e.touches.length !== 1 || !t) return;
      st = { id: t.identifier, x: t.clientX, y: t.clientY };
      off();
      const mv = move as EventListener;
      target.addEventListener('touchmove', mv, { passive: false });
      target.addEventListener('touchend', end);
      target.addEventListener('touchcancel', end);
      window.addEventListener('touchmove', move, { capture: true, passive: false });
      window.addEventListener('touchend', end, true);
      window.addEventListener('touchcancel', end, true);
      off = (): void => {
        target.removeEventListener('touchmove', mv);
        target.removeEventListener('touchend', end);
        target.removeEventListener('touchcancel', end);
        window.removeEventListener('touchmove', move, true);
        window.removeEventListener('touchend', end, true);
        window.removeEventListener('touchcancel', end, true);
        off = (): void => {};
      };
    }, { passive: true });
    root.addEventListener('click', (e) => {
      if (!fold[which] || !(e.target as Element).closest(gripSel)) return;
      e.stopPropagation();
      fold[which] = false;
      saveFold();
      applyFold();
    });
  };
  /**
   * Đặt chỗ khi thu (theo bố cục, không tính transform đang chạy): cột công cụ dời lên đúng một đoạn để đáy dải kéo nằm ở
   * `FOLD_PEEK`; tay kéo bảng Tổng hợp (cuối cột) **trượt xuống dưới** thanh thao tác khi thanh hiện, **trượt lên** theo cột
   * / thanh khi thu (biến `--dock-hide`, `--drawer-shift` trên `#app`).
   */
  const layoutFold = (): void => {
    requestAnimationFrame(() => {
      ensureDockGrip();
      const d = dockEl();
      const drawerEl = d?.querySelector<HTMLElement>('.dock-drawer');
      const dgrip = d?.querySelector<HTMLElement>('.dock-grip');
      if (!d || !drawerEl || !dgrip) return;
      const top = bar.offsetTop; // mép trên của hai thanh
      const dockHide = Math.max(0, d.offsetTop + dgrip.offsetTop + dgrip.offsetHeight - (top + FOLD_PEEK));
      app.style.setProperty('--dock-hide', `${dockHide}px`);
      const natural = d.offsetTop + drawerEl.offsetTop;
      let shift = 0;
      // thanh đã thu: tay kéo đứng cách dải kéo thêm một đoạn — vùng chạm nới rộng của nó không được che dải kéo
      const GAP_FOLDED = 42;
      if (!bar.classList.contains('ta-out')) shift = Math.max(0, bar.offsetTop + bar.offsetHeight + 10 - natural);
      else if (fold.dock) shift = -dockHide + GAP_FOLDED - 6;
      app.style.setProperty('--drawer-shift', `${shift}px`);
    });
  };
  const placeDrawer = layoutFold;
  const d0 = dockEl();
  if (d0) {
    foldable(d0, 'dock', '.dock-grip');
    new MutationObserver(() => layoutFold()).observe(d0, { childList: true });
  }
  window.addEventListener('resize', () => layoutFold());
  bar.classList.add('ta-out');
  host.append(bar, modeBar);

  const ctxNow = (): Ctx => {
    const t = state.tool;
    if (t.kind === 'link') return 'link';
    if (t.kind === 'stamp') return 'place';
    if (t.kind === 'place') return (t.mode ?? 'new') === 'new' ? 'place' : 'moving';
    if (t.kind === 'group') return 'moving';
    if (t.kind === 'select' && (state.selection !== null || selectionSize(state.sel) > 0 || state.batch)) return 'selected';
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
    // chế độ chọn nhiều chưa chọn gì: các nút cần máy được chọn **mờ đi** (không ẩn — người dùng 2026-10-07)
    const none = ctx === 'selected' && state.selection === null && selectionSize(state.sel) === 0;
    for (const b of [remove, save]) b.disabled = holding || none;
    if (ctx === 'selected') copy.disabled = none;
    else copy.disabled = false;
    if (ctx === 'selected') rotate.disabled = none;
    const keepMode = ctx === 'place' || ctx === 'moving';
    copy.querySelector('.ta-label')!.textContent = keepMode ? tr('Đặt tiếp') : tr('Sao chép');
    copy.classList.toggle('on', keepMode && touchModes.keep);
    copy.classList.toggle('keep', keepMode && touchModes.keep);
    cancel.querySelector('.ta-label')!.textContent = ctx === 'selected' ? (state.batch ? tr('Thoát') : tr('Huỷ chọn')) : tr('Huỷ');
    commit.disabled = !map.canCommit();
    renderLogi();
    renderMode();
    placeDrawer();
    setTimeout(placeDrawer, 280); // khối nút dưới co / giãn xong
  };
  touchModes.listeners.add(render);
  applyFold();
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
