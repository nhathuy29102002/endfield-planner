import type { Dataset, RecipeDef } from './types';
import { isFilledContainer, itemGroup } from './dataset';

/**
 * **Thư viện công thức** (người dùng 2026-10-06, theo "Hồ Sơ Vật Phẩm" / "Chuỗi Sản Xuất" trong game): nguồn của từng vật
 * phẩm, công thức mặc định người dùng chọn, cây chuỗi sản xuất và biên dịch cây đó thành sơ đồ Modeler.
 *
 * Một vật phẩm có thể đến từ:
 *  - **khai thác** (`source`): tài nguyên tự nhiên — nước, axit (máy bơm), khí trơ / khí xiranite (máy tách khí), quặng
 *    (giàn khai thác). Đây là cách mặc định cho các món đó, như chuỗi trong game (*suy luận* máy cho từng món — dữ liệu
 *    không ghi mỏ nào đào ra món gì);
 *  - **công thức** (`recipe`) của một máy. Bỏ qua công thức **tháo lọ / bình** (nguyên liệu toàn là lọ / bình đã nạp) và
 *    công thức dùng lại chính món đó làm nguyên liệu.
 * Món không có cách nào ⇒ lá (sản phẩm thô không khai thác được, vd. cây hoang, Xiranite).
 */

/** Máy khai thác tài nguyên tự nhiên. */
export const EXTRACTION: Record<string, string> = {
  item_liquid_water: 'pump_1',
  item_liquid_acid: 'pump_2',
  item_gas_inert: 'gas_pump_1',
  item_gas_xiranite: 'gas_pump_1',
  item_originium_ore: 'miner_1',
  item_copper_ore: 'miner_2',
  item_iron_ore: 'miner_2',
  item_quartz_sand: 'miner_2',
};

/** Một cách có được vật phẩm. */
export type Way = { kind: 'source'; machineId: string } | { kind: 'recipe'; recipe: RecipeDef };
export const wayKey = (w: Way): string => (w.kind === 'source' ? `@src:${w.machineId}` : w.recipe.id);

/** Công thức tháo lọ / bình (lấy chất lỏng / khí ra) — không tính là nguồn thật. */
export const isUnpack = (ds: Dataset, r: RecipeDef): boolean =>
  r.ingredients.length > 0 && r.ingredients.every((s) => isFilledContainer(ds, s.itemId));

/**
 * Lò Mở Rộng chạy đúng các công thức của Lò Phản Ứng ⇒ thư viện công thức coi hai lò là một, chỉ dùng Lò Phản Ứng (người
 * dùng 2026-10-06, lần 2: không lặp công thức, không dùng Lò Mở Rộng vì logic phức tạp hơn nhiều).
 */
const SKIP_MACHINES = new Set(['mix_pool_2']);

/** Mọi công thức làm ra `item` (kể cả tháo lọ), giữ thứ tự dữ liệu. */
export function producers(ds: Dataset, item: string): RecipeDef[] {
  return [...ds.recipes.values()].filter((r) => !SKIP_MACHINES.has(r.machineId) && r.outcomes.some((o) => o.itemId === item));
}

/** Mọi công thức dùng `item` làm nguyên liệu. */
export function consumers(ds: Dataset, item: string): RecipeDef[] {
  return [...ds.recipes.values()].filter((r) => !SKIP_MACHINES.has(r.machineId) && r.ingredients.some((s) => s.itemId === item));
}

/** Các cách có được `item` cho chuỗi sản xuất: khai thác trước, rồi công thức thật. */
export function waysOf(ds: Dataset, item: string): Way[] {
  const out: Way[] = [];
  const src = EXTRACTION[item];
  if (src && ds.machines.has(src)) out.push({ kind: 'source', machineId: src });
  for (const r of producers(ds, item)) {
    if (isUnpack(ds, r) || r.ingredients.some((s) => s.itemId === item)) continue;
    out.push({ kind: 'recipe', recipe: r });
  }
  return out;
}

/** Sản phẩm thô (không làm ra được bằng công thức) — trong chuỗi vẽ trên nền "khai thác". Xiranite thì không. */
export const isRawItem = (ds: Dataset, item: string): boolean => !!EXTRACTION[item] || (itemGroup(ds, item) === 'raw' && item !== 'item_xiranite_powder');

// ------------------------------------------------------------------ công thức mặc định
const KEY = 'efp:recipe-defaults';
let cache: Record<string, string> | null = null;
function store(): Record<string, string> {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>;
  } catch {
    cache = {};
  }
  return cache;
}
/** Cách mặc định người dùng đã chọn cho `item` (khoá `wayKey`), nếu có. */
export const chosenWay = (item: string): string | undefined => store()[item];
export function setChosenWay(item: string, key: string): void {
  store()[item] = key;
  try {
    localStorage.setItem(KEY, JSON.stringify(store()));
  } catch {
    /* không lưu được thì thôi */
  }
}

/**
 * Độ dài chuỗi (số bước) để có `item` theo cách rẻ nhất — khai thác = 1, công thức = 1 + tổng của các nguyên liệu; món
 * không có cách nào = 1 (lá); vòng lặp = vô cùng. Ghi nhớ theo bộ dữ liệu.
 */
const costMemo = new WeakMap<Dataset, Map<string, number>>();
function costOf(ds: Dataset, item: string, path: Set<string>): number {
  let memo = costMemo.get(ds);
  if (!memo) costMemo.set(ds, (memo = new Map()));
  const hit = memo.get(item);
  if (hit !== undefined) return hit;
  if (path.has(item)) return Infinity;
  const ways = waysOf(ds, item);
  if (ways.length === 0) return 1;
  const next = new Set(path).add(item);
  const best = Math.min(...ways.map((w) => wayCost(ds, w, next)));
  // chỉ ghi nhớ kết quả không phụ thuộc đường đi (không chạm vòng)
  if (Number.isFinite(best)) memo.set(item, best);
  return best;
}
function wayCost(ds: Dataset, w: Way, path: Set<string>): number {
  if (w.kind === 'source') return 1;
  return 1 + w.recipe.ingredients.reduce((a, s) => a + costOf(ds, s.itemId, path), 0);
}

/**
 * Cách mặc định của `item`: người dùng đã chọn ⇒ cách đó; không thì khai thác nếu có, rồi công thức cho **chuỗi ngắn
 * nhất** (bằng nhau thì theo thứ tự dữ liệu).
 */
export function defaultWay(ds: Dataset, item: string, ways = waysOf(ds, item)): Way | null {
  const k = chosenWay(item);
  const picked = k && ways.find((w) => wayKey(w) === k);
  if (picked) return picked;
  if (ways.length <= 1) return ways[0] ?? null;
  const src = ways.find((w) => w.kind === 'source');
  if (src) return src;
  const path = new Set([item]);
  let best = ways[0]!;
  let bestCost = Infinity;
  for (const w of ways) {
    const c = wayCost(ds, w, path);
    if (c < bestCost) {
      best = w;
      bestCost = c;
    }
  }
  return best;
}

// ------------------------------------------------------------------ cây chuỗi sản xuất
export interface ChainNode {
  /** Khoá theo đường đi từ gốc (giữ trạng thái mở "Công thức khác" khi dựng lại). */
  key: string;
  item: string;
  /** Cách đang dùng; `null` = lá (thô không khai thác được, hoặc lặp vòng). */
  way: Way | null;
  /** Mọi cách có được món này (để hiện "Công thức khác"). */
  ways: Way[];
  /** Nguyên liệu của công thức đang dùng. */
  inputs: ChainNode[];
  /** Lá vì món đã xuất hiện phía trên trên cùng nhánh (vòng hạt giống ⇄ cây…). */
  loop?: boolean;
}

/** Cây chuỗi sản xuất của `item` theo công thức mặc định, từ thành phẩm ngược về nguyên liệu. */
export function buildChain(ds: Dataset, item: string, key = item, path: Set<string> = new Set()): ChainNode {
  const ways = waysOf(ds, item);
  if (path.has(item)) return { key, item, way: null, ways, inputs: [], loop: true };
  const way = defaultWay(ds, item, ways);
  const node: ChainNode = { key, item, way, ways, inputs: [] };
  if (way?.kind === 'recipe') {
    const next = new Set(path).add(item);
    node.inputs = way.recipe.ingredients.map((s) => buildChain(ds, s.itemId, `${key}/${s.itemId}`, next));
  }
  return node;
}
