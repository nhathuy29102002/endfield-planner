import { kindOfItem } from '../model/dataset';
import { buildChain, type ChainNode } from '../model/recipeBook';
import type { Dataset, RecipeDef } from '../model/types';
import { isCrucible } from './crucible';
import { ACTIVATOR, ENV_GASES, ENV_MACHINE, emptyModeler, envItem, newId, type MNode, type ModelerDoc, type Side, type SlotColor } from './doc';

/** Máy nguồn có trên sơ đồ Modeler (máy bơm, máy tách khí). Giàn khai thác thì không — hàng rắn lấy từ kho tổng. */
const MODELER_SOURCES = new Set(['pump_1', 'pump_2', 'gas_pump_1']);
const COL_W = 230;
const ROW_H = 150;
/** Máy cách đầu chuỗi **của chính nó** từ chừng này nấc trở lên thì cách nguyên liệu gấp đôi (`stepOf`). */
const DOUBLE_FROM = 5;
/** Khoảng trống thêm (phần hàng) giữa máy khuếch tán và máy cần môi trường bên dưới. */
const ENV_GAP = 0.35;

/**
 * **Model hoá** (người dùng 2026-10-06): biến chuỗi sản xuất (theo công thức mặc định) thành các nút Modeler.
 *  - Xếp như cây của chuỗi: thành phẩm bên phải, nguyên liệu lùi sang trái; **mỗi nguyên liệu một hàng** (công thức hai
 *    đầu vào ⇒ hai nút trên / dưới, không chung một hàng).
 *  - **Không dùng chung** nguồn: mỗi máy cần nước / quặng / môi trường / chất kích hoạt có nguyên một nguồn riêng (máy
 *    bơm, máy dỡ kho, máy khuếch tán…), như cách người dùng tự xây (lần 2, 2026-10-06).
 *  - Món khai thác: máy bơm / máy tách khí; quặng và món thô khác lấy từ **kho tổng** (Máy Dỡ Hàng Kho — Modeler không có
 *    giàn khai thác); chất lỏng / khí không có nguồn ⇒ Cửa Xả Ống Dẫn.
 *  - **Vòng gieo trồng** (Máy Gieo Trồng ⇄ Máy Thu Hoạch Hạt): cây cần nước cho 2 cây / hạt ⇒ một vòng là đủ (máy thu
 *    hoạch nằm ngay dưới máy gieo, cổng vào bên phải, cổng ra bên trái); cây không cần nước 1 hạt ra 1 cây ⇒ thêm một
 *    máy gieo nữa: máy thu hoạch + máy gieo vòng (cổng đảo) bên trái, máy gieo thứ hai lấy hạt dư làm cây đưa đi.
 *  - **Lò phản ứng**: mọi sản phẩm của công thức (cả phụ phẩm phải thải ra) là cổng ra, và mọi cổng ra nằm **bên phải**.
 *  - Máy làm thành phẩm đặt mục tiêu 1 máy ⇒ Modeler tính ngược ra cả chuỗi.
 */
export function chainToModeler(ds: Dataset, root: ChainNode): ModelerDoc {
  const doc = emptyModeler();
  const at = new Map<MNode, { col: number; row: number }>();
  let maxCol = 0;
  const add = (n: Omit<MNode, 'id' | 'x' | 'y' | 'limit'>, col: number, row: number): MNode => {
    const node: MNode = { id: newId('n'), x: 0, y: 0, limit: null, ...n };
    doc.nodes.push(node);
    at.set(node, { col, row });
    maxCol = Math.max(maxCol, col);
    return node;
  };
  const link = (from: MNode, item: string, to: MNode, slot?: 'act'): void => {
    doc.edges.push({ id: newId('e'), from: { node: from.id, item }, to: { node: to.id, item, ...(slot ? { slot } : {}) } });
  };
  const side = (n: MNode, key: string, s: Side): void => {
    n.sides = { ...(n.sides ?? {}), [key]: s };
  };
  /**
   * Số nấc từ đầu chuỗi của **chính món này** (nguồn thô = 0, mỗi công đoạn +1, lấy nhánh nguyên liệu dài nhất) — chỉ
   * tính nguyên liệu của nó, không tính chuỗi khí môi trường / chất kích hoạt, cũng không tính vòng hạt giống (người dùng
   * 2026-10-06, lần 6: trước đây đếm theo cột chung của cả sơ đồ nên nhánh ngắn bị giãn gấp đôi quá sớm).
   */
  const steps = new Map<ChainNode, number>();
  const stepOf = (cn: ChainNode): number => {
    let v = steps.get(cn);
    if (v !== undefined) return v;
    v = 0;
    if (!cn.loop && cn.way?.kind === 'recipe') {
      const kids = cn.inputs.filter((c) => !c.inputs.some((g) => g.loop && g.item === cn.item));
      v = 1 + Math.max(0, ...kids.map(stepOf));
    }
    steps.set(cn, v);
    return v;
  };
  const leafMachine = (item: string): string => (kindOfItem(ds, item) === 'belt' ? 'unloader_1' : 'udpipe_unloader_1');

  /** Nút chạy công thức `r` (lò phản ứng: tick công thức, mọi sản phẩm là cổng ra màu, cổng ra bên phải). */
  const recipeNode = (r: RecipeDef, item: string, col: number, row: number): MNode => {
    if (!isCrucible(r.machineId)) return add({ machineId: r.machineId, recipeId: r.id }, col, row);
    const outs: Partial<Record<SlotColor, string>> = {};
    const fluid: SlotColor[] = ['yellow', 'orange'];
    const ordered = [item, ...r.outcomes.map((o) => o.itemId).filter((i) => i !== item)];
    for (const i of ordered) {
      if (kindOfItem(ds, i) === 'pipe') {
        const c = fluid.find((x) => !outs[x]);
        if (c) outs[c] = i;
      } else if (!outs.black) outs.black = i;
    }
    const n = add({ machineId: r.machineId, recipeId: null, ticks: [r.id], outs }, col, row);
    for (const i of Object.values(outs)) if (i) side(n, `out:${i}`, 'right');
    for (const s of r.ingredients) side(n, `in:${s.itemId}`, 'left');
    return n;
  };

  /**
   * Chuỗi riêng cho khí môi trường / chất kích hoạt: món đã có máy làm ra phía trên cùng nhánh ⇒ thành lá "vòng" (nối về
   * máy đó) — không thì Máy Chuyển Hóa cần chất kích hoạt do chính Máy Chuyển Hóa làm ra sẽ dựng mãi không dừng.
   */
  const sub = (item: string, anc: Map<string, MNode>): ChainNode => buildChain(ds, item, item, new Set(anc.keys()));

  /** Đặt máy làm ra `cn.item` ở cột `col`, hàng `row`; trả về máy đó và số hàng đã dùng. */
  const place = (cn: ChainNode, col: number, row: number, anc: Map<string, MNode>): { node: MNode; rows: number } => {
    const way = cn.way;
    if (cn.loop) {
      const a = anc.get(cn.item);
      if (a) return { node: a, rows: 0 };
    }
    if (!way || way.kind === 'source') {
      const m = way && MODELER_SOURCES.has(way.machineId) ? way.machineId : leafMachine(cn.item);
      return { node: add({ machineId: m, recipeId: null, item: cn.item }, col, row), rows: 1 };
    }
    const r = way.recipe;
    // khoảng tới cột nguyên liệu: gấp đôi khi máy này cách đầu chuỗi ≥ DOUBLE_FROM nấc, và luôn gấp đôi trước thành phẩm
    const c1 = col + (stepOf(cn) >= DOUBLE_FROM || col === 0 ? 2 : 1);
    const rowOf = (x: MNode): number => at.get(x)!.row;
    const setRow = (x: MNode, v: number): void => void (at.get(x)!.row = v);
    // môi trường xúc tác: máy khuếch tán riêng đặt **ngay trên** máy cần môi trường, nguồn khí của nó lùi trái một nấc
    // (người dùng 2026-10-06, lần 3); nguồn khí chiếm hàng trên cùng của khối
    let envRows = 0;
    let vap: MNode | null = null;
    let gasSrc: MNode | null = null; // máy đưa khí vào máy khuếch tán (chuỗi khí nằm trong khối này)
    if (r.catalystEnv !== 'None') {
      const gas = Object.keys(ENV_GASES).find((g) => ENV_GASES[g] === r.catalystEnv);
      if (gas) {
        vap = add({ machineId: ENV_MACHINE, recipeId: null, item: gas }, col, row);
        const g = place(sub(gas, anc), c1, row, anc);
        link(g.node, gas, vap, 'act');
        envRows = Math.max(1, g.rows);
        if (g.rows > 0) gasSrc = g.node;
      }
    }
    // máy cần môi trường có dải "TRƠ" / "AXIT" phía trên ⇒ nút cao hơn: chừa thêm khoảng trống giữa nó và máy khuếch tán
    // (người dùng 2026-10-06, lần 4: máy khuếch tán đang quá sát)
    const top = row + envRows + (vap ? ENV_GAP : 0);
    // máy chính tạo trước (vòng hạt giống nối về nó), hàng đặt sau khi biết nguyên liệu nằm đâu
    const n = recipeNode(r, cn.item, col, top);
    if (vap) link(vap, envItem(r.catalystEnv), n);
    const anc2 = new Map(anc).set(cn.item, n);
    let next = top; // hàng trống kế tiếp ở cột nguyên liệu (c1)
    /** Hàng của từng nguyên liệu nối vào — máy chính nằm **giữa** nguyên liệu đầu và cuối (người dùng 2026-10-06, lần 4). */
    const centers: number[] = [];
    let below: MNode | null = null; // máy thu hoạch của vòng một máy gieo: ngay dưới máy chính
    for (const child of cn.inputs) {
      const loop = child.way?.kind === 'recipe' && child.inputs.some((g) => g.loop && g.item === cn.item) ? child : null;
      if (loop && loop.way?.kind === 'recipe') {
        const h = loop.way.recipe;
        const made = r.outcomes.find((o) => o.itemId === cn.item)?.count ?? 1;
        const eaten = h.ingredients.find((s) => s.itemId === cn.item)?.count ?? 1;
        const seed = child.item;
        if (made > eaten) {
          // một vòng: máy thu hoạch ngay dưới máy gieo — vào bên phải (nhận cây), ra bên trái (trả hạt)
          const hn = recipeNode(h, seed, col, top + 1);
          side(hn, `in:${cn.item}`, 'right');
          side(hn, `out:${seed}`, 'left');
          // cổng trái máy gieo: nguyên liệu khác (nước) ở trên, hạt (vòng từ máy thu hoạch phía dưới) ở dưới ⇒ đường nối
          // không cắt nhau (người dùng 2026-10-06, lần 3)
          n.order = [...r.ingredients.map((x) => `in:${x.itemId}`).filter((k) => k !== `in:${seed}`), `in:${seed}`];
          link(n, cn.item, hn);
          link(hn, seed, n);
          below = hn;
        } else {
          // thêm một máy gieo: [thu hoạch] trên, [máy gieo vòng, cổng đảo] dưới, cả hai bên trái máy gieo chính
          const hn = recipeNode(h, seed, c1, next);
          const loopPlanter = recipeNode(r, cn.item, c1, next + 1);
          side(loopPlanter, `in:${seed}`, 'right');
          side(loopPlanter, `out:${cn.item}`, 'left');
          link(hn, seed, n);
          link(hn, seed, loopPlanter);
          link(loopPlanter, cn.item, hn);
          centers.push(next);
          next += 2;
        }
        continue;
      }
      const kid = place(child, c1, next, anc2);
      link(kid.node, child.item, n);
      if (kid.rows > 0) centers.push(rowOf(kid.node));
      next += kid.rows;
    }
    // chất kích hoạt: chuỗi riêng
    const act = ACTIVATOR[r.machineId]?.[0];
    if (act) {
      const a = place(sub(act, anc2), c1, next, anc2);
      link(a.node, act, n, 'act');
      if (a.rows > 0) centers.push(rowOf(a.node));
      next += Math.max(1, a.rows);
    }
    const R = centers.length ? (Math.min(...centers) + Math.max(...centers)) / 2 : top;
    setRow(n, R);
    if (below) setRow(below, R + 1);
    if (vap) {
      // máy khuếch tán: ngay trên máy cần môi trường, cách nó **ít nhất** 1 + 1/3 hàng; ưu tiên **ngang hàng nguồn khí**
      // (người dùng 2026-10-06, lần 5)
      const highest = R - 1 - ENV_GAP;
      setRow(vap, gasSrc && rowOf(gasSrc) <= highest ? rowOf(gasSrc) : Math.max(row, highest));
    }
    return { node: n, rows: Math.max(next - row, Math.ceil(R - row + 1 + (below ? 1 : 0))) };
  };

  // máy làm thành phẩm: 1 máy làm mục tiêu ⇒ Modeler tính ngược ra cả chuỗi cần bao nhiêu máy
  place(root, 0, 0, new Map()).node.limit = 1;

  // nguồn thô nối thẳng vào máy (máy bơm, máy dỡ kho…): đẩy lên sát máy phía trên trong cùng cột, nhưng không cao hơn máy
  // nó cấp (người dùng 2026-10-06, lần 3)
  const RAW = new Set([...MODELER_SOURCES, 'unloader_1', 'udpipe_unloader_1']);
  const byCol = new Map<number, MNode[]>();
  for (const [n, p] of at) byCol.set(p.col, [...(byCol.get(p.col) ?? []), n]);
  for (const nodes of byCol.values()) {
    nodes.sort((a, b) => at.get(a)!.row - at.get(b)!.row);
    let prev = -1;
    for (const n of nodes) {
      const p = at.get(n)!;
      if (RAW.has(n.machineId) && !doc.edges.some((e) => e.to.node === n.id)) {
        const to = doc.edges.find((e) => e.from.node === n.id);
        const floor = to ? (at.get(doc.nodes.find((x) => x.id === to.to.node)!)?.row ?? 0) : 0;
        p.row = Math.min(p.row, Math.max(prev + 1, floor));
      }
      prev = p.row;
    }
  }
  // `col` = số cột (COL_W) tính từ thành phẩm sang trái, đã gồm các khoảng gấp đôi (`c1` trong `place`)
  for (const [n, p] of at) {
    n.x = (maxCol - p.col) * COL_W;
    n.y = Math.round(p.row * ROW_H);
  }
  return doc;
}
