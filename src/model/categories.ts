import type { MachineDef } from './types';

/**
 * Nhóm máy như thanh chọn nhanh của game (và EnKAD). Lấy thẳng từ `quickBarType` của bảng
 * dữ liệu game; tên nhóm dùng tên tiếng Anh của game (EnKAD: mã tên của nhóm `storage` là
 * "Depot Access", `source_machine` là "Resourcing"…). Van/cầu không có `quickBarType`,
 * trong game chúng nằm ở nhóm `logistic`.
 */
export const CATEGORY_ORDER = [
  'Resourcing',
  'Depot Access',
  'Logistic Unit',
  'Production I',
  'Production II',
  'Power',
  'Miscellaneous',
] as const;
export type Category = (typeof CATEGORY_ORDER)[number];

const BY_QUICKBAR: Record<string, Category> = {
  source_machine: 'Resourcing',
  storage: 'Depot Access',
  logistic: 'Logistic Unit',
  '': 'Logistic Unit',
  basic_machine: 'Production I',
  assemble_machine: 'Production II',
  electric_machine: 'Power',
  extra_machine: 'Miscellaneous',
};

/**
 * Icon của 6 nhóm chính — ảnh của game tải từ EnKAD (`workshopcrafttypeicon`, lớp `.category`), lưu
 * ở `public/img/category/`. Nhóm Miscellaneous **không** có icon (người dùng 2026-09-29).
 */
export const CATEGORY_ICON: Partial<Record<Category, string>> = {
  Resourcing: 'img/category/icon_source_new_machine.png',
  'Depot Access': 'img/category/icon_storage.png',
  'Logistic Unit': 'img/category/icon_logistic.png',
  'Production I': 'img/category/icon_basic_new_machine.png',
  'Production II': 'img/category/icon_assemble_new_machine.png',
  Power: 'img/category/icon_electric_machine.png',
};

/** Nhóm của máy; `null` = máy ẩn (không hiện ở bảng chọn). */
export function categoryOf(def: MachineDef): Category | null {
  if (def.quickBar === 'hidden') return null;
  return BY_QUICKBAR[def.quickBar] ?? 'Miscellaneous';
}

/** Dòng phụ ngắn dưới tên máy: `4x6 · 20MW`. */
export const machineMeta = (def: MachineDef): string =>
  `${def.size.w}x${def.size.d}${def.power > 0 ? ` · ${def.power}MW` : ''}`;
