import { cellKey, footprintCells, opposite, step, worldPorts } from './geometry';
import { roleOf } from './roles';
import { isValley, type Blueprint, type Dataset } from './types';

/**
 * Loader / Unloader nào đang gắn vào tổng tuyến kho hàng.
 *
 * Kho tổng không phải thứ lơ lửng: nó chỉ thông ra ngoài qua **tổng tuyến kho hàng**
 * (`log_hongs_bus` 4×8 và cổng đầu tuyến `log_hongs_bus_source` 4×4). Loader/Unloader
 * phải đặt sát tuyến, ở **phía đối diện cổng băng** của nó:
 *  - Loader nhận hàng từ băng rồi đẩy tiếp theo đúng chiều dòng chảy vào tuyến ⇒ ô kế
 *    tiếp theo hướng dòng chảy phải là tuyến;
 *  - Unloader lấy hàng từ tuyến rồi đẩy ra băng ⇒ tuyến nằm ở phía ngược hướng dòng.
 *
 * Đúng như EnKAD: `t = port.input ? direction : direction.inverse()`, rồi xét
 * `cell + t` có phải `BusFree`/`BusStart` hay không — chỉ cần một ô chạm là đủ.
 */
export function busAttached(bp: Blueprint, ds: Dataset): Set<number> {
  return busStatus(bp, ds).attached;
}

/**
 * Như `busAttached`, kèm luật **tổng tuyến phải nối về Cổng Tổng Tuyến** (người dùng 2026-10-02): các đoạn Khu
 * Tổng Tuyến chạm nhau (chung một cạnh ô, không cần đúng chiều) thành một dải; chỉ dải có chạm **Cổng Tổng Tuyến**
 * mới thông với kho tổng. Máy dỡ / nâng gắn vào dải không nối về cổng ⇒ `dangling` (không chạy).
 * **Valley IV**: không tự đặt tổng tuyến được, bù lại **mọi đoạn tổng tuyến coi như đã thông** — không cần nối về cổng
 * (người dùng 2026-10-07).
 */
export function busStatus(bp: Blueprint, ds: Dataset): { attached: Set<number>; dangling: Set<number>; deadBus: Set<number> } {
  // các đoạn tổng tuyến + cổng: gom thành dải theo ô kề cạnh
  const parts = bp.machines
    .map((m) => ({ m, def: ds.machines.get(m.machineId) }))
    .filter((x) => x.def && roleOf(x.def) === 'bus')
    .map((x) => ({ uid: x.m.uid, start: x.def!.type === 'BusStart', cells: footprintCells(x.m, x.def!).map(cellKey) }));
  const owner = new Map<string, number>();
  parts.forEach((p, i) => p.cells.forEach((c) => owner.set(c, i)));
  const linked = new Set<number>(); // chỉ số đoạn thông về cổng
  const valley = isValley(bp.base?.region);
  const queue = parts.flatMap((p, i) => (p.start || valley ? [i] : []));
  for (const i of queue) linked.add(i);
  while (queue.length > 0) {
    const i = queue.pop()!;
    for (const key of parts[i]!.cells) {
      const [x, z] = key.split(',').map(Number) as [number, number];
      for (const n of [`${x + 1},${z}`, `${x - 1},${z}`, `${x},${z + 1}`, `${x},${z - 1}`]) {
        const j = owner.get(n);
        if (j === undefined || linked.has(j)) continue;
        linked.add(j);
        queue.push(j);
      }
    }
  }
  const busCells = new Set<string>(); // ô tổng tuyến đã thông về cổng
  const deadCells = new Set<string>(); // ô tổng tuyến chưa nối về cổng
  parts.forEach((p, i) => p.cells.forEach((c) => (linked.has(i) ? busCells : deadCells).add(c)));

  const attached = new Set<number>();
  const dangling = new Set<number>();
  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    if (!def) continue;
    const role = roleOf(def);
    if (role !== 'depotIn' && role !== 'depotOut') continue;
    const port = worldPorts(m, def)[0];
    if (!port) continue;
    const toward = port.dir === 'in' ? port.flow : opposite(port.flow);
    const next = footprintCells(m, def).map((c) => cellKey(step(c, toward)));
    if (next.some((c) => busCells.has(c))) attached.add(m.uid);
    else if (next.some((c) => deadCells.has(c))) dangling.add(m.uid);
  }
  // đoạn tổng tuyến chưa nối về cổng (để vẽ icon dây xích đứt — người dùng 2026-10-02)
  const deadBus = new Set(parts.filter((_, i) => !linked.has(i)).map((p) => p.uid));
  return { attached, dangling, deadBus };
}
