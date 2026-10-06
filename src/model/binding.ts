import { kindOfItem } from './dataset';
import { activePorts, portKey, type Dataset, type MachineDef, type PortDir, type PortKind, type PortKey, type RecipeDef } from './types';

/**
 * Gán item vào từng cổng.
 *
 * Đây là chỗ xử lý đúng cái khác biệt giữa "máy khoá vị trí sản phẩm" và "máy bắt
 * người chơi chọn cổng ra". Không cần bảng ngoại lệ theo từng máy — chỉ một quy tắc:
 *
 * - số slot cùng loại **bằng** số item ⇒ gán theo thứ tự và khoá lại (`locked`);
 * - số slot **nhiều hơn** ⇒ người chơi chọn, nên lựa chọn đó buộc phải lưu trong
 *   bản vẽ vì không thể suy lại được.
 */
export type BindingMode = 'locked' | 'choose' | 'unused';

export interface BindingSlot {
  key: PortKey;
  dir: PortDir;
  kind: PortKind;
  index: number;
  itemId: string | null;
  mode: BindingMode;
  /** Các item hợp lệ mà người dùng được chọn cho slot này. */
  options: string[];
}

/**
 * Lò Phản Ứng / Lò Mở Rộng (`FluidReaction`): người chơi **chọn sản phẩm cho từng cổng ra**, cả
 * cổng băng lẫn cổng ống — các cổng nằm ở vị trí khác nhau (ống vàng / cam) và lò có nhiều
 * thành phẩm (người dùng chốt 2026-09-28). Không bao giờ khoá, chọn được cả khi lò chưa chạy
 * công thức nào (lựa chọn trong mọi sản phẩm của chế độ đang bật).
 */
export const choosesOutputs = (def: MachineDef): boolean => def.type === 'FluidReaction';

/**
 * Quả Cầu Phản Ứng Khí / Máy Tinh Chế: hai cổng ống ra **cố định theo thứ tự sản phẩm** (người dùng
 * chốt 2026-09-29) — sản phẩm thứ nhất của công thức luôn ra cửa **vàng** (cổng ra đầu), thứ hai
 * luôn ra cửa **cam**; không chọn được. Công thức một sản phẩm thì cửa cam không chở gì.
 */
export const ORDERED_OUTPUTS = new Set(['gas_reactor_1', 'liquid_purifier_1']);

/** Công thức của máy dùng được ở chế độ đang bật. */
export function recipesInMode(ds: Dataset, m: { mode?: 'A' | 'B' }, def: MachineDef): RecipeDef[] {
  const mode = m.mode ?? 'A';
  return (ds.recipesByMachine.get(def.id) ?? []).filter(
    (r) => !def.modeAffectsRecipes || r.mode === null || r.mode === mode,
  );
}

/**
 * Lựa chọn cho một cổng ra của lò phản ứng (đúng loại cổng): mọi **sản phẩm** và mọi
 * **nguyên liệu** của chế độ đang bật. Chọn một nguyên liệu ⇒ lò làm **bộ chuyển trung gian**:
 * món đó chảy vào rồi đi thẳng ra cổng này (người dùng chốt 2026-09-28) — xem `pass` trong solver.
 */
export function outputOptions(ds: Dataset, m: { mode?: 'A' | 'B' }, def: MachineDef, kind: PortKind): string[] {
  const out = new Set<string>();
  const recipes = recipesInMode(ds, m, def);
  for (const r of recipes) for (const o of r.outcomes) if (kindOfItem(ds, o.itemId) === kind) out.add(o.itemId);
  for (const r of recipes) for (const i of r.ingredients) if (kindOfItem(ds, i.itemId) === kind) out.add(i.itemId);
  return [...out];
}

/** Nguyên liệu (mọi loại) của chế độ đang bật. */
export function ingredientsInMode(ds: Dataset, m: { mode?: 'A' | 'B' }, def: MachineDef): Set<string> {
  const out = new Set<string>();
  for (const r of recipesInMode(ds, m, def)) for (const i of r.ingredients) out.add(i.itemId);
  return out;
}

const itemsFor = (ds: Dataset, stacks: { itemId: string }[], kind: PortKind): string[] =>
  stacks.filter((s) => kindOfItem(ds, s.itemId) === kind).map((s) => s.itemId);

/**
 * Tính bảng slot cho một máy + công thức, tôn trọng lựa chọn cũ của người dùng
 * ở những nơi còn hợp lệ.
 */
export function resolveSlots(
  ds: Dataset,
  def: MachineDef,
  recipe: RecipeDef | null,
  existing: Record<PortKey, string | null> = {},
  mode?: 'A' | 'B',
): BindingSlot[] {
  const slots: BindingSlot[] = [];

  for (const dir of ['in', 'out'] as const) {
    for (const kind of ['belt', 'pipe'] as const) {
      // chỉ cổng tồn tại ở chế độ đang bật (`modePorts`)
      const ports = activePorts(def, mode)
        .filter(
          (p) =>
            p.dir === dir &&
            p.kind === kind &&
            // cổng kích hoạt nạp khí để máy chạy, không phải nguyên liệu ⇒ không gán ở đây
            portKey(p.dir, p.index) !== def.activatorPort,
        )
        .sort((a, b) => a.index - b.index);
      if (ports.length === 0) continue;

      const wanted = recipe
        ? itemsFor(ds, dir === 'in' ? recipe.ingredients : recipe.outcomes, kind)
        : [];

      // Không có gì để chở qua nhóm cổng này.
      if (wanted.length === 0) {
        for (const p of ports)
          slots.push({
            key: portKey(dir, p.index),
            dir,
            kind,
            index: p.index,
            itemId: null,
            mode: 'unused',
            options: [],
          });
        continue;
      }

      // Cửa vàng / cam cố định theo thứ tự sản phẩm (`ORDERED_OUTPUTS`): cổng thứ i chở sản phẩm
      // thứ i, cổng thừa để trống.
      if (dir === 'out' && ORDERED_OUTPUTS.has(def.id)) {
        ports.forEach((p, i) => {
          const itemId = wanted[i] ?? null;
          slots.push({
            key: portKey(dir, p.index),
            dir,
            kind,
            index: p.index,
            itemId,
            mode: itemId ? 'locked' : 'unused',
            options: itemId ? [itemId] : [],
          });
        });
        continue;
      }

      // Vừa khít: máy tự khoá vị trí, người chơi không có gì để chọn — trừ Lò Phản Ứng / Lò Mở
      // Rộng: cổng ra của chúng nằm ở vị trí khác nhau nên người chơi luôn chọn (xem
      // `choosesOutputs`).
      if (wanted.length === ports.length && !(dir === 'out' && choosesOutputs(def))) {
        ports.forEach((p, i) =>
          slots.push({
            key: portKey(dir, p.index),
            dir,
            kind,
            index: p.index,
            itemId: wanted[i]!,
            mode: 'locked',
            options: [wanted[i]!],
          }),
        );
        continue;
      }

      // Máy **không** được chọn sản phẩm ra (mọi máy trừ lò phản ứng — lõi / cửa xả / máy dỡ kho
      // không đi qua đây): tự theo công thức, **mọi cổng ra là sản phẩm cuối** (người dùng chốt
      // 2026-09-28). Nhiều sản phẩm cùng loại cổng hơn một (chỉ gặp khi tích nhiều công thức)
      // thì chia lần lượt theo cổng.
      if (dir === 'out' && !choosesOutputs(def)) {
        ports.forEach((p, i) =>
          slots.push({
            key: portKey(dir, p.index),
            dir,
            kind,
            index: p.index,
            itemId: wanted[i % wanted.length]!,
            mode: 'locked',
            options: [wanted[i % wanted.length]!],
          }),
        );
        continue;
      }

      // Lò phản ứng, cổng **băng ra**: mọi cổng băng ra chở **chung một món** — món người chơi đã
      // chọn (cổng đầu tiên còn hợp lệ). Các băng chia nhau đẩy món đó (người dùng chốt 2026-09-28).
      // Luật đổi 2026-09-29: **không tự điền** — chưa chọn thì để trống (trước đây rơi về sản phẩm
      // rắn đầu tiên); sản phẩm cuối không có cổng ra thì lò kẹt, đúng luật §5.3.
      if (dir === 'out' && kind === 'belt') {
        const pick =
          ports.map((p) => existing[portKey(dir, p.index)]).find((v): v is string => !!v && wanted.includes(v)) ??
          null;
        for (const p of ports)
          slots.push({ key: portKey(dir, p.index), dir, kind, index: p.index, itemId: pick, mode: 'choose', options: wanted });
        continue;
      }

      // Lò phản ứng, cổng **ống ra** (vàng / cam): chỉ giữ đúng lựa chọn tay còn hợp lệ, **không**
      // tự điền món nào vào cổng trống (luật đổi 2026-09-29 — trước đây chọn công thức là lò tự
      // gán 2 chất lỏng vào 2 cổng).
      if (dir === 'out' && choosesOutputs(def)) {
        for (const p of ports) {
          const key = portKey(dir, p.index);
          const prev = existing[key];
          slots.push({ key, dir, kind, index: p.index, itemId: prev && wanted.includes(prev) ? prev : null, mode: 'choose', options: wanted });
        }
        continue;
      }

      // Còn lại: giữ lựa chọn cũ còn hợp lệ, món chưa có cổng nào thì điền lần lượt vào cổng
      // còn trống.
      const assigned = new Map<PortKey, string>();
      for (const p of ports) {
        const key = portKey(dir, p.index);
        const prev = existing[key];
        if (prev && wanted.includes(prev)) assigned.set(key, prev);
      }
      const taken = new Set(assigned.values());
      const remaining = wanted.filter((w) => !taken.has(w));
      for (const p of ports) {
        const key = portKey(dir, p.index);
        if (!assigned.has(key) && remaining.length > 0) assigned.set(key, remaining.shift()!);
      }
      for (const p of ports) {
        const key = portKey(dir, p.index);
        slots.push({
          key,
          dir,
          kind,
          index: p.index,
          itemId: assigned.get(key) ?? null,
          mode: 'choose',
          options: wanted,
        });
      }
    }
  }
  return slots;
}

/** Bảng tra `cổng → item` đã chốt, dùng cho solver và cho việc vẽ tuyến. */
export function effectiveBinding(
  ds: Dataset,
  def: MachineDef,
  recipe: RecipeDef | null,
  existing: Record<PortKey, string | null> = {},
  mode?: 'A' | 'B',
): Record<PortKey, string | null> {
  const out: Record<PortKey, string | null> = {};
  for (const s of resolveSlots(ds, def, recipe, existing, mode)) out[s.key] = s.itemId;
  return out;
}

/**
 * Các công thức đã **tích** trên một máy: công thức chính (`recipeId`) + các công thức tích
 * thêm (`notedRecipes`), không trùng, bỏ id lạ. Máy chạy song song mọi công thức trong số
 * này mà đủ đầu vào và đúng chế độ — xem solver.
 */
export function tickedRecipes(
  ds: Dataset,
  m: { recipeId: string | null; notedRecipes?: string[] },
): RecipeDef[] {
  const ids = [m.recipeId, ...(m.notedRecipes ?? [])].filter((x): x is string => !!x);
  return [...new Set(ids)].map((id) => ds.recipes.get(id)).filter((r): r is RecipeDef => !!r);
}

/**
 * Gộp nhiều công thức thành một "công thức" ảo để gán cổng: nguyên liệu = hợp mọi nguyên
 * liệu, sản phẩm = hợp mọi sản phẩm. Một công thức thì trả về chính nó.
 */
export function combineRecipes(list: RecipeDef[]): RecipeDef | null {
  if (list.length <= 1) return list[0] ?? null;
  const uniq = (stacks: { itemId: string; count: number }[]): { itemId: string; count: number }[] => {
    const seen = new Map<string, number>();
    for (const s of stacks) seen.set(s.itemId, (seen.get(s.itemId) ?? 0) + s.count);
    return [...seen].map(([itemId, count]) => ({ itemId, count }));
  };
  const first = list[0]!;
  const ingredients = uniq(list.flatMap((r) => r.ingredients));
  // sản phẩm trung gian (công thức khác trong máy dùng tiếp) xếp **cuối**: cổng ra trống được
  // điền cho sản phẩm cuối trước — trung gian thường dùng hết trong máy, không cần cổng
  const inner = new Set(ingredients.map((s) => s.itemId));
  const outcomes = uniq(list.flatMap((r) => r.outcomes));
  outcomes.sort((a, b) => Number(inner.has(a.itemId)) - Number(inner.has(b.itemId)));
  return {
    ...first,
    id: list.map((r) => r.id).join('+'),
    ingredients,
    outcomes,
    altOutcomes: [],
  };
}
