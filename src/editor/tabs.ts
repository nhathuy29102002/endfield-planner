import type { Terrain } from '../grid/grid';
import { fromJson, toJson } from '../blueprint/serialize';
import { emptyBlueprint, type Blueprint } from '../model/types';
import type { AppState, MapDoc } from './state';
import { emptyModeler, type ModelerDoc } from '../modeler/doc';
import { tr } from '../i18n';

/**
 * **Thanh tab** kiểu Chrome ở mép dưới (người dùng 2026-09-29): nhiều tài liệu mở cùng lúc.
 *
 * - Tab **Map** = một bản vẽ lưới (canvas 2D) độc lập: bản vẽ, địa hình, hoàn tác, vị trí camera riêng.
 * - Tab **Modeler** = sơ đồ tính toán kiểu Satisfactory Modeler (màn hình riêng — đợt 2 trở đi).
 *
 * Chỉ **một** `AppState` cho mọi tab Map: chuyển tab = cất tài liệu đang mở vào bản ghi của tab cũ
 * (`exportDoc`) rồi nạp tài liệu của tab mới (`importDoc`). Mọi tab đang mở được tự lưu vào
 * `efp:tabs` (không kèm lịch sử hoàn tác) ⇒ mở lại trang thấy đủ các tab. Đóng tab có nội dung chưa
 * lưu vào thư viện ⇒ hỏi lại.
 */
export type TabKind = 'map' | 'modeler';

export { emptyModeler, type ModelerDoc };

export interface CameraState {
  x: number;
  z: number;
  cell: number;
  turns: 0 | 1 | 2 | 3;
}

/**
 * **Nhóm tab** (người dùng 2026-10-03): kéo một tab thả thẳng vào giữa một tab khác ⇒ hai tab thành một nhóm (một "tab
 * lớn" bọc ngoài, ô tên sát trái — `ui/tabbar.ts`). Các **map** trong một nhóm được **mô phỏng chung** (chung kho tổng,
 * chung điện — `simulation/world.ts`); tab Modeler ghép được vào nhóm nhưng không ảnh hưởng gì tới mô phỏng / điện.
 */
export interface TabGroup {
  id: string;
  name: string;
  color: string;
  /** Đang thu gọn (bấm ô tên nhóm). */
  collapsed?: boolean;
}

/** Màu nhóm như Chrome (xám, xanh, đỏ, vàng, lục, hồng, tím, lam). */
export const GROUP_COLORS = ['#8a96a3', '#4c8df6', '#e5534b', '#e2b93b', '#3fb950', '#e06cb0', '#a371f7', '#39c5cf'];

export interface TabRecord {
  id: string;
  kind: TabKind;
  title: string;
  /** Nhóm tab (chỉ tab Map). */
  group?: string;
  /** Dấu vân tay nội dung lúc lưu vào thư viện lần cuối (`null` = chưa lưu lần nào). */
  saved: string | null;
  map?: MapDoc & { camera?: CameraState };
  modeler?: ModelerDoc;
}

export const TABS_KEY = 'efp:tabs';

/** Dấu vân tay nội dung một map — so với `saved` để biết còn thay đổi chưa lưu. */
export const mapFingerprint = (bp: Blueprint, terrain: Terrain): string => JSON.stringify([bp.machines, bp.belts, terrain]);

/** Dấu vân tay sơ đồ Modeler (không tính vị trí nhìn). Chưa có nét vẽ ⇒ như cũ, để sơ đồ đã lưu không bị coi là đổi. */
export const modelerFingerprint = (m: ModelerDoc): string =>
  JSON.stringify(m.drawings?.length ? [m.nodes, m.edges, m.drawings] : [m.nodes, m.edges]);

/** Map có gì do người dùng làm không (công trình đặt sẵn của căn cứ không tính). */
export const mapHasContent = (bp: Blueprint, terrain: Terrain): boolean =>
  bp.machines.some((m) => !m.fixed) || bp.belts.length > 0 || Object.keys(terrain).length > 0;

const newTabId = (): string => `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

interface StoredTab {
  id: string;
  kind: TabKind;
  title: string;
  saved: string | null;
  /** Map: file bản vẽ (`toJson`); Modeler: sơ đồ. */
  map?: string;
  camera?: CameraState;
  modeler?: ModelerDoc;
  group?: string;
}
interface Stored {
  version: 1;
  active: string;
  tabs: StoredTab[];
  groups?: TabGroup[];
}

/** Đọc các tab đã lưu; hỏng / chưa có thì `null`. */
export function loadTabs(): { tabs: TabRecord[]; active: string; groups?: TabGroup[] } | null {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Stored;
    const tabs: TabRecord[] = [];
    for (const t of data.tabs ?? []) {
      if (t.kind === 'map' && t.map) {
        const plan = fromJson(t.map);
        tabs.push({ id: t.id, kind: 'map', title: t.title, saved: t.saved, group: t.group, map: { bp: plan.blueprint, terrain: plan.terrain, undo: [], redo: [], camera: t.camera } });
      } else if (t.kind === 'modeler') {
        tabs.push({ id: t.id, kind: 'modeler', title: t.title, saved: t.saved, group: t.group, modeler: t.modeler ?? emptyModeler() });
      }
    }
    if (tabs.length === 0) return null;
    // nhóm còn ít nhất hai tab mới giữ
    const groups = (data.groups ?? []).filter((g) => tabs.filter((t) => t.group === g.id).length >= 2);
    for (const t of tabs) if (t.group && !groups.some((g) => g.id === t.group)) delete t.group;
    return { tabs, active: tabs.some((t) => t.id === data.active) ? data.active : tabs[0]!.id, groups };
  } catch {
    return null;
  }
}

export function serializeTabs(tabs: TabRecord[], active: string, groups: TabGroup[] = []): string {
  const stored: Stored = {
    version: 1,
    active,
    groups,
    tabs: tabs.map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      saved: t.saved,
      map: t.map ? toJson(t.map.bp, t.map.terrain) : undefined,
      camera: t.map?.camera,
      modeler: t.modeler,
      group: t.group,
    })),
  };
  return JSON.stringify(stored);
}

export interface TabHooks {
  /** Đã chuyển sang tab này (main.ts đổi màn hình Map ⇄ Modeler, camera…). */
  onActivate(tab: TabRecord, first: boolean): void;
  /** Camera hiện tại của màn hình Map — để cất vào tab. */
  camera(): CameraState;
  /** Hỏi lại trước khi đóng tab chưa lưu. */
  confirm(text: string, ok: string): Promise<boolean>;
  /** Thanh tab cần vẽ lại. */
  changed(): void;
  /** Sắp rời tab đang mở (chuyển / đóng) — trước khi tài liệu của tab mới được nạp. */
  leaving?(tab: TabRecord): void;
  /** Nhóm tab vừa đổi (ghép, rời, bỏ nhóm, đóng tab trong nhóm). */
  groupsChanged?(): void;
}

export class TabManager {
  tabs: TabRecord[];
  activeId: string;
  groups: TabGroup[];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly state: AppState,
    private readonly hooks: TabHooks,
    initial: { tabs: TabRecord[]; active: string; groups?: TabGroup[] },
  ) {
    this.tabs = initial.tabs;
    this.activeId = initial.active;
    this.groups = initial.groups ?? [];
  }

  get active(): TabRecord {
    return this.tabs.find((t) => t.id === this.activeId) ?? this.tabs[0]!;
  }

  /** Nạp tab đang chọn vào màn hình — gọi một lần lúc khởi động. */
  start(): void {
    this.open(this.active, true);
  }

  /** Tab còn thay đổi chưa lưu vào thư viện? */
  dirty(t: TabRecord): boolean {
    if (t.kind === 'map') {
      const doc = t.id === this.activeId ? this.state.exportDoc() : t.map;
      if (!doc || !mapHasContent(doc.bp, doc.terrain)) return false;
      return t.saved !== mapFingerprint(doc.bp, doc.terrain);
    }
    const m = t.modeler;
    return !!m && (m.nodes.length > 0 || (m.drawings?.length ?? 0) > 0) && t.saved !== modelerFingerprint(m);
  }

  /** Chép tài liệu đang mở (map trong `AppState` + camera) vào bản ghi tab của nó. */
  private stash(): void {
    const t = this.active;
    if (t.kind === 'map') t.map = { ...this.state.exportDoc(), camera: this.hooks.camera() };
  }

  private open(t: TabRecord, first = false): void {
    if (t.kind === 'map' && t.map) this.state.importDoc(t.map, `Tab "${t.title}"`);
    else this.state.message = `Tab "${t.title}"`;
    this.hooks.onActivate(t, first);
    this.hooks.changed();
  }

  activate(id: string): void {
    if (id === this.activeId || !this.tabs.some((t) => t.id === id)) return;
    this.hooks.leaving?.(this.active);
    this.stash();
    this.activeId = id;
    this.open(this.active);
    this.persistSoon();
  }

  /** Tab trống mới (nút "+"), mở luôn. */
  newTab(kind: TabKind): TabRecord {
    const n = this.tabs.filter((t) => t.kind === kind).length + 1;
    const t: TabRecord =
      kind === 'map'
        ? { id: newTabId(), kind, title: `Map ${n}`, saved: null, map: { bp: emptyBlueprint(), terrain: {}, undo: [], redo: [] } }
        : { id: newTabId(), kind, title: `Modeler ${n}`, saved: null, modeler: emptyModeler() };
    this.hooks.leaving?.(this.active);
    this.stash();
    this.tabs.push(t);
    this.activeId = t.id;
    this.open(t);
    this.persistSoon();
    return t;
  }

  /** Đóng tab — còn thay đổi chưa lưu vào thư viện thì hỏi lại. Đóng tab cuối ⇒ mở một Map trống. */
  async close(id: string): Promise<boolean> {
    const t = this.tabs.find((x) => x.id === id);
    if (!t) return false;
    if (this.dirty(t)) {
      const ok = await this.hooks.confirm(
        tr('"{0}" có thay đổi chưa lưu vào thư viện (Ctrl+S). Đóng tab sẽ mất các thay đổi đó.', t.title),
        tr('Đóng không lưu'),
      );
      if (!ok) return false;
    }
    const at = this.tabs.indexOf(t);
    const wasActive = t.id === this.activeId;
    if (wasActive) this.hooks.leaving?.(t);
    const hadGroup = t.group;
    this.tabs.splice(at, 1);
    if (hadGroup) {
      this.dissolveSmall();
      this.hooks.groupsChanged?.();
    }
    if (this.tabs.length === 0) {
      const fresh: TabRecord = { id: newTabId(), kind: 'map', title: 'Map 1', saved: null, map: { bp: emptyBlueprint(), terrain: {}, undo: [], redo: [] } };
      this.tabs.push(fresh);
      this.activeId = fresh.id;
      this.open(fresh);
    } else if (wasActive) {
      this.activeId = this.tabs[Math.min(at, this.tabs.length - 1)]!.id;
      this.open(this.active);
    } else this.hooks.changed();
    this.persistSoon();
    return true;
  }

  /** Mở một sơ đồ Modeler đã lưu trong thư viện thành **tab mới** (nội dung = bản đã lưu, không "chưa lưu"). */
  openModeler(title: string, doc: ModelerDoc): TabRecord {
    const t: TabRecord = { id: newTabId(), kind: 'modeler', title, saved: modelerFingerprint(doc), modeler: doc };
    this.hooks.leaving?.(this.active);
    this.stash();
    this.tabs.push(t);
    this.activeId = t.id;
    this.open(t);
    this.persistSoon();
    return t;
  }

  /** Đổi tên tab (chuột phải vào tab — người dùng 2026-09-29). Tên rỗng ⇒ giữ tên cũ. */
  rename(id: string, title: string): void {
    const t = this.tabs.find((x) => x.id === id);
    const name = title.trim();
    if (!t || !name || name === t.title) return;
    t.title = name;
    this.hooks.changed();
    this.persistSoon();
  }

  /**
   * Đổi thứ tự tab (kéo thả). Sau khi đặt xuống: nằm lọt giữa hai tab cùng một nhóm ⇒ vào nhóm đó; rời hẳn khỏi các tab
   * cùng nhóm cũ ⇒ ra khỏi nhóm (như Chrome).
   */
  move(id: string, to: number): void {
    const from = this.tabs.findIndex((t) => t.id === id);
    if (from < 0) return;
    const [t] = this.tabs.splice(from, 1);
    const at = Math.max(0, Math.min(this.tabs.length, to));
    this.tabs.splice(at, 0, t!);
    const before = t!.group;
    const left = this.tabs[at - 1];
    const right = this.tabs[at + 1];
    if (t!.group && left?.group !== t!.group && right?.group !== t!.group) delete t!.group;
    if (!t!.group && left?.group && left.group === right?.group) t!.group = left.group;
    if (before !== t!.group) {
      this.dissolveSmall();
      this.hooks.groupsChanged?.();
    }
    this.hooks.changed();
    this.persistSoon();
  }

  groupOf(id: string): TabGroup | undefined {
    const g = this.tabs.find((t) => t.id === id)?.group;
    return g ? this.groups.find((x) => x.id === g) : undefined;
  }

  /** Các tab của nhóm `gid` (theo thứ tự trên thanh tab). */
  members(gid: string): TabRecord[] {
    return this.tabs.filter((t) => t.group === gid);
  }

  /**
   * Kéo tab `dragId` thả vào giữa tab `targetId` (người dùng 2026-10-03): tab đích đã có nhóm ⇒ vào nhóm đó; chưa ⇒ tạo
   * nhóm mới gồm hai tab. Map và Modeler đều được. Tab kéo được dời tới sát sau nhóm cho các tab cùng nhóm luôn liền nhau.
   */
  groupWith(dragId: string, targetId: string): boolean {
    const drag = this.tabs.find((t) => t.id === dragId);
    const target = this.tabs.find((t) => t.id === targetId);
    if (!drag || !target || drag === target) return false;
    if (drag.group && drag.group === target.group) return false;
    let gid = target.group;
    if (!gid) {
      const used = new Set(this.groups.map((g) => g.color));
      const color = GROUP_COLORS.find((c) => !used.has(c)) ?? GROUP_COLORS[this.groups.length % GROUP_COLORS.length]!;
      gid = `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      this.groups.push({ id: gid, name: '', color });
      target.group = gid;
    }
    drag.group = gid;
    // dời tab kéo tới ngay sau tab cuối của nhóm
    this.tabs.splice(this.tabs.indexOf(drag), 1);
    const lastIdx = this.tabs.reduce((a, t, i) => (t.group === gid ? i : a), -1);
    this.tabs.splice(lastIdx + 1, 0, drag);
    this.dissolveSmall();
    this.hooks.groupsChanged?.();
    this.hooks.changed();
    this.persistSoon();
    return true;
  }

  /**
   * Đặt tab `id` ngay trước tab `beforeId` (`null` = cuối thanh) và cho vào nhóm `group` (`null` = ngoài nhóm) — đúng như
   * phần xem trước lúc kéo (người dùng 2026-10-03: thả ra phải đúng chỗ đang hiện).
   */
  place(id: string, beforeId: string | null, group: string | null): void {
    const t = this.tabs.find((x) => x.id === id);
    if (!t || id === beforeId) return;
    const had = t.group;
    this.tabs.splice(this.tabs.indexOf(t), 1);
    const at = beforeId ? this.tabs.findIndex((x) => x.id === beforeId) : -1;
    this.tabs.splice(at < 0 ? this.tabs.length : at, 0, t);
    if (group) t.group = group;
    else delete t.group;
    if (had !== t.group) {
      this.dissolveSmall();
      this.hooks.groupsChanged?.();
    }
    this.hooks.changed();
    this.persistSoon();
  }

  /**
   * Dời **cả nhóm** (kéo ô tên nhóm — người dùng 2026-10-03): các tab của nhóm giữ thứ tự, chèn liền nhau ở vị trí `to`
   * trong danh sách tab đã bỏ các tab của nhóm.
   */
  moveGroup(gid: string, to: number): void {
    const members = this.tabs.filter((t) => t.group === gid);
    if (members.length === 0) return;
    const rest = this.tabs.filter((t) => t.group !== gid);
    rest.splice(Math.max(0, Math.min(rest.length, to)), 0, ...members);
    this.tabs = rest;
    this.hooks.changed();
    this.persistSoon();
  }

  /** Thu gọn / mở nhóm (bấm ô tên nhóm). */
  toggleGroup(gid: string): void {
    const g = this.groups.find((x) => x.id === gid);
    if (!g) return;
    g.collapsed = !g.collapsed;
    this.hooks.changed();
    this.persistSoon();
  }

  /** Bỏ nhóm (mọi tab trong nhóm thành tab lẻ). */
  ungroup(gid: string): void {
    for (const t of this.tabs) if (t.group === gid) delete t.group;
    this.groups = this.groups.filter((g) => g.id !== gid);
    this.hooks.groupsChanged?.();
    this.hooks.changed();
    this.persistSoon();
  }

  /** Tab rời nhóm (kéo ra chỗ trống cuối thanh tab). */
  leaveGroup(id: string): void {
    const t = this.tabs.find((x) => x.id === id);
    if (!t?.group) return;
    delete t.group;
    this.dissolveSmall();
    this.hooks.groupsChanged?.();
    this.hooks.changed();
    this.persistSoon();
  }

  renameGroup(gid: string, name: string): void {
    const g = this.groups.find((x) => x.id === gid);
    if (!g) return;
    g.name = name.trim().slice(0, 40);
    this.hooks.changed();
    this.persistSoon();
  }

  /** Nhóm còn dưới hai tab ⇒ bỏ. */
  private dissolveSmall(): void {
    for (const g of [...this.groups]) {
      const n = this.tabs.filter((t) => t.group === g.id);
      if (n.length >= 2) continue;
      for (const t of n) delete t.group;
      this.groups = this.groups.filter((x) => x.id !== g.id);
    }
  }

  /**
   * Tài liệu của tab Map đang mở vừa được thay / lưu từ bên ngoài (cửa sổ Bản vẽ): đổi tên tab, và
   * `saved` = nội dung hiện tại đã nằm trong thư viện (không còn "chưa lưu").
   */
  describeActive(info: { title?: string; saved?: boolean }): void {
    const t = this.active;
    if (info.title) t.title = info.title;
    if (info.saved && t.kind === 'map') t.saved = mapFingerprint(this.state.bp, this.state.terrain);
    if (info.saved && t.kind === 'modeler' && t.modeler) t.saved = modelerFingerprint(t.modeler);
    this.hooks.changed();
    this.persistSoon();
  }

  /** Map đang mở vừa đổi ⇒ hẹn lưu (gom các lần đổi liên tiếp). */
  persistSoon(delay = 400): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.persistNow();
    }, delay);
  }

  persistNow(): void {
    this.stash();
    try {
      localStorage.setItem(TABS_KEY, serializeTabs(this.tabs, this.activeId, this.groups));
    } catch {
      /* đầy bộ nhớ / bị chặn: không lưu được thì thôi */
    }
  }
}

/**
 * Tài liệu của tab Map đang mở vừa được thay / lưu từ nơi khác (cửa sổ Bản vẽ: tạo căn cứ, mở map,
 * lưu map) — báo cho thanh tab qua sự kiện, để các module đó không phụ thuộc vào thanh tab.
 */
export const DOC_EVENT = 'efp:doc';
export function announceDoc(info: { title?: string; saved?: boolean }): void {
  window.dispatchEvent(new CustomEvent(DOC_EVENT, { detail: info }));
}

/** Cửa sổ Bản vẽ muốn mở một sơ đồ Modeler đã lưu (`detail = { title, doc }`) ⇒ main.ts mở tab mới. */
export const OPEN_MODELER_EVENT = 'efp:open-modeler';
