import { CATALYST_ENV_LABEL, type Dataset } from '../model/types';
import { ENV_COLOR } from '../render/renderer';
import { itemName } from '../model/dataset';
import type { SimMachineView } from '../simulation/engine';
import { clear, el } from './dom';
import { POWER_SVG } from './machineParts';
import { tr } from '../i18n';

/**
 * **Thanh sản xuất động** của chế độ Simulation (người dùng 2026-10-03): nằm **trong cửa sổ Máy của Map**, thế chỗ ô
 * INPUT / OUTPUT (`clockPanel`) khi đang mô phỏng — phần còn lại của cửa sổ (chế độ, sơ đồ cổng, công thức) giữ nguyên.
 * Hiển thị công thức dạng `[nguyên liệu] ━━━▶ [sản phẩm]`:
 * - mỗi ô có ảnh lớn của món và **số lượng món đó đang có trong máy**; không có (đang chờ / đã đẩy ra hết) ⇒ ảnh sẫm lại;
 * - mũi tên dài, mảnh như thanh tiến độ: phần đã xong sáng, phần còn lại nhạt, đầy dần từ trái qua phải; trên ghi thời
 *   gian còn lại, dưới ghi % hoàn thành;
 * - máy kẹt (ô đầu ra đầy), thiếu nguyên liệu hoặc mất điện ⇒ mũi tên nhạt, dấu **X đỏ** ở giữa.
 * Lò chạy nhiều công thức song song ⇒ mỗi công thức một dòng. Cập nhật mỗi khung hình (chỉ đổi số và độ dài, không dựng lại).
 * **Chuột phải vào một ô** ⇒ xoá sạch món ở ô đó (người dùng 2026-10-03, `onClear`). **Trạm điện**: "công thức"
 * `[pin] ━━▶ [⚡ MW]`, mũi tên = thời gian cháy của món đang đốt (người dùng 2026-10-03).
 */
/** Ô nhỏ phía trên công thức: trạng thái / **lý do** dừng (người dùng 2026-10-04). */
const STATE_LABEL = (): Record<SimMachineView['state'], string> => ({
  running: tr('Đang chạy'),
  idle: tr('Chờ nguyên liệu'),
  blocked: tr('Ô đầu ra đầy'),
  unpowered: tr('Mất điện'),
});

const fmtCount = (v: number): string => String(Math.floor(v + 1e-6));

export interface SimProduction {
  readonly el: HTMLElement;
  update(view: SimMachineView): void;
}

/**
 * Tạo khung thanh sản xuất cho một máy chế biến (cùng khung với ô INPUT / OUTPUT cũ: `.mp-clock`). `fallback` = công
 * thức hiện khi máy chưa chạy mẻ nào (công thức bộ giải chọn) — để vẫn thấy công thức, mũi tên nhạt + X đỏ.
 */
/** Icon điện năng (sản phẩm của trạm điện) — cùng icon nút điện trên Map (người dùng 2026-10-05; trước là sấm sét vàng). */
export const BOLT_SVG = POWER_SVG;

export function createSimProduction(ds: Dataset, fallback: string | null = null, onClear?: (item: string, side: 'in' | 'out') => void): SimProduction {
  const stateChip = el('span', { class: 'sim-mw-state' });
  const rowsHost = el('div', { class: 'sim-mw-rows' });
  const extra = el('div', { class: 'sim-mw-extra' });
  const root = el('div', { class: 'mp-clock sim-prod' }, el('div', { class: 'sim-prod-head' }, stateChip), rowsHost, extra);
  let rowsKey = '\u0000';
  let slots: { item: string; out: boolean; count: HTMLElement; box: HTMLElement }[] = [];
  let arrows: { recipeId: string; fill: HTMLElement; time: HTMLElement; pct: HTMLElement; wrap: HTMLElement }[] = [];

  /** Chuột phải ⇒ xoá ô (chặn menu chuột phải của trình duyệt). */
  const clearable = (node: HTMLElement, item: string, side: 'in' | 'out'): void => {
    if (!onClear) return;
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClear(item, side);
    });
  };
  const slot = (item: string, out: boolean): HTMLElement => {
    const count = el('span', { class: 'sim-slot-count' }, '0');
    const box = el(
      'div',
      { class: 'sim-slot', title: onClear ? tr('{0} — chuột phải: xoá sạch ô này', itemName(ds, item)) : itemName(ds, item) },
      el('img', { src: `img/itemicon/${ds.items.get(item)?.icon ?? item}.png`, alt: '' }),
      count,
    );
    clearable(box, item, out ? 'out' : 'in');
    slots.push({ item, out, count, box });
    return box;
  };
  /** Ô "sản phẩm" của trạm điện: sấm sét + số MW. */
  const boltSlot = (mw: number): HTMLElement => {
    const icon = el('span', { class: 'sim-bolt' });
    icon.innerHTML = BOLT_SVG;
    return el('div', { class: 'sim-slot bolt', title: tr('{0} MW khi đang cháy', mw) }, icon, el('span', { class: 'sim-slot-count' }, `${mw} MW`));
  };

  const buildRows = (ids: string[]): void => {
    clear(rowsHost);
    slots = [];
    arrows = [];
    rowsKey = ids.join('|');
    if (ids.length === 0) {
      rowsHost.append(el('div', { class: 'bp-hint' }, tr('Chưa chạy công thức nào — chờ nguyên liệu.')));
      return;
    }
    for (const id of ids) {
      const fuelId = id.startsWith('fuel:') ? id.slice(5) : null;
      const fuel = fuelId ? ds.items.get(fuelId)?.fuel : undefined;
      const r = fuelId ? null : ds.recipes.get(id);
      if (!r && !fuel) continue;
      const fill = el('div', { class: 'sim-arrow-fill' });
      const time = el('div', { class: 'sim-arrow-time' });
      const pct = el('div', { class: 'sim-arrow-pct' });
      const wrap = el(
        'div',
        { class: 'sim-arrow' },
        time,
        el('div', { class: 'sim-arrow-bar' }, el('div', { class: 'sim-arrow-track' }), fill, el('div', { class: 'sim-arrow-head' }), el('div', { class: 'sim-arrow-x' }, '✕')),
        pct,
      );
      arrows.push({ recipeId: id, fill, time, pct, wrap });
      const recipeRow = (
        el(
          'div',
          { class: 'sim-recipe' },
          el('div', { class: 'sim-slots' }, ...(r ? r.ingredients.map((s) => slot(s.itemId, false)) : [slot(fuelId!, false)])),
          wrap,
          el('div', { class: 'sim-slots' }, ...(r ? r.outcomes.map((s) => slot(s.itemId, true)) : [boltSlot(fuel!.power)])),
        )
      );
      // công thức cần môi trường phản ứng ⇒ khung đúng màu môi trường bọc cả công thức, tên môi trường ở thanh trên
      // (người dùng 2026-10-04)
      const env = r?.catalystEnv;
      rowsHost.append(
        env && env !== 'None'
          ? el(
              'div',
              { class: 'sim-env-box', style: `--envc: ${ENV_COLOR[env] ?? ENV_COLOR.None}` },
              el('div', { class: 'sim-env-bar' }, tr('Môi trường {0}', CATALYST_ENV_LABEL[env])),
              recipeRow,
            )
          : recipeRow,
      );
    }
  };

  return {
    el: root,
    update(view) {
      stateChip.className = `sim-mw-state ${view.state}`;
      stateChip.textContent = STATE_LABEL()[view.state];
      // trạm điện: món đang cháy, không thì pin đang có trong trạm
      const fuelHeld = view.kind === 'generator' ? [...view.store.keys()].find((i) => ds.items.get(i)?.fuel) : undefined;
      const cycles =
        view.kind === 'generator'
          ? view.burning
            ? [{ recipeId: `fuel:${view.burning.itemId}`, progress: view.burning.progress, remaining: view.burning.remaining }]
            : []
          : view.cycles;
      const last = view.kind === 'generator' ? (fuelHeld ? `fuel:${fuelHeld}` : fallback) : (view.recipeId ?? fallback);
      const ids = cycles.length > 0 ? cycles.map((c) => c.recipeId) : last ? [last] : [];
      if (ids.join('|') !== rowsKey) buildRows(ids);
      // số món đang có trong máy ở từng ô
      for (const s of slots) {
        const v = s.out && !view.shared ? (view.output.get(s.item) ?? 0) : (view.store.get(s.item) ?? 0);
        s.count.textContent = fmtCount(v);
        s.box.classList.toggle('empty', v < 1 - 1e-6);
      }
      // mũi tên tiến độ
      for (const a of arrows) {
        const c = cycles.find((x) => x.recipeId === a.recipeId);
        a.wrap.classList.toggle('stuck', !c);
        a.fill.style.width = `${Math.round((c?.progress ?? 0) * 1000) / 10}%`;
        a.wrap.classList.toggle('done', !!c && c.progress >= 0.999);
        // mũi tên bị gạch đỏ: chỉ ghi "Kẹt" — lý do nằm ở ô nhỏ phía trên công thức (người dùng 2026-10-04)
        a.time.textContent = c ? tr('còn {0} s', c.remaining.toFixed(1)) : tr('Kẹt');
        a.pct.textContent = c ? `${Math.round(c.progress * 100)}%` : '';
      }
      // món còn trong máy mà không thuộc dòng nào (vd. sản phẩm của công thức trước, đang chờ đẩy ra)
      const shown = new Set(slots.map((s) => s.item));
      const others = [...view.store, ...view.output].filter(([id, v]) => !shown.has(id) && v >= 1);
      const key = others.map(([id, v]) => `${id}:${Math.floor(v)}`).join('|');
      if (extra.dataset.key !== key) {
        extra.dataset.key = key;
        clear(extra);
        for (const [id, v] of others) {
          const row = el(
            'div',
            { class: 'sim-info-row', title: onClear ? tr('Chuột phải: xoá sạch') : '' },
            el('img', { src: `img/itemicon/${ds.items.get(id)?.icon ?? id}.png`, alt: '' }),
            el('span', { class: 'sim-info-name' }, itemName(ds, id)),
            el('span', { class: 'sim-info-val' }, fmtCount(v)),
          );
          clearable(row, id, view.output.has(id) && !view.shared ? 'out' : 'in');
          extra.append(row);
        }
      }
    },
  };
}
