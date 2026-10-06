import {
  exportLibrary,
  importFile,
  loadLibrary,
  moduleFromSelection,
  newId,
  piecesSize,
  saveLibrary,
  savedSize,
  loadBlueprintPins,
  setBlueprintPinned,
  type SavedBlueprint,
} from '../blueprint/library';
import { selectionSize } from '../editor/group';
import type { AppState } from '../editor/state';
import { enterTool, startStamp } from '../editor/tools';
import type { Renderer } from '../render/renderer';
import { clear, el } from './dom';
import { isOldPreview, piecesBlueprint, renderPreview } from './preview';
import { toast } from './toast';
import { BASE_LOCATIONS, CUSTOM_MAX, CUSTOM_MIN, createBase, type BasePreset } from '../blueprint/base';
import { EFBP_SERVERS, enkadToPieces, extractCode, fetchBlueprintCode } from '../blueprint/enkad';
import { PUBLIC_BUILD } from '../buildFlags';
import type { BaseRegion } from '../model/types';
import { OPEN_MODELER_EVENT, announceDoc } from '../editor/tabs';
import type { ModelerDoc } from '../modeler/doc';
import { modelerPreview } from '../modeler/preview';
import { tr } from '../i18n';
import { autoFocus, isNativeApp, isTouchUI, nativePlugin } from '../platform';
import { closeItemPicker, openItemPicker } from './itemPicker';

/** Bỏ dấu tiếng Việt để tìm icon theo tên gõ không dấu. */
const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Xuất file. Bản web: liên kết `<a download>`. **App desktop (Tauri)**: WebView2 bỏ qua kiểu tải xuống đó (người dùng
 * 2026-10-04: bấm Xuất trong exe không ra file) ⇒ gọi lệnh Rust `save_text` — hộp thoại "Lưu file" của Windows.
 */
async function download(name: string, text: string): Promise<void> {
  // tên bản vẽ có thể chứa ký tự Windows không cho dùng trong tên file
  const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'ban-ve.efp.json';
  if ('__TAURI_INTERNALS__' in window) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await invoke<string | null>('save_text', { name: safe, text });
      if (path) toast(tr('Đã lưu file: {0}', path), 'info');
    } catch (err) {
      toast(tr('Không xuất được file: {0}', String(err)));
    }
    return;
  }
  // app Android (người dùng 2026-10-05): WebView cũng không tải xuống kiểu <a download> ⇒ hộp "Lưu thành…" của
  // Android (plugin `SaveFile` trong `android/…/SaveFilePlugin.java`)
  const saver = nativePlugin<{ save(o: { name: string; text: string; mime: string }): Promise<{ saved: boolean }> }>('SaveFile');
  if (saver) {
    try {
      const r = await saver.save({ name: safe, text, mime: 'application/json' });
      if (r.saved) toast(tr('Đã lưu file: {0}', safe), 'info');
    } catch (err) {
      toast(tr('Không xuất được file: {0}', String(err)));
    }
    return;
  }
  const blob = new Blob([text], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: safe });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Dùng một bản vẽ đã lưu (nút Đặt / Mở của cửa sổ Bản vẽ, bản vẽ ghim trên thanh đặt máy thu gọn): sơ đồ Modeler
 * ⇒ tab Modeler mới; bản toàn map ⇒ hỏi lại rồi thay map đang mở; module ⇒ cầm bản vẽ theo con trỏ để đặt.
 * `ask` = hộp hỏi lại; `before` chạy ngay trước khi làm (vd. đóng cửa sổ Bản vẽ).
 */
export async function useBlueprint(
  state: AppState,
  renderer: Renderer,
  b: SavedBlueprint,
  ask: (text: string, ok: string) => Promise<boolean>,
  before: () => void = () => undefined,
): Promise<void> {
  if (b.kind === 'modeler' && b.modeler) {
    // sơ đồ Modeler: mở thành một tab Modeler mới (không đụng tới tab đang mở)
    before();
    window.dispatchEvent(new CustomEvent(OPEN_MODELER_EVENT, { detail: { title: b.name, doc: clone(b.modeler) } }));
    return;
  }
  if (b.kind === 'map' && b.map) {
    const ok = await ask(tr('Map hiện tại của bạn chưa lưu, bạn có chắc chắn? Đặt "{0}" sẽ thay toàn bộ map đang mở.', b.name), tr('Thay map'));
    if (!ok) return;
    before();
    enterTool(state, renderer, { kind: 'select' });
    state.load(clone(b.map.blueprint), clone(b.map.terrain), tr('Đã mở bản vẽ "{0}"', b.name));
    // tab đang mở mang tên bản vẽ, nội dung = bản trong thư viện (không còn "chưa lưu")
    announceDoc({ title: b.name, saved: true });
    renderer.fit();
    state.emit('view');
    return;
  }
  if (!b.module) return;
  before();
  startStamp(state, renderer, { ...b, module: clone(b.module) });
}

/**
 * Ba tab (người dùng 2026-09-29): **Base** = tạo map mới theo cấu hình căn cứ (như EnKAD "Create
 * new"), **Blueprint** = bản vẽ module (nhóm) + nhập mã bản vẽ, **Map** = bản vẽ toàn map.
 */
export type LibraryTab = 'base' | 'blueprint' | 'map' | 'modeler';
let lastTab: LibraryTab = 'map';

export interface LibraryOptions {
  /**
   * Mở cửa sổ kèm luôn hộp lưu: `module` = lưu nhóm đang chọn, `map` = lưu cả map.
   */
  save?: 'module' | 'map' | 'modeler';
  /** Đang ở tab Modeler: sơ đồ đang mở (tab "Modeler" của thư viện lưu được nó — Modeler đợt 4). */
  modeler?: { doc: ModelerDoc; title: string };
  /** File `.efp.json` vừa kéo thả vào app (người dùng 2026-10-02) ⇒ mở cửa sổ rồi nhập như nút "Nhập file". */
  files?: File[];
}

/** Bản vẽ sắp thêm vào thư viện — nội dung của cửa sổ thêm bản vẽ. */
export interface AddSpec {
  kind: SavedBlueprint['kind'];
  entry: Pick<SavedBlueprint, 'map' | 'module' | 'modeler'>;
  preview: string;
  name: string;
  icon: string | null;
  /** Lưu map / sơ đồ đang mở ⇒ tab đang mở mang tên bản vẽ, hết dấu "chưa lưu". */
  announce: boolean;
}

/** Tab của thư viện chứa một loại bản vẽ. */
const tabOf = (kind: SavedBlueprint['kind']): LibraryTab => (kind === 'module' ? 'blueprint' : kind);

/** Người dùng bật "giảm chuyển động" ⇒ animation gần như tức thì. */
const ms = (v: number): number => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1 : v);
const wait = (t: number): Promise<void> => new Promise((r) => setTimeout(r, t));
/** Chờ animation xong — có hạn chót, phòng khi trình duyệt dừng vẽ (tab bị ẩn) và `finished` không bao giờ tới. */
const done = (a: Animation | null, t: number): Promise<unknown> => (a ? Promise.race([a.finished.catch(() => undefined), wait(t + 150)]) : Promise.resolve());

const PANEL_W = 380;
const PANEL_GAP = 12;
/**
 * Bố cục khi cửa sổ thêm bản vẽ mở: cửa sổ Bản vẽ (bề rộng tự nhiên `natW`, đang giữa màn hình) hẹp lại nếu cần
 * và dịch sang trái `shift` px để cả cặp [Bản vẽ | khe | cửa sổ thêm] nằm giữa màn hình rộng `screenW`.
 */
export function addPanelLayout(screenW: number, natW: number): { libW: number; shift: number; panelW: number; panelLeft: number } {
  const panelW = Math.min(PANEL_W, screenW * 0.42);
  const libW = Math.max(0, Math.min(natW, screenW - panelW - PANEL_GAP - 32));
  const left = (screenW - (libW + PANEL_GAP + panelW)) / 2;
  // overlay căn giữa ⇒ khi đổi bề rộng, mép trái tự nằm ở (màn hình − bề rộng) / 2; dịch thêm cho đúng `left`
  return { libW, shift: left - (screenW - libW) / 2, panelW, panelLeft: left + libW + PANEL_GAP };
}

/**
 * Bản vẽ `old` sau khi được cập nhật thành bản vẽ mới `next` (bấm vào khung khi cửa sổ thêm bản vẽ đang mở — người
 * dùng 2026-10-02 đợt 2): giữ id (còn ghim), ngày tạo; nội dung + ảnh lấy bản mới; tên trống ⇒ giữ tên cũ; chưa
 * chọn biểu tượng ⇒ giữ biểu tượng cũ.
 */
export function replacedBlueprint(old: SavedBlueprint, next: Pick<AddSpec, 'entry' | 'preview' | 'name' | 'icon'>): SavedBlueprint {
  return {
    id: old.id,
    name: next.name.trim() || old.name,
    icon: next.icon ?? old.icon,
    kind: old.kind,
    created: old.created,
    preview: next.preview,
    ...next.entry,
  };
}

/** Hình tờ bản vẽ — nút chọn biểu tượng khi bản vẽ chưa có biểu tượng (cửa sổ thêm / sửa trên điện thoại). */
const BLUEPRINT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3.5h10l4 4v13H5z" fill="currentColor" fill-opacity="0.12"/><path d="M15 3.5v4h4"/><path d="M8 11h8M8 14.5h8M8 18h5M11 9v10"/></svg>';

const PIN_SVG =
  '<svg viewBox="0 0 24 24"><path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" fill="currentColor"/></svg>';

/** Chỉ nhận file có đuôi `.json` (gồm `.efp.json`). */
export const jsonFiles = (list: FileList | null | undefined): File[] => [...(list ?? [])].filter((f) => /\.json$/i.test(f.name));

/**
 * Cửa sổ **Bản vẽ**: thư viện các bản vẽ đã lưu.
 *
 * - Đầu cửa sổ: Nhập, Xuất, Đóng.
 * - Bảng lớn: ô "+" viền nét đứt (lưu cả map hiện tại thành bản vẽ mới), rồi các bản vẽ
 *   đã lưu — mỗi bản có ảnh xem trước, biểu tượng và tên.
 * - Chọn một bản ⇒ hiện Xoá và Đặt. Đặt module ⇒ đóng cửa sổ, preview theo con trỏ; đặt
 *   bản toàn map ⇒ hỏi lại vì map hiện tại sẽ bị thay.
 */
export function openLibrary(state: AppState, renderer: Renderer, opts: LibraryOptions = {}): void {
  if (document.querySelector('.bp-overlay')) return;
  let list = loadLibrary();
  let selectedId: string | null = null;
  // tab đang xem: mở kèm hộp lưu thì theo loại lưu; không thì tab xem lần trước
  // đang ở tab Modeler ⇒ mở thẳng tab "Modeler" của thư viện
  let tab: LibraryTab =
    opts.save === 'module' ? 'blueprint' : opts.save === 'map' ? 'map' : opts.save === 'modeler' || opts.modeler ? 'modeler' : lastTab;
  if (tab === 'modeler' && !opts.modeler && opts.save === 'modeler') tab = lastTab;
  lastTab = tab;

  const overlay = el('div', { class: 'bp-overlay' });
  const win = el('div', { class: 'bp-window', role: 'dialog' });
  const grid = el('div', { class: 'bp-grid' });
  const actions = el('div', { class: 'bp-actions' });
  overlay.append(win);
  document.body.append(overlay);
  document.body.classList.add('modal-open');

  // app Android: trình chọn file của Android lọc theo kiểu MIME, file .efp.json nhiều khi bị coi là "octet-stream" ⇒ mở
  // rộng bộ lọc để file vẫn chọn được (người dùng 2026-10-05)
  const file = el('input', { type: 'file', accept: isNativeApp() ? '.json,application/json,text/plain,application/octet-stream' : '.json', style: 'display:none' });
  file.addEventListener('change', () => {
    const files = jsonFiles(file.files);
    file.value = '';
    void ingestFiles(files, false);
  });

  /**
   * Nhập file `.efp.json` (nút "Nhập file", kéo thả vào app / cửa sổ — người dùng 2026-10-02). File chỉ có **một**
   * bản vẽ ⇒ mở cửa sổ thêm bản vẽ (sửa tên / biểu tượng trước khi lưu); nhiều bản vẽ, hoặc thả thẳng vào ô "+"
   * (`direct`) ⇒ thêm ngay với animation mọc ra từ ô "+".
   */
  const ingestFiles = async (files: File[], direct: boolean): Promise<void> => {
    if (busy) return;
    const got: SavedBlueprint[] = [];
    for (const f of files) {
      try {
        got.push(...importFile(await f.text(), f.name));
      } catch (err) {
        toast(tr('Không đọc được file: {0}', (err as Error).message));
      }
    }
    if (got.length === 0) return;
    // ảnh xem trước kiểu cũ (nền tối / sáng in cứng) hoặc chưa có ⇒ vẽ lại nền trong suốt
    for (const b of got) if (isOldPreview(b.preview)) b.preview = previewOf(b) ?? b.preview;
    if (got.length === 1 && !direct) {
      const b = got[0]!;
      openAddPanel({ kind: b.kind, entry: { map: b.map, module: b.module, modeler: b.modeler }, preview: b.preview, name: b.name, icon: b.icon, announce: false });
      return;
    }
    // cửa sổ thêm đang mở dở thì đóng đi trước
    panel?.cancel();
    await insertAnimated(got);
    toast(tr('Đã nhập {0} bản vẽ', got.length), 'info');
  };

  // kéo thả file vào cửa sổ Bản vẽ: thả lên ô "+" ⇒ thêm ngay; thả chỗ khác ⇒ như "Nhập file"
  overlay.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    quickTarget(true, !!(e.target as HTMLElement).closest('.bp-card.add.quick'));
    win.classList.add('file-over');
  });
  overlay.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && overlay.contains(e.relatedTarget as Node)) return;
    win.classList.remove('file-over');
    quickTarget(false, false);
  });
  /**
   * Đang giữ file `.efp.json` **ở bất cứ đâu trong cửa sổ Bản vẽ** (`glow`, người dùng 2026-10-02 đợt 2 — trước đó
   * chỉ khi ở ngay trên ô "+"): ô "+" sáng xanh. Con trỏ ở ngay trên ô "+" (`over`) ⇒ chữ đổi thành "Thêm nhanh" —
   * thả ở đây là thêm ngay, không qua cửa sổ thêm bản vẽ; thả chỗ khác vẫn như "Nhập file". Rời ô ⇒ trả lại chữ cũ.
   */
  const quickTarget = (glow: boolean, over: boolean): void => {
    const plus = grid.querySelector<HTMLElement>('.bp-card.add.quick');
    const text = plus?.querySelector<HTMLElement>('.bp-add-text');
    if (!plus || !text) return;
    plus.classList.toggle('drop-target', glow);
    if (over === plus.classList.contains('drop-over')) return;
    plus.classList.toggle('drop-over', over);
    if (over) {
      text.dataset.text = text.textContent ?? '';
      text.textContent = tr('Thêm nhanh');
    } else if (text.dataset.text !== undefined) text.textContent = text.dataset.text;
  };
  overlay.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    win.classList.remove('file-over');
    quickTarget(false, false);
    const files = jsonFiles(e.dataTransfer.files);
    if (files.length === 0) {
      toast(tr('Chỉ nhận file bản vẽ .efp.json'));
      return;
    }
    const onPlus = !!(e.target as HTMLElement).closest('.bp-card.add.quick');
    void ingestFiles(files, onPlus);
  });

  /** Vẽ (lại) ảnh xem trước của một bản vẽ từ chính dữ liệu của nó — nền trong suốt, hợp cả hai giao diện. */
  const previewOf = (b: SavedBlueprint): string | null => {
    if (b.map) return renderPreview(renderer, state.ds, b.map.blueprint, b.map.terrain);
    if (b.module) return renderPreview(renderer, state.ds, piecesBlueprint(b.module, piecesSize(state.ds, b.module)), {});
    if (b.modeler) return modelerPreview(b.modeler);
    return null;
  };
  /**
   * Bản vẽ lưu trước 2026-10-02 có ảnh xem trước JPEG in cứng màu nền của giao diện lúc lưu ⇒ khi mở cửa sổ, vẽ lại
   * từng ảnh (mỗi ảnh một nhịp để cửa sổ không bị đứng), thay ngay trên khung đang hiện, xong thì lưu thư viện một lần.
   */
  const upgradePreviews = async (): Promise<void> => {
    const old = list.filter((b) => isOldPreview(b.preview));
    if (old.length === 0) return;
    for (const b of old) {
      await wait(0);
      if (!overlay.isConnected) return;
      const url = previewOf(b);
      if (!url) continue;
      b.preview = url;
      const img = grid.querySelector<HTMLImageElement>(`.bp-card[data-id="${CSS.escape(b.id)}"] .bp-thumb`);
      if (img instanceof HTMLImageElement) img.src = url;
    }
    if (!busy) persist();
  };

  const persist = (): boolean => {
    try {
      saveLibrary(list);
      return true;
    } catch (err) {
      toast((err as Error).message);
      return false;
    }
  };

  const close = (): void => {
    window.removeEventListener('keydown', onKey, true);
    panel = null;
    overlay.remove();
    document.body.classList.remove('modal-open');
    state.emit('ui');
  };

  /** Esc đóng hộp con trước, rồi mới đóng cửa sổ. Chặn luôn để Esc không lọt xuống bản vẽ. */
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    const top = overlay.querySelector('.bp-dialog-wrap:last-of-type');
    if (top) top.remove();
    else if (panel) panel.cancel();
    else if (!busy) close();
  };
  window.addEventListener('keydown', onKey, true);

  // ------------------------------------------------------------- hộp xác nhận
  const confirmBox = (text: string, ok: string): Promise<boolean> =>
    new Promise((resolve) => {
      const wrap = el('div', { class: 'bp-dialog-wrap' });
      const done = (v: boolean): void => {
        wrap.remove();
        resolve(v);
      };
      wrap.append(
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
      win.append(wrap);
    });

  // ------------------------------------------------------------- cửa sổ thêm bản vẽ
  /**
   * **Cửa sổ thêm bản vẽ** (người dùng 2026-10-02) — thay hộp lưu cũ nằm giữa cửa sổ Bản vẽ. Trượt từ mép phải màn
   * hình vào, đứng sát bên phải cửa sổ Bản vẽ (cửa sổ Bản vẽ dịch sang trái / hẹp lại cho vừa). Có ảnh xem trước,
   * tên bản vẽ (bắt buộc, dấu * đỏ) và biểu tượng. Huỷ ⇒ trượt sang phải ra khỏi màn hình. Lưu ⇒ trượt vào cửa sổ
   * Bản vẽ và mờ đi, rồi bản vẽ mới mọc ra từ ô "+" (`insertAnimated`).
   * Khi cửa sổ thêm đang mở, **bấm chuột trái vào một bản vẽ cùng loại** trong cửa sổ Bản vẽ ⇒ hỏi lại rồi cập nhật
   * (ghi đè) bản vẽ đó thành bản vẽ mới (`replace`, người dùng 2026-10-02 đợt 2).
   */
  let panel: {
    el: HTMLElement;
    kind: SavedBlueprint['kind'];
    /** `add` = bản vẽ mới chờ lưu; `edit` = sửa tên / biểu tượng bản vẽ đang chọn (`editId`). */
    mode: 'add' | 'edit';
    editId?: string;
    cancel(): void;
    replace(old: SavedBlueprint): void;
  } | null = null;
  /** Đang chạy animation thêm bản vẽ — chưa cho mở cửa sổ thêm khác. */
  let busy = false;

  /** Cửa sổ Bản vẽ dịch / hẹp lại chừa chỗ cho cửa sổ thêm (`open`), hoặc trở về giữa màn hình. */
  const shiftWindow = (open: boolean): { left: number; top: number; height: number } => {
    // đo cỡ "tự nhiên" của cửa sổ (đang giữa màn hình, chưa dịch) — kể cả khi nó còn đang trượt dở
    const cs = getComputedStyle(win);
    const nowW = cs.width;
    const nowT = cs.transform;
    win.style.transition = 'none';
    win.style.width = '';
    win.style.transform = '';
    const natW = win.offsetWidth;
    const natTop = (window.innerHeight - win.offsetHeight) / 2;
    const natH = win.offsetHeight;
    // trở lại đúng chỗ đang đứng rồi mới chuyển động tới đích
    win.style.width = nowW;
    win.style.transform = nowT === 'none' ? '' : nowT;
    void win.offsetWidth;
    win.style.transition = `width ${ms(300)}ms ease, transform ${ms(300)}ms ease`;
    if (!open) {
      win.style.width = `${natW}px`;
      win.style.transform = 'translateX(0px)';
      // xong thì trả lại cho CSS (cửa sổ co giãn theo màn hình như cũ)
      setTimeout(() => {
        if (panel) return;
        win.style.transition = 'none';
        win.style.width = '';
        win.style.transform = '';
      }, ms(320));
      return { left: 0, top: 0, height: 0 };
    }
    const lay = addPanelLayout(window.innerWidth, natW);
    win.style.width = `${lay.libW}px`;
    win.style.transform = `translateX(${lay.shift}px)`;
    return { left: lay.panelLeft, top: natTop, height: natH };
  };

  /**
   * Mở cửa sổ thêm bản vẽ cho `spec`; bấm Lưu ⇒ thêm vào thư viện.
   * `edit` (người dùng 2026-10-03): bấm chuột trái một bản vẽ trong cửa sổ Bản vẽ ⇒ cùng cửa sổ này hiện ra để sửa
   * tên / biểu tượng của bản đó; hai nút thành **Xoá / Cập nhật**, Cập nhật mờ đi khi chưa đổi tên hay biểu tượng.
   * Đang mở sẵn một cửa sổ sửa ⇒ đổi nội dung tại chỗ, không chạy lại animation trượt vào.
   */
  const openAddPanel = (spec: AddSpec, edit?: SavedBlueprint): void => {
    if (busy) return;
    const swap = !!edit && panel?.mode === 'edit';
    panel?.el.remove();
    panel = null;
    // xem đúng tab của loại bản vẽ sắp thêm (ô "+" của tab đó là chỗ bản vẽ mới mọc ra)
    if (tab !== tabOf(spec.kind)) {
      tab = tabOf(spec.kind);
      lastTab = tab;
      selectedId = null;
    }
    let icon = spec.icon;
    const name = el('input', { class: 'bp-name', type: 'text', placeholder: tr('Tên bản vẽ (bắt buộc)'), value: spec.name });
    const search = el('input', { class: 'bp-search', type: 'search', placeholder: tr('Tìm biểu tượng…') });
    const icons = el('div', { class: 'bp-icons' });
    const items = [...state.ds.items.values()].sort((a, b) => a.name.localeCompare(b.name));
    const drawIcons = (): void => {
      clear(icons);
      const q = fold(search.value.trim());
      for (const it of items) {
        if (q && !fold(it.name).includes(q) && !it.id.includes(q)) continue;
        icons.append(
          el(
            'button',
            {
              class: `bp-icon${icon === it.id ? ' active' : ''}`,
              title: it.name,
              onclick: () => {
                icon = icon === it.id ? null : it.id;
                drawIcons();
                syncUpdate();
              },
            },
            el('img', { src: `img/itemicon/${it.icon}.png`, alt: '', loading: 'lazy' }),
          ),
        );
      }
    };
    search.addEventListener('input', drawIcons);
    // điện thoại (người dùng 2026-10-05): cửa sổ dẹt — chỉ ảnh map + ô tên; biểu tượng chọn bằng nút hình bản vẽ đứng
    // trước ô tên, bấm ⇒ bảng icon vật phẩm (như chọn vật phẩm trong cửa sổ máy)
    const touch = isTouchUI();
    const iconBtn = el('button', { class: 'bp-icon-pick', type: 'button', title: tr('Biểu tượng') });
    const drawIconBtn = (): void => {
      const it = icon ? state.ds.items.get(icon) : undefined;
      iconBtn.classList.toggle('set', !!it);
      if (it) iconBtn.replaceChildren(el('img', { src: `img/itemicon/${it.icon}.png`, alt: '' }));
      else iconBtn.innerHTML = BLUEPRINT_SVG;
    };
    iconBtn.addEventListener('click', () =>
      openItemPicker(
        iconBtn,
        state,
        items.map((it) => it.id),
        icon,
        (id) => {
          icon = id;
          drawIconBtn();
          syncUpdate();
        },
        { allowNone: true, title: tr('Biểu tượng') },
      ),
    );
    if (touch) drawIconBtn();
    else drawIcons();

    const title = edit
      ? tr('Chỉnh sửa bản vẽ')
      : spec.kind === 'map'
        ? tr('Lưu toàn bộ map thành bản vẽ')
        : spec.kind === 'modeler'
          ? tr('Lưu sơ đồ Modeler')
          : tr('Lưu nhóm đang chọn thành bản vẽ');
    // cửa sổ sửa: Cập nhật chỉ bấm được khi tên (không trống) hoặc biểu tượng đã khác bản đang lưu
    const updateBtn = el('button', { class: 'tool primary', onclick: () => void update() }, tr('Cập nhật'));
    const syncUpdate = (): void => {
      if (!edit) return;
      const n = name.value.trim();
      updateBtn.toggleAttribute('disabled', !n || (n === edit.name && icon === edit.icon));
    };
    const box = el(
      'div',
      { class: `bp-add-panel ${spec.kind}`, role: 'dialog' },
      el('div', { class: 'bp-dialog-title bp-add-title' }, el('span', {}, title), el('button', { class: 'bp-close', title: tr('Huỷ (Esc)'), onclick: () => cancel() }, '×')),
      touch
        ? el(
            'div',
            { class: 'bp-add-body compact' },
            el('img', { class: 'bp-preview-big', src: spec.preview, alt: tr('Ảnh xem trước') }),
            el('div', { class: 'bp-name-row' }, iconBtn, name),
          )
        : el(
        'div',
        { class: 'bp-add-body' },
        el('img', { class: 'bp-preview-big', src: spec.preview, alt: tr('Ảnh xem trước') }),
        el('div', { class: 'bp-hint' }, spec.kind === 'map' ? tr('Loại: toàn map') : spec.kind === 'modeler' ? tr('Loại: sơ đồ Modeler') : tr('Loại: module (nhóm)')),
        el('label', { class: 'bp-label' }, tr('Tên bản vẽ'), el('span', { class: 'bp-required', title: tr('Bắt buộc') }, ' *')),
        name,
        el('div', { class: 'bp-label' }, tr('Biểu tượng')),
        search,
        icons,
        edit ? null : el('div', { class: 'bp-hint bp-replace-hint' }, tr('Hoặc bấm vào một bản vẽ có sẵn bên trái để cập nhật bản vẽ đó thành bản vẽ này.')),
      ),
      edit
        ? el(
            'div',
            { class: 'bp-dialog-buttons' },
            el('button', { class: 'tool danger', onclick: () => void erase() }, tr('Xoá')),
            updateBtn,
          )
        : el(
            'div',
            { class: 'bp-dialog-buttons' },
            el('button', { class: 'tool', onclick: () => cancel() }, tr('Huỷ')),
            el('button', { class: 'tool primary', onclick: () => void save() }, tr('Lưu')),
          ),
    );
    syncUpdate();
    name.addEventListener('input', syncUpdate);
    const at = shiftWindow(true);
    box.style.left = `${at.left}px`;
    box.style.top = `${at.top}px`;
    // điện thoại: cao theo nội dung (ảnh + tên + nút), không quá cửa sổ Bản vẽ
    if (touch) box.style.maxHeight = `${at.height}px`;
    else box.style.height = `${at.height}px`;
    box.style.width = `${addPanelLayout(window.innerWidth, 0).panelW}px`;
    overlay.append(box);
    // trượt từ mép phải màn hình vào (đổi sang bản vẽ khác khi đang sửa ⇒ hiện tại chỗ)
    if (!swap)
      box.animate([{ transform: `translateX(${window.innerWidth - at.left + 40}px)` }, { transform: 'none' }], {
        duration: ms(380),
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
    const me = {
      el: box,
      kind: spec.kind,
      mode: edit ? ('edit' as const) : ('add' as const),
      editId: edit?.id,
      cancel: (): void => cancel(),
      replace: (old: SavedBlueprint): void => void replace(old),
    };
    panel = me;
    // khung cùng loại bấm được để cập nhật (con trỏ, nhãn "Cập nhật" khi rê chuột) — chỉ khi đang thêm bản mới
    render();
    if (!edit) setTimeout(() => autoFocus(name, { preventScroll: true }), ms(380));

    /**
     * Đóng cửa sổ thêm: cửa sổ Bản vẽ về giữa, dựng lại lưới để bỏ trạng thái "bấm để cập nhật". `hide` = bản vẽ đã
     * lưu nhưng **chưa được hiện** (chờ animation mọc ra từ ô "+") — không có nó thì lưới hiện sẵn bản vẽ mới, các khung
     * nhảy luôn vào chỗ mới trước khi animation đẩy chạy (lỗi người dùng báo 2026-10-02).
     */
    const leave = (hide?: Set<string>): void => {
      if (panel === me) panel = null;
      closeItemPicker();
      shiftWindow(false);
      render(hide);
    };
    const cancel = (): void => {
      if (panel !== me) return;
      if (edit && selectedId === edit.id) selectedId = null; // đóng cửa sổ sửa = thôi chọn bản vẽ đó
      leave();
      const out = box.animate([{ transform: 'none' }, { transform: `translateX(${window.innerWidth - at.left + 40}px)` }], {
        duration: ms(300),
        easing: 'cubic-bezier(0.4, 0, 1, 1)',
        fill: 'forwards',
      });
      out.onfinish = () => box.remove();
    };
    const save = async (): Promise<void> => {
      if (panel !== me || busy) return;
      const n = name.value.trim();
      if (!n) {
        name.classList.add('bad');
        name.focus();
        toast(tr('Hãy điền tên bản vẽ'));
        return;
      }
      const saved: SavedBlueprint = { id: newId(), name: n, icon, kind: spec.kind, created: Date.now(), preview: spec.preview, ...spec.entry };
      // lưu thử trước: hết chỗ trong trình duyệt thì giữ nguyên cửa sổ thêm để người dùng còn xử lý
      if (!tryPersist([saved, ...list])) return;
      leave(new Set([saved.id]));
      // trượt vào cửa sổ Bản vẽ (về phía ô "+") và mờ đi
      const plus = grid.querySelector<HTMLElement>('.bp-card.add.quick');
      const pr = plus?.getBoundingClientRect();
      const br = box.getBoundingClientRect();
      const dx = pr ? pr.left + pr.width / 2 - (br.left + br.width / 2) : -br.width;
      const dy = pr ? pr.top + pr.height / 2 - (br.top + br.height / 2) : 0;
      const out = box.animate(
        [
          { transform: 'none', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0 },
        ],
        { duration: ms(300), easing: 'ease-in', fill: 'forwards' },
      );
      void done(out, ms(300)).then(() => box.remove()); // có hạn chót: tab bị ẩn thì `onfinish` không bao giờ tới
      await wait(ms(300)); // cửa sổ Bản vẽ về giữa xong mới đo vị trí ô "+"
      await insertAnimated([saved], true);
      toast(tr('Đã lưu bản vẽ "{0}"', n), 'info');
      if (spec.announce) announceDoc({ title: n, saved: true });
    };
    /**
     * Cập nhật bản vẽ `old` thành bản vẽ mới (người dùng 2026-10-02 đợt 2): hỏi lại trước (ghi đè, không hoàn tác).
     * Giữ id (⇒ còn ghim trên thanh đặt máy), vị trí trong thư viện, ngày tạo. Nội dung + ảnh xem trước lấy bản mới;
     * tên lấy ô Tên nếu đã điền, không thì giữ tên cũ; biểu tượng lấy cái đang chọn, chưa chọn thì giữ cái cũ.
     */
    const replace = async (old: SavedBlueprint): Promise<void> => {
      if (panel !== me || busy) return;
      if (old.kind !== spec.kind) {
        toast(tr('Chỉ cập nhật được bản vẽ cùng loại'));
        return;
      }
      if (overlay.querySelector('.bp-dialog-wrap')) return;
      const n = name.value.trim() || old.name;
      const ok = await confirmBox(
        n === old.name
          ? tr('Cập nhật bản vẽ "{0}" thành bản vẽ mới? Nội dung cũ sẽ bị ghi đè, không hoàn tác được.', old.name)
          : tr('Cập nhật bản vẽ "{0}" thành bản vẽ mới "{1}"? Nội dung cũ sẽ bị ghi đè, không hoàn tác được.', old.name, n),
        tr('Cập nhật'),
      );
      if (!ok || panel !== me || busy) return;
      const updated = replacedBlueprint(old, { ...spec, name: n, icon });
      if (!tryPersist(list.map((b) => (b.id === old.id ? updated : b)))) return;
      await flyInto(old.id);
      toast(tr('Đã cập nhật bản vẽ "{0}"', n), 'info');
      if (spec.announce) announceDoc({ title: n, saved: true });
    };
    /**
     * Cửa sổ thêm / sửa **bay vào** khung bản vẽ `id` rồi mờ đi; xong rồi cửa sổ Bản vẽ mới trở về giữa màn hình, khung
     * hiện nội dung mới kèm aura (người dùng 2026-10-03: trước đây cửa sổ Bản vẽ về chỗ cũ trước rồi cửa sổ thêm mới thu
     * lại — ngược thứ tự). `list` đã là danh sách mới; lưới đang hiện vẫn là nội dung cũ cho tới lúc bay xong.
     */
    const flyInto = async (id: string): Promise<void> => {
      busy = true;
      try {
        const target = (): HTMLElement | null => grid.querySelector<HTMLElement>(`.bp-card[data-id="${CSS.escape(id)}"]`);
        target()?.scrollIntoView({ block: 'nearest' });
        const tb = target()?.getBoundingClientRect();
        const br = box.getBoundingClientRect();
        const dx = tb ? tb.left + tb.width / 2 - (br.left + br.width / 2) : -br.width;
        const dy = tb ? tb.top + tb.height / 2 - (br.top + br.height / 2) : 0;
        await done(
          box.animate(
            [
              { transform: 'none', opacity: 1 },
              { transform: `translate(${dx}px, ${dy}px) scale(0.35)`, opacity: 0 },
            ],
            { duration: ms(300), easing: 'ease-in', fill: 'forwards' },
          ),
          ms(300),
        );
        box.remove();
        // rồi mới về giữa
        if (panel === me) panel = null;
        selectedId = id;
        fresh.clear();
        fresh.add(id);
        shiftWindow(false);
        render();
        const c = target();
        c?.scrollIntoView({ block: 'nearest' });
        c?.animate([{ transform: 'scale(0.9)' }, { transform: 'scale(1.04)' }, { transform: 'none' }], { duration: ms(320), easing: 'ease-out' });
        await wait(ms(320));
      } finally {
        busy = false;
      }
    };
    /** Cửa sổ sửa: lưu tên / biểu tượng mới của bản vẽ đang chọn. */
    const update = async (): Promise<void> => {
      if (!edit || panel !== me || busy || updateBtn.hasAttribute('disabled')) return;
      const n = name.value.trim();
      const updated: SavedBlueprint = { ...edit, name: n, icon };
      if (!tryPersist(list.map((b) => (b.id === edit.id ? updated : b)))) return;
      await flyInto(edit.id);
      toast(tr('Đã cập nhật bản vẽ "{0}"', n), 'info');
    };
    /** Cửa sổ sửa: xoá bản vẽ đang chọn (hỏi lại trước). */
    const erase = async (): Promise<void> => {
      if (!edit || panel !== me || busy) return;
      if (!(await confirmBox(tr('Xoá bản vẽ "{0}" khỏi thư viện? Không hoàn tác được.', edit.name), tr('Xoá')))) return;
      if (panel !== me) return;
      list = list.filter((x) => x.id !== edit.id);
      persist();
      if (loadBlueprintPins().includes(edit.id)) setBlueprintPinned(edit.id, false);
      selectedId = null;
      cancel();
    };
    name.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (edit) void update();
      else void save();
    });
  };

  /** Lưu thư viện `next`; được thì nhận luôn làm danh sách mới. */
  const tryPersist = (next: SavedBlueprint[]): boolean => {
    try {
      saveLibrary(next);
    } catch (err) {
      toast((err as Error).message);
      return false;
    }
    list = next;
    return true;
  };

  /**
   * Bản vẽ mới vào thư viện **có animation** (người dùng 2026-10-02):
   *  1. một khung mới phóng to dần 0.2s từ tâm ô "+" của tab; lớn trọn khung thì hiện thông tin bản vẽ;
   *  2. khung đó bị đẩy sang phải vào chỗ của nó, các khung khác bị đẩy theo kiểu domino (FLIP);
   *  3. khung mới được tô viền xanh (và đang được chọn).
   * `stored` = đã lưu vào thư viện rồi (cửa sổ thêm bản vẽ).
   */
  const insertAnimated = async (items: SavedBlueprint[], stored = false): Promise<void> => {
    if (items.length === 0) return;
    busy = true;
    try {
      if (!stored && !tryPersist([...items, ...list])) return;
      if (tab !== tabOf(items[0]!.kind)) {
        tab = tabOf(items[0]!.kind);
        lastTab = tab;
      }
      selectedId = null;
      fresh.clear();
      // dựng lại lưới khi chưa có bản vẽ mới (để đo chỗ cũ), cuộn về đầu cho thấy ô "+"
      const fresher = new Set(items.map((b) => b.id));
      render(fresher);
      grid.scrollTop = 0;
      const before = new Map<string, DOMRect>();
      for (const c of grid.querySelectorAll<HTMLElement>('.bp-card[data-id]:not([data-id=""])')) before.set(c.dataset.id!, c.getBoundingClientRect());
      const plus = grid.querySelector<HTMLElement>('.bp-card.add.quick');
      const pr = plus?.getBoundingClientRect() ?? grid.getBoundingClientRect();

      // 1. khung mới phóng to từ tâm ô "+"
      const ghost = card(items[0]!, true);
      ghost.classList.add('bp-ghost');
      Object.assign(ghost.style, { left: `${pr.left}px`, top: `${pr.top}px`, width: `${pr.width}px`, height: `${pr.height}px` });
      overlay.append(ghost);
      await done(ghost.animate([{ transform: 'scale(0)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: ms(200), easing: 'ease-out' }), ms(200));
      ghost.classList.add('filled'); // lớn trọn khung ⇒ hiện thông tin bản vẽ
      await wait(ms(180));

      // 2. dựng lại có bản vẽ mới, rồi từng khung trượt từ chỗ cũ tới chỗ mới (khung mới: từ ô "+")
      selectedId = items[0]!.id;
      render();
      ghost.remove();
      const cards = [...grid.querySelectorAll<HTMLElement>('.bp-card[data-id]:not([data-id=""])')];
      let order = 0;
      let last: Animation | null = null;
      for (const c of cards) {
        const id = c.dataset.id!;
        const from = fresher.has(id) ? pr : before.get(id);
        if (!from) continue;
        const now = c.getBoundingClientRect();
        const dx = from.left - now.left;
        const dy = from.top - now.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        if (now.top > grid.getBoundingClientRect().bottom + 200) continue; // ngoài tầm nhìn: khỏi chạy
        last = c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
          duration: ms(340),
          delay: fresher.has(id) ? 0 : ms(order++ * 35), // domino: khung sau bị đẩy chậm hơn một nhịp
          easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
          fill: 'backwards',
        });
      }
      await done(last, ms(340 + order * 35));

      // 3. viền xanh cho bản vẽ vừa thêm
      for (const id of fresher) fresh.add(id);
      for (const c of cards) if (fresher.has(c.dataset.id!)) c.classList.add('fresh');
    } finally {
      busy = false;
    }
  };

  /** Bản vẽ vừa thêm (viền xanh) — hết khi chọn bản khác / đổi tab. */
  const fresh = new Set<string>();

  /** Hộp lưu từ trạng thái hiện tại (Ctrl+S, ô "Lưu map hiện tại" / "Lưu sơ đồ hiện tại" / "Lưu nhóm đang chọn"). */
  const saveDialog = (kind: 'map' | 'module' | 'modeler'): void => {
    let entry: AddSpec['entry'];
    let preview: string;
    let name = '';
    if (kind === 'modeler') {
      if (!opts.modeler) {
        toast(tr('Mở một tab Modeler trước để lưu sơ đồ'));
        return;
      }
      entry = { modeler: clone({ ...opts.modeler.doc, view: undefined }) };
      preview = modelerPreview(opts.modeler.doc);
      // sơ đồ Modeler: gợi sẵn tên tab
      if (!/^Modeler \d+$/.test(opts.modeler.title)) name = opts.modeler.title;
    } else if (kind === 'module') {
      if (selectionSize(state.sel) === 0) {
        toast(tr('Chưa chọn gì để lưu'));
        return;
      }
      const module = moduleFromSelection(state.bp, state.ds, state.sel);
      entry = { module };
      preview = renderPreview(renderer, state.ds, piecesBlueprint(module, piecesSize(state.ds, module)), {});
    } else {
      entry = { map: { blueprint: clone(state.bp), terrain: clone(state.terrain) } };
      preview = renderPreview(renderer, state.ds, state.bp, state.terrain);
    }
    openAddPanel({ kind, entry, preview, name, icon: null, announce: kind === 'map' || kind === 'modeler' });
  };

  // ------------------------------------------------------------- đặt / xoá
  const place = (b: SavedBlueprint): Promise<void> => useBlueprint(state, renderer, b, confirmBox, close);



  // ------------------------------------------------------------- tab Base
  /** Tạo map mới theo cấu hình căn cứ — thay map đang mở nên hỏi lại trước. */
  const newBase = async (region: BaseRegion, preset: BasePreset, locationName: string): Promise<void> => {
    const label = `${locationName} · ${preset.label}`;
    const ok = await confirmBox(
      tr('Tạo căn cứ mới "{0}" ({1}×{2})? Map đang mở sẽ bị thay — hãy lưu ở tab Map trước nếu cần.', label, preset.w, preset.d),
      tr('Tạo map'),
    );
    if (!ok) return;
    close();
    enterTool(state, renderer, { kind: 'select' });
    state.load(createBase(region, preset, locationName), {}, tr('Đã tạo căn cứ "{0}"', label));
    announceDoc({ title: label });
    renderer.fit();
    state.emit('view');
  };

  const baseTab = (): HTMLElement => {
    const box = el('div', { class: 'base-tab' });
    const maxSide = Math.max(...BASE_LOCATIONS.flatMap((l) => l.presets.map((p) => Math.max(p.w, p.d))));
    const side = (n: number): string => `${(1.5 + (n / maxSide) * 2.5).toFixed(2)}rem`;
    const current = state.bp.base?.label;
    for (const loc of BASE_LOCATIONS) {
      const row = el('div', { class: 'base-presets' });
      for (const p of loc.presets) {
        const label = `${loc.name} · ${p.label}`;
        const edges = (p.edges ?? []).map((e) => `edge-${e}`).join(' ');
        row.append(
          el(
            'button',
            {
              class: `base-tile${current === label ? ' current' : ''}`,
              title: p.fixed?.length
                ? tr('{0} — dải kho tổng đặt sẵn ngoài vùng xây', label)
                : label,
              onclick: () => void newBase(loc.region, p, loc.name),
            },
            el('div', { class: `base-preview ${edges}`, style: `width:${side(p.w)};height:${side(p.d)}` }),
            el('div', { class: 'base-label' }, p.label),
            el('div', { class: 'base-size' }, `${p.w}×${p.d}`),
          ),
        );
      }
      box.append(el('div', { class: 'base-loc' }, el('h3', {}, loc.name), row));
    }
    // cỡ tuỳ chọn
    const w = el('input', { class: 'base-num', type: 'number', min: String(CUSTOM_MIN), max: String(CUSTOM_MAX), value: '50' });
    const d = el('input', { class: 'base-num', type: 'number', min: String(CUSTOM_MIN), max: String(CUSTOM_MAX), value: '50' });
    const clamp = (v: string): number => Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, Math.round(Number(v) || 50)));
    box.append(
      el(
        'div',
        { class: 'base-loc' },
        el('h3', {}, tr('Tuỳ chọn')),
        el(
          'div',
          { class: 'base-custom' },
          w,
          el('span', {}, '×'),
          d,
          el(
            'button',
            {
              class: 'tool primary',
              onclick: () => void newBase('custom', { label: tr('Tuỳ chọn'), w: clamp(w.value), d: clamp(d.value) }, tr('Tuỳ chọn')),
            },
            tr('Tạo'),
          ),
        ),
      ),
    );
    box.append(
      el(
        'div',
        { class: 'bp-hint' },
        tr('Valley IV không tự đặt tổng tuyến kho hàng; "Upgrade 2, depots" có dải kho tổng đặt sẵn ngoài vùng xây (viền vàng) — đặt Máy Nạp / Máy Dỡ Hàng Kho sát mép vùng xây để dùng. Wuling tự đặt tổng tuyến.'),
      ),
    );
    return box;
  };

  // ------------------------------------------------------------- nhập mã bản vẽ (EnKAD / game)
  const importCodeDialog = (): void => {
    const wrap = el('div', { class: 'bp-dialog-wrap' });
    let server: string = EFBP_SERVERS[0].id;
    const input = el('input', {
      class: 'bp-name mono',
      type: 'text',
      placeholder: tr('EFO0………………  hoặc dán chuỗi bản vẽ EnKAD'),
    });
    const servers = el('div', { class: 'bp-tabs small' });
    const drawServers = (): void => {
      clear(servers);
      for (const sv of EFBP_SERVERS)
        servers.append(
          el(
            'button',
            {
              class: `bp-tab${sv.id === server ? ' active' : ''}`,
              onclick: () => {
                server = sv.id;
                drawServers();
              },
            },
            sv.label,
          ),
        );
    };
    drawServers();
    const error = el('div', { class: 'bp-error' });
    const go = el('button', { class: 'tool primary' }, tr('Nhập'));
    const run = async (): Promise<void> => {
      const text = input.value.trim();
      if (!text) {
        input.focus();
        return;
      }
      error.textContent = '';
      go.setAttribute('disabled', '');
      go.textContent = tr('Đang tải…');
      try {
        const code = extractCode(text);
        const blob = code ? await fetchBlueprintCode(code, server) : text;
        const imp = enkadToPieces(blob, state.ds);
        if (imp.pieces.machines.length + imp.pieces.tiles.length === 0) throw new Error(tr('Bản vẽ trống'));
        const size = piecesSize(state.ds, imp.pieces);
        const saved: SavedBlueprint = {
          id: newId(),
          name: code ?? tr('Bản vẽ nhập'),
          icon: null,
          kind: 'module',
          created: Date.now(),
          preview: renderPreview(renderer, state.ds, piecesBlueprint(imp.pieces, size), {}),
          module: imp.pieces,
        };
        list = [saved, ...list];
        if (!persist()) list = list.slice(1);
        const notes = [
          imp.skipped.length ? tr('bỏ qua {0} loại không có trong dữ liệu ({1})', imp.skipped.length, imp.skipped.slice(0, 4).join(', ')) : '',
          imp.failed.length ? tr('{0} công trình không đặt được', imp.failed.length) : '',
        ].filter(Boolean);
        toast(tr('Đã nhập "{0}"{1}', saved.name, notes.length ? ' — ' + notes.join('; ') : ''), notes.length ? undefined : 'info');
        wrap.remove();
        close();
        startStamp(state, renderer, { ...saved, module: clone(saved.module!) });
      } catch (err) {
        error.textContent = (err as Error).message || tr('Không đọc được bản vẽ');
        go.removeAttribute('disabled');
        go.textContent = tr('Nhập');
      }
    };
    go.addEventListener('click', () => void run());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void run();
    });
    wrap.append(
      el(
        'div',
        { class: 'bp-dialog small import' },
        el('div', { class: 'bp-dialog-title' }, tr('Nhập bản vẽ')),
        el('label', { class: 'bp-field' }, el('span', { class: 'bp-label' }, tr('Mã bản vẽ')), input),
        el('label', { class: 'bp-field' }, el('span', { class: 'bp-label' }, tr('Máy chủ')), servers),
        el(
          'div',
          { class: 'bp-hint' },
          tr('Mã bản vẽ của game (EFO0…) được tra qua EnKAD — cần đúng máy chủ. Cũng có thể dán thẳng chuỗi bản vẽ (base64) của EnKAD. Bản vẽ nhập vào được lưu ở tab Blueprint rồi preview theo con trỏ để đặt.'),
        ),
        error,
        el('div', { class: 'bp-dialog-buttons' }, el('button', { class: 'tool', onclick: () => wrap.remove() }, tr('Huỷ')), go),
      ),
    );
    win.append(wrap);
    input.focus();
  };

  // ------------------------------------------------------------- khung chính
  const TABS: { id: LibraryTab; label: string }[] = [
    { id: 'base', label: 'Base' },
    { id: 'blueprint', label: 'Blueprint' },
    { id: 'map', label: 'Map' },
    { id: 'modeler', label: 'Modeler' },
  ];

  /**
   * Dấu ghim góc phải trên của khung (người dùng 2026-10-02): ghim ⇒ bản vẽ hiện thêm ở thanh đặt máy **thu gọn**
   * (bấm ở đó = Đặt / Mở như ở đây). Bấm lại ⇒ bỏ ghim.
   */
  const pinButton = (b: SavedBlueprint): HTMLElement => {
    const on = loadBlueprintPins().includes(b.id);
    const pin = el('span', {
      class: `bp-card-pin${on ? ' on' : ''}`,
      role: 'button',
      title: on ? tr('Bỏ ghim khỏi thanh đặt máy thu gọn') : tr('Ghim lên thanh đặt máy thu gọn'),
      onclick: (e: Event) => {
        e.stopPropagation();
        setBlueprintPinned(b.id, !on);
        render();
      },
      ondblclick: (e: Event) => e.stopPropagation(),
    });
    pin.innerHTML = PIN_SVG;
    return pin;
  };

  /** Một khung bản vẽ trong lưới (`ghost` = bản sao để chạy animation, không bấm được). */
  const card = (b: SavedBlueprint, ghost = false): HTMLElement => {
    const item = b.icon ? state.ds.items.get(b.icon) : undefined;
    // cửa sổ thêm bản vẽ đang mở ⇒ bấm khung cùng loại = cập nhật bản vẽ đó
    const replaceable = !ghost && panel?.mode === 'add' && panel.kind === b.kind;
    return el(
      'button',
      {
        // viền theo loại: module xanh, toàn map cam
        class: `bp-card ${b.kind}${b.id === selectedId ? ' selected' : ''}${fresh.has(b.id) && b.id === selectedId ? ' fresh' : ''}${replaceable ? ' replaceable' : ''}`,
        'data-id': ghost ? '' : b.id,
        title: replaceable
          ? tr('Bấm để cập nhật "{0}" thành bản vẽ mới', b.name)
          : b.kind === 'map'
            ? tr('Bản vẽ toàn map')
            : b.kind === 'modeler'
              ? tr('Sơ đồ Modeler — mở thành tab mới')
              : tr('Bản vẽ module (nhóm)'),
        onclick: () => {
          if (ghost || busy) return;
          if (panel?.mode === 'add') {
            panel.replace(b);
            return;
          }
          // bấm chọn ⇒ cửa sổ sửa của bản đó (người dùng 2026-10-03); bấm lại chính nó thì giữ nguyên (đóng bằng Esc / ×)
          if (panel?.mode === 'edit' && panel.editId === b.id) return;
          selectedId = b.id;
          fresh.clear();
          openAddPanel({ kind: b.kind, entry: {}, preview: b.preview, name: b.name, icon: b.icon, announce: false }, b);
        },
        ondblclick: () => {
          if (!ghost && !busy && panel?.mode !== 'add') void place(b);
        },
      },
      b.preview ? el('img', { class: 'bp-thumb', src: b.preview, alt: '' }) : el('div', { class: 'bp-thumb empty' }),
      // ghim lên thanh thu gọn: chỉ bản vẽ module (tab Blueprint) — map / Modeler không có (người dùng 2026-10-03)
      ghost || b.kind !== 'module' ? null : pinButton(b),
      replaceable ? el('div', { class: 'bp-replace-tag' }, tr('Cập nhật')) : null,
      el(
        'div',
        { class: 'bp-card-foot' },
        item ? el('img', { class: 'bp-card-icon', src: `img/itemicon/${item.icon}.png`, alt: '' }) : el('div', { class: 'bp-card-icon none' }),
        el('div', { class: 'bp-card-name', title: b.name }, b.name),
        // nhãn giữ màu theo loại, nội dung là diện tích thu gọn theo máy bên trong
        (() => {
          if (b.kind === 'modeler') return el('div', { class: 'bp-badge modeler', title: tr('Số máy trên sơ đồ') }, tr('{0} máy', b.modeler?.nodes.length ?? 0));
          const size = savedSize(state.ds, b);
          return el('div', { class: `bp-badge ${b.kind}`, title: tr('Diện tích (ô)') }, `${size.w}×${size.d}`);
        })(),
      ),
    );
  };

  /** Dựng lại cửa sổ; `hide` = bản vẽ chưa hiện (đang chờ animation thêm vào). */
  const render = (hide?: Set<string>): void => {
    clear(win);
    const all = hide ? list.filter((b) => !hide.has(b.id)) : list;
    const shown =
      tab === 'map'
        ? all.filter((b) => b.kind === 'map')
        : tab === 'blueprint'
          ? all.filter((b) => b.kind === 'module')
          : tab === 'modeler'
            ? all.filter((b) => b.kind === 'modeler')
            : [];
    const selected = shown.find((b) => b.id === selectedId) ?? null;
    const tabs = el('div', { class: 'bp-tabs' });
    for (const t of TABS)
      tabs.append(
        el(
          'button',
          {
            class: `bp-tab${t.id === tab ? ' active' : ''}`,
            onclick: () => {
              if (busy) return;
              if (panel?.mode === 'edit') panel.cancel();
              tab = t.id;
              lastTab = t.id;
              selectedId = null;
              fresh.clear();
              render();
            },
          },
          t.label,
        ),
      );
    const fileButtons =
      tab === 'base'
        ? []
        : [
            el('button', { class: 'tool', title: tr('Nhập bản vẽ từ file .json'), onclick: () => file.click() }, tr('Nhập file')),
            el(
              'button',
              {
                class: 'tool',
                // "Xuất tất cả" = mọi bản vẽ của cả ba loại — blueprint, Modeler, map — trong một file (người dùng
                // 2026-10-04; trước đây chỉ xuất loại của tab đang mở). Nhập lại file đó ⇒ mỗi bản về đúng tab của nó.
                title: selected ? tr('Xuất "{0}" ra file', selected.name) : tr('Xuất mọi bản vẽ (blueprint, Modeler, map) ra một file'),
                disabled: selected ? false : list.length === 0,
                onclick: () =>
                  void (selected
                    ? download(`${selected.name}.efp.json`, exportLibrary([selected]))
                    : download('thu-vien-ban-ve.efp.json', exportLibrary(list))),
              },
              selected ? tr('Xuất bản này') : tr('Xuất tất cả'),
            ),
          ];
    // điện thoại (người dùng 2026-10-05): nút Đặt / Mở lên đầu cửa sổ, "Nhập file" / "Xuất…" xuống thanh dưới cùng
    const touch = isTouchUI();
    const placeBtn = selected
      ? el('button', { class: 'tool primary', onclick: () => void place(selected) }, selected.kind === 'modeler' ? tr('Mở') : tr('Đặt'))
      : null;
    win.append(
      el(
        'div',
        { class: 'bp-head' },
        el('div', { class: 'bp-title' }, tr('Bản vẽ')),
        tabs,
        el('div', { class: 'bp-count' }, tab === 'base' ? '' : tr('{0} bản', shown.length)),
        el('div', { class: 'bp-spacer' }),
        ...(touch ? [placeBtn] : fileButtons),
        el('button', { class: 'bp-close', title: tr('Đóng (Esc)'), onclick: close }, '×'),
      ),
      file,
    );

    if (tab === 'base') {
      win.append(baseTab());
      return;
    }

    clear(grid);
    if (tab === 'modeler') {
      grid.append(
        el(
          'button',
          {
            class: 'bp-card add quick',
            title: opts.modeler ? tr('Lưu sơ đồ Modeler đang mở  (Ctrl+S)') : tr('Mở một tab Modeler trước'),
            disabled: !opts.modeler,
            onclick: () => saveDialog('modeler'),
          },
          el('div', { class: 'bp-plus' }, '+'),
          el('div', { class: 'bp-add-text' }, opts.modeler ? tr('Lưu sơ đồ hiện tại') : tr('Chưa mở tab Modeler')),
        ),
      );
    } else if (tab === 'map') {
      grid.append(
        el(
          'button',
          { class: 'bp-card add quick', title: tr('Lưu toàn bộ map hiện tại thành một bản vẽ mới  (Ctrl+S)'), onclick: () => saveDialog('map') },
          el('div', { class: 'bp-plus' }, '+'),
          el('div', { class: 'bp-add-text' }, tr('Lưu map hiện tại')),
        ),
      );
    } else {
      const picked = selectionSize(state.sel) > 0;
      // "Nhập mã bản vẽ" đứng trước, ô "+" sát các bản vẽ ⇒ bản vẽ mới mọc từ "+" đẩy domino mượt hơn (người dùng 2026-10-02).
      // Bản public: tạm bỏ nhập bản vẽ EnKAD (người dùng 2026-10-06, `buildFlags.ts`)
      if (!PUBLIC_BUILD)
        grid.append(
          el(
            'button',
            { class: 'bp-card add import', title: tr('Nhập mã bản vẽ của game (EFO0…) hoặc chuỗi bản vẽ EnKAD'), onclick: importCodeDialog },
            el('div', { class: 'bp-plus' }, '⇩'),
            el('div', { class: 'bp-add-text' }, tr('Nhập mã bản vẽ')),
          ),
        );
      grid.append(
        el(
          'button',
          {
            class: 'bp-card add quick',
            title: picked ? tr('Lưu nhóm đang chọn thành bản vẽ (module)  (Ctrl+S)') : tr('Chọn máy / nhóm máy trên bản vẽ trước'),
            disabled: !picked,
            onclick: () => saveDialog('module'),
          },
          el('div', { class: 'bp-plus' }, '+'),
          el('div', { class: 'bp-add-text' }, picked ? tr('Lưu nhóm đang chọn') : tr('Chưa chọn máy nào')),
        ),
      );
    }
    for (const b of shown) grid.append(card(b));
    win.append(grid);

    clear(actions);
    if (touch) {
      if (fileButtons.length) {
        actions.append(...fileButtons);
        win.append(actions);
      }
    } else if (selected) {
      actions.append(
        el('div', { class: 'bp-actions-name' }, selected.name),
        // Xoá chỉ còn ở cửa sổ chỉnh sửa bản vẽ bên phải (người dùng 2026-10-03)
        el('button', { class: 'tool primary', onclick: () => void place(selected) }, selected.kind === 'modeler' ? tr('Mở') : tr('Đặt')),
      );
      win.append(actions);
    }
  };

  render();
  void upgradePreviews();
  if (opts.save) saveDialog(opts.save);
  else if (opts.files?.length) void ingestFiles(opts.files, false);
}
