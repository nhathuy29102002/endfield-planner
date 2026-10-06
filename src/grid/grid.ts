import { loadDataset } from '../model/dataset';
import { auraRect, rectsOverlap } from '../model/env';
import {
  occupiedLayers,
  cellKey,
  footprintCells,
} from '../model/geometry';
import type {
  Blueprint,
  Cell,
  Dataset,
  Facing,
  Layer,
  MachineDef,
  PlacedMachine,
  PortKind,
} from '../model/types';
import { tr } from '../i18n';

export type Occupant =
  | { kind: 'machine'; uid: number }
  | { kind: 'belt'; uid: number; index: number; linkKind: PortKind };

/**
 * Lưới chiếm dụng **hai layer độc lập**.
 *
 * Layer 0 là mặt đất: đế máy và băng chuyền. Layer 1 là cao độ ống. Một máy cao
 * chiếm cả hai layer nên ống không xuyên qua được; máy thấp (đất trồng, biển báo)
 * chỉ chiếm layer 0 nên ống bắc qua bên trên được — đúng như trong game.
 */
export class Grid {
  readonly w: number;
  readonly d: number;
  private readonly cells: Array<Array<Occupant | undefined>>;

  /** Vùng được xây (`Blueprint.buildArea`, không có thì cả map). */
  private readonly build: { x: number; z: number; w: number; d: number };

  constructor(w: number, d: number, build?: { x: number; z: number; w: number; d: number }) {
    this.w = w;
    this.d = d;
    this.build = build ?? { x: 0, z: 0, w, d };
    // lưu thêm một viền `BUILD_MARGIN` ô quanh map (toạ độ âm được)
    const n = (w + 2 * BUILD_MARGIN) * (d + 2 * BUILD_MARGIN);
    this.cells = [new Array(n), new Array(n)];
  }

  private idx(c: Cell): number {
    return (c.z + BUILD_MARGIN) * (this.w + 2 * BUILD_MARGIN) + (c.x + BUILD_MARGIN);
  }

  /**
   * Xây được ở ô này: vùng xây **nới thêm `BUILD_MARGIN` ô mỗi phía** (người dùng 2026-09-29 — máy được thò ra
   * ngoài map tới 5 ô; băng chuyền và van băng thì không, xem `inCore`).
   */
  inBounds(c: Cell): boolean {
    const b = this.build;
    const m = BUILD_MARGIN;
    return (
      c.x >= Math.max(b.x - m, -m) &&
      c.z >= Math.max(b.z - m, -m) &&
      c.x < Math.min(b.x + b.w + m, this.w + m) &&
      c.z < Math.min(b.z + b.d + m, this.d + m)
    );
  }

  /** Trong vùng xây gốc (không tính viền nới) — băng chuyền và van băng chỉ được đặt ở đây. */
  inCore(c: Cell): boolean {
    const b = this.build;
    return c.x >= b.x && c.z >= b.z && c.x < b.x + b.w && c.z < b.z + b.d;
  }

  at(layer: Layer, c: Cell): Occupant | undefined {
    if (!this.inBounds(c)) return { kind: 'machine', uid: -1 }; // ngoài biên coi như bị chắn
    return this.cells[layer]![this.idx(c)];
  }

  free(layer: Layer, c: Cell): boolean {
    return this.inBounds(c) && this.cells[layer]![this.idx(c)] === undefined;
  }

  set(layer: Layer, c: Cell, occ: Occupant | undefined): void {
    if (this.inBounds(c)) this.cells[layer]![this.idx(c)] = occ;
  }

  /** Dựng lại toàn bộ lưới từ bản vẽ. Rẻ hơn là cố cập nhật tăng dần và sai. */
  static fromBlueprint(bp: Blueprint, ds: Dataset): Grid {
    const g = new Grid(bp.area.w, bp.area.d, bp.buildArea);
    for (const m of bp.machines) {
      const def = ds.machines.get(m.machineId);
      if (!def) continue;
      const occ: Occupant = { kind: 'machine', uid: m.uid };
      for (const c of footprintCells(m, def)) for (const layer of occupiedLayers(def)) g.set(layer, c, occ);
    }
    bp.belts.forEach((t, index) => {
      const layer: Layer = t.kind === 'pipe' ? 1 : 0;
      g.set(layer, t, { kind: 'belt', uid: t.group, index, linkKind: t.kind });
    });
    return g;
  }
}

/** Máy được thò ra ngoài vùng xây tối đa bấy nhiêu ô mỗi phía (người dùng 2026-09-29). */
export const BUILD_MARGIN = 5;

/** Van / cầu / cảng của **băng chuyền** — như băng chuyền, không được đặt ở viền ngoài map. */
export const isBeltLogistics = (def: MachineDef): boolean =>
  def.type.startsWith('Log') && def.ports.length > 0 && def.ports.every((p) => p.kind === 'belt');

/** Bật lại kiểm tra địa hình khi nào cần; xem chú thích trong `validatePlacement`. */
export const TERRAIN_RULES = false;

export type TerrainKind = 'mine' | 'crop' | 'water' | 'road';

/** Địa hình rời rạc: chỉ những ô được sơn mới có mặt trong map. */
export type Terrain = Record<string, TerrainKind>;

const terrainAt = (t: Terrain, c: Cell): TerrainKind | undefined => t[cellKey(c)];

const neighbours = (c: Cell): Cell[] => [
  { x: c.x + 1, z: c.z },
  { x: c.x - 1, z: c.z },
  { x: c.x, z: c.z + 1 },
  { x: c.x, z: c.z - 1 },
];

export interface PlacementResult {
  ok: boolean;
  reason?: string;
}

/**
 * Kiểm tra một máy có đặt được ở `(x,z)` với góc `rot` không.
 *
 * Gồm ba loại kiểm tra: trong biên, không chồng lấn (đúng layer mà máy chiếm),
 * và thoả `placement` — tức `limitType` của bảng dữ liệu game.
 */
export function validatePlacement(
  grid: Grid,
  terrain: Terrain,
  def: MachineDef,
  x: number,
  z: number,
  rot: Facing,
  ignoreUid?: number,
  /** Vùng phủ môi trường đang có, để chặn hai máy tạo môi trường phủ chồng nhau. */
  envZones: { uid: number; rect: { x: number; z: number; w: number; d: number } }[] = [],
): PlacementResult {
  const probe: PlacedMachine = {
    uid: -1,
    machineId: def.id,
    x,
    z,
    rot,
    recipeId: null,
    binding: {},
    count: 1,
  };
  const cells = footprintCells(probe, def);
  // máy được thò ra ngoài map tới `BUILD_MARGIN` ô; van băng chuyền thì phải nằm trong map (người dùng 2026-09-29)
  if (cells.some((c) => !grid.inBounds(c))) return { ok: false, reason: tr('Ra ngoài khu vực') };
  if (isBeltLogistics(def) && cells.some((c) => !grid.inCore(c)))
    return { ok: false, reason: tr('Van / cầu băng chuyền không đặt được ở viền ngoài map') };
  const layers: Layer[] = occupiedLayers(def);
  for (const c of cells) {
    for (const layer of layers) {
      const occ = grid.at(layer, c);
      if (occ && occ.uid !== ignoreUid) {
        return {
          ok: false,
          reason: occ.kind === 'machine' ? tr('Chồng lên máy khác') : tr('Chồng lên tuyến vận chuyển'),
        };
      }
    }
  }

  // Ràng buộc địa hình (mỏ, đất trồng, mặt nước, đường) đang **tắt**: ở giai đoạn này
  // việc phải sơn địa hình trước khi đặt được máy gây vướng hơn là giúp ích. Dữ liệu
  // `placement` vẫn giữ nguyên trong `machines.json`, bật lại chỉ là bỏ cờ dưới đây.
  if (TERRAIN_RULES) {
    switch (def.placement) {
      case 'OnMineOnly':
        if (!cells.some((c) => terrainAt(terrain, c) === 'mine'))
          return { ok: false, reason: tr('Phải đặt trên mỏ khoáng') };
        break;
      case 'MustInCropArea':
        if (!cells.every((c) => terrainAt(terrain, c) === 'crop'))
          return { ok: false, reason: tr('Toàn bộ đế phải nằm trong vùng trồng') };
        break;
      case 'PumpReachLiquid':
        if (
          !cells.some(
            (c) =>
              terrainAt(terrain, c) === 'water' ||
              neighbours(c).some((n) => terrainAt(terrain, n) === 'water'),
          )
        )
          return { ok: false, reason: tr('Bơm phải với tới mặt nước') };
        break;
      case 'RoadAttach':
        if (!cells.some((c) => neighbours(c).some((n) => terrainAt(terrain, n) === 'road')))
          return { ok: false, reason: tr('Phải gắn vào đường') };
        break;
      case 'NoLimit':
        break;
    }
  }

  // Vùng phủ của hai máy tạo môi trường loại trừ nhau (`exclusion` trong dữ liệu game):
  // chồng nhau thì không xác định được ô đó thuộc môi trường nào.
  if (def.aura?.kind === 'env') {
    const mine = { x: x + def.aura.dx, z: z + def.aura.dz, w: def.aura.w, d: def.aura.d };
    for (const zone of envZones) {
      if (zone.uid === ignoreUid) continue;
      if (rectsOverlap(mine, zone.rect))
        return { ok: false, reason: tr('Vùng môi trường chồng lên vùng của máy khác') };
    }
  }
  return { ok: true };
}

/**
 * Từng ô của đế máy nếu đặt ở đây, kèm cờ **bị trùng** — để preview tô đỏ đúng phần
 * chồng lên công trình khác thay vì tô đỏ cả máy.
 */
export function ghostCells(
  grid: Grid,
  def: MachineDef,
  x: number,
  z: number,
  rot: Facing,
  ignoreUid?: number,
): { cell: Cell; blocked: boolean }[] {
  const probe: PlacedMachine = { uid: -1, machineId: def.id, x, z, rot, recipeId: null, binding: {}, count: 1 };
  const layers: Layer[] = occupiedLayers(def);
  return footprintCells(probe, def).map((cell) => ({
    cell,
    blocked:
      !grid.inBounds(cell) ||
      (isBeltLogistics(def) && !grid.inCore(cell)) ||
      layers.some((layer) => {
        const occ = grid.at(layer, cell);
        return occ !== undefined && occ.uid !== ignoreUid;
      }),
  }));
}

/** Vùng phủ môi trường của mọi máy tạo môi trường đã đặt (kể cả chưa nạp khí). */
export function envZonesOf(
  bp: Blueprint,
  ds: Dataset,
): { uid: number; rect: { x: number; z: number; w: number; d: number } }[] {
  const out = [];
  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    const rect = def ? auraRect(m, def) : undefined;
    if (def?.aura?.kind === 'env' && rect) out.push({ uid: m.uid, rect });
  }
  return out;
}

/** Tiện cho test: dataset dùng chung, tải một lần. */
let shared: Dataset | undefined;
export const sharedDataset = (): Dataset => (shared ??= loadDataset());
