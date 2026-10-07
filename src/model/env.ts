import { footprintCells } from './geometry';
import { roleOf } from './roles';
import { isOff } from './switchOff';
import type { Blueprint, CatalystEnv, Cell, Dataset, MachineDef, PlacedMachine } from './types';

/** Hình chữ nhật vùng phủ của một máy đã đặt, tính ra toạ độ thế giới. */
export function auraRect(
  placed: PlacedMachine,
  def: MachineDef,
): { x: number; z: number; w: number; d: number } | undefined {
  const a = def.aura;
  if (!a) return undefined;
  // vùng phủ là hình vuông quanh máy nên phép quay không đổi hình dạng
  return { x: placed.x + a.dx, z: placed.z + a.dz, w: a.w, d: a.d };
}

const contains = (
  r: { x: number; z: number; w: number; d: number },
  c: Cell,
): boolean => c.x >= r.x && c.z >= r.z && c.x < r.x + r.w && c.z < r.z + r.d;

export const rectsOverlap = (
  a: { x: number; z: number; w: number; d: number },
  b: { x: number; z: number; w: number; d: number },
): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

export interface EnvField {
  /** Môi trường mà mỗi máy đang **thực sự** nằm trong, theo uid. */
  envOf: Map<number, CatalystEnv>;
  /** Vùng phủ đang hoạt động, để vẽ và để kiểm tra chồng lấn. */
  zones: { uid: number; env: CatalystEnv; rect: { x: number; z: number; w: number; d: number } }[];
  /** uid những máy nằm trong tầm cấp điện. */
  powered: Set<number>;
  /** Vùng cấp điện để vẽ. */
  powerZones: { uid: number; rect: { x: number; z: number; w: number; d: number } }[];
}

/**
 * Tính môi trường xúc tác phủ lên từng máy.
 *
 * Hai điểm quan trọng, đúng như cơ chế trong game:
 *  - máy tạo môi trường sinh ra **loại môi trường theo khí nạp vào cổng kích hoạt**,
 *    nên không nạp khí thì không có môi trường nào cả;
 *  - một máy chỉ được coi là ở trong môi trường khi **toàn bộ** đế của nó nằm lọt
 *    trong vùng phủ; thò ra một ô cũng không tính.
 */
export function computeEnv(
  bp: Blueprint,
  ds: Dataset,
  /** Khí thực sự đang chảy vào cổng kích hoạt của từng máy tạo môi trường. */
  activatorItem: Map<number, string | null>,
): EnvField {
  const zones: EnvField['zones'] = [];
  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    if (!def || roleOf(def) !== 'envgen' || isOff(m, def)) continue; // máy tạo môi trường đã tắt ⇒ không có vùng
    const rect = auraRect(m, def);
    if (!rect) continue;
    const gas = activatorItem.get(m.uid);
    const env = gas ? ds.items.get(gas)?.producesEnv : undefined;
    if (!env) continue;
    zones.push({ uid: m.uid, env, rect });
  }

  // Tầm cấp điện: cột 7×7, trụ 12×12. Khác vùng môi trường ở hai điểm — chúng **không**
  // loại trừ nhau, và máy chỉ cần **chạm** vào vùng là đủ, không phải nằm trọn.
  const powerZones: EnvField['powerZones'] = [];
  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    if (def?.aura?.kind !== 'power' || isOff(m, def)) continue; // cột / trụ điện đã tắt ⇒ không cấp điện
    const rect = auraRect(m, def);
    if (rect) powerZones.push({ uid: m.uid, rect });
  }

  const envOf = new Map<number, CatalystEnv>();
  const powered = new Set<number>();
  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    if (!def) continue;
    const cells = footprintCells(m, def);
    for (const z of zones) {
      if (z.uid === m.uid) continue; // bản thân máy tạo môi trường không hưởng tác dụng
      if (cells.every((c) => contains(z.rect, c))) {
        envOf.set(m.uid, z.env);
        break;
      }
    }
    if (powerZones.some((z) => cells.some((c) => contains(z.rect, c)))) powered.add(m.uid);
  }
  return { envOf, zones, powered, powerZones };
}
