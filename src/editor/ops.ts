import { choosesOutputs, combineRecipes, effectiveBinding, outputOptions, resolveSlots, tickedRecipes } from '../model/binding';
import { footprintCells, worldPorts, type WorldPort } from '../model/geometry';
import { beltAt } from '../model/network';
import { roleOf, DEFAULT_SOURCE_RATE, UNIQUE_MACHINES } from '../model/roles';
import type {
  Blueprint,
  Cell,
  Dataset,
  Facing,
  Layer,
  MachineDef,
  PlacedMachine,
  PortDir,
  PortKey,
  PortKind,
  RecipeDef,
} from '../model/types';
import { isValley } from '../model/types';
import { Grid, envZonesOf, validatePlacement, type Terrain } from '../grid/grid';
import { tr } from '../i18n';

/** Mọi thao tác sửa bản vẽ đi qua đây, để phần UI không tự ý phá vỡ bất biến. */
export interface EditResult {
  ok: boolean;
  reason?: string;
  uid?: number;
}

const ROTS: Facing[] = [0, 90, 180, 270];

export function machineAt(bp: Blueprint, ds: Dataset, cell: Cell): PlacedMachine | undefined {
  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    if (!def) continue;
    if (footprintCells(m, def).some((c) => c.x === cell.x && c.z === cell.z)) return m;
  }
  return undefined;
}

export function allPorts(bp: Blueprint, ds: Dataset): WorldPort[] {
  const out: WorldPort[] = [];
  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    if (def) out.push(...worldPorts(m, def));
  }
  return out;
}

/** Cổng nằm ở ô `cell` trên layer `layer`, nếu có. */
export function portAt(
  bp: Blueprint,
  ds: Dataset,
  cell: Cell,
  layer?: Layer,
): WorldPort | undefined {
  return allPorts(bp, ds).find(
    (p) => p.cell.x === cell.x && p.cell.z === cell.z && (layer === undefined || p.layer === layer),
  );
}

/**
 * Chọn giúp cổng khi người dùng bấm vào **thân máy** thay vì đúng một ô cổng.
 *
 * Bắt người dùng nhắm trúng một ô 1×1 trên lưới đang thu nhỏ là không dùng được. Bấm
 * đâu trên máy cũng được, hàm này chọn cổng hợp lý nhất:
 *  1. đúng chiều và đúng loại (băng ↔ ống);
 *  2. cổng vào đã có tuyến khác thì loại — mỗi cổng vào chỉ nhận một tuyến;
 *  3. ưu tiên cổng đang chở đúng vật tư cần, rồi tới cổng có gán vật tư;
 *  4. cổng kích hoạt để cuối, vì nó nạp khí chứ không phải nguyên liệu — trừ khi
 *     vật tư cần nối đúng là thứ nó nhận;
 *  5. hoà nhau thì lấy cổng gần chỗ bấm nhất.
 */
export function pickPort(
  bp: Blueprint,
  ds: Dataset,
  uid: number,
  dir: PortDir,
  kind: PortKind,
  opts: { near?: Cell; itemId?: string | null } = {},
): WorldPort | undefined {
  const m = bp.machines.find((v) => v.uid === uid);
  const def = m ? ds.machines.get(m.machineId) : undefined;
  if (!m || !def) return undefined;

  // cổng đã có băng/ống chạm vào ô nối của nó thì coi như đã dùng
  const taken = (p: WorldPort): boolean =>
    !p.virtual && bp.belts.some((t) => t.kind === p.kind && t.x === p.attach.x && t.z === p.attach.z);
  const candidates = worldPorts(m, def).filter(
    (p) => p.dir === dir && p.kind === kind && !taken(p),
  );
  if (candidates.length === 0) return undefined;

  const near = opts.near;
  const score = (p: WorldPort): number => {
    const bound = m.binding[p.key] ?? null;
    let s = 0;
    if (opts.itemId && bound === opts.itemId) s -= 100;
    else if (bound) s -= 40;
    if (p.key === def.activatorPort) s += opts.itemId && !bound ? 10 : 60;
    if (p.virtual) s += 5;
    if (near) s += Math.abs(p.cell.x - near.x) + Math.abs(p.cell.z - near.z);
    return s;
  };
  return [...candidates].sort((a, b) => score(a) - score(b))[0];
}

/**
 * Van/cầu 1×1 đặt **lên** một ô băng/ống (thẳng **hoặc góc**): được, nếu nó có cổng vào nhận
 * đúng hướng hàng đang chảy tới (`in` của ô) và cổng ra đẩy tiếp đúng hướng ô đó đang đẩy
 * (`out`). Van tách/gộp đổi hướng được nên đặt được lên ô góc; cầu thì không rẽ (mỗi trục một
 * kênh) nên chỉ đặt lên ô thẳng. Khi đó ô băng/ống bị thay bằng van — hàng phía trước chảy vào
 * van, van đẩy tiếp ra phía sau.
 *
 * Trả về chỉ số ô sẽ bị thay (`replace`), hoặc `wrongWay` nếu có ô cùng loại ở đó nhưng van
 * quay sai chiều (để báo lý do cho rõ).
 */
export function inlineTile(
  bp: Blueprint,
  ds: Dataset,
  def: MachineDef,
  x: number,
  z: number,
  rot: Facing,
): { replace?: number; wrongWay?: boolean } {
  if (!def.router || def.size.w * def.size.d !== 1 || def.ports.length === 0) return {};
  const kind = def.ports[0]!.kind;
  if (def.ports.some((p) => p.kind !== kind)) return {};
  const hit = beltAt(bp, kind, { x, z });
  if (!hit) return {};
  const t = hit.tile;
  const bridge = def.type === 'LogConnector' || def.type === 'LogPipeConnector';
  if (bridge && t.in !== t.out) return { wrongWay: true };
  const probe: PlacedMachine = { uid: -1, machineId: def.id, x, z, rot, recipeId: null, binding: {}, count: 1 };
  const ports = worldPorts(probe, def);
  const ok = ports.some((p) => p.dir === 'in' && p.flow === t.in) && ports.some((p) => p.dir === 'out' && p.flow === t.out);
  return ok ? { replace: hit.index } : { wrongWay: true };
}

/**
 * Các hướng quay mà van/cầu 1×1 khớp được với ô băng/ống ở `(x, z)` — để preview **tự xoay**
 * cho khớp khi rê lên tuyến, và R chỉ đổi giữa các hướng khớp. Rỗng = không có ô hợp lệ ở đó.
 */
export function inlineRotations(bp: Blueprint, ds: Dataset, def: MachineDef, x: number, z: number): Facing[] {
  return ROTS.filter((rot) => inlineTile(bp, ds, def, x, z, rot).replace !== undefined);
}

/**
 * Lưới để kiểm tra chỗ đặt, đã bỏ ô băng/ống mà van sẽ thay (nếu có). Dùng chung cho đặt
 * thật và preview, để preview xanh thì bấm là đặt được.
 */
export function placementGrid(
  bp: Blueprint,
  ds: Dataset,
  def: MachineDef,
  x: number,
  z: number,
  rot: Facing,
): { grid: Grid; replace?: number; wrongWay?: boolean } {
  const inline = inlineTile(bp, ds, def, x, z, rot);
  const base = inline.replace === undefined ? bp : { ...bp, belts: bp.belts.filter((_, i) => i !== inline.replace) };
  return { grid: Grid.fromBlueprint(base, ds), ...inline };
}

const WRONG_WAY = tr('Van/cầu phải đặt đúng chiều dòng chảy của tuyến (cầu chỉ đặt lên ô thẳng)');

export function addMachine(
  bp: Blueprint,
  ds: Dataset,
  terrain: Terrain,
  machineId: string,
  x: number,
  z: number,
  rot: Facing,
): EditResult {
  const def = ds.machines.get(machineId);
  if (!def) return { ok: false, reason: tr('Không biết máy "{0}"', machineId) };
  if (UNIQUE_MACHINES.has(machineId) && bp.machines.some((v) => v.machineId === machineId))
    return { ok: false, reason: tr('{0} chỉ có một trên cả map', def.name) };
  // Valley IV: kho tổng là dải đặt sẵn ở rìa căn cứ — không tự đặt tổng tuyến (người dùng 2026-09-29)
  if (isValley(bp.base?.region) && roleOf(def) === 'bus')
    return { ok: false, reason: tr('Valley IV không đặt được tổng tuyến kho hàng — kho tổng là dải đặt sẵn ở rìa căn cứ') };

  const { grid, replace, wrongWay } = placementGrid(bp, ds, def, x, z, rot);
  const check = validatePlacement(grid, terrain, def, x, z, rot, undefined, envZonesOf(bp, ds));
  if (!check.ok) return { ok: false, reason: wrongWay ? WRONG_WAY : check.reason };
  if (replace !== undefined) bp.belts = bp.belts.filter((_, i) => i !== replace);

  const uid = bp.nextUid++;
  const placed: PlacedMachine = {
    uid,
    machineId,
    x,
    z,
    rot,
    recipeId: null,
    binding: {},
    count: 1,
  };

  // Máy chế biến đặt xuống **không** tích sẵn công thức nào (người dùng chốt 2026-09-28):
  // máy tự chạy công thức ứng với nguyên liệu chảy vào, như trong game — xem solver.
  // Máy nguồn thì khai báo sẵn để tính được ngay.
  const role = roleOf(def);
  if (role === 'source') {
    placed.source = { itemId: '', perMinute: DEFAULT_SOURCE_RATE };
  } else if (role === 'depotOut' || role === 'depotIn') {
    placed.depotItem = null;
  } else if (role === 'udpipeIn' || role === 'udpipeOut') {
    placed.pairTarget = null;
  }
  if (def.modes) placed.mode = 'A';

  bp.machines.push(placed);
  return { ok: true, uid };
}

/**
 * Xoá máy. Băng chuyền và ống **không** bị xoá theo — chúng là công trình riêng trên
 * lưới, đúng như trong game; đầu băng bỏ trống thì bảng tổng hợp sẽ báo băng cụt.
 */
export function removeMachine(bp: Blueprint, uid: number): void {
  // công trình đặt sẵn của căn cứ không xoá được
  if (bp.machines.some((m) => m.uid === uid && m.fixed)) return;
  bp.machines = bp.machines.filter((m) => m.uid !== uid);
  // cặp ống ngầm cũng phải gỡ, nếu không đầu còn lại trỏ vào hư không
  for (const m of bp.machines) if (m.pairTarget === uid) m.pairTarget = null;
}

export function moveMachine(
  bp: Blueprint,
  ds: Dataset,
  terrain: Terrain,
  uid: number,
  x: number,
  z: number,
  rot?: Facing,
): EditResult {
  const m = bp.machines.find((v) => v.uid === uid);
  if (!m) return { ok: false, reason: tr('Không tìm thấy máy') };
  const def = ds.machines.get(m.machineId);
  if (!def) return { ok: false, reason: tr('Không biết máy') };

  if (m.fixed) return { ok: false, reason: tr('Công trình đặt sẵn của căn cứ — không di chuyển được') };
  const nextRot = rot ?? m.rot;
  const { grid, replace, wrongWay } = placementGrid(bp, ds, def, x, z, nextRot);
  const check = validatePlacement(grid, terrain, def, x, z, nextRot, uid, envZonesOf(bp, ds));
  if (!check.ok) return { ok: false, reason: wrongWay ? WRONG_WAY : check.reason };
  if (replace !== undefined) bp.belts = bp.belts.filter((_, i) => i !== replace);

  m.x = x;
  m.z = z;
  m.rot = nextRot;
  return { ok: true, uid };
}

export function rotateMachine(
  bp: Blueprint,
  ds: Dataset,
  terrain: Terrain,
  uid: number,
): EditResult {
  const m = bp.machines.find((v) => v.uid === uid);
  if (!m) return { ok: false, reason: tr('Không tìm thấy máy') };
  if (m.fixed) return { ok: false, reason: tr('Công trình đặt sẵn của căn cứ — không quay được') };
  const next = ROTS[(ROTS.indexOf(m.rot) + 1) % 4]!;
  return moveMachine(bp, ds, terrain, uid, m.x, m.z, next);
}

/**
 * Đổi công thức và gán lại cổng. Băng đã đặt giữ nguyên — nếu vật tư ở hai đầu không
 * còn khớp thì bảng tổng hợp báo, chứ không tự xoá công trình của người dùng.
 */
export function setRecipe(bp: Blueprint, ds: Dataset, uid: number, recipeId: string | null): void {
  const m = bp.machines.find((v) => v.uid === uid);
  if (!m) return;
  const def = ds.machines.get(m.machineId);
  if (!def) return;

  const recipe = recipeId ? (ds.recipes.get(recipeId) ?? null) : null;
  m.recipeId = recipe?.id ?? null;
  // công thức này lên làm công thức chính; bỏ nó khỏi danh sách tích thêm cho khỏi trùng
  if (m.notedRecipes && recipe) {
    m.notedRecipes = m.notedRecipes.filter((id) => id !== recipe.id);
    if (m.notedRecipes.length === 0) delete m.notedRecipes;
  }
  // Lò Phản Ứng / Lò Mở Rộng: chọn công thức **không** đụng tới cổng ra — mọi cổng ra do người
  // chơi chọn tay (người dùng chốt 2026-09-29). Máy khác: cổng ra tự theo công thức.
  if (!choosesOutputs(def)) m.binding = effectiveBinding(ds, def, combineRecipes(tickedRecipes(ds, m)), {}, m.mode);
  // Chọn công thức thì bật luôn chế độ chạy được nó — trong game phải đổi chế độ trước,
  // ở đây làm ngược lại cho đỡ một bước mà kết quả vẫn đúng.
  if (recipe?.mode && def.modes?.some((x) => x.id === recipe.mode)) m.mode = recipe.mode;
}

/**
 * Gán tay item cho một cổng (chỉ có tác dụng với slot ở chế độ `choose`).
 *
 * - **Cổng băng ra**: mọi cổng băng ra của một máy **luôn chở chung một món** — chọn (hay bỏ
 *   trống) một cổng thì mọi cổng băng ra đổi theo; các băng chia nhau đẩy cùng món đó (người
 *   dùng chốt 2026-09-28). Không có cách chọn riêng từng cổng băng (trừ hai lõi, xem
 *   `setOutletItem`).
 * - **Cổng ống ra**: độc lập (vàng / cam) — mỗi chất chỉ qua một đầu: chọn chất đang ở cổng ống
 *   kia thì chất đó **chuyển** sang cổng này.
 *
 * `recipes` = mọi công thức máy đang chạy (tích tay + tự chạy, lấy từ kết quả giải); không
 * truyền thì dùng các công thức đã tích.
 */
export function setBinding(
  bp: Blueprint,
  ds: Dataset,
  uid: number,
  key: PortKey,
  itemId: string | null,
  opts: { recipes?: RecipeDef[] } = {},
): EditResult {
  const m = bp.machines.find((v) => v.uid === uid);
  if (!m) return { ok: false, reason: tr('Không tìm thấy máy') };
  const def = ds.machines.get(m.machineId);
  if (!def) return { ok: false, reason: tr('Không biết máy') };

  // Lò Phản Ứng / Lò Mở Rộng: chọn cho **mọi** cổng ra (băng lẫn ống), trong mọi sản phẩm của
  // chế độ đang bật — kể cả khi lò chưa chạy gì. Lưu đúng lựa chọn, solver điền phần còn lại.
  if (choosesOutputs(def)) {
    const port = def.ports.find((p) => `${p.dir}${p.index}` === key);
    if (!port || port.dir !== 'out' || port.virtual) return { ok: false, reason: tr('Không có cổng ra này') };
    if (itemId !== null && !outputOptions(ds, m, def, port.kind).includes(itemId))
      return { ok: false, reason: tr('Lò không dùng cũng không làm ra món này ở chế độ đang bật') };
    const same = def.ports.filter((p) => p.dir === 'out' && p.kind === port.kind && !p.virtual).map((p) => `out${p.index}`);
    const next: Record<PortKey, string | null> = { ...m.binding };
    if (port.kind === 'belt') for (const k of same) next[k] = itemId;
    else if (itemId !== null) for (const k of same) if (k !== key && next[k] === itemId) next[k] = null;
    next[key] = itemId;
    m.binding = next;
    return { ok: true, uid };
  }

  // máy chạy nhiều công thức: cổng chọn trong hợp sản phẩm của mọi công thức đang chạy
  const recipe = combineRecipes(opts.recipes ?? tickedRecipes(ds, m));

  const slots = resolveSlots(ds, def, recipe, m.binding, m.mode);
  const slot = slots.find((s) => s.key === key);
  if (!slot) return { ok: false, reason: tr('Không có cổng này') };
  if (slot.mode === 'locked')
    return { ok: false, reason: tr('Máy này tự đặt cổng ra theo công thức (mọi cổng ra là sản phẩm cuối), không chọn được') };
  if (slot.mode === 'unused') return { ok: false, reason: tr('Cổng không dùng trong công thức này') };
  if (itemId !== null && !slot.options.includes(itemId))
    return { ok: false, reason: tr('Item không thuộc công thức này') };

  const next: Record<PortKey, string | null> = { ...m.binding };
  if (slot.kind === 'belt' && slot.dir === 'out') {
    for (const s of slots) if (s.dir === 'out' && s.kind === 'belt' && s.mode === 'choose') next[s.key] = itemId;
  } else if (itemId !== null) {
    // Ống: gán một item vào cổng nghĩa là **chuyển** nó tới đó — bỏ khỏi cổng ống cũ cùng
    // chiều, nếu không hai cổng cùng giữ một chất.
    for (const s of slots) if (s.key !== key && s.dir === slot.dir && s.kind === slot.kind && next[s.key] === itemId) next[s.key] = null;
  }
  next[key] = itemId;
  m.binding = effectiveBinding(ds, def, recipe, next, m.mode);
  return { ok: true, uid };
}

/**
 * Chọn vật phẩm đẩy ra ở một cổng của máy **rút hàng**: Lõi Tự Động Hoá / Lõi Giao Thức Phụ
 * (6 cổng ra chọn **độc lập**, mỗi cổng một món),
 * Máy Dỡ Hàng Kho (một món), Cửa Xả Ống Dẫn / Ống Dẫn Dòng Ra (chọn món ⇒ bật nguồn vô hạn
 * với món đó; bỏ chọn ⇒ tắt).
 */
export function setOutletItem(
  bp: Blueprint,
  ds: Dataset,
  uid: number,
  key: PortKey,
  itemId: string | null,
): EditResult {
  const m = bp.machines.find((v) => v.uid === uid);
  const def = m ? ds.machines.get(m.machineId) : undefined;
  if (!m || !def) return { ok: false, reason: tr('Không tìm thấy máy') };
  const port = def.ports.find((p) => `${p.dir}${p.index}` === key);
  if (!port || port.dir !== 'out') return { ok: false, reason: tr('Không có cổng ra này') };
  const item = itemId ? ds.items.get(itemId) : undefined;
  if (itemId && (!item || (item.phase === 'solid') !== (port.kind === 'belt')))
    return { ok: false, reason: port.kind === 'belt' ? tr('Cổng băng chỉ chở vật rắn') : tr('Cổng ống chỉ chở khí / lỏng') };
  const role = roleOf(def);
  if (def.type === 'Hub' || def.type === 'SubHub') {
    // Lõi / lõi phụ: 6 cổng ra chọn **độc lập** — mỗi cổng một món, không lan sang cổng khác
    // (người dùng chốt 2026-09-28; khác với máy chế biến)
    m.binding = { ...m.binding, [key]: itemId };
    return { ok: true, uid };
  }
  if (role === 'depotOut') {
    m.depotItem = itemId;
    return { ok: true, uid };
  }
  if (role === 'udpipeOut') {
    m.infinite = itemId !== null;
    m.source = { itemId: itemId ?? '', perMinute: 0 };
    return { ok: true, uid };
  }
  return { ok: false, reason: tr('Máy này không chọn vật phẩm ra được') };
}

/** Máy là Cảng Kiểm Soát (băng hoặc ống)? */
export const isFilter = (def: MachineDef): boolean => def.type === 'LogConditioner' || def.type === 'LogPipeConditioner';

/** Tốc độ chọn được ở Cảng Kiểm Soát Ống: 6, 12 … 60 mỗi phút. */
export const FILTER_RATES = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60] as const;

/**
 * Cảng kiểm soát: chọn món được đi qua (`null` = cho qua mọi thứ). Món phải đúng loại tuyến
 * (băng: vật rắn; ống: khí / lỏng).
 */
export function setFilterItem(bp: Blueprint, ds: Dataset, uid: number, itemId: string | null): EditResult {
  const m = bp.machines.find((v) => v.uid === uid);
  const def = m ? ds.machines.get(m.machineId) : undefined;
  if (!m || !def || !isFilter(def)) return { ok: false, reason: tr('Không phải cảng kiểm soát') };
  if (itemId) {
    const solid = ds.items.get(itemId)?.phase === 'solid';
    const belt = def.type === 'LogConditioner';
    if (solid !== belt) return { ok: false, reason: belt ? tr('Cảng băng chỉ lọc vật rắn') : tr('Cảng ống chỉ lọc khí / lỏng') };
  }
  m.filterItem = itemId;
  return { ok: true, uid };
}

/** Cảng Kiểm Soát Ống: tốc độ tối đa (bội số của 6, ≤ 60) hoặc `null` = không giới hạn. */
export function setFilterRate(bp: Blueprint, ds: Dataset, uid: number, rate: number | null): EditResult {
  const m = bp.machines.find((v) => v.uid === uid);
  const def = m ? ds.machines.get(m.machineId) : undefined;
  if (!m || !def || def.type !== 'LogPipeConditioner') return { ok: false, reason: tr('Chỉ cảng kiểm soát ống mới chỉnh tốc độ') };
  if (rate !== null && !(FILTER_RATES as readonly number[]).includes(rate))
    return { ok: false, reason: tr('Tốc độ phải là bội số của 6, tối đa 60') };
  m.filterRate = rate;
  return { ok: true, uid };
}

/** Đổi sang chế độ kế tiếp (phím Tab — trước 2026-09-29 là Space). Máy không có chế độ thì thôi. */
export function cycleMode(bp: Blueprint, ds: Dataset, uid: number): EditResult {
  const m = bp.machines.find((v) => v.uid === uid);
  const def = m ? ds.machines.get(m.machineId) : undefined;
  if (!m || !def?.modes || def.modes.length < 2) return { ok: false, reason: tr('Máy này không có chế độ để đổi') };
  const at = def.modes.findIndex((x) => x.id === (m.mode ?? 'A'));
  const next = def.modes[(at + 1) % def.modes.length]!;
  return setMode(bp, ds, uid, next.id);
}

export function setDepotItem(bp: Blueprint, uid: number, itemId: string | null): EditResult {
  const m = bp.machines.find((v) => v.uid === uid);
  if (!m) return { ok: false, reason: tr('Không tìm thấy máy') };
  m.depotItem = itemId;
  return { ok: true, uid };
}

/**
 * Đặt một bản sao của máy `srcUid` ở chỗ mới.
 *
 * Chép mọi thiết lập của máy: công thức, chế độ, gán cổng, số lượng, vật tư nguồn / kho
 * tổng, nguồn vô hạn. **Không** chép ghép cặp ống ngầm (một đầu ra chỉ nhận từ một đầu
 * vào — chép thì cặp cũ bị tước mất) và không chép băng/ống nối vào máy.
 */
export function copyMachine(
  bp: Blueprint,
  ds: Dataset,
  terrain: Terrain,
  srcUid: number,
  x: number,
  z: number,
  rot: Facing,
): EditResult {
  const src = bp.machines.find((v) => v.uid === srcUid);
  if (!src) return { ok: false, reason: tr('Không tìm thấy máy gốc') };
  const r = addMachine(bp, ds, terrain, src.machineId, x, z, rot);
  if (!r.ok || r.uid === undefined) return r;
  const copy = bp.machines.find((v) => v.uid === r.uid)!;
  copy.recipeId = src.recipeId;
  copy.binding = { ...src.binding };
  copy.count = src.count;
  if (src.mode) copy.mode = src.mode;
  if (src.source) copy.source = { ...src.source };
  if (src.depotItem !== undefined) copy.depotItem = src.depotItem;
  if (src.infinite !== undefined) copy.infinite = src.infinite;
  if (src.notedRecipes) copy.notedRecipes = [...src.notedRecipes];
  return r;
}

/**
 * Tích / bỏ tích một công thức. Máy chạy song song mọi công thức đã tích mà đủ đầu vào
 * (người dùng đã chốt 2026-09-28): tích không giới hạn; công thức thiếu đầu vào nằm ở
 * "Đang chờ" như một cái ghim.
 *
 * `recipeId` là công thức tích **đầu tiên** (giữ cho dữ liệu cũ và cho icon trạng thái);
 * bỏ tích nó thì công thức tích kế tiếp lên thay. Gán cổng tính lại theo hợp các công thức.
 */
export function toggleNotedRecipe(bp: Blueprint, ds: Dataset, uid: number, recipeId: string): void {
  const m = bp.machines.find((v) => v.uid === uid);
  const def = m ? ds.machines.get(m.machineId) : undefined;
  if (!m || !def) return;
  const ids = [m.recipeId, ...(m.notedRecipes ?? [])].filter((x): x is string => !!x);
  const list = [...new Set(ids)];
  const at = list.indexOf(recipeId);
  if (at >= 0) list.splice(at, 1);
  else list.push(recipeId);
  m.recipeId = list[0] ?? null;
  if (list.length > 1) m.notedRecipes = list.slice(1);
  else delete m.notedRecipes;
  // Chỉ **điền thêm** cổng cho sản phẩm mới, không xoá lựa chọn cũ: máy còn chạy cả công thức
  // tự nhận theo đầu vào (solver mới biết), lựa chọn cổng cho sản phẩm của chúng phải giữ.
  // lò phản ứng: tích / bỏ tích công thức không đổi cổng ra (chọn tay, 2026-09-29)
  if (choosesOutputs(def)) return;
  const eff = effectiveBinding(ds, def, combineRecipes(tickedRecipes(ds, m)), m.binding, m.mode);
  const next = { ...m.binding };
  for (const [k, v] of Object.entries(eff)) if (v !== null || !(k in next)) next[k] = v;
  m.binding = next;
}

/** Đổi chế độ máy. Công thức đang chọn không thuộc chế độ mới thì bỏ luôn. */
export function setMode(bp: Blueprint, ds: Dataset, uid: number, mode: 'A' | 'B'): EditResult {
  const m = bp.machines.find((v) => v.uid === uid);
  if (!m) return { ok: false, reason: tr('Không tìm thấy máy') };
  const def = ds.machines.get(m.machineId);
  if (!def?.modes?.some((x) => x.id === mode)) return { ok: false, reason: tr('Máy không có chế độ này') };
  m.mode = mode;
  const recipe = m.recipeId ? ds.recipes.get(m.recipeId) : undefined;
  if (recipe && recipe.mode !== null && recipe.mode !== mode) setRecipe(bp, ds, uid, null);
  return { ok: true, uid };
}

/**
 * Ghép cặp hai đầu ống ngầm.
 *
 * Khí và chất lỏng không có kho tổng: muốn đưa chúng đi xa thì đặt một đầu vào và một
 * đầu ra rồi ghép trực tiếp ở đây. Cặp này không chiếm ô nào trên lưới và không liên
 * quan gì tới băng chuyền hay ống.
 */
/** Những máy ghép cặp được với máy `uid` (đầu vào ⇄ đầu ra ống ngầm). */
export function pairCandidates(bp: Blueprint, ds: Dataset, uid: number): PlacedMachine[] {
  const m = bp.machines.find((v) => v.uid === uid);
  const def = m ? ds.machines.get(m.machineId) : undefined;
  if (!m || !def?.pairable) return [];
  const role = roleOf(def);
  return bp.machines.filter((o) => {
    const d = ds.machines.get(o.machineId);
    return o.uid !== uid && !!d?.pairable && roleOf(d) !== role;
  });
}

export function setPairTarget(
  bp: Blueprint,
  ds: Dataset,
  uid: number,
  targetUid: number | null,
): EditResult {
  const m = bp.machines.find((v) => v.uid === uid);
  if (!m) return { ok: false, reason: tr('Không tìm thấy máy') };
  const def = ds.machines.get(m.machineId);
  if (!def?.pairable) return { ok: false, reason: tr('Máy này không ghép cặp được') };

  if (targetUid === null) {
    m.pairTarget = null;
    return { ok: true, uid };
  }
  if (targetUid === uid) return { ok: false, reason: tr('Không ghép máy với chính nó') };
  const target = bp.machines.find((v) => v.uid === targetUid);
  const targetDef = target ? ds.machines.get(target.machineId) : undefined;
  if (!target || !targetDef?.pairable) return { ok: false, reason: tr('Đầu kia không phải ống ngầm') };
  if (roleOf(targetDef) === roleOf(def))
    return { ok: false, reason: tr('Phải ghép một đầu vào với một đầu ra') };

  // một đầu ra chỉ nhận hàng từ một đầu vào
  for (const other of bp.machines)
    if (other.uid !== uid && other.pairTarget === targetUid) other.pairTarget = null;
  // đầu cũ của máy này (nếu có) thôi trỏ về nó — đổi ghép trên map không để lại cặp "ma"
  for (const other of bp.machines)
    if (other.uid !== targetUid && other.pairTarget === uid) other.pairTarget = null;
  m.pairTarget = targetUid;
  target.pairTarget = uid;
  return { ok: true, uid };
}

export function setInfinite(bp: Blueprint, uid: number, infinite: boolean): EditResult {
  const m = bp.machines.find((v) => v.uid === uid);
  if (!m) return { ok: false, reason: tr('Không tìm thấy máy') };
  m.infinite = infinite;
  return { ok: true, uid };
}

export function setSource(
  bp: Blueprint,
  uid: number,
  itemId: string,
  perMinute: number,
): EditResult {
  const m = bp.machines.find((v) => v.uid === uid);
  if (!m) return { ok: false, reason: tr('Không tìm thấy máy') };
  m.source = { itemId, perMinute };
  return { ok: true, uid };
}

export function setCount(bp: Blueprint, uid: number, count: number): void {
  const m = bp.machines.find((v) => v.uid === uid);
  if (m) m.count = Math.max(1, Math.round(count));
}

export { connect, removeBeltAt, removeBeltGroup } from './belts';
