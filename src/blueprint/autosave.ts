import type { Terrain } from '../grid/grid';
import type { Blueprint } from '../model/types';
import { fromJson, toJson } from './serialize';

/**
 * **Tự lưu map đang làm** vào trình duyệt (người dùng chốt 2026-09-28: "giữ nguyên setup hiện
 * tại của sandbox") — F5 hay mở lại trang vẫn thấy đúng map đang vẽ, không bị nạp lại bản mẫu.
 *
 * Lưu bằng đúng định dạng file bản vẽ (`toJson`) nên đọc lại qua `fromJson` — kể cả nâng cấp
 * định dạng cũ. Chỉ lưu khi bản vẽ đổi (tín hiệu `data`), gom các lần đổi liên tiếp lại.
 */
export const AUTOSAVE_KEY = 'efp:map';

export function loadAutosave(): { bp: Blueprint; terrain: Terrain } | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const plan = fromJson(raw);
    if (!Array.isArray(plan.blueprint.machines) || !Array.isArray(plan.blueprint.belts)) return null;
    return { bp: plan.blueprint, terrain: plan.terrain };
  } catch {
    return null; // hỏng thì thôi, về bản mẫu
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Hẹn lưu sau một nhịp ngắn — kéo băng liên tục không phải ghi đĩa mỗi lần. */
export function scheduleAutosave(get: () => { bp: Blueprint; terrain: Terrain }, delay = 400): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    saveNow(get());
  }, delay);
}

export function saveNow(s: { bp: Blueprint; terrain: Terrain }): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, toJson(s.bp, s.terrain));
  } catch {
    /* đầy bộ nhớ / bị chặn: không lưu được thì thôi, map vẫn đang mở */
  }
}
