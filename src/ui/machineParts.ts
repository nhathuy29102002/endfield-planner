import { choosesOutputs, combineRecipes, outputOptions, resolveSlots, tickedRecipes, type BindingSlot } from '../model/binding';
import { itemName } from '../model/dataset';
import { footprint, worldPorts } from '../model/geometry';
import { buildNetwork } from '../model/network';
import { roleOf } from '../model/roles';
import { CATALYST_ENV_LABEL, type CatalystEnv, type Facing, type MachineDef, type PlacedMachine, type RecipeDef } from '../model/types';
import { FILTER_RATES, isFilter, setBinding, setFilterItem, setFilterRate, setOutletItem, setRecipe, toggleNotedRecipe } from '../editor/ops';
import type { AppState } from '../editor/state';
import { pipeOutColor } from '../render/portColors';
import { RATES } from '../sim/rates';
import { DISPOSAL, type MachineFlow, type SolveResult } from '../sim/solver';
import { el, fmt } from './dom';
import { openItemPicker } from './itemPicker';
import { tr } from '../i18n';

const svgNode = (html: string, cls: string): SVGSVGElement => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('class', cls);
  node.innerHTML = html;
  return node;
};

const itemImg = (state: AppState, itemId: string, cls = 'mp-icon'): HTMLImageElement =>
  el('img', {
    class: cls,
    src: `img/itemicon/${state.ds.items.get(itemId)?.icon ?? itemId}.png`,
    alt: '',
    title: itemName(state.ds, itemId),
  });

// ------------------------------------------------------------------ môi trường / kích hoạt

/** Biểu tượng môi trường, theo hình trong game: Ổn định = hai đỉnh núi, Axit = bốn giọt… */
const ENV_ICON: Record<Exclude<CatalystEnv, 'None'>, { color: string; svg: string }> = {
  Stable: { color: '#3d8fe0', svg: '<path d="M2 20l6-11 4 6 3-4 7 9z" fill="currentColor"/><path d="M8 9l2 4-2-1-2 1z" fill="#fff" opacity=".8"/>' },
  Acid: {
    color: '#e0a82e',
    svg: '<path d="M7 3c3 3 4 5 2 7-2 1-4 0-4-2 0-2 2-3 2-5zM17 3c-3 3-4 5-2 7 2 1 4 0 4-2 0-2-2-3-2-5zM7 21c3-3 4-5 2-7-2-1-4 0-4 2 0 2 2 3 2 5zM17 21c-3-3-4-5-2-7 2-1 4 0 4 2 0 2-2 3-2 5z" fill="currentColor"/>',
  },
  Humidity: { color: '#4fc3f7', svg: '<path d="M12 2c4 6 7 9 7 13a7 7 0 01-14 0c0-4 3-7 7-13z" fill="currentColor"/>' },
  Xiranite: { color: '#8bc34a', svg: '<path d="M12 2l6 8-6 12-6-12z" fill="currentColor"/><path d="M12 2v20M6 10h12" stroke="#fff" stroke-width="1" opacity=".6"/>' },
};

/** Đồng hồ cổng kích hoạt 0…30/phút; vùng đỏ dưới mức sàn 6, xanh từ 6 trở lên. */
function gauge(supply: number): SVGSVGElement {
  const max = RATES.activatorMaxPerMinute;
  const floor = RATES.activatorFloorPerMinute;
  const pt = (v: number, r: number): string => {
    const a = Math.PI * (1 - Math.min(max, Math.max(0, v)) / max);
    return `${12 + r * Math.cos(a)} ${14 - r * Math.sin(a)}`;
  };
  const arc = (a: number, b: number, color: string): string =>
    `<path d="M${pt(a, 9)} A9 9 0 0 1 ${pt(b, 9)}" stroke="${color}" stroke-width="2.4" fill="none"/>`;
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 16');
  node.setAttribute('class', 'mp-gauge');
  node.innerHTML =
    arc(0, floor, '#e5534b') +
    arc(floor, max, '#57ab5a') +
    `<path d="M12 14 L${pt(supply, 7.5)}" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`;
  return node;
}

/**
 * Ô góc phải trên: **cổng kích hoạt** (đồng hồ 0–30, khí đang nạp) hoặc **môi trường xúc tác**
 * mà công thức đòi hỏi. Máy không dùng thứ nào thì không có ô này.
 */
export function envBox(state: AppState, m: PlacedMachine, def: MachineDef, flow: MachineFlow | undefined): HTMLElement | null {
  if (def.activatorPort) {
    const a = flow?.activator;
    const supply = a?.supply ?? 0;
    const ok = (a?.factor ?? 0) >= 1 - 1e-6;
    const made = state.result.env.zones.find((z) => z.uid === m.uid)?.env;
    return el(
      'div',
      {
        class: `mp-envbox activator ${ok ? 'ok' : 'bad'}`,
        title: tr('Cổng kích hoạt: {0} · {1}/{2} mỗi phút (tối đa {3})', a?.itemId ? itemName(state.ds, a.itemId) : tr('chưa nạp'), fmt(supply, 1), RATES.activatorFloorPerMinute, RATES.activatorMaxPerMinute),
      },
      el('div', { class: 'mp-gauge-wrap' }, gauge(supply), a?.itemId ? itemImg(state, a.itemId, 'mp-gauge-item') : null),
      el('div', { class: 'mp-env-text' }, `${fmt(supply, 1)}/min`),
      made && made !== 'None' ? el('div', { class: 'mp-env-sub' }, CATALYST_ENV_LABEL[made]) : null,
    );
  }
  const have = flow?.env ?? 'None';
  // máy nào nằm trọn trong vùng môi trường cũng **được hưởng** môi trường đó — hiện cả khi công thức không cần
  // (người dùng 2026-10-05); công thức cần môi trường thì phải đúng môi trường mới chạy (bộ giải)
  const need =
    tickedRecipes(state.ds, m)
      .map((r) => r.catalystEnv)
      .find((e): e is Exclude<CatalystEnv, 'None'> => e !== 'None') ?? (have !== 'None' ? have : undefined);
  if (!need) return null;
  const icon = ENV_ICON[need];
  const ok = have === need;
  const box = el(
    'div',
    {
      class: `mp-envbox env ${ok ? 'ok' : 'bad'}`,
      title: ok ? tr('Đang ở môi trường {0}', CATALYST_ENV_LABEL[need]) : tr('Cần môi trường {0} — {1}', CATALYST_ENV_LABEL[need], have === 'None' ? tr('chưa nằm trọn trong vùng phủ nào') : tr('đang ở {0}', CATALYST_ENV_LABEL[have])),
    },
    svgNode(icon.svg, 'mp-env-icon'),
    el('div', { class: 'mp-env-text' }, need === 'Acid' ? 'Acrid' : need),
  );
  box.style.setProperty('--env', icon.color);
  return box;
}

// ------------------------------------------------------------------ clock speed

/**
 * Thanh tình trạng + hai cột INPUT / OUTPUT. Tình trạng: 100% ⇒ TỐT (xanh), dưới 100% ⇒
 * CHẬM (vàng), dưới 10% ⇒ KẸT (đỏ).
 */
/**
 * Thanh tình trạng của máy chế biến: % chạy + thanh + TỐT / CHẬM / KẸT. Dùng chung cho ô INPUT / OUTPUT của Map và
 * thanh sản xuất của chế độ mô phỏng (người dùng 2026-10-03: giữ nguyên thanh % khi sang mô phỏng).
 */
export function clockHead(flow: MachineFlow | undefined): HTMLElement {
  const u = flow?.utilization ?? 0;
  const hasRecipe = (flow?.recipes.length ?? 0) > 0;
  const status = !hasRecipe ? { t: '—', c: 'none' } : u >= 0.999 ? { t: tr('TỐT'), c: 'good' } : u < 0.1 ? { t: tr('KẸT'), c: 'bad' } : { t: tr('CHẬM'), c: 'slow' };
  const pctBar = el('div', { class: 'mp-clockbar' });
  const fill = el('div', { class: `mp-clockfill ${status.c}` });
  fill.style.width = `${Math.max(0, Math.min(1, u)) * 100}%`;
  pctBar.append(fill);
  return el(
    'div',
    { class: 'mp-clock-head' },
    el('span', { class: `mp-pct ${status.c}` }, hasRecipe ? `${Math.round(u * 100)}%` : '—'),
    pctBar,
    el('span', { class: `mp-status ${status.c}` }, status.t),
  );
}

export function clockPanel(state: AppState, m: PlacedMachine, def: MachineDef, flow: MachineFlow | undefined): HTMLElement {
  const slots = outSlots(state, m, def);
  const choosing = slots.some((s) => s.mode === 'choose');

  const line = (itemId: string, actual: number, nominal: number, bar?: string): HTMLElement =>
    el(
      'div',
      { class: 'mp-io', title: tr('{0} · {1}/{2} mỗi phút', itemName(state.ds, itemId), fmt(actual, 1), fmt(nominal, 1)) },
      bar !== undefined ? el('span', { class: `mp-portbar${bar ? '' : ' none'}`, style: bar ? `background:${bar}` : '' }) : null,
      itemImg(state, itemId),
      el('span', { class: `mp-rate${actual < nominal - 1e-6 ? ' short' : ''}` }, `${fmt(actual, 1)}/${fmt(nominal, 1)}`),
    );

  /** Vạch trước sản phẩm: cổng ra nó đang được đưa tới — vàng / cam (ống), trắng (băng). */
  const barFor = (itemId: string): string => {
    const s = slots.find((x) => x.itemId === itemId);
    if (!s) return '';
    if (s.kind === 'belt') return '#ffffff';
    return pipeOutColor(def, s.key) ?? '#5bc0ff';
  };

  return el(
    'div',
    { class: 'mp-clock' },
    clockHead(flow),
    el(
      'div',
      { class: 'mp-cols' },
      el(
        'div',
        { class: 'mp-col' },
        el('div', { class: 'mp-col-head' }, 'INPUT'),
        // cặp ống ngầm: cả hai đầu hiện phía vào của Cửa Nạp và phía ra của Cửa Xả (người dùng 2026-10-02)
        ...(flow?.pairIn ?? flow?.inputs ?? []).map((i) => line(i.itemId, i.actual, i.nominal)),
      ),
      el(
        'div',
        { class: 'mp-col' },
        el('div', { class: 'mp-col-head' }, 'OUTPUT'),
        ...(flow?.pairOut ?? flow?.outputs ?? []).map((o) => line(o.itemId, o.actual, o.nominal, choosing ? barFor(o.itemId) : undefined)),
      ),
    ),
  );
}

// ------------------------------------------------------------------ layout máy

/**
 * Mọi công thức máy đang chạy: đã tích + tự chạy theo đầu vào (lấy từ kết quả giải). Cổng ra
 * chọn trong hợp sản phẩm của chúng.
 */
export function activeRecipes(state: AppState, m: PlacedMachine): RecipeDef[] {
  const flow = state.result.machines.get(m.uid);
  const ids = flow ? flow.recipes.map((r) => r.recipeId) : tickedRecipes(state.ds, m).map((r) => r.id);
  return ids.map((id) => state.ds.recipes.get(id)).filter((r): r is RecipeDef => !!r);
}

const outSlots = (state: AppState, m: PlacedMachine, def: MachineDef): BindingSlot[] => {
  const slots = resolveSlots(state.ds, def, combineRecipes(activeRecipes(state, m)), m.binding, m.mode).filter((s) => s.dir === 'out');
  if (!choosesOutputs(def)) return slots;
  // Lò Phản Ứng / Lò Mở Rộng: mọi cổng ra đều chọn được, trong mọi sản phẩm **và nguyên liệu**
  // của chế độ đang bật (nguyên liệu ⇒ đi xuyên, lò làm bộ chuyển). Hiện đúng món solver đang
  // cho đi qua cổng; lò chưa chạy gì thì hiện lựa chọn đã lưu.
  const actual = state.result.machines.get(m.uid)?.outBinding ?? {};
  return slots.map((s) => {
    const options = outputOptions(state.ds, m, def, s.kind);
    // lựa chọn đã lưu mà không còn thuộc chế độ đang bật thì coi như trống
    const saved = m.binding[s.key] ?? null;
    const itemId = actual[s.key] ?? (saved && options.includes(saved) ? saved : null);
    return options.length === 0 ? s : { ...s, mode: 'choose' as const, options, itemId };
  });
};

/** Máy **xuất hàng** chọn được vật phẩm cho cổng ra: lõi, lõi phụ, máy dỡ kho, cửa xả ống. */
export function isOutlet(def: MachineDef): boolean {
  const role = roleOf(def);
  return def.type === 'Hub' || def.type === 'SubHub' || role === 'depotOut' || role === 'udpipeOut';
}

/** Vật phẩm người dùng đã chọn cho một cổng ra của máy xuất hàng. */
function outletItem(m: PlacedMachine, def: MachineDef, key: string): string | null {
  if (def.type === 'Hub' || def.type === 'SubHub') return m.binding[key] ?? null;
  if (roleOf(def) === 'depotOut') return m.depotItem ?? null;
  return m.infinite && m.source?.itemId ? m.source.itemId : null;
}

/** Vật tư đang chảy qua từng cổng (theo tuyến) — vào: `in`, ra: `out`. Tính lại khi bản vẽ đổi. */
let flowMemo: { result: SolveResult; map: Map<string, string>; chainOut: Map<string, string>; chainIn: Map<string, string> } | null = null;
function portItems(state: AppState): Map<string, string> {
  return portMemo(state).map;
}
function portMemo(state: AppState): NonNullable<typeof flowMemo> {
  if (flowMemo?.result === state.result) return flowMemo;
  const map = new Map<string, string>();
  /** Cổng ra đã nối (có tuyến băng / ống đi ra, hoặc kề thẳng máy sau) → id tuyến. */
  const chainOut = new Map<string, string>();
  /** Cổng vào đã nối → id tuyến đi vào (để ghi lưu lượng từng cổng vào trên sơ đồ — điện thoại, 2026-10-05). */
  const chainIn = new Map<string, string>();
  for (const c of buildNetwork(state.bp, state.ds).chains) {
    if (c.from) chainOut.set(`${c.from.uid}:${c.from.portKey}`, c.id);
    if (c.to) chainIn.set(`${c.to.uid}:${c.to.portKey}`, c.id);
    const item = state.result.links.get(c.id)?.itemId;
    if (!item) continue;
    if (c.to) map.set(`${c.to.uid}:${c.to.portKey}`, item);
    if (c.from) map.set(`${c.from.uid}:${c.from.portKey}`, item);
  }
  flowMemo = { result: state.result, map, chainOut, chainIn };
  return flowMemo;
}

/**
 * Chế độ mô phỏng: số món ra mỗi phút của một cổng (`uid`, `portKey`) theo mô phỏng — `simMode.ts` gắn vào; `null` ⇒
 * dùng số của bộ giải (Map thường).
 */
let portRateOverride: ((uid: number, portKey: string) => number | null) | null = null;
export function setPortRateOverride(fn: typeof portRateOverride): void {
  portRateOverride = fn;
}

/** Món ra mỗi phút ở cổng ra `portKey` của máy `uid` (bộ giải: lượng của món đó trên tuyến đi ra từ cổng). */
function portRate(state: AppState, uid: number, portKey: string, itemId: string | null): number | null {
  const sim = portRateOverride?.(uid, portKey);
  if (sim !== null && sim !== undefined) return sim;
  const id = portMemo(state).chainOut.get(`${uid}:${portKey}`);
  const link = id ? state.result.links.get(id) : undefined;
  if (!link) return null;
  return (itemId ? link.items.find((x) => x.itemId === itemId)?.rate : undefined) ?? link.rate;
}

/** Mọi vật phẩm đi được qua loại cổng này (băng: rắn; ống: lỏng + khí), xếp theo tên. */
function itemsForKind(state: AppState, kind: 'belt' | 'pipe'): string[] {
  return [...state.ds.items.values()]
    .filter((i) => (i.phase === 'solid') === (kind === 'belt'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => i.id);
}

/**
 * Sơ đồ máy **xoay đúng như máy đang hiện trên màn hình** (hướng máy + hướng camera): đế (ô
 * vàng) và mọi cổng quanh nó — mũi tên theo chiều dòng chảy (`^` băng, tam giác ống; hai đầu
 * ống ra vàng / cam), kèm icon vật tư đi qua cổng. Bấm vào cổng ra chọn được ⇒ bảng icon để
 * chọn sản phẩm (máy chế biến) hoặc vật phẩm xuất ra (máy xuất hàng). Cổng băng ra của một máy
 * luôn đổi chung một món (trừ hai lõi — mỗi cổng một món); cổng ống vàng / cam độc lập.
 */
export function layoutPanel(state: AppState, m: PlacedMachine, def: MachineDef, opts: { rates?: boolean; size?: number } = {}): HTMLElement {
  const rot = ((m.rot + state.viewTurns * 90) % 360) as Facing;
  const probe: PlacedMachine = { ...m, x: 0, z: 0, rot };
  const box = footprint(def, rot);
  // `rates` (điện thoại, người dùng 2026-10-05): thêm một vòng ô ngoài cùng để ghi lưu lượng mỗi cổng ("30/p")
  const pad = opts.rates ? 3 : 2;
  const cols = box.w + pad * 2;
  const rows = box.d + pad * 2;
  const room = opts.size ?? 150;
  const cell = Math.max(8, Math.min(opts.rates ? 26 : 22, Math.floor(Math.min(room / cols, room / rows))));
  const wrap = el('div', { class: 'mp-layout', style: `width:${cols * cell}px;height:${rows * cell}px` });
  const at = (x: number, z: number, node: HTMLElement | SVGElement, size = cell): void => {
    node.setAttribute(
      'style',
      `${node.getAttribute('style') ?? ''};left:${(x + pad) * cell + (cell - size) / 2}px;top:${(z + pad) * cell + (cell - size) / 2}px;width:${size}px;height:${size}px`,
    );
    wrap.append(node);
  };
  for (let z = 0; z < box.d; z++) for (let x = 0; x < box.w; x++) at(x, z, el('span', { class: 'mp-lay-cell' }), cell - 1);

  const slots = new Map(outSlots(state, m, def).map((s) => [s.key, s]));
  const flowing = portItems(state);
  const chainOut = portMemo(state).chainOut;
  const outlet = isOutlet(def);
  const recipes = activeRecipes(state, m);
  /**
   * Người dùng 2026-10-03: chưa nối cổng ra nào ⇒ mọi cổng ra hiện sản phẩm sẽ ra (vd. Lò Tinh Luyện: 3 cổng 3 Bột Carbon
   * Đặc); nối một cổng ⇒ chỉ cổng đã nối hiện icon. *Suy luận*: xét riêng từng loại cổng (băng / ống), để nối băng không
   * làm mất icon ở cổng ống.
   */
  const ports = worldPorts(probe, def);
  const linked = (key: string): boolean => chainOut.has(`${m.uid}:${key}`);
  const anyLinked = new Set(ports.filter((p) => p.dir === 'out' && !p.virtual && linked(p.key)).map((p) => p.kind));

  for (const p of ports) {
    if (p.virtual) continue;
    const ax = p.attach.x;
    const az = p.attach.z;
    const activator = p.key === def.activatorPort;
    // điện thoại (`rates`): mũi tên cổng kích hoạt xanh / đỏ theo đồng hồ chất kích hoạt (người dùng 2026-10-05)
    const act = activator ? state.result.machines.get(m.uid)?.activator : undefined;
    const actOk = (act?.factor ?? 0) >= 1 - 1e-6;
    const color = activator ? (opts.rates ? (actOk ? '#57ab5a' : '#e5534b') : '#c77dff') : (pipeOutColor(def, p.key) ?? '#ffffff');
    const glyph =
      p.kind === 'pipe'
        ? `<path d="M4 17 L12 6 L20 17 Z" fill="${color}" stroke="rgba(0,0,0,.6)" stroke-width="1"/>`
        : `<path d="M4 17 L12 7 L20 17" fill="none" stroke="${color}" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const arrow = svgNode(glyph, 'mp-lay-arrow');
    arrow.style.transform = `rotate(${p.flow * 90}deg)`;
    at(ax, az, arrow, Math.round(cell * 0.9));

    const slot = p.dir === 'out' && !outlet ? slots.get(p.key) : undefined;
    const outletPort = outlet && p.dir === 'out';
    // cảng kiểm soát: cổng ra là **ô chọn món được đi tiếp** (bộ lọc) — bấm được ngay trên sơ đồ (người dùng 2026-10-06:
    // điện thoại không còn ô OUTPUT riêng)
    const filterPort = isFilter(def) && p.dir === 'out';
    const itemId = filterPort
      ? (m.filterItem ?? null)
      : outletPort
      ? (outletItem(m, def, p.key) ?? flowing.get(`${m.uid}:${p.key}`) ?? null)
      : p.dir === 'out'
        ? (slot?.itemId ?? null)
        : (flowing.get(`${m.uid}:${p.key}`) ?? null);
    const pickable = outletPort || filterPort || slot?.mode === 'choose';
    // cổng ra tự động (không chọn được) chưa nối, trong khi máy đã nối cổng ra khác cùng loại ⇒ không hiện icon
    const hidden = p.dir === 'out' && !outlet && !pickable && !linked(p.key) && anyLinked.has(p.kind);
    const shownItem = hidden ? null : itemId;
    const ix = ax + p.outward.dx;
    const iz = az + p.outward.dz;
    const holder = el(
      'button',
      {
        class: `mp-lay-item${pickable ? ' pick' : ''}${shownItem ? '' : ' empty'}`,
        title: pickable
          ? tr('Cổng ra {0} — bấm để chọn {1}{2}{3}', p.kind === 'pipe' ? tr('ống') : tr('băng'), outletPort ? tr('vật phẩm xuất ra') : tr('sản phẩm'), itemId ? tr(' (đang: {0})', itemName(state.ds, itemId)) : '', p.kind === 'belt' && !(def.type === 'Hub' || def.type === 'SubHub') ? tr(' · mọi cổng băng ra đổi theo') : '')
          : itemId
            ? itemName(state.ds, itemId)
            : activator
              ? tr('Cổng kích hoạt')
              : p.dir === 'in'
                ? tr('Cổng vào trống')
                : tr('Cổng ra không dùng'),
      },
      // cổng ra chọn được mà đang để trống ⇒ icon "Empty"
      shownItem ? itemImg(state, shownItem) : pickable ? el('img', { class: 'mp-empty-icon', src: EMPTY_ICON, alt: '' }) : null,
    );
    // rê chuột vào món ở cổng ra ⇒ ghi rõ cổng này ra bao nhiêu mỗi phút (hai cổng có thể đi tới hai máy khác nhau)
    if (p.dir === 'out' && shownItem) {
      const base = holder.title;
      holder.addEventListener('pointerenter', () => {
        const r = portRate(state, m.uid, p.key, shownItem);
        holder.title = r === null ? `${base}\n${tr('Cổng này chưa nối')}` : `${base}\n${tr('Cổng này ra {0}/phút', fmt(r, 1))}`;
      });
    }
    holder.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!pickable) return;
      const options = outletPort || filterPort ? itemsForKind(state, p.kind) : (slot?.options ?? []);
      openItemPicker(
        holder,
        state,
        options,
        itemId,
        (v) => {
          state.mutate(filterPort ? tr('Chọn vật phẩm lọc') : outletPort ? tr('Chọn vật phẩm xuất ra') : tr('Chọn sản phẩm cổng ra'), () => {
            const r = filterPort
              ? setFilterItem(state.bp, state.ds, m.uid, v)
              : outletPort
              ? setOutletItem(state.bp, state.ds, m.uid, p.key, v)
              : setBinding(state.bp, state.ds, m.uid, p.key, v, { recipes });
            if (!r.ok) state.message = r.reason ?? tr('Không chọn được');
          });
        },
        {
          allowNone: true,
          title: filterPort ? tr('Chỉ cho món này đi tiếp (Empty = mọi thứ)') : outletPort ? tr('Vật phẩm xuất ra') : tr('Sản phẩm ở cổng này'),
        },
      );
    });
    at(ix, iz, holder, Math.round(cell * 0.95));
    // cổng kích hoạt (điện thoại): vòng bán nguyệt kiểu đồng hồ bao quanh ô icon — vạch mốc, kim theo lượng đang nạp
    if (opts.rates && activator) at(ix, iz, ringGauge(act?.supply ?? 0, p.outward), cell * 2);
    // lưu lượng của cổng (đã nối) ngay ngoài icon vật phẩm — chữ dạt ra phía ngoài, chừa khoảng cách với icon
    if (opts.rates) {
      // cổng ảo nằm lùi vào trong một ô, gắn đúng vào ô của cổng này (bơm, cửa xả ống…): ống nối vào cổng ảo đó ⇒ lưu
      // lượng của nó là của cổng này (người dùng 2026-10-06: bơm / cửa xả không hiện số đường ra)
      const keys = [p.key, ...ports.filter((v) => v.virtual && v.dir === p.dir && v.kind === p.kind && v.attach.x === p.cell.x && v.attach.z === p.cell.z).map((v) => v.key)];
      const sum = (vals: (number | null)[]): number | null => (vals.some((v) => v !== null) ? vals.reduce<number>((a, v) => a + (v ?? 0), 0) : null);
      const inRate = (key: string): number | null => {
        const id = portMemo(state).chainIn.get(`${m.uid}:${key}`);
        return id ? (state.result.links.get(id)?.rate ?? null) : null;
      };
      const r = activator
        ? (act?.supply ?? 0)
        : p.dir === 'out'
          ? sum(keys.map((k) => portRate(state, m.uid, k, shownItem)))
          : sum(keys.map(inRate));
      if (r !== null && (r > 1e-6 || activator)) {
        // cổng kích hoạt: chữ đặt bên cạnh vòng đồng hồ (phía ngoài đã có vòng)
        const perp = { dx: p.outward.dz !== 0 ? 1 : 0, dz: p.outward.dx !== 0 ? 1 : 0 };
        const off = activator ? perp : p.outward;
        const side = off.dx < 0 ? 'l' : off.dx > 0 ? 'r' : off.dz < 0 ? 't' : 'b';
        const lab = el('span', { class: 'mp-lay-rate', 'data-side': side }, `${fmt(r, 1)}/p`);
        const k = activator ? 1.35 : 1;
        at(ix + off.dx * k, iz + off.dz * k, lab, cell);
      }
    }
  }
  return el('div', { class: `mp-layout-box${opts.rates ? ' rates' : ''}` }, wrap);
}

/**
 * Đồng hồ chất kích hoạt dạng **vòng bán nguyệt** bao quanh ô icon ở cổng kích hoạt (điện thoại, người dùng 2026-10-05):
 * cung quay ra phía ngoài máy (`outward`), đỏ 0 → mức đủ (6/phút), xanh tới tối đa (30/phút), vạch mốc ở 0 / 6 / 15 /
 * 30 và kim chỉ lượng đang nạp (vẽ trong vành, không che icon).
 */
function ringGauge(supply: number, outward: { dx: number; dz: number }): SVGSVGElement {
  const max = RATES.activatorMaxPerMinute;
  const floor = RATES.activatorFloorPerMinute;
  const start = Math.atan2(outward.dz, outward.dx) - Math.PI / 2;
  const ang = (v: number): number => start + (Math.PI * Math.min(max, Math.max(0, v))) / max;
  const pt = (v: number, r: number): string => `${(r * Math.cos(ang(v))).toFixed(2)} ${(r * Math.sin(ang(v))).toFixed(2)}`;
  const arc = (a: number, b: number, color: string): string =>
    `<path d="M${pt(a, 8.6)} A8.6 8.6 0 0 1 ${pt(b, 8.6)}" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  const ticks = [0, floor, max / 2, max].map((v) => `<path d="M${pt(v, 9.6)} L${pt(v, 10.8)}" stroke="#c9d1d9" stroke-width="0.8"/>`).join('');
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '-11 -11 22 22');
  node.setAttribute('class', 'mp-ring-gauge');
  node.innerHTML =
    arc(0, floor, '#e5534b') +
    arc(floor, max, '#57ab5a') +
    ticks +
    `<path d="M${pt(supply, 6)} L${pt(supply, 10.4)}" stroke="#0d1117" stroke-width="2.2" stroke-linecap="round"/>` +
    `<path d="M${pt(supply, 6)} L${pt(supply, 10.4)}" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>`;
  return node;
}

/** Icon điện năng — đúng hình nút "Kiểm tra tầm điện" trên thanh công cụ Map (`ICON.power` ở `dock.ts`). */
export const POWER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L5 14h6l-1 8 8-12h-6z" fill="currentColor"/></svg>';

/**
 * **Trạm điện** (người dùng 2026-10-03; 2026-10-05 lần 2: **dạng công thức như các máy sản xuất khác**): mỗi loại
 * nhiên liệu là một thẻ công thức `[pin ×1] → [⚡ N MW] · thời gian cháy`, xếp như `recipeSections` — "Đang chạy"
 * (món bộ giải đang đốt) rồi "Nhiên liệu khác". Ô điện dùng icon của nút điện trên Map (`POWER_SVG`).
 */
export function generatorSections(state: AppState, flow: MachineFlow | undefined): HTMLElement {
  const fuels = [...state.ds.items.values()].filter((i) => i.fuel).sort((a, b) => a.fuel!.power - b.fuel!.power);
  const burning = new Set((flow?.inputs ?? []).filter((i) => i.actual > 1e-9).map((i) => i.itemId));
  const card = (id: string, run: boolean): HTMLElement => {
    const f = state.ds.items.get(id)!.fuel!;
    const power = el('span', { class: 'rc-power' });
    power.innerHTML = POWER_SVG;
    return el(
      'div',
      { class: `rg-card ${run ? 'run' : 'wait'}`, title: tr('{0}: cháy {1} giây, phát {2} MW', itemName(state.ds, id), f.seconds, f.power) },
      el(
        'div',
        { class: 'recipe-card' },
        el(
          'div',
          { class: 'rc-row' },
          el(
            'div',
            { class: 'rc-group' },
            el(
              'div',
              { class: 'rc-item', title: itemName(state.ds, id) },
              el('div', { class: 'rc-pic' }, itemImg(state, id, ''), el('span', { class: 'rc-count' }, '1')),
              el('div', { class: 'rc-rate' }, `${fmt(60 / f.seconds, 2)}/min`),
            ),
          ),
          el('div', { class: 'rc-arrow' }, '→'),
          el(
            'div',
            { class: 'rc-group' },
            el('div', { class: 'rc-item power', title: tr('{0} MW khi đang cháy', f.power) }, el('div', { class: 'rc-pic' }, power), el('div', { class: 'rc-rate' }, `${f.power} MW`)),
          ),
          el('div', { class: 'rc-side' }, el('div', { class: 'rc-time' }, `${fmt(f.seconds, 2)}s`)),
        ),
      ),
    );
  };
  const wrap = el('div', { class: 'mp-recipes' });
  const section = (title: string, list: string[], kind: 'run' | 'wait'): void => {
    if (list.length === 0 && kind === 'wait') return;
    wrap.append(el('div', { class: `rg-sep ${kind}` }, el('span', {}, `${title} (${list.length})`)));
    if (list.length === 0) return;
    const grid = el('div', { class: 'recipe-grid' });
    for (const id of list) grid.append(card(id, kind === 'run'));
    wrap.append(grid);
  };
  section(tr('Đang chạy'), fuels.filter((f) => burning.has(f.id)).map((f) => f.id), 'run');
  section(tr('Nhiên liệu khác'), fuels.filter((f) => !burning.has(f.id)).map((f) => f.id), 'wait');
  return wrap;
}

/**
 * Clock Speed của máy **xuất hàng** (lõi, lõi phụ, máy dỡ kho, cửa xả ống): thanh tình trạng
 * như máy chế biến, rồi từng vật phẩm đang xuất với **icon lớn** và lượng thực / tối đa mỗi
 * phút — nằm bên trái sơ đồ, như cửa sổ của Lò Mở Rộng.
 */
export function outletPanel(state: AppState, def: MachineDef, flow: MachineFlow | undefined): HTMLElement {
  const outs = (flow?.outputs ?? []).filter((o) => o.nominal > 1e-9 || o.actual > 1e-9);
  const nominal = outs.reduce((s, o) => s + o.nominal, 0);
  const actual = outs.reduce((s, o) => s + o.actual, 0);
  const u = nominal > 1e-9 ? actual / nominal : 0;
  const status = outs.length === 0 ? { t: '—', c: 'none' } : u >= 0.999 ? { t: tr('TỐT'), c: 'good' } : u < 0.1 ? { t: tr('KẸT'), c: 'bad' } : { t: tr('CHẬM'), c: 'slow' };
  const pctBar = el('div', { class: 'mp-clockbar' });
  const fill = el('div', { class: `mp-clockfill ${status.c}` });
  fill.style.width = `${Math.max(0, Math.min(1, u)) * 100}%`;
  pctBar.append(fill);
  return el(
    'div',
    { class: 'mp-clock outlet' },
    el(
      'div',
      { class: 'mp-clock-head' },
      el('span', { class: `mp-pct ${status.c}` }, outs.length ? `${Math.round(u * 100)}%` : '—'),
      pctBar,
      el('span', { class: `mp-status ${status.c}` }, status.t),
    ),
    el('div', { class: 'mp-col-head' }, 'OUTPUT'),
    outs.length === 0
      ? el('div', { class: 'note' }, tr('Chưa xuất gì — bấm vào cổng ra trên sơ đồ để chọn vật phẩm{0}.', def.type === 'Hub' || def.type === 'SubHub' ? tr(' (mỗi cổng chọn một món riêng)') : ''))
      : el(
          'div',
          { class: 'mp-big-list' },
          ...outs.map((o) =>
            el(
              'div',
              { class: 'mp-big', title: tr('{0} · {1}/{2} mỗi phút', itemName(state.ds, o.itemId), fmt(o.actual, 1), fmt(o.nominal, 1)) },
              itemImg(state, o.itemId, 'mp-big-icon'),
              el('span', { class: `mp-rate${o.actual < o.nominal - 1e-6 ? ' short' : ''}` }, `${fmt(o.actual, 1)}/${fmt(o.nominal, 1)}`),
            ),
          ),
        ),
  );
}

/** Máy xuất hàng **chỉ bằng băng chuyền**: Máy Dỡ Hàng Kho, Lõi Tự Động Hóa, Lõi Giao Thức-Phụ. */
export function isBeltOutlet(def: MachineDef): boolean {
  return def.type === 'Hub' || def.type === 'SubHub' || roleOf(def) === 'depotOut';
}

/** Lượng thực chảy ra khỏi từng cổng ra (cộng mọi tuyến từ cổng đó). Tính lại khi bản vẽ đổi. */
let rateMemo: { result: SolveResult; map: Map<string, number> } | null = null;
function portRates(state: AppState): Map<string, number> {
  if (rateMemo?.result === state.result) return rateMemo.map;
  const map = new Map<string, number>();
  for (const c of buildNetwork(state.bp, state.ds).chains) {
    if (!c.from) continue;
    const k = `${c.from.uid}:${c.from.portKey}`;
    map.set(k, (map.get(k) ?? 0) + (state.result.links.get(c.id)?.rate ?? 0));
  }
  rateMemo = { result: state.result, map };
  return map;
}

/**
 * Cửa sổ INPUT / OUTPUT của máy xuất hàng bằng băng (người dùng chốt 2026-09-29):
 *  - **OUTPUT**: mỗi cổng ra một ô — chưa chọn thì là ô **+**, bấm để chọn vật phẩm; đã chọn thì
 *    hiện vật phẩm và **lượng xuất ra khỏi đúng băng đó**. Hai lõi có 6 cổng **độc lập** (6 ô,
 *    mỗi ô một món); Máy Dỡ Hàng Kho một ô.
 *  - **INPUT**: máy mới đặt thì trống; đã chọn vật phẩm thì hiện **lượng đang nạp vào kho tổng**
 *    của từng vật phẩm đó.
 */
export function beltOutletPanel(state: AppState, m: PlacedMachine, def: MachineDef, flow: MachineFlow | undefined): HTMLElement {
  const ports = def.ports.filter((p) => p.dir === 'out' && !p.virtual).sort((a, b) => a.index - b.index);
  const rates = portRates(state);
  const chosen = ports.map((p) => outletItem(m, def, `out${p.index}`));
  const items = [...new Set(chosen.filter((v): v is string => !!v))];

  const outs = (flow?.outputs ?? []).filter((o) => o.nominal > 1e-9 || o.actual > 1e-9);
  const nominal = outs.reduce((a, o) => a + o.nominal, 0);
  const actual = outs.reduce((a, o) => a + o.actual, 0);
  const u = nominal > 1e-9 ? actual / nominal : 0;
  const status = items.length === 0 ? { t: '—', c: 'none' } : u >= 0.999 ? { t: tr('TỐT'), c: 'good' } : u < 0.1 ? { t: tr('KẸT'), c: 'bad' } : { t: tr('CHẬM'), c: 'slow' };
  const pctBar = el('div', { class: 'mp-clockbar' });
  const fill = el('div', { class: `mp-clockfill ${status.c}` });
  fill.style.width = `${Math.max(0, Math.min(1, u)) * 100}%`;
  pctBar.append(fill);

  const slot = (key: string, itemId: string | null): HTMLElement => {
    const rate = rates.get(`${m.uid}:${key}`) ?? 0;
    const btn = el(
      'button',
      {
        class: `mp-slot${itemId ? '' : ' empty'}`,
        title: itemId ? tr('{0} · {1}/phút ra khỏi băng này — bấm để đổi', itemName(state.ds, itemId), fmt(rate, 1)) : tr('Chọn vật phẩm xuất ra'),
      },
      itemId ? itemImg(state, itemId, 'mp-slot-icon') : el('span', { class: 'mp-slot-plus' }, '+'),
      itemId ? el('span', { class: 'mp-rate' }, `${fmt(rate, 1)}/min`) : null,
    );
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openItemPicker(
        btn,
        state,
        itemsForKind(state, 'belt'),
        itemId,
        (v) =>
          state.mutate(tr('Chọn vật phẩm xuất ra'), () => {
            const r = setOutletItem(state.bp, state.ds, m.uid, key, v);
            if (!r.ok) state.message = r.reason ?? tr('Không chọn được');
          }),
        { allowNone: true, title: tr('Vật phẩm xuất ra') },
      );
    });
    return btn;
  };
  // Máy Dỡ Hàng Kho: một món cho cả máy ⇒ một ô; hai lõi: mỗi cổng một ô
  const hub = def.type === 'Hub' || def.type === 'SubHub';
  const slots = hub ? ports.map((p, k) => slot(`out${p.index}`, chosen[k] ?? null)) : [slot(`out${ports[0]?.index ?? 0}`, chosen[0] ?? null)];

  const depotIn = (itemId: string): number => state.result.depot.get(itemId)?.in ?? 0;
  return el(
    'div',
    { class: 'mp-clock outlet' },
    el(
      'div',
      { class: 'mp-clock-head' },
      el('span', { class: `mp-pct ${status.c}` }, items.length ? `${Math.round(u * 100)}%` : '—'),
      pctBar,
      el('span', { class: `mp-status ${status.c}` }, status.t),
    ),
    el(
      'div',
      { class: 'mp-cols' },
      el(
        'div',
        { class: 'mp-col' },
        el('div', { class: 'mp-col-head', title: tr('Lượng đang nạp vào kho tổng của vật phẩm đã chọn') }, 'INPUT'),
        ...items.map((id) =>
          el(
            'div',
            { class: 'mp-io', title: tr('{0} · đang nạp vào kho tổng {1}/phút', itemName(state.ds, id), fmt(depotIn(id), 1)) },
            itemImg(state, id),
            el('span', { class: 'mp-rate' }, `${fmt(depotIn(id), 1)}/min`),
          ),
        ),
      ),
      el('div', { class: 'mp-col' }, el('div', { class: 'mp-col-head' }, 'OUTPUT'), el('div', { class: 'mp-slots' }, ...slots)),
    ),
  );
}

/**
 * Thanh trượt lưu lượng của **cảng kiểm soát ống**: vị trí đầu = không giới hạn (tới 120/phút của ống), rồi các bội số
 * của 6 (6 … 60/phút). Dùng ở ô INPUT / OUTPUT (máy tính) và mục "Kiểm soát lưu lượng" (điện thoại).
 */
export function filterRateSlider(state: AppState, m: PlacedMachine): HTMLElement {
  const steps: (number | null)[] = [null, ...FILTER_RATES];
  const slider = el('input', { type: 'range', min: '0', max: String(steps.length - 1), step: '1', class: 'mp-rate-slider' });
  slider.value = String(Math.max(0, steps.indexOf(m.filterRate ?? null)));
  const val = el('span', { class: 'mp-rate-val' });
  const show = (): void => {
    const v = steps[Number(slider.value)] ?? null;
    val.textContent = v === null ? tr('Không giới hạn') : tr('{0}/phút', v);
  };
  show();
  slider.addEventListener('input', show);
  slider.addEventListener('change', () =>
    state.mutate(tr('Đổi lưu lượng cảng kiểm soát'), () => setFilterRate(state.bp, state.ds, m.uid, steps[Number(slider.value)] ?? null)),
  );
  return el('div', { class: 'mp-rate-row', title: tr('Lưu lượng tối đa — bội số của 6, tối đa 60') }, el('span', { class: 'mp-rate-label' }, tr('Lưu lượng')), slider, val);
}

/**
 * Cửa sổ INPUT / OUTPUT của **van tách, van gộp, cảng kiểm soát** — băng lẫn ống (người dùng 2026-10-02):
 *  - INPUT: từng đường vào và lượng thực nhận; OUTPUT: từng nhánh ra và lượng thực đẩy ra.
 *  - Cảng kiểm soát: OUTPUT là **ô chọn vật phẩm** như Máy Dỡ Hàng Kho (= bộ lọc: chỉ món đó đi tiếp; trống = mọi
 *    thứ). Cảng **ống** có thêm **thanh trượt** lưu lượng (∞, 6 … 60/phút); cảng băng không kiểm soát lưu lượng.
 */
export function routerPanel(state: AppState, m: PlacedMachine, def: MachineDef, flow: MachineFlow | undefined): HTMLElement {
  const ins = (flow?.inputs ?? []).filter((i) => i.actual > 1e-9 || i.nominal > 1e-9);
  const outs = (flow?.outputs ?? []).filter((o) => o.actual > 1e-9);
  const inSum = ins.reduce((a, i) => a + i.actual, 0);
  const outSum = outs.reduce((a, o) => a + o.actual, 0);
  const offered = ins.reduce((a, i) => a + Math.max(i.actual, i.nominal), 0);
  const u = offered > 1e-9 ? inSum / offered : 0;
  const status = inSum <= 1e-9 ? { t: '—', c: 'none' } : u >= 0.999 ? { t: tr('TỐT'), c: 'good' } : { t: tr('KẸT'), c: 'bad' };
  const pctBar = el('div', { class: 'mp-clockbar' });
  const fill = el('div', { class: `mp-clockfill ${status.c}` });
  fill.style.width = `${Math.max(0, Math.min(1, inSum > 1e-9 ? u : 0)) * 100}%`;
  pctBar.append(fill);
  const io = (itemId: string, rate: number, tip: string): HTMLElement =>
    el('div', { class: 'mp-io', title: tr('{0} · {1}/phút {2}', itemName(state.ds, itemId), fmt(rate, 1), tip) }, itemImg(state, itemId), el('span', { class: 'mp-rate' }, `${fmt(rate, 1)}/min`));

  const pipe = def.ports.some((p) => p.kind === 'pipe');
  let outCol: HTMLElement[];
  const extra: HTMLElement[] = [];
  if (isFilter(def)) {
    // ô chọn vật phẩm đi qua — như ô xuất hàng của Máy Dỡ Hàng Kho
    const itemId = m.filterItem ?? null;
    const btn = el(
      'button',
      {
        class: `mp-slot${itemId ? '' : ' empty'}`,
        title: itemId
          ? tr('Chỉ cho {0} đi tiếp · {1}/phút — bấm để đổi', itemName(state.ds, itemId), fmt(outSum, 1))
          : tr('Chưa lọc — cho qua mọi thứ. Bấm để chọn vật phẩm được đi tiếp'),
      },
      itemId ? itemImg(state, itemId, 'mp-slot-icon') : el('span', { class: 'mp-slot-plus' }, '+'),
      el('span', { class: 'mp-rate' }, `${fmt(outSum, 1)}/min`),
    );
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openItemPicker(
        btn,
        state,
        itemsForKind(state, pipe ? 'pipe' : 'belt'),
        itemId,
        (v) =>
          state.mutate(tr('Chọn vật phẩm lọc'), () => {
            const r = setFilterItem(state.bp, state.ds, m.uid, v);
            if (!r.ok) state.message = r.reason ?? tr('Không chọn được');
          }),
        { allowNone: true, title: tr('Chỉ cho món này đi tiếp (Empty = mọi thứ)') },
      );
    });
    outCol = [el('div', { class: 'mp-slots' }, btn)];
    if (def.type === 'LogPipeConditioner') extra.push(filterRateSlider(state, m));
  } else outCol = outs.map((o) => io(o.itemId, o.actual, tr('ra nhánh này')));

  return el(
    'div',
    { class: 'mp-clock outlet router' },
    el(
      'div',
      { class: 'mp-clock-head' },
      el('span', { class: `mp-pct ${status.c}` }, inSum > 1e-9 ? `${fmt(inSum, 1)}/min` : '—'),
      pctBar,
      el('span', { class: `mp-status ${status.c}` }, status.t),
    ),
    el(
      'div',
      { class: 'mp-cols' },
      el('div', { class: 'mp-col' }, el('div', { class: 'mp-col-head' }, 'INPUT'), ...(ins.length ? ins.map((i) => io(i.itemId, i.actual, tr('vào'))) : [el('div', { class: 'note' }, tr('Chưa có gì vào'))])),
      el('div', { class: 'mp-col' }, el('div', { class: 'mp-col-head' }, 'OUTPUT'), ...(outCol.length ? outCol : [el('div', { class: 'note' }, tr('Chưa ra đâu'))])),
    ),
    ...extra,
  );
}

// ------------------------------------------------------------------ công thức

/**
 * Thẻ công thức: nguyên liệu → **mọi** sản phẩm · thời gian; môi trường bắt buộc ở trên.
 */
export function recipeCard(state: AppState, r: RecipeDef, count: number, side?: HTMLElement | null): HTMLElement {
  const perMin = (n: number): string => `${fmt((n * 60 * count) / r.seconds, 1)}/min`;
  const cellOf = (itemId: string, n: number): HTMLElement =>
    el(
      'div',
      { class: 'rc-item', title: itemName(state.ds, itemId) },
      el('div', { class: 'rc-pic' }, itemImg(state, itemId, ''), el('span', { class: 'rc-count' }, String(n))),
      el('div', { class: 'rc-rate' }, perMin(n)),
    );
  const card = el('div', { class: 'recipe-card' });
  // thẻ môi trường: Stable ENV = môi trường trơ (xanh), Acrid ENV = môi trường axit (**vàng** —
  // người dùng 2026-09-29); tên "Acrid" theo game, dữ liệu gọi là `Acid`
  if (r.catalystEnv !== 'None')
    card.append(
      el(
        'div',
        { class: `rc-env env-${r.catalystEnv.toLowerCase()}`, title: tr('Môi trường {0}', CATALYST_ENV_LABEL[r.catalystEnv]) },
        `${r.catalystEnv === 'Acid' ? 'Acrid' : r.catalystEnv} ENV`,
      ),
    );
  card.append(
    el(
      'div',
      { class: 'rc-row' },
      el('div', { class: 'rc-group' }, ...r.ingredients.map((i) => cellOf(i.itemId, i.count))),
      el('div', { class: 'rc-arrow' }, '→'),
      el(
        'div',
        { class: 'rc-group' },
        // không ra gì (công thức xử lý chất thải) ⇒ ô "Empty"
        ...(r.outcomes.length > 0
          ? r.outcomes.map((o) => cellOf(o.itemId, o.count))
          : [
              el(
                'div',
                { class: 'rc-item empty', title: tr('Empty — không ra gì') },
                el('div', { class: 'rc-pic' }, el('img', { src: EMPTY_ICON, alt: '' })),
                el('div', { class: 'rc-rate' }, 'Empty'),
              ),
            ]),
      ),
      // cột phải: ô tích nằm **sát phải, ngay trên** thời gian chạy
      el('div', { class: 'rc-side' }, side ?? null, el('div', { class: 'rc-time' }, `${fmt(r.seconds, 2)}s`)),
    ),
  );
  return card;
}

/** Biểu tượng "Empty" (ảnh người dùng gửi 2026-09-29) — thay cho dấu × ở mọi chỗ chọn "để trống". */
export const EMPTY_ICON = 'img/ui/empty.png';

/**
 * Máy xử lý chất thải (Bộ Xử Lý Nước Thải): hiện dưới dạng **công thức** như trong game / EnKAD
 * (`fluidConsume`: mỗi lượt 2 s một đơn vị) — "Nước Thải ×1 → Empty · 2s", một thẻ cho mỗi chất nhận
 * được (người dùng 2026-09-29). Thẻ của chất đang chảy vào thì sáng (đang chạy).
 */
export function disposalSections(state: AppState, m: PlacedMachine, flow: MachineFlow | undefined): HTMLElement | null {
  const rule = DISPOSAL[m.machineId];
  if (!rule) return null;
  const seconds = 60 / rule.rate;
  const inflow = new Map((flow?.inputs ?? []).map((i) => [i.itemId, i.actual]));
  const grid = el('div', { class: 'recipe-grid' });
  for (const itemId of rule.items) {
    const r: RecipeDef = {
      id: `dispose:${itemId}`,
      machineId: m.machineId,
      group: 'dispose',
      seconds,
      ingredients: [{ itemId, count: 1 }],
      outcomes: [],
      altOutcomes: [],
      buffers: {},
      mode: null,
      catalystEnv: 'None',
    };
    const got = inflow.get(itemId) ?? 0;
    grid.append(
      el(
        'div',
        { class: `rg-card ${got > 1e-6 ? 'run' : 'wait'}`, title: got > 1e-6 ? tr('Đang xử lý {0}/phút', fmt(got, 1)) : tr('Chưa có chất này chảy vào') },
        recipeCard(state, r, 1),
      ),
    );
  }
  return el('div', { class: 'mp-recipes' }, el('div', { class: 'rg-sep run' }, el('span', {}, tr('Công thức xử lý — tổng tối đa {0}/phút', rule.rate))), grid);
}

/**
 * Công thức chia ba phần:
 * - **Đang chạy** — có đủ đầu vào: công thức máy tự chạy theo nguyên liệu chảy vào, và công
 *   thức đã tích mà đủ đầu vào (máy chạy song song, dùng chung kho);
 * - **Đang chờ** — đã tích nhưng thiếu đầu vào (đứng đầu, như ghim), rồi các công thức khác;
 * - **Chế độ khác** — sau vạch ngang, mờ đi; bấm vào ⇒ đổi chế độ và chạy công thức đó.
 *
 * Ô tích (người dùng chốt 2026-09-28): **vàng** = tích tay (bấm để bỏ); **xám** = máy đang tự
 * chạy theo đầu vào, không tắt được; trống = bấm để tích (ghim). Không còn dòng chữ riêng kiểu
 * "đã tích · thiếu đầu vào" — phần "Đang chờ" đã nói điều đó.
 */
export function recipeSections(state: AppState, m: PlacedMachine, def: MachineDef, flow: MachineFlow | undefined): HTMLElement {
  const all = state.ds.recipesByMachine.get(def.id) ?? [];
  const mode = m.mode ?? 'A';
  const fits = (r: RecipeDef): boolean => !def.modeAffectsRecipes || r.mode === null || r.mode === mode;
  const ticked = tickedRecipes(state.ds, m).map((r) => r.id);
  const isTicked = (r: RecipeDef): boolean => ticked.includes(r.id);
  const running = new Set(flow?.running ?? []);
  const auto = new Set(flow?.auto ?? []);
  const utilOf = (id: string): number => flow?.recipes.find((x) => x.recipeId === id)?.utilization ?? 0;
  const byTick = (list: RecipeDef[]): RecipeDef[] =>
    [...list].sort((a, b) => {
      const ia = ticked.indexOf(a.id);
      const ib = ticked.indexOf(b.id);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    });

  const inMode = all.filter(fits);
  const run = byTick(inMode.filter((r) => running.has(r.id)));
  const wait = byTick(inMode.filter((r) => !running.has(r.id)));
  const other = byTick(all.filter((r) => !fits(r)));

  const card = (r: RecipeDef, kind: 'run' | 'wait' | 'other'): HTMLElement => {
    const on = isTicked(r);
    // máy tự chạy công thức này (không tích) ⇒ ô xám, đã tích sẵn, không bấm được
    const locked = !on && auto.has(r.id) && kind === 'run';
    const toggle = (): void =>
      state.mutate(on ? tr('Bỏ tích công thức') : tr('Tích công thức'), () => toggleNotedRecipe(state.bp, state.ds, m.uid, r.id));
    const box = el(
      'button',
      {
        class: `rg-check${on ? ' manual' : locked ? ' auto' : ''}`,
        title: on ? tr('Đã tích tay — bấm để bỏ tích') : locked ? tr('Máy đang tự chạy công thức này theo đầu vào — không tắt được') : tr('Tích (ghim) công thức này'),
      },
      on || locked ? '✓' : '',
    );
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      if (kind === 'other') state.mutate(tr('Đổi công thức'), () => setRecipe(state.bp, state.ds, m.uid, r.id));
      else if (!locked) toggle();
    });
    return el(
      'div',
      {
        class: `rg-card ${kind}${on ? ' ticked' : ''}`,
        title:
          kind === 'other'
            ? tr('Thuộc chế độ khác — bấm để đổi chế độ và chạy')
            : kind === 'run'
              ? tr('Đang chạy · {0}%{1}', Math.round(utilOf(r.id) * 100), on ? tr(' · đã tích') : tr(' · tự chạy theo đầu vào'))
              : on
                ? tr('Đã tích — đang chờ đủ đầu vào. Bấm để bỏ tích')
                : tr('Bấm để tích'),
        onclick: () => {
          if (kind === 'other') state.mutate(tr('Đổi công thức'), () => setRecipe(state.bp, state.ds, m.uid, r.id));
          else toggle();
        },
      },
      recipeCard(state, r, m.count, box),
    );
  };

  const wrap = el('div', { class: 'mp-recipes' });
  const section = (title: string, list: RecipeDef[], kind: 'run' | 'wait' | 'other', empty?: string): void => {
    // `empty` = hiện tiêu đề cả khi trống ('' = chỉ tiêu đề, không kèm dòng chữ)
    if (list.length === 0 && empty === undefined) return;
    wrap.append(el('div', { class: `rg-sep ${kind}` }, el('span', {}, `${title} (${list.length})`)));
    if (list.length === 0) {
      if (empty) wrap.append(el('div', { class: 'note' }, empty));
      return;
    }
    const grid = el('div', { class: 'recipe-grid' });
    for (const r of list) grid.append(card(r, kind));
    wrap.append(grid);
  };
  // "Đang chạy" luôn có tiêu đề, nhưng không còn dòng cảnh báo khi trống — cảnh báo nằm ở nút
  // "!" cạnh tên máy (người dùng yêu cầu 2026-09-28)
  section(tr('Đang chạy'), run, 'run', '');
  section(tr('Đang chờ'), wait, 'wait');
  section(tr('Chế độ khác'), other, 'other');
  return wrap;
}

