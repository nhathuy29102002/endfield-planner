import { placeableMachines } from '../model/dataset';
import { CATEGORY_ICON, CATEGORY_ORDER, categoryOf, machineMeta, type Category } from '../model/categories';
import { footprintGrid } from './footprint';
import type { AppState } from '../editor/state';
import { PALETTE_DRAG_PX, PALETTE_DROP_EVENT } from '../editor/tools';
import { BP_PINS_EVENT, LIBRARY_EVENT, USE_BLUEPRINT_EVENT, loadBlueprintPins, loadLibrary, type SavedBlueprint } from '../blueprint/library';
import { isValley, type Dataset, type MachineDef } from '../model/types';
import { roleOf } from '../model/roles';
import { MODELER_DROP, MODELER_HOLD_EVENT, MODELER_PICK, modelerHolding, modelerMachines, type ModelerDrop } from '../modeler/doc';
import { clear, el } from './dom';
import { otherName, tr } from '../i18n';
import { isTouchUI } from '../platform';

/** Icon "bản vẽ" của bản vẽ ghim trên thanh thu gọn: tờ giấy gập góc có lưới và hình máy nối nhau (màu = `currentColor`). */
const BLUEPRINT_SVG =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 3h16l6 6v20H5z" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M21 3v6h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
  '<path d="M9 13h14M9 18h14M9 23h14M12 10v16M17 10v16" stroke="currentColor" stroke-opacity="0.35" stroke-width="0.8"/>' +
  '<rect x="8.5" y="14" width="5" height="5" rx="1" fill="currentColor"/><rect x="18" y="20" width="5" height="5" rx="1" fill="currentColor"/>' +
  '<path d="M13.5 16.5h3v6h1.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

/**
 * Tuỳ chọn của bảng chọn máy, lưu trong trình duyệt để lần sau mở lại vẫn như cũ.
 * `localStorage` có thể ném lỗi (chế độ ẩn danh, bị chặn) — khi đó cứ chạy với mặc định.
 */
interface PaletteSettings {
  pinned: string[];
  collapsed: boolean;
  closedGroups: string[];
  /** Ô "Hiện ẩn": hiện cả những công trình không được chọn / xây (người dùng 2026-09-29). */
  showHidden?: boolean;
}
const STORE_KEY = 'efp:palette';

function loadSettings(): PaletteSettings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<PaletteSettings>;
      return { pinned: v.pinned ?? [], collapsed: v.collapsed ?? false, closedGroups: v.closedGroups ?? [], showHidden: v.showHidden ?? false };
    }
  } catch {
    /* dùng mặc định */
  }
  // lần đầu: bảng chọn máy chỉ thu gọn sẵn trên **điện thoại màn dọc** (app / web — người dùng 2026-10-07); máy tính và
  // điện thoại ngang mở sẵn
  return { pinned: [], collapsed: isTouchUI() && window.innerHeight > window.innerWidth, closedGroups: [] };
}
function saveSettings(s: PaletteSettings): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* không lưu được thì thôi */
  }
}

/**
 * Máy đã ghim, đúng thứ tự hiện trong nhóm "Đã ghim" (từ trên xuống) — phím số 1 → 0 cầm máy
 * thứ 1 → 10 (xem `input.ts`). Đọc thẳng từ trình duyệt nên luôn khớp với bảng đang hiện.
 */
export function pinnedMachineIds(ds: Dataset): string[] {
  const placeable = new Set(placeableMachines(ds).map((d) => d.id));
  return loadSettings().pinned.filter((id) => placeable.has(id));
}

/** Nhãn phím tắt của máy ghim thứ `i` (0-based): 1 … 9, 0; từ thứ 11 trở đi không có. */
/** Giao diện cảm ứng (app Android). */
const touch = isTouchUI();
const hotkeyLabel = (i: number): string | null => (i < 9 ? String(i + 1) : i === 9 ? '0' : null);

/** Bỏ dấu tiếng Việt để gõ "lo tinh luyen" vẫn ra "Lò Tinh Luyện". */
const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

/** Ghim / bỏ ghim một máy lên bảng chọn máy từ chỗ khác (Thư viện công thức) — `detail` = id máy. */
export const PIN_MACHINE_EVENT = 'efp:pin-machine';
/** Mở Thư viện công thức (nút ba cuốn sách cạnh tên app ở đầu bảng chọn máy). */
export const OPEN_RECIPES_EVENT = 'efp:open-recipes';

/** Ba cuốn sách chồng lên nhau — nút Thư viện công thức. */
/** Nút mở Thư viện công thức (ba cuốn sách, màu vàng). */
export function recipesButton(extraClass = ''): HTMLElement {
  const b = el('button', { class: `recipes-btn${extraClass ? ` ${extraClass}` : ''}`, type: 'button', title: tr('Thư viện công thức — hồ sơ vật phẩm, chuỗi sản xuất') });
  b.innerHTML = BOOKS_SVG;
  b.addEventListener('click', () => window.dispatchEvent(new Event(OPEN_RECIPES_EVENT)));
  return b;
}

export const BOOKS_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="15.5" width="16" height="4.5" rx="1" fill="currentColor" fill-opacity="0.18"/><rect x="5" y="10.5" width="15" height="4.5" rx="1" transform="rotate(-4 12.5 12.75)" fill="currentColor" fill-opacity="0.18"/><rect x="4" y="5" width="14" height="4.5" rx="1" fill="currentColor" fill-opacity="0.18"/><path d="M6.5 15.5v4.5M8 5v4.5"/></svg>';

/** Icon ghim (vàng) cho nhóm "Đã ghim" và thanh cuộn — ảnh nền CSS nên viết thành data URL. */
const PIN_URL = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" fill="#e8c547"/></svg>')}`;

/** Mũi tên đôi của nút thu gọn / mở rộng — vẽ SVG cho icon to vừa nút (người dùng 2026-09-29). */
const CHEVRON_LEFT =
  '<svg viewBox="0 0 24 24" class="collapse-icon"><path d="M12 6l-6 6 6 6M19 6l-6 6 6 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEVRON_RIGHT =
  '<svg viewBox="0 0 24 24" class="collapse-icon"><path d="M5 6l6 6-6 6M12 6l6 6-6 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const chevronBtn = (title: string, icon: string, onclick: () => void): HTMLElement => {
  const b = el('button', { class: 'collapse-btn', title, onclick });
  b.innerHTML = icon;
  return b;
};

const PIN_ICON =
  '<svg viewBox="0 0 24 24" class="pin-icon"><path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" fill="currentColor"/></svg>';

/**
 * Bảng chọn máy: gõ để lọc, bấm để vào chế độ đặt.
 *
 * - **Ghim**: máy hay dùng ghim lên nhóm "Đã ghim" trên cùng.
 * - **Thu gọn cả bảng**: còn một cột hẹp chỉ gồm biểu tượng các máy đã ghim — đủ để
 *   đặt máy quen tay mà nhường gần hết màn hình cho bản vẽ.
 * - **Thu gọn từng nhóm**: bấm vào tiêu đề nhóm.
 */
export function mountPalette(root: HTMLElement, state: AppState, onLayout: () => void): () => void {
  const settings = loadSettings();
  const app = root.closest('#app') as HTMLElement | null;
  const head = el('div', { class: 'panel-head palette-head' });
  const search = el('input', { class: 'search', type: 'search', placeholder: tr('Tìm máy…') });
  const list = el('div', { class: 'palette-list' });
  // Thanh cuộn riêng (người dùng 2026-09-29): nền là icon 6 nhóm chính xếp dọc, con trượt đè lên.
  // Thanh cuộn gốc của trình duyệt bị ẩn (CSS `.palette-list`).
  const rail = el('div', { class: 'palette-rail' });
  const thumb = el('div', { class: 'palette-thumb' });
  const railIcons = new Map<string, HTMLElement>();
  // điện thoại: nhóm "Đã ghim" có icon ghim và có mặt trên thanh cuộn (người dùng 2026-10-06)
  if (touch) {
    const icon = el('div', {
      class: 'rail-icon rail-pin',
      title: tr('Đã ghim'),
      style: `background-image: url("${PIN_URL}")`,
      onclick: () => list.scrollTo({ top: 0, behavior: 'smooth' }),
    });
    railIcons.set('__pinned', icon);
    rail.append(icon);
  }
  for (const cat of CATEGORY_ORDER) {
    const src = CATEGORY_ICON[cat];
    if (!src) continue; // Miscellaneous: không có icon
    const icon = el('div', {
      class: 'rail-icon',
      title: cat,
      style: `background-image: url(${src})`,
      // bấm icon ⇒ cuộn tới nhóm đó (như cột nhóm của EnKAD)
      onclick: () => {
        const g = list.querySelector<HTMLElement>(`[data-group="${cat}"]`);
        if (g) list.scrollTo({ top: g.offsetTop, behavior: 'smooth' });
      },
    });
    railIcons.set(cat, icon);
    rail.append(icon);
  }
  rail.append(thumb);
  const scroller = el('div', { class: 'palette-scroll' }, list, rail);
  root.append(head, search, scroller);

  /** Con trượt theo vị trí cuộn; icon của nhóm đang nằm trong khung nhìn thì sáng lên. */
  const updateRail = (): void => {
    const view = list.clientHeight;
    const total = list.scrollHeight;
    const scrollable = total > view + 1;
    rail.classList.toggle('idle', !scrollable);
    const railH = rail.clientHeight;
    const h = scrollable ? Math.max(24, (railH * view) / total) : railH;
    const top = scrollable ? ((railH - h) * list.scrollTop) / (total - view) : 0;
    thumb.style.height = `${h}px`;
    thumb.style.transform = `translateY(${top}px)`;
    const lo = list.scrollTop;
    const hi = lo + view;
    for (const [cat, icon] of railIcons) {
      const g = list.querySelector<HTMLElement>(`[data-group="${cat}"]`);
      const seen = !!g && g.offsetTop < hi && g.offsetTop + g.offsetHeight > lo;
      icon.classList.toggle('seen', seen);
      icon.classList.toggle('absent', !g);
    }
  };
  list.addEventListener('scroll', updateRail, { passive: true });
  window.addEventListener('resize', updateRail);

  // kéo con trượt
  thumb.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    thumb.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const s0 = list.scrollTop;
    const move = (ev: PointerEvent): void => {
      const railH = rail.clientHeight;
      const h = thumb.offsetHeight;
      const range = list.scrollHeight - list.clientHeight;
      if (railH - h > 0) list.scrollTop = s0 + ((ev.clientY - y0) * range) / (railH - h);
    };
    const up = (): void => {
      thumb.removeEventListener('pointermove', move);
      thumb.removeEventListener('pointerup', up);
      thumb.removeEventListener('pointercancel', up);
      thumb.classList.remove('drag');
    };
    thumb.classList.add('drag');
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('pointerup', up);
    thumb.addEventListener('pointercancel', up);
  });

  const byId = new Map(placeableMachines(state.ds).map((d) => [d.id, d]));
  /** Máy dùng được trên sơ đồ Modeler (có công thức / máy nguồn) — máy khác mờ đi khi ở tab Modeler. */
  const forModeler = new Set(modelerMachines(state.ds).map((d) => d.id));
  const inModeler = (): boolean => !!app?.classList.contains('modeler-mode');
  /**
   * Bấm một máy: bên Map ⇒ cầm máy để đặt; bên Modeler (dùng chung bảng này, người dùng 2026-09-29)
   * ⇒ màn hình Modeler mở hộp chọn công thức / vật phẩm rồi thêm nút.
   */
  const pick = (def: MachineDef): void => {
    // bấm lại đúng máy đang cầm ⇒ thôi cầm (người dùng 2026-10-05; Modeler tự xử lý khi nhận lại cùng máy)
    if (inModeler()) window.dispatchEvent(new CustomEvent(MODELER_PICK, { detail: def.id }));
    else if (activeIn(def)) {
      state.setTool({ kind: 'select' });
      state.notify(tr('Đã thôi chọn {0}', def.name));
    } else state.setTool({ kind: 'place', machineId: def.id, rot: 0, mode: 'new' });
  };
  /**
   * **Kéo thả** một máy từ bảng chọn (thu gọn hay mở rộng) thẳng xuống bản vẽ (người dùng 2026-10-02) — khỏi bấm
   * hai lần. Nhấn chuột trái rồi rê quá `PALETTE_DRAG_PX` mới thành kéo (bấm thường vẫn là "cầm máy" như cũ).
   * Map: cầm máy ngay khi bắt đầu kéo (preview bám con trỏ trên bản vẽ), thả trên bản vẽ ⇒ đặt một máy rồi thôi
   * cầm (`PALETTE_DROP_EVENT`, xử lý ở `input.ts`). Modeler: thả trên sơ đồ ⇒ thêm nút đúng chỗ thả.
   * Một icon nhỏ của máy chạy theo con trỏ trong lúc kéo.
   */
  let dragged = false;
  /**
   * Kéo một thứ từ bảng chọn: `icon` chạy theo con trỏ; `start` chạy khi bắt đầu kéo (vd. cầm máy), `drop` khi thả.
   * **Esc** giữa chừng (người dùng 2026-10-02) ⇒ thôi kéo, bỏ icon; bên Map, Esc của `input.ts` thôi cầm máy luôn.
   */
  const dragSource = (btn: HTMLElement, spec: () => { icon: string; start(): void; drop(x: number, y: number): void }): void => {
    // cảm ứng (app Android): giữ ~0,4 s rồi kéo ⇒ `ui/touch.ts` phát mousedown / mousemove / mouseup giả cho đúng đường này
    btn.dataset.touchDrag = 'mouse';
    btn.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('.pin')) return;
      e.preventDefault(); // không kéo ảnh / bôi đen chữ kiểu trình duyệt
      const x0 = e.clientX;
      const y0 = e.clientY;
      const sp = spec();
      let ghost: HTMLElement | null = null;
      const stop = (): void => {
        window.removeEventListener('mousemove', move, true);
        window.removeEventListener('mouseup', up, true);
        window.removeEventListener('keydown', key, true);
        ghost?.remove();
        document.body.classList.remove('palette-dragging');
        if (ghost) {
          dragged = true; // nuốt cú `click` có thể tới ngay sau
          setTimeout(() => (dragged = false), 0);
        }
      };
      const move = (ev: MouseEvent): void => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < PALETTE_DRAG_PX) return;
          ghost = el('img', { class: 'palette-drag-ghost', src: sp.icon, alt: '' });
          document.body.append(ghost);
          document.body.classList.add('palette-dragging');
          sp.start();
        }
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
      };
      const up = (ev: MouseEvent): void => {
        const was = ghost;
        stop();
        if (was) sp.drop(ev.clientX, ev.clientY); // chưa kéo thì để `click` lo như cũ
      };
      const key = (ev: KeyboardEvent): void => {
        if (ev.key === 'Escape') stop();
      };
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mouseup', up, true);
      window.addEventListener('keydown', key, true);
    });
  };
  /** Kéo một máy: Map ⇒ cầm máy ngay, thả ⇒ `PALETTE_DROP_EVENT`; Modeler ⇒ thả ⇒ `MODELER_DROP`. */
  const machineDrag = (btn: HTMLElement, def: MachineDef): void =>
    dragSource(btn, () => ({
      icon: `img/items/${def.icon}.png`,
      start: () => {
        // bắt đầu kéo luôn là cầm máy (không bật / tắt như bấm)
        if (!inModeler()) state.setTool({ kind: 'place', machineId: def.id, rot: 0, mode: 'new' });
      },
      drop: (clientX, clientY) => {
        if (inModeler()) {
          const detail: ModelerDrop = { machineId: def.id, clientX, clientY };
          window.dispatchEvent(new CustomEvent(MODELER_DROP, { detail }));
        } else window.dispatchEvent(new CustomEvent(PALETTE_DROP_EVENT, { detail: { clientX, clientY } }));
      },
    }));
  /**
   * Bản vẽ ghim trên thanh thu gọn: bấm = Đặt / Mở như ở cửa sổ Bản vẽ (`USE_BLUEPRINT_EVENT` ⇒ `main.ts`); bản vẽ
   * module bên Map kéo thả được như máy (cầm bản vẽ khi bắt đầu kéo, thả trên bản vẽ ⇒ đặt một lần).
   */
  const blueprintMini = (b: SavedBlueprint): HTMLElement => {
    const item = b.icon ? state.ds.items.get(b.icon) : undefined;
    const use = (): void => {
      window.dispatchEvent(new CustomEvent(USE_BLUEPRINT_EVENT, { detail: b.id }));
    };
    const pic = item ? `img/itemicon/${item.icon}.png` : b.preview;
    // icon riêng hình bản vẽ (màu theo loại), đính kèm biểu tượng chính bản vẽ đã chọn ở góc dưới-phải (người dùng 2026-10-02 đợt 2)
    const sheet = el('span', { class: 'mini-bp-sheet' });
    sheet.innerHTML = BLUEPRINT_SVG;
    const btn = el(
      'button',
      {
        class: `mini-machine mini-bp ${b.kind}`,
        title: `${b.name} — ${b.kind === 'map' ? tr('Bản vẽ toàn map') : b.kind === 'modeler' ? tr('Sơ đồ Modeler — mở thành tab mới') : tr('Bản vẽ module (nhóm)')}`,
        onclick: () => {
          if (!dragged) use();
        },
      },
      sheet,
      item ? el('img', { src: `img/itemicon/${item.icon}.png`, alt: b.name, class: 'mini-bp-badge' }) : null,
    );
    if (b.kind === 'module')
      dragSource(btn, () => ({
        icon: pic,
        start: use,
        drop: (clientX, clientY) => window.dispatchEvent(new CustomEvent(PALETTE_DROP_EVENT, { detail: { clientX, clientY } })),
      }));
    return btn;
  };
  /** Bản vẽ ghim, theo thứ tự ghim — đọc thư viện một lần, đọc lại khi thư viện / danh sách ghim đổi. */
  let bpCache: SavedBlueprint[] | null = null;
  const pinnedBlueprints = (): SavedBlueprint[] => {
    const pins = loadBlueprintPins();
    if (pins.length === 0) return [];
    bpCache ??= loadLibrary();
    const byBp = new Map(bpCache.map((b) => [b.id, b]));
    return pins.map((id) => byBp.get(id)).filter((b): b is SavedBlueprint => !!b);
  };
  const libraryChanged = (): void => {
    bpCache = null;
    if (settings.collapsed) render();
  };
  window.addEventListener(BP_PINS_EVENT, libraryChanged);
  window.addEventListener(LIBRARY_EVENT, libraryChanged);
  const clickPick = (def: MachineDef): void => {
    if (!dragged) pick(def);
  };
  const offClass = (def: MachineDef): string => (inModeler() && !forModeler.has(def.id) ? ' md-off' : '');
  /**
   * Bên Modeler, bỏ tick "Hiện ẩn" ⇒ **ẩn hẳn** máy không đặt được lên sơ đồ (máy khai thác, mối nối băng, cột
   * điện…); tick ⇒ hiện nhưng mờ (người dùng 2026-09-30). Bên Map các máy đó vẫn hiện như thường.
   */
  const hiddenHere = (def: MachineDef): boolean => inModeler() && !settings.showHidden && !forModeler.has(def.id);
  /** Máy đang được cầm để đặt (tô sáng ở bảng chọn máy) — bên Map: công cụ đặt máy mới; bên Modeler: nút đang bám chuột. */
  const activeIn = (def: MachineDef): boolean =>
    inModeler()
      ? modelerHolding() === def.id
      : state.tool.kind === 'place' && (state.tool.mode ?? 'new') === 'new' && state.tool.machineId === def.id;

  const persist = (): void => saveSettings(settings);

  const togglePin = (id: string): void => {
    const i = settings.pinned.indexOf(id);
    if (i >= 0) settings.pinned.splice(i, 1);
    else settings.pinned.push(id);
    persist();
    render();
  };
  // nút ghim trong Thư viện công thức (người dùng 2026-10-06) ghim / bỏ ghim máy của công thức đó
  window.addEventListener(PIN_MACHINE_EVENT, (e) => {
    const id = (e as CustomEvent<string>).detail;
    if (byId.has(id)) togglePin(id);
  });

  const setCollapsed = (v: boolean): void => {
    settings.collapsed = v;
    persist();
    render();
    // nội dung mới hiện dần trong lúc cột trượt (CSS `.panel.left.anim`)
    root.classList.remove('anim');
    void root.offsetWidth;
    root.classList.add('anim');
    onLayout(); // bề rộng cột đổi ⇒ canvas phải đo lại
  };

  /** Số phím tắt của một máy đã ghim (theo thứ tự trong nhóm "Đã ghim"), nếu có. */
  const hotkeyOf = (id: string): string | null => {
    const i = settings.pinned.filter((p) => byId.has(p)).indexOf(id);
    return i < 0 ? null : hotkeyLabel(i);
  };

  const machineRow = (def: MachineDef, showKey = false): HTMLElement => {
    const active = activeIn(def);
    const pinned = settings.pinned.includes(def.id);
    const hk = showKey ? hotkeyOf(def.id) : null;
    const thumb = el('img', { class: 'thumb', src: `img/items/${def.icon}.png`, alt: '', loading: 'lazy' });
    thumb.addEventListener('error', () => thumb.remove());
    const pin = el('span', {
      class: `pin${pinned ? ' on' : ''}`,
      title: pinned ? tr('Bỏ ghim') : tr('Ghim lên đầu'),
      onclick: (e: Event) => {
        e.stopPropagation();
        togglePin(def.id);
      },
    });
    pin.innerHTML = PIN_ICON;
    const row = el(
      'button',
      {
        class: `machine${active ? ' active' : ''}${offClass(def)}`,
        onclick: () => clickPick(def),
        title: (otherName(def) ? `${def.name} — ${otherName(def)}` : def.name) + (offClass(def) ? tr(' (không dùng trong Modeler)') : ''),
      },
      thumb,
      el('span', { class: 'machine-name' }, def.name),
      el('span', { class: 'machine-meta' }, machineMeta(def)),
      // diện tích máy: nằm giữa tên và nút ghim
      footprintGrid(def.size.w, def.size.d),
      pin,
      // số phím tắt (1 … 0) của máy ghim — góc trên-trái ảnh máy
      hk ? el('span', { class: 'hotkey', title: tr('Phím {0}', hk) }, hk) : null,
    );
    machineDrag(row, def);
    return row;
  };

  /**
   * Một nhóm máy. Tiêu đề **dính trên cùng** danh sách khi đã cuộn qua nó (`position: sticky`
   * trong khối của nhóm ⇒ nhóm sau đẩy tiêu đề nhóm trước ra). Đầu tiêu đề là **icon nhóm** thay
   * cho mũi tên ▸/▾, bấm vẫn đóng/mở như cũ; nhóm không có icon (Đã ghim, Miscellaneous) giữ mũi tên.
   */
  const groupBlock = (key: string, label: string, defs: MachineDef[], searching: boolean, icon?: string, extra?: HTMLElement, row = machineRow): void => {
    const closed = !searching && settings.closedGroups.includes(key);
    // mũi tên luôn là ▾, nhóm đóng thì xoay về ▸ (có hiệu ứng — người dùng 2026-10-05)
    const lead = icon ? el('span', { class: 'group-icon', style: `background-image: url(${icon})` }) : el('span', { class: 'caret' }, '▾');
    // máy của nhóm luôn được dựng, bọc trong khung co / giãn (`.fold-body`, cùng cách với bảng tổng hợp): đóng / mở chỉ
    // đổi class ⇒ có hiệu ứng, không dựng lại cả bảng (người dùng 2026-10-05)
    const inner = el('div', { class: 'fold-inner' });
    const body = el('div', { class: `fold-body pgroup-body${closed ? ' shut' : ''}` }, inner);
    const block = el('div', { class: `pgroup${closed ? ' closed' : ''}`, 'data-group': key });
    const headBtn = el(
      'button',
      {
        class: 'group-label',
        title: closed ? tr('Mở nhóm') : tr('Thu gọn nhóm'),
        onclick: () => {
          const i = settings.closedGroups.indexOf(key);
          if (i >= 0) settings.closedGroups.splice(i, 1);
          else settings.closedGroups.push(key);
          persist();
          const shut = i < 0;
          block.classList.toggle('closed', shut);
          body.classList.toggle('shut', shut);
          headBtn.title = shut ? tr('Mở nhóm') : tr('Thu gọn nhóm');
        },
      },
      lead,
      `${label} (${defs.length})`,
    );
    // ô tick nằm cạnh tiêu đề (không lồng trong nút — trình duyệt không cho bấm phần tử lồng trong <button>)
    block.append(extra ? el('div', { class: 'group-head' }, headBtn, extra) : headBtn, body);
    for (const d of defs) inner.append(row(d, key === '__pinned'));
    list.append(block);
  };

  /** Ô tick "Hiện ẩn" cạnh nhóm Đã ghim (người dùng 2026-09-29): hiện cả công trình không chọn / xây được. */
  const hiddenToggle = (): HTMLElement => {
    const box = el('input', { type: 'checkbox' });
    box.checked = !!settings.showHidden;
    box.addEventListener('change', () => {
      settings.showHidden = box.checked;
      persist();
      render();
    });
    const wrap = el(
      'label',
      {
        class: 'show-hidden',
        title: inModeler()
          ? tr('Hiện cả những máy không đặt được lên sơ đồ Modeler (mờ) và công trình không xây được')
          : tr('Hiện cả những công trình không được chọn hay xây dựng'),
      },
      box,
      tr('Hiện ẩn'),
    );
    // bấm ô tick không đóng / mở nhóm
    wrap.addEventListener('click', (e) => e.stopPropagation());
    return wrap;
  };
  /** Công trình ẩn: chỉ để xem, bấm vào chỉ báo lý do. */
  const hiddenRow = (def: MachineDef): HTMLElement => {
    const thumb = el('img', { class: 'thumb', src: `img/items/${def.icon}.png`, alt: '', loading: 'lazy' });
    thumb.addEventListener('error', () => thumb.remove());
    return el(
      'button',
      {
        class: 'machine hidden-machine',
        title: tr('{0}{1} (không chọn / xây được)', def.name, otherName(def) ? ` — ${otherName(def)}` : ''),
        onclick: () => state.notify(tr('{0}: không chọn hay xây được ở đây', def.name)),
      },
      thumb,
      el('span', { class: 'machine-name' }, def.name),
      el('span', { class: 'machine-meta' }, machineMeta(def)),
      footprintGrid(def.size.w, def.size.d),
    );
  };

  const render = (): void => {
    const keep = list.scrollTop;
    app?.classList.toggle('palette-collapsed', settings.collapsed);
    clear(head);
    clear(list);
    // dựng lại xong thì giữ nguyên vị trí cuộn và cập nhật thanh cuộn
    queueMicrotask(() => {
      list.scrollTop = keep;
      updateRail();
    });

    if (settings.collapsed) {
      search.hidden = true;
      head.append(
        chevronBtn(tr('Mở rộng bảng chọn máy  (F1)'), CHEVRON_RIGHT, () => setCollapsed(false)),
      );
      const pinned = settings.pinned.map((id) => byId.get(id)).filter((d): d is MachineDef => !!d && !hiddenHere(d));
      // chỉ bản vẽ module (người dùng 2026-10-03) — chỉ dùng được bên Map
      const bps = inModeler() ? [] : pinnedBlueprints().filter((b) => b.kind === 'module');
      if (pinned.length === 0 && bps.length === 0) list.append(el('div', { class: 'mini-hint' }, tr('Ghim máy để hiện ở đây')));
      for (const def of pinned) {
        const active = activeIn(def);
        const icon = el('img', { src: `img/items/${def.icon}.png`, alt: def.name });
        // điện thoại không có bàn phím ⇒ thanh thu gọn bỏ số phím tắt (người dùng 2026-10-06)
        const hk = touch ? null : hotkeyOf(def.id);
        const mini = el(
          'button',
          {
            class: `mini-machine${active ? ' active' : ''}${offClass(def)}`,
            title: hk ? tr('{0} — phím {1}', def.name, hk) : def.name,
            onclick: () => clickPick(def),
          },
          icon,
          hk ? el('span', { class: 'hotkey' }, hk) : null,
        );
        machineDrag(mini, def);
        list.append(mini);
      }
      // bản vẽ ghim từ cửa sổ Bản vẽ (người dùng 2026-10-02) — sau các máy ghim, cách một vạch
      if (bps.length > 0) list.append(el('div', { class: 'mini-sep' }));
      for (const b of bps) list.append(blueprintMini(b));
      return;
    }

    search.hidden = false;
    head.append(
      // Thư viện công thức (người dùng 2026-10-06): điện thoại ⇒ sát góc trái trên của bảng, chữ "AIC Builder" ở giữa nút
      // này và nút thu gọn; máy tính ⇒ nút nằm ở thanh tab cạnh Cài đặt (`main.ts`) — người dùng 2026-10-07
      ...(touch ? [recipesButton()] : []),
      el('span', { class: 'brand' }, 'AIC Builder'),
      chevronBtn(tr('Thu gọn bảng chọn máy  (F1)'), CHEVRON_LEFT, () => setCollapsed(true)),
    );

    const q = fold(search.value.trim());
    // Valley IV: không tự đặt tổng tuyến kho hàng (dải kho tổng đặt sẵn) ⇒ ẩn khỏi bảng chọn
    const valley = !inModeler() && isValley(state.bp.base?.region);
    const match = (d: MachineDef): boolean =>
      !(valley && roleOf(d) === 'bus') && !hiddenHere(d) && (!q || fold(`${d.name} ${d.nameVi ?? ''} ${d.nameEn ?? ''} ${d.id}`).includes(q));

    const pinned = settings.pinned.map((id) => byId.get(id)).filter((d): d is MachineDef => !!d && match(d));
    // nhóm Đã ghim luôn có tiêu đề (chứa ô "Hiện ẩn"), kể cả khi chưa ghim gì
    groupBlock('__pinned', tr('Đã ghim'), pinned, q !== '', touch ? PIN_URL : undefined, hiddenToggle());

    // nhóm như thanh chọn nhanh của game / EnKAD
    const groups = new Map<Category, MachineDef[]>(CATEGORY_ORDER.map((c) => [c, [] as MachineDef[]]));
    for (const def of byId.values()) {
      const cat = categoryOf(def);
      if (cat && match(def)) groups.get(cat)!.push(def);
    }
    let any = pinned.length > 0;
    const shown = new Set<string>();
    for (const [cat, defs] of groups) {
      if (defs.length === 0) continue;
      any = true;
      for (const d of defs) shown.add(d.id);
      groupBlock(cat, cat, defs, q !== '', CATEGORY_ICON[cat]);
    }
    if (settings.showHidden) {
      // mọi công trình không nằm trong nhóm nào (loại không xây được, ẩn trong game, tổng tuyến ở Valley…)
      const hidden = [...state.ds.machines.values()]
        .filter((d) => !shown.has(d.id) && (!q || fold(`${d.name} ${d.nameVi ?? ''} ${d.nameEn ?? ''} ${d.id}`).includes(q)))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (hidden.length > 0) {
        any = true;
        groupBlock('__hidden', tr('Ẩn — không xây được'), hidden, q !== '', undefined, undefined, hiddenRow);
      }
    }
    if (!any) list.append(el('div', { class: 'empty' }, tr('Không có máy nào khớp')));
  };

  search.addEventListener('input', render);
  // F1 (main.ts) đóng / mở bảng chọn máy
  window.addEventListener('efp:toggle-palette', () => setCollapsed(!settings.collapsed));
  render();
  /**
   * Tối ưu (người dùng 2026-10-05: "chọn vùng nhiều máy thì webapp bị lag"): `main.ts` gọi hàm này sau **mọi** lần chọn /
   * đổi công cụ / sửa map, và trước đây lần nào cũng dựng lại cả bảng (~1 400 phần tử, ~27 ms ở Chromium, chậm hơn nhiều ở
   * Firefox). Giờ chỉ dựng lại khi thứ bảng hiển thị thật sự đổi: chế độ Map / Modeler, máy đang cầm (tô sáng), căn cứ
   * Valley (ẩn tổng tuyến). Đổi ghim / tìm kiếm / thu gọn / thư viện vẫn gọi `render` trực tiếp như cũ.
   */
  let lastKey = '';
  // Modeler vừa cầm / đặt / huỷ máy chọn từ bảng ⇒ vẽ lại để tô sáng đúng máy
  window.addEventListener(MODELER_HOLD_EVENT, () => {
    lastKey = '';
    render();
  });
  const keyOf = (): string =>
    [inModeler(), modelerHolding() ?? '', state.tool.kind === 'place' ? `${state.tool.mode ?? 'new'}:${state.tool.machineId}` : '', state.bp.base?.region ?? '', settings.collapsed, settings.showHidden, settings.pinned.join(',')].join('|');
  return () => {
    const k = keyOf();
    if (k === lastKey) return;
    lastKey = k;
    render();
  };
}
