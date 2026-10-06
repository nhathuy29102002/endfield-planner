import type { AppState } from '../editor/state';
import type { TabGroup, TabRecord } from '../editor/tabs';
import { itemName } from '../model/dataset';
import type { Renderer } from '../render/renderer';
import { simBase, type SimBase, type Simulation } from '../simulation/engine';
import { MAX_SECONDS, MAX_SPEED } from '../simulation/params';
import { rateBetween, SimTimeline, type JobSpawner, type MarkKey } from '../simulation/timeline';
import type { WorldMap } from '../simulation/world';
import { drawSimItems, drawSimMachines } from '../simulation/view';
import { clear, el, fmt } from './dom';
import { createSimProduction, type SimProduction } from './simMachine';
import { createSimChart, hhmmss, type SimChart } from './simChart';
import { clockHead, setPortRateOverride } from './machineParts';
import { setClockOverride } from './inspector';
import { itemChip } from './inspector';
import { toast } from './toast';
import { createGenPanel, loadGen, saveGen, type DepotGen, type GenPanel } from './simGen';
import { createFold, foldMemory, type Fold } from './fold';
import { emptySelection } from '../editor/group';
import { tr } from '../i18n';
import { isTouchUI } from '../platform';

/**
 * **Chế độ Simulation trên bản vẽ** (người dùng 2026-10-03): Map thường vẫn **tĩnh**; bấm "Mô phỏng" (nút chuyển vàng,
 * bấm lần nữa = thoát) ⇒ nhà máy **chạy như game** và **vẫn chỉnh sửa được** (mỗi lần map đổi, mô phỏng dựng lại và giữ
 * những gì đang chạy).
 *
 * - **Tính sẵn 24 giờ** ở nền (worker) — thanh tua là **trục ngang của biểu đồ** (`simChart.ts`), tua tới bất kỳ lúc nào
 *   đã tính. Biểu đồ thu gọn được (còn lại thanh tua).
 * - **Thanh trượt giờ** (10 phút · 1 · 4 · 8 · 24 giờ) thay nút "Tổng hợp nhanh" và ✕: đổi trục ngang của biểu đồ /
 *   thanh tua (0 → N giờ) và bảng tổng hợp ở **thanh bên phải** (trung bình mỗi phút trong **30 phút tới** và **N giờ
 *   tới** tính từ lúc đang xem; sản lượng và nạp vào kho tổng).
 * - **Nhóm tab**: các map trong một nhóm mô phỏng chung (chung kho tổng + điện); chỉ map đang mở được vẽ, các map khác
 *   chạy ngầm trong cùng một thế giới.
 * - **Đổi tab không mất tiến độ** (mỗi nhóm / tab lẻ có một phiên riêng); chỉ mất khi thoát chế độ mô phỏng.
 * - Cửa sổ Máy: giữ thanh % TỐT / CHẬM / KẸT, ô INPUT / OUTPUT thành thanh sản xuất động; chuột phải vào một ô ⇒ xoá sạch.
 */
const SPEEDS = [0.25, 0.5, 1, 2, 4, MAX_SPEED];
/** Các nấc của thanh trượt giờ (giây). */
export const HOURS = [600, 3600, 4 * 3600, 8 * 3600, MAX_SECONDS];
const HOUR_LABEL = (): string[] => [tr('10 phút'), tr('1 giờ'), tr('4 giờ'), tr('8 giờ'), tr('24 giờ')];
/** Tuỳ chọn mô phỏng của một phiên: kho tổng vô hạn hay không, kho tổng tự sinh. */
const simOpts = (s: { infiniteDepot: boolean; gen: DepotGen }): { infiniteDepot: boolean; depotGen: DepotGen } => ({ infiniteDepot: s.infiniteDepot, depotGen: { ...s.gen } });
/** Bảng "Kho tổng tự sinh" đang mở (nổi phía trên thanh điều khiển). */
let genPanel: { panel: GenPanel; close: () => void } | null = null;

/** Mỗi khung hình tối đa bao nhiêu giây mô phỏng. */
const MAX_FRAME = 1;
/** Cột "30 phút tới" của bảng tổng hợp. */
const NEXT = 1800;

/** Phần của TabManager mà chế độ mô phỏng cần. */
export interface SimTabs {
  readonly activeId: string;
  readonly tabs: TabRecord[];
  groupOf(id: string): TabGroup | undefined;
  members(gid: string): TabRecord[];
}

interface Session {
  /** Id nhóm, hoặc id tab nếu tab không trong nhóm. */
  key: string;
  tl: SimTimeline;
  playing: boolean;
  speed: number;
  infiniteDepot: boolean;
  /** Nấc thanh trượt giờ (chỉ số trong `HOURS`). */
  hours: number;
  chartCollapsed: boolean;
  /** Thanh điều khiển đang ẩn (thu vào nút con mắt). */
  barHidden: boolean;
  /** Kho tổng tự sinh: món → số mỗi phút (nút cài đặt — người dùng 2026-10-04). */
  gen: DepotGen;
  /** Kết quả bộ giải + mạng băng của từng map (tính lại khi map đó đổi). */
  bases: Map<string, SimBase>;
}

interface Ctx {
  state: AppState;
  renderer: Renderer;
  app: HTMLElement;
  host: HTMLElement;
  /** Thanh bên phải (bảng tổng hợp của chế độ thường nằm ở đây). */
  right: HTMLElement;
  /** Vẽ lại bản vẽ (không dựng lại các bảng). */
  redraw: () => void;
  tabs: SimTabs;
}

let ctx: Ctx | null = null;
const sessions = new Map<string, Session>();
/** Phiên đang hiện (map đang mở thuộc phiên này). */
let current: Session | null = null;
let ui: { bar: HTMLElement; controls: HTMLElement; chart: SimChart; summary: HTMLElement; lastSlow: number; eye: HTMLElement | null } | null = null;
let scrubbing = false;
let pendingSeek: number | null = null;
/** Thanh sản xuất động đang nằm trong cửa sổ Máy — cập nhật mỗi khung hình. */
let production: { uid: number; widget: SimProduction } | null = null;

export const isSimulating = (): boolean => current !== null;

/** Worker tính sẵn: mỗi việc một worker, huỷ = terminate. */
const workerSpawner: JobSpawner = (req, onChunk) => {
  const w = new Worker(new URL('../simulation/simWorker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e) => onChunk(e.data);
  w.postMessage(req);
  return () => w.terminate();
};

const keyOf = (tabId: string): string => ctx!.tabs.groupOf(tabId)?.id ?? tabId;
const membersOf = (key: string): TabRecord[] => {
  const t = ctx!.tabs;
  const g = t.tabs.filter((x) => x.group === key);
  if (g.length > 0) return g;
  const one = t.tabs.find((x) => x.id === key && !x.group);
  return one ? [one] : [];
};

function mapsOf(s: Session): WorldMap[] {
  const { state, tabs } = ctx!;
  return membersOf(s.key)
    .filter((t) => t.kind === 'map')
    .map((t) => {
      const bp = t.id === tabs.activeId ? state.bp : t.map!.bp;
      let base = s.bases.get(t.id);
      if (!base) s.bases.set(t.id, (base = simBase(bp, state.ds)));
      return { key: t.id, bp, base };
    });
}

/** Mô phỏng của map đang mở. */
const activeSim = (s: Session): Simulation | undefined => s.tl.world.sims.get(ctx!.tabs.activeId);

/** Gắn chế độ Simulation vào trang (một lần, ở `main.ts`). */
export function mountSimMode(c: Ctx): void {
  ctx = c;
  // map đổi (đặt / xoá / sửa máy, hoàn tác…) trong lúc mô phỏng ⇒ dựng lại, giữ trạng thái đang chạy; phần đã tính sau
  // lúc này bỏ đi và tính lại
  c.state.subscribe((mode) => {
    const s = current;
    if (!s || mode !== 'data') return;
    if (!membersOf(s.key).some((t) => t.id === c.tabs.activeId)) return;
    s.bases.delete(c.tabs.activeId);
    s.tl.rebuild();
    slowUpdate();
    c.redraw();
  });
}

/** Vào chế độ Simulation với map đang mở (nhóm của nó nếu có). */
export function enterSimMode(): void {
  if (!ctx || current) return;
  const key = keyOf(ctx.tabs.activeId);
  let s = sessions.get(key);
  if (!s) {
    const fresh: Session = { key, tl: null as unknown as SimTimeline, playing: true, speed: 1, infiniteDepot: true, hours: 1, chartCollapsed: isTouchUI() /* điện thoại: màn hình thấp ⇒ biểu đồ thu gọn sẵn (2026-10-05) */, barHidden: false, gen: loadGen(), bases: new Map() };
    fresh.tl = new SimTimeline(() => mapsOf(fresh), ctx.state.ds, simOpts(fresh), workerSpawner);
    sessions.set(key, (s = fresh));
  }
  attach(s);
  const n = membersOf(key).filter((t) => t.kind === 'map').length;
  ctx.state.notify(
    n > 1
      ? tr('Đang mô phỏng nhóm {0} map (chung kho tổng + điện) — đang tính sẵn 24 giờ ở nền. Space: chạy / dừng', n)
      : tr('Đang mô phỏng — đang tính sẵn 24 giờ ở nền, kéo thanh tua dưới biểu đồ để tới bất kỳ lúc nào. Space: chạy / dừng'),
  );
}

/** Thoát hẳn: bỏ phiên của map / nhóm đang mở (mất tiến độ). */
export function exitSimMode(): void {
  if (!ctx || !current) return;
  const s = current;
  detach();
  s.tl.dispose();
  sessions.delete(s.key);
}

/** Sắp rời tab đang mở — cất phiên (giữ nguyên tiến độ), gỡ giao diện. */
export function simTabLeaving(): void {
  if (current) detach();
}

/** Vừa mở một tab: tab (hoặc nhóm của nó) đang có phiên mô phỏng ⇒ hiện lại đúng chỗ đang dừng. */
export function simTabActivated(tab: TabRecord): void {
  if (!ctx) return;
  prune();
  if (tab.kind !== 'map') return;
  const s = sessions.get(keyOf(tab.id));
  if (s) attach(s);
}

/** Nhóm tab vừa đổi: phiên nào không còn khớp nhóm / tab ⇒ dừng. */
export function simGroupsChanged(): void {
  if (!ctx) return;
  const before = sessions.size;
  prune();
  if (sessions.size < before) toast(tr('Nhóm tab đổi — mô phỏng của nhóm / tab đó đã dừng'));
}

function prune(): void {
  for (const [key, s] of [...sessions]) {
    // chỉ tab Map tính (tab Modeler ghép vào nhóm không ảnh hưởng gì tới mô phỏng / điện)
    const members = membersOf(key).filter((t) => t.kind === 'map');
    // phiên của một tab lẻ mà tab đó vừa vào nhóm, hoặc phiên của nhóm đã đổi thành viên
    const ids = members.map((t) => t.id).sort().join(',');
    const had = [...s.tl.world.sims.keys()].sort().join(',');
    if (members.length > 0 && ids === had) continue;
    if (current === s) detach();
    s.tl.dispose();
    sessions.delete(key);
  }
}

function attach(s: Session): void {
  if (!ctx) return;
  const { state, renderer, app, host, right } = ctx;
  current = s;
  const bar = el('div', { class: 'sim-bar' });
  const controls = el('div', { class: 'sim-controls-row' });
  const chart = createSimChart(
    state.ds,
    {
      // mở danh sách chọn món ⇒ đóng bảng kho tự sinh (có hiệu ứng) — hai bảng không mở cùng lúc
      expanded: () => genPanel?.close(),
      seek: (t) => {
        pendingSeek = t;
        ctx?.redraw();
      },
      scrub: (on) => {
        scrubbing = on;
      },
    },
    s.chartCollapsed,
  );
  const summary = el('div', { class: 'panel-section sim-summary' });
  // mũi tên sát góc phải trên của thanh: mở / đóng biểu đồ (người dùng 2026-10-03 — thay nút "Biểu đồ")
  const toggle = el('button', { class: `sim-chart-toggle${s.chartCollapsed ? ' collapsed' : ''}`, title: s.chartCollapsed ? tr('Mở biểu đồ') : tr('Thu gọn biểu đồ (chỉ còn thanh tua)') });
  toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  toggle.addEventListener('click', () => {
    const cur = current;
    if (!cur || !ui) return;
    cur.chartCollapsed = !cur.chartCollapsed;
    ui.chart.collapsed = cur.chartCollapsed;
    toggle.classList.toggle('collapsed', cur.chartCollapsed);
    toggle.title = cur.chartCollapsed ? tr('Mở biểu đồ') : tr('Thu gọn biểu đồ (chỉ còn thanh tua)');
  });
  bar.append(chart.el, controls, toggle);
  host.append(bar);
  right.append(summary);
  ui = { bar, controls, chart, summary, lastSlow: 0, eye: null };
  app.classList.add('sim-mode');
  state.setSelection(emptySelection());
  // cửa sổ Máy: giữ thanh % (TỐT / CHẬM / KẸT), ô INPUT / OUTPUT thành thanh sản xuất động; trạm điện: pin ⇒ ⚡
  setClockOverride((m) => {
    const cur = current;
    const view = cur && activeSim(cur)?.machine(m.uid, cur.tl.view);
    if (!cur || !view || (view.kind !== 'crafter' && view.kind !== 'generator')) return null;
    const widget = createSimProduction(state.ds, view.kind === 'crafter' ? (state.result.machines.get(m.uid)?.recipeId ?? null) : null, (item, side) => clearSlot(m.uid, item, side));
    production = { uid: m.uid, widget };
    widget.update(view);
    if (view.kind !== 'crafter') return widget.el;
    return el('div', { class: 'sim-mw-wrap' }, clockHead(state.result.machines.get(m.uid)), widget.el);
  });
  // sơ đồ cổng: rê chuột vào món ở cổng ra ⇒ số món ra mỗi phút của cổng đó trong mô phỏng
  setPortRateOverride((uid, portKey) => {
    const cur = current;
    const sim = cur && activeSim(cur);
    if (!cur || !sim) return null;
    const lane = sim.lanes.find((l) => l.from.uid === uid && l.from.portKey === portKey);
    const t = cur.tl.view;
    return lane && t > 0 ? (lane.entered / t) * 60 : 0;
  });
  renderer.simLayer = (what, g) => {
    const cur = current;
    const sim = cur && activeSim(cur);
    if (!cur || !sim) return;
    const dc = { ctx: g, camera: renderer.camera, bp: state.bp, ds: state.ds, icons: renderer.icons, sim, at: cur.tl.view };
    if (what === 'machines') drawSimMachines(dc, state.selection);
    else drawSimItems(dc, what);
  };
  renderControls();
  slowUpdate();
  if (s.barHidden) hideBar(false);
  // điện thoại: thanh điều khiển **trượt lên** từ mép dưới khi vào mô phỏng (người dùng 2026-10-06)
  else if (isTouchUI() && motion())
    bar.animate([{ transform: 'translateY(calc(100% + 24px))', opacity: 0 }, { transform: 'none', opacity: 1 }], {
      duration: 320,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    });
  state.emit('ui'); // nút "Mô phỏng" chuyển vàng
}

const EYE_OPEN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
const EYE_SHUT =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M4 20 20 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const motion = (): boolean => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * **Ẩn thanh điều khiển** (người dùng 2026-10-03): thanh thu nhỏ dần vào nút con mắt ở góc dưới trái của nó (trước
 * 2026-10-05: góc dưới phải) rồi biến mất,
 * chỉ còn nút con mắt (nổi, đúng chỗ cũ); bấm nút ⇒ thanh phóng ra lại từ nút.
 */
function hideBar(animate = true): void {
  const s = current;
  if (!s || !ui || !ctx || ui.eye) return;
  s.barHidden = true;
  const { bar } = ui;
  const inner = bar.querySelector<HTMLElement>('.sim-eye');
  const hostRect = ctx.host.getBoundingClientRect();
  const er = inner?.getBoundingClientRect();
  const br = bar.getBoundingClientRect();
  // nút con mắt nổi, đặt đúng chỗ nút trong thanh
  const eye = el('button', { class: 'sim-btn sim-eye floating', title: tr('Hiện thanh điều khiển mô phỏng') });
  eye.innerHTML = EYE_SHUT;
  eye.style.left = `${er ? er.left - hostRect.left : 20}px`;
  eye.style.bottom = `${er ? hostRect.bottom - er.bottom : 20}px`;
  eye.addEventListener('click', () => showBar());
  ctx.host.append(eye);
  ui.eye = eye;
  const done = (): void => {
    bar.style.display = 'none';
  };
  if (!animate || !motion() || !er) return done();
  const ox = er.left + er.width / 2 - br.left;
  const oy = er.top + er.height / 2 - br.top;
  bar.style.transformOrigin = `${ox}px ${oy}px`;
  const a = bar.animate(
    [
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(0.04)', opacity: 0 },
    ],
    { duration: 260, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
  );
  a.onfinish = () => {
    done();
    a.cancel();
  };
}

function showBar(): void {
  const s = current;
  if (!s || !ui) return;
  s.barHidden = false;
  const { bar } = ui;
  const eye = ui.eye;
  ui.eye = null;
  bar.style.display = '';
  const er = eye?.getBoundingClientRect();
  eye?.remove();
  slowUpdate();
  const inner = bar.querySelector<HTMLElement>('.sim-eye');
  const br = bar.getBoundingClientRect();
  const ir = inner?.getBoundingClientRect() ?? er;
  if (!motion() || !ir) return;
  const ox = ir.left + ir.width / 2 - br.left;
  const oy = ir.top + ir.height / 2 - br.top;
  bar.style.transformOrigin = `${ox}px ${oy}px`;
  bar.animate(
    [
      { transform: 'scale(0.04)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    { duration: 300, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1.05)' },
  );
}

/** Mở / đóng bảng "Kho tổng tự sinh" phía trên thanh điều khiển (người dùng 2026-10-04). */
function toggleGen(anchor: HTMLElement): void {
  if (genPanel) return genPanel.close();
  const s = current;
  if (!s || !ui || !ctx) return;
  // mở bảng kho tự sinh ⇒ đóng danh sách chọn món của biểu đồ
  ui.chart.setExpanded(false);
  const panel = createGenPanel(
    ctx.state.ds,
    s.gen,
    s.infiniteDepot,
    (g) => {
      const cur = current;
      if (!cur) return;
      cur.gen = g;
      saveGen(g);
      cur.tl.setOptions(simOpts(cur)); // tính lại từ lúc này với sản lượng tự sinh mới
      renderControls(); // số món tự sinh trên nút cài đặt
      slowUpdate();
    },
    (on) => {
      const cur = current;
      if (!cur) return;
      cur.infiniteDepot = on;
      cur.tl.reset(simOpts(cur)); // đổi luật kho tổng ⇒ chạy lại từ đầu
      genPanel?.panel.setInfinite(on);
      slowUpdate();
      ctx?.redraw();
    },
  );
  const host = ctx.host.getBoundingClientRect();
  const bar = ui.bar.getBoundingClientRect();
  panel.el.style.left = `${bar.left - host.left}px`;
  panel.el.style.bottom = `${host.bottom - bar.top + 8}px`;
  // không tràn khỏi mép trên khung bản vẽ (biểu đồ đang mở thì thanh cao, chỗ trống phía trên ít)
  panel.el.style.height = `${Math.min(520, Math.max(200, bar.top - host.top - 16))}px`;
  ctx.host.append(panel.el);
  panel.el.animate([{ transform: 'translateY(12px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 200, easing: 'ease-out' });
  anchor.classList.add('active');
  const outside = (e: MouseEvent): void => {
    if (panel.el.contains(e.target as Node) || anchor.contains(e.target as Node)) return;
    close();
  };
  const esc = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  };
  /** Đóng có hiệu ứng: trượt xuống về phía thanh điều khiển và mờ đi (người dùng 2026-10-04). */
  const close = (): void => {
    if (genPanel?.panel !== panel) return;
    window.removeEventListener('mousedown', outside, true);
    window.removeEventListener('keydown', esc, true);
    document.querySelector('.sim-gen-btn')?.classList.remove('active');
    anchor.classList.remove('active');
    genPanel = null;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return panel.el.remove();
    panel.el.style.pointerEvents = 'none';
    const a = panel.el.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(14px) scale(0.98)', opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    a.onfinish = () => panel.el.remove();
    setTimeout(() => panel.el.remove(), 400);
  };
  window.addEventListener('mousedown', outside, true);
  window.addEventListener('keydown', esc, true);
  genPanel = { panel, close };
  panel.focus();
}

function detach(): void {
  genPanel?.close();
  if (!ctx || !current) return;
  // điện thoại: thanh trượt xuống khuất rồi mới gỡ
  const leaving = ui?.bar;
  if (leaving && isTouchUI() && motion() && leaving.style.display !== 'none') {
    const a = leaving.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(calc(100% + 24px))', opacity: 0 }], {
      duration: 220,
      easing: 'cubic-bezier(0.4, 0, 1, 1)',
      fill: 'forwards',
    });
    a.onfinish = () => leaving.remove();
  } else leaving?.remove();
  ui?.summary.remove();
  ui?.eye?.remove();
  ui = null;
  current = null;
  production = null;
  scrubbing = false;
  pendingSeek = null;
  setClockOverride(null);
  setPortRateOverride(null);
  ctx.state.setSelection(emptySelection());
  ctx.app.classList.remove('sim-mode');
  ctx.renderer.simLayer = null;
  ctx.state.emit('ui');
}

/** Chuột phải vào một ô của máy (thanh sản xuất) ⇒ xoá sạch món ở ô đó, tính lại từ lúc này. */
function clearSlot(uid: number, item: string, side: 'in' | 'out'): void {
  const s = current;
  if (!s || !ctx) return;
  const key = ctx.tabs.activeId;
  let n = 0;
  s.tl.rebuild((w) => {
    n = w.sims.get(key)?.clearSlot(uid, item, side) ?? 0;
  });
  if (n > 0) toast(tr('Đã xoá {0} {1} khỏi máy', Math.floor(n), itemName(ctx.state.ds, item)), 'info');
  updateProduction();
  slowUpdate();
  ctx.redraw();
}

const range = (s: Session): number => HOURS[s.hours] ?? 3600;

/** Mỗi khung hình (`main.ts`): phát tiếp theo tốc độ đang chọn. */
export function tickSimMode(realDt: number): boolean {
  const s = current;
  if (!s || !ui) return false;
  const end = range(s);
  if (pendingSeek !== null) {
    s.tl.seek(Math.min(pendingSeek, end));
    pendingSeek = null;
    updateProduction();
    slowUpdate();
  } else if (s.playing && !scrubbing) {
    s.tl.play(Math.min(MAX_FRAME, realDt * s.speed), end);
    if (s.tl.view >= end - 1e-6) {
      // hết trục ngang đang chọn ⇒ dừng (muốn đi tiếp: kéo thanh trượt giờ lên nấc lớn hơn)
      s.playing = false;
      renderControls();
    }
  }
  ui.chart.setTime(s.tl.view);
  updateProduction();
  const t = performance.now();
  if (t - ui.lastSlow > 250) slowUpdate();
  return true;
}

function updateProduction(): void {
  const s = current;
  if (!s || !production || production.uid !== ctx?.state.selection || !production.widget.el.isConnected) return;
  const view = activeSim(s)?.machine(production.uid, s.tl.view);
  if (view) production.widget.update(view);
}

/**
 * Thanh điều khiển nằm bên trái khung bản vẽ (người dùng 2026-10-04): khi cửa sổ Máy (góc phải dưới) đang mở thì thanh
 * chỉ chiếm phần trống bên trái nó — hàng nút tự xuống dòng nếu không đủ chỗ — để không bao giờ đè lên cửa sổ Máy.
 */
function fitBar(): void {
  if (!ui || !ctx) return;
  if (isTouchUI()) {
    // điện thoại (người dùng 2026-10-06, lần 2): thanh **không bao giờ co lại** — luôn hai dòng (thanh tua + một dòng nút);
    // cửa sổ Máy / bảng Tổng hợp chồng lên thành lớp (chạm cửa sổ nào thì nó lên trên — `attachLayers` ở `touch.ts`)
    if (ui.bar.style.maxWidth) ui.bar.style.maxWidth = '';
    return;
  }
  const host = ctx.host.getBoundingClientRect();
  const mw = document.querySelector<HTMLElement>('.machine-window');
  const r = mw && mw.offsetParent !== null && mw.offsetHeight > 0 ? mw.getBoundingClientRect() : null;
  const limit = r && r.left > host.left ? r.left - host.left - 12 - 14 : host.width - 24;
  const v = `${Math.max(280, Math.round(limit))}px`;
  if (ui.bar.style.maxWidth !== v) ui.bar.style.maxWidth = v;
}

/** Phần cập nhật chậm (4 lần / giây): biểu đồ, bảng tổng hợp, chữ "đang tính". */
function slowUpdate(): void {
  const s = current;
  if (!s || !ui) return;
  ui.lastSlow = performance.now();
  fitBar();
  ui.chart.update(s.tl.marks, range(s), s.tl.computed);
  ui.chart.setTime(s.tl.view);
  const wait = ui.controls.querySelector('.sim-wait');
  if (wait) {
    const waiting = s.tl.computed < Math.min(range(s), MAX_SECONDS) - 1e-6;
    wait.textContent = waiting ? tr('đang tính sẵn… {0}', hhmmss(s.tl.computed)) : '';
  }
  renderSummary();
}

export function simTogglePlay(): void {
  const s = current;
  if (!s) return;
  s.playing = !s.playing;
  // đã tới cuối trục ngang mà bấm chạy ⇒ phát lại từ đầu
  if (s.playing && s.tl.view >= range(s) - 1e-6) pendingSeek = 0;
  renderControls();
}

function renderControls(): void {
  const s = current;
  if (!s || !ui || !ctx) return;
  const c = ui.controls;
  clear(c);
  const btn = (label: string, title: string, onClick: () => void, cls = ''): HTMLElement =>
    el('button', { class: `sim-btn${cls}`, title, onclick: onClick }, label);
  // ô "Kho tổng vô hạn" không còn trên thanh — nằm trong bảng kho tự sinh (người dùng 2026-10-04)
  const labels = HOUR_LABEL();
  // nút con mắt ở **góc dưới trái** của thanh (cũng là góc dưới trái màn hình), nút làm lại từ đầu sát **phải** cùng —
  // hai nút đổi chỗ cho nhau (người dùng 2026-10-05). Con mắt nằm cột riêng, bám đáy khi hàng nút xuống dòng.
  const main = el('div', { class: 'sim-controls-main' });
  c.append(
    (() => {
      const eye = el('button', { class: 'sim-btn sim-eye', title: tr('Ẩn thanh điều khiển mô phỏng') });
      eye.innerHTML = EYE_OPEN;
      eye.addEventListener('click', () => hideBar());
      return eye;
    })(),
    main,
  );
  main.append(
    btn(s.playing ? '❚❚' : '▶', s.playing ? tr('Dừng  (Space)') : tr('Chạy  (Space)'), simTogglePlay, ' play'),
    el(
      'div',
      { class: 'sim-speeds' },
      ...SPEEDS.map((v) =>
        btn(`${v}×`, tr('Tốc độ {0}×', v), () => {
          s.speed = v;
          renderControls();
        }, v === s.speed ? ' active' : ''),
      ),
    ),
    (() => {
      // nút cài đặt: kho tổng tự sinh theo sản lượng (người dùng 2026-10-04)
      const n = Object.keys(s.gen).length;
      const b = el('button', { class: `sim-btn sim-gen-btn${genPanel ? ' active' : ''}`, title: tr('Kho tổng tự sinh — mỗi món tự có thêm bao nhiêu mỗi phút (dùng khi tắt kho tổng vô hạn)') });
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>';
      if (n > 0) b.append(el('span', { class: 'sim-gen-badge' }, String(n)));
      b.addEventListener('click', () => toggleGen(b));
      return b;
    })(),
    // các nấc thời gian tổng hợp — cùng kiểu bộ chỉnh tốc độ (người dùng 2026-10-03, thay thanh trượt)
    el(
      'div',
      { class: 'sim-speeds sim-hours', title: tr('Độ dài trục thời gian của biểu đồ / thanh tua và khoảng "N giờ tới" của bảng tổng hợp') },
      ...HOURS.map((_, i) =>
        btn(labels[i]!, tr('Tổng hợp {0}', labels[i]!), () => {
          s.hours = i;
          if (s.tl.view > range(s)) pendingSeek = range(s);
          renderControls();
          slowUpdate();
        }, i === s.hours ? ' active' : ''),
      ),
    ),
    el('span', { class: 'sim-wait' }),
    btn('⟲', tr('Làm lại từ đầu (mọi máy rỗng, tính lại 24 giờ)'), () => {
      s.tl.reset();
      s.playing = true;
      renderControls();
      slowUpdate();
      ctx?.redraw();
    }, ' sim-reset'),
  );
}

/** Bảng nào trong tổng hợp mô phỏng đang thu gọn (bấm dấu − trước tên — người dùng 2026-10-04); nhớ trong trình duyệt. */
const collapsedTables = foldMemory('efp:simsum');

/** Bảng tổng hợp ở thanh bên phải (giống chế độ thường): trung bình mỗi phút trong 30 phút tới và N giờ tới. */
/**
 * Khung bảng tổng hợp mô phỏng — **dựng một lần** (người dùng 2026-10-04: bấm / rê chuột lên tên bảng lúc được lúc không
 * vì trước đây cả bảng bị dựng lại 4 lần mỗi giây, nút tên bảng bị thay ngay giữa lúc nhấn chuột). Mỗi lần cập nhật chỉ
 * thay phần số liệu, và chỉ khi số thật sự đổi; nút tên bảng giữ nguyên.
 */
interface SummaryUi {
  host: HTMLElement;
  stats: HTMLElement;
  warn: HTMLElement;
  statsKey: string;
  tables: Map<string, { fold: Fold; key: string }>;
}
let sumUi: SummaryUi | null = null;

const TABLES = (): { id: string; title: string }[] => [
  { id: 'produced', title: tr('Sản lượng (trung bình mỗi phút)') },
  { id: 'depotIn', title: tr('Nạp vào kho tổng (trung bình mỗi phút)') },
  // **sản lượng thâm hụt** (người dùng 2026-10-04) = nạp vào kho tổng − rút ra khỏi kho tổng; âm = kho đang hụt món đó
  { id: 'deficit', title: tr('Sản lượng thâm hụt (trung bình mỗi phút)') },
];

function summarySkeleton(host: HTMLElement): SummaryUi {
  if (sumUi?.host === host) return sumUi;
  clear(host);
  const body = el('div', { class: 'panel-body' });
  const stats = el('div', { class: 'sim-sum-stats' });
  const warn = el('div', { class: 'warn', hidden: true }, tr('Thiếu điện — mọi máy cần điện đang dừng. Đưa pin vào trạm điện.'));
  host.append(el('div', { class: 'panel-head' }, tr('Tổng hợp mô phỏng')), body);
  body.append(stats, warn);
  const tables: SummaryUi['tables'] = new Map();
  for (const t of TABLES()) {
    // tên bảng có dấu − (đang mở) / + (đang thu gọn) phía trước: bấm để thu gọn / mở — có hiệu ứng (người dùng 2026-10-05)
    const fold = createFold(t.title, collapsedTables.has(t.id), (shut) => {
      collapsedTables.set(t.id, shut);
      renderSummary(); // mở ra ⇒ số liệu mới trước khi bảng giãn ra
    });
    body.append(fold.head, fold.wrap);
    tables.set(t.id, { fold, key: '' });
  }
  sumUi = { host, stats, warn, statsKey: '', tables };
  return sumUi;
}

/** Bảng tổng hợp ở thanh bên phải (giống chế độ thường): trung bình mỗi phút trong 30 phút tới và N giờ tới. */
function renderSummary(): void {
  const s = current;
  if (!s || !ui || !ctx) return;
  const { state } = ctx;
  const sk = summarySkeleton(ui.summary);
  const now = s.tl.view;
  const n = range(s);
  const labelN = HOUR_LABEL()[s.hours]!;
  const marks = s.tl.marks;
  const sims = [...s.tl.world.sims.values()];
  const supply = sims.reduce((a, x) => a + x.powerSupply(), 0);
  const demand = sims.reduce((a, x) => a + x.powerDemand(), 0);
  const enforce = sims.some((x) => x.enforcePower);
  const short = enforce && supply + 1e-6 < demand;

  // ---- dòng số chung
  const maps = sims.length;
  const statList: [string, string, string][] = [
    ...(maps > 1 ? [[tr('Nhóm'), tr('{0} map', maps), ''] as [string, string, string]] : []),
    [tr('Đang xem'), hhmmss(now), ''],
    [tr('Đã tính sẵn'), hhmmss(s.tl.computed), s.tl.computed < MAX_SECONDS - 1e-6 ? 'warn' : 'good'],
    [tr('Điện phát'), fmt(supply, 0), short ? 'bad' : 'good'],
    [tr('Điện cần'), fmt(demand, 0), ''],
  ];
  const statsKey = statList.map((x) => x.join('|')).join('/');
  if (statsKey !== sk.statsKey) {
    sk.statsKey = statsKey;
    clear(sk.stats);
    for (const [k, v, cls] of statList) sk.stats.append(el('div', { class: 'stat' }, el('span', {}, k), el('span', { class: `mono ${cls}` }, v)));
  }
  sk.warn.hidden = !short;

  type Rate = { rate: number; span: number };
  const keysOf = (...keys: MarkKey[]): string[] => [...new Set(keys.flatMap((k) => Object.keys(marks[marks.length - 1]?.[k] ?? {})))];
  const plain = (key: MarkKey) => (id: string, t2: number): Rate => rateBetween(marks, now, t2, key, id);
  const specs: Record<string, { ids: string[]; rateOf: (id: string, t2: number) => Rate; signed: boolean }> = {
    produced: { ids: keysOf('produced'), rateOf: plain('produced'), signed: false },
    depotIn: { ids: keysOf('depotIn'), rateOf: plain('depotIn'), signed: false },
    deficit: {
      ids: keysOf('depotIn', 'depotOut'),
      rateOf: (id, t2) => {
        const a = rateBetween(marks, now, t2, 'depotIn', id);
        const b = rateBetween(marks, now, t2, 'depotOut', id);
        return { rate: a.rate - b.rate, span: Math.min(a.span, b.span) };
      },
      signed: true,
    },
  };

  for (const [id, t] of sk.tables) {
    // bảng đang thu gọn: giữ nguyên nội dung cũ (để hiệu ứng co lại thấy nội dung), không cập nhật
    if (t.fold.shut) continue;
    const spec = specs[id]!;
    const rows = spec.ids
          .map((it) => ({ id: it, a: spec.rateOf(it, now + NEXT), b: spec.rateOf(it, now + n) }))
          .filter((r) => Math.abs(r.a.rate) > 0.005 || Math.abs(r.b.rate) > 0.005)
          // thâm hụt: món thiếu nhiều nhất lên đầu; còn lại: nhiều nhất lên đầu
          .sort((x, y) => (spec.signed ? x.b.rate - y.b.rate : y.b.rate - x.b.rate));
    const partial = (r: Rate, want: number): boolean => r.span + 1e-6 < Math.min(want, MAX_SECONDS - now);
    const key = `${labelN}|` + rows.map((r) => `${r.id}:${fmt(r.a.rate, 1)}:${fmt(r.b.rate, 1)}:${partial(r.a, NEXT) ? 1 : 0}${partial(r.b, n) ? 1 : 0}`).join(',');
    if (key === t.key) continue;
    t.key = key;
    const content = t.fold.content;
    clear(content);
    if (rows.length === 0) {
      content.append(el('div', { class: 'empty' }, tr('Chưa có.')));
      continue;
    }
    const tb = el('div', { class: 'balance sim-bal' });
    tb.append(el('div', { class: 'balance-head' }, el('span', {}, tr('Vật tư')), el('span', {}, tr('30 phút tới')), el('span', {}, tr('{0} tới', labelN))));
    const cell = (r: Rate, want: number): HTMLElement => {
      const tone = !spec.signed ? '' : r.rate > 0.005 ? ' surplus' : r.rate < -0.005 ? ' short' : '';
      return el(
        'span',
        { class: `mono${tone}${partial(r, want) ? ' partial' : ''}`, title: r.span + 1e-6 < want ? tr('Mới tính được {0} của khoảng này', hhmmss(r.span)) : '' },
        `${spec.signed && r.rate > 0.005 ? '+' : ''}${fmt(r.rate, 1)}`,
      );
    };
    for (const r of rows)
      tb.append(
        el(
          'div',
          { class: 'balance-row' },
          el('span', { class: 'balance-name' }, itemChip(state, r.id), itemName(state.ds, r.id)),
          cell(r.a, NEXT),
          cell(r.b, n),
        ),
      );
    content.append(tb);
  }
}
