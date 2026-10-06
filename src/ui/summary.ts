import { itemName } from '../model/dataset';
import type { AppState } from '../editor/state';
import { clear, el, fmt } from './dom';
import { itemChip } from './inspector';
import { createFold, foldMemory } from './fold';
import { tr } from '../i18n';

/** Bảng nào trong tổng hợp Map đang thu gọn (dấu − / + trước tên bảng — người dùng 2026-10-05); nhớ trong trình duyệt. */
const shutTables = foldMemory('efp:mapsum');

/** Tổng hợp toàn bản vẽ: điện, cân bằng vật tư, cảnh báo. */
export function mountSummary(root: HTMLElement, state: AppState): () => void {
  const body = el('div', { class: 'panel-body' });
  root.append(el('div', { class: 'panel-head' }, tr('Tổng hợp')), body);
  /** Một bảng có dấu − / + trước tên (giống tổng hợp mô phỏng); trả về chỗ đặt nội dung bảng. */
  const table = (id: string, title: string): HTMLElement => {
    const f = createFold(title, shutTables.has(id), (shut) => shutTables.set(id, shut));
    body.append(f.head, f.wrap);
    return f.content;
  };

  const render = (): void => {
    clear(body);
    const r = state.result;

    const stalled = [...r.machines.values()].filter((m) => m.bottleneck !== null).length;
    const unpowered = [...r.machines.values()].filter((m) => m.powered === false).length;
    const badLinks = [...r.links.values()].filter((l) => l.invalid !== null);
    const saturated = [...r.links.values()].filter((l) => l.saturated).length;

    // map tạo từ tab Base có dải kho tổng ngoài vùng xây ⇒ khu vực = vùng xây
    const area = state.bp.buildArea ?? state.bp.area;
    body.append(
      ...(state.bp.base ? [stat(tr('Căn cứ'), state.bp.base.label)] : []),
      stat(tr('Khu vực'), `${area.w} × ${area.d}`),
      stat(tr('Máy'), String(state.bp.machines.length)),
      stat(tr('Ô băng chuyền'), String(state.bp.belts.filter((t) => t.kind === 'belt').length)),
      stat(tr('Ô ống'), String(state.bp.belts.filter((t) => t.kind === 'pipe').length)),
      stat(tr('Vùng môi trường'), String(r.env.zones.length)),
      stat(tr('Cột / trụ điện'), String(r.env.powerZones.length)),
      stat(tr('Điện nền (lõi căn cứ)'), fmt(r.powerBase, 0)),
      stat(tr('Điện các trạm'), fmt(r.powerGen, 0)),
      stat(tr('Điện tổng'), fmt(r.powerSupply, 0), r.powerSupply + 1e-6 < r.powerDraw ? 'bad' : 'good'),
      stat(tr('Điện tiêu thụ'), fmt(r.powerDraw, 1)),
      ...(unpowered > 0 ? [stat(tr('Máy thiếu điện'), String(unpowered), 'bad')] : []),
      stat(tr('Máy đang vướng'), String(stalled), stalled > 0 ? 'bad' : 'good'),
      stat(tr('Tuyến đầy tải'), String(saturated), saturated > 0 ? 'warn' : ''),
    );

    if (r.powerSupply + 1e-6 < r.powerDraw)
      body.append(
        el(
          'div',
          { class: 'warn' },
          tr('Thiếu điện: tổng {0} (nền {1} + trạm {2}) ', fmt(r.powerSupply, 0), fmt(r.powerBase, 0), fmt(r.powerGen, 0)) +
            tr('nhưng máy dùng {0}. Thêm trạm nhiệt năng hoặc đổi sang pin cấp cao hơn.', fmt(r.powerDraw, 0)),
        ),
      );

    // bảng "Môi trường xúc tác đang phủ" đã bỏ (người dùng 2026-10-05); số vùng vẫn ở dòng "Vùng môi trường" phía trên

    if (badLinks.length > 0) {
      const box = table('badLinks', tr('Tuyến không hợp lệ ({0})', badLinks.length));
      for (const l of badLinks.slice(0, 8)) box.append(el('div', { class: 'warn' }, l.invalid ?? ''));
    }

    for (const w of r.warnings) body.append(el('div', { class: 'warn' }, w));

    const rows = [...r.balance.entries()]
      .map(([itemId, b]) => ({ itemId, ...b, net: b.produced - b.consumed }))
      .filter((x) => x.produced > 1e-6 || x.consumed > 1e-6)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

    const balanceBox = table('balance', tr('Cân bằng vật tư (mỗi phút)'));
    if (rows.length === 0) {
      balanceBox.append(el('div', { class: 'empty' }, tr('Chưa có gì chạy.')));
    } else {
      const grid = el('div', { class: 'balance' });
      grid.append(
        el('div', { class: 'balance-head' }, el('span', {}, tr('Vật tư')), el('span', {}, tr('Ra')), el('span', {}, tr('Vào')), el('span', {}, tr('Dư'))),
      );
      for (const x of rows) {
        const net = el(
          'span',
          { class: `mono ${x.net > 1e-6 ? 'surplus' : x.net < -1e-6 ? 'short' : ''}` },
          (x.net > 0 ? '+' : '') + fmt(x.net, 1),
        );
        grid.append(
          el(
            'div',
            { class: 'balance-row' },
            el('span', { class: 'balance-name' }, itemChip(state, x.itemId), itemName(state.ds, x.itemId)),
            el('span', { class: 'mono' }, fmt(x.produced, 1)),
            el('span', { class: 'mono' }, fmt(x.consumed, 1)),
            net,
          ),
        );
      }
      balanceBox.append(grid);
    }

    // ---- kho tổng
    const depotRows = [...r.depot.entries()]
      .map(([itemId, d]) => ({ itemId, ...d, net: (d.in ?? 0) - (d.out ?? 0) }))
      .filter((x) => x.in > 1e-6 || x.out > 1e-6)
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

    const depotBox = table('depot', tr('Kho tổng (mỗi phút)'));
    if (depotRows.length === 0) {
      depotBox.append(
        el(
          'div',
          { class: 'empty' },
          tr('Chưa có máy nạp/rút kho. Đặt Loader để bơm hàng vào kho, Unloader để rút ra.'),
        ),
      );
    } else {
      const grid = el('div', { class: 'balance' });
      grid.append(
        el(
          'div',
          { class: 'balance-head' },
          el('span', {}, tr('Vật tư')),
          el('span', {}, tr('Nạp')),
          el('span', {}, tr('Rút')),
          el('span', {}, tr('Tồn ±')),
        ),
      );
      for (const x of depotRows) {
        grid.append(
          el(
            'div',
            { class: 'balance-row' },
            el('span', { class: 'balance-name' }, itemChip(state, x.itemId), itemName(state.ds, x.itemId)),
            el('span', { class: 'mono' }, fmt(x.in, 1)),
            el('span', { class: 'mono' }, fmt(x.out, 1)),
            el(
              'span',
              { class: `mono ${x.net > 1e-6 ? 'surplus' : x.net < -1e-6 ? 'short' : ''}` },
              (x.net > 0 ? '+' : '') + fmt(x.net, 1),
            ),
          ),
        );
      }
      depotBox.append(grid);
    }

    // ô chỉ dẫn xanh (sức chở băng / ống, cổng kích hoạt) ở cuối bảng đã bỏ (người dùng 2026-10-05)
  };

  const stat = (label: string, value: string, cls = ''): HTMLElement =>
    el('div', { class: 'stat' }, el('span', { class: 'stat-label' }, label), el('span', { class: `stat-value ${cls}` }, value));

  render();
  /**
   * Chỉ dựng lại khi kết quả giải đổi (người dùng 2026-10-05: chọn nhiều máy bị lag — trước đây bảng dựng lại sau mọi lần
   * chọn máy). Mọi lần sửa map đều giải lại ⇒ `state.result` là đối tượng mới; đổi tab ⇒ `state.bp` mới.
   */
  let lastResult = state.result;
  let lastBp = state.bp;
  return () => {
    if (state.result === lastResult && state.bp === lastBp) return;
    lastResult = state.result;
    lastBp = state.bp;
    render();
  };
}
