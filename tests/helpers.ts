import { loadDataset } from '../src/model/dataset';
import { emptyBlueprint, portKey, type Blueprint, type Dataset } from '../src/model/types';
import type { Terrain } from '../src/grid/grid';
import { addMachine, connect, setSource } from '../src/editor/ops';

export const ds: Dataset = loadDataset();

export interface Scene {
  bp: Blueprint;
  terrain: Terrain;
}

/**
 * Mặc định **tắt** kiểm tra điện để mỗi bài test không phải rải cột.
 * Bài nào kiểm tra chính tính năng điện thì bật lại bằng `scene(w, d, true)`.
 */
export const scene = (w = 40, d = 40, enforcePower = false): Scene => ({
  bp: { ...emptyBlueprint(w, d), enforcePower },
  terrain: {},
});

/** Sơn một hình chữ nhật địa hình. */
export function paint(
  terrain: Terrain,
  kind: 'mine' | 'crop' | 'water' | 'road',
  x: number,
  z: number,
  w: number,
  d: number,
): void {
  for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) terrain[`${x + dx},${z + dz}`] = kind;
}

export function put(s: Scene, machineId: string, x: number, z: number, rot: 0 | 90 | 180 | 270 = 0): number {
  const r = addMachine(s.bp, ds, s.terrain, machineId, x, z, rot);
  if (!r.ok || r.uid === undefined) throw new Error(`đặt ${machineId} thất bại: ${r.reason}`);
  return r.uid;
}

export function wire(
  s: Scene,
  fromUid: number,
  fromIndex: number,
  toUid: number,
  toIndex: number,
): number {
  const r = connect(
    s.bp,
    ds,
    { uid: fromUid, portKey: portKey('out', fromIndex) },
    { uid: toUid, portKey: portKey('in', toIndex) },
  );
  if (!r.ok || r.group === undefined) throw new Error(`nối thất bại: ${r.reason}`);
  return r.group;
}

export const source = (s: Scene, uid: number, itemId: string, perMinute: number): void => {
  setSource(s.bp, uid, itemId, perMinute);
};
