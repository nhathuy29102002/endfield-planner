import type { AppState, Tool } from '../editor/state';
import type { Renderer } from '../render/renderer';
import type { InputHandle } from '../editor/input';
import { boxSelection, selectionBounds, unionSelection, tileKeyOf } from '../editor/group';
import { machineAt } from '../editor/ops';
import { deleteSelected, enterTool, startGroup } from '../editor/tools';
import { BeltPath } from '../editor/beltPath';
import { commitPlan } from '../editor/belts';
import { beltAt } from '../model/network';
import { footprint } from '../model/geometry';
import type { Cell } from '../model/types';
import { pressKey, touchModes } from './touch';
import { tr } from '../i18n';

/**
 * **Điều khiển cảm ứng của Map** — cơ chế quản lý máy riêng cho điện thoại (người dùng 2026-10-05, lần 2):
 *
 * - Một ngón rê = kéo bản đồ, hai ngón = kéo + chụm/mở để zoom (mọi lúc).
 * - **Đặt máy mới**: chọn máy ở bảng chọn máy (máy đó được tô sáng), **chạm vào bản đồ ⇒ đặt preview** (chưa đặt máy);
 *   rê từ preview = dời preview; chạm chỗ khác = preview nhảy tới đó. Thanh thao tác bên phải: **Đặt / Xoay / Huỷ**;
 *   máy có chế độ ⇒ thanh chọn chế độ ở trên cùng (`touchActions.ts`).
 * - **Chọn**: chạm máy / ô băng = chọn (nút "Chọn thêm" bật ⇒ thêm vào vùng chọn); giữ 0,5 s ở ô trống ⇒ khoanh vùng
 *   (hoặc nút "Chọn vùng"). Đang chọn ⇒ thanh bên phải thành thanh thao tác máy.
 * - **Giữ tay 0,5 s trên máy / nhóm đang chọn ⇒ rê theo ngón tay, nhấc tay là đặt luôn** và chọn chỗ mới (lần 4; đặt
 *   không được thì vẫn ở chế độ di chuyển). Nút "Di chuyển" thì preview đứng lại khi nhấc tay, đặt bằng ✓. Giữ trên máy
 *   **chưa chọn** ⇒ khoanh vùng như ở ô trống (lần 3).
 * - **Đặt băng / ống**: ngón tay vẽ đường (`editor/beltPath.ts`), cả phiên được xem trước (kể cả cầu); chỉ Đặt / Huỷ.
 *   Đặt ngón vào đầu ống (hoặc ô kề) ⇒ vẽ tiếp; chưa có đường ⇒ chạm đâu bắt đầu ở đó; có đường rồi mà chạm chỗ khác
 *   ⇒ kéo bản đồ.
 */

const SLOP = 10;
const HOLD_MS = 500;

/** Trạng thái dùng chung với thanh thao tác. */
export interface MapTouch {
  /** Đường băng / ống đang vẽ (công cụ `link`). */
  path: BeltPath | null;
  commit(): void;
  cancel(): void;
  rotate(): void;
  copy(): void;
  move(): void;
  remove(): void;
  /** Cầm một công trình (van gộp / tách, cảng kiểm soát, cầu nối…) để đặt như chọn ở bảng chọn máy. */
  placeMachine(machineId: string): void;
  /** Đang có preview đặt được (máy mới / nhóm / bản vẽ) hoặc đường ống đặt được. */
  canCommit(): boolean;
}

const vibrate = (ms: number): void => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* không rung được thì thôi */
  }
};

interface Pt {
  x: number;
  y: number;
}

export function attachMapTouch(canvas: HTMLCanvasElement, state: AppState, renderer: Renderer, input: InputHandle): MapTouch {
  canvas.style.touchAction = 'none';
  type Mode = 'wait' | 'pan' | 'box' | 'preview' | 'draw' | 'forward' | 'done';
  let g: {
    id: number;
    start: Pt;
    last: Pt;
    mode: Mode;
    timer: ReturnType<typeof setTimeout> | null;
    startCell: Cell;
    base: Cell | null;
    /** đang dời nhóm do **giữ tay** trên máy đang chọn — nhấc tay là đặt luôn */
    fromHold?: boolean;
  } | null = null;
  let pinch: { c: Pt; d: number } | null = null;
  let lastReason = '';

  const local = (p: Pt): Pt => {
    const r = canvas.getBoundingClientRect();
    return { x: p.x - r.left, y: p.y - r.top };
  };
  const cellAt = (p: Pt): Cell => {
    const l = local(p);
    return renderer.camera.toCell(l.x, l.y);
  };
  const mouse = (type: string, p: Pt, ctrl = false): void =>
    void canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: p.x, clientY: p.y, button: 0, buttons: type === 'mouseup' ? 0 : 1, ctrlKey: ctrl }));

  /** Công cụ đang cầm thứ gì đó có preview (máy mới / di chuyển / sao chép, nhóm, bản vẽ). */
  const previewTool = (): boolean => {
    const t = state.tool;
    return t.kind === 'place' || t.kind === 'stamp' || t.kind === 'group';
  };
  /** Ô "con trỏ" hiện tại của preview (ô tâm), hoặc `null` khi chưa đặt preview. */
  const previewCell = (): Cell | null => {
    const t = state.tool;
    if (t.kind === 'group' || t.kind === 'stamp') return renderer.groupTarget;
    return renderer.ghost ? renderer.hover.cell : null;
  };
  /** Ngón tay đặt lên preview (để kéo preview đi thay vì kéo bản đồ). */
  const onPreview = (c: Cell): boolean => {
    const t = state.tool;
    const at = previewCell();
    if (!at) return false;
    let half = 1.5;
    if (t.kind === 'place' && renderer.ghost) {
      const def = state.ds.machines.get(t.machineId);
      if (def) {
        const f = footprint(def, t.rot);
        const g0 = renderer.ghost;
        return c.x >= g0.x - 1 && c.x <= g0.x + f.w && c.z >= g0.z - 1 && c.z <= g0.z + f.d;
      }
    } else if (t.kind === 'group') {
      const b = selectionBounds(state.bp, state.ds, state.sel);
      if (b) half = Math.max(b.x1 - b.x0 + 1, b.z1 - b.z0 + 1) / 2 + 1;
    } else half = 3;
    return Math.abs(c.x - at.x) <= half && Math.abs(c.z - at.z) <= half;
  };

  // ---- vẽ băng / ống
  const showPath = (): void => {
    const p = api.path;
    renderer.preview = p?.plan() ?? null;
    renderer.pathHead = p?.head ?? null;
    if (p && p.reason !== lastReason) {
      lastReason = p.reason;
      if (p.reason) state.notify(p.reason);
    }
    state.emit('view');
  };
  const pathKind = (): 'belt' | 'pipe' | null => (state.tool.kind === 'link' ? state.tool.linkKind : null);

  // đổi công cụ: bỏ đường đang vẽ / ẩn preview máy vừa chọn ở bảng chọn máy (chưa chạm bản đồ thì chưa có preview)
  let lastTool = state.tool;
  state.subscribe(() => {
    const t = state.tool;
    if (t === lastTool) return;
    const prev = lastTool;
    lastTool = t;
    if (t.kind !== 'link' || (prev.kind === 'link' && prev.linkKind !== t.linkKind)) {
      if (api.path) {
        api.path = null;
        renderer.pathHead = null;
      }
    }
    if (t.kind === 'place' && (t.mode ?? 'new') === 'new' && !(prev.kind === 'place' && prev.machineId === t.machineId)) input.pointAt(null);
  });

  /** Công cụ hiện tại (đọc lại sau khi gọi hàm đổi công cụ — tránh TypeScript giữ kiểu cũ đã thu hẹp). */
  const toolNow = (): Tool => state.tool;

  const api: MapTouch = {
    path: null,
    canCommit() {
      const t = state.tool;
      if (t.kind === 'link') return !!api.path?.plan()?.ok;
      if (t.kind === 'place') return !!renderer.ghost;
      if (t.kind === 'group' || t.kind === 'stamp') return !!renderer.groupTarget;
      return false;
    },
    commit() {
      const t = state.tool;
      if (t.kind === 'link') {
        const plan = api.path?.plan();
        if (!plan?.ok) return;
        state.mutate(t.linkKind === 'pipe' ? tr('Đặt ống') : tr('Đặt băng chuyền'), () => {
          commitPlan(state.bp, plan);
          state.message = plan.endsAtPort
            ? tr('Đã nối {0} vào máy', t.linkKind === 'pipe' ? tr('ống') : tr('băng chuyền'))
            : tr('Đã đặt {0} ô — vẽ tiếp, hoặc Huỷ để thôi', plan.cells.length);
        });
        api.path = null;
        renderer.preview = null;
        renderer.pathHead = null;
        state.emit('view');
        return;
      }
      const wasCopy = t.kind === 'group' && t.mode === 'copy';
      const wasMove = t.kind === 'group' && t.mode === 'move';
      const wasNew = t.kind === 'place' && (t.mode ?? 'new') === 'new';
      const keep = touchModes.keep;
      const r = input.commitHere();
      if (!r.ok) return;
      if (wasNew) {
        // "Đặt tiếp" bật: ẩn preview, vẫn cầm máy đó; tắt: đặt **một** máy rồi thoát chế độ đặt (người dùng 2026-10-06)
        if (keep) input.pointAt(null);
        else enterTool(state, renderer, { kind: 'select' });
      } else if (keep && (wasCopy || t.kind === 'stamp')) {
        // đặt tiếp bản sao / bản vẽ: preview mới ngay cạnh bản vừa đặt
        if (wasCopy && r.sel) {
          enterTool(state, renderer, { kind: 'select' });
          state.setSelection(r.sel);
          api.copy();
        }
      } else if (keep && wasMove && r.sel) {
        // dời xong mà "Đặt tiếp" đang bật ⇒ cầm bản sao của nhóm vừa dời để đặt thêm
        state.setSelection(r.sel);
        api.copy();
      } else if (wasCopy || t.kind === 'stamp') {
        // sao chép / bản vẽ: đặt một bản rồi về chọn — chọn luôn bản vừa đặt
        enterTool(state, renderer, { kind: 'select' });
        state.message = wasCopy ? tr('Đã đặt bản sao — bản sao đang được chọn') : tr('Đã đặt bản vẽ');
        if (r.sel) state.setSelection(r.sel);
        else state.emit('ui');
      }
    },
    cancel() {
      if (state.tool.kind === 'link') {
        api.path = null;
        renderer.preview = null;
        renderer.pathHead = null;
      }
      if (touchModes.box || touchModes.add || touchModes.keep) {
        touchModes.box = touchModes.add = touchModes.keep = false;
        touchModes.changed();
      }
      pressKey('Escape', 'Escape');
    },
    rotate() {
      pressKey('KeyR', 'r');
    },
    move() {
      if (state.tool.kind !== 'select') return;
      startGroup(state, renderer, 'move');
      const t = toolNow();
      if (t.kind === 'group') input.pointAt(t.anchor);
    },
    copy() {
      if (state.tool.kind !== 'select') return;
      // sao chép **sang ô ngay cạnh** (bên phải trên màn hình) rồi cho dời bản sao đi (người dùng 2026-10-05)
      const b = selectionBounds(state.bp, state.ds, state.sel);
      startGroup(state, renderer, 'copy');
      const t = toolNow();
      if (t.kind !== 'group' || !b) return;
      const v = renderer.camera.screenVec(1, 0);
      const w = b.x1 - b.x0 + 1;
      const d = b.z1 - b.z0 + 1;
      input.pointAt({ x: t.anchor.x + Math.round(v.x) * w, z: t.anchor.z + Math.round(v.y) * d });
      state.notify(tr('Bản sao ở ngay bên cạnh — rê để dời, Đặt để đặt'));
    },
    remove() {
      deleteSelected(state, renderer);
    },
    placeMachine(machineId) {
      api.path = null;
      renderer.preview = null;
      renderer.pathHead = null;
      enterTool(state, renderer, { kind: 'place', machineId, rot: 0, mode: 'new' });
      input.pointAt(null);
    },
  };

  const clearTimer = (): void => {
    if (g?.timer) clearTimeout(g.timer);
    if (g) g.timer = null;
  };
  const endBox = (commit: boolean): void => {
    const box = renderer.box;
    renderer.box = null;
    if (commit && box) {
      const picked = boxSelection(state.bp, state.ds, box.a, box.b);
      state.setSelection(touchModes.add ? unionSelection(state.sel, picked) : picked);
    }
    if (touchModes.box) {
      touchModes.box = false;
      touchModes.changed();
    }
    state.emit('view');
  };
  /**
   * Giữ tay trên máy / ô **đang được chọn** ⇒ cầm cả vùng chọn lên để di chuyển. Giữ trên máy **chưa chọn** (hay ô trống)
   * ⇒ `false` — khoanh vùng chọn như ở ô trống (người dùng 2026-10-05, lần 3).
   */
  const holdToMove = (c: Cell): boolean => {
    const m = machineAt(state.bp, state.ds, c);
    const tileKey = (['belt', 'pipe'] as const).map((k) => (beltAt(state.bp, k, c) ? tileKeyOf({ kind: k, x: c.x, z: c.z }) : null)).find((k) => k && state.sel.tiles.has(k));
    const onSelected = (m && !m.fixed && state.sel.machines.has(m.uid)) || (m ? false : !!tileKey);
    if (!onSelected) return false;
    const b = selectionBounds(state.bp, state.ds, state.sel);
    if (!b) return false;
    startGroup(state, renderer, 'move', c);
    // cầm đúng ô dưới ngón tay: preview nằm yên dưới tay, rê là dời theo
    const t = state.tool;
    if (t.kind === 'group') state.setTool({ ...t, drag: false });
    input.pointAt(c);
    return true;
  };

  canvas.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      const ts = e.touches;
      if (ts.length >= 2) {
        if (g && g.mode === 'forward') return;
        if (g) {
          clearTimer();
          if (g.mode === 'box') endBox(false);
          g.mode = 'done';
        }
        pinch = { c: { x: (ts[0]!.clientX + ts[1]!.clientX) / 2, y: (ts[0]!.clientY + ts[1]!.clientY) / 2 }, d: Math.hypot(ts[0]!.clientX - ts[1]!.clientX, ts[0]!.clientY - ts[1]!.clientY) || 1 };
        return;
      }
      const t = e.changedTouches[0]!;
      const p = { x: t.clientX, y: t.clientY };
      const c = cellAt(p);
      g = { id: t.identifier, start: p, last: p, mode: 'wait', timer: null, startCell: c, base: null };
      const kind = state.tool.kind;
      const pk = pathKind();
      if (pk) {
        // vẽ băng / ống: đặt ngón ở đầu ống (hoặc ô kề) ⇒ vẽ tiếp; chưa có đường ⇒ bắt đầu ở đây
        if (api.path && !api.path.empty) {
          const h = api.path.head!;
          if (Math.abs(h.x - c.x) + Math.abs(h.z - c.z) <= 1) {
            api.path.begin(c);
            g.mode = 'draw';
            showPath();
          }
          return; // chạm chỗ khác: đợi xem là kéo bản đồ
        }
        const path = api.path ?? new BeltPath(state.bp, state.ds, pk);
        if (path.begin(c)) {
          api.path = path;
          g.mode = 'draw';
        } else state.notify(path.reason);
        showPath();
        return;
      }
      if (previewTool()) {
        if (onPreview(c)) g.base = previewCell();
        return;
      }
      if (kind === 'terrain') {
        g.mode = 'forward';
        mouse('mousemove', p);
        mouse('mousedown', p);
        return;
      }
      if (kind === 'select' && touchModes.box) {
        g.mode = 'box';
        renderer.box = { a: c, b: c };
        state.emit('view');
        return;
      }
      if (kind === 'select')
        g.timer = setTimeout(() => {
          if (!g || g.mode !== 'wait') return;
          g.timer = null;
          vibrate(25);
          if (holdToMove(g.startCell)) {
            g.mode = 'preview';
            g.base = g.startCell;
            g.fromHold = true;
          } else {
            g.mode = 'box';
            renderer.box = { a: g.startCell, b: g.startCell };
            state.emit('view');
          }
        }, HOLD_MS);
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      const ts = e.touches;
      if (pinch && ts.length >= 2) {
        const c = { x: (ts[0]!.clientX + ts[1]!.clientX) / 2, y: (ts[0]!.clientY + ts[1]!.clientY) / 2 };
        const d = Math.hypot(ts[0]!.clientX - ts[1]!.clientX, ts[0]!.clientY - ts[1]!.clientY) || 1;
        renderer.camera.pan(c.x - pinch.c.x, c.y - pinch.c.y);
        const l = local(c);
        renderer.camera.zoomAt(l.x, l.y, d / pinch.d);
        pinch = { c, d };
        state.emit('view');
        return;
      }
      if (!g) return;
      const t = [...e.changedTouches].find((x) => x.identifier === g!.id);
      if (!t) return;
      const p = { x: t.clientX, y: t.clientY };
      const c = cellAt(p);
      if (g.mode === 'wait') {
        if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < SLOP) return;
        clearTimer();
        g.mode = g.base ? 'preview' : 'pan';
        if (g.mode === 'pan') {
          renderer.camera.pan(p.x - g.start.x, p.y - g.start.y);
          state.emit('view');
          g.last = p;
          return;
        }
      }
      switch (g.mode) {
        case 'pan':
          renderer.camera.pan(p.x - g.last.x, p.y - g.last.y);
          state.emit('view');
          break;
        case 'preview':
          // dời preview theo ngón tay (giữ nguyên chỗ đã nắm trên preview)
          if (g.base) input.pointAt({ x: g.base.x + c.x - g.startCell.x, z: g.base.z + c.z - g.startCell.z });
          break;
        case 'draw':
          api.path?.moveTo(c);
          showPath();
          break;
        case 'box':
          if (renderer.box) renderer.box = { a: renderer.box.a, b: c };
          state.emit('view');
          break;
        case 'forward':
          mouse('mousemove', p);
          break;
      }
      g.last = p;
    },
    { passive: false },
  );

  const end = (e: TouchEvent, cancel: boolean): void => {
    e.preventDefault();
    if (pinch) {
      if (e.touches.length < 2) pinch = null;
      if (e.touches.length === 0) g = null;
      return;
    }
    if (!g) return;
    const t = [...e.changedTouches].find((x) => x.identifier === g!.id);
    if (!t) return;
    const p = { x: t.clientX, y: t.clientY };
    clearTimer();
    const mode = g.mode;
    const fromHold = g.fromHold;
    g = null;
    if (mode === 'box') return endBox(!cancel);
    // giữ tay rồi rê máy / nhóm: nhấc tay ⇒ **đặt luôn** và chọn chỗ mới (người dùng 2026-10-05); đặt không được (vướng)
    // thì vẫn ở chế độ di chuyển để dời tiếp / Huỷ
    if (mode === 'preview' && fromHold && !cancel && state.tool.kind === 'group') {
      api.commit();
      return;
    }
    if (mode === 'forward') {
      mouse('mousemove', p);
      mouse('mouseup', p);
      return;
    }
    if (mode !== 'wait' || cancel) return;
    // chạm nhanh
    if (previewTool()) {
      input.pointAt(cellAt(p)); // preview nhảy tới chỗ chạm (chưa đặt)
      return;
    }
    if (pathKind()) return;
    // đang chọn đúng một máy mà chạm lại vào chính nó ⇒ bỏ chọn (người dùng 2026-10-05: khỏi phải bấm Huỷ)
    if (state.tool.kind === 'select' && !touchModes.add && state.selection !== null) {
      const hit = machineAt(state.bp, state.ds, cellAt(p));
      if (hit && hit.uid === state.selection) {
        state.select(null);
        return;
      }
    }
    mouse('mousemove', p);
    mouse('mousedown', p, touchModes.add);
    mouse('mouseup', p, touchModes.add);
  };
  canvas.addEventListener('touchend', (e) => end(e, false), { passive: false });
  canvas.addEventListener('touchcancel', (e) => end(e, true), { passive: false });
  return api;
}
