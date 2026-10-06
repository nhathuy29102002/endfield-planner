import { roleOf } from '../model/roles';
import { portKey, type MachineDef, type PortKey } from '../model/types';

/** Màu hai đầu ống ra: đầu thứ nhất vàng, đầu thứ hai cam. */
export const PIPE_OUT_COLORS = ['#ffd23f', '#ff8a1f'] as const;

/**
 * Máy có **đúng hai đầu ống ra** (không kể van/cầu và cổng `virtual`): hai đầu có thể ra
 * hai chất lỏng/khí khác nhau, nên đánh dấu vàng / cam để phân biệt — ở mũi tên cổng
 * khi preview, và ở mũi tên của ô ống đầu tiên cắm vào mỗi đầu.
 *
 * Thứ tự vàng → cam theo `index` cổng trong dữ liệu game (suy luận: chưa đối chiếu với
 * màu thật trong game).
 */
export function pipeOutColor(def: MachineDef, key: PortKey): string | undefined {
  const role = roleOf(def);
  if (def.router || role === 'bridge') return undefined;
  const outs = def.ports
    .filter((p) => p.dir === 'out' && p.kind === 'pipe' && !p.virtual)
    .sort((a, b) => a.index - b.index);
  if (outs.length !== 2) return undefined;
  const i = outs.findIndex((p) => portKey(p.dir, p.index) === key);
  return i < 0 ? undefined : PIPE_OUT_COLORS[i];
}

/** Màu dải sáng ở ô kề **cổng kích hoạt** (người dùng 2026-10-05: tông xanh lá). */
export const ACTIVATOR_GLOW = '#3ddc84';

/**
 * Máy có dải sáng vàng / cam ở ô kề **cổng ra ống** (người dùng 2026-10-05: Lò Phản Ứng, Lò Mở Rộng, Quả Cầu Phản Ứng Khí,
 * Máy Tinh Chế; lần 2 thêm Máy Chuyển Hoá Khí Lỏng / Rắn). Ống Dẫn Dòng Ra cũng có hai đầu ống ra vàng / cam nhưng
 * người dùng không kể ⇒ chưa có dải.
 */
export const PIPE_GLOW_MACHINES: ReadonlySet<string> = new Set(['mix_pool_1', 'mix_pool_2', 'gas_reactor_1', 'liquid_purifier_1', 'transmuter_1', 'transmuter_2']);

/**
 * Màu **dải sáng nhấp nháy** ở ô kề cổng `key` của máy (Map và cả khi mô phỏng — người dùng 2026-10-05, lần 2):
 * cổng kích hoạt của mọi máy cần chất kích hoạt ⇒ xanh lá; cổng ra ống của các máy trong `PIPE_GLOW_MACHINES` ⇒ đúng
 * màu vàng / cam của cổng đó. Cổng khác ⇒ không có.
 */
export function portGlowColor(def: MachineDef, key: PortKey): string | undefined {
  if (def.activatorPort && key === def.activatorPort) return ACTIVATOR_GLOW;
  if (PIPE_GLOW_MACHINES.has(def.id)) return pipeOutColor(def, key);
  return undefined;
}

/** Máy này có cổng nào cần dải sáng không (lọc nhanh trước khi tính cổng). */
export const hasPortGlow = (def: MachineDef): boolean => !!def.activatorPort || PIPE_GLOW_MACHINES.has(def.id);
