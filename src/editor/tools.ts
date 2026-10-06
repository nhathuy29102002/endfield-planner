import { removeMachine, setMode } from './ops';
import {
  boundsCenter,
  commitGroup,
  deleteSelection,
  emptySelection,
  planGroup,
  selectionBounds,
  planPieces,
  selectionSize,
  type Selection,
} from './group';
import { moduleFromSelection, piecesSize, type SavedBlueprint } from '../blueprint/library';
import type { Pieces } from './group';
import { toast } from '../ui/toast';
import type { Cell, Facing } from '../model/types';
import { originFor } from './placement';
import { saveLabelSetting } from '../render/renderer';
import type { Renderer } from '../render/renderer';
import type { AppState, Tool } from './state';
import { tr } from '../i18n';

/**
 * Đổi công cụ — **một chỗ duy nhất** quyết định tầng đang làm việc.
 *
 * Trước đây nút bấm gọi `setTool` rồi mới đổi tầng, nên khung hình vẽ ra ngay sau đó
 * dùng tầng cũ: bấm Băng sau khi vừa đặt ống thì băng vẫn bị vẽ mờ như đang ở tầng trên.
 * Ở đây tầng được đặt **trước**, rồi mới phát tín hiệu vẽ lại.
 *
 * Quy tắc: đặt ống ⇒ tầng trên; đặt băng ⇒ mặt đất; rời chế độ đặt ống ⇒ về mặt đất,
 * để không bị "kẹt" ở tầng trên sau khi đã xong việc với ống.
 */
export function enterTool(state: AppState, renderer: Renderer, tool: Tool): void {
  const prev = state.tool;
  if (tool.kind === 'link') renderer.activeLayer = tool.linkKind === 'pipe' ? 1 : 0;
  else if (prev.kind === 'link' && prev.linkKind === 'pipe') renderer.activeLayer = 0;
  renderer.preview = null;
  renderer.startHint = null;
  state.setTool(tool);
}

export function toggleLayer(state: AppState, renderer: Renderer): void {
  renderer.activeLayer = renderer.activeLayer === 0 ? 1 : 0;
  state.notify(renderer.activeLayer === 0 ? tr('Đang xem mặt đất (băng chuyền)') : tr('Đang xem trên cao (ống)'));
}

/**
 * Di chuyển máy đang chọn: nhấc máy khỏi chỗ cũ, preview bám con trỏ.
 * Bản vẽ **chưa đổi gì** cho tới khi bấm đặt — nên Esc chỉ cần thoát chế độ là máy
 * "về chỗ cũ", không phải hoàn tác gì cả.
 */
export function startMove(state: AppState, renderer: Renderer, uid: number): void {
  const m = state.bp.machines.find((v) => v.uid === uid);
  if (!m) return;
  enterTool(state, renderer, { kind: 'place', machineId: m.machineId, rot: m.rot, mode: 'move', sourceUid: uid, machineMode: m.mode });
  liftTo(state, renderer, m.machineId, m.rot, { x: m.x, z: m.z });
  state.notify(tr('Di chuyển: chuột trái đặt · giữ chuột phải + rê để xoay · Tab đổi chế độ · Esc trả về chỗ cũ'));
}

/** Sao chép máy đang chọn: máy gốc giữ nguyên, đặt bao nhiêu bản sao cũng được tới khi Esc. */
export function startCopy(state: AppState, renderer: Renderer, uid: number): void {
  const m = state.bp.machines.find((v) => v.uid === uid);
  if (!m) return;
  enterTool(state, renderer, { kind: 'place', machineId: m.machineId, rot: m.rot, mode: 'copy', sourceUid: uid, machineMode: m.mode });
  liftTo(state, renderer, m.machineId, m.rot, { x: m.x, z: m.z });
  state.notify(tr('Sao chép: chuột trái đặt bản sao · giữ chuột phải + rê để xoay · Tab đổi chế độ · Esc để tắt'));
}

/**
 * Preview máy vừa nhấc lên: tâm máy nhảy ngay tới ô dưới con trỏ (giống nhóm), để thấy
 * preview liền. Con trỏ không nằm trên bản vẽ thì hiện tại chỗ cũ.
 */
function liftTo(state: AppState, renderer: Renderer, machineId: string, rot: Facing, fallback: Cell): void {
  const def = state.ds.machines.get(machineId);
  const hover = renderer.hover.cell;
  renderer.ghost = def && hover ? originFor(def, rot, hover) : fallback;
}

export function deleteSelected(state: AppState, renderer: Renderer): void {
  const uid = state.selection;
  if (uid !== null) {
    state.mutate(tr('Xoá máy'), () => removeMachine(state.bp, uid));
    enterTool(state, renderer, { kind: 'select' });
    state.select(null);
    return;
  }
  // chọn nhiều: xoá luôn không hỏi — Ctrl+Z hoàn tác được, và cả nhóm là **một** bước
  if (selectionSize(state.sel) === 0) return;
  const sel = state.sel;
  state.mutate(tr('Xoá {0}', describeSelection(state)), () => deleteSelection(state.bp, sel));
  enterTool(state, renderer, { kind: 'select' });
  state.setSelection(emptySelection());
}

/** "3 máy, 12 ô băng, 4 ô ống" — dùng cho thông báo và nhãn nút. */
export function describeSelection(state: AppState): string {
  const parts: string[] = [];
  let belt = 0;
  let pipe = 0;
  for (const k of state.sel.tiles) {
    if (k.startsWith('pipe:')) pipe++;
    else belt++;
  }
  if (state.sel.machines.size) parts.push(tr('{0} máy', state.sel.machines.size));
  if (belt) parts.push(tr('{0} ô băng', belt));
  if (pipe) parts.push(tr('{0} ô ống', pipe));
  return parts.join(', ') || tr('không có gì');
}

/**
 * Nhấc cả nhóm đang chọn để di chuyển / sao chép.
 *
 * - Bấm M / C (hoặc nút ở cột nổi): nhóm được cầm **tại tâm của nó** và tâm đó nhảy
 *   ngay tới ô dưới con trỏ — thấy preview liền, không phải rê chuột mới thấy.
 * - Giữ chuột trái kéo máy (`grab`): cầm đúng ô vừa nhấn, nên nhóm không nhảy dưới tay.
 */
export function startGroup(state: AppState, renderer: Renderer, mode: 'move' | 'copy', grab?: Cell): void {
  if (selectionSize(state.sel) === 0) return;
  const b = selectionBounds(state.bp, state.ds, state.sel);
  if (!b) return;
  const drag = grab !== undefined;
  const at = grab ?? boundsCenter(b);
  enterTool(state, renderer, { kind: 'group', mode, anchor: at, turns: 0, drag });
  renderer.groupTarget = renderer.hover.cell ?? at;
  if (drag) return; // đang giữ chuột kéo: không chen thông báo, thả là xong
  state.notify(
    mode === 'move'
      ? tr('Di chuyển {0}: chuột trái đặt · R hoặc giữ chuột phải + rê để xoay · Esc trả về chỗ cũ', describeSelection(state))
      : tr('Sao chép {0}: chuột trái đặt bản sao · R hoặc giữ chuột phải + rê để xoay · Esc để tắt', describeSelection(state)),
  );
}

/**
 * Đặt nhóm đang cầm xuống ô `target`. Trả về `true` nếu đặt được. Di chuyển xong thì
 * về công cụ Chọn với lựa chọn trỏ vào chỗ mới; sao chép thì vẫn cầm để đặt tiếp.
 */
export function dropGroup(state: AppState, renderer: Renderer, target: Cell, out?: { sel?: Selection }): boolean {
  const tool = state.tool;
  if (tool.kind !== 'group') return false;
  const sel = state.sel;
  const mv = { anchor: tool.anchor, target, turns: tool.turns };
  // nhấc lên rồi thả đúng chỗ cũ, không quay: không có gì đổi, đừng tạo bước hoàn tác
  if (tool.mode === 'move' && tool.turns === 0 && !tool.modes && target.x === tool.anchor.x && target.z === tool.anchor.z) {
    enterTool(state, renderer, { kind: 'select' });
    state.setSelection(sel);
    return true;
  }
  const plan = planGroup(state.bp, state.ds, state.terrain, sel, mv, tool.mode);
  if (!plan.ok) {
    state.notify(tr('Không đặt được: {0}', plan.reason));
    return false;
  }
  const what = describeSelection(state);
  let next = sel;
  state.mutate(tool.mode === 'move' ? tr('Di chuyển nhóm') : tr('Sao chép nhóm'), () => {
    next = commitGroup(state.bp, plan, tool.mode);
    // chế độ đổi bằng Tab lúc đang cầm nhóm: máy chuyển tới (hoặc bản sao của nó) nhận chế độ mới
    if (tool.modes) {
      const placed = [...next.machines];
      plan.machines.forEach((e, i) => {
        const mode = tool.modes![e.src.uid];
        const uid = tool.mode === 'move' ? e.src.uid : placed[i];
        if (mode && uid !== undefined) setMode(state.bp, state.ds, uid, mode);
      });
    }
    state.message =
      tool.mode === 'move' ? tr('Đã di chuyển {0}', what) : tr('Đã đặt bản sao {0} — đặt tiếp, hoặc Esc để tắt', what);
  });
  if (out) out.sel = next;
  if (tool.mode === 'move') {
    enterTool(state, renderer, { kind: 'select' });
    state.setSelection(next);
  }
  return true;
}

/**
 * Cầm một bản vẽ module từ thư viện lên con trỏ. Tâm của bản vẽ nằm dưới con trỏ ngay
 * (con trỏ chưa từng vào bản vẽ thì đặt ở giữa khung nhìn).
 */
export function startStamp(state: AppState, renderer: Renderer, saved: SavedBlueprint): void {
  const pieces = saved.module;
  if (!pieces || pieces.machines.length + pieces.tiles.length === 0) return;
  const size = piecesSize(state.ds, pieces);
  const anchor = { x: Math.floor((size.w - 1) / 2), z: Math.floor((size.d - 1) / 2) };
  enterTool(state, renderer, { kind: 'stamp', name: saved.name, pieces, anchor, turns: 0 });
  const view = renderer.viewSize;
  renderer.groupTarget = renderer.hover.cell ?? renderer.camera.toCell(view.w / 2, view.h / 2);
  state.notify(tr('Đặt bản vẽ "{0}": chuột trái đặt · R hoặc giữ chuột phải + rê để xoay · Esc để thôi', saved.name));
}

/** Đặt bản vẽ đang cầm tại `target`. Vướng ⇒ cảnh báo, không đổi gì. */
export function dropStamp(state: AppState, target: Cell): boolean {
  const tool = state.tool;
  if (tool.kind !== 'stamp') return false;
  const mv = { anchor: tool.anchor, target, turns: tool.turns };
  const plan = planPieces(state.ds, state.terrain, tool.pieces, mv, state.bp);
  if (!plan.ok) {
    toast(tr('Không đặt được bản vẽ: {0}', plan.reason));
    state.notify(tr('Không đặt được bản vẽ: {0}', plan.reason));
    return false;
  }
  state.mutate(tr('Đặt bản vẽ'), () => {
    commitGroup(state.bp, plan, 'copy');
    state.message = tr('Đã đặt "{0}" — đặt tiếp, hoặc Esc để thôi', tool.name);
  });
  return true;
}

/**
 * **Bộ nhớ tạm** của Ctrl+C (người dùng 2026-09-29): Ctrl+C chép nhóm đang chọn vào đây (không cầm
 * preview — việc đó là phím C), Ctrl+V cầm ra như đặt một bản vẽ. Các tab Map dùng chung một trang
 * nên chép ở tab 1 dán được sang tab 2. Chỉ nằm trong bộ nhớ trang (tải lại trang là mất).
 */
let clipboard: Pieces | null = null;

/** Sự kiện báo đã chép xong — nút Sao chép ở cột nổi hiện dấu tích xanh 2 giây (`ui/dock.ts`). */
export const COPIED_EVENT = 'efp:copied';

/** Ctrl+C: chép những gì đang chọn vào bộ nhớ tạm. */
export function copyToClipboard(state: AppState): boolean {
  if (selectionSize(state.sel) === 0) {
    state.notify(tr('Chưa chọn gì để chép'));
    return false;
  }
  clipboard = moduleFromSelection(state.bp, state.ds, state.sel);
  state.notify(tr('Đã chép {0} vào bộ nhớ tạm — Ctrl+V để dán (dán được sang tab Map khác)', describeSelection(state)));
  window.dispatchEvent(new Event(COPIED_EVENT));
  return true;
}

export const hasClipboard = (): boolean => clipboard !== null;

/** Ctrl+V: cầm bản trong bộ nhớ tạm lên con trỏ để đặt (đặt được nhiều lần tới khi Esc). */
export function pasteClipboard(state: AppState, renderer: Renderer): void {
  if (!clipboard) {
    state.notify(tr('Bộ nhớ tạm trống — chọn công trình rồi bấm Ctrl+C để chép'));
    return;
  }
  // một van / cầu đơn lẻ: đặt như máy (tự xoay theo băng / ống, thay ô tuyến) thay vì dán cả bộ
  const only = clipboard.machines.length === 1 && clipboard.tiles.length === 0 ? clipboard.machines[0]! : null;
  const def = only ? state.ds.machines.get(only.machineId) : undefined;
  if (only && def?.router) {
    enterTool(state, renderer, { kind: 'place', machineId: only.machineId, rot: only.rot, mode: 'new', template: structuredClone(only), machineMode: only.mode });
    liftTo(state, renderer, only.machineId, only.rot, { x: only.x, z: only.z });
    state.notify(tr('Dán {0}: rê lên băng / ống để tự xoay theo tuyến, chuột trái đặt (đặt tiếp được), Esc để tắt', def.name));
    return;
  }
  startStamp(state, renderer, {
    id: 'clipboard',
    name: tr('Bộ nhớ tạm'),
    icon: null,
    kind: 'module',
    created: Date.now(),
    preview: '',
    module: structuredClone(clipboard),
  });
}

/**
 * Tâm quay đã dùng cho một lựa chọn. Hộp bao có một cạnh chẵn thì "ô giữa" sau mỗi lần
 * quay lệch đi nửa ô; tính lại tâm mỗi lần thì bấm R bốn lần nhóm bị trôi. Giữ nguyên
 * tâm cho các lần R liên tiếp ⇒ bốn lần R về **đúng** chỗ cũ.
 */
const rotatePivot = new WeakMap<Selection, Cell>();

/** Quay nhóm đang chọn 90° tại chỗ (phím R khi không cầm gì), quanh ô giữa nhóm. */
export function rotateSelection(state: AppState): void {
  const b = selectionBounds(state.bp, state.ds, state.sel);
  if (!b) return;
  const c = rotatePivot.get(state.sel) ?? boundsCenter(b);
  const plan = planGroup(state.bp, state.ds, state.terrain, state.sel, { anchor: c, target: c, turns: 1 }, 'move');
  if (!plan.ok) {
    state.notify(tr('Không quay được: {0}', plan.reason));
    return;
  }
  let next = state.sel;
  state.mutate(tr('Quay nhóm'), () => {
    next = commitGroup(state.bp, plan, 'move');
  });
  rotatePivot.set(next, c);
  state.setSelection(next);
}

/** Bật/tắt biển tên máy trên bản vẽ — nhiều máy sát nhau thì tên che mất hình. */
export function toggleLabels(state: AppState, renderer: Renderer): void {
  renderer.showLabels = !renderer.showLabels;
  saveLabelSetting(renderer.showLabels);
  state.notify(renderer.showLabels ? tr('Hiện tên máy') : tr('Ẩn tên máy'));
}

/** Kéo máy từ bảng chọn (người dùng 2026-10-02): rê quá chừng này pixel mới tính là kéo. */
export const PALETTE_DRAG_PX = 6;
/** Thả máy đang kéo từ bảng chọn (`detail` = toạ độ màn hình) — bên Map do `input.ts` xử lý. */
export const PALETTE_DROP_EVENT = 'efp:palette-drop';
