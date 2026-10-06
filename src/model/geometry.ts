import {
  PIPE_LEVEL,
  activePorts,
  portKey,
  type Cell,
  type Dir4,
  type Facing,
  type Layer,
  type MachineDef,
  type PlacedMachine,
  type Port,
  type PortDir,
  type PortKey,
  type PortKind,
} from './types';

/** Vector hướng trên lưới. */
export interface Dir {
  dx: number;
  dz: number;
}

export const DIRS: Dir[] = [
  { dx: 0, dz: -1 },
  { dx: 1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: -1, dz: 0 },
];

/** Chỉ số trong `DIRS` của một vector hướng đơn vị. */
export function dirIndex(d: Dir): Dir4 {
  if (d.dz < 0) return 0;
  if (d.dx > 0) return 1;
  if (d.dz > 0) return 2;
  return 3;
}

export const opposite = (d: Dir4): Dir4 => ((d + 2) % 4) as Dir4;

export const step = (c: Cell, d: Dir4): Cell => ({ x: c.x + DIRS[d]!.dx, z: c.z + DIRS[d]!.dz });

/** Hướng từ ô `a` sang ô kề `b`. */
export const dirBetween = (a: Cell, b: Cell): Dir4 => dirIndex({ dx: b.x - a.x, dz: b.z - a.z });

/** Kích thước footprint sau khi quay. */
export function footprint(def: MachineDef, rot: Facing): { w: number; d: number } {
  return rot === 90 || rot === 270
    ? { w: def.size.d, d: def.size.w }
    : { w: def.size.w, d: def.size.d };
}

/**
 * Quay một ô local quanh gốc footprint.
 * `(x,z)` trong hộp `w x d` chưa quay → ô tương ứng trong hộp đã quay.
 */
export function rotateLocal(x: number, z: number, w: number, d: number, rot: Facing): Cell {
  switch (rot) {
    case 0:
      return { x, z };
    case 90:
      return { x: d - 1 - z, z: x };
    case 180:
      return { x: w - 1 - x, z: d - 1 - z };
    case 270:
      return { x: z, z: w - 1 - x };
  }
}

export function rotateDir(dir: Dir, rot: Facing): Dir {
  switch (rot) {
    case 0:
      return dir;
    case 90:
      return { dx: -dir.dz, dz: dir.dx };
    case 180:
      return { dx: -dir.dx, dz: -dir.dz };
    case 270:
      return { dx: dir.dz, dz: -dir.dx };
  }
}

/**
 * `facing` của bảng dữ liệu game là **hướng dòng vật chất chảy**, không phải hướng
 * quay mặt của cổng.
 *
 * Bảng game dùng hệ trục **ngược chiều x** so với lưới vẽ ra màn hình (hệ tay trái
 * của Unity), nên mọi thứ đọc từ bảng phải lật x: vị trí cổng `x → w-1-x`, hướng
 * dòng chảy `dx → -dx`. EnKAD làm đúng như vậy
 * (`position = (w - 1 - trans.position.x, trans.position.z)`). Thiếu bước này thì
 * cổng trái↔phải bị tráo — nhìn rõ nhất ở ống ngầm, nơi đầu nối vẽ trên sprite nằm
 * đối diện với cổng.
 *
 * Sau khi lật: `0 → +z, 90 → -x, 180 → -z, 270 → +x`.
 */
export function flowDir(facing: number): Dir {
  switch (((facing % 360) + 360) % 360) {
    case 90:
      return { dx: -1, dz: 0 };
    case 180:
      return { dx: 0, dz: -1 };
    case 270:
      return { dx: 1, dz: 0 };
    default:
      return { dx: 0, dz: 1 };
  }
}

/** Vị trí cổng trong footprint chưa quay, đã lật trục x về hệ của màn hình. */
export const portLocalX = (port: Port, def: MachineDef): number => def.size.w - 1 - port.x;

/**
 * Hướng từ ô cổng ra ô mà băng/ống phải chạm tới, trong hệ local chưa quay.
 *
 * Hàng ra đi *theo* dòng chảy, hàng vào đi *ngược* dòng chảy — nên cùng một
 * `facing:180` mà cổng ra ở mép trước thì chạm vào ô phía -z, còn cổng vào ở mép
 * sau lại chạm vào ô phía +z. Quy tắc này cũng là quy tắc duy nhất xử lý đúng van
 * chia/gộp 1×1, nơi cổng vào và ba cổng ra **dùng chung một ô** và chỉ khác `facing`.
 */
export function localOutward(port: Port): Dir {
  const f = flowDir(port.facing);
  return port.dir === 'out' ? f : { dx: -f.dx, dz: -f.dz };
}

export const layerOfLevel = (level: number): Layer => (level >= PIPE_LEVEL ? 1 : 0);

export const layerOfKind = (kind: PortKind): Layer => (kind === 'pipe' ? 1 : 0);

/** Một cổng đã đặt xuống lưới, mọi toạ độ là toạ độ thế giới. */
export interface WorldPort {
  uid: number;
  key: PortKey;
  index: number;
  dir: PortDir;
  kind: PortKind;
  layer: Layer;
  /** Ô thuộc footprint máy mà cổng nằm trên. */
  cell: Cell;
  /** Ô ngay bên ngoài footprint — nơi băng/ống phải chạm vào. */
  attach: Cell;
  /** Hướng từ `cell` ra `attach`. */
  outward: Dir;
  /**
   * Hướng dòng chảy qua cổng. Cổng ra: ô băng đầu tiên phải nhận hàng theo hướng này.
   * Cổng vào: ô băng cuối cùng phải đẩy hàng theo đúng hướng này — băng tới từ bên
   * hông thì không vào được máy.
   */
  flow: Dir4;
  /** Đầu nối phụ dùng chung; không nối tuyến vào. */
  virtual: boolean;
}

/**
 * Mọi cổng của một máy đã đặt, quy về toạ độ thế giới.
 *
 * Đây là **ranh giới duy nhất** giữa dữ liệu máy và phần còn lại của ứng dụng:
 * routing, solver và renderer chỉ được nhìn máy qua hàm này.
 */
export function worldPorts(placed: PlacedMachine, def: MachineDef): WorldPort[] {
  const { w, d } = def.size;
  // chỉ cổng tồn tại ở chế độ đang bật (máy đổi bộ cổng theo chế độ — `modePorts`)
  return activePorts(def, placed.mode).map((p) => {
    const local = rotateLocal(portLocalX(p, def), p.z, w, d, placed.rot);
    const cell = { x: placed.x + local.x, z: placed.z + local.z };
    const outward = rotateDir(localOutward(p), placed.rot);
    const flow = dirIndex(rotateDir(flowDir(p.facing), placed.rot));
    return {
      uid: placed.uid,
      key: portKey(p.dir, p.index),
      index: p.index,
      dir: p.dir,
      kind: p.kind,
      layer: layerOfLevel(p.level),
      cell,
      attach: { x: cell.x + outward.dx, z: cell.z + outward.dz },
      outward,
      flow,
      virtual: p.virtual === true,
    };
  });
}

/**
 * Những ô mà băng/ống được phép chạm vào để nối với một cổng.
 *
 * Cổng thường chỉ có đúng một ô. Cổng `virtual` thì không cố định chỗ nối — trong
 * game băng chạm vào cạnh nào của máy cũng được — nên trả về cả vành ngoài footprint.
 */
export function attachCells(port: WorldPort, placed: PlacedMachine, def: MachineDef): Cell[] {
  if (!port.virtual) return [port.attach];
  const inside = new Set(footprintCells(placed, def).map(cellKey));
  const out = new Map<string, Cell>();
  for (const c of footprintCells(placed, def))
    for (const d of DIRS) {
      const n = { x: c.x + d.dx, z: c.z + d.dz };
      if (!inside.has(cellKey(n))) out.set(cellKey(n), n);
    }
  return [...out.values()];
}

/** Mọi ô thuộc footprint của một máy đã đặt. */
export function footprintCells(placed: PlacedMachine, def: MachineDef): Cell[] {
  const { w, d } = footprint(def, placed.rot);
  const out: Cell[] = [];
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) out.push({ x: placed.x + dx, z: placed.z + dz });
  }
  return out;
}

/**
 * Máy có chắn layer ống hay không.
 *
 * Trong game, **mọi công trình xử lý chiếm cả hai tầng** — mặt đất lẫn trên không —
 * nên ống không luồn qua được, phải đi vòng. Van chia/gộp *ống* cũng chiếm cả hai.
 * Ngoại lệ duy nhất là van chia/gộp **băng chuyền**: chúng nằm sát đất, ống bắc qua
 * bên trên thoải mái.
 */
export const blocksPipeLayer = (def: MachineDef): boolean => occupiedLayers(def).includes(1);
/**
 * Tầng một công trình chiếm: 0 = mặt đất (băng chuyền), 1 = trên cao (ống).
 * - Van / cầu / cảng của **băng** và công trình thấp (`GROUND_ONLY`): chỉ mặt đất — ống bắc qua bên trên được.
 * - **Cảng Kiểm Soát Ống**: là một đoạn ống ⇒ chỉ trên cao, đặt được phía trên băng chuyền (người dùng 2026-10-02).
 * - Mọi công trình khác: cả hai tầng.
 */
export const occupiedLayers = (def: MachineDef): (0 | 1)[] => {
  if (UPPER_ONLY.has(def.type)) return [1];
  const beltRouter = def.router && def.ports.every((p) => p.kind === 'belt');
  return beltRouter || GROUND_ONLY.has(def.type) ? [0] : [0, 1];
};
const UPPER_ONLY = new Set(['LogPipeConditioner']);
/**
 * Công trình thấp chỉ chiếm **tầng mặt đất** — ống bắc qua bên trên được (người dùng 2026-10-02): Khu Tổng Tuyến
 * Kho Hàng, Cổng Tổng Tuyến Kho Hàng, Máy Dỡ Hàng Kho, Máy Nâng Hàng Kho.
 */
const GROUND_ONLY = new Set(['BusFree', 'BusStart', 'Unloader', 'Loader']);

export const cellKey = (c: Cell): string => `${c.x},${c.z}`;

export const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.z === b.z;

export const manhattan = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
