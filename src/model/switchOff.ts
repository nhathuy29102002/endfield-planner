import type { MachineDef } from './types';
import { roleOf } from './roles';

/**
 * Máy **tắt được** bằng Tab (người dùng 2026-10-06, "tắt máy để tiết kiệm điện"): máy dùng điện và trạm điện. Bộ chia,
 * cầu, băng / ống… không dùng điện nên không có trạng thái tắt.
 */
export const canSwitchOff = (def: MachineDef | undefined): boolean => !!def && (def.power > 0 || roleOf(def) === 'generator');
