#!/usr/bin/env node
/**
 * extract-dataset.mjs — trích dataset về schema chuẩn của dự án.
 *
 * NGUỒN DỮ LIỆU
 * -------------
 * Nguồn chuẩn phải là bảng dữ liệu của client game (machine table, formula table,
 * text map). Script này nhận một file JS/JSON bất kỳ có chứa các object theo *hình
 * dạng* mô tả dưới đây và chuẩn hoá lại — để bootstrap và để đối chiếu số lượng,
 * KHÔNG phải để phụ thuộc lâu dài vào bundle của người khác.
 *
 * Hình dạng nguồn (giống bảng của game; chấp nhận cả `"..."` lẫn backtick):
 *   machine: { id, type, range:{width,depth,height}, inputPorts:[...],
 *              outputPorts:[...], powerConsume, quickBarType }
 *   port:    { index, isOutput, isPipe, trans:{ position:{x,y,z}, rotation:{y} },
 *              virtual? }
 *   formula: { id, machineId, formulaGroupId, gasEnv, ingredients, outcomes,
 *              totalProgress, buffers }
 *
 * Dùng:  node tools/extract-dataset.mjs <file-nguồn> [thư-mục-ra] [--overlay <file>]
 *
 * `--overlay` đọc thêm một nguồn *cũ hơn* chỉ để lấy ràng buộc chỗ đặt (`limitType`,
 * `placeDomains`). Bảng của bản mới không còn hai trường này, mà chúng vẫn đúng: máy
 * khai thác vẫn phải đứng trên mỏ, đất trồng vẫn phải nằm trong vùng trồng.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const overlayAt = args.indexOf('--overlay');
const overlaySrc = overlayAt >= 0 ? args[overlayAt + 1] : undefined;
const positional = args.filter((a, i) => a !== '--overlay' && i !== overlayAt + 1);
const src = positional[0];
const outDir = resolve(positional[1] ?? 'data');
if (!src) {
  console.error('Dùng: node tools/extract-dataset.mjs <file-nguồn> [thư-mục-ra]');
  process.exit(1);
}
// chuẩn hoá backtick thành nháy kép để chỉ phải viết một bộ biểu thức chính quy
const text = readFileSync(resolve(src), 'utf8').replace(/`([A-Za-z0-9_.\-]*)`/g, '"$1"');

// ---------------------------------------------------------------- tiện ích
function sliceObject(s, start, limit = 60_000) {
  let depth = 0;
  for (let i = start; i < Math.min(s.length, start + limit); i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

function objectStart(s, pos, limit = 60_000) {
  let depth = 0;
  for (let i = pos; i >= Math.max(0, pos - limit); i--) {
    if (s[i] === '}') depth++;
    else if (s[i] === '{') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

/** Mọi object chứa khoá `key`, bất kể thứ tự khoá. */
function findObjectsByKey(s, key) {
  const out = [];
  const seen = new Set();
  const re = new RegExp(`\\b${key}:`, 'g');
  let m;
  while ((m = re.exec(s))) {
    const start = objectStart(s, m.index);
    if (start < 0 || seen.has(start)) continue;
    seen.add(start);
    const o = sliceObject(s, start);
    if (o) out.push(o);
  }
  return out;
}

const num = (o, k) => {
  const m = o.match(new RegExp(`\\b${k}:(-?[0-9.]+(?:e[0-9]+)?)`));
  return m ? Number(m[1]) : undefined;
};
const str = (o, k) => {
  const m = o.match(new RegExp(`\\b${k}:"([^"]*)"`));
  return m ? m[1] : undefined;
};
const objOf = (o, k) => {
  const i = o.indexOf(`${k}:{`);
  return i < 0 ? '' : (sliceObject(o, i + k.length + 1) ?? '');
};
const arr = (o, k) => {
  const m = o.match(new RegExp(`\\b${k}:(\\[.*?\\])(?=,[a-zA-Z]+:|\\}$)`, 's'));
  return m ? m[1] : '';
};

function humanize(id) {
  return id
    .replace(/^(item|machine)_/, '')
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/\bMc\b/g, 'MC')
    .replace(/\bEnr\b/g, 'Enr.')
    .trim();
}

// ---------------------------------------------------------------- máy móc
const PORT_RE =
  /index:(\d+),isOutput:(\d),isPipe:!([01])[^}]*?position:\{x:(-?\d+),y:(-?\d+),z:(-?\d+)\},rotation:\{x:-?\d+,y:(-?\d+)/g;
// một số bản sắp xếp khoá khác: trans đứng trước index
const PORT_RE_ALT =
  /position:\{x:(-?\d+),y:(-?\d+),z:(-?\d+)\},rotation:\{x:-?\d+,y:(-?\d+),z:-?\d+\}\},isOutput:(\d),isPipe:!([01]),index:(\d+)/g;

function parsePorts(block, dir) {
  const ports = [];
  for (const re of [PORT_RE, PORT_RE_ALT]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(block))) {
      const g =
        re === PORT_RE
          ? { index: m[1], pipe: m[3], x: m[4], y: m[5], z: m[6], rot: m[7] }
          : { index: m[7], pipe: m[6], x: m[1], y: m[2], z: m[3], rot: m[4] };
      ports.push({
        index: Number(g.index),
        dir,
        kind: g.pipe === '0' ? 'pipe' : 'belt', // isPipe:!0 === true
        x: Number(g.x),
        z: Number(g.z),
        level: Number(g.y),
        facing: ((Number(g.rot) % 360) + 360) % 360,
      });
    }
    if (ports.length > 0) break;
  }
  // Cổng `virtual` là đầu nối phụ dùng chung với một cổng khác. Phải tách từng object
  // cổng ra rồi mới xét, vì `trans` lồng bên trong làm mọi cách dò theo `[^}]*` sai.
  const virtuals = new Set();
  for (let i = 0; i < block.length; i++) {
    if (block[i] !== '{') continue;
    const one = sliceObject(block, i);
    if (!one || !/index:\d/.test(one)) continue;
    i += one.length - 1;
    if (/\bvirtual:!0/.test(one)) {
      const idx = one.match(/\bindex:(\d+)/);
      if (idx) virtuals.add(Number(idx[1]));
    }
  }
  for (const p of ports) if (virtuals.has(p.index)) p.virtual = true;
  return ports;
}

/**
 * Vùng phủ của máy (ô × ô, kèm độ lệch so với góc footprint).
 * Lấy đúng theo hằng số của game: máy tạo môi trường phủ 13×13 lệch (-5,-5);
 * cột và trạm phát điện phủ 12×12 / 7×7.
 */
function auraOf(type) {
  // Chỉ vùng môi trường mới loại trừ nhau; vùng điện chồng nhau thoải mái.
  if (type === 'EnvGenWithActivator') return { w: 13, d: 13, dx: -5, dz: -5, kind: 'env' };
  if (type === 'PowerDiffuser') return { w: 12, d: 12, dx: -5, dz: -5, kind: 'power' }; // pylon
  if (type === 'PowerPole') return { w: 7, d: 7, dx: -2, dz: -2, kind: 'power' }; // pole
  return undefined;
}

/**
 * Chế độ máy.
 *
 * Bảng dữ liệu không chứa danh sách này (nó nằm trong mã của trình mô phỏng), nên chép
 * lại đúng như game hiển thị. Nhãn giữ nguyên tiếng Anh cho khớp với giao diện game.
 */
const MODES = {
  shaper_1: ['Normal', 'Gas'],
  liquid_purifier_1: ['Liquid', 'Gas & Liquid'],
  furnance_1: ['Normal', 'Liquid'],
  filling_powder_mc_1: ['Normal', 'Fluid & Gas'],
  transmuter_1: ['Gasify', 'Fluidify'],
  transmuter_2: ['Gasify', 'Solidify'],
  mix_pool_2: ['Allow clog', 'Clog prevention'],
  storager_1: ['Depot transfer', 'Storage mode'],
  storager_nop_1: ['Depot transfer', 'Storage mode'],
  miner_1: ['Low purity', 'High purity'],
  miner_2: ['Low purity', 'High purity'],
  miner_3: ['Low purity', 'High purity'],
  miner_4: ['Low purity', 'High purity'],
};

/**
 * Chế độ nào chạy được công thức nào.
 *
 * Cũng không có trong bảng dữ liệu. Suy từ **pha của vật tư** — đúng với cách game đặt
 * tên chế độ: lò `Normal` nấu đồ rắn, `Liquid` nấu đồ lỏng; `transmuter` `Gasify` cho
 * ra khí, `Fluidify` cho ra lỏng. Kết quả ghi thẳng vào `recipes.json` nên sai chỗ nào
 * sửa tay chỗ đó, không phải đụng vào mã.
 */
function recipeMode(machineId, ingredients, outcomes, phaseOf) {
  const phases = (list) => new Set(list.map((e) => phaseOf(e.itemId)));
  const inP = phases(ingredients);
  const outP = phases(outcomes);
  const any = new Set([...inP, ...outP]);
  switch (machineId) {
    case 'furnance_1':
      return any.has('liquid') || any.has('gas') ? 'B' : 'A';
    case 'shaper_1':
    case 'filling_powder_mc_1':
      return any.has('gas') ? 'B' : 'A';
    case 'liquid_purifier_1':
      return any.has('gas') ? 'B' : 'A';
    case 'transmuter_1':
      return outP.has('gas') ? 'A' : 'B';
    case 'transmuter_2':
      return outP.has('gas') ? 'A' : 'B';
    default:
      return null; // chế độ không ảnh hưởng tới công thức (chống tắc, kho, độ tinh khiết)
  }
}

/**
 * Cổng kích hoạt (activator): ống riêng nạp khí/lỏng để máy chạy, **không** phải
 * nguyên liệu của công thức.
 *
 * Bảng dữ liệu không đánh dấu cổng nào là activator — phần đó nằm trong lõi mô
 * phỏng đã biên dịch của game. Suy ra bằng hình học, và vì kết quả nằm trong JSON
 * nên sửa tay được nếu có máy nào không khớp:
 *  - máy tạo môi trường chỉ có đúng một cổng ống vào ⇒ chính nó;
 *  - máy chế biến có activator: cổng ống vào nằm ở *mép khác* với đa số cổng ống
 *    vào còn lại (transmuter: hai cổng nguyên liệu ở mép trái, activator ở mép sau).
 */
function activatorPortOf(type, ports) {
  const pipeIn = ports.filter((p) => p.dir === 'in' && p.kind === 'pipe' && !p.virtual);
  if (type === 'EnvGenWithActivator') return pipeIn.length > 0 ? `in${pipeIn[0].index}` : null;
  if (type !== 'MachineWithActivator' || pipeIn.length < 2) return null;
  const byAxis = new Map();
  for (const p of pipeIn) {
    const axis = p.facing === 90 || p.facing === 270 ? 'x' : 'z';
    byAxis.set(axis, [...(byAxis.get(axis) ?? []), p]);
  }
  const minority = [...byAxis.values()].sort((a, b) => a.length - b.length)[0];
  if (byAxis.size < 2 || !minority) return `in${pipeIn[pipeIn.length - 1].index}`;
  return `in${minority[0].index}`;
}

const machines = [];
const seenMachine = new Set();
// hai mỏ neo: máy thường có `quickBarType`, còn van chia/gộp chỉ có `router`
for (const o of [...findObjectsByKey(text, 'quickBarType'), ...findObjectsByKey(text, 'router')]) {
  const id = str(o, 'id');
  const type = str(o, 'type');
  if (!id || !type || seenMachine.has(id)) continue;
  seenMachine.add(id);
  const range = objOf(o, 'range');
  const w = num(range, 'width') ?? 1;
  const d = num(range, 'depth') ?? 1;
  const h = num(range, 'height') ?? 1;
  const ports = [
    ...parsePorts(arr(o, 'inputPorts'), 'in'),
    ...parsePorts(arr(o, 'outputPorts'), 'out'),
  ];
  machines.push({
    id,
    name: humanize(id),
    type,
    size: { w: Math.max(1, w), d: Math.max(1, d), h: Math.max(1, Math.ceil(h)) },
    power: num(o, 'powerConsume') ?? 0,
    quickBar: str(o, 'quickBarType') ?? '',
    // tên file biểu tượng: bảng game ghi `icon_port_x`, file ảnh là `item_port_x.png`
    icon: (str(o, 'iconOnPanel') ?? `icon_${id}`).replace(/^icon_/, 'item_'),
    /** Nút xoay 1×1 (chia/gộp băng, ống): cổng vào và ra **dùng chung ô**, phân biệt bằng hướng. */
    router: /router:!0/.test(o),
    placement: str(o, 'limitType') ?? 'NoLimit',
    domains: [...arr(o, 'placeDomains').matchAll(/"([^"]+)"/g)].map((m) => m[1]),
    aura: auraOf(type),
    /** Hai chế độ vận hành, nếu máy có. Đổi chế độ thì đổi luôn bộ công thức dùng được. */
    modes: MODES[id] ? MODES[id].map((label, i) => ({ id: i === 0 ? 'A' : 'B', label })) : undefined,
    /** Máy ghép cặp trực tiếp với máy khác (ống ngầm), không qua băng hay ống. */
    pairable: type.startsWith('UdPipe'),
    activatorPort: activatorPortOf(type, ports),
    ports,
  });
}
// ghép ràng buộc chỗ đặt từ nguồn cũ
if (overlaySrc) {
  const old = readFileSync(resolve(overlaySrc), 'utf8').replace(/`([A-Za-z0-9_.\-]*)`/g, '"$1"');
  const byId = new Map(machines.map((m) => [m.id, m]));
  let applied = 0;
  for (const o of findObjectsByKey(old, 'limitType')) {
    const id = str(o, 'id');
    const m = id ? byId.get(id) : undefined;
    if (!m) continue;
    const limit = str(o, 'limitType');
    if (limit && limit !== 'NoLimit') {
      m.placement = limit;
      applied++;
    }
    const domains = [...arr(o, 'placeDomains').matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    if (domains.length > 0) m.domains = domains;
  }
  console.log(`  ghép ràng buộc chỗ đặt cho ${applied} máy từ ${overlaySrc}`);
}

machines.sort((a, b) => a.id.localeCompare(b.id));

// ------------------------------------------------------------- công thức
function parseGroups(block) {
  const groups = [];
  for (const gm of block.matchAll(/\{group:\[(.*?)\]\}/gs)) {
    groups.push(
      [...gm[1].matchAll(/\{count:(\d+),id:"([^"]+)"\}/g)].map((m) => ({
        itemId: m[2],
        count: Number(m[1]),
      })),
    );
  }
  return groups;
}

/** `gasEnv` của bảng game ↔ enum môi trường: None / Stable / Humidity / Acid / Xiranite. */
const ENVS = new Set(['None', 'Stable', 'Humidity', 'Acid', 'Xiranite']);

const recipesRaw = [];
for (const o of findObjectsByKey(text, 'formulaGroupId')) {
  const id = str(o, 'id');
  const machineId = str(o, 'machineId');
  const progress = num(o, 'totalProgress');
  if (!id || !machineId || progress === undefined) continue;
  const outs = parseGroups(arr(o, 'outcomes'));
  const env = str(o, 'gasEnv') ?? 'None';
  recipesRaw.push({
    id,
    machineId,
    group: str(o, 'formulaGroupId') ?? '',
    seconds: Math.round((progress / 6000) * 100) / 100,
    ingredients: parseGroups(arr(o, 'ingredients')).flat(),
    // mọi nhóm sản phẩm đều ra cùng lúc (xem loadDataset); nhóm 2+ vẫn ghi riêng để tra cứu
    outcomes: outs.flat(),
    altOutcomes: outs.slice(1),
    /** Môi trường xúc tác bắt buộc; `None` = chạy ở đâu cũng được. */
    catalystEnv: ENVS.has(env) ? env : 'None',
    buffers: Object.fromEntries(
      [...objOf(o, 'buffers').matchAll(/([a-z0-9_]+):(-?\d+)/g)].map((m) => [m[1], Number(m[2])]),
    ),
  });
}
recipesRaw.sort((a, b) => a.id.localeCompare(b.id));
const recipes = recipesRaw;

// ------------------------------------------------------------------ item
const itemIds = new Set();
for (const r of recipes)
  for (const g of [r.ingredients, r.outcomes, ...r.altOutcomes])
    for (const e of g) itemIds.add(e.itemId);

/**
 * Pha của item. Rắn đi băng chuyền; lỏng và khí đều đi ống.
 * Tiền tố id của game đã đủ rõ; thêm một lượt suy luận cho id không theo tiền tố:
 * máy chỉ có cổng ống ở một chiều ⇒ mọi item ở chiều đó không phải thể rắn.
 */
const phase = new Map();
for (const id of itemIds) {
  if (/^item_(gas|gaspoint)_/.test(id)) phase.set(id, 'gas');
  else if (/^item_(liquid|liquidpoint)_/.test(id)) phase.set(id, 'liquid');
}
const byId = new Map(machines.map((m) => [m.id, m]));
for (const r of recipes) {
  const m = byId.get(r.machineId);
  if (!m) continue;
  const has = (dir, kind) => m.ports.some((p) => p.dir === dir && p.kind === kind);
  for (const [dir, list] of [
    ['in', r.ingredients],
    ['out', r.outcomes],
  ]) {
    if (has(dir, 'belt') || !has(dir, 'pipe')) continue;
    for (const e of list) if (!phase.has(e.itemId)) phase.set(e.itemId, 'liquid');
  }
}

// gán chế độ cho công thức — phải chạy sau khi đã biết pha của mọi item
const phaseLookup = (id) => phase.get(id) ?? 'solid';
for (const r of recipes) r.mode = recipeMode(r.machineId, r.ingredients, r.outcomes, phaseLookup);

// Máy có chế độ nhưng không công thức nào phân được về chế độ ⇒ chế độ đó không liên
// quan tới công thức (chống tắc, kho, độ tinh khiết). Đánh dấu để giao diện nói đúng.
for (const m of machines) {
  if (!m.modes) continue;
  m.modeAffectsRecipes = recipes.some((r) => r.machineId === m.id && r.mode !== null);
}

/** Khí nào tạo ra môi trường nào — máy tạo môi trường đổi loại theo khí nạp vào. */
const GAS_ENV = {
  item_gas_inert: 'Stable',
  item_gas_acid: 'Acid',
  item_gas_water: 'Humidity',
  item_gas_xiranite: 'Xiranite',
  item_gas_xiranite_enr: 'Xiranite',
};

/**
 * Bình đã rót không có file ảnh riêng — game ghép ảnh vỏ bình với ảnh chất bên trong.
 * Ở đây lấy tạm ảnh vỏ bình, vẫn nhận ra được vật tư mà không phải ghép ảnh lúc chạy.
 *  item_fbottle_<vỏ>_<chất>  → item_<vỏ>_bottle
 *  item_gasjar_<vỏ>_<khí>    → item_<vỏ>_jar
 */
function iconFor(id) {
  const bottle = id.match(/^item_fbottle_([a-z]+?)(enr)?_/);
  if (bottle) return `item_${bottle[1]}${bottle[2] ? '_enr' : ''}_bottle`;
  const jar = id.match(/^item_gasjar_([a-z]+)_/);
  if (jar) return `item_${jar[1]}_jar`;
  return id;
}

/**
 * Bảng nhiên liệu của trạm điện (`PowerStation`): vật tư nào đốt được, phát bao nhiêu
 * điện, cháy bao lâu. Trong bundle nó là một object độc lập dạng
 * `{ item_x: { powerProvide, progressRound, fuelEnergy } }`, không nằm trong bảng item.
 * `progressRound` hiểu là **số giây một đơn vị cháy** (8s quặng, 40s pin).
 */
const fuels = new Map();
{
  const at = text.search(/\{item_originium_ore:\{fuelEnergy:/);
  const block = at >= 0 ? sliceObject(text, at) : null;
  if (block) {
    for (const m of block.matchAll(/(item_[a-z0-9_]+):\{([^}]*)\}/g)) {
      const power = num(`{${m[2]}}`, 'powerProvide');
      const seconds = num(`{${m[2]}}`, 'progressRound');
      if (power !== undefined && seconds !== undefined) fuels.set(m[1], { power, seconds });
    }
  }
  for (const id of fuels.keys()) itemIds.add(id);
}

const items = [...itemIds].sort().map((id) => ({
  id,
  name: humanize(id),
  phase: phase.get(id) ?? 'solid',
  icon: iconFor(id),
  ...(GAS_ENV[id] ? { producesEnv: GAS_ENV[id] } : {}),
  ...(fuels.has(id) ? { fuel: fuels.get(id) } : {}),
}));

// ------------------------------------------------------------------- ghi
mkdirSync(outDir, { recursive: true });
const meta = { generatedAt: new Date().toISOString(), source: src };
const write = (f, key, rows) => {
  writeFileSync(resolve(outDir, f), JSON.stringify({ ...meta, [key]: rows }, null, 2) + '\n');
  console.log(`  ${f.padEnd(16)} ${String(rows.length).padStart(5)} bản ghi`);
};
write('machines.json', 'machines', machines);
write('recipes.json', 'recipes', recipes);
write('items.json', 'items', items);

const byPhase = items.reduce((a, i) => ((a[i.phase] = (a[i.phase] ?? 0) + 1), a), {});
console.log(
  `\nMáy có cổng: ${machines.filter((m) => m.ports.length > 0).length}` +
    ` · có activator: ${machines.filter((m) => m.activatorPort).length}` +
    ` · có vùng phủ: ${machines.filter((m) => m.aura).length}`,
);
console.log(`Công thức cần môi trường xúc tác: ${recipes.filter((r) => r.catalystEnv !== 'None').length}`);
console.log(
  `Máy có chế độ: ${machines.filter((m) => m.modes).length}` +
    ` (đổi bộ công thức: ${machines.filter((m) => m.modeAffectsRecipes).length})` +
    ` · ghép cặp ống ngầm: ${machines.filter((m) => m.pairable).length}` +
    ` · vùng điện: ${machines.filter((m) => m.aura?.kind === 'power').length}`,
);
console.log(`Item theo pha: ${JSON.stringify(byPhase)} · nhiên liệu trạm điện: ${fuels.size}`);
console.log(`Thư mục ra: ${outDir}`);
