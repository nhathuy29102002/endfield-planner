import { cellKey, footprintCells, opposite, step, worldPorts, type WorldPort } from './geometry';
import type { BeltTile, Blueprint, Cell, Dataset, Dir4, Endpoint, PortKind } from './types';

/**
 * Một chuỗi ô băng/ống nối liền nhau, suy ra từ hình học.
 *
 * Bản vẽ chỉ lưu từng ô với hướng vào/ra của nó. Chuỗi là thứ **tính ra**: bắt đầu ở
 * một cổng ra (hoặc ở một ô không ai đẩy hàng vào), đi theo `out` của từng ô sang ô kế
 * tiếp — chỉ khi ô kế tiếp nhận hàng đúng từ hướng đó — và dừng khi chạm cổng vào của
 * một máy, hoặc khi hết đường.
 */
export interface Chain {
  /** Khoá ổn định: vị trí và tầng của ô đầu. */
  id: string;
  kind: PortKind;
  tiles: number[];
  from: Endpoint | null;
  to: Endpoint | null;
}

export interface Network {
  chains: Chain[];
  /** chỉ số ô → id chuỗi chứa nó */
  chainOf: Map<number, string>;
}

const layerOf = (k: PortKind): number => (k === 'pipe' ? 1 : 0);
const tileKey = (kind: PortKind, c: Cell): string => `${layerOf(kind)}:${c.x},${c.z}`;

interface PortRef {
  port: WorldPort;
  inside: Set<string>;
}

/**
 * Cổng nào nhận hàng từ ô `c` khi ô đó đẩy theo hướng `out`.
 *
 * Cổng thường: ô phải nằm đúng ở ô chạm của cổng *và* đẩy theo đúng hướng dòng chảy
 * của cổng — băng tới từ bên hông không vào được máy, dù đứng sát ngay đó.
 * Cổng `virtual`: nhận từ bất kỳ phía nào, miễn là ô kế tiếp nằm trong đế máy.
 */
function inPortAt(ins: PortRef[], kind: PortKind, c: Cell, out: Dir4): WorldPort | undefined {
  const next = step(c, out);
  for (const { port, inside } of ins) {
    if (port.kind !== kind) continue;
    if (port.virtual) {
      if (inside.has(cellKey(next))) return port;
    } else if (port.attach.x === c.x && port.attach.z === c.z && port.flow === out) {
      return port;
    }
  }
  return undefined;
}

export function buildNetwork(bp: Blueprint, ds: Dataset): Network {
  const tileAt = new Map<string, number>();
  bp.belts.forEach((t, i) => tileAt.set(tileKey(t.kind, t), i));

  const ins: PortRef[] = [];
  const outs: PortRef[] = [];
  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    if (!def) continue;
    const inside = new Set(footprintCells(m, def).map(cellKey));
    for (const port of worldPorts(m, def)) (port.dir === 'in' ? ins : outs).push({ port, inside });
  }

  const chains: Chain[] = [];
  const chainOf = new Map<number, string>();

  const trace = (first: number, from: Endpoint | null): void => {
    const t0 = bp.belts[first]!;
    const id = tileKey(t0.kind, t0);
    const tiles: number[] = [];
    let to: Endpoint | null = null;
    let cur = first;
    for (;;) {
      if (chainOf.has(cur)) break; // vòng kín, hoặc đã thuộc chuỗi khác
      tiles.push(cur);
      chainOf.set(cur, id);
      const t = bp.belts[cur]!;
      const port = inPortAt(ins, t.kind, t, t.out);
      if (port) {
        to = { uid: port.uid, portKey: port.key };
        break;
      }
      const next = tileAt.get(tileKey(t.kind, step(t, t.out)));
      if (next === undefined || bp.belts[next]!.in !== t.out) break;
      cur = next;
    }
    chains.push({ id, kind: t0.kind, tiles, from, to });
  };

  // 1. chuỗi xuất phát từ cổng ra
  for (const { port, inside } of outs) {
    if (port.virtual) {
      // cổng không cố định chỗ nối: ô nào sát đế máy mà nhận hàng *từ phía máy* là được
      for (const c of inside) {
        const [x, z] = c.split(',').map(Number) as [number, number];
        for (let d = 0 as Dir4; d < 4; d = (d + 1) as Dir4) {
          const n = step({ x, z }, d);
          if (inside.has(cellKey(n))) continue;
          const i = tileAt.get(tileKey(port.kind, n));
          if (i !== undefined && !chainOf.has(i) && bp.belts[i]!.in === d)
            trace(i, { uid: port.uid, portKey: port.key });
        }
      }
      continue;
    }
    const i = tileAt.get(tileKey(port.kind, port.attach));
    if (i !== undefined && !chainOf.has(i) && bp.belts[i]!.in === port.flow)
      trace(i, { uid: port.uid, portKey: port.key });
  }

  // 2. ô không ai đẩy hàng vào: đầu của một đoạn băng mồ côi
  bp.belts.forEach((t, i) => {
    if (chainOf.has(i)) return;
    const prev = tileAt.get(tileKey(t.kind, step(t, opposite(t.in))));
    const fed = prev !== undefined && bp.belts[prev]!.out === t.in;
    if (!fed) trace(i, null);
  });

  // 3. phần còn lại là vòng kín
  bp.belts.forEach((_, i) => {
    if (!chainOf.has(i)) trace(i, null);
  });

  // 4. **cổng kề cổng**: máy / van đặt sát ngay cổng ra của máy khác, không có ô băng/ống ở giữa
  //    (vd. van tách ống đặt sát cửa xả ống dẫn) — như trong game, hàng đi thẳng từ cổng ra sang
  //    cổng vào. Cổng vào phải nằm đúng ở ô chạm của cổng ra và nhận đúng hướng dòng chảy; cổng
  //    ra `virtual` thì cổng vào nào hút hàng từ trong đế máy đó cũng được. Chuỗi này không có ô.
  //    Mỗi cổng vào chỉ nhận **một** nối trực tiếp — cổng ra thật xét trước cổng `virtual` (cùng
  //    một đầu nối vật lý, đếm hai lần là gấp đôi lượng hàng).
  //    Luật đổi 2026-10-04 (người dùng): cổng ra của **máy** đặt sát cổng vào của **máy** khác thì KHÔNG nhận hàng —
  //    bắt buộc phải có băng / ống ở giữa. Chỉ còn hợp lệ khi một trong hai đầu là **van / cầu** (1×1 logistics,
  //    `def.router`: van tách / gộp / lọc, cầu) — *suy luận* giữ luật cũ "van đặt sát máy / cửa xả" mà người dùng đã chốt.
  const routerUid = new Set(bp.machines.filter((m) => ds.machines.get(m.machineId)?.router).map((m) => m.uid));
  const fed = new Set<string>();
  const ordered = [...outs].sort((a, b) => Number(a.port.virtual) - Number(b.port.virtual));
  for (const { port: out, inside } of ordered) {
    for (const { port: inp } of ins) {
      if (inp.uid === out.uid || inp.kind !== out.kind || inp.virtual) continue;
      if (!routerUid.has(out.uid) && !routerUid.has(inp.uid)) continue; // máy kề máy: không nhận
      const touching = out.virtual
        ? inside.has(cellKey(inp.attach))
        : inp.cell.x === out.attach.x && inp.cell.z === out.attach.z && inp.flow === out.flow;
      if (!touching || fed.has(`${inp.uid}:${inp.key}`)) continue;
      fed.add(`${inp.uid}:${inp.key}`);
      chains.push({
        id: `direct:${out.uid}:${out.key}>${inp.uid}:${inp.key}`,
        kind: out.kind,
        tiles: [],
        from: { uid: out.uid, portKey: out.key },
        to: { uid: inp.uid, portKey: inp.key },
      });
    }
  }

  return { chains, chainOf };
}

/** Ô đang có băng/ống ở tầng tương ứng, nếu có. */
export function beltAt(bp: Blueprint, kind: PortKind, c: Cell): { tile: BeltTile; index: number } | undefined {
  const index = bp.belts.findIndex((t) => t.kind === kind && t.x === c.x && t.z === c.z);
  return index >= 0 ? { tile: bp.belts[index]!, index } : undefined;
}
