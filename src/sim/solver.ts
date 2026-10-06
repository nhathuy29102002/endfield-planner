import { choosesOutputs, combineRecipes, effectiveBinding, ingredientsInMode, recipesInMode, tickedRecipes } from '../model/binding';
export { recipesInMode } from '../model/binding';
import { itemName, kindOfItem } from '../model/dataset';
import { computeEnv, type EnvField } from '../model/env';
import { roleOf, type Role } from '../model/roles';
import { busStatus } from '../model/bus';
import { buildNetwork, type Chain } from '../model/network';
import type {
  Blueprint,
  CatalystEnv,
  Dataset,
  Endpoint,
  PortKey,
  RecipeDef,
} from '../model/types';
import { activePorts, CATALYST_ENV_LABEL, DEFAULT_BASE_POWER } from '../model/types';
import { activatorFactor, capacityOf, RATES } from './rates';
import { tr } from '../i18n';

export interface FlowEntry {
  itemId: string;
  /** Nhu cầu (hoặc sản lượng) mỗi phút khi máy chạy 100%. */
  nominal: number;
  /** Thực tế mỗi phút sau khi giải. */
  actual: number;
}

export interface MachineFlow {
  uid: number;
  machineId: string;
  role: Role;
  recipeId: string | null;
  /**
   * Máy chạy nhiều công thức: hệ số chạy của từng công thức đã tích. `running` = những công
   * thức **đủ đầu vào** (đo ở lượt giải "đầu ra thông", nên máy kẹt vẫn tính là đang chạy);
   * phần còn lại là "đang chờ". Điền ở `solve()`.
   */
  recipes: { recipeId: string; utilization: number }[];
  running: string[];
  /**
   * Công thức máy **tự chạy** vì nguyên liệu của nó đang chảy vào — người dùng không tích
   * (người dùng chốt 2026-09-28: máy tự nhận công thức theo đầu vào, như trong game). Nằm
   * trong `recipes` cùng các công thức đã tích.
   */
  auto: string[];
  /** Món thực sự đi qua từng cổng ra (sau khi solver gán) — sơ đồ cửa sổ Máy hiện theo đây. */
  outBinding: Record<PortKey, string | null>;
  /** Hệ số chạy lớn nhất trong các công thức đang chạy. */
  utilization: number;
  cyclesPerMinute: number;
  /** Đầu vào / đầu ra **với bên ngoài máy** (sản phẩm trung gian dùng hết trong máy không tính). */
  inputs: FlowEntry[];
  outputs: FlowEntry[];
  bottleneck: string | null;
  /** Cổng kích hoạt: lượng khí/lỏng thực nhận mỗi phút, `null` nếu máy không có. */
  activator: { itemId: string | null; supply: number; factor: number } | null;
  /** Môi trường máy đang nằm trong, và môi trường công thức đòi hỏi. */
  env: CatalystEnv;
  envRequired: CatalystEnv;
  /**
   * Máy cần điện có đang được cấp không (trong tầm cột/trụ *và* nhà máy không mất điện).
   * `null` = máy không cần điện.
   */
  powered: boolean | null;
  /**
   * Máy **đã nối điện** (trong tầm cột/trụ) nhưng cả hệ thống sụp vì thiếu điện. Tách
   * khỏi "không chạm cột/trụ nào" để icon phích cắm đổi màu: sụp điện = đỏ-trắng, chưa
   * nối điện = cam.
   */
  blackout?: boolean;
  /**
   * Máy chạy dưới 100% vì đâu: `input` — thiếu đầu vào (nhàn rỗi nếu về 0);
   * `output` — đầu ra không thoát kịp, sản phẩm kẹt trong máy. `null` = chạy đủ hoặc không áp dụng.
   */
  limitedBy: 'input' | 'output' | null;
  /** Trạm điện: công suất đang phát. */
  generation: number;
  /** Loader/Unloader: có gắn vào tổng tuyến kho hàng không (`null` = không áp dụng). */
  onBus: boolean | null;
  /**
   * Cặp ống ngầm (người dùng 2026-10-02): cửa sổ Máy của **cả hai đầu** hiện phía vào của Cửa Nạp và phía ra
   * của Cửa Xả. Chỉ để hiển thị — không cộng vào bảng cân bằng (đã có ở `inputs` / `outputs` của từng đầu).
   */
  pairIn?: FlowEntry[];
  pairOut?: FlowEntry[];
}

/** Dòng chảy trên một chuỗi băng/ống — suy từ hình học, xem `model/network.ts`. */
export interface LinkFlow {
  id: string;
  /** Món đầu tiên trên tuyến (tuyến ống luôn chỉ một chất). */
  itemId: string | null;
  /** Băng chở lẫn nhiều món (qua van gộp): từng món và lượng của nó. */
  items: { itemId: string; rate: number }[];
  rate: number;
  capacity: number;
  saturated: boolean;
  invalid: string | null;
}

export interface SolveResult {
  machines: Map<number, MachineFlow>;
  links: Map<string, LinkFlow>;
  /** chỉ số ô băng → id chuỗi, để tô trạng thái theo chuỗi */
  chainOf: Map<number, string>;
  balance: Map<string, { produced: number; consumed: number }>;
  /** Kho tổng: nạp vào và rút ra mỗi phút, theo vật tư. */
  depot: Map<string, { in: number; out: number }>;
  /** Nhu cầu điện: tổng công suất mọi máy đã nối điện, kể cả máy đang nhàn rỗi. */
  powerDraw: number;
  /** Điện tổng thấp hơn nhu cầu ⇒ cả nhà máy mất điện. */
  blackout: boolean;
  /** Tổng công suất các trạm điện đang cháy — mỗi trạm theo đúng nhiên liệu của nó. */
  powerGen: number;
  /** Điện nền của lõi căn cứ. */
  powerBase: number;
  /** Điện tổng = điện nền + tổng điện các trạm. */
  powerSupply: number;
  env: EnvField;
  warnings: string[];
  iterations: number;
}

const ITERATIONS = 300;
/** Kho Lưu Trữ Giao Thức — hàng rắn đưa vào đây tính là nạp vào kho tổng (người dùng 2026-10-04). */
export const DEPOT_STASH = 'storager_1';
/** Máy dỡ / nâng gắn vào đoạn tổng tuyến chưa nối về Cổng Tổng Tuyến (lượt giải đang chạy) — để báo đúng lý do. */
let danglingBus = new Set<number>();

/**
 * Máy **loại bỏ** chất thải (người dùng chốt 2026-09-29): Bộ Xử Lý Nước Thải nhận và xoá hẳn đúng
 * mấy chất này, tổng tối đa `rate` mỗi phút; chất khác vào ⇒ tuyến không hợp lệ.
 */
export const DISPOSAL: Record<string, { items: string[]; rate: number }> = {
  liquid_cleaner_1: {
    items: ['item_liquid_xiranite_poly', 'item_liquid_xiranite_lowpoly', 'item_liquid_sewage'],
    rate: 30,
  },
  // Cửa Nạp Nước Thải: chỉ nhận Nước Thải, tới sức chở một ống (xem `SEWAGE`)
  liquid_clean_gate_1: { items: ['item_liquid_sewage'], rate: 120 },
};
/**
 * Cửa Nạp Nước Thải ↔ Cửa Xả Phụ Phẩm (người dùng 2026-09-29; tỉ lệ theo công thức game
 * `liquid_recycle_gate_1_sewage_treat` trong EnKAD): cửa nạp **chỉ nhận Nước Thải** qua ống; mọi cửa
 * nạp luôn nối với Cửa Xả Phụ Phẩm (chỉ có một trên map); cứ `ratio` Nước Thải nạp vào thì cửa xả
 * đẩy ra 1 Xircon Thải qua ống.
 */
export const SEWAGE = {
  inlet: 'liquid_clean_gate_1',
  outlet: 'liquid_recycle_gate_1',
  input: 'item_liquid_sewage',
  output: 'item_liquid_xiranite_poly',
  ratio: 30,
};
const DAMPING = 0.5;
const EPS = 1e-6;

interface Prepared {
  uid: number;
  machineId: string;
  role: Role;
  recipe: RecipeDef | null;
  /**
   * Máy chế biến: mọi công thức đã tích, mỗi cái một "tiến trình" chạy song song, dùng chung
   * kho máy — sản phẩm của tiến trình này làm nguyên liệu cho tiến trình kia được.
   */
  procs: { recipe: RecipeDef; cycles: number }[];
  /** Công thức trong `procs` do máy tự chạy (không tích). */
  auto: string[];
  /**
   * Mọi vật tư mà ít nhất một công thức **của chế độ đang bật** cần — cổng vào nhận bất kỳ
   * thứ nào trong đây (như game), kể cả khi chưa công thức nào chạy.
   */
  needSet: Set<string>;
  /** Lõi / lõi phụ: rút vật tư từ kho tổng ra các cổng băng, mỗi cổng một món người dùng chọn. */
  depotSource: boolean;
  /** Máy loại bỏ chất thải: chỉ nhận các món này, tổng tối đa `rate`/phút — xem `DISPOSAL`. */
  disposal: { items: Set<string>; rate: number } | null;
  /** Lò phản ứng: nguyên liệu người chơi gán cho cổng ra ⇒ chảy vào rồi đi thẳng ra (bộ chuyển). */
  pass: Set<string>;
  count: number;
  cyclesPerMinute: number;
  power: number;
  /** Điểm nhận vô hạn (hub, kho, máy nạp kho tổng). */
  acceptsAll: boolean;
  /** Van chia/gộp: hàng vào bao nhiêu ra bấy nhiêu, không ràng buộc item. */
  passthrough: boolean;
  binding: Record<PortKey, string | null>;
  need: Map<string, number>;
  make: Map<string, number>;
  inPorts: Map<string, PortKey[]>;
  outPorts: Map<string, PortKey[]>;
  openInPorts: PortKey[];
  openOutPorts: PortKey[];
  activatorPort: PortKey | null;
  /** Đầu kia của cặp ống ngầm. */
  pairTarget: number | null;
  infinite: boolean;
  needsPower: boolean;
  mode: 'A' | 'B';
  /** Cầu: cổng ra ↔ cổng vào cùng hướng dòng chảy (mỗi trục một kênh riêng). */
  bridgeInOf: Map<PortKey, PortKey>;
  bridgeOutOf: Map<PortKey, PortKey>;
  /** Loader/Unloader có gắn vào tổng tuyến kho hàng không. */
  onBus: boolean;
  /** Mọi món đang chảy tới từng cổng vào (băng có thể chở lẫn nhiều món). */
  inItems: Map<PortKey, Set<string>>;
  /** Van / cầu: mọi món đi ra ở từng cổng ra. */
  outItems: Map<PortKey, Set<string>>;
  /** Cảng kiểm soát: món được qua (`null` = mọi thứ) và tốc độ tối đa (`null` = không giới hạn). */
  filter: { item: string | null; rate: number | null } | null;
  /** Lò phản ứng: có kho chứa nhiều món, nhận được băng chở lẫn. */
  crucible: boolean;
}

const pushTo = <K, V>(m: Map<K, V[]>, k: K, v: V): void => {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
};

/** Công thức rỗng — khung để gán cổng khi lò chỉ làm bộ chuyển, chưa chạy công thức nào. */
const passStub = (machineId: string): RecipeDef => ({
  id: 'pass',
  machineId,
  group: '',
  seconds: 1,
  ingredients: [],
  outcomes: [],
  altOutcomes: [],
  buffers: {},
  mode: null,
  catalystEnv: 'None',
});

function prepare(
  bp: Blueprint,
  ds: Dataset,
  warnings: string[],
  onBus: Set<number>,
  auto: Map<number, string[]>,
): Map<number, Prepared> {
  const out = new Map<number, Prepared>();

  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    if (!def) {
      warnings.push(tr('Không biết máy "{0}"', m.machineId));
      continue;
    }
    const role = roleOf(def);
    let recipe = m.recipeId ? (ds.recipes.get(m.recipeId) ?? null) : null;
    if (m.recipeId && !recipe) warnings.push(tr('Không biết công thức "{0}"', m.recipeId));
    const count = Math.max(1, m.count);
    let autoIds: string[] = [];
    const pass = new Set<string>();
    let depotSource = false;

    const need = new Map<string, number>();
    const make = new Map<string, number>();
    const inPorts = new Map<string, PortKey[]>();
    const outPorts = new Map<string, PortKey[]>();
    const openInPorts: PortKey[] = [];
    const openOutPorts: PortKey[] = [];
    const binding: Record<PortKey, string | null> = {};
    const bridgeInOf = new Map<PortKey, PortKey>();
    const bridgeOutOf = new Map<PortKey, PortKey>();
    let cycles = 0;
    let procs: Prepared['procs'] = [];
    const needSet = new Set<string>();

    const usable = activePorts(def, m.mode);
    const bindAll = (dir: 'in' | 'out', itemId: string): void => {
      const kind = kindOfItem(ds, itemId);
      for (const p of usable) {
        if (p.dir !== dir || p.kind !== kind) continue;
        const key = `${dir}${p.index}`;
        if (key === def.activatorPort) continue;
        binding[key] = itemId;
        pushTo(dir === 'in' ? inPorts : outPorts, itemId, key);
      }
    };

    switch (role) {
      case 'source': {
        // Cửa Xả Phụ Phẩm: đẩy Xircon Thải theo lượng Nước Thải các cửa nạp nhận (tính trong vòng lặp)
        if (m.machineId === SEWAGE.outlet) {
          make.set(SEWAGE.output, 0);
          bindAll('out', SEWAGE.output);
          break;
        }
        const s = m.source && m.source.itemId ? m.source : undefined;
        if (s) {
          make.set(s.itemId, s.perMinute * count);
          bindAll('out', s.itemId);
        }
        break;
      }
      case 'depotOut': {
        // rút từ kho tổng: nguồn không giới hạn, chỉ bị chặn bởi sức chở của tuyến —
        // nhưng chỉ khi đã gắn vào tổng tuyến kho hàng
        const itemId = onBus.has(m.uid) ? (m.depotItem ?? null) : null;
        if (itemId) {
          const cap = usable.filter((p) => p.dir === 'out').length || 1;
          make.set(itemId, capacityOf(kindOfItem(ds, itemId)) * cap * count);
          bindAll('out', itemId);
        }
        break;
      }
      case 'depotIn':
      case 'udpipeIn':
      case 'sink':
        for (const p of usable) if (p.dir === 'in') openInPorts.push(`in${p.index}`);
        // Lõi Tự Động Hoá / Lõi Giao Thức Phụ còn là **cửa rút kho tổng**: mỗi cổng băng ra
        // đẩy đúng món người dùng chọn cho cổng đó, nhiều bằng sức chở của băng.
        if (def.type === 'Hub' || def.type === 'SubHub') {
          depotSource = true;
          for (const p of usable) {
            if (p.dir !== 'out' || p.virtual) continue;
            const key = `out${p.index}`;
            const itemId = m.binding[key] ?? null;
            if (!itemId || kindOfItem(ds, itemId) !== p.kind) continue;
            binding[key] = itemId;
            make.set(itemId, (make.get(itemId) ?? 0) + capacityOf(p.kind) * count);
            pushTo(outPorts, itemId, key);
          }
        }
        break;
      case 'udpipeOut': {
        for (const p of usable) if (p.dir === 'out') openOutPorts.push(`out${p.index}`);
        // Bình thường: đẩy ra đúng lượng đầu vào ghép cặp nhận được, vật tư suy từ đầu
        // vào đó — nên chưa gán gì ở đây. Đặt vô hạn thì nó tự làm nguồn, và lúc đó
        // người dùng phải tự khai vật tư vì không còn đầu nào để suy ra.
        const inf = m.infinite ? m.source : undefined;
        if (inf?.itemId) {
          // cổng `virtual` là cùng đầu nối vật lý với cổng thật ⇒ không tính thêm sức chở
          const real = usable.filter((p) => p.dir === 'out' && !p.virtual).length || 1;
          const cap = capacityOf(kindOfItem(ds, inf.itemId)) * real * count;
          make.set(inf.itemId, cap);
          bindAll('out', inf.itemId);
        }
        break;
      }
      case 'router':
      case 'bridge':
        for (const p of usable) {
          if (p.dir === 'in') openInPorts.push(`in${p.index}`);
          else openOutPorts.push(`out${p.index}`);
        }
        if (role === 'bridge') {
          // cùng `facing` = cùng hướng dòng chảy: hàng vào kênh nào ra đúng kênh đó
          for (const pin of usable.filter((p) => p.dir === 'in')) {
            const pout = usable.find((p) => p.dir === 'out' && p.facing === pin.facing);
            if (!pout) continue;
            bridgeInOf.set(`out${pout.index}`, `in${pin.index}`);
            bridgeOutOf.set(`in${pin.index}`, `out${pout.index}`);
          }
        }
        break;
      case 'generator':
        // vật tư đốt được suy từ thứ đang chảy tới — xem `settleGenerators`
        for (const p of usable) if (p.dir === 'in') openInPorts.push(`in${p.index}`);
        break;
      case 'crafter': {
        // Mọi công thức đã tích **và** mọi công thức máy tự chạy vì đủ nguyên liệu (xem
        // `autoRecipes`) chạy song song, dùng chung kho máy (người dùng chốt 2026-09-28).
        const ticked = tickedRecipes(ds, m);
        const fromAuto = (auto.get(m.uid) ?? []).map((id) => ds.recipes.get(id)).filter((r): r is RecipeDef => !!r);
        // `autoRecipes` trả về **toàn bộ** công thức được chạy, đã xếp theo giới hạn của máy (máy
        // thường: 1 công thức; lò phản ứng: xem `CRUCIBLE_LIMITS`). Máy thường chưa chạy gì mà có
        // công thức đã tích ⇒ giữ công thức tích đầu tiên (đang chờ) để còn cổng ra và trạng thái.
        const limited = CRUCIBLE_LIMITS[def.id] !== undefined;
        const list = fromAuto.length > 0 || limited || ticked.length === 0 ? fromAuto : [ticked[0]!];
        autoIds = list.filter((r) => !ticked.some((t) => t.id === r.id)).map((r) => r.id);
        recipe ??= list[0] ?? null;
        procs = list.map((r) => ({ recipe: r, cycles: r.seconds > 0 ? (60 / r.seconds) * count : 0 }));
        cycles = procs[0]?.cycles ?? 0;
        // cổng vào nhận mọi thứ mà một công thức nào đó của chế độ đang bật cần
        for (const r of [...recipesInMode(ds, m, def), ...ticked])
          for (const st of r.ingredients) needSet.add(st.itemId);
        for (const p of usable)
          if (p.dir === 'in' && `in${p.index}` !== def.activatorPort) openInPorts.push(`in${p.index}`);
        const combined = combineRecipes(list);
        // Lò phản ứng làm **bộ chuyển trung gian**: cổng ra người chơi gán cho một nguyên liệu
        // (không phải thứ lò đang làm ra) ⇒ nguyên liệu đó chảy vào rồi đi thẳng ra cổng này.
        if (choosesOutputs(def)) {
          const ingr = ingredientsInMode(ds, m, def);
          const made = new Set(list.flatMap((r) => r.outcomes.map((o) => o.itemId)));
          for (const p of usable) {
            if (p.dir !== 'out' || p.virtual) continue;
            const v = m.binding[`out${p.index}`];
            if (v && ingr.has(v) && !made.has(v) && kindOfItem(ds, v) === p.kind) pass.add(v);
          }
        }
        // công thức ảo để gán cổng ra: sản phẩm đang làm + món đi xuyên
        const forPorts: RecipeDef | null =
          combined || pass.size > 0
            ? {
                ...(combined ?? passStub(def.id)),
                outcomes: [...(combined?.outcomes ?? []), ...[...pass].map((itemId) => ({ itemId, count: 0 }))],
              }
            : null;
        if (forPorts) {
          // Cổng ra: người chơi chọn sản phẩm cho từng cổng (gán cổng). Cổng vào: như trong
          // game, cổng vào nào cũng nhận mọi thứ máy cần — vật tư ở đó là thứ đang chảy tới
          // (xem `propagateItems`), không gán trước.
          Object.assign(binding, effectiveBinding(ds, def, forPorts, m.binding, m.mode));
          for (const key of Object.keys(binding)) if (key.startsWith('in')) binding[key] = null;
          for (const [key, itemId] of Object.entries(binding))
            if (itemId && key.startsWith('out')) pushTo(outPorts, itemId, key);
        }
        for (const pr of procs) {
          for (const st of pr.recipe.ingredients)
            need.set(st.itemId, (need.get(st.itemId) ?? 0) + st.count * pr.cycles);
          for (const st of pr.recipe.outcomes)
            make.set(st.itemId, (make.get(st.itemId) ?? 0) + st.count * pr.cycles);
        }
        break;
      }
      default:
        break;
    }

    out.set(m.uid, {
      uid: m.uid,
      machineId: m.machineId,
      role,
      recipe,
      procs,
      auto: autoIds,
      pass,
      needSet,
      depotSource,
      disposal: DISPOSAL[m.machineId]
        ? { items: new Set(DISPOSAL[m.machineId]!.items), rate: DISPOSAL[m.machineId]!.rate }
        : null,
      count,
      cyclesPerMinute: cycles,
      power: def.power * count,
      // đầu vào ống ngầm chỉ nhận khi đã ghép cặp; chưa ghép thì hàng dồn ứ như trong game
      acceptsAll:
        role === 'sink' ||
        (role === 'depotIn' && onBus.has(m.uid)) ||
        (role === 'udpipeIn' && m.pairTarget != null),
      passthrough: role === 'router' || role === 'bridge',
      binding,
      need,
      make,
      inPorts,
      outPorts,
      openInPorts,
      openOutPorts,
      activatorPort: def.activatorPort,
      pairTarget: m.pairTarget ?? null,
      infinite: m.infinite === true,
      needsPower: def.power > 0,
      mode: m.mode ?? 'A',
      bridgeInOf,
      bridgeOutOf,
      onBus: onBus.has(m.uid),
      inItems: new Map(),
      outItems: new Map(),
      filter:
        def.type === 'LogConditioner' || def.type === 'LogPipeConditioner'
          ? { item: m.filterItem ?? null, rate: def.type === 'LogPipeConditioner' ? (m.filterRate ?? null) : null }
          : null,
      crucible: CRUCIBLE_LIMITS[def.id] !== undefined,
    });
  }
  return out;
}

interface Edge {
  id: string;
  /** Chuỗi băng/ống chứa tuyến này — một chuỗi chở lẫn nhiều món thì có nhiều `Edge`. */
  chainId: string;
  from: Endpoint;
  to: Endpoint;
  itemId: string;
  capacity: number;
  src: Prepared;
  dst: Prepared;
  /** Tuyến này chạy vào cổng kích hoạt của máy đích. */
  toActivator: boolean;
}

/**
 * Lan truyền item qua van chia/gộp.
 *
 * Van không có công thức nên cổng của nó không gắn sẵn item nào; item ở đó là thứ
 * đang chảy tới. Lặp cho tới khi ổn định để chuỗi van nối nhau cũng truyền được.
 */
/**
 * Lan truyền item qua van chia/gộp **và** qua cặp ống ngầm.
 *
 * Cả hai đều không có công thức nên cổng của chúng không gắn sẵn item; item ở đó là
 * thứ đang chảy tới. Cặp ống ngầm còn truyền qua một bước nữa: đầu ra đẩy ra đúng thứ
 * mà đầu vào ghép cặp với nó nhận được. Lặp cho tới khi ổn định để chuỗi van nối nhau
 * và ống ngầm nối tiếp ống ngầm cũng truyền được.
 */
const NONE: ReadonlySet<string> = new Set();

/** Mọi món đi ra ở một cổng ra: van / cầu theo thứ chảy qua; máy khác theo gán cổng. */
function itemsOut(p: Prepared, key: PortKey): ReadonlySet<string> {
  if (p.passthrough) return p.outItems.get(key) ?? NONE;
  const v = p.binding[key];
  return v ? new Set([v]) : NONE;
}

/**
 * Lan truyền **tập món** qua van tách / gộp, cầu, cảng kiểm soát và cặp ống ngầm.
 *
 * Van không có công thức nên cổng của nó không gắn sẵn món nào; món ở đó là thứ đang chảy tới.
 * Băng qua van gộp có thể chở **lẫn nhiều món** (người dùng 2026-09-29) — nên mỗi cổng giữ một
 * tập món, không phải một món. Cảng kiểm soát có lọc thì chỉ món lọc đi tiếp. Lặp tới khi ổn định
 * để chuỗi van nối nhau và ống ngầm nối tiếp ống ngầm cũng truyền được.
 */
function propagateItems(chains: Chain[], prepared: Map<number, Prepared>): void {
  const addAll = (map: Map<PortKey, Set<string>>, key: PortKey, items: Iterable<string>): boolean => {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    let changed = false;
    for (const i of items)
      if (!set.has(i)) {
        set.add(i);
        changed = true;
      }
    return changed;
  };
  const setPorts = (p: Prepared, keys: PortKey[], itemId: string): boolean => {
    let changed = false;
    for (const key of keys)
      if (p.binding[key] !== itemId) {
        p.binding[key] = itemId;
        changed = true;
      }
    return changed;
  };

  for (let pass = 0; pass < 64; pass++) {
    let changed = false;

    for (const l of chains) {
      if (!l.from || !l.to) continue;
      const src = prepared.get(l.from.uid);
      const dst = prepared.get(l.to.uid);
      if (!src || !dst) continue;
      const items = itemsOut(src, l.from.portKey);
      if (items.size === 0) continue;
      changed = addAll(dst.inItems, l.to.portKey, items) || changed;
      if (dst.role === 'bridge') {
        // cầu: mỗi trục một kênh, món vào kênh nào ra đúng kênh đó
        const out = dst.bridgeOutOf.get(l.to.portKey);
        if (out) changed = addAll(dst.outItems, out, items) || changed;
      } else if (dst.passthrough) {
        // van tách / gộp: mọi cổng ra chở hợp mọi món vào; cảng kiểm soát có lọc thì chỉ món lọc
        const through = dst.filter?.item ? [...items].filter((i) => i === dst.filter!.item) : items;
        for (const k of dst.openOutPorts) changed = addAll(dst.outItems, k, through) || changed;
      }
    }

    // đầu vào ống ngầm → đầu ra ghép cặp
    for (const p of prepared.values()) {
      if (p.role !== 'udpipeIn' || p.pairTarget === null) continue;
      const item = p.openInPorts.flatMap((k) => [...(p.inItems.get(k) ?? [])])[0];
      const out = prepared.get(p.pairTarget);
      // đầu ra đang là **nguồn vô hạn**: nó tự đẩy món người dùng chọn, bỏ qua thứ chảy qua
      // cặp ghép (trước đây món của cặp ghép đè lên ⇒ nguồn vô hạn đẩy ra 0)
      if (!item || !out || out.role !== 'udpipeOut' || out.infinite) continue;
      changed = setPorts(out, out.openOutPorts, item) || changed;
      if (!out.make.has(item)) {
        out.make.set(item, 0); // lượng thật tính trong vòng lặp; chỉ cần có mặt để nối tuyến
        changed = true;
      }
      if (!(out.outPorts.get(item) ?? []).length) for (const key of out.openOutPorts) pushTo(out.outPorts, item, key);
    }

    if (!changed) break;
  }

  // cổng vào của máy (không phải van): gán món đầu tiên cho chỗ còn đọc `binding`
  for (const p of prepared.values()) {
    if (p.passthrough) continue;
    for (const [key, set] of p.inItems) if (set.size > 0) p.binding[key] = [...set][0]!;
  }
}

/**
 * Công thức máy **tự chạy**: công thức (của chế độ đang bật) mà mọi nguyên liệu đều đang
 * **chảy vào máy từ bên ngoài**.
 *
 * Máy thường: sản phẩm làm ra bên trong máy **không** mở khoá công thức tự chạy — nếu không,
 * lò "bột moss → bột carbon" sẽ tự nấu luôn bột carbon vừa làm ra thành carbon (việc của lò
 * sau) và kẹt vì không có cổng cho carbon. Riêng lò phản ứng (`CRUCIBLE_LIMITS`) có luật riêng
 * — xem nhánh `limit` bên dưới: với chúng, giá trị trả về là **toàn bộ** danh sách công thức chạy
 * (đã tích + tự chạy), không chỉ phần tự chạy.
 *
 * Chọn giữa các công thức cùng đủ nguyên liệu (*suy luận*, chưa kiểm trong game — máy trong
 * game chỉ chạy một công thức khớp với thứ nó đang có):
 *  - công thức đòi môi trường xúc tác chỉ tự chạy khi máy đang nằm trong đúng môi trường; hai
 *    biến thể cùng nguyên liệu (vd. Máy Tinh Chế thường / trong vùng Stable) thì chạy biến
 *    thể có môi trường khi đủ điều kiện;
 *  - nguyên liệu của cái này là **tập con thật sự** của cái kia (vd. "hạt → cây" và
 *    "hạt + nước → cây") ⇒ chỉ chạy cái đầy đủ hơn;
 *  - công thức đã tích tay dùng (một phần hay toàn bộ) cùng nguyên liệu đó ⇒ người dùng đã
 *    chọn, không tự chạy thêm công thức con.
 * Công thức đã tích tay luôn chạy (hoặc chờ), không cần đi qua đây.
 */
function autoRecipes(
  bp: Blueprint,
  ds: Dataset,
  prepared: Map<number, Prepared>,
  chains: Chain[],
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  // môi trường xúc tác hiện có — suy từ khí đang chảy vào cổng kích hoạt của máy tạo môi trường
  const activatorItem = new Map<number, string | null>();
  for (const l of chains) {
    if (!l.from || !l.to) continue;
    const dst = prepared.get(l.to.uid);
    if (!dst || dst.activatorPort !== l.to.portKey) continue;
    const item = prepared.get(l.from.uid)?.binding[l.from.portKey];
    if (item) activatorItem.set(dst.uid, item);
  }
  const env = computeEnv(bp, ds, activatorItem);
  for (const m of bp.machines) {
    const p = prepared.get(m.uid);
    const def = ds.machines.get(m.machineId);
    if (!p || !def || p.role !== 'crafter') continue;
    // món đang chảy vào — băng chở lẫn nhiều món vào máy thường thì kẹt, không tính
    const avail = new Set<string>();
    for (const l of chains) {
      if (l.to?.uid !== m.uid || !l.from || l.to.portKey === p.activatorPort) continue;
      const src = prepared.get(l.from.uid);
      if (!src) continue;
      const items = itemsOut(src, l.from.portKey);
      if (!p.crucible && items.size > 1) continue;
      for (const i of items) avail.add(i);
    }
    // máy thường chỉ chạy **1 công thức** một lúc (người dùng chốt 2026-09-29); lò phản ứng có
    // giới hạn riêng
    const limit = CRUCIBLE_LIMITS[def.id] ?? NORMAL_LIMIT;
    const candidates = recipesInMode(ds, m, def);
    const tickedList = tickedRecipes(ds, m);
    const here = env.envOf.get(m.uid) ?? 'None';
    const ingr = (r: RecipeDef): Set<string> => new Set(r.ingredients.map((st) => st.itemId));
    const within = (a: Set<string>, b: Set<string>): boolean => [...a].every((x) => b.has(x));
    const strictSub = (a: Set<string>, b: Set<string>): boolean => a.size < b.size && within(a, b);
    const same = (a: Set<string>, b: Set<string>): boolean => a.size === b.size && within(a, b);
    /** Công thức (chưa tích) chạy được với vật tư `have`, sau các luật chọn ở trên. */
    const runnable = (have: Set<string>): RecipeDef[] => {
      const ok = candidates.filter(
        (r) =>
          r.ingredients.length > 0 &&
          r.ingredients.every((st) => have.has(st.itemId)) &&
          (r.catalystEnv === 'None' || r.catalystEnv === here),
      );
      return ok
        .filter((r) => !tickedList.some((t) => t.id === r.id))
        .filter((r) => !ok.some((q) => q !== r && strictSub(ingr(r), ingr(q))))
        .filter((r) => !tickedList.some((t) => within(ingr(r), ingr(t))))
        .filter((r) => !(r.catalystEnv === 'None' && ok.some((q) => q !== r && q.catalystEnv !== 'None' && same(ingr(q), ingr(r)))));
    };

    let picked: string[];
    {
      // Lò phản ứng (người dùng chốt 2026-09-28):
      //  - chạy tối đa `limit.recipes` công thức cùng lúc (Lò Phản Ứng: 1; Lò Mở Rộng: không giới
      //    hạn), mỗi công thức một lần (≤ 100% tốc độ của nó);
      //  - bên trong chỉ chứa tối đa `limit.items` **món khác nhau** cùng lúc — nguyên liệu, sản
      //    phẩm, trung gian, phụ phẩm, cả món đi xuyên (bộ chuyển) đều tính;
      //  - xếp chỗ: công thức đã tích (theo thứ tự tích) trước, rồi công thức tự chạy theo đầu vào
      //    (theo thứ tự trong game); công thức làm vượt giới hạn thì không chạy (nằm "Đang chờ");
      //  - sản phẩm của công thức đang chạy mở khoá công thức kế tiếp **trong máy** (Nước +
      //    Xiranite → Xiranite Lỏng, rồi Xiranite Lỏng + Nước Thải → 2 loại Xircon).
      const have = new Set(avail);
      const ingrInMode = ingredientsInMode(ds, m, def);
      // món đi xuyên đang chảy vào cũng chiếm một chỗ trong máy
      let items = new Set<string>();
      for (const q of activePorts(def, m.mode))
        if (q.dir === 'out' && !q.virtual) {
          const v = m.binding[`out${q.index}`];
          if (v && ingrInMode.has(v) && avail.has(v)) items.add(v);
        }
      const chosen: RecipeDef[] = [];
      const tryAdd = (r: RecipeDef): boolean => {
        if (chosen.includes(r) || chosen.length >= limit.recipes) return false;
        if (r.catalystEnv !== 'None' && r.catalystEnv !== here) return false;
        if (!r.ingredients.every((st) => have.has(st.itemId))) return false;
        const next = new Set(items);
        for (const st of [...r.ingredients, ...r.outcomes]) next.add(st.itemId);
        if (next.size > limit.items) return false;
        chosen.push(r);
        items = next;
        for (const st of r.outcomes) have.add(st.itemId);
        return true;
      };
      for (let changed = true; changed; ) {
        changed = false;
        for (const t of tickedList) changed = tryAdd(t) || changed;
        for (const r of runnable(have)) changed = tryAdd(r) || changed;
      }
      picked = chosen.map((r) => r.id);
      out.set(m.uid, picked); // luôn trả về (kể cả rỗng) — đây là danh sách đầy đủ
    }
  }
  return out;
}

/**
 * Giới hạn của lò phản ứng (người dùng chốt 2026-09-28): số công thức chạy cùng lúc và số **món
 * khác nhau** chứa được bên trong cùng lúc.
 */
/** Máy chế biến thường: 1 công thức một lúc, không có kho chứa món ngoài công thức. */
const NORMAL_LIMIT = { recipes: 1, items: Infinity };

export const CRUCIBLE_LIMITS: Record<string, { recipes: number; items: number }> = {
  mix_pool_1: { recipes: 1, items: 5 }, // Lò Phản Ứng
  mix_pool_2: { recipes: Infinity, items: 8 }, // Lò Mở Rộng
};

const sameAuto = (a: Map<number, string[]>, b: Map<number, string[]>): boolean =>
  a.size === b.size && [...a].every(([k, v]) => b.get(k)?.join('|') === v.join('|'));

/**
 * Trạm điện đốt thứ gì đang chảy tới, miễn là thứ đó có trong bảng nhiên liệu.
 * Mỗi trạm cháy **một** đơn vị mỗi `seconds` giây ⇒ cần `60 / seconds` đơn vị mỗi phút
 * để phát đủ công suất liên tục.
 */
function settleGenerators(ds: Dataset, prepared: Map<number, Prepared>): void {
  for (const p of prepared.values()) {
    if (p.role !== 'generator') continue;
    for (const key of p.openInPorts) {
      const itemId = p.binding[key];
      const fuel = itemId ? ds.items.get(itemId)?.fuel : undefined;
      if (!itemId || !fuel) continue;
      p.need.set(itemId, (60 / fuel.seconds) * p.count);
      pushTo(p.inPorts, itemId, key);
    }
  }
}

/**
 * Giải thông lượng bằng lặp điểm bất động có giảm dao động.
 *
 * Mỗi vòng: từ hệ số chạy hiện tại suy ra lượng hàng trên từng tuyến — chặn bởi
 * nguồn, bởi sức chở, và bởi **nhu cầu thực của máy phía sau** — rồi suy ra hệ số
 * chạy mới. Bốn ràng buộc của 1.5 được tính chung trong cùng vòng lặp đó: cổng kích
 * hoạt, môi trường xúc tác, van chia/gộp, và kho tổng.
 */
/**
 * Giải bản vẽ, kèm luật mất điện toàn nhà máy.
 *
 * Luật game: **thiếu điện là cả nhà máy dừng** — không phải máy nào cũng chậm lại một
 * chút. Nhu cầu điện là tổng công suất mọi máy *đã nối điện*, kể cả máy đang nhàn rỗi
 * (nhàn rỗi vẫn ăn điện), nên nó không phụ thuộc máy có chạy hay không — tính một lần là
 * đủ, không có vòng luẩn quẩn "dừng máy ⇒ bớt tải ⇒ đủ điện ⇒ chạy lại".
 *
 * Hiển thị luôn phản ánh đúng game (icon mất điện hiện cả khi tắt kiểm tra). Công tắc
 * kiểm tra điện chỉ quyết định solver có *thực sự dừng máy* hay không.
 */
export function solve(bp: Blueprint, ds: Dataset): SolveResult {
  const enforce = bp.enforcePower !== false;
  const first = solveOnce(bp, ds, false, false);
  const shortage = first.powerDraw > first.powerSupply + 1e-6;
  const stopped = shortage && enforce;
  const result = stopped ? solveOnce(bp, ds, true, false) : first;
  result.blackout = shortage;

  // Máy chạy dưới 100% vì đâu? Hỏi đúng câu: "nếu đầu ra thông hoàn toàn thì có chạy
  // nhanh hơn không?". Không thể suy từ số liệu của chính lượt giải này — backpressure
  // làm phía trước ngừng gửi, đầu vào cũng tụt về 0, máy kẹt trông y như máy ngủ.
  const free = solveOnce(bp, ds, stopped, true);
  // công thức "đang chạy" = đủ đầu vào (đo khi đầu ra thông); còn lại là "đang chờ"
  for (const m of result.machines.values()) {
    const f = free.machines.get(m.uid);
    m.running = (f?.recipes ?? []).filter((r) => r.utilization > 1e-3).map((r) => r.recipeId);
  }
  for (const m of result.machines.values()) {
    if (m.role !== 'crafter' || !m.recipeId || m.utilization >= 1 - 1e-4) continue;
    const uFree = free.machines.get(m.uid)?.utilization ?? 0;
    m.limitedBy = uFree > m.utilization + 1e-4 ? 'output' : 'input';
    // kẹt ở đầu ra mà câu báo lại là "Thiếu …" (viết lúc chưa biết máy kẹt) ⇒ báo đúng là kẹt cổng ra
    // (người dùng 2026-10-02)
    if (m.limitedBy === 'output' && (!m.bottleneck || m.bottleneck.startsWith(tr('Thiếu')))) {
      const o = m.outputs.find((x) => x.actual < x.nominal - 1e-6) ?? m.outputs[0];
      m.bottleneck = o
        ? tr('Kẹt cổng ra: {0} chỉ thoát được {1}/{2} mỗi phút — phía sau nhận không hết', ds.items.get(o.itemId)?.name ?? o.itemId, o.actual.toFixed(1), o.nominal.toFixed(1))
        : tr('Kẹt cổng ra — phía sau nhận không hết');
    }
  }
  if (shortage) {
    for (const m of result.machines.values()) {
      if (m.powered === null) continue;
      if (m.powered) m.blackout = true; // đã nối điện, chỉ là hệ thống sụp
      m.powered = false;
      if (enforce)
        m.bottleneck = tr('Mất điện toàn nhà máy — cần {0}, chỉ có {1}', Math.round(result.powerDraw), Math.round(result.powerSupply));
    }
  }
  return result;
}

/**
 * Một lượt giải. `freeOutputs` = mọi đầu ra coi như thông hoàn toàn (phía sau nhận bao
 * nhiêu cũng được) — chỉ dùng để đo "máy làm được bao nhiêu nếu không bị kẹt".
 */
function solveOnce(bp: Blueprint, ds: Dataset, blackout: boolean, freeOutputs: boolean): SolveResult {
  let warnings: string[] = [];
  const enforcePower = bp.enforcePower !== false;
  const bus = busStatus(bp, ds);
  const onBus = bus.attached;
  danglingBus = bus.dangling;
  const network = buildNetwork(bp, ds);
  // Máy tự chạy công thức theo thứ đang chảy vào; công thức mới chạy lại đổi thứ máy đẩy
  // ra, làm máy phía sau đổi theo ⇒ lặp tới khi tập công thức tự chạy đứng yên.
  let auto = new Map<number, string[]>();
  let prepared = new Map<number, Prepared>();
  for (let pass = 0; pass < 8; pass++) {
    warnings = [];
    prepared = prepare(bp, ds, warnings, onBus, auto);
    propagateItems(network.chains, prepared);
    const next = autoRecipes(bp, ds, prepared, network.chains);
    if (sameAuto(next, auto)) break;
    auto = next;
  }
  settleGenerators(ds, prepared);
  for (const p of prepared.values()) {
    if (p.role !== 'crafter') continue;
    for (const key of p.openInPorts) for (const itemId of p.inItems.get(key) ?? []) pushTo(p.inPorts, itemId, key);
  }

  const edges: Edge[] = [];
  const linkFlows = new Map<string, LinkFlow>();

  for (const l of network.chains) {
    const flow: LinkFlow = {
      id: l.id,
      itemId: null,
      items: [],
      rate: 0,
      capacity: capacityOf(l.kind),
      saturated: false,
      invalid: null,
    };
    linkFlows.set(l.id, flow);

    if (!l.from) {
      flow.invalid = tr('Đoạn băng không có nguồn — không cổng ra nào đẩy hàng vào nó');
      continue;
    }
    const src = prepared.get(l.from.uid);
    const items = src ? [...itemsOut(src, l.from.portKey)] : [];
    flow.itemId = items[0] ?? null;
    flow.items = items.map((itemId) => ({ itemId, rate: 0 }));
    if (!l.to) {
      flow.invalid = tr('Băng cụt — đầu cuối không chạm cổng vào nào (hoặc chạm sai hướng)');
      continue;
    }
    const dst = prepared.get(l.to.uid);
    if (!src || !dst) {
      flow.invalid = tr('Tuyến treo, thiếu một đầu');
      continue;
    }
    if (items.length === 0) {
      flow.invalid =
        src.role === 'source'
          ? tr('Máy nguồn chưa khai báo sản lượng')
          : src.role === 'depotOut'
            ? tr('Chưa chọn vật tư rút từ kho tổng')
            : src.role === 'router'
              ? src.filter?.item
                ? tr('Cảng kiểm soát chỉ cho {0} qua — chưa có món đó chảy tới', itemName(ds, src.filter.item))
                : tr('Van chưa có hàng nào chảy tới')
              : src.depotSource
                ? tr('Cổng ra của lõi chưa chọn vật phẩm')
                : tr('Đầu ra chưa gán item (máy chưa chạy công thức nào?)');
      continue;
    }
    const names = items.map((i) => itemName(ds, i)).join(', ');
    // ống chỉ chở **một** chất (người dùng 2026-09-29) — gộp hai chất vào một ống thì kẹt
    if (l.kind === 'pipe' && items.length > 1) {
      flow.invalid = tr('Ống chỉ chở được một chất — đang lẫn {0} ⇒ kẹt', names);
      continue;
    }
    const toActivator = dst.activatorPort === l.to.portKey;
    if (dst.role === 'generator') {
      if (items.length > 1) {
        flow.invalid = tr('Băng lẫn nhiều món vào trạm điện ({0}) ⇒ kẹt', names);
        continue;
      }
      if (!ds.items.get(items[0]!)?.fuel) {
        flow.invalid = tr('Trạm điện không đốt được {0}', itemName(ds, items[0]!));
        continue;
      }
    }
    if (dst.disposal) {
      const bad = items.find((i) => !dst.disposal!.items.has(i));
      if (bad) {
        const ok = [...dst.disposal.items].map((i) => itemName(ds, i)).join(', ');
        const verb = dst.machineId === SEWAGE.inlet ? tr('chỉ nhận') : tr('chỉ loại bỏ');
        flow.invalid = tr('{0} {1} {2} — không nhận {3}', ds.machines.get(dst.machineId)?.name ?? tr('Máy'), verb, ok, itemName(ds, bad));
        continue;
      }
    }
    if (dst.role === 'crafter' && !toActivator) {
      if (dst.needSet.size === 0) {
        flow.invalid = tr('Đầu vào chưa gán item (máy chưa chọn công thức?)');
        continue;
      }
      // Máy thường chạy 1 công thức một lúc và không có chỗ chứa món ngoài công thức: băng lẫn
      // nhiều món (sushi belt) ⇒ món chưa tới lượt ứ ở cổng ⇒ coi như **kẹt** (người dùng chốt).
      if (!dst.crucible && items.length > 1) {
        flow.invalid = tr('Băng lẫn nhiều món ({0}) vào máy thường ⇒ kẹt — máy chỉ chạy một công thức, không có chỗ chứa món khác', names);
        continue;
      }
      const bad = items.find((i) => !dst.needSet.has(i));
      if (bad) {
        const wants = [...dst.needSet].map((i) => itemName(ds, i)).join(', ');
        flow.invalid = tr('Hai đầu chở khác nhau: {0} → máy chỉ dùng {1}', itemName(ds, bad), wants);
        continue;
      }
    } else if (dst.filter?.item) {
      // cảng kiểm soát: món khác món lọc chặn ở đầu cảng ⇒ **cả tuyến vào nghẽn**
      const bad = items.find((i) => i !== dst.filter!.item);
      if (bad) {
        flow.invalid = tr('Cảng kiểm soát chỉ cho {0} qua — gặp {1} nên cả tuyến bị nghẽn', itemName(ds, dst.filter.item), itemName(ds, bad));
        continue;
      }
    } else if (!dst.acceptsAll && !dst.passthrough && !toActivator && dst.role !== 'depotIn' && dst.role !== 'generator') {
      const dstItem = dst.binding[l.to.portKey] ?? null;
      if (!dstItem) {
        flow.invalid = tr('Đầu vào chưa gán item');
        continue;
      }
      if (dstItem !== items[0]) {
        flow.invalid = tr('Hai đầu chở khác nhau: {0} → {1}', names, itemName(ds, dstItem));
        continue;
      }
    }
    if (toActivator && kindOfItem(ds, items[0]!) !== 'pipe') {
      flow.invalid = tr('Cổng kích hoạt chỉ nhận khí hoặc chất lỏng');
      continue;
    }
    for (const itemId of items)
      edges.push({
        id: items.length === 1 ? l.id : `${l.id}|${itemId}`,
        chainId: l.id,
        from: l.from,
        to: l.to,
        itemId,
        capacity: flow.capacity,
        src,
        dst,
        toActivator,
      });
  }

  const pk = (uid: number, key: PortKey): string => `${uid}:${key}`;
  const fromPort = new Map<string, Edge[]>();
  const toPort = new Map<string, Edge[]>();
  /**
   * Van / cầu: "kênh" = một món đi qua van (van tách / gộp / cảng kiểm soát: cả van là một kênh;
   * cầu: mỗi trục một kênh). Tuyến vào và tuyến ra của từng kênh.
   */
  const chanKey = (p: Prepared, port: PortKey, dir: 'in' | 'out', itemId: string): string =>
    p.role === 'bridge'
      ? `${p.uid}:${dir === 'out' ? port : (p.bridgeOutOf.get(port) ?? port)}:${itemId}`
      : `${p.uid}:${itemId}`;
  const chanIn = new Map<string, Edge[]>();
  const chanOut = new Map<string, Edge[]>();
  /** Chuỗi chở lẫn nhiều món: các tuyến (mỗi món một) dùng chung sức chở của chuỗi. */
  const chainGroups = new Map<string, Edge[]>();
  for (const e of edges) {
    pushTo(fromPort, pk(e.from.uid, e.from.portKey), e);
    pushTo(toPort, pk(e.to.uid, e.to.portKey), e);
    if (e.dst.passthrough) pushTo(chanIn, chanKey(e.dst, e.to.portKey, 'in', e.itemId), e);
    if (e.src.passthrough) pushTo(chanOut, chanKey(e.src, e.from.portKey, 'out', e.itemId), e);
    pushTo(chainGroups, e.chainId, e);
  }
  for (const [k, list] of chainGroups) if (list.length < 2) chainGroups.delete(k);

  /**
   * Rót `total` vào các ô có sức chứa `caps`: chia đều, ô nào đầy trước thì phần dư sang ô khác.
   * Dùng cho van tách (120 vào 3 nhánh, một nhánh bị cảng kiểm soát giới hạn 6 ⇒ 6 + 57 + 57 —
   * ví dụ của người dùng), cho lượng máy chịu nhận, và cho sức chở chung của băng lẫn món.
   */
  const waterFill = (total: number, caps: number[]): number[] => {
    const order = caps.map((c, i) => ({ c: Math.max(0, c), i })).sort((a, b) => a.c - b.c);
    const out = caps.map(() => 0);
    let remaining = Math.max(0, total);
    order.forEach(({ c, i }, k) => {
      const give = Math.min(c, remaining / (order.length - k));
      out[i] = give;
      remaining -= give;
    });
    return out;
  };
  /**
   * Chia sức nhận `total` cho các tuyến vào: **ưu tiên** theo lượng mỗi tuyến đang đưa tới
   * (`offers`), rồi phần **còn dư** chia tiếp cho các tuyến tới sức chở của chúng (`caps`).
   *
   * Không được dừng ở bước đầu: nếu mức nhận của một tuyến bị chặn đúng bằng lượng nó đang đưa
   * tới thì máy phía trước không bao giờ tăng sản lượng được nữa — một lần hụt tạm thời lúc giải
   * là bị khoá luôn ở mức thấp, rồi kéo cả dây chuyền về 0 ("bánh cóc"). Lỗi thật: map "Full wlsc
   * map" của người dùng 2026-09-29 — 2 Lò Mở Rộng xả Xircon Trơ Thải qua một van gộp ống vào Bộ
   * Cấp Nước; Lò #47 hụt một nhịp (trễ ở cầu) ⇒ van chỉ cho thoát đúng phần đang tới ⇒ lò tự
   * hãm dần ⇒ pin WLSC không bao giờ ra.
   */
  const fillWithSpare = (total: number, offers: number[], caps: number[]): number[] => {
    const alloc = waterFill(total, offers.map((o, k) => Math.min(o, caps[k]!)));
    const left = total - alloc.reduce((a, b) => a + b, 0);
    if (left > EPS) waterFill(left, caps.map((c, k) => c - alloc[k]!)).forEach((v, k) => (alloc[k] = alloc[k]! + v));
    return alloc;
  };

  // khí nào đang chảy vào cổng kích hoạt của máy nào — quyết định loại môi trường
  const activatorItem = new Map<number, string | null>();
  for (const e of edges) if (e.toActivator) activatorItem.set(e.dst.uid, e.itemId);
  const env = computeEnv(bp, ds, activatorItem);

  const util = new Map<number, number>();
  for (const p of prepared.values())
    util.set(p.uid, p.role === 'crafter' ? (p.procs.length > 0 ? 1 : 0) : 1);

  /** Máy chế biến: hệ số chạy của từng tiến trình (công thức đã tích). */
  const procUtil = new Map<number, number[]>();
  for (const p of prepared.values()) if (p.role === 'crafter') procUtil.set(p.uid, p.procs.map(() => 1));

  /**
   * Lượng gộp mỗi phút của một máy chế biến ở hệ số chạy `us`: tổng cần và tổng làm ra của
   * mọi tiến trình. Phần trao đổi với bên ngoài là **hiệu** của hai cái: sản phẩm tiến trình
   * này dùng hết cho tiến trình kia thì không cần vào, cũng không cần ra.
   */
  const gross = (p: Prepared, us: number[]): { N: Map<string, number>; M: Map<string, number> } => {
    const N = new Map<string, number>();
    const M = new Map<string, number>();
    p.procs.forEach((pr, k) => {
      const u = us[k] ?? 0;
      for (const st of pr.recipe.ingredients) N.set(st.itemId, (N.get(st.itemId) ?? 0) + st.count * pr.cycles * u);
      for (const st of pr.recipe.outcomes) M.set(st.itemId, (M.get(st.itemId) ?? 0) + st.count * pr.cycles * u);
    });
    return { N, M };
  };
  /** Cần lấy từ ngoài / đẩy ra ngoài, theo hệ số chạy hiện tại (tính lại mỗi vòng). */
  const extNeed = new Map<number, Map<string, number>>();
  const extMake = new Map<number, Map<string, number>>();
  const refreshExt = (p: Prepared): void => {
    const { N, M } = gross(p, procUtil.get(p.uid) ?? []);
    const needs = new Map<string, number>();
    const makes = new Map<string, number>();
    for (const [i, n] of N) needs.set(i, Math.max(0, n - (M.get(i) ?? 0)));
    for (const [i, mk] of M) makes.set(i, Math.max(0, mk - (N.get(i) ?? 0)));
    extNeed.set(p.uid, needs);
    extMake.set(p.uid, makes);
  };
  for (const p of prepared.values()) if (p.role === 'crafter') refreshExt(p);
  const rate = new Map<string, number>();
  const acceptOf = new Map<string, number>();
  /**
   * Lò làm bộ chuyển: lượng món đi xuyên mà các tuyến ra (chở món đó) nhận được — lò nhận thêm
   * đúng chừng đó từ phía trước; và lượng đang thực sự đi xuyên ra.
   */
  const passDemand = (p: Prepared, itemId: string): number => {
    if (!p.pass.has(itemId)) return 0;
    let sum = 0;
    for (const key of p.outPorts.get(itemId) ?? [])
      for (const e of fromPort.get(pk(p.uid, key)) ?? []) sum += acceptOf.get(e.id) ?? 0;
    return sum;
  };
  const passOut = new Map<number, Map<string, number>>();
  // Bắt đầu **lạc quan** (tối đa sức chở các tuyến vào), như máy chế biến bắt đầu ở 100%. Bắt
  // đầu từ 0 thì máy phía sau tưởng thiếu hàng, hạ nhu cầu, rồi kẹt luôn ở mức thấp (2 băng
  // 30/phút vào lò, lò dùng 30, mà chỉ chuyển được 15 sang lò sau — lỗi người dùng báo).
  for (const p of prepared.values()) {
    if (p.pass.size === 0) continue;
    const start = new Map<string, number>();
    for (const itemId of p.pass) {
      let cap = 0;
      for (const key of p.inPorts.get(itemId) ?? []) for (const e of toPort.get(pk(p.uid, key)) ?? []) if (e.itemId === itemId) cap += e.capacity;
      start.set(itemId, cap);
    }
    passOut.set(p.uid, start);
  }
  /**
   * Giải **2 pha** — tránh "bẫy nghiệm thấp" của chuỗi khép kín:
   *  - pha 1: máy chế biến xin hàng theo **tiềm năng** — chạy được bao nhiêu nếu đủ nguyên liệu,
   *    chỉ bị hãm bởi đầu ra / điện / môi trường / chế độ (`procPot`). Một lần hụt tạm thời lúc
   *    giải không kéo nhu cầu xuống được nên cả chuỗi lên đúng mức cao nhất khả thi;
   *  - pha 2: từ trạng thái đó xin hàng theo **tốc độ thật** (như trước) để chỗ thiếu hàng thật
   *    (vd. thiếu một nguyên liệu khác) vẫn hãm đúng phía trước. Vòng khép kín mà pha 1 đã đưa
   *    lên cao thì đứng yên ở đó.
   * Trước đây chỉ có pha 2: chuỗi 2 Lò Mở Rộng + Máy Đóng Gói của người dùng kẹt ở 50%.
   */
  // Lượng một tuyến có thể đưa tới: van / cầu — phần của kênh chia đều cho các tuyến ra của
  // kênh; máy — toàn bộ sản lượng món đó (máy tự chia cho các tuyến ở bước 5).
  const offerOf0 = (e: Edge): number => {
    if (e.src.passthrough) {
      const key = chanKey(e.src, e.from.portKey, 'out', e.itemId);
      return (through.get(key) ?? 0) / Math.max(1, chanOut.get(key)?.length ?? 1);
    }
    return supplyOf(e.src, e.itemId);
  };
  /** Cửa Nạp ống ngầm đã ghép với một Cửa Xả (không phải nguồn vô hạn) → Cửa Xả đó. */
  const udOutlet = new Map<number, Prepared>();
  for (const p of prepared.values()) {
    if (p.role !== 'udpipeIn' || p.pairTarget === null) continue;
    const out = prepared.get(p.pairTarget);
    if (out && out.role === 'udpipeOut' && !out.infinite) udOutlet.set(p.uid, out);
  }
  let phase: 1 | 2 = 1;
  /**
   * Ràng buộc chất kích hoạt bật **sau** khi dòng chảy đã đứng yên một lần (người dùng 2026-10-02, module
   * "Pyrrolite"): máy tự lấy kích hoạt từ chính sản phẩm của nó (qua cảng kiểm soát 6/phút) tạo một vòng có hệ
   * số đúng bằng 1 ⇒ mọi mức chạy đều là điểm cân bằng; một dao động tạm thời lúc mới giải (vòng 3: còn 1,4/6)
   * khiến máy kẹt mãi ở 65 %. Giải trước như mọi cổng kích hoạt đủ, rồi mới siết ⇒ bộ giải dừng ở điểm cân
   * bằng **cao nhất** (như game: đã chạy thì tự nuôi được); nguồn kích hoạt thật sự thiếu vẫn hạ máy đúng mức.
   */
  let activatorOn = false;
  const procPot = new Map<number, number[]>();
  const needPot = new Map<number, Map<string, number>>();
  const refreshPot = (p: Prepared): void => {
    const { N, M } = gross(p, procPot.get(p.uid) ?? []);
    const needs = new Map<string, number>();
    for (const [i, n] of N) needs.set(i, Math.max(0, n - (M.get(i) ?? 0)));
    needPot.set(p.uid, needs);
  };
  for (const p of prepared.values())
    if (p.role === 'crafter') {
      procPot.set(p.uid, p.procs.map(() => 1));
      refreshPot(p);
    }
  const demandOf = (p: Prepared, itemId: string): number =>
    p.role === 'crafter'
      ? ((phase === 1 ? needPot : extNeed).get(p.uid)?.get(itemId) ?? 0) + passDemand(p, itemId)
      : (p.need.get(itemId) ?? 0) * (util.get(p.uid) ?? 0);
  const supplyOf = (p: Prepared, itemId: string): number =>
    p.role === 'crafter'
      ? (extMake.get(p.uid)?.get(itemId) ?? 0) + (passOut.get(p.uid)?.get(itemId) ?? 0)
      : (p.make.get(itemId) ?? 0) * (util.get(p.uid) ?? 0);

  /** Lượng qua van, theo uid. */
  const through = new Map<string, number>();
  // Van / cầu cũng bắt đầu **lạc quan** (bằng sức chở các tuyến vào). Bắt đầu từ 0 thì máy phía
  // sau van tưởng thiếu hàng ở vòng đầu, hạ nhu cầu, rồi cả chuỗi kẹt ở mức thấp (chuỗi 2 Lò Mở
  // Rộng → cầu → Máy Đóng Gói của người dùng đứng ở 50%).
  for (const [key, list] of chanIn) through.set(key, list.reduce((a, e) => a + e.capacity, 0));
  let iterations = 0;

  /** Lượng đang chảy vào các cổng `keys` — chỉ món `itemId` nếu có (băng có thể chở lẫn). */
  const supplyAt = (p: Prepared, keys: PortKey[], itemId?: string): number => {
    let sum = 0;
    for (const key of keys)
      for (const e of toPort.get(pk(p.uid, key)) ?? []) if (!itemId || e.itemId === itemId) sum += rate.get(e.id) ?? 0;
    return sum;
  };

  /**
   * Đầu ra hãm hệ số chạy `t` (sửa tại chỗ):
   *  - **Sản phẩm cuối** (không công thức nào trong máy dùng tiếp) mà không có cổng ra chở nó
   *    ⇒ kho máy đầy dần ⇒ **cả máy kẹt** (người dùng đã chốt).
   *  - **Món trung gian** (có công thức trong máy dùng tiếp, vd. Xiranite Lỏng trong Lò Mở Rộng):
   *    dư ra chỉ làm đầy ngăn của món đó ⇒ **chỉ các công thức làm ra nó** chậm lại cho khớp với
   *    lượng được dùng + lượng thoát ra cổng. Trước đây phần dư tạm thời lúc giải làm kẹt cả máy
   *    ⇒ chuỗi 2 Lò Mở Rộng của người dùng rơi về 0.
   */
  const limitByOutputs = (p: Prepared, t: number[]): void => {
    const g = gross(p, t);
    let scale = 1;
    for (const [itemId, made] of g.M) {
      const used = g.N.get(itemId) ?? 0;
      const net = made - used;
      if (net <= EPS) continue;
      let drain = 0;
      for (const key of p.outPorts.get(itemId) ?? [])
        for (const e of fromPort.get(pk(p.uid, key)) ?? []) drain += acceptOf.get(e.id) ?? 0;
      const inner = p.procs.some((pr) => pr.recipe.ingredients.some((st) => st.itemId === itemId));
      if (inner) {
        const allowed = used + drain;
        if (made > allowed + EPS) {
          const f = Math.max(0, allowed / made);
          p.procs.forEach((pr, k) => {
            if (pr.recipe.outcomes.some((o) => o.itemId === itemId)) t[k] = t[k]! * f;
          });
        }
      } else {
        scale = Math.min(scale, drain / net);
      }
    }
    for (let k = 0; k < t.length; k++) t[k] = t[k]! * Math.max(0, Math.min(1, scale));
  };

  for (let it = 0; it < ITERATIONS; it++) {
    iterations = it + 1;

    const offerOf = offerOf0;
    // Cảng kiểm soát ống: tuyến ra không vượt tốc độ đã chọn (bội số của 6, ≤ 60)
    const capRate = (e: Edge, a: number): number => {
      const r = e.src.filter?.rate;
      return r != null ? Math.min(a, r) : a;
    };
    const accept = new Map<string, number>();

    // 1. tuyến vào **máy**: lượng máy chịu nhận của một món chia cho **mọi tuyến chở món đó vào
    //    máy** (không phải theo từng cổng — 2 băng cùng món vào 2 cổng từng được nhận gấp đôi),
    //    rót đầy theo lượng mỗi tuyến có thể đưa tới.
    const groups = new Map<string, Edge[]>();
    const disposalIn = new Map<number, Edge[]>();
    const udIn = new Map<number, Edge[]>();
    for (const e of edges) {
      if (e.dst.passthrough) continue;
      let a = e.capacity;
      if (freeOutputs) {
        // đo khả năng thật của đầu vào: phía sau không hãm gì cả
      } else if (e.toActivator) {
        a = Math.min(e.capacity, RATES.activatorMaxPerMinute);
      } else if (e.dst.disposal) {
        // máy loại bỏ chất thải: mọi tuyến vào chia chung `rate`/phút (bên dưới)
        pushTo(disposalIn, e.dst.uid, e);
        continue;
      } else if (udOutlet.has(e.dst.uid)) {
        // Cửa Nạp ống ngầm đã ghép: chỉ nhận đúng lượng Cửa Xả đẩy ra được (kẹt truyền ngược qua cặp — người
        // dùng 2026-10-02; trước đây Cửa Nạp luôn nhận đủ dù Cửa Xả không nối ra đâu)
        pushTo(udIn, e.dst.uid, e);
        continue;
      } else if (!e.dst.acceptsAll) {
        pushTo(groups, `${e.dst.uid}:${e.itemId}`, e);
        continue;
      }
      accept.set(e.id, capRate(e, a));
    }
    for (const [uid, list] of udIn) {
      const outlet = udOutlet.get(uid)!;
      const drain = edges.filter((x) => x.src.uid === outlet.uid).reduce((a, x) => a + (acceptOf.get(x.id) ?? x.capacity), 0);
      fillWithSpare(drain, list.map(offerOf), list.map((x) => x.capacity)).forEach((v, k) =>
        accept.set(list[k]!.id, capRate(list[k]!, Math.min(list[k]!.capacity, v))),
      );
    }
    for (const list of disposalIn.values()) {
      const d = list[0]!.dst;
      // phải có điện mới xử lý (người dùng 2026-09-29) — mất điện thì không nhận gì, tuyến vào ứ lại
      const off = (enforcePower && d.needsPower && !env.powered.has(d.uid)) || (blackout && d.needsPower);
      fillWithSpare(off ? 0 : d.disposal!.rate, list.map(offerOf), list.map((e) => e.capacity)).forEach((v, k) =>
        accept.set(list[k]!.id, capRate(list[k]!, Math.min(list[k]!.capacity, v))),
      );
    }
    for (const list of groups.values()) {
      const demand = demandOf(list[0]!.dst, list[0]!.itemId);
      // ưu tiên tuyến đang đưa hàng tới, phần nhận còn dư chia tiếp cho mọi tuyến — xem `fillWithSpare`
      fillWithSpare(demand, list.map(offerOf), list.map((e) => e.capacity)).forEach((v, k) =>
        accept.set(list[k]!.id, capRate(list[k]!, Math.min(list[k]!.capacity, v))),
      );
    }

    // 2. tuyến vào **van / cầu / cảng kiểm soát**: nhận bằng tổng lượng các tuyến ra của kênh chịu
    //    nhận — lực hãm của phía sau truyền ngược qua van (van gộp: cộng dồn nhưng không vượt sức
    //    chở của tuyến ra — 120 ống / 30 băng; van không nối ra đâu: không nhận gì). Van nối van thì
    //    dùng số của vòng trước.
    for (const [key, ins] of chanIn) {
      if (freeOutputs) {
        for (const e of ins) accept.set(e.id, capRate(e, e.capacity));
        continue;
      }
      const outs = chanOut.get(key) ?? [];
      const outAccept = outs.reduce((a, e) => a + (accept.get(e.id) ?? acceptOf.get(e.id) ?? e.capacity), 0);
      fillWithSpare(outAccept, ins.map(offerOf), ins.map((e) => e.capacity)).forEach((v, k) =>
        accept.set(ins[k]!.id, capRate(ins[k]!, Math.min(ins[k]!.capacity, v))),
      );
    }

    // 3. chuỗi băng chở **lẫn nhiều món**: các món chia nhau sức chở của chuỗi, theo lượng mỗi
    //    món đang có
    for (const list of chainGroups.values()) {
      const cap = list[0]!.capacity;
      const want = list.map((e) => accept.get(e.id) ?? 0);
      if (want.reduce((a, b) => a + b, 0) <= cap + EPS) continue;
      const caps = list.map((e, k) => {
        const o = offerOf(e);
        return Math.min(want[k]!, o > EPS ? o : want[k]!);
      });
      const alloc = waterFill(cap, caps);
      const left = cap - alloc.reduce((a, b) => a + b, 0);
      if (left > EPS) waterFill(left, want.map((w, k) => w - alloc[k]!)).forEach((v, k) => (alloc[k] = alloc[k]! + v));
      list.forEach((e, k) => accept.set(e.id, Math.min(want[k]!, alloc[k]!)));
    }
    for (const [id, a] of accept) acceptOf.set(id, a);

    // tổng khả năng nhận của mọi tuyến cùng chở một món ra khỏi một máy — để chia sản lượng
    const acceptSum = new Map<string, number>();
    for (const e of edges) {
      if (e.src.passthrough) continue;
      const k = `${e.src.uid}:${e.itemId}`;
      acceptSum.set(k, (acceptSum.get(k) ?? 0) + (acceptOf.get(e.id) ?? 0));
    }

    // 4. van tách / cầu: lượng qua kênh **rót vào các tuyến ra** — chia đều theo số nhánh đã nối,
    //    nhánh nào nhận ít hơn phần chia thì phần dư sang nhánh khác (120 ⇒ 3 nhánh: 40 × 3; một
    //    nhánh bị cảng kiểm soát giới hạn 6 ⇒ 6 + 57 + 57 — ví dụ của người dùng)
    const chanShare = new Map<string, number>();
    for (const [key, outs] of chanOut) {
      const alloc = waterFill(through.get(key) ?? 0, outs.map((e) => acceptOf.get(e.id) ?? 0));
      outs.forEach((e, k) => chanShare.set(e.id, alloc[k]!));
    }

    // 5. lượng chảy trên từng tuyến
    for (const e of edges) {
      const a = acceptOf.get(e.id) ?? 0;
      let offer: number;
      if (e.src.passthrough) offer = chanShare.get(e.id) ?? 0;
      else {
        // Máy đẩy một món qua **nhiều cổng** thì sản lượng chia cho các tuyến theo sức nhận của
        // từng tuyến — không phải mỗi tuyến được trọn sản lượng.
        const sum = acceptSum.get(`${e.src.uid}:${e.itemId}`) ?? 0;
        offer = sum > EPS ? (supplyOf(e.src, e.itemId) * a) / sum : 0;
      }
      rate.set(e.id, Math.max(0, Math.min(offer, a)));
    }

    // cặp ống ngầm: đầu ra đẩy ra đúng lượng đầu vào ghép cặp nhận được
    let maxDelta = 0;
    // Cửa Xả Phụ Phẩm: tổng Nước Thải mọi cửa nạp đang nhận ÷ `SEWAGE.ratio`
    {
      let sewage = 0;
      for (const p of prepared.values()) if (p.machineId === SEWAGE.inlet) sewage += supplyAt(p, p.openInPorts);
      for (const p of prepared.values()) {
        if (p.machineId !== SEWAGE.outlet) continue;
        const next = (sewage / SEWAGE.ratio) * 1;
        maxDelta = Math.max(maxDelta, Math.abs(next - (p.make.get(SEWAGE.output) ?? 0)));
        p.make.set(SEWAGE.output, next);
      }
    }
    for (const p of prepared.values()) {
      if (p.role !== 'udpipeOut' || p.infinite) continue;
      const src = p.pairTarget !== null ? prepared.get(p.pairTarget) : undefined;
      const received = src && src.role === 'udpipeIn' ? supplyAt(src, src.openInPorts) : 0;
      for (const itemId of p.make.keys()) {
        maxDelta = Math.max(maxDelta, Math.abs(received - (p.make.get(itemId) ?? 0)));
        p.make.set(itemId, received);
      }
    }

    // van / cầu: hàng vào bao nhiêu thì ra bấy nhiêu — từng kênh, từng món. Lượng qua van cũng
    // phải vào tiêu chí hội tụ, nếu không bản vẽ toàn van "hội tụ" ngay khi mọi tuyến còn bằng 0.
    for (const [key, list] of chanIn) {
      const next = list.reduce((a, e) => a + (rate.get(e.id) ?? 0), 0);
      maxDelta = Math.max(maxDelta, Math.abs(next - (through.get(key) ?? 0)));
      through.set(key, next);
    }

    for (const p of prepared.values()) {
      if (p.role !== 'crafter') continue;
      const us = procUtil.get(p.uid)!;
      // bộ chuyển: phần món đi xuyên chảy vào mà công thức không dùng hết thì đi thẳng ra —
      // **kể cả khi lò mất điện** (người dùng chốt 2026-09-29): chuyển tiếp không cần điện
      if (p.pass.size > 0) {
        const outs = new Map<string, number>();
        for (const itemId of p.pass) {
          const arrived = supplyAt(p, p.inPorts.get(itemId) ?? [], itemId);
          const next = Math.min(passDemand(p, itemId), Math.max(0, arrived - (extNeed.get(p.uid)?.get(itemId) ?? 0)));
          maxDelta = Math.max(maxDelta, Math.abs(next - (passOut.get(p.uid)?.get(itemId) ?? 0)));
          outs.set(itemId, next);
        }
        passOut.set(p.uid, outs);
      }
      if (p.procs.length === 0) {
        util.set(p.uid, 0);
        continue;
      }
      // giới hạn chung cho cả máy
      let common = 1;
      // không có điện thì không chạy — máy chỉ cần *chạm* vào tầm cột/trụ là đủ;
      // và mất điện toàn nhà máy thì mọi máy cần điện đều dừng
      if (enforcePower && p.needsPower && !env.powered.has(p.uid)) common = 0;
      if (blackout && p.needsPower) common = 0;
      // cổng kích hoạt: đủ mức sàn thì 100%, dưới sàn thì chậm theo tỉ lệ
      if (p.activatorPort && activatorOn) common = Math.min(common, activatorFactor(supplyAt(p, [p.activatorPort])));

      // Lượng trung gian làm ra trong máy: tính **từ trên xuống** (bắt đầu như mọi công thức chạy
      // 100%, rồi lặp tới khi đứng yên) — vòng khép kín giữa các công thức trong máy (Xiranite
      // Lỏng + Nước Thải ⇄ Xircon Thải + Bột Sắt) không bị khoá ở mức thấp như khi lấy theo `us`.
      let M = gross(p, p.procs.map(() => 1)).M;
      const avail = (itemId: string): number => supplyAt(p, p.inPorts.get(itemId) ?? [], itemId) + (M.get(itemId) ?? 0);

      // 1. mỗi tiến trình một mình chạy được bao nhiêu
      const alone = p.procs.map((pr) => {
        let f = common;
        // công thức thuộc chế độ khác thì máy không nhận
        if (pr.recipe.mode !== null && pr.recipe.mode !== (p.mode ?? 'A')) f = 0;
        // môi trường xúc tác: công thức đòi hỏi mà máy không nằm trọn trong vùng ⇒ không chạy
        if (pr.recipe.catalystEnv !== 'None' && (env.envOf.get(p.uid) ?? 'None') !== pr.recipe.catalystEnv) f = 0;
        for (const st of pr.recipe.ingredients) {
          const req = st.count * pr.cycles;
          if (req > EPS) f = Math.min(f, avail(st.itemId) / req);
        }
        return Math.max(0, Math.min(1, f));
      });
      // 2. vật tư dùng chung: chia theo phần mà các tiến trình chạy được muốn lấy
      const want = new Map<string, number>();
      p.procs.forEach((pr, k) => {
        for (const st of pr.recipe.ingredients)
          want.set(st.itemId, (want.get(st.itemId) ?? 0) + st.count * pr.cycles * alone[k]!);
      });
      const target = p.procs.map((pr, k) => {
        let share = 1;
        for (const st of pr.recipe.ingredients) {
          const w = want.get(st.itemId) ?? 0;
          if (w > EPS) share = Math.min(share, avail(st.itemId) / w);
        }
        return alone[k]! * Math.min(1, share);
      });
      // lặp phần trong máy: sản lượng trung gian theo kết quả vừa tính, tới khi đứng yên
      for (let inner = 0; inner < 40; inner++) {
        M = gross(p, target).M;
        const again = p.procs.map((pr, k) => {
          let f = alone[k]! > 0 || common > 0 ? common : 0;
          if (pr.recipe.mode !== null && pr.recipe.mode !== (p.mode ?? 'A')) f = 0;
          if (pr.recipe.catalystEnv !== 'None' && (env.envOf.get(p.uid) ?? 'None') !== pr.recipe.catalystEnv) f = 0;
          for (const st of pr.recipe.ingredients) {
            const req = st.count * pr.cycles;
            if (req > EPS) f = Math.min(f, avail(st.itemId) / req);
          }
          return Math.max(0, Math.min(1, f));
        });
        const w2 = new Map<string, number>();
        p.procs.forEach((pr, k) => {
          for (const st of pr.recipe.ingredients) w2.set(st.itemId, (w2.get(st.itemId) ?? 0) + st.count * pr.cycles * again[k]!);
        });
        let moved = 0;
        p.procs.forEach((pr, k) => {
          let share = 1;
          for (const st of pr.recipe.ingredients) {
            const w = w2.get(st.itemId) ?? 0;
            if (w > EPS) share = Math.min(share, avail(st.itemId) / w);
          }
          const v = again[k]! * Math.min(1, share);
          moved = Math.max(moved, Math.abs(v - target[k]!));
          target[k] = v;
        });
        if (moved < 1e-9) break;
      }
      // 3. đầu ra: sản phẩm dư (làm ra nhiều hơn dùng trong máy) phải thoát được — xem
      //    `limitByOutputs`
      if (!freeOutputs) limitByOutputs(p, target);
      // tiềm năng (pha 1): như trên nhưng coi như đủ mọi nguyên liệu
      {
        const pot = p.procs.map((pr) => {
          let f = common;
          if (pr.recipe.mode !== null && pr.recipe.mode !== (p.mode ?? 'A')) f = 0;
          if (pr.recipe.catalystEnv !== 'None' && (env.envOf.get(p.uid) ?? 'None') !== pr.recipe.catalystEnv) f = 0;
          return Math.max(0, Math.min(1, f));
        });
        if (!freeOutputs) limitByOutputs(p, pot);
        const cur = procPot.get(p.uid)!;
        for (let k = 0; k < cur.length; k++) {
          const next = cur[k]! + DAMPING * (pot[k]! - cur[k]!);
          if (phase === 1) maxDelta = Math.max(maxDelta, Math.abs(next - cur[k]!));
          cur[k] = next;
        }
        refreshPot(p);
      }
      let top = 0;
      for (let k = 0; k < us.length; k++) {
        const next = us[k]! + DAMPING * (target[k]! - us[k]!);
        maxDelta = Math.max(maxDelta, Math.abs(next - us[k]!));
        us[k] = next;
        top = Math.max(top, next);
      }
      util.set(p.uid, top);
      refreshExt(p);
    }
    if (!activatorOn && (maxDelta < 1e-10 || it >= ITERATIONS / 4)) {
      activatorOn = true; // dòng chảy đã ổn định khi mọi máy được kích hoạt đủ ⇒ giờ mới siết
      continue;
    }
    if (maxDelta < 1e-10 || (phase === 1 && it >= ITERATIONS / 2)) {
      if (phase === 1) {
        phase = 2; // pha 1 đã đứng yên: chuyển sang nhu cầu theo tốc độ thật
        continue;
      }
      break;
    }
  }

  // ------------------------------------------------------------------ kết quả
  const machines = new Map<number, MachineFlow>();
  const balance = new Map<string, { produced: number; consumed: number }>();
  const depot = new Map<string, { in: number; out: number }>();
  const bump = (
    map: Map<string, Record<string, number>>,
    itemId: string,
    field: string,
    v: number,
  ): void => {
    const b = map.get(itemId) ?? {};
    b[field] = (b[field] ?? 0) + v;
    map.set(itemId, b);
  };

  let powerDraw = 0;
  let powerGen = 0;
  for (const p of prepared.values()) {
    const u = util.get(p.uid) ?? 0;
    // máy đã nối điện thì ăn điện kể cả khi đang ngủ — "hoang phí điện"
    if (p.needsPower && env.powered.has(p.uid)) powerDraw += p.power;

    // trạm điện: phát theo tỉ lệ thời gian có nhiên liệu cháy, tối đa một đơn vị một lúc
    let generation = 0;
    if (p.role === 'generator') {
      let burning = 0;
      for (const [itemId, need] of p.need) {
        const fuel = ds.items.get(itemId)?.fuel;
        if (!fuel || need <= EPS) continue;
        const frac = Math.min(1, supplyAt(p, p.inPorts.get(itemId) ?? [], itemId) / need);
        const room = Math.max(0, 1 - burning);
        const used = Math.min(frac, room);
        burning += used;
        generation += fuel.power * p.count * used;
      }
      powerGen += generation;
    }

    const inputs: FlowEntry[] = [];
    if (p.acceptsAll || p.passthrough) {
      const arrived = new Map<string, number>();
      for (const key of p.openInPorts)
        for (const e of toPort.get(pk(p.uid, key)) ?? [])
          arrived.set(e.itemId, (arrived.get(e.itemId) ?? 0) + (rate.get(e.id) ?? 0));
      for (const [itemId, actual] of arrived) inputs.push({ itemId, nominal: actual, actual });
    } else if (p.role === 'crafter') {
      // chỉ phần trao đổi với bên ngoài; danh nghĩa = mọi tiến trình chạy 100%
      const full = gross(p, p.procs.map(() => 1));
      for (const [itemId, n] of full.N) {
        const nominal = Math.max(0, n - (full.M.get(itemId) ?? 0));
        if (nominal <= EPS) continue;
        inputs.push({
          itemId,
          // món vừa dùng vừa đi xuyên: danh nghĩa gồm cả phần chuyển tiếp
          nominal: nominal + passDemand(p, itemId),
          actual: Math.min(supplyAt(p, p.inPorts.get(itemId) ?? [], itemId), demandOf(p, itemId)),
        });
      }
      // món đi xuyên (bộ chuyển) mà không công thức nào đang dùng: vẫn là đầu vào thật
      for (const itemId of p.pass) {
        if (inputs.some((e) => e.itemId === itemId)) continue;
        const actual = Math.min(supplyAt(p, p.inPorts.get(itemId) ?? [], itemId), demandOf(p, itemId));
        inputs.push({ itemId, nominal: actual, actual });
      }
    } else {
      for (const [itemId, nominal] of p.need)
        inputs.push({
          itemId,
          nominal,
          actual: Math.min(supplyAt(p, p.inPorts.get(itemId) ?? [], itemId), nominal * u),
        });
    }

    const outputs: FlowEntry[] = [];
    if (p.passthrough) {
      for (const key of p.openOutPorts)
        for (const e of fromPort.get(pk(p.uid, key)) ?? [])
          outputs.push({ itemId: e.itemId, nominal: 0, actual: rate.get(e.id) ?? 0 });
    } else if (p.role === 'crafter') {
      const full = gross(p, p.procs.map(() => 1));
      for (const [itemId, mk] of full.M) {
        const nominal = Math.max(0, mk - (full.N.get(itemId) ?? 0));
        if (nominal <= EPS) continue;
        outputs.push({ itemId, nominal, actual: supplyOf(p, itemId) });
      }
      for (const itemId of p.pass) {
        const actual = passOut.get(p.uid)?.get(itemId) ?? 0;
        outputs.push({ itemId, nominal: actual, actual });
      }
    } else {
      for (const [itemId, nominal] of p.make) {
        // nguồn và máy rút kho chỉ thực sự đẩy ra được lượng mà tuyến phía sau nhận
        let actual = nominal * u;
        if (p.role === 'source' || p.role === 'depotOut' || p.role === 'udpipeOut' || p.depotSource) {
          let shipped = 0;
          for (const key of p.outPorts.get(itemId) ?? [])
            for (const e of fromPort.get(pk(p.uid, key)) ?? []) shipped += rate.get(e.id) ?? 0;
          actual = Math.min(actual, shipped);
        }
        outputs.push({ itemId, nominal, actual });
      }
    }

    // Cặp ống ngầm chỉ **chuyển** hàng: đầu vào không tiêu thụ, đầu ra không sản xuất.
    // Đếm cả hai đầu thì bảng cân bằng báo gấp đôi lượng thật đang chảy. Đầu ra đặt
    // nguồn vô hạn thì khác — đó là nguồn thật, phải tính.
    const transferIn = p.role === 'udpipeIn';
    const transferOut = p.role === 'udpipeOut' && !p.infinite;
    if (!p.passthrough) {
      if (!transferIn) for (const e of inputs) bump(balance as never, e.itemId, 'consumed', e.actual);
      if (!transferOut) for (const e of outputs) bump(balance as never, e.itemId, 'produced', e.actual);
    }
    // lõi (Lõi Tự Động Hoá / Lõi Giao Thức-Phụ) dùng **chung kho tổng**: đưa vào lõi = nạp vào kho
    // tổng (người dùng 2026-09-29)
    // nạp vào kho tổng (người dùng 2026-10-04): hàng **rắn** đưa vào Máy Nâng Hàng Kho, Lõi Tự Động Hoá / Lõi Giao
    // Thức-Phụ, hoặc **Kho Lưu Trữ Giao Thức**
    if (p.role === 'depotIn' || p.depotSource || p.machineId === DEPOT_STASH)
      for (const e of inputs) if (kindOfItem(ds, e.itemId) === 'belt') bump(depot as never, e.itemId, 'in', e.actual);
    if (p.role === 'depotOut' || p.depotSource) for (const e of outputs) bump(depot as never, e.itemId, 'out', e.actual);

    const activator = p.activatorPort
      ? {
          itemId: (toPort.get(pk(p.uid, p.activatorPort)) ?? []).map((e) => e.itemId)[0] ?? null,
          supply: supplyAt(p, [p.activatorPort]),
          factor: activatorFactor(supplyAt(p, [p.activatorPort])),
        }
      : null;
    // Khí nạp vào cổng kích hoạt bị tiêu thụ thật, chỉ là không thành sản phẩm.
    // Không cộng vào đây thì bảng cân bằng báo dư ảo đúng bằng lượng đang bị đốt.
    if (activator?.itemId && activator.supply > 0)
      bump(balance as never, activator.itemId, 'consumed', activator.supply);

    // máy chỉ **đẩy hàng ra** (bơm, máy tách khí, cửa xả ống, máy dỡ kho, lõi — chọn món là ra, không tốn gì khác ngoài
    // điện): hệ số chạy = lượng thật đang ra ÷ lượng tối đa máy đẩy được (người dùng 2026-10-06: cửa xả ống tối đa 120
    // mà chỉ ra 60 ⇒ 50%, không phải 100%)
    let shown = u;
    if (p.role === 'source' || p.role === 'depotOut' || p.role === 'udpipeOut' || p.depotSource) {
      const nominal = outputs.reduce((a, o) => a + o.nominal, 0);
      // chưa chọn món / chưa ra được gì ⇒ 0%
      shown = nominal > EPS ? Math.max(0, Math.min(1, outputs.reduce((a, o) => a + o.actual, 0) / nominal)) : 0;
    }

    machines.set(p.uid, {
      uid: p.uid,
      machineId: p.machineId,
      role: p.role,
      recipeId: p.recipe?.id ?? null,
      recipes: p.procs.map((pr, k) => ({ recipeId: pr.recipe.id, utilization: procUtil.get(p.uid)?.[k] ?? 0 })),
      running: [],
      auto: p.auto,
      outBinding: Object.fromEntries(Object.entries(p.binding).filter(([k]) => k.startsWith('out'))),
      utilization: shown,
      cyclesPerMinute:
        p.role === 'crafter'
          ? p.procs.reduce((sum, pr, k) => sum + (pr.cycles * (procUtil.get(p.uid)?.[k] ?? 0)), 0)
          : p.cyclesPerMinute * u,
      inputs,
      outputs,
      activator,
      env: env.envOf.get(p.uid) ?? 'None',
      envRequired: p.recipe?.catalystEnv ?? 'None',
      // luôn tính để hiển thị icon mất điện, kể cả khi tắt kiểm tra
      powered: p.needsPower ? env.powered.has(p.uid) : null,
      limitedBy: null, // điền ở `solve()` sau lượt giải thông đầu ra
      generation,
      onBus: p.role === 'depotIn' || p.role === 'depotOut' ? p.onBus : null,
      bottleneck: diagnose(ds, p, inputs, outputs, u, fromPort, pk, activator, env, enforcePower),
    });
  }

  // cặp ống ngầm: mỗi đầu hiện cả phía vào (Cửa Nạp) lẫn phía ra (Cửa Xả); Cửa Xả không đẩy ra hết ⇒ cả hai
  // đầu báo kẹt (người dùng 2026-10-02)
  for (const [inUid, outlet] of udOutlet) {
    const a = machines.get(inUid);
    const b = machines.get(outlet.uid);
    if (!a || !b) continue;
    // phía vào: danh nghĩa = lượng phía trước đưa tới (khi không bị hãm), thực = lượng nhận được
    const offered = new Map<string, number>();
    for (const e of edges) if (e.dst.uid === inUid) offered.set(e.itemId, (offered.get(e.itemId) ?? 0) + Math.min(e.capacity, offerOf0(e)));
    for (const i of a.inputs) i.nominal = Math.max(i.actual, offered.get(i.itemId) ?? i.actual);
    for (const o of b.outputs) o.nominal = Math.max(o.actual, offered.get(o.itemId) ?? o.nominal);
    a.pairOut = b.outputs;
    b.pairIn = a.inputs;
    const stuck = a.inputs.find((i) => i.actual < i.nominal - 1e-6);
    if (stuck && !freeOutputs) {
      const msg = tr('Kẹt: Cửa Xả ống ngầm chỉ đẩy ra được {0}/{1} mỗi phút — nối thêm chỗ nhận ở đầu ra', stuck.actual.toFixed(1), stuck.nominal.toFixed(1));
      a.bottleneck = msg;
      b.bottleneck = msg;
    }
  }

  for (const [uid, flow] of linkFlows) {
    const parts = edges.filter((e) => e.chainId === uid);
    if (parts.length > 0) {
      flow.rate = parts.reduce((a, e) => a + (rate.get(e.id) ?? 0), 0);
      flow.items = parts.map((e) => ({ itemId: e.itemId, rate: rate.get(e.id) ?? 0 }));
    }
    flow.saturated = flow.capacity > 0 && flow.rate >= flow.capacity - 1e-6;
  }

  for (const [itemId, b] of balance)
    balance.set(itemId, { produced: b.produced ?? 0, consumed: b.consumed ?? 0 });
  for (const [itemId, b] of depot) depot.set(itemId, { in: b.in ?? 0, out: b.out ?? 0 });

  return {
    machines,
    links: linkFlows,
    chainOf: network.chainOf,
    balance,
    depot,
    powerDraw,
    blackout: false,
    powerGen,
    powerBase: bp.basePower ?? DEFAULT_BASE_POWER,
    powerSupply: (bp.basePower ?? DEFAULT_BASE_POWER) + powerGen,
    env,
    warnings,
    iterations,
  };
}

function diagnose(
  ds: Dataset,
  p: Prepared,
  inputs: FlowEntry[],
  outputs: FlowEntry[],
  u: number,
  fromPort: Map<string, Edge[]>,
  pk: (uid: number, key: PortKey) => string,
  activator: MachineFlow['activator'],
  env: EnvField,
  enforcePower: boolean,
): string | null {
  if ((p.role === 'depotOut' || p.role === 'depotIn') && !p.onBus)
    return danglingBus.has(p.uid)
      ? tr('Đoạn tổng tuyến này chưa nối về Cổng Tổng Tuyến Kho Hàng — nối các đoạn chạm nhau thành một dải tới cổng')
      : tr('Chưa gắn vào tổng tuyến kho hàng — đặt sát tuyến, ở phía đối diện cổng băng');
  if (p.role === 'generator') {
    if (p.need.size === 0) return tr('Chưa có nhiên liệu — nối băng chở pin hoặc quặng originium vào');
    for (const i of inputs)
      if (i.actual < i.nominal - 1e-6)
        return tr('Thiếu nhiên liệu {0} ({1}/{2} mỗi phút)', itemName(ds, i.itemId), i.actual.toFixed(2), i.nominal.toFixed(2));
    return null;
  }
  if (p.role === 'source' || p.role === 'depotOut') {
    if (p.make.size === 0)
      return p.role === 'source' ? tr('Chưa khai báo sản lượng') : tr('Chưa chọn vật tư rút từ kho tổng');
    // vật tư đã chọn nhưng máy không có cổng nào hợp pha (đẩy vật rắn qua máy chỉ có ống)
    const orphan = [...p.make.keys()].find((itemId) => (p.outPorts.get(itemId) ?? []).length === 0);
    if (orphan)
      return tr('Máy này không có cổng {0} để đẩy {1}', kindOfItem(ds, orphan) === 'pipe' ? tr('ống') : tr('băng'), itemName(ds, orphan));
    return null;
  }
  if (p.role === 'envgen')
    return activator && activator.itemId
      ? activator.supply + 1e-9 < 6
        ? tr('Thiếu khí kích hoạt ({0}/6 mỗi phút)', activator.supply.toFixed(1))
        : null
      : tr('Chưa nạp khí — không tạo ra môi trường nào');
  if (p.role === 'udpipeIn')
    return p.pairTarget === null ? tr('Chưa ghép cặp với đầu ra ống ngầm') : null;
  if (p.role === 'udpipeOut') {
    if (p.infinite) return p.make.size > 0 ? null : tr('Nguồn vô hạn chưa chọn vật tư');
    return p.pairTarget !== null ? null : tr('Chưa ghép cặp với đầu vào ống ngầm');
  }
  if (p.role !== 'crafter') return null;
  // lò chỉ đang làm bộ chuyển trung gian (chưa chạy công thức nào) — không phải lỗi
  if (!p.recipe && p.pass.size > 0) return null;
  if (!p.recipe) return tr('Chưa có công thức nào — nối nguyên liệu vào (máy tự chạy công thức khớp) hoặc tích một công thức');
  if (enforcePower && p.needsPower && !env.powered.has(p.uid))
    return tr('Ngoài tầm cấp điện — đặt thêm cột hoặc trụ');
  if (p.recipe.mode !== null && p.recipe.mode !== p.mode)
    return tr('Công thức này thuộc chế độ {0}, máy đang ở chế độ {1}', p.recipe.mode, p.mode);
  if (u >= 1 - 1e-4) return null;

  if (p.recipe.catalystEnv !== 'None') {
    const have = env.envOf.get(p.uid) ?? 'None';
    if (have !== p.recipe.catalystEnv)
      return have === 'None'
        ? tr('Cần môi trường {0} — máy chưa nằm trọn trong vùng phủ nào', CATALYST_ENV_LABEL[p.recipe.catalystEnv])
        : tr('Cần môi trường {0}, đang ở môi trường {1}', CATALYST_ENV_LABEL[p.recipe.catalystEnv], CATALYST_ENV_LABEL[have]);
  }
  if (activator && activator.factor < 1 - 1e-6)
    return activator.supply <= EPS
      ? tr('Cổng kích hoạt chưa được nạp')
      : tr('Cổng kích hoạt thiếu ({0}/{1} mỗi phút)', activator.supply.toFixed(1), RATES.activatorFloorPerMinute);

  for (const o of outputs) {
    const ports = p.outPorts.get(o.itemId) ?? [];
    if (!ports.some((key) => (fromPort.get(pk(p.uid, key)) ?? []).length > 0))
      return tr('Sản phẩm {0} không có đường ra', itemName(ds, o.itemId));
  }
  const worst = inputs
    .filter((i) => i.nominal > EPS)
    .sort((a, b) => a.actual / a.nominal - b.actual / b.nominal)[0];
  if (worst && worst.actual < worst.nominal - 1e-6)
    return worst.actual <= EPS
      ? tr('Thiếu hẳn {0}', itemName(ds, worst.itemId))
      : tr('Thiếu {0} ({1}/{2} mỗi phút)', itemName(ds, worst.itemId), worst.actual.toFixed(1), worst.nominal.toFixed(1));
  return tr('Bị chặn bởi sức chở đường ra');
}
