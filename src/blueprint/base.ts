import { emptyBlueprint, type BaseRegion, type Blueprint, type Facing, type PlacedMachine } from '../model/types';

/**
 * Cấu hình căn cứ — tab **Base** (người dùng 2026-09-29), chép từ EnKAD "Home › Create new":
 * Valley IV, Valley IV Outpost, Wuling, Wuling Outpost, và cỡ tuỳ chọn.
 *
 * - **Valley IV** không tự đặt được tổng tuyến kho hàng; cấu hình "Upgrade 2, depots" có **dải kho
 *   tổng đặt sẵn ngoài vùng xây** (EnKAD mã hoá trong chuỗi `area`: tổng tuyến 4×8 xoay 90° dọc mép
 *   trên, xoay 180° dọc mép trái, cổng đầu tuyến 4×4 ở góc). Như EnKAD, khung map = vùng xây + 5 ô
 *   mỗi phía, dải kho tổng nằm ở hàng/cột 1…4.
 * - **Wuling** tự đặt tổng tuyến như trước; EnKAD không đặt sẵn gì.
 */
export interface BasePreset {
  label: string;
  w: number;
  d: number;
  /** Công trình đặt sẵn ngoài vùng xây, toạ độ khung EnKAD (vùng xây bắt đầu ở 5,5). */
  fixed?: { machineId: string; x: number; z: number; rot: Facing }[];
  /** Mép có dải kho tổng — để vẽ ô xem trước. */
  edges?: ('top' | 'left')[];
}

export interface BaseLocation {
  region: BaseRegion;
  name: string;
  presets: BasePreset[];
}

const BUS = 'log_hongs_bus';
const SOURCE = 'log_hongs_bus_source';

/** Dải tổng tuyến dọc mép trên: x = 5, 13, 21 … tới hết bề rộng (EnKAD `area`). */
const topStrip = (w: number): BasePreset['fixed'] => {
  const out: NonNullable<BasePreset['fixed']> = [];
  for (let x = 5; x < w + 5; x += 8) out.push({ machineId: BUS, x, z: 1, rot: 90 });
  return out;
};
const leftStrip = (d: number): BasePreset['fixed'] => {
  const out: NonNullable<BasePreset['fixed']> = [];
  for (let z = 5; z < d + 5; z += 8) out.push({ machineId: BUS, x: 1, z, rot: 180 });
  return out;
};

export const BASE_LOCATIONS: BaseLocation[] = [
  {
    region: 'valley4',
    name: 'Valley IV',
    presets: [
      {
        label: 'Upgrade 2, depots',
        w: 70,
        d: 70,
        fixed: [{ machineId: SOURCE, x: 1, z: 1, rot: 90 }, ...topStrip(70)!, ...leftStrip(70)!],
        edges: ['top', 'left'],
      },
      { label: 'Upgrade 2', w: 70, d: 70 },
      { label: 'Upgrade 1', w: 52, d: 52 },
      { label: 'Default', w: 38, d: 38 },
    ],
  },
  {
    region: 'valley4_outpost',
    name: 'Valley IV Outpost',
    presets: [
      { label: 'Upgrade 2, depots', w: 40, d: 40, fixed: topStrip(40), edges: ['top'] },
      { label: 'Upgrade 2', w: 40, d: 40 },
      { label: 'Upgrade 1', w: 32, d: 32 },
      { label: 'Default', w: 24, d: 27 },
    ],
  },
  {
    region: 'wuling',
    name: 'Wuling',
    presets: [
      { label: 'Upgrade 2', w: 80, d: 80 },
      { label: 'Upgrade 1', w: 60, d: 60 },
      { label: 'Default', w: 40, d: 40 },
    ],
  },
  {
    region: 'wuling_outpost',
    name: 'Wuling Outpost',
    presets: [
      { label: 'Upgrade 2', w: 50, d: 50 },
      { label: 'Upgrade 1', w: 40, d: 40 },
      { label: 'Default', w: 30, d: 30 },
    ],
  },
];

/** Cỡ tuỳ chọn: như EnKAD, 3 … 300 mỗi chiều. */
export const CUSTOM_MIN = 3;
export const CUSTOM_MAX = 300;

/** Map mới, trống, theo một cấu hình căn cứ. */
export function createBase(region: BaseRegion, preset: BasePreset, locationName: string): Blueprint {
  const label = `${locationName} · ${preset.label}`;
  if (!preset.fixed?.length) {
    const bp = emptyBlueprint(preset.w, preset.d);
    bp.name = label;
    bp.base = { region, label };
    return bp;
  }
  const bp = emptyBlueprint(preset.w + 10, preset.d + 10);
  bp.name = label;
  bp.base = { region, label };
  bp.buildArea = { x: 5, z: 5, w: preset.w, d: preset.d };
  for (const f of preset.fixed) {
    const m: PlacedMachine = {
      uid: bp.nextUid++,
      machineId: f.machineId,
      x: f.x,
      z: f.z,
      rot: f.rot,
      recipeId: null,
      binding: {},
      count: 1,
      fixed: true,
    };
    bp.machines.push(m);
  }
  return bp;
}
