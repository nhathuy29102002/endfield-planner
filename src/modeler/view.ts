import { groupItems, isFilledContainer, itemName, PHASE_LABEL, phaseOf } from '../model/dataset';
import { kindOfItem } from '../model/dataset';
import type { AppState } from '../editor/state';
import { CATALYST_ENV_LABEL, type MachineDef, type RecipeDef } from '../model/types';
import { ORDERED_OUTPUTS } from '../model/binding';
import { FLUID_COLORS } from '../model/fluidColors';
import { clear, el, fmt } from '../ui/dom';
import { dockIcon } from '../ui/dock';
import { itemIconSrc } from '../ui/itemPicker';
import { itemChip } from '../ui/inspector';
import { recipeCard } from '../ui/machineParts';
import { TOUCH_VIEW_EVENT, type TouchViewDetail } from '../ui/touchEvents';
import { pinnedMachineIds } from '../ui/palette';
import { computeModeler, type ModelerCalc } from './calc';
import { insertIndex, routeMid, routePath, routeSegments, type Pt } from './route';
import { rectFrom } from './ink';
import { INK_COLORS, INK_LINE, INK_MAX, INK_MIN, inkAddPoint, inkBounds, inkPath, inkTextSize, loadInk, saveInk, type InkTool } from './ink';
import {
  SIDES,
  MODELER_DROP,
  MODELER_INSERT_EVENT,
  MODELER_PICK,
  setModelerHolding,
  addEdge,
  EDGE_RATES,
  ENV_GASES,
  SEWAGE_OUT,
  SINKS,
  applyOption,
  canConnect,
  choosesItem,
  copyNodes,
  cycleCrucibleSlot,
  removeNodes,
  envOf,
  fromKey,
  isBlank,
  isAutoAct,
  isEnvItem,
  kindOfNode,
  nodeKind,
  parseKey,
  toKey,
  linkOptions,
  machineOptions,
  modelerMachines,
  newId,
  nodePorts,
  recipeOf,
  setNodeRecipe,
  sourceItemsFor,
  sourcePhases,
  type LinkOption,
  type MEdge,
  type MEnd,
  type MDrawing,
  type MNode,
  type ModelerDoc,
  type ModelerDrop,
  type Side,
} from './doc';
import { tr } from '../i18n';
import { autoFocus, isTouchUI } from '../platform';

/** Bỏ dấu tiếng Việt để tìm máy / vật phẩm gõ không dấu. */
const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

/** Icon của khí tạo ra môi trường — dùng cho "vật phẩm" môi trường `@env:…`. */
const ENV_ICON: Record<string, string> = { Stable: 'item_gas_inert', Acid: 'item_gas_acid' };
/** Bảng tên môi trường trên đầu nút (người dùng 2026-09-29): khí trơ ⇒ TRƠ, khí axit ⇒ ACID. */
const ENV_PLATE: Record<string, string> = { Stable: tr('TRƠ'), Acid: 'ACID' };
const plateText = (env: string): string => ENV_PLATE[env] ?? env.toUpperCase();

// Hộp hướng dẫn thao tác: `ui/hints.ts` (dùng chung với Map, main.ts hiện mỗi lần bật tab).

/** Số gọn: bỏ số 0 thừa sau dấu chấm (2.50 → 2.5). */
const num = (v: number, d = 2): string => (Number.isFinite(v) ? String(Number(v.toFixed(d))) : '—');

const DIR: Record<Side, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
};

export interface ModelerDeps {
  state: AppState;
  doc: ModelerDoc;
  /** Sơ đồ vừa đổi (thêm/xoá/nối/kéo…) ⇒ lưu tab, cập nhật dấu "chưa lưu". */
  onChange(): void;
  /** Thông báo ngắn (cuối thanh tab). */
  notify(text: string): void;
}

/**
 * Màn hình **Modeler** (người dùng 2026-09-29).
 *
 * - Thêm máy: bấm máy ở cột chọn máy bên trái (hoặc phím 1…0) ⇒ nút **chưa có công thức** giữa màn hình.
 * - Nối: kéo từ một cổng thả lên cổng cùng vật phẩm, hoặc thả lên **thân** một máy — máy chưa có công
 *   thức thì tự chọn công thức theo vật phẩm vừa nối (nhiều công thức hợp ⇒ hỏi); thả ra **khoảng trống**
 *   ⇒ bảng mọi công thức (kèm loại máy) dùng / làm ra vật phẩm đó, chọn là có máy mới nối sẵn.
 * - Bấm chuột trái vào đường nối ⇒ bỏ nối. Kéo chấm giữa đường để uốn; chuột phải vào chấm ⇒ thẳng lại.
 * - Kéo nền để di chuyển, lăn chuột để zoom; kéo máy để dời; bấm đúp máy để (đổi) công thức; chuột phải
 *   vào cổng ⇒ đổi mặt đặt cổng; Delete xoá máy đang chọn; Ctrl+Z / Ctrl+Y.
 * - Cột công cụ + tay kéo bảng Tổng hợp ở góc phải trên, như bên Map.
 */
/** Phím chữ cái: theo `code`; vài môi trường gửi Ctrl+phím với `code` rỗng ⇒ dựa vào `key`. */
const isKey = (e: KeyboardEvent, letter: string): boolean => (e.code ? e.code === `Key${letter}` : e.key.toLowerCase() === letter.toLowerCase());

/**
 * Thu nhỏ tối đa của sơ đồ (người dùng 2026-10-06: sơ đồ Model hoá cao quá, ở 0,25 không nhìn được tổng thể) — 0,06 vẫn
 * thấy được hình dáng dây chuyền; "Vừa màn hình" cũng được thu xuống tới mức này.
 */
const MIN_ZOOM = 0.06;

/** Bộ nhớ tạm Ctrl+C / Ctrl+V của Modeler — dùng chung mọi tab Modeler, mất khi tải lại trang. */
let modelerClip: { nodes: MNode[]; edges: MEdge[] } | null = null;

export function mountModeler(root: HTMLElement, deps: ModelerDeps): () => void {
  const { state, doc } = deps;
  const ds = state.ds;
  // sơ đồ mới có sẵn máy mà chưa có vị trí nhìn (vd. Model hoá từ Thư viện công thức) ⇒ vừa màn hình khi mở
  const fitOnOpen = !doc.view && doc.nodes.length > 0;
  doc.view ??= { x: 60, y: 60, zoom: 1 };
  const view = doc.view;

  /** Máy đang chọn — một máy hoặc cả nhóm (kéo khung / Ctrl+bấm), người dùng 2026-09-29. */
  let selected = new Set<string>();
  /** Tên / icon vật phẩm, kể cả "vật phẩm" môi trường của máy khuếch tán. */
  const label = (item: string): string =>
    isEnvItem(item) ? tr('Môi trường {0}', CATALYST_ENV_LABEL[envOf(item)] ?? envOf(item)) : itemName(ds, item);
  const icon = (item: string): string =>
    isEnvItem(item) ? itemIconSrc(state, ENV_ICON[envOf(item)] ?? 'item_gas_inert') : itemIconSrc(state, item);
  /** Kết quả tính toán — tính lại mỗi lần vẽ lại sơ đồ. */
  let calc: ModelerCalc = computeModeler(ds, doc);
  const changed = (): void => {
    root.querySelector('.md-empty')?.toggleAttribute('hidden', doc.nodes.length > 0 || (doc.drawings?.length ?? 0) > 0);
    deps.onChange();
  };
  const undo: string[] = [];
  const redo: string[] = [];
  // nét vẽ / chữ cũng hoàn tác được (bút vẽ, người dùng 2026-09-30)
  const snap = (): string => JSON.stringify({ nodes: doc.nodes, edges: doc.edges, drawings: doc.drawings ?? [] });
  /** Bọc mọi thay đổi để hoàn tác được. */
  const mutate = (fn: () => void): void => {
    const before = snap();
    fn();
    if (snap() === before) return;
    undo.push(before);
    if (undo.length > 150) undo.shift();
    redo.length = 0;
    render();
    changed();
  };
  const restore = (from: string[], to: string[]): void => {
    const s = from.pop();
    if (!s) return;
    to.push(snap());
    const d = JSON.parse(s) as Pick<ModelerDoc, 'nodes' | 'edges' | 'drawings'>;
    doc.nodes = d.nodes;
    doc.edges = d.edges;
    if (d.drawings?.length) doc.drawings = d.drawings;
    else delete doc.drawings;
    selected = new Set();
    render();
    changed();
  };

  // ------------------------------------------------------------------ khung
  clear(root);
  const viewport = el('div', { class: 'md-viewport' });
  const world = el('div', { class: 'md-world' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'md-edges');
  const labels = el('div', { class: 'md-labels' });
  const nodesLayer = el('div', { class: 'md-nodes' });
  // lớp bút vẽ: trên cùng (khoanh / ghi chú lên cả máy); chỉ bắt chuột khi đang dùng tẩy
  const ink = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ink.setAttribute('class', `md-ink${doc.inkHidden ? ' hidden' : ''}`);
  // lớp khung chữ nhật: **dưới** đường nối và các máy (người dùng 2026-10-02)
  const inkBack = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  inkBack.setAttribute('class', `md-ink md-ink-back${doc.inkHidden ? ' hidden' : ''}`);
  world.append(inkBack, svg, nodesLayer, labels, ink);
  viewport.append(world);

  // Cột công cụ góc phải trên + tay kéo bảng Tổng hợp dưới cùng — giống hệt bên Map (người dùng 2026-09-29)
  const dockBtn = (title: string, icon: SVGSVGElement, onClick: () => void, key?: string, disabled = false): HTMLElement => {
    const b = el(
      'button',
      {
        class: 'dock-btn',
        title: key ? `${title}  (${key})` : title,
        disabled,
        onclick: (e: Event) => {
          e.stopPropagation();
          onClick();
        },
      },
      icon,
    );
    if (key) b.append(el('span', { class: 'dock-key' }, key));
    return b;
  };
  /**
   * Thanh trên: Hoàn tác, Làm lại, Bản vẽ — đúng cấu hình bên Map (`mountTopbar`), cùng chỗ (góc trên bản vẽ,
   * sát cột chọn máy). "Bản vẽ" mở thư viện ở tab Modeler (lưu / mở sơ đồ; Ctrl+S = lưu).
   */
  const topbar = el('nav', { class: 'topbar md-topbar' });
  const renderTopbar = (): void => {
    clear(topbar);
    const wide = dockBtn(tr('Bản vẽ — lưu / mở sơ đồ Modeler (Ctrl+S lưu)'), dockIcon('library'), () => window.dispatchEvent(new Event('efp:open-library')));
    wide.classList.add('wide');
    wide.append(el('span', { class: 'dock-text' }, tr('Bản vẽ')));
    topbar.append(
      el(
        'div',
        { class: 'dock-row' },
        dockBtn(tr('Hoàn tác (Ctrl+Z)'), dockIcon('undo'), () => restore(undo, redo), undefined, undo.length === 0),
        dockBtn(tr('Làm lại (Ctrl+Shift+Z)'), dockIcon('redo'), () => restore(redo, undo), undefined, redo.length === 0),
        // điện thoại: nút Bản vẽ nằm ở cột nút bên phải như bên Map (người dùng 2026-10-06)
        isTouchUI() ? null : wide,
      ),
    );
  };
  /** Cột phải: đang chọn máy ⇒ Sao chép (C), Xoá (Del) — cho một máy hay cả nhóm; luôn có Vừa màn hình. */
  const tools = el('div', { class: 'dock-group' });
  const renderTools = (): void => {
    clear(tools);
    const n = selected.size;
    const what = n === 1 ? (ds.machines.get(doc.nodes.find((x) => selected.has(x.id))?.machineId ?? '')?.name ?? tr('máy')) : tr('{0} máy', n);
    if (n > 0) {
      const mv = dockBtn(tr('Di chuyển {0} — đi theo chuột, bấm trái để đặt, Esc trả về chỗ cũ', what), dockIcon('move'), () => (moving ? finishMove() : startMove()), 'M');
      mv.classList.toggle('active', !!moving);
      tools.append(mv);
    }
    if (n > 0)
      tools.append(
        dockBtn(tr('Sao chép {0} — bản sao đặt lệch bên cạnh; đường nối ra ngoài nhóm tự bị cắt (Ctrl+C / Ctrl+V: bộ nhớ tạm)', what), dockIcon('copy'), () => copySelected(), 'C'),
        dockBtn(tr('Xoá {0}', what), dockIcon('erase'), () => deleteSelected(), 'Del'),
      );
    const penBtn = dockBtn(pen ? tr('Tắt bút vẽ  (Esc)') : tr('Bút vẽ — vẽ tự do, viết chữ lên sơ đồ'), dockIcon('pen'), () => setPen(pen ? null : lastTool));
    penBtn.classList.toggle('active', !!pen);
    // ẩn / hiện nét vẽ + chữ (người dùng 2026-10-02) — lưu theo sơ đồ
    const hidden = !!doc.inkHidden;
    const eyeBtn = dockBtn(hidden ? tr('Hiện nét vẽ / chữ') : tr('Ẩn nét vẽ / chữ'), dockIcon(hidden ? 'eyeOff' : 'eye'), () => setInkHidden(!doc.inkHidden));
    eyeBtn.classList.toggle('active', hidden);
    // điện thoại: đang chọn nút ⇒ chỉ còn nút thao tác với nút đó, ẩn 4 nút mặc định (người dùng 2026-10-06)
    if (isTouchUI() && n > 0 && !pen) return;
    tools.append(penBtn, eyeBtn, dockBtn(tr('Vừa màn hình — đưa cả sơ đồ vào giữa'), dockIcon('fit'), () => fit()));
    if (isTouchUI())
      tools.append(dockBtn(tr('Bản vẽ — lưu / mở sơ đồ Modeler (Ctrl+S lưu)'), dockIcon('library'), () => window.dispatchEvent(new Event('efp:open-library'))));
  };

  // ------------------------------------------------------------------ bút vẽ (người dùng 2026-09-30)
  /**
   * Bút vẽ: nút ở cột phải bật / tắt; bật thì hiện **thanh bút** giữa mép trên: Bút (vẽ tự do) · Chữ (bấm chỗ
   * trống để viết, bấm chữ có sẵn để sửa) · Tẩy (bấm / rê qua nét hoặc chữ để xoá), bảng màu + ô màu tuỳ ý,
   * thanh độ dày riêng. Đang bật bút thì chuột trái chỉ vẽ; chuột phải / giữa / Space vẫn kéo bản vẽ, lăn vẫn zoom.
   */
  let pen: InkTool | null = null;
  let lastTool: InkTool = 'draw';
  const inkSet = loadInk();
  const penBar = el('div', { class: 'md-penbar', hidden: true });
  // bấm nút trên thanh bút không lấy mất ô chữ đang viết (thanh trượt / ô màu vẫn nhận chuột bình thường)
  penBar.addEventListener('mousedown', (e) => {
    if (!(e.target as HTMLElement).closest('input')) e.preventDefault();
  });
  const setInkHidden = (v: boolean): void => {
    if (v) doc.inkHidden = true;
    else delete doc.inkHidden;
    ink.classList.toggle('hidden', !!doc.inkHidden);
    inkBack.classList.toggle('hidden', !!doc.inkHidden);
    renderTools();
    deps.onChange();
  };
  const setPen = (t: InkTool | null): void => {
    commitText();
    // bật bút khi nét vẽ đang ẩn ⇒ hiện lại cho thấy mình đang vẽ gì
    if (t && doc.inkHidden) setInkHidden(false);
    pen = t;
    if (t) lastTool = t;
    viewport.classList.remove('pen-draw', 'pen-rect', 'pen-text', 'pen-erase');
    if (t) viewport.classList.add(`pen-${t}`);
    if (t) {
      selected = new Set();
      markSelected();
    }
    renderPenBar();
    renderTools();
  };
  const renderPenBar = (): void => {
    penBar.hidden = !pen;
    clear(penBar);
    if (!pen) return;
    const toolBtn = (t: InkTool, icon: 'pen' | 'rect' | 'text' | 'eraser', title: string): HTMLElement => {
      const b = el('button', { class: `md-pen-tool${pen === t ? ' active' : ''}`, title, onclick: () => setPen(t) }, dockIcon(icon));
      return b;
    };
    const swatches = el(
      'div',
      { class: 'md-pen-colors' },
      ...INK_COLORS.map((c) =>
        el('button', {
          class: `md-pen-color${inkSet.color.toLowerCase() === c ? ' active' : ''}`,
          style: `background:${c}`,
          title: c,
          onclick: () => setInk({ color: c }),
        }),
      ),
    );
    const custom = el('input', { type: 'color', class: 'md-pen-custom', title: tr('Màu tuỳ chọn'), value: inkSet.color });
    // đang kéo trong bảng chọn màu của hệ thống: chỉ đổi màu, không dựng lại thanh (bảng chọn sẽ bị đóng)
    custom.addEventListener('input', () => {
      inkSet.color = custom.value;
      showWidth();
      restyleEditing();
    });
    custom.addEventListener('change', () => {
      setInk({ color: custom.value });
      editing?.box.focus();
    });
    const width = el('input', { type: 'range', class: 'md-pen-width', min: String(INK_MIN), max: String(INK_MAX), step: '1', title: tr('Độ dày nét') });
    width.value = String(inkSet.width);
    const dot = el('span', { class: 'md-pen-dot' });
    const val = el('span', { class: 'md-pen-val' });
    const showWidth = (): void => {
      const w = Math.min(inkSet.width, 22);
      dot.style.cssText = `width:${w}px;height:${w}px;background:${inkSet.color}`;
      val.textContent = pen === 'text' ? `${inkTextSize(inkSet.width)}px` : `${inkSet.width}px`;
    };
    width.addEventListener('input', () => {
      inkSet.width = Number(width.value);
      showWidth();
      restyleEditing();
    });
    width.addEventListener('change', () => {
      saveInk(inkSet);
      editing?.box.focus();
    });
    showWidth();
    // bảng dọc bật ra ngay bên trái cột nút (cạnh nút bút): công cụ · bảng màu · độ dày
    swatches.append(custom);
    penBar.append(
      el(
        'div',
        { class: 'md-pen-row' },
        toolBtn('draw', 'pen', tr('Bút — kéo chuột trái để vẽ')),
        toolBtn('rect', 'rect', tr('Hình chữ nhật — kéo để vẽ khung (chỉ viền), nằm dưới các máy')),
        toolBtn('text', 'text', tr('Chữ — bấm chỗ trống để viết, bấm chữ có sẵn để sửa (Enter: xong, Shift+Enter: xuống dòng)')),
        toolBtn('erase', 'eraser', tr('Tẩy — bấm hoặc rê qua nét / chữ để xoá')),
        el('button', { class: 'md-pen-close', title: tr('Tắt bút vẽ  (Esc)'), onclick: () => setPen(null) }, '×'),
      ),
      el('div', { class: 'md-pen-label' }, tr('Màu')),
      swatches,
      el('div', { class: 'md-pen-row' }, el('span', { class: 'md-pen-label' }, pen === 'text' ? tr('Cỡ chữ') : tr('Độ dày')), el('span', { class: 'md-pen-preview' }, dot), val),
      width,
    );
  };
  const setInk = (s: Partial<typeof inkSet>, save = true): void => {
    Object.assign(inkSet, s);
    if (save) saveInk(inkSet);
    renderPenBar();
    restyleEditing();
  };

  /** Vẽ lại mọi nét / chữ. */
  const drawInk = (): void => {
    ink.replaceChildren();
    inkBack.replaceChildren();
    const NS = 'http://www.w3.org/2000/svg';
    for (const d of doc.drawings ?? []) {
      if (d.kind === 'rect') {
        // khung chữ nhật: chỉ viền, nằm dưới các máy
        for (const cls of ['md-ink-hit', 'md-ink-stroke']) {
          const r = document.createElementNS(NS, 'rect');
          r.setAttribute('x', String(d.x));
          r.setAttribute('y', String(d.y));
          r.setAttribute('width', String(d.w));
          r.setAttribute('height', String(d.h));
          r.setAttribute('class', cls);
          r.setAttribute('stroke-width', String(cls === 'md-ink-hit' ? d.width + 12 : d.width));
          if (cls === 'md-ink-stroke') r.setAttribute('stroke', d.color);
          r.dataset.ink = d.id;
          inkBack.append(r);
        }
      } else if (d.kind === 'stroke') {
        const path = inkPath(d.points);
        const hit = document.createElementNS(NS, 'path');
        hit.setAttribute('d', path);
        hit.setAttribute('class', 'md-ink-hit');
        hit.setAttribute('stroke-width', String(d.width + 12));
        hit.dataset.ink = d.id;
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', path);
        p.setAttribute('class', 'md-ink-stroke');
        p.setAttribute('stroke', d.color);
        p.setAttribute('stroke-width', String(d.width));
        p.dataset.ink = d.id;
        ink.append(hit, p);
      } else {
        if (editing?.id === d.id) continue; // đang sửa: ô nhập thay chỗ
        const size = inkTextSize(d.width);
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('class', 'md-ink-text');
        t.setAttribute('fill', d.color);
        t.setAttribute('font-size', String(size));
        t.dataset.ink = d.id;
        d.text.split('\n').forEach((line, i) => {
          const s = document.createElementNS(NS, 'tspan');
          s.setAttribute('x', String(d.x));
          s.setAttribute('y', String(d.y + size * (i * INK_LINE + 0.95)));
          s.textContent = line || ' ';
          s.dataset.ink = d.id;
          t.append(s);
        });
        ink.append(t);
      }
    }
    if (liveStroke) ink.append(liveStroke);
    if (liveRect) inkBack.append(liveRect);
  };
  /** Khung chữ nhật đang kéo dở. */
  let liveRect: SVGRectElement | null = null;

  /** Nét đang vẽ dở (chưa vào sơ đồ). */
  let liveStroke: SVGPathElement | null = null;

  /** Ô chữ đang viết / sửa. */
  let editing: { id: string; box: HTMLTextAreaElement; x: number; y: number; isNew: boolean; before: string } | null = null;
  const restyleEditing = (): void => {
    if (!editing) return;
    const size = inkTextSize(inkSet.width) * view.zoom;
    const p = { x: editing.x * view.zoom + view.x, y: editing.y * view.zoom + view.y };
    editing.box.style.cssText = `left:${p.x}px;top:${p.y}px;font-size:${size}px;line-height:${INK_LINE};color:${inkSet.color}`;
    fitTextBox();
  };
  const fitTextBox = (): void => {
    if (!editing) return;
    const b = editing.box;
    const lines = b.value.split('\n');
    b.rows = Math.max(1, lines.length);
    b.cols = Math.max(4, ...lines.map((l) => l.length + 1));
  };
  const openText = (at: { x: number; y: number }, existing?: Extract<MDrawing, { kind: 'text' }>): void => {
    commitText();
    if (existing) setInk({ color: existing.color, width: existing.width }, false);
    const box = el('textarea', { class: 'md-ink-edit', spellcheck: false }) as HTMLTextAreaElement;
    box.value = existing?.text ?? '';
    editing = { id: existing?.id ?? newId('t'), box, x: existing?.x ?? at.x, y: existing?.y ?? at.y, isNew: !existing, before: snap() };
    root.append(box);
    restyleEditing();
    drawInk();
    box.addEventListener('input', fitTextBox);
    box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelText();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitText();
      }
    });
    // bấm màu / kéo độ dày trên thanh bút trong lúc viết: không chốt chữ (đổi màu / cỡ của chính chữ đang viết)
    box.addEventListener('blur', (e) => {
      if (!penBar.contains(e.relatedTarget as Node | null)) commitText();
    });
    box.addEventListener('mousedown', (e) => e.stopPropagation());
    setTimeout(() => box.focus(), 0);
  };
  /** Ghi chữ đang viết vào sơ đồ (trống ⇒ bỏ / xoá chữ cũ). Một bước hoàn tác. */
  const commitText = (): void => {
    const ed = editing;
    if (!ed) return;
    editing = null;
    ed.box.remove();
    const text = ed.box.value.replace(/\s+$/, '');
    const list = (doc.drawings ??= []);
    const i = list.findIndex((d) => d.id === ed.id);
    if (text) {
      const d: MDrawing = { id: ed.id, kind: 'text', color: inkSet.color, width: inkSet.width, x: ed.x, y: ed.y, text };
      if (i >= 0) list[i] = d;
      else list.push(d);
    } else if (i >= 0) list.splice(i, 1);
    if (!list.length) delete doc.drawings;
    if (snap() !== ed.before) {
      undo.push(ed.before);
      redo.length = 0;
      changed();
    }
    render();
  };
  const cancelText = (): void => {
    const ed = editing;
    if (!ed) return;
    editing = null;
    ed.box.remove();
    drawInk();
  };
  /** Tẩy: xoá nét / chữ dưới con trỏ (trả về đã xoá gì không). */
  const eraseAt = (cx: number, cy: number): boolean => {
    const hit = (document.elementFromPoint(cx, cy) as Element | null)?.closest?.('[data-ink]') as SVGElement | null;
    const id = hit?.dataset.ink;
    if (!id || !doc.drawings) return false;
    doc.drawings = doc.drawings.filter((d) => d.id !== id);
    if (!doc.drawings.length) delete doc.drawings;
    drawInk();
    return true;
  };
  const handleOpen = dockIcon('drawerOpen');
  handleOpen.classList.add('when-open');
  const handleClosed = dockIcon('drawerClosed');
  handleClosed.classList.add('when-closed');
  const dock = el(
    'nav',
    { class: 'dock md-dock' },
    tools,
    el(
      'div',
      { class: 'dock-group dock-drawer' },
      el(
        'button',
        {
          class: 'drawer-handle',
          title: tr('Đóng / mở bảng tổng hợp  (F3)'),
          onclick: (e: Event) => {
            e.stopPropagation();
            window.dispatchEvent(new Event('efp:toggle-summary'));
          },
        },
        handleOpen,
        handleClosed,
      ),
    ),
  );
  // bảng Tổng hợp nổi góc phải trên — cùng kiểu (và cùng phím F3) với bảng Tổng hợp của Map
  const summaryBody = el('div', { class: 'panel-body' });
  const summary = el(
    'aside',
    { class: 'panel right md-summary' },
    el('div', { class: 'panel-section right-summary' }, el('div', { class: 'panel-head' }, tr('Tổng hợp')), summaryBody),
  );
  const empty = el(
    'div',
    { class: 'md-empty', hidden: doc.nodes.length > 0 || (doc.drawings?.length ?? 0) > 0 },
    el('div', { class: 'modeler-title' }, tr('Sơ đồ trống')),
    el('div', {}, tr('Bấm một máy ở cột bên trái (hoặc phím 1…0) để thêm vào sơ đồ.')),
  );
  const boxEl = el('div', { class: 'md-box', hidden: true });
  root.append(viewport, boxEl, topbar, dock, penBar, summary, empty);

  const applyView = (): void => {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
    restyleEditing();
  };
  const toWorld = (cx: number, cy: number): { x: number; y: number } => {
    const r = viewport.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.zoom, y: (cy - r.top - view.y) / view.zoom };
  };

  // ------------------------------------------------------------------ nút
  const nodeEls = new Map<string, HTMLElement>();

  const portEl = (n: MNode, key: string): HTMLElement | null =>
    nodesLayer.querySelector<HTMLElement>(`[data-node="${n.id}"][data-key="${CSS.escape(key)}"]`);

  const nodeView = (n: MNode): HTMLElement => {
    const def = ds.machines.get(n.machineId);
    const r = recipeOf(ds, n);
    const ports = nodePorts(ds, n, doc.edges);
    const nc = calc.nodes.get(n.id);
    const blank = isBlank(ds, n);
    const kind = kindOfNode(ds, n);
    const side = (s: Side): HTMLElement =>
      el(
        'div',
        { class: `md-side ${s}` },
        ...ports
          // cổng môi trường = bảng tên trên đầu nút; máy khuếch tán không hiện cổng nào (người dùng 2026-09-29)
          .filter((p) => p.side === s && !isEnvItem(p.item) && kind !== 'env')
          .map((p) => {
            const c = nc?.target != null || kind === 'sewageOut' ? nc?.ports.get(p.key) : undefined;
            const shown = c ? (p.dir === 'in' ? c.flow : c.want) : null;
            const env = isEnvItem(p.item);
            return el(
              'button',
              {
                class: `md-port ${p.dir}${p.slot === 'act' ? ' act' : ''}${p.color ? ` slot-${p.color}` : ''}${kind === 'crucible' ? ' cru-slot' : ''}${env ? ' env' : ''}${c && c.state !== 'ok' ? ` ${c.state}` : ''}`,
                'data-node': n.id,
                'data-key': p.key,
                // rê chuột: chỉ tên sản phẩm + lưu lượng (người dùng 2026-10-06)
                title: c && !env ? `${label(p.item)} — ${tr('{0}/phút', num(shown!))}` : label(p.item),
              },
              el('img', { src: icon(p.item), alt: '' }),
              c && !env ? el('span', { class: `md-rate ${s}` }, c.state === 'ok' ? num(shown!, 1) : `${c.state === 'short' ? '−' : '+'}${num(c.diff, 1)}`) : null,
            );
          }),
      );
    const limit = el('input', {
      class: 'md-limit',
      type: 'text',
      inputmode: 'decimal',
      placeholder: '∞',
      // lò để trống ⇒ số lò theo nhu cầu phía sau như máy thường (người dùng 2026-10-04 — trước đây trống = 1 lò)
      title: kind === 'crucible' ? tr('Số lò (để trống = tính theo nhu cầu phía sau)') : tr('Số máy tối đa được dùng (để trống = không giới hạn)'),
      value: n.limit === null ? '' : String(n.limit),
    });
    limit.addEventListener('change', () => {
      const raw = limit.value.trim().replace(',', '.');
      const v = raw === '' ? null : Number(raw);
      if (v !== null && (!Number.isFinite(v) || v < 0)) {
        limit.value = n.limit === null ? '' : String(n.limit);
        deps.notify(tr('Số máy phải là số không âm'));
        return;
      }
      mutate(() => (n.limit = v));
    });
    const source = !!def && choosesItem(def);
    // Bộ Xử Lý Nước Thải: không có nút chọn — hiện thời gian mỗi lần xử lý như công thức (2s) (người dùng 2026-09-29)
    const cleaner = n.machineId === 'liquid_cleaner_1';
    // máy khuếch tán: nền đổi theo màu khí đã nhận, tên thành TRƠ / ACID
    const envName = kind === 'env' && n.item ? ENV_GASES[n.item] : undefined;
    const itemHint =
      kind === 'source'
        ? tr('lấy ra từ kho (vô hạn)')
        : kind === 'sink'
          ? n.machineId === 'liquid_cleaner_1'
            ? tr('xử lý (xoá sạch)')
            : n.machineId === SEWAGE_OUT.inlet
              ? tr('nạp vào (sang Cửa Xả Phụ Phẩm)')
              : SINKS[n.machineId]?.tank
                ? tr('chứa trong bể (khí / chất lỏng không vào kho tổng)')
                : tr('đưa vào kho tổng')
          : kind === 'env'
            ? tr('kích hoạt (Khí Trơ / Khí Axit)')
            : tr('cho qua');
    const body = el(
      'div',
      {
        class: 'md-body',
        title: def
          ? blank
            ? tr('{0} — chưa chọn {1}: kéo một cổng của máy khác thả vào đây để tự chọn, hoặc bấm đúp', def.name, source ? tr('vật phẩm') : tr('công thức'))
            : tr('{0} — bấm đúp để đổi {1}', def.name, source ? tr('vật phẩm') : tr('công thức'))
          : n.machineId,
        ondblclick: () => {
          if (pen) return; // đang dùng bút vẽ: bấm nhanh hai lần là vẽ, không mở hộp công thức
          if (def && kind === 'crucible') pickTicks(def, n);
          else if (def && kind === 'crafter') pickRecipe(def, n);
          else if (def && source) pickSourceItem(def, n);
        },
      },
      el('img', { class: 'md-machine', src: `img/items/${def?.icon ?? n.machineId}.png`, alt: '' }),
      el('div', { class: `md-name${envName ? ' md-env-name' : ''}` }, envName ? plateText(envName) : (def?.name ?? n.machineId)),
      envName ? el('div', { class: 'md-sub' }, def?.name ?? '') : null,
      kind === 'env' && !n.item ? el('div', { class: 'md-sub md-blank' }, tr('Kéo một cổng khí trơ / axit vào đây')) : null,
      r ? el('div', { class: 'md-sub' }, `${fmt(r.seconds, 2)}s`) : null,
      cleaner && n.item ? el('div', { class: 'md-sub' }, '2s') : null,
      kind === 'crucible' ? crucibleInfo(n) : null,
      blank && (!source || cleaner) && kind !== 'env' ? el('div', { class: 'md-sub md-blank' }, tr('Chưa chọn công thức')) : null,
      kind === 'sewageOut' ? el('div', { class: 'md-sub' }, tr('{0} nước thải vào các cửa nạp → 1', SEWAGE_OUT.ratio)) : null,
      // máy "chọn vật phẩm": nút chọn (máy nguồn: lấy từ kho vô hạn; kho: đưa vào kho tổng; …)
      def && source && !cleaner && kind !== 'env'
        ? el(
            'button',
            {
              class: 'md-src-btn',
              title:
                kind === 'source'
                  ? tr('Chọn vật phẩm {0} {1}', (sourcePhases(def) ?? []).map((p) => PHASE_LABEL[p]).join(' / '), itemHint)
                  : tr('Chọn vật phẩm {0}', itemHint),
              onclick: (ev: Event) => {
                ev.stopPropagation();
                pickSourceItem(def, n);
              },
            },
            n.item ? el('img', { src: itemIconSrc(state, n.item), alt: '' }) : null,
            el('span', {}, n.item ? itemName(ds, n.item) : tr('Chọn vật phẩm')),
            kind === 'source' ? el('span', { class: 'md-inf', title: tr('Lấy từ kho — vô hạn') }, '∞') : null,
          )
        : null,
    );
    // bảng tên môi trường trên đầu nút: máy cần môi trường (đỏ khi chưa có) và máy khuếch tán đã nhận khí —
    // kéo từ bảng tên để nối máy khuếch tán ⇄ máy cần môi trường
    const envPort = ports.find((p) => isEnvItem(p.item));
    // máy khuếch tán không có bảng tên — người dùng nối từ bảng tên của máy cần môi trường tới nó
    const plate = envPort && kind !== 'env'
      ? el(
          'button',
          {
            class: `md-port md-plate ${envPort.dir} env-${envOf(envPort.item)}${nc?.env === false && (nc.target ?? 0) > 0 ? ' short' : ''}`,
            'data-node': n.id,
            'data-key': envPort.key,
            title:
              envPort.dir === 'out'
                ? tr('Môi trường {0} — kéo tới máy có công thức cần môi trường này', label(envPort.item))
                : tr('Cần {0} — kéo tới một máy khuếch tán (khí {1}){2}', label(envPort.item), plateText(envOf(envPort.item)), nc?.env === false ? tr(' · CHƯA CÓ') : ''),
          },
          plateText(envOf(envPort.item)),
        )
      : null;
    // máy khuếch tán: đầu nhận khí kích hoạt là một chốt ẩn bên trái (không hiện cổng)
    const actAnchor =
      kind === 'env'
        ? ports.map((p) => el('span', { class: `md-anchor${p.slot === 'act' ? '' : ' center'}`, 'data-node': n.id, 'data-key': p.key }))
        : [];
    return el(
      'div',
      {
        class: `md-node${selected.has(n.id) ? ' selected' : ''}${blank ? ' blank' : ''}${kind === 'env' ? ' env-node' : ''}`,
        'data-id': n.id,
        style: `left:${n.x}px;top:${n.y}px${kind === 'env' && n.item && FLUID_COLORS[n.item] ? `;background:${FLUID_COLORS[n.item]}` : ''}`,
      },
      plate,
      ...actAnchor,
      side('top'),
      el('div', { class: 'md-mid' }, side('left'), body, side('right')),
      el('div', { class: 'md-fields' }, pctField(n), kind === 'sewageOut' ? null : limit),
      // cổng mặt dưới nằm **dưới** ô số máy: số lưu lượng của nó hiện ra ngoài nút, không đè lên ô số (người dùng 2026-09-29)
      side('bottom'),
      warn(n),
    );
  };

  /**
   * Chấm than đỏ ở góc trên phải nút khi lò kẹt — rê chuột vào hiện thông báo ngay (không trễ như `title`)
   * (người dùng 2026-09-29, thay cho dòng chữ giữa nút).
   */
  const warn = (n: MNode): HTMLElement | null => {
    const c = calc.nodes.get(n.id);
    const texts: string[] = [];
    if (c?.jam)
      texts.push(tr('Kẹt: {0} là sản phẩm cuối nhưng chưa có đường ra ⇒ lò đầy và dừng (như bên Map). Bấm vào ô của nó để chọn làm đầu ra rồi nối tới một máy nhận.', label(c.jam)));
    // nhận chất kích hoạt quá mức cần (6/phút mỗi máy) — người dùng 2026-09-30
    // chất kích hoạt tính theo số máy thật (làm tròn lên): mỗi máy cần ít nhất 6, nhận tối đa 30 — người dùng 2026-09-30
    const units = Math.ceil((c?.target ?? 0) - 1e-9);
    if (c?.actOver)
      texts.push(
        tr('Máy dùng nhiều chất kích hoạt hơn mức cần thiết: thừa {0}/phút ({1} máy chỉ cần {2}/phút — mỗi máy 6). Bấm icon trên đường ống để đặt giới hạn lưu lượng.', num(c.actOver), units, 6 * units),
      );
    if (c?.actShort)
      texts.push(
        tr('Thiếu chất kích hoạt: {0} máy cần ít nhất {1}/phút (mỗi máy 6), đang nhận {2}/phút — thiếu {3}/phút.', units, 6 * units, num(6 * units - c.actShort), num(c.actShort)),
      );
    if (texts.length === 0) return null;
    return el('span', { class: 'md-warn', 'aria-label': tr('Cảnh báo') }, '!', el('span', { class: 'md-warn-tip' }, ...texts.map((t) => el('div', {}, t))));
  };

  /**
   * Lò phản ứng: danh sách công thức đang chạy (mức chạy từng công thức), và báo **kẹt** khi một sản phẩm cuối
   * không có đường ra. Bấm đúp để tick công thức ưu tiên.
   */
  const crucibleInfo = (n: MNode): HTMLElement => {
    const c = calc.nodes.get(n.id);
    const box = el('div', { class: 'md-cru' });
    const run = c?.recipes ?? [];
    if (run.length === 0) box.append(el('div', { class: 'md-sub md-blank' }, tr('Nối nguyên liệu vào — công thức tự chạy')));
    for (const x of run)
      box.append(
        el(
          'div',
          { class: `md-cru-row${n.ticks?.includes(x.recipe.id) ? ' ticked' : ''}`, title: x.recipe.outcomes.map((s) => label(s.itemId)).join(' + ') },
          ...x.recipe.outcomes.slice(0, 2).map((s) => el('img', { src: icon(s.itemId), alt: '' })),
          el('span', {}, `${num(x.u * 100, 0)}%`),
        ),
      );
    return box;
  };

  /** Ô trên: số máy thực chạy theo % (0.83 máy = 83 %); đỏ khi chưa đạt mục tiêu. */
  const pctField = (n: MNode): HTMLElement => {
    const c = calc.nodes.get(n.id);
    // Cửa Xả Phụ Phẩm: không có số máy — hiện lượng làm ra
    if (c?.through !== undefined) return el('span', { class: 'md-pct', title: tr('Lượng làm ra mỗi phút') }, tr('{0}/phút', num(c.through, 1)));
    if (!c || c.target === null)
      return el('span', { class: 'md-pct none', title: tr('Không tính: máy cuối chưa điền số máy (ô dưới) và không máy nào cần hàng của nó') }, '—');
    const low = c.actual + 1e-6 < c.target;
    return el(
      'span',
      {
        class: `md-pct${low ? ' low' : ''}`,
        title: c.recipes
          ? tr('Lò chạy trung bình {0}% ({1} lò){2}', num((c.actual / Math.max(1e-9, c.target)) * 100, 1), num(c.target, 2), c.jam ? tr(' — KẸT') : '')
          : tr('Thực chạy {0} máy / mục tiêu {1} máy{2}', num(c.actual, 3), num(c.target, 3), n.limit === null ? tr(' (tính theo nhu cầu phía sau)') : ''),
      },
      `${num(c.actual * 100, 1)}%`,
    );
  };

  // ------------------------------------------------------------------ đường nối
  /** Tâm cổng trên sơ đồ + hướng mặt đặt. */
  const portAnchor = (n: MNode, key: string): { x: number; y: number; d: { x: number; y: number } } | null => {
    const pe = portEl(n, key);
    if (!pe) return null;
    const r = pe.getBoundingClientRect();
    const p = toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const port = nodePorts(ds, n, doc.edges).find((q) => q.key === key);
    // bảng tên môi trường ở trên đầu; chốt khí của máy khuếch tán ở bên trái
    const side: Side = port && isEnvItem(port.item) ? 'top' : pe.classList.contains('md-anchor') ? 'left' : (port?.side ?? 'right');
    return { ...p, d: DIR[side] };
  };

  const curve = (
    a: { x: number; y: number; d: { x: number; y: number } },
    b: { x: number; y: number; d: { x: number; y: number } },
    bend?: { dx: number; dy: number },
  ): { d: string; mid: { x: number; y: number } } => {
    const k = Math.max(40, Math.hypot(b.x - a.x, b.y - a.y) / 2.5);
    const c0 = { x: a.x + a.d.x * k, y: a.y + a.d.y * k };
    const c1 = { x: b.x + b.d.x * k, y: b.y + b.d.y * k };
    // điểm giữa của đường Bézier gốc (t = 0.5)
    const base = { x: (a.x + 3 * c0.x + 3 * c1.x + b.x) / 8, y: (a.y + 3 * c0.y + 3 * c1.y + b.y) / 8 };
    if (!bend) return { d: `M${a.x},${a.y} C${c0.x},${c0.y} ${c1.x},${c1.y} ${b.x},${b.y}`, mid: base };
    const m = { x: base.x + bend.dx, y: base.y + bend.dy };
    const t = { x: (c1.x - c0.x) / 4, y: (c1.y - c0.y) / 4 };
    return {
      d:
        `M${a.x},${a.y} C${c0.x},${c0.y} ${m.x - t.x},${m.y - t.y} ${m.x},${m.y} ` +
        `C${m.x + t.x},${m.y + t.y} ${c1.x},${c1.y} ${b.x},${b.y}`,
      mid: m,
    };
  };

  let tempPath: SVGPathElement | null = null;

  /**
   * Vẽ lại mọi đường nối. Tối ưu (người dùng 2026-10-06: sơ đồ ~70 máy kéo một nút giật, ~150 ms mỗi lần rê chuột):
   * **đọc hết** vị trí cổng trước (một lần tính bố cục — trước đây đọc / ghi xen kẽ theo từng đường nên trình duyệt phải
   * tính lại bố cục cho mỗi đường), nhớ tạm danh sách cổng của mỗi máy và phần tử cổng, rồi mới dựng đường vào một
   * fragment và gắn một lần.
   */
  /** Hàm lấy vị trí + hướng cổng, nhớ tạm phần tử cổng và danh sách cổng của mỗi máy trong một lần vẽ. */
  const makeAnchorOf = (): ((n: MNode, key: string) => ReturnType<typeof portAnchor>) => {
    const portEls = new Map<string, HTMLElement>();
    for (const pe of nodesLayer.querySelectorAll<HTMLElement>('[data-node][data-key]')) portEls.set(`${pe.dataset.node}|${pe.dataset.key}`, pe);
    const portsMemo = new Map<string, ReturnType<typeof nodePorts>>();
    const anchorOf = (n: MNode, key: string): ReturnType<typeof portAnchor> => {
      const pe = portEls.get(`${n.id}|${key}`);
      if (!pe) return null;
      const r = pe.getBoundingClientRect();
      const p = toWorld(r.left + r.width / 2, r.top + r.height / 2);
      let ports = portsMemo.get(n.id);
      if (!ports) portsMemo.set(n.id, (ports = nodePorts(ds, n, doc.edges)));
      const port = ports.find((q) => q.key === key);
      const side: Side = port && isEnvItem(port.item) ? 'top' : pe.classList.contains('md-anchor') ? 'left' : (port?.side ?? 'right');
      return { ...p, d: DIR[side] };
    };
    return anchorOf;
  };
  /** Hình của một đường nối (đường đi + điểm giữa cho nhãn); `null` khi chưa thấy cổng. */
  const planEdge = (e: MEdge, anchorOf: ReturnType<typeof makeAnchorOf>, byId: Map<string, MNode>): { e: MEdge; c: { d: string; mid: { x: number; y: number } } } | null => {
    const a = byId.get(e.from.node);
    const b = byId.get(e.to.node);
    const pa = a && anchorOf(a, fromKey(e));
    const pb = b && anchorOf(b, toKey(e));
    if (!pa || !pb) return null;
    // đường môi trường: luôn thẳng từ máy khuếch tán tới bảng tên của máy cần môi trường (người dùng 2026-09-29)
    const env = isEnvItem(e.from.item);
    // đường thường: qua lần lượt các điểm neo (người dùng 2026-09-30) — `route.ts`
    const segs = env ? null : routeSegments(pa, pb, anchorsOf(e, pa, pb));
    return { e, c: segs ? { d: routePath(segs), mid: routeMid(segs) } : straightEnv(a!, pb) };
  };
  /**
   * Đang kéo máy / dời nhóm: chỉ cập nhật hình các đường **dính vào máy đang dời** (đường đi, nhãn giữa, chấm điểm neo)
   * thay cho dựng lại cả lớp đường nối (người dùng 2026-10-06: sơ đồ lớn kéo nút bị giật).
   */
  const moveEdges = (moved: Set<string>): void => {
    edgesQueued = false;
    const touched = doc.edges.filter((e) => moved.has(e.from.node) || moved.has(e.to.node));
    const anchorOf = makeAnchorOf();
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));
    const plans = touched.map((e) => planEdge(e, anchorOf, byId)); // đọc hết trước
    for (const plan of plans) {
      if (!plan) continue;
      const id = CSS.escape(plan.e.id);
      for (const el2 of svg.querySelectorAll<SVGElement>(`[data-edge="${id}"]`)) {
        if (el2.tagName === 'path') el2.setAttribute('d', plan.c.d);
        else if (el2.tagName === 'circle') {
          const p = plan.e.points?.[Number(el2.dataset.idx)];
          if (p) {
            el2.setAttribute('cx', String(p.x));
            el2.setAttribute('cy', String(p.y));
          }
        }
      }
      const tag = labels.querySelector<HTMLElement>(`[data-edge="${id}"]`);
      if (tag) {
        tag.style.left = `${plan.c.mid.x}px`;
        tag.style.top = `${plan.c.mid.y}px`;
      }
    }
  };
  const drawEdges = (): void => {
    edgesQueued = false;
    const anchorOf = makeAnchorOf();
    const byId = new Map(doc.nodes.map((n) => [n.id, n]));
    // 1. đọc
    const plans = doc.edges.map((e) => planEdge(e, anchorOf, byId));
    // 2. ghi
    const lines = document.createDocumentFragment();
    const tags = document.createDocumentFragment();
    for (const plan of plans) {
      if (!plan) continue;
      const { e, c } = plan;
      const rate = calc.edges.get(e.id);
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', c.d);
      hit.setAttribute('class', 'md-edge-hit');
      hit.dataset.edge = e.id;
      const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      tip.textContent = tr('{0} — bấm để bỏ nối', label(e.from.item));
      hit.append(tip);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      line.setAttribute('d', c.d);
      // cả cổng ra lẫn cổng vào của đường đều đang đỏ (thiếu) ⇒ đường cũng đỏ; hết thiếu thì về màu thường (người dùng
      // 2026-10-06, lần 5)
      const bad =
        calc.nodes.get(e.from.node)?.ports.get(fromKey(e))?.state === 'short' && calc.nodes.get(e.to.node)?.ports.get(toKey(e))?.state === 'short';
      line.setAttribute('class', `md-edge ${isEnvItem(e.from.item) ? 'env' : kindOfItem(ds, e.from.item)}${edgeColor(e)}${calc.over.has(e.id) ? ' over' : ''}${bad ? ' bad' : ''}`);
      line.dataset.edge = e.id;
      lines.append(line, hit);
      // chấm điểm neo: kéo để dời, chuột phải / bấm đúp để xoá
      (e.points ?? []).forEach((p, i) => {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', String(p.x));
        dot.setAttribute('cy', String(p.y));
        dot.setAttribute('r', '5');
        dot.setAttribute('class', 'md-anchor-pt');
        dot.dataset.edge = e.id;
        dot.dataset.idx = String(i);
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        t.textContent = tr('Điểm neo — kéo để dời · chuột phải hoặc bấm đúp: xoá điểm neo');
        dot.append(t);
        lines.append(dot);
      });
      // nhãn giữa đường: icon vật phẩm + tốc độ — kéo để uốn, bấm để bỏ nối, chuột phải để thẳng lại
      tags.append(
        el(
          'div',
          {
            class: 'md-label',
            'data-edge': e.id,
            style: `left:${c.mid.x}px;top:${c.mid.y}px`,
            title:
              `${label(e.from.item)}` +
              (rate !== undefined ? tr(' — {0}/phút{1}', num(rate), calc.over.has(e.id) ? tr(' (vượt sức chở một tuyến)') : '') : '') +
              (e.limit ? tr(' · giới hạn {0}/phút', e.limit) : isAutoAct(e) ? tr(' · kích hoạt Tự động (số máy × 6/phút)') : '') +
              (kindOfItem(ds, e.from.item) === 'pipe' && !isEnvItem(e.from.item) ? tr(' — bấm: giới hạn lưu lượng') : '') +
              tr(' · kéo: thêm điểm neo để uốn · chuột phải: bỏ nối'),
            ...(e.limit ? { 'data-limit': String(e.limit) } : {}),
          },
          el('img', { src: icon(e.from.item), alt: '' }),
          rate !== undefined && rate > 1e-6 ? el('span', { class: 'md-lrate' }, num(rate, 1)) : null,
        ),
      );
    }
    svg.replaceChildren(lines);
    labels.replaceChildren(tags);
    if (tempPath) svg.append(tempPath);
  };
  /** Vẽ lại đường nối ở khung hình kế tiếp — gộp nhiều lần rê chuột trong một khung (kéo máy / kéo điểm neo). */
  let edgesQueued = false;
  /** `moved` = chỉ những máy này vừa dời ⇒ chỉ cập nhật đường dính vào chúng. */
  const queueEdges = (moved?: Set<string>): void => {
    if (edgesQueued) return;
    edgesQueued = true;
    requestAnimationFrame(() => {
      if (!edgesQueued) return;
      if (moved) moveEdges(moved);
      else drawEdges();
    });
  };

  /** Hai đầu (vị trí + hướng cổng) của một đường nối. */
  const endsOf = (e: MEdge): { pa: ReturnType<typeof portAnchor>; pb: ReturnType<typeof portAnchor> } => {
    const a = doc.nodes.find((n) => n.id === e.from.node);
    const b = doc.nodes.find((n) => n.id === e.to.node);
    return { pa: a ? portAnchor(a, fromKey(e)) : null, pb: b ? portAnchor(b, toKey(e)) : null };
  };
  /**
   * Điểm neo của đường nối. Sơ đồ cũ (một điểm uốn `bend` = độ lệch của điểm giữa) ⇒ một điểm neo tại điểm giữa
   * cũ + độ lệch.
   */
  const anchorsOf = (e: MEdge, pa: NonNullable<ReturnType<typeof portAnchor>>, pb: NonNullable<ReturnType<typeof portAnchor>>): Pt[] => {
    if (e.points) return e.points;
    // máy tự nối vào cổng kích hoạt của chính nó (2026-10-04): mặc định vòng xuống dưới máy, khỏi cắt ngang thân máy
    if (e.from.node === e.to.node && !e.bend) {
      const r = nodeEls.get(e.from.node)?.getBoundingClientRect();
      if (!r) return [];
      const y = toWorld(r.left, r.bottom).y + 36;
      return [
        { x: Math.round(pa.x + pa.d.x * 36), y: Math.round(y) },
        { x: Math.round(pb.x + pb.d.x * 36), y: Math.round(y) },
      ];
    }
    if (!e.bend) return [];
    const m = curve(pa, pb).mid;
    return [{ x: m.x + e.bend.dx, y: m.y + e.bend.dy }];
  };
  /** Đổi đường cũ (`bend`) sang danh sách điểm neo trước khi sửa. */
  const ensurePoints = (e: MEdge): Pt[] => {
    if (!e.points) {
      const { pa, pb } = endsOf(e);
      e.points = pa && pb ? anchorsOf(e, pa, pb).map((p) => ({ ...p })) : [];
    }
    delete e.bend;
    return e.points;
  };

  /** Đoạn thẳng từ viền máy khuếch tán `a` tới điểm `b`. */
  const straightEnv = (a: MNode, b: { x: number; y: number }): { d: string; mid: { x: number; y: number } } => {
    const r = nodeEls.get(a.id)?.getBoundingClientRect();
    let p = { x: a.x, y: a.y };
    if (r) {
      const tl = toWorld(r.left, r.top);
      const br = toWorld(r.right, r.bottom);
      const cx = (tl.x + br.x) / 2;
      const cy = (tl.y + br.y) / 2;
      const dx = b.x - cx;
      const dy = b.y - cy;
      const k = Math.min(Math.abs(dx) > 1e-6 ? (br.x - tl.x) / 2 / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? (br.y - tl.y) / 2 / Math.abs(dy) : Infinity, 1);
      p = { x: cx + dx * k, y: cy + dy * k };
    }
    return { d: `M${p.x},${p.y} L${b.x},${b.y}`, mid: { x: (p.x + b.x) / 2, y: (p.y + b.y) / 2 } };
  };

  /**
   * Màu đường ra cố định (người dùng 2026-09-29):
   * - Quả Cầu Phản Ứng Khí / Máy Tinh Chế: theo thứ tự sản phẩm của công thức, **giống bên Map** — sản phẩm 1
   *   **vàng**, sản phẩm 2 **cam**; không đổi được.
   * - Lò phản ứng: theo màu ô đã chọn — **vàng** / **cam** (lỏng, khí); hàng băng (ô đen) vẽ **trắng** cho thấy
   *   trên nền tối.
   */
  const edgeColor = (e: MEdge): string => {
    const a = doc.nodes.find((n) => n.id === e.from.node);
    if (!a) return '';
    if (kindOfNode(ds, a) === 'crucible') {
      if (kindOfItem(ds, e.from.item) !== 'pipe') return ' white';
      const port = nodePorts(ds, a, doc.edges).find((p) => p.key === `out:${e.from.item}`);
      return port?.color ? ` ${port.color}` : '';
    }
    if (!ORDERED_OUTPUTS.has(a.machineId)) return '';
    const i = recipeOf(ds, a)?.outcomes.findIndex((s) => s.itemId === e.from.item) ?? -1;
    return i === 0 ? ' yellow' : i === 1 ? ' orange' : '';
  };

  /** Thêm đường nối (lò phản ứng: gỡ đường ra cũ nhất khi quá 2 lỏng / 1 rắn) và báo nếu có đường bị gỡ. */
  /** Tâm một máy trên sơ đồ (toạ độ sơ đồ). */
  const nodeCenter = (n: MNode): { x: number; y: number } => {
    const r = nodeEls.get(n.id)?.getBoundingClientRect();
    if (!r) return { x: n.x, y: n.y };
    return toWorld((r.left + r.right) / 2, (r.top + r.bottom) / 2);
  };
  const pushEdge = (e: MEdge): void => {
    // nối khí vào **Máy Khuếch Tán**: cổng vào tự chuyển sang mặt quay về phía máy cấp khí (trước đây luôn ở mặt trái —
    // người dùng 2026-10-06)
    const to = doc.nodes.find((n) => n.id === e.to.node);
    const from = doc.nodes.find((n) => n.id === e.from.node);
    if (to && from && to !== from && kindOfNode(ds, to) === 'env') {
      const a = nodeCenter(from);
      const b = nodeCenter(to);
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const side: Side = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'top' : 'bottom';
      to.sides = { ...(to.sides ?? {}), [toKey(e)]: side };
    }
    const removed = addEdge(ds, doc, e);
    if (removed.length > 0)
      setTimeout(() => deps.notify(tr('Lò chỉ có 2 đầu ra lỏng + 1 rắn — đã gỡ đường {0}', removed.map((x) => label(x.from.item)).join(', '))), 0);
  };

  const removeEdge = (id: string): void => {
    const e = doc.edges.find((x) => x.id === id);
    if (!e) return;
    mutate(() => (doc.edges = doc.edges.filter((x) => x.id !== id)));
    deps.notify(tr('Đã bỏ nối {0}', label(e.from.item)));
  };

  /** Tô lại máy đang chọn mà không dựng lại phần tử. */
  const markSelected = (): void => {
    for (const [id, box] of nodeEls) box.classList.toggle('selected', selected.has(id));
    renderTools();
  };

  // ------------------------------------------------------------------ M: di chuyển theo chuột (2026-10-02)
  /** Vị trí chuột cuối cùng (màn hình) — cho M và Ctrl+V. */
  let lastMouse: { x: number; y: number } | null = null;
  /** `fresh` = nút vừa chọn từ bảng chọn máy, đang đi theo chuột chờ đặt (Esc ⇒ bỏ hẳn nút đó); `placed` = báo khi đặt. */
  let moving: { anchor: Pt; start: Map<string, Pt>; pts: Map<string, Pt[]>; before: string; fresh?: string; placed?: () => void } | null = null;
  const mouseWorld = (): Pt => {
    if (lastMouse) return toWorld(lastMouse.x, lastMouse.y);
    const r = viewport.getBoundingClientRect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  };
  const startMove = (): void => {
    if (selected.size === 0) return;
    const start = new Map(doc.nodes.filter((x) => selected.has(x.id)).map((x) => [x.id, { x: x.x, y: x.y }]));
    const pts = new Map(
      doc.edges.filter((x) => x.points?.length && start.has(x.from.node) && start.has(x.to.node)).map((x) => [x.id, x.points!.map((p) => ({ ...p }))]),
    );
    moving = { anchor: mouseWorld(), start, pts, before: snap() };
    viewport.classList.add('moving');
    renderTools();
    deps.notify(tr('Di chuyển {0} máy: rê chuột rồi bấm trái để đặt · Esc trả về chỗ cũ', start.size));
  };
  const shiftTo = (dx: number, dy: number): void => {
    if (!moving) return;
    for (const [id, p0] of moving.start) {
      const n = doc.nodes.find((x) => x.id === id);
      if (!n) continue;
      n.x = Math.round(p0.x + dx);
      n.y = Math.round(p0.y + dy);
      const box = nodeEls.get(id);
      if (box) {
        box.style.left = `${n.x}px`;
        box.style.top = `${n.y}px`;
      }
    }
    for (const [id, p0] of moving.pts) {
      const ed = doc.edges.find((x) => x.id === id);
      if (ed) ed.points = p0.map((p) => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) }));
    }
    queueEdges(new Set(moving.start.keys()));
  };
  const followMove = (): void => {
    if (!moving) return;
    const p = mouseWorld();
    shiftTo(p.x - moving.anchor.x, p.y - moving.anchor.y);
  };
  const finishMove = (): void => {
    const m = moving;
    if (!m) return;
    moving = null;
    viewport.classList.remove('moving');
    setModelerHolding(null);
    if (snap() !== m.before) {
      undo.push(m.before);
      redo.length = 0;
      changed();
    }
    render();
    m.placed?.();
  };
  const cancelMove = (): void => {
    if (!moving) return;
    setModelerHolding(null);
    if (moving.fresh) {
      // máy vừa chọn chưa đặt xuống ⇒ bỏ hẳn, sơ đồ như cũ
      const id = moving.fresh;
      moving = null;
      viewport.classList.remove('moving');
      doc.nodes = doc.nodes.filter((n) => n.id !== id);
      selected.delete(id);
      render();
      deps.notify(tr('Đã huỷ đặt máy'));
      return;
    }
    shiftTo(0, 0);
    moving = null;
    viewport.classList.remove('moving');
    render();
    deps.notify(tr('Đã huỷ di chuyển — máy về chỗ cũ'));
  };

  // ------------------------------------------------------------------ Ctrl+C / Ctrl+V (2026-10-02)
  const copyToClip = (): void => {
    const nodes = doc.nodes.filter((n) => selected.has(n.id));
    if (nodes.length === 0) return;
    const ids = new Set(nodes.map((n) => n.id));
    modelerClip = JSON.parse(JSON.stringify({ nodes, edges: doc.edges.filter((e) => ids.has(e.from.node) && ids.has(e.to.node)) }));
    deps.notify(tr('Đã chép {0} máy vào bộ nhớ tạm — Ctrl+V để dán (dán được sang tab Modeler khác)', nodes.length));
  };
  const pasteClip = (): void => {
    if (!modelerClip || modelerClip.nodes.length === 0) {
      deps.notify(tr('Bộ nhớ tạm trống — chọn máy rồi bấm Ctrl+C để chép'));
      return;
    }
    const src = modelerClip;
    // góc trên-trái của nhóm dán đặt tại con trỏ; dán xong nhóm đi theo chuột (như M) để đặt chỗ khác
    const x0 = Math.min(...src.nodes.map((n) => n.x));
    const y0 = Math.min(...src.nodes.map((n) => n.y));
    const at = mouseWorld();
    const dx = Math.round(at.x - x0);
    const dy = Math.round(at.y - y0);
    const map = new Map<string, string>();
    const nodes: MNode[] = src.nodes.map((n) => {
      const id = newId('n');
      map.set(n.id, id);
      return { ...JSON.parse(JSON.stringify(n)), id, x: n.x + dx, y: n.y + dy };
    });
    const edges: MEdge[] = src.edges.map((e) => ({
      ...JSON.parse(JSON.stringify(e)),
      id: newId('e'),
      from: { ...e.from, node: map.get(e.from.node)! },
      to: { ...e.to, node: map.get(e.to.node)! },
      ...(e.points ? { points: e.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : {}),
    }));
    mutate(() => {
      doc.nodes.push(...nodes);
      doc.edges.push(...edges);
    });
    selected = new Set(nodes.map((n) => n.id));
    markSelected();
    startMove();
    deps.notify(tr('Đã dán {0} máy — rê chuột rồi bấm trái để đặt (Esc: để nguyên chỗ dán)', nodes.length));
  };

  /** Sao chép máy đang chọn (một hay cả nhóm): lệch 40px, chọn luôn bản sao để kéo đi. */
  const copySelected = (): void => {
    if (selected.size === 0) return;
    let ids: string[] = [];
    mutate(() => (ids = copyNodes(doc, selected, 40, 40)));
    selected = new Set(ids);
    markSelected();
    deps.notify(tr('Đã sao chép {0} máy — đường nối ra ngoài nhóm không chép theo', ids.length));
  };
  const deleteSelected = (): void => {
    if (selected.size === 0) return;
    const ids = selected;
    selected = new Set();
    mutate(() => removeNodes(doc, ids));
    deps.notify(tr('Đã xoá {0} máy', ids.size));
  };

  const render = (): void => {
    calc = computeModeler(ds, doc);
    for (const id of [...selected]) if (!doc.nodes.some((n) => n.id === id)) selected.delete(id);
    renderSummary();
    renderTopbar();
    renderTools();
    clear(nodesLayer);
    nodeEls.clear();
    for (const n of doc.nodes) {
      const v = nodeView(n);
      nodeEls.set(n.id, v);
      nodesLayer.append(v);
    }
    applyView();
    drawEdges();
    drawInk();
  };

  // ------------------------------------------------------------------ bảng Tổng hợp
  const renderSummary = (): void => {
    clear(summaryBody);
    const stat = (label: string, value: string, cls = ''): HTMLElement =>
      el('div', { class: 'stat' }, el('span', { class: 'stat-label' }, label), el('span', { class: `stat-value ${cls}` }, value));
    const built = [...calc.machines.values()].reduce((s, m) => s + m.built, 0);
    summaryBody.append(
      stat(tr('Máy trên sơ đồ'), String(doc.nodes.length)),
      stat(tr('Máy cần xây'), String(built)),
      stat(tr('Điện tiêu thụ'), fmt(calc.power, 1)),
    );
    const itemRows = (title: string, m: Map<string, number>, cls: string, emptyText: string): void => {
      summaryBody.append(el('div', { class: 'section' }, title));
      const rows = [...m.entries()].sort((a, b) => b[1] - a[1]);
      if (rows.length === 0) {
        summaryBody.append(el('div', { class: 'empty' }, emptyText));
        return;
      }
      for (const [item, v] of rows)
        summaryBody.append(
          el(
            'div',
            { class: 'flow-row md-sum-row' },
            itemChip(state, item),
            el('span', { class: 'flow-name' }, itemName(ds, item)),
            el('span', { class: `mono ${cls}` }, num(v, 1)),
          ),
        );
    };
    itemRows(tr('Nguyên liệu thô (mỗi phút)'), calc.raw, '', tr('Chưa lấy gì từ kho.'));
    if (calc.shortage.size > 0) itemRows(tr('Còn thiếu (mỗi phút)'), calc.shortage, 'short', '');
    itemRows(tr('Sản phẩm dư ra (mỗi phút)'), calc.surplus, 'surplus', tr('Không có hàng dư.'));
    if (calc.stored.size > 0) itemRows(tr('Vào kho tổng (mỗi phút)'), calc.stored, '', '');
    if (calc.tanked.size > 0) itemRows(tr('Chứa trong bể (mỗi phút)'), calc.tanked, '', '');
    if (calc.disposed.size > 0) itemRows(tr('Đã xử lý / nạp đi (mỗi phút)'), calc.disposed, '', '');
    summaryBody.append(el('div', { class: 'section' }, tr('Máy (thực cần · phải xây)')));
    if (calc.machines.size === 0) summaryBody.append(el('div', { class: 'empty' }, tr('Chưa có máy nào được tính.')));
    for (const [id, m] of calc.machines) {
      const def = ds.machines.get(id);
      summaryBody.append(
        el(
          'div',
          { class: 'flow-row md-sum-row' },
          el('img', { class: 'md-sum-icon', src: `img/items/${def?.icon ?? id}.png`, alt: '' }),
          el('span', { class: 'flow-name' }, def?.name ?? id),
          el('span', { class: 'mono' }, `${num(m.count, 2)} · ${m.built}`),
        ),
      );
    }
    // ô chỉ dẫn xanh ở cuối bảng tổng hợp đã bỏ (người dùng 2026-10-05: "bỏ chỉ dẫn màu xanh … của tất cả các chế độ")
  };

  // ------------------------------------------------------------------ nối
  /**
   * Nối cổng `key` của máy `from` với máy `other` (thả lên thân máy): máy có công thức ⇒ tìm cổng cùng vật
   * phẩm; máy **chưa có công thức** ⇒ tự chọn công thức dùng / làm ra vật phẩm đó (người dùng
   * 2026-09-29) — một công thức thì chọn luôn, nhiều thì hỏi bằng bảng chọn chỉ gồm những công thức đó.
   */
  /**
   * Kéo cổng ra của một máy thả lên **thân chính nó** ⇒ nối vào cổng kích hoạt cùng vật phẩm của nó (VD Máy Chuyển Hóa
   * Khí Rắn tự làm Khí Xiranite để tự kích hoạt — người dùng 2026-10-04). Không có cổng đó ⇒ thôi, không báo.
   */
  const selfAct = (n: MNode, key: string): void => {
    const { dir, item } = parseKey(key);
    const act = nodePorts(ds, n, doc.edges).find((p) => p.slot === 'act' && p.item === item);
    if (!act || (dir === 'in' && !nodePorts(ds, n, doc.edges).some((p) => p.dir === 'out' && p.item === item))) return drawEdges();
    const e: MEdge = { id: newId('e'), from: { node: n.id, item }, to: { node: n.id, item, slot: 'act' } };
    const why = canConnect(ds, doc, e.from, e.to);
    if (why) {
      deps.notify(why);
      return drawEdges();
    }
    mutate(() => pushEdge(e));
    deps.notify(tr('Đã nối {0} vào cổng kích hoạt của chính máy này', label(item)));
  };

  const linkToNode = (from: MNode, key: string, other: MNode): void => {
    const { dir, item, slot } = parseKey(key);
    const need = dir === 'out' ? 'in' : 'out';
    /** Đường nối; `otherSlot` = cổng kích hoạt của máy bên kia. */
    const edgeTo = (o: MNode, otherSlot?: 'act'): MEdge =>
      dir === 'out'
        ? { id: newId('e'), from: { node: from.id, item }, to: { node: o.id, item, ...(otherSlot ? { slot: otherSlot } : {}) } }
        : { id: newId('e'), from: { node: o.id, item }, to: { node: from.id, item, ...(slot ? { slot } : {}) } };
    const connect = (opt?: LinkOption, otherSlot?: 'act'): void => {
      const e = edgeTo(other, opt?.slot ?? otherSlot);
      if (opt) {
        // kiểm tra trước trên một bản nháp để không gán công thức rồi mới biết không nối được
        const trial: ModelerDoc = JSON.parse(JSON.stringify({ ...doc, view: undefined }));
        applyOption(ds, trial, other.id, opt);
        const why = canConnect(ds, trial, e.from, e.to);
        if (why) return deps.notify(why);
      } else {
        const why = canConnect(ds, doc, e.from, e.to);
        if (why) return deps.notify(why);
      }
      mutate(() => {
        if (opt) applyOption(ds, doc, other.id, opt);
        pushEdge(e);
      });
      deps.notify(tr('Đã nối {0}', label(item)));
    };
    if (other.id === from.id) return;
    // lò phản ứng nhận mọi vật phẩm vào (tới 2 ống + 2 băng) — kiểm ở `canConnect`
    if (kindOfNode(ds, other) === 'crucible' && need === 'in') return connect();
    if (!isBlank(ds, other)) {
      // cổng cùng vật phẩm; có cả cổng nguyên liệu lẫn cổng kích hoạt thì cổng nguyên liệu trước, đã nối rồi thì
      // sang cổng kích hoạt
      const ports = nodePorts(ds, other, doc.edges).filter((p) => p.dir === need && p.item === item);
      if (ports.length === 0 && kindOfNode(ds, other) === 'crucible' && need === 'out') {
        deps.notify(tr('Bấm vào ô {0} trong lò để chọn nó làm đầu ra (vàng / cam / đen) trước, rồi mới nối ra', label(item)));
        return drawEdges();
      }
      if (ports.length === 0) {
        deps.notify(tr('{0} không có cổng {1} {2}', ds.machines.get(other.machineId)?.name ?? tr('Máy này'), need === 'in' ? tr('vào') : tr('ra'), label(item)));
        return drawEdges();
      }
      const taken = (p: (typeof ports)[number]): boolean =>
        doc.edges.some((e) => e.to.node === other.id && e.from.node === from.id && toKey(e) === p.key);
      const port = ports.find((p) => !p.slot && !taken(p)) ?? ports.find((p) => !taken(p)) ?? ports[0]!;
      return connect(undefined, port.slot);
    }
    const def = ds.machines.get(other.machineId);
    if (!def) return;
    const opts = machineOptions(ds, def, item, need);
    if (opts.length === 0) {
      deps.notify(
        nodeKind(def)
          ? need === 'in'
            ? tr('{0} không nhận dùng {1}', def.name, label(item))
            : tr('{0} không nhận làm ra {1}', def.name, label(item))
          : need === 'in'
            ? tr('{0} không có công thức nào dùng {1}', def.name, label(item))
            : tr('{0} không có công thức nào làm ra {1}', def.name, label(item)),
      );
      return drawEdges();
    }
    if (opts.length === 1) return connect(opts[0]);
    drawEdges();
    chooseOption(tr('{0} — công thức {1} {2}', def.name, need === 'in' ? tr('dùng') : tr('làm ra'), label(item)), opts, (o) => connect(o));
  };

  /**
   * Thả cổng ra **khoảng trống** (người dùng 2026-09-29): bảng mọi công thức (kèm loại máy) dùng / làm ra
   * vật phẩm đó; chọn ⇒ máy mới với công thức đó ngay chỗ thả, nối sẵn với cổng vừa kéo.
   */
  const linkToSpace = (from: MNode, key: string, at: { x: number; y: number }): void => {
    const { dir, item, slot } = parseKey(key);
    const need = dir === 'out' ? 'in' : 'out';
    let opts = linkOptions(ds, item, need).filter(
      (o) => (o.machineId !== SEWAGE_OUT.machine || !hasSewageOut()) && !(need === 'out' && nodeKindOf(o.machineId) === 'crucible'),
    );
    // Máy Chiết Rót: cả loạt công thức nạp khí / chất lỏng vào từng loại lọ / bình ⇒ **một dòng** "Chứa trong lọ /
    // bình" (người dùng 2026-10-02); chọn rồi mới hỏi loại lọ / bình
    const fills = opts.filter((o) => o.recipeId && ds.recipes.get(o.recipeId)?.outcomes.some((x) => isFilledContainer(ds, x.itemId)));
    if (need === 'in' && fills.length > 1) {
      const at = opts.indexOf(fills[0]!);
      opts = opts.filter((o) => !fills.includes(o));
      opts.splice(at, 0, { machineId: fills[0]!.machineId, recipeId: null, fill: fills.map((o) => o.recipeId!) });
    }
    if (opts.length === 0) {
      deps.notify(tr('Không máy nào {0} {1}', need === 'in' ? tr('dùng') : tr('làm ra'), label(item)));
      return;
    }
    chooseOption(
      `${need === 'in' ? tr('Máy dùng') : tr('Máy làm ra')} ${label(item)}`,
      opts,
      (opt) => {
        if (opt.fill) {
          // bước 2: chọn loại lọ / bình
          chooseOption(
            tr('Chứa {0} vào loại nào?', label(item)),
            opt.fill.map((recipeId) => ({ machineId: opt.machineId, recipeId })),
            (o) => placeFrom(o),
          );
          return;
        }
        placeFrom(opt);
      },
      true,
    );
    function placeFrom(opt: LinkOption): void {
        const node: MNode = {
          id: newId('n'),
          machineId: opt.machineId,
          recipeId: opt.recipeId,
          ...(opt.item ? { item: opt.item } : {}),
          ...(opt.tick ? { ticks: [opt.tick] } : {}),
          // máy mới nằm phía cổng vừa thả: sau cổng ra, trước cổng vào
          x: Math.round(dir === 'out' ? at.x : at.x - 150),
          y: Math.round(at.y - 50),
          limit: null,
        };
        const e: MEdge =
          dir === 'out'
            ? { id: newId('e'), from: { node: from.id, item }, to: { node: node.id, item, ...(opt.slot ? { slot: opt.slot } : {}) } }
            : { id: newId('e'), from: { node: node.id, item }, to: { node: from.id, item, ...(slot ? { slot } : {}) } };
        selected = new Set([node.id]);
        mutate(() => {
          doc.nodes.push(node);
          pushEdge(e);
        });
    }
  };

  // ------------------------------------------------------------------ chuột
  type Drag =
    | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number }
    // kéo một máy: cả nhóm đang chọn đi theo (vị trí gốc từng máy trong `start`)
    | {
        kind: 'node';
        node: MNode;
        sx: number;
        sy: number;
        start: Map<string, { x: number; y: number }>;
        /** Điểm neo gốc của các đường có cả hai đầu trong nhóm đang kéo — dời theo nhóm. */
        pts: Map<string, Pt[]>;
        before: string;
      }
    // kéo khung chọn trên nền (Ctrl: thêm vào lựa chọn cũ)
    | { kind: 'box'; sx: number; sy: number; add: boolean; base: Set<string>; moved: boolean }
    // uốn đường: nắm ở đâu cũng được, đường đi qua đúng điểm đang nắm; `label` = nắm icon giữa đường (bấm không
    // kéo ⇒ bảng lưu lượng)
    // uốn đường bằng điểm neo (người dùng 2026-09-30): `idx` = điểm neo đang kéo; `null` = nắm vào đường, rê đủ
    // xa thì **thêm** một điểm neo đúng chỗ đã nắm rồi kéo nó
    | { kind: 'bend'; edge: MEdge; sx: number; sy: number; at: Pt; idx: number | null; before: string; moved: boolean; label: boolean }
    | { kind: 'link'; node: MNode; key: string }
    // nhấn trên cổng: rê ngay ⇒ nối; giữ yên một lúc ⇒ đổi chỗ cổng quanh máy (người dùng 2026-09-29)
    | { kind: 'press'; node: MNode; key: string; sx: number; sy: number; timer: ReturnType<typeof setTimeout> }
    | { kind: 'place'; node: MNode; key: string; before: string }
    // bút vẽ: đang vẽ một nét / đang rê tẩy (người dùng 2026-09-30)
    | { kind: 'ink'; points: number[]; before: string }
    | { kind: 'rect'; a: Pt; before: string }
    | { kind: 'erase'; before: string };
  let drag: Drag | null = null;
  const HOLD_MS = 320;

  /** Bỏ đường nối đang kéo dở (đường tạm nét đứt + vùng sáng ở máy đích). */
  const cancelLink = (): void => {
    drag = null;
    tempPath?.remove();
    tempPath = null;
    for (const box of nodeEls.values()) box.classList.remove('drop');
  };
  /** Bỏ qua một lần menu chuột phải (vừa dùng chuột phải để huỷ nối). */
  let skipContext = false;
  /** Bắt đầu kéo nối từ cổng. */
  const startLink = (node: MNode, key: string): void => {
    drag = { kind: 'link', node, key };
    tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempPath.setAttribute('class', 'md-edge temp');
  };

  /** Đang giữ cổng: con trỏ ở mặt nào của máy, đứng trước cổng nào ⇒ đổi mặt + thứ tự (xem trực tiếp). */
  const placePort = (d: { node: MNode; key: string }, cx: number, cy: number): void => {
    const box = nodeEls.get(d.node.id)?.getBoundingClientRect();
    if (!box) return;
    const dx = (cx - (box.left + box.width / 2)) / (box.width / 2);
    const dy = (cy - (box.top + box.height / 2)) / (box.height / 2);
    const side: Side = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'top' : 'bottom';
    const all = nodePorts(ds, d.node, doc.edges);
    const others = all.filter((p) => p.side === side && p.key !== d.key && !isEnvItem(p.item));
    const along = (el2: HTMLElement | null): number => {
      const r = el2?.getBoundingClientRect();
      if (!r) return 0;
      return side === 'left' || side === 'right' ? r.top + r.height / 2 : r.left + r.width / 2;
    };
    const at = side === 'left' || side === 'right' ? cy : cx;
    const before = others.find((p) => along(portEl(d.node, p.key)) > at);
    const order = all.map((p) => p.key).filter((k) => k !== d.key);
    order.splice(before ? order.indexOf(before.key) : order.length, 0, d.key);
    const same = (d.node.sides?.[d.key] ?? all.find((p) => p.key === d.key)?.side) === side && JSON.stringify(order) === JSON.stringify(all.map((p) => p.key));
    if (same) return;
    d.node.sides = { ...(d.node.sides ?? {}), [d.key]: side };
    d.node.order = order;
    render();
    portEl(d.node, d.key)?.classList.add('placing');
  };

  const onDown = (e: MouseEvent): void => {
    const t = e.target as HTMLElement;
    lastMouse = { x: e.clientX, y: e.clientY };
    // đang di chuyển bằng M: bấm trái = đặt xuống (chuột phải / giữa vẫn kéo bản vẽ)
    if (moving && e.button === 0) {
      e.preventDefault();
      finishMove();
      return;
    }
    if (t.closest('.md-limit, .md-src-btn')) return;
    // đang kéo dở một đường nối mà bấm chuột phải / giữa (người dùng 2026-10-02: đường nét đứt vàng đứng yên giữa
    // màn hình) ⇒ huỷ đường đang kéo, không làm gì khác (cả menu chuột phải sau đó)
    if (drag?.kind === 'link' && e.button !== 0) {
      e.preventDefault();
      cancelLink();
      skipContext = e.button === 2;
      deps.notify(tr('Đã huỷ nối'));
      return;
    }
    // chuột phải / giữa / Space + kéo: di chuyển bản vẽ (như bên Map); bấm phải tại chỗ vẫn là menu của cổng / đường
    if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceDown)) {
      if (e.button !== 2) e.preventDefault();
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      viewport.classList.add('panning');
      return;
    }
    if (pen && e.button === 0) {
      e.preventDefault();
      closeLimit();
      if (pen === 'draw') {
        commitText();
        const p = toWorld(e.clientX, e.clientY);
        const points: number[] = [];
        inkAddPoint(points, p.x, p.y, 0);
        drag = { kind: 'ink', points, before: snap() };
        liveStroke = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        liveStroke.setAttribute('class', 'md-ink-stroke');
        liveStroke.setAttribute('stroke', inkSet.color);
        liveStroke.setAttribute('stroke-width', String(inkSet.width));
        liveStroke.setAttribute('d', inkPath(points));
        ink.append(liveStroke);
      } else if (pen === 'rect') {
        commitText();
        const a = toWorld(e.clientX, e.clientY);
        drag = { kind: 'rect', a, before: snap() };
        liveRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        liveRect.setAttribute('class', 'md-ink-stroke');
        liveRect.setAttribute('stroke', inkSet.color);
        liveRect.setAttribute('stroke-width', String(inkSet.width));
        inkBack.append(liveRect);
      } else if (pen === 'text') {
        const id = (t.closest('[data-ink]') as SVGElement | null)?.dataset.ink;
        const old = doc.drawings?.find((x): x is Extract<MDrawing, { kind: 'text' }> => x.id === id && x.kind === 'text');
        openText(toWorld(e.clientX, e.clientY), old);
      } else {
        drag = { kind: 'erase', before: snap() };
        eraseAt(e.clientX, e.clientY);
      }
      return;
    }
    const port = t.closest<HTMLElement>('.md-port');
    const label = t.closest<HTMLElement>('.md-label');
    const hitEdge = (t.closest('.md-edge-hit') as SVGElement | null)?.dataset.edge;
    const nodeBox = t.closest<HTMLElement>('.md-node');
    if (e.button === 0 && port) {
      const n = doc.nodes.find((x) => x.id === port.dataset.node);
      if (!n) return;
      e.preventDefault();
      const key = port.dataset.key!;
      // bảng tên môi trường không đổi chỗ được: kéo là nối luôn
      if (port.classList.contains('md-plate')) return startLink(n, key);
      const press: Drag = {
        kind: 'press',
        node: n,
        key,
        sx: e.clientX,
        sy: e.clientY,
        timer: setTimeout(() => {
          if (drag !== press) return;
          drag = { kind: 'place', node: n, key, before: snap() };
          port.classList.add('placing');
          deps.notify(tr('Rê quanh máy để chọn chỗ cho cổng này, thả chuột để đặt'));
        }, HOLD_MS),
      };
      drag = press;
      return;
    }
    const anchorDot = t.closest('.md-anchor-pt') as SVGElement | null;
    if (e.button === 0 && anchorDot) {
      // kéo một điểm neo có sẵn
      const edge = doc.edges.find((x) => x.id === anchorDot.dataset.edge);
      if (!edge) return;
      e.preventDefault();
      drag = { kind: 'bend', edge, sx: e.clientX, sy: e.clientY, at: toWorld(e.clientX, e.clientY), idx: Number(anchorDot.dataset.idx), before: snap(), moved: false, label: false };
      return;
    }
    if (e.button === 0 && label) {
      // icon giữa đường: bấm = bảng lưu lượng; kéo = thêm điểm neo ở đó như nắm vào đường
      const edge = doc.edges.find((x) => x.id === label.dataset.edge);
      if (!edge) return;
      e.preventDefault();
      if (isEnvItem(edge.from.item)) return;
      drag = { kind: 'bend', edge, sx: e.clientX, sy: e.clientY, at: toWorld(e.clientX, e.clientY), idx: null, before: snap(), moved: false, label: true };
      return;
    }
    if (e.button === 0 && hitEdge) {
      // chuột trái nắm **bất kỳ điểm nào** trên đường rồi kéo ⇒ thêm điểm neo đúng chỗ đó (người dùng 2026-09-30);
      // bỏ nối = chuột phải. Đường môi trường luôn thẳng — không uốn.
      e.preventDefault();
      const edge = doc.edges.find((x) => x.id === hitEdge);
      if (!edge || isEnvItem(edge.from.item)) return;
      drag = { kind: 'bend', edge, sx: e.clientX, sy: e.clientY, at: toWorld(e.clientX, e.clientY), idx: null, before: snap(), moved: false, label: false };
      return;
    }
    if (e.button === 0 && nodeBox) {
      const n = doc.nodes.find((x) => x.id === nodeBox.dataset.id);
      if (!n) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Ctrl + bấm: thêm / bớt máy này khỏi nhóm
        if (selected.has(n.id)) selected.delete(n.id);
        else selected.add(n.id);
        markSelected();
        return;
      }
      if (!selected.has(n.id)) selected = new Set([n.id]);
      const start = new Map(doc.nodes.filter((x) => selected.has(x.id)).map((x) => [x.id, { x: x.x, y: x.y }]));
      const pts = new Map(
        doc.edges.filter((x) => x.points?.length && start.has(x.from.node) && start.has(x.to.node)).map((x) => [x.id, x.points!.map((p) => ({ ...p }))]),
      );
      drag = { kind: 'node', node: n, sx: e.clientX, sy: e.clientY, start, pts, before: snap() };
      markSelected();
      return;
    }
    // nền: kéo khung để chọn nhóm; bấm nhả tại chỗ = bỏ chọn (người dùng 2026-09-29)
    e.preventDefault();
    const add = e.ctrlKey || e.metaKey;
    drag = { kind: 'box', sx: e.clientX, sy: e.clientY, add, base: add ? new Set(selected) : new Set(), moved: false };
  };

  /** Máy nằm (một phần) trong khung chọn (toạ độ màn hình). */
  const inBox = (x0: number, y0: number, x1: number, y1: number): string[] => {
    const out: string[] = [];
    for (const [id, box] of nodeEls) {
      const r = box.getBoundingClientRect();
      if (r.right >= x0 && r.left <= x1 && r.bottom >= y0 && r.top <= y1) out.push(id);
    }
    return out;
  };

  const onMove = (e: MouseEvent): void => {
    lastMouse = { x: e.clientX, y: e.clientY };
    if (moving && !drag) {
      followMove();
      return;
    }
    if (!drag) return;
    if (drag.kind === 'rect') {
      const r = rectFrom(drag.a, toWorld(e.clientX, e.clientY));
      liveRect?.setAttribute('x', String(r.x));
      liveRect?.setAttribute('y', String(r.y));
      liveRect?.setAttribute('width', String(r.w));
      liveRect?.setAttribute('height', String(r.h));
      return;
    }
    if (drag.kind === 'ink') {
      const p = toWorld(e.clientX, e.clientY);
      if (inkAddPoint(drag.points, p.x, p.y, 1.5 / view.zoom)) liveStroke?.setAttribute('d', inkPath(drag.points));
      return;
    }
    if (drag.kind === 'erase') {
      eraseAt(e.clientX, e.clientY);
      return;
    }
    if (drag.kind === 'press') {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      clearTimeout(drag.timer);
      startLink(drag.node, drag.key);
    }
    if (drag.kind === 'place') {
      placePort(drag, e.clientX, e.clientY);
      return;
    }
    if (drag.kind === 'box') {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true;
      const r = root.getBoundingClientRect();
      const x0 = Math.min(drag.sx, e.clientX);
      const y0 = Math.min(drag.sy, e.clientY);
      const x1 = Math.max(drag.sx, e.clientX);
      const y1 = Math.max(drag.sy, e.clientY);
      boxEl.hidden = false;
      boxEl.style.cssText = `left:${x0 - r.left}px;top:${y0 - r.top}px;width:${x1 - x0}px;height:${y1 - y0}px`;
      selected = new Set([...drag.base, ...inBox(x0, y0, x1, y1)]);
      for (const [id, box] of nodeEls) box.classList.toggle('selected', selected.has(id));
      return;
    }
    if (drag.kind === 'pan') {
      view.x = drag.vx + e.clientX - drag.sx;
      view.y = drag.vy + e.clientY - drag.sy;
      applyView();
    } else if (drag.kind === 'node') {
      const dx = (e.clientX - drag.sx) / view.zoom;
      const dy = (e.clientY - drag.sy) / view.zoom;
      for (const [id, p0] of drag.start) {
        const n = doc.nodes.find((x) => x.id === id);
        if (!n) continue;
        n.x = Math.round(p0.x + dx);
        n.y = Math.round(p0.y + dy);
        const box = nodeEls.get(id);
        if (box) {
          box.style.left = `${n.x}px`;
          box.style.top = `${n.y}px`;
        }
      }
      // đường có cả hai đầu trong nhóm: điểm neo đi theo nhóm (đường chỉ một đầu đi theo thì điểm neo đứng yên)
      for (const [id, p0] of drag.pts) {
        const ed = doc.edges.find((x) => x.id === id);
        if (ed) ed.points = p0.map((p) => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) }));
      }
      queueEdges(new Set(drag.start.keys()));
    } else if (drag.kind === 'bend') {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      drag.moved = true;
      const p = toWorld(e.clientX, e.clientY);
      const pts = ensurePoints(drag.edge);
      if (drag.idx === null) {
        // lần rê đầu tiên: chèn điểm neo mới vào đúng đoạn đang nắm (các điểm neo khác giữ nguyên chỗ)
        const { pa, pb } = endsOf(drag.edge);
        const i = pa && pb ? insertIndex(routeSegments(pa, pb, pts), drag.at) : pts.length;
        pts.splice(i, 0, { x: drag.at.x, y: drag.at.y });
        drag.idx = i;
      }
      // điểm neo đi theo con trỏ ⇒ đường luôn qua đúng chỗ đang nắm
      pts[drag.idx] = { x: Math.round(p.x), y: Math.round(p.y) };
      queueEdges();
    } else if (drag.kind === 'link' && tempPath) {
      const a = portAnchor(drag.node, drag.key);
      if (!a) return;
      const p = toWorld(e.clientX, e.clientY);
      const back = { x: -a.d.x, y: -a.d.y };
      // cổng môi trường (bảng "TRƠ" / "AXIT" trên đầu máy): đường môi trường luôn thẳng ⇒ xem trước cũng thẳng (người dùng
      // 2026-10-06; trước đây là đường cong)
      const c = isEnvItem(parseKey(drag.key).item)
        ? { d: `M${a.x},${a.y} L${p.x},${p.y}` }
        : drag.key.startsWith('out:')
          ? curve(a, { ...p, d: back })
          : curve({ ...p, d: back }, a);
      tempPath.setAttribute('d', c.d);
      if (!tempPath.isConnected) svg.append(tempPath);
      // máy dưới con trỏ sáng lên: thả vào là nối (máy chưa có công thức thì tự chọn)
      const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('.md-node');
      for (const [id, box] of nodeEls) box.classList.toggle('drop', box === over && id !== drag.node.id);
    }
  };

  const onUp = (e: MouseEvent): void => {
    const d = drag;
    drag = null;
    viewport.classList.remove('panning');
    if (!d) return;
    if (d.kind === 'rect') {
      liveRect?.remove();
      liveRect = null;
      const r = rectFrom(d.a, toWorld(e.clientX, e.clientY));
      if (r.w < 3 || r.h < 3) return drawInk(); // bấm tại chỗ: không vẽ gì
      (doc.drawings ??= []).push({ id: newId('r'), kind: 'rect', color: inkSet.color, width: inkSet.width, ...r });
      undo.push(d.before);
      redo.length = 0;
      render();
      changed();
      return;
    }
    if (d.kind === 'ink') {
      liveStroke?.remove();
      liveStroke = null;
      (doc.drawings ??= []).push({ id: newId('k'), kind: 'stroke', color: inkSet.color, width: inkSet.width, points: d.points });
      undo.push(d.before);
      if (undo.length > 150) undo.shift();
      redo.length = 0;
      render();
      changed();
      return;
    }
    if (d.kind === 'erase') {
      if (snap() !== d.before) {
        undo.push(d.before);
        redo.length = 0;
        render();
        changed();
      }
      return;
    }
    if (d.kind === 'pan') {
      changed(); // vị trí nhìn cũng được lưu
      return;
    }
    if (d.kind === 'box') {
      boxEl.hidden = true;
      if (!d.moved && !d.add) selected = new Set(); // bấm nhả tại chỗ trên nền = bỏ chọn
      markSelected();
      if (d.moved && selected.size > 1) deps.notify(tr('Đã chọn {0} máy — C: sao chép · Delete: xoá · kéo một máy để dời cả nhóm', selected.size));
      return;
    }
    if (d.kind === 'press') {
      clearTimeout(d.timer);
      // lò phản ứng: bấm nhả (chưa kịp kéo / giữ) vào một ô ⇒ đổi màu đầu ra (người dùng 2026-09-29)
      if (kindOfNode(ds, d.node) === 'crucible') {
        const item = parseKey(d.key).item;
        let c: string | undefined;
        mutate(() => (c = cycleCrucibleSlot(ds, doc, d.node.id, item)));
        deps.notify(
          c
            ? tr('{0}: đầu ra {1} — kéo từ ô màu để nối ra', label(item), c === 'yellow' ? tr('VÀNG') : c === 'orange' ? tr('CAM') : tr('ĐEN'))
            : tr('{0}: không còn là đầu ra', label(item)),
        );
      }
      return;
    }
    if (d.kind === 'place') {
      if (d.before !== snap()) {
        undo.push(d.before);
        redo.length = 0;
        changed();
      }
      render();
      return;
    }
    if (d.kind === 'bend' && !d.moved) {
      // bấm (không kéo) vào icon trên đường ống ⇒ bảng giới hạn lưu lượng (người dùng 2026-09-29)
      if (d.label) openLimit(d.edge, e.clientX, e.clientY);
      return;
    }
    if (d.kind === 'node' || d.kind === 'bend') {
      // chỉ bấm (không kéo) thì không vẽ lại — để bấm đúp còn nhận được
      if (d.before !== snap()) {
        undo.push(d.before);
        redo.length = 0;
        render();
        changed();
      }
      return;
    }
    // nối: thả lên một cổng / thân một máy / khoảng trống
    tempPath = null;
    for (const box of nodeEls.values()) box.classList.remove('drop');
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const target = under?.closest<HTMLElement>('.md-port');
    const nodeBox = under?.closest<HTMLElement>('.md-node');
    if (!target && !nodeBox) {
      drawEdges();
      if (under && viewport.contains(under)) linkToSpace(d.node, d.key, toWorld(e.clientX, e.clientY));
      return;
    }
    const other = doc.nodes.find((x) => x.id === (target?.dataset.node ?? nodeBox?.dataset.id));
    if (!other) return drawEdges();
    // thả lên chính máy đó: chỉ nối được vào cổng kích hoạt của nó (2026-10-04) — thả lên thân thì tự tìm cổng đó
    if (other.id === d.node.id && !target) return selfAct(d.node, d.key);
    if (!target) return linkToNode(d.node, d.key, other);
    const a = parseKey(d.key);
    const b = parseKey(target.dataset.key!);
    if (a.dir === b.dir) {
      deps.notify(tr('Phải nối một cổng ra với một cổng vào'));
      return drawEdges();
    }
    const end = (node: string, p: ReturnType<typeof parseKey>): MEnd => ({ node, item: p.item, ...(p.slot ? { slot: p.slot } : {}) });
    const from = a.dir === 'out' ? end(d.node.id, a) : end(other.id, b);
    const to = a.dir === 'out' ? end(other.id, b) : end(d.node.id, a);
    const why = canConnect(ds, doc, from, to);
    if (why) {
      deps.notify(why);
      return drawEdges();
    }
    mutate(() => pushEdge({ id: newId('e'), from, to }));
    deps.notify(tr('Đã nối {0}', label(from.item)));
  };

  /** Xoá một điểm neo (chuột phải / bấm đúp vào chấm) — hết điểm neo thì đường về cong mặc định. */
  const removeAnchor = (dot: SVGElement): void => {
    const edge = doc.edges.find((x) => x.id === dot.dataset.edge);
    const i = Number(dot.dataset.idx);
    if (!edge?.points || !(i >= 0)) return;
    mutate(() => {
      edge.points!.splice(i, 1);
      if (edge.points!.length === 0) delete edge.points;
    });
  };
  const onDblClick = (e: MouseEvent): void => {
    const t = e.target as Element;
    const dot = t.closest?.('.md-anchor-pt') as SVGElement | null;
    if (dot) {
      removeAnchor(dot);
      return;
    }
    // điện thoại: **nhấn đúp** icon giữa đường nối (hoặc chính đường) ⇒ bỏ nối — thay cho nhấn giữ (người dùng 2026-10-06)
    if (isTouchUI()) {
      const edgeId = t.closest<HTMLElement>('.md-label')?.dataset.edge ?? (t.closest('.md-edge-hit') as SVGElement | null)?.dataset.edge;
      if (edgeId) {
        closeLimit();
        removeEdge(edgeId);
      }
    }
  };

  const onContext = (e: MouseEvent): void => {
    e.preventDefault();
    if (skipContext) {
      skipContext = false;
      return;
    }
    const t = e.target as HTMLElement;
    // chuột phải vào chấm điểm neo ⇒ xoá điểm neo đó (không bỏ nối)
    const dot = t.closest('.md-anchor-pt') as SVGElement | null;
    if (dot) {
      removeAnchor(dot);
      return;
    }
    // chuột phải vào đường nối (đường hoặc icon giữa đường) ⇒ bỏ nối (người dùng 2026-09-29)
    const edgeId = t.closest<HTMLElement>('.md-label')?.dataset.edge ?? (t.closest('.md-edge-hit') as SVGElement | null)?.dataset.edge;
    if (edgeId) {
      // điện thoại: nhấn giữ không bỏ nối nữa — dùng nhấn đúp (`onDblClick`)
      if (!isTouchUI()) removeEdge(edgeId);
      return;
    }
    const port = t.closest<HTMLElement>('.md-port');
    if (!port) return;
    const n = doc.nodes.find((x) => x.id === port.dataset.node);
    const key = port.dataset.key!;
    const p = n && nodePorts(ds, n, doc.edges).find((q) => q.key === key);
    if (!n || !p) return;
    const next = SIDES[(SIDES.indexOf(p.side) + 1) % SIDES.length]!;
    mutate(() => (n.sides = { ...(n.sides ?? {}), [key]: next }));
  };

  // ------------------------------------------------------------------ giới hạn lưu lượng đường ống
  /**
   * Bấm icon chất lỏng / khí trên đường ống (người dùng 2026-09-29): **thanh trượt ngang** chọn lưu lượng tối
   * đa mỗi phút — không giới hạn, 6, 12 … 60 (chia hết cho 6). Thay cho Cảng Kiểm Soát Ống: phần còn lại tự
   * chia cho các nhánh khác của nguồn. Có nút làm thẳng đường nếu đã uốn.
   */
  let pop: HTMLElement | null = null;
  const closeLimit = (): void => {
    pop?.remove();
    pop = null;
  };
  const openLimit = (edge: MEdge, cx: number, cy: number): void => {
    closeLimit();
    const pipe = kindOfItem(ds, edge.from.item) === 'pipe' && !isEnvItem(edge.from.item);
    const bent = !!edge.bend || !!edge.points?.length;
    if (!pipe && !bent) return;
    const r = root.getBoundingClientRect();
    const value = el('span', { class: 'md-pop-val' });
    // đường vào cổng kích hoạt (người dùng 2026-10-04): nấc đầu = **Tự động** (số máy thật × 6/phút, mặc định), nấc
    // cuối = không giới hạn (máy xin tới 30/phút mỗi máy); đường khác: nấc đầu = không giới hạn như cũ
    const act = edge.to.slot === 'act';
    type Step = number | 'auto' | 'none';
    const steps: Step[] = act ? ['auto', ...EDGE_RATES, 'none'] : ['none', ...EDGE_RATES];
    const cur: Step = act && edge.limit === undefined ? 'auto' : typeof edge.limit === 'number' ? edge.limit : 'none';
    const slider = el('input', { type: 'range', min: '0', max: String(steps.length - 1), step: '1', class: 'md-pop-range' });
    slider.value = String(Math.max(0, steps.indexOf(cur)));
    /** Mức Tự động hiện tại của máy đích: số máy thật × 6. */
    const autoRate = (): number => {
      const t = calc.nodes.get(edge.to.node)?.target ?? 0;
      return 6 * (t > 1e-6 ? Math.ceil(t - 1e-9) : 0);
    };
    const show = (): void => {
      const v = steps[Number(slider.value)]!;
      value.textContent = v === 'auto' ? tr('Tự động ({0}/phút)', autoRate()) : v === 'none' ? tr('Không giới hạn') : tr('{0}/phút', v);
    };
    show();
    slider.addEventListener('input', show);
    slider.addEventListener('change', () => {
      const v = steps[Number(slider.value)]!;
      mutate(() => {
        if (typeof v === 'number') edge.limit = v;
        else if (v === 'auto' || !act) delete edge.limit;
        else edge.limit = null; // kích hoạt "không giới hạn" phải ghi rõ — không có = Tự động
      });
    });
    pop = el(
      'div',
      { class: 'md-pop', style: `left:${Math.round(cx - r.left + 12)}px;top:${Math.round(cy - r.top + 12)}px` },
      pipe ? el('div', { class: 'md-pop-title' }, tr('Lưu lượng tối đa — {0}', label(edge.from.item))) : null,
      pipe ? el('div', { class: 'md-pop-row' }, slider, value) : null,
      pipe
        ? el(
            'div',
            { class: 'md-pop-hint' },
            act
              ? tr('Tự động = số máy thật × 6/phút (đủ để máy chạy). Đặt tay: chia hết cho 6, tối đa 60; không giới hạn: máy xin tới 30/phút mỗi máy.')
              : tr('Chia hết cho 6, tối đa 60; phần còn lại chia cho các nhánh khác của nguồn.'),
          )
        : null,
      bent
        ? el(
            'button',
            {
              class: 'tool small',
              title: tr('Bỏ mọi điểm neo của đường này'),
              onclick: () => {
                closeLimit();
                mutate(() => {
                  delete edge.bend;
                  delete edge.points;
                });
              },
            },
            tr('Làm thẳng đường'),
          )
        : null,
    );
    root.append(pop);
    if (pipe) slider.focus();
  };
  const onDocDown = (e: MouseEvent): void => {
    if (pop && !pop.contains(e.target as Node)) closeLimit();
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const z = Math.max(MIN_ZOOM, Math.min(3, view.zoom * Math.exp(-e.deltaY * 0.0015)));
    view.x = mx - ((mx - view.x) * z) / view.zoom;
    view.y = my - ((my - view.y) * z) / view.zoom;
    view.zoom = z;
    applyView();
    changed();
  };

  /** Space giữ để kéo bản vẽ bằng chuột trái (như bên Map). */
  let spaceDown = false;
  const onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') spaceDown = false;
  };
  const onKey = (e: KeyboardEvent): void => {
    if (!document.getElementById('app')?.classList.contains('modeler-mode')) return;
    if (e.code === 'Space' && !(e.target as HTMLElement | null)?.closest?.('input, textarea, select')) {
      spaceDown = true;
      e.preventDefault();
      return;
    }
    if (document.body.classList.contains('modal-open')) return;
    const t = e.target as HTMLElement | null;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && isKey(e, 'Z')) {
      e.preventDefault();
      if (e.shiftKey) restore(redo, undo);
      else restore(undo, redo);
    } else if (ctrl && isKey(e, 'Y')) {
      e.preventDefault();
      restore(redo, undo);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size > 0) {
      e.preventDefault();
      deleteSelected();
    } else if (!ctrl && isKey(e, 'M') && selected.size > 0) {
      // M: nhóm đang chọn đi theo chuột, bấm trái để đặt, Esc huỷ (người dùng 2026-10-02)
      e.preventDefault();
      if (!e.repeat && !moving) startMove();
    } else if (ctrl && isKey(e, 'C') && selected.size > 0) {
      // Ctrl+C: chép vào bộ nhớ tạm (dán được sang tab Modeler khác) — người dùng 2026-10-02
      e.preventDefault();
      if (!e.repeat) copyToClip();
    } else if (ctrl && isKey(e, 'V')) {
      e.preventDefault();
      if (!e.repeat) pasteClip();
    } else if (!ctrl && isKey(e, 'C') && selected.size > 0) {
      e.preventDefault();
      if (!e.repeat) copySelected();
    } else if (ctrl && isKey(e, 'A')) {
      e.preventDefault();
      selected = new Set(doc.nodes.map((n) => n.id));
      markSelected();
    } else if (e.key === 'Escape') {
      closeLimit();
      if (moving) {
        cancelMove();
        return;
      }
      if (drag?.kind === 'link') cancelLink();
      if (pen) setPen(null);
      selected = new Set();
      markSelected();
    } else if (!ctrl && !e.altKey && /^Digit[0-9]$/.test(e.code)) {
      // phím 1 … 9, 0 = máy ghim thứ 1 … 10 của bảng chọn máy (như bên Map)
      e.preventDefault();
      const slot = e.code === 'Digit0' ? 9 : Number(e.code.slice(5)) - 1;
      const id = pinnedMachineIds(ds)[slot];
      if (!id) deps.notify(tr('Chưa ghim máy thứ {0} — bấm ghim ở bảng chọn máy bên trái', slot + 1));
      else pickFromPalette(id);
    }
  };

  /**
   * Bảng chọn máy bên trái (dùng chung với Map) hoặc phím số ⇒ nút mới **chưa có công thức** (người dùng
   * 2026-09-29): nối vào máy khác là tự chọn công thức, hoặc bấm đúp để chọn.
   */
  const pickFromPalette = (machineId: string, at?: { x: number; y: number }): void => {
    if (document.body.classList.contains('modal-open')) return;
    const def = ds.machines.get(machineId);
    if (!def) return;
    if (!modelerMachines(ds).some((d) => d.id === def.id)) {
      deps.notify(tr('{0} không dùng trong Modeler (không có công thức)', def.name));
      return;
    }
    // Cửa Xả Phụ Phẩm: chỉ một (như trên map) — mọi cửa nạp nước thải đều dồn về nó
    if (def.id === SEWAGE_OUT.machine && hasSewageOut()) {
      deps.notify(tr('{0}: chỉ được có một trên sơ đồ', def.name));
      return;
    }
    const added = (): void =>
      deps.notify(
        nodeKind(def) === 'sewageOut'
          ? tr('Đã thêm {0}', def.name)
          : tr('Đã thêm {0} — nối với máy khác để tự chọn {1}, hoặc bấm đúp máy', def.name, choosesItem(def) ? tr('vật phẩm') : tr('công thức')),
      );
    if (at) {
      addNode({ machineId: def.id, recipeId: null }, at);
      added();
      return;
    }
    // bấm lại đúng máy đang cầm ở bảng chọn máy ⇒ thôi cầm (người dùng 2026-10-05)
    if (moving?.fresh && doc.nodes.find((n) => n.id === moving!.fresh)?.machineId === def.id) {
      cancelMove();
      return;
    }
    // bấm máy ở bảng chọn / phím số (người dùng 2026-10-03): nút mới **đi theo chuột** tới khi bấm trái để đặt,
    // không đặt sẵn giữa màn hình nữa. Esc ⇒ bỏ. Cả lần thêm + đặt là một bước hoàn tác.
    if (moving) {
      if (moving.fresh) cancelMove();
      else finishMove();
    }
    const before = snap();
    const p = mouseWorld();
    const node: MNode = { id: newId('n'), x: Math.round(p.x - 66), y: Math.round(p.y - 55), limit: null, machineId: def.id, recipeId: null };
    doc.nodes.push(node);
    selected = new Set([node.id]);
    render();
    startMove();
    if (!moving) return;
    moving.before = before;
    moving.fresh = node.id;
    moving.placed = added;
    setModelerHolding(def.id);
    deps.notify(tr('{0}: rê chuột tới chỗ cần đặt rồi bấm chuột trái · Esc để huỷ', def.name));
  };
  const onPick = (e: Event): void => pickFromPalette((e as CustomEvent<string>).detail);
  /** Kéo máy từ bảng chọn thả lên sơ đồ (người dùng 2026-10-02) ⇒ nút mới ngay chỗ thả; thả ngoài sơ đồ ⇒ thôi. */
  const onDrop = (e: Event): void => {
    const d = (e as CustomEvent<ModelerDrop>).detail;
    const r = viewport.getBoundingClientRect();
    if (d.clientX < r.left || d.clientX >= r.right || d.clientY < r.top || d.clientY >= r.bottom) return;
    pickFromPalette(d.machineId, toWorld(d.clientX, d.clientY));
  };
  const hasSewageOut = (): boolean => doc.nodes.some((n) => n.machineId === SEWAGE_OUT.machine);
  const nodeKindOf = (machineId: string): string | null => {
    const def = ds.machines.get(machineId);
    return def ? nodeKind(def) : null;
  };

  viewport.addEventListener('mousedown', onDown);
  viewport.addEventListener('contextmenu', onContext);
  viewport.addEventListener('dblclick', onDblClick);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  // cảm ứng hai ngón (app Android, `ui/touch.ts`, người dùng 2026-10-05): kéo + chụm/mở để zoom quanh tâm hai ngón
  viewport.addEventListener(TOUCH_VIEW_EVENT, (ev) => {
    const { dx, dy, factor, cx, cy } = (ev as CustomEvent<TouchViewDetail>).detail;
    const r = viewport.getBoundingClientRect();
    const mx = cx - r.left;
    const my = cy - r.top;
    view.x += dx;
    view.y += dy;
    const z = Math.max(MIN_ZOOM, Math.min(3, view.zoom * factor));
    view.x = mx - ((mx - view.x) * z) / view.zoom;
    view.y = my - ((my - view.y) * z) / view.zoom;
    view.zoom = z;
    applyView();
    changed();
  });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener(MODELER_PICK, onPick);
  window.addEventListener(MODELER_DROP, onDrop);
  window.addEventListener('mousedown', onDocDown, true);

  // ------------------------------------------------------------------ vừa màn hình
  const fit = (): void => {
    if (doc.nodes.length === 0 && !doc.drawings?.length) {
      view.x = 60;
      view.y = 60;
      view.zoom = 1;
    } else {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const n of doc.nodes) {
        const b = nodeEls.get(n.id);
        const w = b?.offsetWidth ?? 160;
        const h = b?.offsetHeight ?? 110;
        x0 = Math.min(x0, n.x);
        y0 = Math.min(y0, n.y);
        x1 = Math.max(x1, n.x + w);
        y1 = Math.max(y1, n.y + h);
      }
      for (const d of doc.drawings ?? []) {
        const b = inkBounds(d);
        x0 = Math.min(x0, b.x0);
        y0 = Math.min(y0, b.y0);
        x1 = Math.max(x1, b.x1);
        y1 = Math.max(y1, b.y1);
      }
      const r = viewport.getBoundingClientRect();
      const z = Math.max(MIN_ZOOM, Math.min(1.5, Math.min((r.width - 120) / (x1 - x0), (r.height - 140) / (y1 - y0))));
      view.zoom = z;
      view.x = r.width / 2 - ((x0 + x1) / 2) * z;
      view.y = r.height / 2 - ((y0 + y1) / 2) * z;
    }
    applyView();
    drawEdges();
    changed();
  };

  // ------------------------------------------------------------------ chọn máy / công thức
  /**
   * Nút mới giữa màn hình (lệch dần để không chồng lên nhau); `at` = điểm thả khi kéo từ bảng chọn (toạ độ sơ đồ)
   * ⇒ nút nằm giữa quanh điểm đó.
   */
  const addNode = (n: Omit<MNode, 'id' | 'x' | 'y' | 'limit'>, at?: { x: number; y: number }): void => {
    const r = viewport.getBoundingClientRect();
    const c = at ?? toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const k = at ? 0 : doc.nodes.length % 6;
    const node: MNode = { id: newId('n'), x: Math.round(c.x - (at ? 66 : 80) + k * 24), y: Math.round(c.y - (at ? 55 : 60) + k * 24), limit: null, ...n };
    selected = new Set([node.id]);
    mutate(() => doc.nodes.push(node));
  };

  const dialog = (title: string, body: HTMLElement, wide = true): { close(): void; box: HTMLElement } => {
    const overlay = el('div', { class: 'bp-overlay md-overlay' });
    const close = (): void => {
      window.removeEventListener('keydown', esc, true);
      overlay.remove();
      if (!document.querySelector('.bp-overlay')) document.body.classList.remove('modal-open');
    };
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    const box = el(
      'div',
      { class: `bp-dialog md-dialog${wide ? '' : ' small'}` },
      el('div', { class: 'bp-dialog-title' }, title, el('button', { class: 'bp-close md-x', title: tr('Đóng (Esc)'), onclick: () => close() }, '×')),
      body,
    );
    overlay.append(box);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close();
    });
    window.addEventListener('keydown', esc, true);
    document.body.append(overlay);
    document.body.classList.add('modal-open');
    return { close, box };
  };

  const modeLabel = (def: MachineDef | undefined, r: RecipeDef): string | null =>
    r.mode && def?.modes ? (def.modes.find((m) => m.id === r.mode)?.label ?? null) : null;

  /**
   * Bảng chọn một cách nối: mỗi thẻ = loại máy (+ chế độ) và công thức, hoặc máy nguồn lấy vật phẩm từ kho.
   * `search` = có ô tìm (danh sách dài khi thả ra khoảng trống).
   */
  /**
   * Phần thân của một thẻ lựa chọn (người dùng 2026-10-02): công thức thường ⇒ thẻ công thức; Máy Phân Tách ⇒ một
   * dòng "Lấy chất lỏng / khí ra"; dòng gộp Máy Chiết Rót ⇒ "Chứa trong lọ / bình"; lò phản ứng ⇒ công thức của lò;
   * máy "chọn vật phẩm" ⇒ đúng việc nó làm (trước đây mọi thẻ không công thức đều ghi "Lấy … từ kho (vô hạn)").
   */
  const optionBody = (o: LinkOption, r: RecipeDef | undefined): HTMLElement => {
    const line = (chip: string | null, text: string): HTMLElement =>
      el('div', { class: 'md-opt-src' }, chip ? itemChip(state, chip) : null, text);
    if (o.fill) {
      const first = ds.recipes.get(o.fill[0]!);
      const fluid = first?.ingredients.find((x) => ds.items.get(x.itemId)?.phase !== 'solid')?.itemId;
      const gas = fluid ? ds.items.get(fluid)?.phase === 'gas' : false;
      return line(fluid ?? null, tr('{0} ({1} loại {2})', gas ? tr('Chứa trong bình') : tr('Chứa trong lọ'), o.fill.length, gas ? tr('bình') : tr('lọ')));
    }
    if (r && o.machineId === 'dismantler_1') {
      const fluid = r.outcomes.find((x) => ds.items.get(x.itemId)?.phase !== 'solid')?.itemId;
      const gas = fluid ? ds.items.get(fluid)?.phase === 'gas' : false;
      return line(fluid ?? null, `${gas ? tr('Lấy khí ra') : tr('Lấy chất lỏng ra')}${fluid ? ` — ${itemName(ds, fluid)}` : ''}`);
    }
    if (r) return recipeCard(state, r, 1);
    if (o.tick) {
      const t = ds.recipes.get(o.tick);
      if (t) return recipeCard(state, t, 1);
    }
    const k = nodeKindOf(o.machineId);
    const name = o.item ? itemName(ds, o.item) : '';
    if (k === 'source') return line(o.item ?? null, tr('Lấy {0} từ kho (vô hạn)', name));
    if (k === 'sink' && o.pass) return line(o.item ?? null, tr('Lấy {0} ra từ kho / bể (chuyển tiếp hàng đã vào)', name));
    if (k === 'sink')
      return line(
        o.item ?? null,
        o.machineId === 'liquid_cleaner_1'
          ? tr('Xử lý {0} (xoá sạch)', name)
          : o.machineId === SEWAGE_OUT.inlet
            ? tr('Nạp {0} (sang Cửa Xả Phụ Phẩm)', name)
            : SINKS[o.machineId]?.tank
              ? tr('Chứa {0} trong bể', name)
              : tr('Đưa {0} vào kho tổng', name),
      );
    if (k === 'env') return line(o.item ?? null, o.slot === 'act' ? tr('Nạp {0} để tạo môi trường', name) : tr('Tạo môi trường bằng {0}', name));
    if (k === 'crucible') return line(null, tr('Lò làm ra vật phẩm này'));
    return line(o.item ?? null, name);
  };

  const chooseOption = (title: string, opts: LinkOption[], onPick: (o: LinkOption) => void, search = false): void => {
    const grid = el('div', { class: 'recipe-grid md-recipes md-options' });
    const find = search ? el('input', { class: 'bp-search', type: 'search', placeholder: tr('Tìm máy / vật phẩm… (không cần dấu)') }) : null;
    const body = el('div', { class: 'md-dialog-body' }, find, grid);
    const dlg = dialog(title, body);
    const text = (o: LinkOption): string => {
      const def = ds.machines.get(o.machineId);
      const r = o.recipeId ? ds.recipes.get(o.recipeId) : undefined;
      const items = r ? [...r.ingredients, ...r.outcomes].map((s) => itemName(ds, s.itemId)).join(' ') : o.item ? itemName(ds, o.item) : '';
      return fold(`${def?.name ?? ''} ${def?.nameVi ?? ''} ${def?.nameEn ?? ''} ${items}`);
    };
    const draw = (): void => {
      clear(grid);
      const q = fold(find?.value.trim() ?? '');
      for (const o of opts) {
        if (q && !text(o).includes(q)) continue;
        const def = ds.machines.get(o.machineId);
        const r = o.recipeId ? ds.recipes.get(o.recipeId) : undefined;
        const mode = r ? modeLabel(def, r) : null;
        grid.append(
          el(
            'button',
            {
              class: 'rg-card md-recipe md-option',
              onclick: () => {
                dlg.close();
                onPick(o);
              },
            },
            el(
              'div',
              { class: 'md-opt-head' },
              el('img', { src: `img/items/${def?.icon ?? o.machineId}.png`, alt: '' }),
              el('span', {}, def?.name ?? o.machineId),
              mode ? el('span', { class: 'md-mode' }, mode) : null,
            ),
            optionBody(o, r),
          ),
        );
      }
      if (!grid.firstChild) grid.append(el('div', { class: 'empty' }, tr('Không có gì khớp')));
    };
    find?.addEventListener('input', draw);
    draw();
    autoFocus(find);
  };

  /**
   * Lò phản ứng (bấm đúp): tick công thức để **ưu tiên** chạy trước — như bên Map; công thức không tick vẫn tự
   * chạy nếu đủ nguyên liệu và còn chỗ trong lò.
   */
  const pickTicks = (def: MachineDef, node: MNode): void => {
    const recipes = ds.recipesByMachine.get(def.id) ?? [];
    const grid = el('div', { class: 'recipe-grid md-recipes' });
    const body = el('div', { class: 'md-dialog-body' }, el('div', { class: 'md-pop-hint' }, tr('Tick để ưu tiên chạy trước. Công thức không tick vẫn tự chạy khi đủ nguyên liệu và lò còn chỗ.')), grid);
    dialog(tr('{0} — công thức ưu tiên', def.name), body);
    const draw = (): void => {
      clear(grid);
      const running = new Set((calc.nodes.get(node.id)?.recipes ?? []).map((x) => x.recipe.id));
      for (const r of recipes) {
        const on = node.ticks?.includes(r.id) ?? false;
        grid.append(
          el(
            'button',
            {
              class: `rg-card md-recipe${on ? ' ticked' : ''}`,
              onclick: () => {
                mutate(() => {
                  const t = (node.ticks ?? []).filter((x) => x !== r.id);
                  if (!on) t.push(r.id);
                  if (t.length) node.ticks = t;
                  else delete node.ticks;
                });
                draw();
              },
            },
            el('div', { class: 'md-mode' }, on ? tr('✔ Ưu tiên') : running.has(r.id) ? tr('Đang chạy') : ''),
            recipeCard(state, r, 1),
          ),
        );
      }
    };
    draw();
  };

  /** Chọn / đổi công thức của nút `node` (bấm đúp). */
  const pickRecipe = (def: MachineDef, node: MNode): void => {
    const recipes = ds.recipesByMachine.get(def.id) ?? [];
    const grid = el('div', { class: 'recipe-grid md-recipes' });
    const body = el('div', { class: 'md-dialog-body' }, grid);
    const dlg = dialog(tr('{0} — chọn công thức', def.name), body);
    for (const r of recipes) {
      const mode = modeLabel(def, r);
      grid.append(
        el(
          'button',
          {
            class: `rg-card md-recipe${node.recipeId === r.id ? ' ticked' : ''}`,
            onclick: () => {
              dlg.close();
              mutate(() => setNodeRecipe(ds, doc, node.id, r.id));
            },
          },
          mode ? el('div', { class: 'md-mode' }, mode) : null,
          recipeCard(state, r, 1),
        ),
      );
    }
  };

  /**
   * Máy nguồn: chọn vật phẩm lấy ra từ kho (vô hạn). Mỗi máy một thể: Máy Bơm Chống Ăn Mòn Mk II = lỏng,
   * Máy Tách Khí = khí, Máy Dỡ Hàng Kho = rắn; Cửa Xả Ống Dẫn = lỏng / khí.
   */
  const pickSourceItem = (def: MachineDef, node: MNode): void => {
    const search = el('input', { class: 'bp-search', type: 'search', placeholder: tr('Tìm vật phẩm… (không cần dấu)') });
    const grid = el('div', { class: 'md-items' });
    const body = el('div', { class: 'md-dialog-body' }, search, grid);
    const k = nodeKind(def);
    const dlg = dialog(
      `${def.name} — ${k === 'source' ? tr('vật phẩm lấy ra từ kho (vô hạn)') : k === 'env' ? tr('khí kích hoạt') : tr('vật phẩm nhận vào')}`,
      body,
    );
    const order = sourcePhases(def) ?? [];
    // nhóm: Sản phẩm thô · Sản phẩm khu phức hợp · Cây trồng · Bình chứa khí/lỏng (người dùng 2026-10-02)
    const sorted = sourceItemsFor(ds, def)
      .map((id) => ds.items.get(id)!)
      .sort((a, b) => order.indexOf(phaseOf(ds, a.id)) - order.indexOf(phaseOf(ds, b.id)) || a.name.localeCompare(b.name));
    const groups = groupItems(ds, sorted.map((i) => i.id));
    const items = groups.flatMap((g) => g.ids.map((id, k) => ({ ...ds.items.get(id)!, head: k === 0 && groups.length > 1 ? g.title : null })));
    const draw = (): void => {
      clear(grid);
      const q = fold(search.value.trim());
      let lastHead: string | null = null;
      let group: string | null = null;
      for (const it of items) {
        if (it.head) group = it.head;
        if (q && !fold(it.name).includes(q) && !it.id.includes(q)) continue;
        if (group && group !== lastHead) {
          lastHead = group;
          grid.append(el('div', { class: 'ip-section' }, group));
        }
        grid.append(
          el(
            'button',
            {
              class: `ip-item${node.item === it.id ? ' active' : ''}`,
              title: it.name,
              onclick: () => {
                dlg.close();
                mutate(() => applyOption(ds, doc, node.id, { machineId: def.id, recipeId: null, item: it.id }));
              },
            },
            el('img', { src: itemIconSrc(state, it.id), alt: '' }),
          ),
        );
      }
    };
    search.addEventListener('input', draw);
    draw();
    autoFocus(search);
  };

  render();
  if (fitOnOpen) requestAnimationFrame(() => fit());

  /**
   * Model hoá từ Thư viện công thức (người dùng 2026-10-06, lần 2): thêm thẳng các nút vào sơ đồ đang mở — đặt bên phải
   * phần đã có, cùng hàng trên cùng — và **chọn sẵn** chúng (kéo đi / xoá được ngay), rồi vừa màn hình.
   */
  const onInsert = (e: Event): void => {
    const add = (e as CustomEvent<ModelerDoc>).detail;
    if (!add?.nodes.length || !root.isConnected) return;
    const minX = Math.min(...add.nodes.map((n) => n.x));
    const minY = Math.min(...add.nodes.map((n) => n.y));
    const has = doc.nodes.length > 0;
    const dx = (has ? Math.max(...doc.nodes.map((n) => n.x + (nodeEls.get(n.id)?.offsetWidth ?? 160))) + 240 : 60) - minX;
    const dy = (has ? Math.min(...doc.nodes.map((n) => n.y)) : 60) - minY;
    mutate(() => {
      for (const n of add.nodes) doc.nodes.push({ ...n, x: Math.round(n.x + dx), y: Math.round(n.y + dy) });
      for (const ed of add.edges) doc.edges.push(ed);
    });
    selected = new Set(add.nodes.map((n) => n.id));
    markSelected();
    requestAnimationFrame(() => fit());
  };
  window.addEventListener(MODELER_INSERT_EVENT, onInsert);

  return () => {
    window.removeEventListener(MODELER_INSERT_EVENT, onInsert);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener(MODELER_PICK, onPick);
    window.removeEventListener(MODELER_DROP, onDrop);
    window.removeEventListener('mousedown', onDocDown, true);
    if (moving?.fresh) cancelMove(); // chuyển tab khi máy vừa chọn chưa đặt: bỏ nó
    setModelerHolding(null);
    commitText(); // chuyển tab khi đang viết dở: giữ chữ đã viết
    clear(root);
  };
}
