import { kindOfPhase, type Dataset, type ItemDef, type MachineDef, type Phase, type PortKind, type RecipeDef } from './types';

import itemsJson from '../../data/items.json';
import machinesJson from '../../data/machines.json';
import recipesJson from '../../data/recipes.json';
import { localName, tr } from '../i18n';

/**
 * Gom ba file dữ liệu thành các Map tra cứu nhanh.
 *
 * Dữ liệu trong `data/` được sinh bởi `tools/extract-dataset.mjs`. Nguồn chuẩn là
 * bảng dữ liệu của client game; xem phần đầu script đó.
 */
export function loadDataset(): Dataset {
  // tên máy / vật tư theo ngôn ngữ đang chọn (đổi ngôn ngữ ⇒ tải lại trang ⇒ đọc lại ở đây)
  const machines = new Map<string, MachineDef>(
    (machinesJson.machines as unknown as MachineDef[]).map((m) => [m.id, { ...m, name: localName(m) }]),
  );
  const items = new Map<string, ItemDef>(
    (itemsJson.items as unknown as ItemDef[]).map((i) => [i.id, { ...i, name: localName(i) }]),
  );
  // Bảng game chia sản phẩm thành nhiều nhóm (`outcomes: [{group}, {group}]`). Mọi nhóm đều
  // được làm ra cùng lúc (vd. Dung Dịch Huyết Đồng + Bột Sắt → Huyết Đồng **và** Nước Thải) —
  // file dữ liệu cũ tách nhóm 2 trở đi sang `altOutcomes` và solver bỏ sót chúng. Gộp lại
  // ở đây; `altOutcomes` giữ nguyên chỉ để tra cứu.
  const recipes = new Map<string, RecipeDef>(
    (recipesJson.recipes as unknown as RecipeDef[]).map((raw) => {
      const outcomes = [...raw.outcomes];
      for (const s of raw.altOutcomes.flat()) if (!outcomes.some((o) => o.itemId === s.itemId)) outcomes.push(s);
      return [raw.id, { ...raw, outcomes }];
    }),
  );

  // Dữ liệu ghi nhầm thể: "Khí Xiranite-Đồng Nguyên Mẫu" là **khí** (người dùng 2026-10-02 thấy máy bơm chất lỏng
  // lấy được nó)
  const misphased = items.get('item_activity_copper_poly_gas');
  if (misphased && misphased.phase !== 'gas') items.set(misphased.id, { ...misphased, phase: 'gas' });

  // Bình / lọ **đã nạp** (người dùng 2026-09-29): game cho mọi bình đã nạp dùng chung icon và tên của vỏ
  // bình ⇒ không biết bình nào đựng gì. Ghép lại theo công thức của Máy Chiết Rót (nguyên liệu rắn = vỏ,
  // nguyên liệu lỏng/khí = thứ được nạp): tên "Bình Chứa Đồng (Khí Trơ)", icon = vỏ + khí/lỏng ở góc
  // (`public/img/itemicon/filled/`, tạo bằng `tools/make-filled-icons.py`). Vỏ rỗng giữ tên gốc (người dùng 2026-09-30: không cần "(Rỗng)").
  for (const r of recipes.values()) {
    if (r.machineId !== 'filling_powder_mc_1' || r.outcomes.length !== 1) continue;
    const solid = r.ingredients.filter((s) => items.get(s.itemId)?.phase === 'solid');
    const fluid = r.ingredients.filter((s) => items.get(s.itemId)?.phase !== 'solid' && items.has(s.itemId));
    const product = items.get(r.outcomes[0]!.itemId);
    const box = solid.length === 1 ? items.get(solid[0]!.itemId) : undefined;
    const filler = fluid.length === 1 ? items.get(fluid[0]!.itemId) : undefined;
    if (!product || !box || !filler) continue;
    const nameVi = `${box.nameVi ?? box.name} (${filler.nameVi ?? filler.name})`;
    const nameEn = box.nameEn && filler.nameEn ? `${box.nameEn} (${filler.nameEn})` : product.nameEn;
    items.set(product.id, {
      ...product,
      name: localName({ name: `${box.name} (${filler.name})`, nameVi, nameEn }),
      nameVi,
      nameEn,
      icon: `filled/${product.id}`,
    });
  }

  // Máy Gieo Trồng có **2 chế độ**: thường và nước (người dùng chốt 2026-09-29). Bảng dữ liệu
  // trích từ EnKAD không ghi chế độ cho máy này, nên bổ sung ở đây (sửa file dữ liệu thì lần trích
  // lại sẽ mất): công thức cần Nước Sạch thuộc chế độ nước, còn lại thuộc chế độ thường.
  const planter = machines.get('planter_1');
  if (planter && !planter.modes) {
    machines.set('planter_1', {
      ...planter,
      modes: [
        { id: 'A', label: 'Normal' },
        { id: 'B', label: 'Water' },
      ],
      modeAffectsRecipes: true,
    });
    for (const r of recipes.values())
      if (r.machineId === 'planter_1' && r.mode === null)
        recipes.set(r.id, { ...r, mode: r.ingredients.some((i) => i.itemId === 'item_liquid_water') ? 'B' : 'A' });
  }

  // Nhãn chế độ tiếng Việt cho **mọi** máy (người dùng 2026-09-29: "để tiếng Việt, tiếng Anh sẽ xây
  // dựng sau"); nhãn gốc của game giữ ở `labelEn`.
  for (const [id, def] of machines) {
    if (!def.modes) continue;
    machines.set(id, {
      ...def,
      modes: def.modes.map((m) => ({ ...m, labelEn: m.labelEn ?? m.label, label: modeLabel(m.labelEn ?? m.label) })),
    });
  }

  // Cổng mở theo chế độ — xem `MODE_PORTS`.
  for (const [id, table] of Object.entries(MODE_PORTS)) {
    const def = machines.get(id);
    if (def && !def.modePorts) machines.set(id, { ...def, modePorts: table });
  }

  const recipesByMachine = new Map<string, RecipeDef[]>();
  for (const r of recipes.values()) {
    const list = recipesByMachine.get(r.machineId);
    if (list) list.push(r);
    else recipesByMachine.set(r.machineId, [r]);
  }

  return { machines, recipes, items, recipesByMachine };
}

/**
 * Nhãn chế độ: tiếng Anh của game → nhãn hiển thị theo ngôn ngữ đang chọn (gốc tiếng Việt). Là hàm (không phải
 * bảng hằng) để `tr` chạy lúc nạp dữ liệu, không phải lúc nạp module.
 */
const modeLabel = (en: string): string => modeLabels()[en] ?? en;
const modeLabels = (): Record<string, string> => ({
  Normal: tr('Bình thường'),
  Water: tr('Nước'),
  Gas: tr('Khí'),
  Liquid: tr('Lỏng'),
  'Gas & Liquid': tr('Khí & Lỏng'),
  'Fluid & Gas': tr('Lỏng & Khí'),
  Gasify: tr('Khí hóa'),
  Fluidify: tr('Lỏng hóa'),
  Solidify: tr('Rắn hóa'),
  'Allow clog': tr('Cho phép tắc'),
  'Clog prevention': tr('Chống tắc'),
  'Depot transfer': tr('Chuyển kho tổng'),
  'Storage mode': tr('Lưu trữ'),
  'Low purity': tr('Tinh khiết thấp'),
  'High purity': tr('Tinh khiết cao'),
});

/**
 * Máy **đổi bộ cổng theo chế độ**: ở mỗi chế độ chỉ các cổng liệt kê ở đây tồn tại (chiều nào không
 * ghi thì giữ nguyên mọi cổng của chiều đó). Bảng dữ liệu gộp cổng của mọi chế độ vào một danh sách.
 *  - Máy Đúc, Lò Tinh Luyện, Máy Tinh Chế, Máy Chuyển Hóa Khí Rắn: chép từ EnKAD
 *    (`Building.modePortIndices`).
 *  - Máy Gieo Trồng: người dùng 2026-09-29 — chế độ thường không có cổng ống.
 *  - Máy Chuyển Hóa Khí Lỏng: chưa có nguồn nào ⇒ chưa đổi (mọi cổng ở cả hai chế độ).
 */
export const MODE_PORTS: Record<string, NonNullable<MachineDef['modePorts']>> = {
  liquid_purifier_1: { A: { in: [0, 1] }, B: { in: [2, 3, 4, 5, 6, 7] } },
  shaper_1: { A: { in: [0, 1, 2] }, B: { in: [0, 1, 2, 3] } },
  furnance_1: { A: { in: [0, 1, 2], out: [0, 1, 2] } },
  transmuter_2: { A: { in: [2, 3, 4], out: [0, 1] }, B: { in: [0, 1, 2], out: [2, 3] } },
  planter_1: { A: { in: [0, 1, 2, 3, 4] } },
};

/** Tên hiển thị của item; id lạ thì trả về chính id để còn debug được. */
export function itemName(ds: Dataset, id: string): string {
  return ds.items.get(id)?.name ?? id;
}

export const phaseOf = (ds: Dataset, id: string): Phase => ds.items.get(id)?.phase ?? 'solid';

/** Băng chở vật rắn; lỏng và khí đều phải đi ống. */
export const kindOfItem = (ds: Dataset, id: string): PortKind => kindOfPhase(phaseOf(ds, id));

export const PHASE_LABEL: Record<Phase, string> = {
  solid: tr('rắn'),
  liquid: tr('lỏng'),
  gas: tr('khí'),
};

/** Chỉ những máy đáng hiện trong bảng chọn. */
/** Lọ / bình **đã nạp** khí hoặc chất lỏng (icon ghép `filled/…`) — xếp vào nhóm riêng cuối bảng chọn (2026-10-02). */
export const isFilledContainer = (ds: Dataset, itemId: string): boolean => !!ds.items.get(itemId)?.icon.startsWith('filled/');

/**
 * Nhóm vật phẩm trong bảng chọn (người dùng 2026-10-02), theo đúng thứ tự: **Sản phẩm thô** (không công thức nào làm
 * ra — quặng, nước…), **Sản phẩm khu phức hợp** (máy làm ra), **Cây trồng** (cây, hạt giống — trừ các loại bột), rồi
 * **Bình chứa khí/lỏng** (lọ / bình đã nạp).
 */
export const ITEM_GROUPS = [
  // bảng chọn của ống dẫn / cửa xả đầu ra: chất lỏng và khí tách riêng (người dùng 2026-10-02)
  { key: 'liquid', title: tr('Chất lỏng') },
  { key: 'gas', title: tr('Khí') },
  { key: 'raw', title: tr('Sản phẩm thô') },
  { key: 'product', title: tr('Sản phẩm khu phức hợp') },
  { key: 'plant', title: tr('Cây trồng') },
  { key: 'container', title: tr('Bình chứa khí/lỏng') },
] as const;
export type ItemGroup = (typeof ITEM_GROUPS)[number]['key'];
const madeCache = new WeakMap<Dataset, Set<string>>();
/** Xếp tay theo người dùng (2026-10-02): Phân Đà Thú, Giàu Dinh Dưỡng ⇒ Cây trồng; Xiranite ⇒ Sản phẩm thô. */
const GROUP_OVERRIDE: Record<string, ItemGroup> = {
  item_muck_feces_1: 'plant',
  item_muck_xiranite_1: 'plant',
  item_xiranite_powder: 'raw',
};
export function itemGroup(ds: Dataset, itemId: string): ItemGroup {
  const fixed = GROUP_OVERRIDE[itemId];
  if (fixed) return fixed;
  if (isFilledContainer(ds, itemId)) return 'container';
  const phase = ds.items.get(itemId)?.phase;
  if (phase === 'liquid' || phase === 'gas') return phase;
  if (itemId.startsWith('item_plant_') && !itemId.includes('powder')) return 'plant';
  let made = madeCache.get(ds);
  if (!made) {
    made = new Set([...ds.recipes.values()].flatMap((r) => r.outcomes.map((o) => o.itemId)));
    madeCache.set(ds, made);
  }
  return made.has(itemId) ? 'product' : 'raw';
}
/** Chia danh sách vật phẩm theo nhóm (giữ thứ tự sẵn có trong mỗi nhóm); bỏ nhóm rỗng. */
export function groupItems(ds: Dataset, ids: string[]): { title: string; ids: string[] }[] {
  return ITEM_GROUPS.map((g) => ({ title: g.title, ids: ids.filter((id) => itemGroup(ds, id) === g.key) })).filter((g) => g.ids.length > 0);
}

export function placeableMachines(ds: Dataset): MachineDef[] {
  const skip = new Set(['Battle', 'Decorate', 'Sign', 'Depot']);
  return [...ds.machines.values()]
    .filter((m) => !skip.has(m.type))
    .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
}
