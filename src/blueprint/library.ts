import type { Terrain } from '../grid/grid';
import { footprintCells } from '../model/geometry';
import type { Blueprint, Dataset } from '../model/types';
import { selectionPieces, type Pieces, type Selection } from '../editor/group';
import { fromJson } from './serialize';
import type { ModelerDoc } from '../modeler/doc';
import { tr } from '../i18n';

/**
 * Thư viện bản vẽ đã lưu.
 *
 * - `map`    — **toàn bộ** bản vẽ (kèm địa hình). Đặt nó = thay cả map hiện tại.
 * - `module` — một **nhóm** vật thể đã chọn, dời về gốc (0,0). Đặt nó = preview theo con
 *   trỏ rồi bấm để đặt, như sao chép nhóm.
 * - `modeler` — một **sơ đồ Modeler** (Modeler đợt 4, người dùng 2026-09-29). Mở = một tab Modeler mới.
 *
 * Lưu trong `localStorage` của trình duyệt (mỗi trình duyệt một thư viện riêng); muốn
 * mang sang máy khác thì Xuất ra file rồi Nhập lại.
 */
export interface SavedBlueprint {
  id: string;
  name: string;
  /** Id vật tư làm biểu tượng; `null` = chưa chọn. */
  icon: string | null;
  kind: 'map' | 'module' | 'modeler';
  created: number;
  /** Ảnh xem trước, dataURL JPEG nhỏ. */
  preview: string;
  map?: { blueprint: Blueprint; terrain: Terrain };
  module?: Pieces;
  modeler?: ModelerDoc;
}

const KEY = 'efp:library';
export const LIBRARY_FORMAT = 'efp-library';

export function loadLibrary(): SavedBlueprint[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedBlueprint[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Ghi thư viện. Hết chỗ trong trình duyệt thì ném lỗi có lời giải thích. */
export function saveLibrary(list: SavedBlueprint[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    throw new Error(tr('Trình duyệt hết chỗ lưu — hãy Xuất bớt bản vẽ ra file rồi xoá khỏi thư viện'));
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LIBRARY_EVENT));
}
/** Thư viện vừa được ghi (bảng chọn máy đọc lại bản vẽ ghim). */
export const LIBRARY_EVENT = 'efp:library';
/** Bấm / kéo một bản vẽ ghim trên thanh đặt máy thu gọn: `detail` = id bản vẽ (`main.ts` ⇒ `useBlueprint`). */
export const USE_BLUEPRINT_EVENT = 'efp:use-blueprint';

/**
 * **Bản vẽ ghim lên thanh đặt máy thu gọn** (người dùng 2026-10-02): id các bản vẽ, theo thứ tự ghim. Mỗi trình
 * duyệt một danh sách; đổi xong phát `BP_PINS_EVENT` để bảng chọn máy vẽ lại.
 */
const PINS_KEY = 'efp:bp-pins';
export const BP_PINS_EVENT = 'efp:bp-pins';
export function loadBlueprintPins(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(PINS_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function setBlueprintPinned(id: string, on: boolean): void {
  const pins = loadBlueprintPins().filter((x) => x !== id);
  if (on) pins.push(id);
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(pins));
  } catch {
    /* không lưu được thì thôi */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(BP_PINS_EVENT));
}

export const newId = (): string => `bp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Tách nhóm đang chọn thành một module: chép sâu rồi dời sao cho ô nhỏ nhất của nhóm
 * nằm ở (0,0). Cặp ống ngầm trỏ ra ngoài nhóm thì bỏ (đầu kia không đi theo).
 */
export function moduleFromSelection(bp: Blueprint, ds: Dataset, sel: Selection): Pieces {
  const src = selectionPieces(bp, sel);
  const copy = JSON.parse(JSON.stringify(src)) as Pieces;
  let x0 = Infinity;
  let z0 = Infinity;
  for (const m of copy.machines) {
    const def = ds.machines.get(m.machineId);
    for (const c of def ? footprintCells(m, def) : [m]) {
      x0 = Math.min(x0, c.x);
      z0 = Math.min(z0, c.z);
    }
  }
  for (const t of copy.tiles) {
    x0 = Math.min(x0, t.x);
    z0 = Math.min(z0, t.z);
  }
  if (x0 === Infinity) return copy;
  const uids = new Set(copy.machines.map((m) => m.uid));
  for (const m of copy.machines) {
    m.x -= x0;
    m.z -= z0;
    if (m.pairTarget !== undefined && m.pairTarget !== null && !uids.has(m.pairTarget)) m.pairTarget = null;
  }
  for (const t of copy.tiles) {
    t.x -= x0;
    t.z -= z0;
  }
  return copy;
}

/** Hộp bao của một module (đã dời về gốc). */
export function piecesSize(ds: Dataset, p: Pieces): { w: number; d: number } {
  let w = 0;
  let d = 0;
  for (const m of p.machines) {
    const def = ds.machines.get(m.machineId);
    for (const c of def ? footprintCells(m, def) : [m]) {
      w = Math.max(w, c.x + 1);
      d = Math.max(d, c.z + 1);
    }
  }
  for (const t of p.tiles) {
    w = Math.max(w, t.x + 1);
    d = Math.max(d, t.z + 1);
  }
  return { w, d };
}

/**
 * Diện tích **thu gọn nhất** của một bản vẽ: hộp bao sát các máy và ô băng/ống bên
 * trong — không phải khung người dùng kéo, cũng không phải cả khu 70×70.
 */
export function savedSize(ds: Dataset, b: SavedBlueprint): { w: number; d: number } {
  if (b.module) return piecesSize(ds, b.module);
  const bp = b.map?.blueprint;
  if (!bp) return { w: 0, d: 0 };
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  const add = (x: number, z: number): void => {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  };
  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    for (const c of def ? footprintCells(m, def) : [m]) add(c.x, c.z);
  }
  for (const t of bp.belts) add(t.x, t.z);
  return x0 === Infinity ? { w: 0, d: 0 } : { w: x1 - x0 + 1, d: z1 - z0 + 1 };
}

/** Nội dung file xuất: một hoặc nhiều bản vẽ. */
export function exportLibrary(list: SavedBlueprint[]): string {
  return JSON.stringify({ format: LIBRARY_FORMAT, version: 1, blueprints: list }, null, 1);
}

/**
 * Đọc file nhập. Nhận file thư viện của ứng dụng này, hoặc file bản vẽ `.json` kiểu cũ
 * (nút "Lưu ra file" trước đây) — cái sau thành một bản vẽ toàn map. Mọi bản vẽ nhập vào
 * đều nhận `id` mới để không đè lên bản đang có.
 */
export function importFile(text: string, fileName: string): SavedBlueprint[] {
  const data = JSON.parse(text) as { format?: string; blueprints?: SavedBlueprint[] };
  if (data.format === LIBRARY_FORMAT && Array.isArray(data.blueprints)) {
    return data.blueprints
      .filter((b) => b && (b.kind === 'map' ? b.map : b.kind === 'modeler' ? b.modeler : b.module))
      .map((b) => ({ ...b, id: newId() }));
  }
  const plan = fromJson(text);
  return [
    {
      id: newId(),
      name: plan.blueprint.name || fileName.replace(/\.json$/i, ''),
      icon: null,
      kind: 'map',
      created: Date.now(),
      preview: '',
      map: { blueprint: plan.blueprint, terrain: plan.terrain },
    },
  ];
}
