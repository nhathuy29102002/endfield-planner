import type { Dataset } from '../model/types';
import { itemName } from '../model/dataset';
import { rateBetween, rateSeries, type SimMark } from '../simulation/timeline';
import { clear, el } from './dom';
import { toast } from './toast';
import { tr } from '../i18n';

/**
 * **Biểu đồ + thanh tua** của chế độ Simulation (người dùng 2026-10-03):
 * - biểu đồ đường: sản lượng **mỗi phút** của các món **nạp vào tổng tuyến kho hàng** (kho tổng) theo thời gian, trục
 *   ngang = 0 → N giờ đã chọn ở thanh trượt giờ (`range`);
 * - **thanh tua video chính là trục ngang** của biểu đồ (`.sim-axis`, thẳng hàng với vùng vẽ): phần đã tính sẵn tô nhạt,
 *   phần đã phát tô màu, nút kéo ở lúc đang xem; kéo / bấm ⇒ tua; bấm trong vùng vẽ cũng tua;
 * - **thu gọn được**: khi thu gọn chỉ còn thanh tua (người dùng 2026-10-03).
 * Rê chuột lên vùng vẽ ⇒ đường dọc dò giá trị mọi đường. Chọn món bằng chip (tối đa `MAX_SERIES`, màu gắn theo món),
 * đường 2px, nhãn tên ở đầu mút, lưới mờ; màu `--series-1…10` (riêng nền tối / sáng).
 * Người dùng 2026-10-05: vẽ được **tối đa 10 món** (tự chọn sẵn 4 món nhiều nhất như trước). Cột bên phải dùng
 * **ảnh món thay cho tên** (người dùng 2026-10-05, lần 2 — trước đó là tên tự cuộn): ảnh có viền màu của đường, một
 * vạch màu nối đầu mút đường tới ảnh; ảnh chồng nhau thì xếp sang cột thứ hai (10 ảnh không vừa một cột).
 */
export const MAX_SERIES = 10;
/** Số món tự chọn sẵn khi người dùng chưa chọn món nào. */
const AUTO_SERIES = 4;
/** Cỡ ảnh món ở cột bên phải, khoảng cách giữa hai cột ảnh. */
const ICON = 18;
const ICON_GAP = 3;
/** Khoảng từ mép phải vùng vẽ tới cột ảnh đầu tiên (chỗ cho vạch nối). */
const LABEL_X = 12;
/**
 * Lề trái / phải của vùng vẽ — thanh tua dùng đúng lề này để thẳng hàng với trục ngang. Lề phải = cột ảnh món: vừa
 * khít hai cột ảnh (*suy luận* 2026-10-05: bỏ tên ⇒ thu lề 86 → 56 px cho biểu đồ rộng hơn).
 */
const PAD = { l: 66, r: LABEL_X + 2 * ICON + ICON_GAP + 5, t: 10, b: 6 };

/**
 * Xếp ảnh món ở cột bên phải: mỗi ảnh muốn nằm ngang đầu mút đường của nó (`y`). Đi từ trên xuống, ảnh vào cột đầu
 * tiên còn chỗ đúng độ cao đó; không cột nào còn chỗ ⇒ vào cột phải đẩy xuống ít nhất. Ảnh không lọt ra ngoài [top, bottom].
 * Trả về cột (0 / 1) và tâm `y` của từng ảnh, cùng thứ tự với đầu vào.
 */
export function layoutIcons(ys: number[], size: number, top: number, bottom: number, cols = 2): { col: number; y: number }[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const last = new Array<number>(cols).fill(-Infinity);
  const out = new Array<{ col: number; y: number }>(ys.length);
  const lo = top + size / 2;
  const hi = bottom - size / 2;
  for (const { y, i } of order) {
    const want = Math.min(hi, Math.max(lo, y));
    let best = 0;
    let bestY = Infinity;
    for (let c = 0; c < cols; c++) {
      const yc = Math.max(want, last[c]! + size);
      if (yc <= want + 1e-9) {
        best = c;
        bestY = yc;
        break;
      }
      if (yc < bestY) {
        best = c;
        bestY = yc;
      }
    }
    last[best] = bestY;
    out[i] = { col: best, y: bestY };
  }
  // đẩy xuống quá đáy ⇒ dồn ngược lên trong từng cột
  for (let c = 0; c < cols; c++) {
    const inCol = out.map((o, i) => ({ o, i })).filter((x) => x.o.col === c).sort((a, b) => b.o.y - a.o.y);
    let floor = hi;
    for (const { o } of inCol) {
      o.y = Math.min(o.y, floor);
      floor = o.y - size;
    }
  }
  return out;
}

export interface SimChart {
  el: HTMLElement;
  collapsed: boolean;
  /** Dữ liệu mới (vài lần mỗi giây): mốc số liệu, độ dài trục `range` (giây), phần đã tính `computed`. */
  update(marks: SimMark[], range: number, computed: number): void;
  /** Mỗi khung hình: lúc đang xem (nút kéo, phần đã phát). */
  setTime(view: number): void;
  /** Mở / đóng danh sách chọn món. */
  setExpanded(v: boolean): void;
}

export interface SimChartHooks {
  /** Vừa mở danh sách chọn món (bấm tiêu đề) — `simMode` đóng bảng kho tự sinh (người dùng 2026-10-04). */
  expanded?(): void;
  seek(t: number): void;
  /** Bắt đầu / thôi kéo nút tua. */
  scrub(active: boolean): void;
}

const pad2 = (n: number): string => String(Math.floor(n)).padStart(2, '0');
export const hhmmss = (s: number): string => `${pad2(s / 3600)}:${pad2((s % 3600) / 60)}:${pad2(s % 60)}`;
const tick = (s: number, range: number): string => (range >= 3600 ? `${pad2(s / 3600)}:${pad2((s % 3600) / 60)}` : `${pad2(s / 60)}:${pad2(s % 60)}`);
const fmt = (v: number): string => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, ''));

/** Bước "đẹp" (1, 2, 5 × 10ⁿ) cho khoảng `span` với khoảng `n` vạch. */
function niceStep(span: number, n: number): number {
  const raw = span / Math.max(1, n);
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
/** Bước thời gian đẹp (giây): 10 s, 30 s, 1/2/5/10/15/30 phút, 1/2/4/6 giờ. */
function timeStep(range: number, n: number): number {
  const raw = range / n;
  const steps = [10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600];
  return steps.find((s) => s >= raw) ?? 21600;
}

export function createSimChart(ds: Dataset, hooks: SimChartHooks, collapsed = false): SimChart {
  const chips = el('div', { class: 'sim-chart-chips' });
  const canvas = el('canvas', { class: 'sim-chart-canvas', title: tr('Bấm để tua tới lúc đó') });
  const tip = el('div', { class: 'sim-chart-tip', hidden: true });
  const empty = el('div', { class: 'sim-chart-empty' }, tr('Chưa có món nào nạp vào kho tổng.'));
  /** Ảnh món ở đầu mút các đường (HTML — xem `placeLabels`). */
  const labelsBox = el('div', { class: 'sim-chart-labels', style: `width: ${PAD.r - LABEL_X}px` });
  const plot = el('div', { class: 'sim-chart-plot' }, canvas, labelsBox, tip, empty);
  const labels = new Map<string, HTMLElement>();
  /** Đặt ảnh món (đã xếp không chồng nhau — `layoutIcons`): `col` = cột ảnh, `y` = tâm ảnh, `slot` = màu đường. */
  const placeLabels = (ends: { y: number; col: number; id: string; slot: number }[]): void => {
    const keep = new Set(ends.map((e) => e.id));
    for (const [id, node] of labels)
      if (!keep.has(id)) {
        node.remove();
        labels.delete(id);
      }
    for (const e of ends) {
      let node = labels.get(e.id);
      if (!node) {
        node = el(
          'div',
          { class: 'sim-chart-lbl', title: itemName(ds, e.id) },
          el('img', { src: `img/itemicon/${ds.items.get(e.id)?.icon ?? e.id}.png`, alt: '', draggable: 'false' }),
        );
        labelsBox.append(node);
        labels.set(e.id, node);
      }
      node.style.setProperty('--c', `var(--series-${e.slot})`);
      node.style.left = `${e.col * (ICON + ICON_GAP)}px`;
      node.style.top = `${Math.round(e.y - ICON / 2)}px`;
    }
  };
  // tiêu đề là **nút**: mở rộng thanh điều khiển thêm một tầng — danh sách mọi món nạp vào kho tổng (người dùng 2026-10-04)
  const titleBtn = el('button', { class: 'sim-chart-title', title: tr('Xem mọi món nạp vào kho tổng') }, el('span', { class: 'sim-chart-title-caret' }, '▸'), tr('Nạp vào kho tổng mỗi phút'));
  const head = el('div', { class: 'sim-chart-head' }, titleBtn, chips);
  const allList = el('div', { class: 'sim-chart-all-list' });
  const allBox = el('div', { class: 'sim-chart-all' }, el('div', { class: 'sim-chart-all-inner' }, allList));
  // lăn chuột trên dãy món ⇒ cuộn ngang (không có thanh cuộn)
  chips.addEventListener(
    'wheel',
    (e) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      chips.scrollLeft += d;
    },
    { passive: false },
  );

  // ---- thanh tua = trục ngang
  const computedBar = el('div', { class: 'sim-axis-computed' });
  const played = el('div', { class: 'sim-axis-played' });
  const knob = el('div', { class: 'sim-axis-knob' });
  const ticks = el('div', { class: 'sim-axis-ticks' });
  const rail = el('div', { class: 'sim-axis-rail' }, computedBar, played, knob);
  const axis = el('div', { class: 'sim-axis', title: tr('Kéo hoặc bấm để tua (phần sáng = đã tính sẵn)') }, rail, ticks);
  const nowLabel = el('span', { class: 'sim-axis-now' }, '00:00:00');
  // chừa lề phải bằng lề phải vùng vẽ (thanh tua thẳng hàng trục ngang); không ghi số ở đây — mốc cuối nằm dưới thanh
  const endLabel = el('span', { class: 'sim-axis-end' });
  const axisRow = el('div', { class: 'sim-axis-row' }, nowLabel, axis, endLabel);
  /** Phần thu gọn được (đầu biểu đồ + vùng vẽ) — co / giãn có hiệu ứng (CSS grid 1fr ⇄ 0fr). */
  const body = el('div', { class: 'sim-chart-body' }, el('div', { class: 'sim-chart-inner' }, head, allBox, plot));

  const root = el('div', { class: 'sim-chart' }, body, axisRow);

  /** Món đang vẽ → ô màu (1…MAX_SERIES); ô giữ nguyên khi món khác được thêm / bỏ. */
  const slots = new Map<string, number>();
  let picked = false;
  let data: { marks: SimMark[]; range: number; computed: number } = { marks: [], range: 3600, computed: 0 };
  let view = 0;
  let hoverX: number | null = null;
  let chipKey = '';
  let ticksKey = '';
  let allKey = '';
  let expanded = false;
  const setExpanded = (v: boolean): void => {
    if (v === expanded) return;
    expanded = v;
    root.classList.toggle('expanded', expanded);
    allKey = '';
    if (v) hooks.expanded?.();
    draw();
    // vùng vẽ đổi chiều cao có hiệu ứng (điện thoại) ⇒ vẽ lại khi xong, kể cả lúc đang dừng
    setTimeout(draw, 340);
  };
  titleBtn.addEventListener('click', () => setExpanded(!expanded));

  const freeSlot = (): number => {
    for (let i = 1; i <= MAX_SERIES; i++) if (![...slots.values()].includes(i)) return i;
    return -1;
  };
  const toggle = (id: string): void => {
    picked = true;
    if (slots.has(id)) slots.delete(id);
    else {
      const s = freeSlot();
      if (s < 0) {
        toast(tr('Biểu đồ vẽ tối đa {0} món — bỏ bớt một món trước', MAX_SERIES));
        return;
      }
      slots.set(id, s);
    }
    chipKey = '';
    draw();
  };

  /** Các món đã nạp vào kho tổng, nhiều nhất trước. */
  const loaded = (): [string, number][] =>
    Object.entries(data.marks[data.marks.length - 1]?.depotIn ?? {})
      .filter(([, v]) => v >= 1)
      .sort((a, b) => b[1] - a[1]);

  const drawChips = (list: [string, number][]): void => {
    const key = list.map(([id]) => id).join(',') + '|' + [...slots].join(',');
    if (key === chipKey) return;
    chipKey = key;
    clear(chips);
    // món đang hiện trên biểu đồ xếp sát trái (người dùng 2026-10-04)
    const ordered = [...list.filter(([id]) => slots.has(id)), ...list.filter(([id]) => !slots.has(id))];
    for (const [id] of ordered) {
      const slot = slots.get(id);
      chips.append(
        el(
          'button',
          { class: `sim-chip${slot ? ' on' : ''}`, title: `${itemName(ds, id)} — ${slot ? tr('Bỏ khỏi biểu đồ') : tr('Thêm vào biểu đồ')}`, onclick: () => toggle(id) },
          el('span', { class: 'sim-chip-swatch', style: slot ? `background: var(--series-${slot})` : '' }),
          el('img', { src: `img/itemicon/${ds.items.get(id)?.icon ?? id}.png`, alt: '' }),
          el('span', { class: 'sim-chip-name' }, itemName(ds, id)),
        ),
      );
    }
  };

  /** Danh sách đầy đủ (khi mở rộng): mọi món nạp vào kho tổng, kèm trung bình mỗi phút trong cả trục — bấm để bật / tắt vẽ. */
  const drawAll = (list: [string, number][]): void => {
    if (!expanded) return;
    const { marks, range } = data;
    const rows = list.map(([id]) => ({ id, r: rateBetween(marks, 0, range, 'depotIn', id).rate, slot: slots.get(id) }));
    const key = rows.map((x) => `${x.id}:${x.r.toFixed(1)}:${x.slot ?? ''}`).join(',');
    if (key === allKey) return;
    allKey = key;
    clear(allList);
    if (rows.length === 0) allList.append(el('div', { class: 'sim-chart-all-empty' }, tr('Chưa có món nào nạp vào kho tổng.')));
    for (const x of rows)
      allList.append(
        el(
          'button',
          { class: `sim-all-item${x.slot ? ' on' : ''}`, title: x.slot ? tr('Bỏ khỏi biểu đồ') : tr('Thêm vào biểu đồ'), onclick: () => toggle(x.id) },
          el('span', { class: 'sim-chip-swatch', style: x.slot ? `background: var(--series-${x.slot})` : '' }),
          el('img', { src: `img/itemicon/${ds.items.get(x.id)?.icon ?? x.id}.png`, alt: '' }),
          el('span', { class: 'sim-all-name' }, itemName(ds, x.id)),
          el('span', { class: 'sim-all-rate' }, `${fmt(x.r)}/${tr('ph')}`),
        ),
      );
  };

  const drawTicks = (): void => {
    const { range } = data;
    // số mốc theo bề ngang thanh tua (~70 px mỗi nhãn): thanh hẹp (điện thoại, chừa chỗ cửa sổ Máy) thì ít mốc hơn, chữ
    // không chồng lên nhau
    const w = rail.clientWidth || 400;
    const n = Math.max(2, Math.min(6, Math.floor(w / 70)));
    const key = `${range}|${n}`;
    if (key === ticksKey) return;
    ticksKey = key;
    clear(ticks);
    const st = timeStep(range, n);
    // mốc cuối luôn có (ở cuối thanh — thay cho số thời gian bên phải thanh tua, người dùng 2026-10-03); mốc thường quá sát
    // mốc cuối thì bỏ cho khỏi chồng chữ
    for (let t = 0; t < range - st * 0.6; t += st) ticks.append(el('span', { class: 'sim-axis-tick', style: `left:${(t / range) * 100}%` }, tick(t, range)));
    ticks.append(el('span', { class: 'sim-axis-tick end', style: 'left:100%' }, tick(range, range)));
  };

  const draw = (): void => {
    drawTicks();
    computedBar.style.width = `${Math.min(1, data.computed / data.range) * 100}%`;
    if (collapsedState) return;
    const { marks, range } = data;
    const list = loaded();
    if (!picked) for (const [id] of list.slice(0, AUTO_SERIES)) if (!slots.has(id) && freeSlot() > 0) slots.set(id, freeSlot());
    drawChips(list);
    drawAll(list);
    const win = Math.max(60, range / 120);
    const every = Math.max(10, range / 300);
    const series = [...slots].map(([id, slot]) => ({ id, slot, pts: rateSeries(marks, id, win, 'depotIn', range, every) }));
    const hasData = series.some((s) => s.pts.length > 0);
    empty.hidden = hasData;
    const dpr = window_dpr();
    const w = plot.clientWidth;
    const h = plot.clientHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(root);
    const ink = css.getPropertyValue('--text').trim() || '#c9d1d9';
    const dim = css.getPropertyValue('--dim').trim() || '#8b949e';
    const grid = css.getPropertyValue('--line').trim() || '#30363d';
    const color = (slot: number): string => css.getPropertyValue(`--series-${slot}`).trim() || ink;
    const x0 = PAD.l;
    const x1 = w - PAD.r;
    const y0 = h - PAD.b;
    const y1 = PAD.t;
    const X = (t: number): number => x0 + (t / range) * (x1 - x0);
    let vmax = 0;
    for (const s of series) for (const p of s.pts) vmax = Math.max(vmax, p.v);
    const ystep = niceStep(Math.max(vmax, 1) * 1.1, 3);
    const ytop = Math.ceil((Math.max(vmax, 1) * 1.05) / ystep) * ystep;
    const Y = (v: number): number => y0 - (v / ytop) * (y0 - y1);

    // lưới ngang + nhãn trục y (mờ)
    g.font = '11px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.lineWidth = 1;
    for (let v = 0; v <= ytop + 1e-9; v += ystep) {
      const y = Math.round(Y(v)) + 0.5;
      g.strokeStyle = grid;
      g.globalAlpha = v === 0 ? 1 : 0.5;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x1, y);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = dim;
      g.textAlign = 'right';
      g.fillText(v === 0 ? '0' : `${fmt(v)}/${tr('ph')}`, x0 - 6, y);
    }
    if (!hasData) {
      tip.hidden = true;
      placeLabels([]);
      return;
    }
    // lúc đang xem
    g.strokeStyle = dim;
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(Math.round(X(Math.min(view, range))) + 0.5, y1);
    g.lineTo(Math.round(X(Math.min(view, range))) + 0.5, y0);
    g.stroke();
    g.setLineDash([]);
    // đường
    const ends: { y: number; slot: number; id: string }[] = [];
    for (const s of series) {
      if (s.pts.length === 0) continue;
      g.strokeStyle = color(s.slot);
      g.lineWidth = 2;
      g.lineJoin = 'round';
      g.beginPath();
      s.pts.forEach((p, i) => (i === 0 ? g.moveTo(X(p.t), Y(p.v)) : g.lineTo(X(p.t), Y(p.v))));
      g.stroke();
      ends.push({ y: Y(s.pts[s.pts.length - 1]!.v), slot: s.slot, id: s.id });
    }
    // ảnh món ở đầu mút (hai cột, không chồng nhau) + vạch màu nối đầu mút đường tới ảnh
    const spots = layoutIcons(ends.map((e) => e.y), ICON, 0, h);
    g.lineWidth = 1.5;
    ends.forEach((e, i) => {
      const sp = spots[i]!;
      const ix = x1 + LABEL_X + sp.col * (ICON + ICON_GAP);
      g.strokeStyle = color(e.slot);
      g.beginPath();
      g.moveTo(x1 + 2, e.y);
      g.lineTo(x1 + 6, e.y);
      g.lineTo(ix - 1, sp.y);
      g.stroke();
    });
    placeLabels(ends.map((e, i) => ({ id: e.id, slot: e.slot, col: spots[i]!.col, y: spots[i]!.y })));
    // rê chuột: đường dọc dò giá trị, bắt vào điểm gần nhất
    const ref = series.find((s) => s.pts.length)?.pts;
    if (ref && hoverX !== null && hoverX >= x0 && hoverX <= x1) {
      const t = ((hoverX - x0) / (x1 - x0)) * range;
      let best = ref[0]!;
      for (const p of ref) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
      const hx = Math.round(X(best.t)) + 0.5;
      g.strokeStyle = ink;
      g.globalAlpha = 0.6;
      g.beginPath();
      g.moveTo(hx, y1);
      g.lineTo(hx, y0);
      g.stroke();
      g.globalAlpha = 1;
      clear(tip);
      tip.append(el('div', { class: 'sim-chart-tip-time' }, hhmmss(best.t)));
      for (const s of series) {
        const p = s.pts.find((q) => Math.abs(q.t - best.t) < 1e-6);
        if (!p) continue;
        g.fillStyle = color(s.slot);
        g.beginPath();
        g.arc(hx, Y(p.v), 4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = css.getPropertyValue('--panel').trim() || '#161b22';
        g.lineWidth = 2;
        g.stroke();
        tip.append(
          el(
            'div',
            { class: 'sim-chart-tip-row' },
            el('span', { class: 'sim-chip-swatch', style: `background: var(--series-${s.slot})` }),
            el('strong', {}, `${fmt(p.v)}/${tr('phút')}`),
            el('span', {}, itemName(ds, s.id)),
          ),
        );
      }
      tip.hidden = false;
      const left = hx + 12 + 190 > w ? hx - 12 - tip.offsetWidth : hx + 12;
      tip.style.left = `${Math.max(0, left)}px`;
      tip.style.top = `${y1}px`;
    } else tip.hidden = true;
  };
  const window_dpr = (): number => globalThis.devicePixelRatio || 1;

  canvas.addEventListener('pointermove', (e) => {
    hoverX = e.offsetX;
    draw();
  });
  canvas.addEventListener('pointerleave', () => {
    hoverX = null;
    draw();
  });
  canvas.addEventListener('click', (e) => {
    const x0 = PAD.l;
    const x1 = plot.clientWidth - PAD.r;
    if (e.offsetX < x0 || e.offsetX > x1) return;
    hooks.seek(((e.offsetX - x0) / (x1 - x0)) * data.range);
  });

  // kéo nút tua trên trục
  const at = (e: PointerEvent): number => {
    const r = rail.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))) * data.range;
  };
  let dragging = false;
  axis.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      axis.setPointerCapture(e.pointerId);
    } catch {
      /* con trỏ không còn hoạt động — vẫn tua được */
    }
    dragging = true;
    axis.classList.add('dragging');
    hooks.scrub(true);
    hooks.seek(at(e));
  });
  axis.addEventListener('pointermove', (e) => {
    if (dragging) hooks.seek(at(e));
  });
  const up = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    axis.classList.remove('dragging');
    hooks.scrub(false);
    if (axis.hasPointerCapture(e.pointerId)) axis.releasePointerCapture(e.pointerId);
  };
  axis.addEventListener('pointerup', up);
  axis.addEventListener('pointercancel', up);

  let collapsedState = collapsed;
  const applyCollapsed = (): void => {
    root.classList.toggle('collapsed', collapsedState);
  };
  applyCollapsed();

  const chart: SimChart = {
    el: root,
    get collapsed() {
      return collapsedState;
    },
    set collapsed(v: boolean) {
      collapsedState = v;
      applyCollapsed();
      chipKey = '';
      draw();
      // mở ra: vùng vẽ cao dần theo hiệu ứng ⇒ vẽ lại khi xong cho canvas đúng cỡ
      if (!v) setTimeout(draw, 300);
    },
    setExpanded,
    update(marks, range, computed) {
      data = { marks, range, computed };
      draw();
    },
    setTime(t) {
      view = t;
      const f = Math.max(0, Math.min(1, t / data.range));
      played.style.width = `${f * 100}%`;
      knob.style.left = `${f * 100}%`;
      nowLabel.textContent = hhmmss(t);
    },
  };
  return chart;
}
