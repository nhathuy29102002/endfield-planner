import type { AppState, Tool } from '../editor/state';
import {
  COPIED_EVENT,
  deleteSelected,
  describeSelection,
  enterTool,
  startCopy,
  startGroup,
  startMove,
  toggleLabels,
  toggleLayer,
  toggleOffSelected,
} from '../editor/tools';
import { canSwitchOff } from '../model/switchOff';
import { selectionSize } from '../editor/group';
import type { Renderer } from '../render/renderer';
import { clear, el } from './dom';
import { tr } from '../i18n';
import { isTouchUI } from '../platform';

/** Giao diện điện thoại (app Android). */
const touch = isTouchUI();
import { enterSimMode, exitSimMode, isSimulating } from './simMode';

/** Biểu tượng vẽ bằng SVG cho gọn và đồng nhất, khỏi phụ thuộc emoji của từng máy. */
const ICON = {
  /** đồng hồ + mũi tên chạy — Mô phỏng nhanh */
  simulate:
    '<circle cx="11" cy="12" r="7.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M11 7.5V12l3 2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M19.5 4.5l2 2-2 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  select:
    '<path d="M5 3l12 8-5.5 1.2L9 18z" fill="currentColor"/>',
  erase:
    '<path d="M6 7h12M9 7V5h6v2M8 7l1 12h6l1-12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
  ground:
    '<path d="M4 15l8 4 8-4-8-4z" fill="currentColor"/><path d="M4 10l8 4 8-4-8-4z" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".45"/>',
  upper:
    '<path d="M4 15l8 4 8-4-8-4z" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".45"/><path d="M4 10l8 4 8-4-8-4z" fill="currentColor"/>',
  undo: '<path d="M9 7L4 12l5 5M4 12h10a6 6 0 010 12" stroke="currentColor" stroke-width="1.8" fill="none" transform="translate(0 -3)"/>',
  redo: '<path d="M15 7l5 5-5 5M20 12H10a6 6 0 000 12" stroke="currentColor" stroke-width="1.8" fill="none" transform="translate(0 -3)"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  power: '<path d="M13 2L5 14h6l-1 8 8-12h-6z" fill="currentColor"/>',
  labels: '<text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" font-family="system-ui, sans-serif" fill="currentColor">Aa</text>',
  more: '<circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/>',
  rotate: '<path d="M19 12a7 7 0 1 1-2.05-4.95" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M19.5 3.5v5h-5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  // nút nguồn — bật / tắt máy đang chọn (Tab, người dùng 2026-10-06)
  onoff: '<path d="M8.2 6.8a7 7 0 1 0 7.6 0" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round"/><path d="M12 3.5v8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  // mũi tên của tay kéo bảng Tổng hợp: ‹ = kéo bảng ra, › = đẩy bảng vào
  drawerOpen: '<path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  drawerClosed: '<path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  panel:
    '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M14 4v16" stroke="currentColor" stroke-width="1.8"/><path d="M16.5 8h2M16.5 11h2M16.5 14h2" stroke="currentColor" stroke-width="1.4"/>',
  save: '<path d="M5 4h11l3 3v13H5z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><path d="M8 4v5h7V4M8 20v-6h8v6" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  library:
    '<rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7" fill="none"/><rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7" fill="none"/><rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M17 14v6M14 17h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  // xoay camera (người dùng 2026-09-30): mũi tên vòng quanh một ô lưới
  rotateView:
    '<rect x="8.5" y="8.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 8.5v7M8.5 12h7" stroke="currentColor" stroke-width="1" opacity=".6"/><path d="M19.5 12A7.5 7.5 0 1 1 17.3 6.7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M18 2.8v4.4h-4.4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  // ẩn / hiện nét vẽ của Modeler (người dùng 2026-10-02)
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7" fill="none"/>',
  eyeOff:
    '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round" opacity=".55"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7" fill="none" opacity=".55"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // khung chữ nhật của bút vẽ Modeler (người dùng 2026-10-02)
  rect: '<rect x="4" y="6" width="16" height="12" rx="1.5" stroke="currentColor" stroke-width="1.9" fill="none"/>',
  // bút vẽ của Modeler (người dùng 2026-09-30): bút, chữ, tẩy nét
  pen: '<path d="M4 20l1.2-4.6L15.8 4.8a2 2 0 012.8 0l.6.6a2 2 0 010 2.8L8.6 18.8z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="M14 6.6l3.4 3.4" stroke="currentColor" stroke-width="1.7"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round"/>',
  eraser: '<path d="M9 19h11M4.8 14.2l8.5-8.5a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11.8 17.2 9.6 19H7.4l-2.6-2.6a1.6 1.6 0 010-2.2z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="M9 10l5 5" stroke="currentColor" stroke-width="1.7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3" stroke="currentColor" stroke-width="1.8" fill="none"/>',
} as const;

const svg = (path: string): SVGSVGElement => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('class', 'dock-icon');
  node.innerHTML = path;
  return node;
};

/** Icon của cột nút nổi — màn hình Modeler dùng lại cho cột công cụ của nó. */
export const dockIcon = (name: keyof typeof ICON): SVGSVGElement => svg(ICON[name]);

const img = (src: string): HTMLImageElement => el('img', { class: 'dock-img', src, alt: '' });

export interface DockHooks {
  /** Bảng bên phải đang mở? */
  rightOpen: () => boolean;
  toggleRight: () => void;
  /** Lưu nhóm đang chọn thành bản vẽ module. */
  saveSelection: () => void;
  openLibrary: () => void;
}

/**
 * Cột nút nổi, xếp dọc sát mép bảng bên phải.
 *
 * Không có nút "Chọn": chọn là trạng thái mặc định khi không bật Xoá / Băng / Ống — bấm
 * lại nút đang bật (hoặc Esc) để về chọn. Chỗ của nút đó giờ là nút đóng/mở bảng bên
 * phải. Hoàn tác / Làm lại / Bản vẽ nằm ở góc trên-trái (`mountTopbar`).
 */
export function mountDock(root: HTMLElement, state: AppState, renderer: Renderer, hooks: DockHooks): () => void {
  // Ctrl+C chép vào bộ nhớ tạm thành công ⇒ nút Sao chép hiện dấu tích xanh 2 giây rồi trở lại
  // (người dùng 2026-09-29)
  let copiedUntil = 0;
  window.addEventListener(COPIED_EVENT, () => {
    copiedUntil = performance.now() + 2000;
    render();
    setTimeout(render, 2010);
  });
  const copyIcon = (): SVGSVGElement => svg(performance.now() < copiedUntil ? ICON.check : ICON.copy);
  const copiedClass = (): string => (performance.now() < copiedUntil ? ' copied' : '');

  /**
   * Tay kéo đóng/mở bảng Tổng hợp (người dùng 2026-09-29): **dính vào lề phải** màn hình (bảng mở thì
   * dính vào mép trái bảng) như tay kéo ngăn kéo, mũi tên chỉ hướng; nằm **dưới cùng** cột nút nổi.
   */
  const drawer = (): HTMLElement => {
    const open = hooks.rightOpen();
    return el(
      'div',
      { class: 'dock-group dock-drawer' },
      el(
        'button',
        {
          class: 'drawer-handle',
          title: tr('{0} bảng tổng hợp  (F3)', open ? tr('Đóng') : tr('Mở')),
          onclick: (e: Event) => {
            e.stopPropagation();
            hooks.toggleRight();
          },
        },
        svg(open ? ICON.drawerOpen : ICON.drawerClosed),
      ),
    );
  };

  const render = (): void => {
    clear(root);
    renderInner();
    root.append(drawer());
  };

  const renderInner = (): void => {

    const tool = state.tool;
    const isTool = (t: Tool): boolean =>
      tool.kind === t.kind && (t.kind !== 'link' || (tool.kind === 'link' && tool.linkKind === t.linkKind));

    const button = (
      opts: { title: string; key?: string; active?: boolean; disabled?: boolean; extra?: string; onClick: () => void },
      ...content: Node[]
    ): HTMLButtonElement => {
      const b = el(
        'button',
        {
          class: `dock-btn${opts.active ? ' active' : ''}${opts.extra ?? ''}`,
          title: opts.key ? `${opts.title}  (${opts.key})` : opts.title,
          disabled: opts.disabled ?? false,
          onclick: (e: Event) => {
            e.stopPropagation();
            opts.onClick();
          },
        },
        ...content,
      );
      if (opts.key) b.append(el('span', { class: 'dock-key' }, opts.key));
      return b;
    };
    const group = (...buttons: Node[]): HTMLElement => el('div', { class: 'dock-group' }, ...buttons);
    /** Bật / tắt các máy đang chọn (Tab). Sáng khi mọi máy tắt được trong vùng chọn đều đang tắt. */
    const onOffButton = (busy: boolean): HTMLElement => {
      const ms = state.bp.machines.filter((m) => state.sel.machines.has(m.uid) && !m.fixed && canSwitchOff(state.ds.machines.get(m.machineId)));
      const allOff = ms.length > 0 && ms.every((m) => m.off);
      return button(
        {
          title: ms.length === 0 ? tr('Không có máy dùng điện nào đang chọn để bật / tắt') : allOff ? tr('Bật lại máy đang chọn') : tr('Tắt máy đang chọn — không chạy, không tốn điện'),
          key: 'Tab',
          active: allOff,
          disabled: busy || ms.length === 0,
          onClick: () => toggleOffSelected(state),
        },
        svg(ICON.onoff),
      );
    };
    // Nút xoay (người dùng 2026-09-29): đúng như bấm phím R — quay máy / nhóm đang chọn tại chỗ, hoặc
    // quay preview khi đang di chuyển / sao chép. Gửi phím R để dùng chung một đường xử lý với bàn phím.
    const rotate = (): void => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', bubbles: true }));
    // Đang chọn một máy (hoặc đang di chuyển / sao chép nó): cột nút chỉ còn 3 thao tác
    // với máy đó. Esc hoặc bấm ra chỗ trống để quay lại cột nút thường.
    const acting = tool.kind === 'place' && (tool.mode === 'move' || tool.mode === 'copy');
    const selected = tool.kind === 'select' ? state.selection : acting ? (tool.sourceUid ?? null) : null;
    if (selected !== null && state.bp.machines.some((m) => m.uid === selected)) {
      const name = state.ds.machines.get(state.bp.machines.find((m) => m.uid === selected)!.machineId)?.name ?? '';
      // thứ tự như khối phím tắt khi chọn trong game (người dùng 2026-10-06): Lưu bản vẽ · Sao chép · Di chuyển · Lưu trữ
      // (xoá, F) · Bật / tắt (Tab); nút Xoay giữ lại ở cuối
      root.append(
        group(
          button(
            { title: tr('Lưu {0} thành bản vẽ (module)', name), key: 'Ctrl+S', disabled: acting, onClick: hooks.saveSelection },
            svg(ICON.save),
          ),
          button(
            {
              title: tr('Sao chép {0} — chuột trái đặt bản sao, giữ chuột phải + rê để xoay, Esc để tắt. Ctrl+C: chép vào bộ nhớ tạm, Ctrl+V để dán', name),
              key: 'C',
              active: acting && tool.kind === 'place' && tool.mode === 'copy',
              extra: copiedClass(),
              onClick: () => startCopy(state, renderer, selected),
            },
            copyIcon(),
          ),
          button(
            {
              title: tr('Di chuyển {0} — chuột trái đặt, giữ chuột phải + rê để xoay, Esc trả về chỗ cũ', name),
              key: 'M',
              active: acting && tool.kind === 'place' && tool.mode === 'move',
              onClick: () => startMove(state, renderer, selected),
            },
            svg(ICON.move),
          ),
          button(
            { title: tr('Lưu trữ (xoá) {0}', name), key: 'F', onClick: () => deleteSelected(state, renderer) },
            svg(ICON.erase),
          ),
          onOffButton(acting),
          button({ title: tr('Xoay {0} 90°', name), key: 'R', onClick: rotate }, svg(ICON.rotate)),
        ),
      );
      return;
    }

    // Chọn nhiều (hoặc đang cầm nhóm): cũng 3 nút đó, nhưng làm với cả nhóm
    const holding = tool.kind === 'group';
    if (holding || (tool.kind === 'select' && selectionSize(state.sel) > 0)) {
      const what = describeSelection(state);
      root.append(
        group(
          button(
            { title: tr('Lưu {0} thành bản vẽ (module)', what), key: 'Ctrl+S', disabled: holding, onClick: hooks.saveSelection },
            svg(ICON.save),
          ),
          button(
            {
              title: tr('Sao chép {0} — chuột trái đặt bản sao, R hoặc giữ chuột phải + rê để xoay, Esc để tắt. Ctrl+C: chép vào bộ nhớ tạm, Ctrl+V để dán', what),
              key: 'C',
              active: holding && tool.mode === 'copy',
              extra: copiedClass(),
              onClick: () => startGroup(state, renderer, 'copy'),
            },
            copyIcon(),
          ),
          button(
            {
              title: tr('Di chuyển {0} — chuột trái đặt, R hoặc giữ chuột phải + rê để xoay, Esc trả về chỗ cũ', what),
              key: 'M',
              active: holding && tool.mode === 'move',
              onClick: () => startGroup(state, renderer, 'move'),
            },
            svg(ICON.move),
          ),
          button(
            { title: tr('Lưu trữ (xoá) {0}', what), key: 'F', disabled: holding, onClick: () => deleteSelected(state, renderer) },
            svg(ICON.erase),
          ),
          onOffButton(holding),
          button({ title: tr('Xoay {0} 90°', what), key: 'R', onClick: rotate }, svg(ICON.rotate)),
        ),
      );
      return;
    }

    const tools: { tool: Tool; title: string; key: string; icon: Node }[] = [
      {
        tool: { kind: 'link', linkKind: 'belt' },
        title: tr('Đặt băng chuyền — bấm điểm đầu, rê tới đích, bấm để đặt. Esc để tắt'),
        key: 'E',
        icon: img('img/ui/item_log_belt_01.png'),
      },
      {
        tool: { kind: 'link', linkKind: 'pipe' },
        title: tr('Đặt ống — bấm điểm đầu, rê tới đích, bấm để đặt. Esc để tắt'),
        key: 'Q',
        icon: img('img/ui/item_log_pipe_01.png'),
      },
      { tool: { kind: 'erase' }, title: tr('Xoá máy, hoặc một ô băng/ống ở tầng đang xem'), key: 'F', icon: svg(ICON.erase) },
    ];
    // Nút xoay camera 90° ngay trên nút Xoá (người dùng 2026-09-30) — như Ctrl+R (quay mượt); Shift+bấm quay ngược.
    // Gửi phím để dùng chung đường xử lý với bàn phím.
    const rotateView = (e?: Event): void =>
      void window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', ctrlKey: true, shiftKey: !!(e as MouseEvent | undefined)?.shiftKey, bubbles: true }),
      );

    root.append(
      group(
        // nút đóng/mở bảng Tổng hợp chuyển thành tay kéo ở cuối cột (`drawer`, người dùng 2026-09-29)
        // bấm lại nút đang bật ⇒ về chọn (không còn nút Chọn riêng)
        ...tools.flatMap((t) => [
          ...(t.tool.kind === 'erase'
            ? [
                (() => {
                  const b = button(
                    { title: tr('Xoay camera 90° — Shift+bấm: xoay ngược'), key: 'Ctrl+R', onClick: () => undefined },
                    svg(ICON.rotateView),
                  );
                  b.onclick = (e: MouseEvent) => {
                    e.stopPropagation();
                    rotateView(e);
                  };
                  return b;
                })(),
              ]
            : []),
          button(
            {
              title: t.title,
              key: t.key,
              active: isTool(t.tool),
              onClick: () => enterTool(state, renderer, isTool(t.tool) ? { kind: 'select' } : t.tool),
            },
            t.icon,
          ),
        ]),
      ),
      group(
        button(
          {
            title:
              renderer.activeLayer === 0
                ? tr('Đang xem mặt đất (băng chuyền) — bấm để chuyển lên trên cao (ống)  (CapsLock)')
                : tr('Đang xem trên cao (ống) — bấm để chuyển xuống mặt đất (băng chuyền)  (CapsLock)'),
            active: renderer.activeLayer === 1,
            onClick: () => toggleLayer(state, renderer),
          },
          svg(renderer.activeLayer === 0 ? ICON.ground : ICON.upper),
          el('span', { class: 'dock-label' }, renderer.activeLayer === 0 ? tr('Đất') : 'Cao'),
        ),
        // điện thoại (người dùng 2026-10-05): hai nút này chuyển vào Cài đặt; chỗ của chúng là Bản vẽ + Mô phỏng
        ...(touch
          ? [
              button({ title: tr('Bản vẽ — thư viện bản vẽ đã lưu, nhập / xuất'), onClick: hooks.openLibrary }, svg(ICON.library)),
              (() => {
                const on = isSimulating();
                const b = button(
                  { title: on ? tr('Đang mô phỏng — bấm để thoát về bản vẽ tĩnh (mất tiến độ mô phỏng)') : tr('Mô phỏng'), active: on, onClick: () => (isSimulating() ? exitSimMode() : enterSimMode()) },
                  svg(ICON.simulate),
                );
                b.classList.toggle('sim-on', on);
                return b;
              })(),
            ]
          : [
        button(
          {
            title: renderer.showLabels ? tr('Đang hiện tên máy — bấm để ẩn') : tr('Đang ẩn tên máy — bấm để hiện'),
            key: 'N',
            active: renderer.showLabels,
            onClick: () => toggleLabels(state, renderer),
          },
          svg(ICON.labels),
        ),
        button(
          {
            title:
              state.bp.enforcePower !== false
                ? tr('Kiểm tra tầm điện: BẬT — máy ngoài tầm cột/trụ không chạy. Bấm để tắt khi đang phác thảo')
                : tr('Kiểm tra tầm điện: TẮT — bấm để bật'),
            active: state.bp.enforcePower !== false,
            onClick: () =>
              state.mutate(tr('Đổi kiểm tra điện'), () => {
                state.bp.enforcePower = state.bp.enforcePower === false;
              }),
          },
          svg(ICON.power),
        ),
            ]),
      ),
    );
  };

  render();
  return render;
}

/**
 * Nút nổi góc trên-trái bản vẽ: Hoàn tác, Làm lại, Bản vẽ (mở thư viện bản vẽ).
 */
export function mountTopbar(root: HTMLElement, state: AppState, openLibrary: () => void): () => void {
  const render = (): void => {
    clear(root);
    const btn = (title: string, icon: string, disabled: boolean, onClick: () => void, label?: string): HTMLElement => {
      const b = el(
        'button',
        {
          class: `dock-btn${label ? ' wide' : ''}`,
          title,
          disabled,
          onclick: (e: Event) => {
            e.stopPropagation();
            onClick();
          },
        },
        svg(icon),
      );
      if (label) b.append(el('span', { class: 'dock-text' }, label));
      return b;
    };
    root.append(
      el(
        'div',
        { class: 'dock-row' },
        btn(tr('Hoàn tác (Ctrl+Z)'), ICON.undo, !state.canUndo, () => state.undo()),
        btn(tr('Làm lại (Ctrl+Shift+Z)'), ICON.redo, !state.canRedo, () => state.redo()),
        // điện thoại: Bản vẽ + Mô phỏng nằm ở cột công cụ bên phải (người dùng 2026-10-05)
        touch ? null : btn(tr('Bản vẽ — thư viện bản vẽ đã lưu, nhập / xuất'), ICON.library, false, openLibrary, tr('Bản vẽ')),
        // Simulation (người dùng 2026-10-03): vào chế độ chạy như game — Map thường vẫn tĩnh. Đang mô phỏng ⇒ nút **vàng**,
        // bấm lần nữa = thoát (thay nút ✕ cũ trên thanh điều khiển)
        touch ? null : (() => {
          const on = isSimulating();
          const b = btn(
            on ? tr('Đang mô phỏng — bấm để thoát về bản vẽ tĩnh (mất tiến độ mô phỏng)') : tr('Mô phỏng — chạy nhà máy như trong game (hàng chạy trên băng, tiến độ máy, kho); vẫn chỉnh sửa được trong lúc chạy'),
            ICON.simulate,
            false,
            () => (isSimulating() ? exitSimMode() : enterSimMode()),
            tr('Mô phỏng'),
          );
          b.classList.toggle('sim-on', on);
          return b;
        })(),
      ),
    );
  };
  render();
  return render;
}
