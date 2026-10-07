import { TOUCH_VIEW_EVENT, type TouchViewDetail } from './touchEvents';
import { tr } from '../i18n';

/**
 * **Điều khiển cảm ứng** cho app Android (người dùng 2026-10-05) — phần dùng chung + Modeler + kéo thả:
 *  - Map: `touchMap.ts` (cơ chế đặt / chọn / di chuyển máy, vẽ ống bằng ngón tay) và `touchActions.ts` (thanh thao tác);
 *  - **Modeler**: chạm vào nút / cổng / đường ⇒ như chuột: rê nút = dời nút; **rê cổng = kéo nối**; giữ cổng ~0,35 s rồi
 *    rê = đổi chỗ cổng (như giữ chuột); giữ cổng lâu ~1,1 s không rê = chuột phải (menu cổng); giữ đường / điểm neo
 *    0,6 s = chuột phải (bỏ nối, xoá điểm neo); chạm hai lần = bấm đúp; chỗ trống: rê = kéo sơ đồ, giữ 0,5 s = khung
 *    chọn; hai ngón = kéo + zoom;
 *  - **phần khác** (bảng chọn máy, thanh tab, thẻ bản vẽ): giữ ~0,4 s rồi rê = kéo thả như chuột; rê ngay = cuộn;
 *  - **bàn phím ảo đang mở**: chạm ra ngoài ô đang gõ chỉ để tắt bàn phím, không bấm trúng gì (`attachKeyboardGuard`).
 */

const SLOP = 10;
const HOLD_MS = 500;
const MENU_MS = 600;
/** Modeler: giữ cổng chừng này rồi rê = đổi chỗ cổng; giữ tới `PORT_MENU_MS` không rê = menu chuột phải. */
const PORT_HOLD_MS = 350;
const PORT_MENU_MS = 1100;
const DRAG_HOLD_MS = 400;

/** Trạng thái hai nút bật / tắt "Chọn thêm" / "Chọn vùng" của thanh thao tác (`touchActions.ts`). */
export const touchModes = {
  /** "Thêm vào vùng chọn" — như giữ Ctrl khi bấm / kéo khung. */
  add: false,
  /** "Chọn vùng" — lần kéo một ngón tới là khung chọn (một lần rồi tự tắt). */
  box: false,
  /**
   * "Đặt tiếp" (nút thứ 4 — Sao chép — khi đang đặt / dời / sao chép, người dùng 2026-10-06): đặt xong vẫn cầm thứ vừa
   * đặt để đặt thêm. Tắt thì đặt máy chọn ở bảng chọn máy **chỉ một lần** rồi thoát chế độ đặt.
   */
  keep: false,
  listeners: new Set<() => void>(),
  changed(): void {
    for (const f of this.listeners) f();
  },
};

const vibrate = (ms: number): void => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* máy không rung được thì thôi */
  }
};

/** Gửi một phím như bàn phím thật (đi qua đúng đường `keydown` của `input.ts` / Modeler). */
export function pressKey(code: string, key: string, mods: { ctrl?: boolean; shift?: boolean } = {}): void {
  const init = { code, key, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, bubbles: true, cancelable: true };
  window.dispatchEvent(new KeyboardEvent('keydown', init));
  window.dispatchEvent(new KeyboardEvent('keyup', init));
}

function mouse(target: EventTarget, type: string, x: number, y: number, opt: { button?: number; ctrl?: boolean; detail?: number } = {}): boolean {
  const button = opt.button ?? 0;
  const buttons = type === 'mouseup' || type === 'click' ? 0 : button === 2 ? 2 : button === 1 ? 4 : 1;
  return target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button, buttons, ctrlKey: !!opt.ctrl, detail: opt.detail ?? 1 }),
  );
}

interface Pt {
  x: number;
  y: number;
}
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
const center = (t: TouchList): Pt => ({ x: (t[0]!.clientX + t[1]!.clientX) / 2, y: (t[0]!.clientY + t[1]!.clientY) / 2 });
const spread = (t: TouchList): number => Math.max(1, Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY));
const pt = (t: Touch): Pt => ({ x: t.clientX, y: t.clientY });

// ------------------------------------------------------------------ Modeler

/** Phần tử Modeler mà chạm vào là thao tác như chuột (kéo nút, kéo nối, menu chuột phải…). */
const MD_HIT = '.md-node, .md-port, .md-label, .md-edge-hit, .md-anchor-pt, [data-ink], .md-ink-hit';
/** Ô nhập / nút bên trong sơ đồ: để trình duyệt tự lo (gõ chữ, bấm nút). */
// cổng của máy là <button class="md-port"> — **không** để trình duyệt tự lo (trước đây vì thế mà kéo nối không ăn)
const MD_NATIVE = 'input, textarea, select, button:not(.md-port), .md-limit, .md-src-btn, .md-ink-edit';

export function attachModelerTouch(root: HTMLElement): void {
  type Mode = 'wait' | 'pan' | 'forward' | 'box' | 'hover' | 'done';
  let g: {
    id: number;
    start: Pt;
    last: Pt;
    target: Element;
    hit: boolean;
    mode: Mode;
    timer: ReturnType<typeof setTimeout> | null;
    /** đã rê quá `SLOP` kể từ khi chạm */
    moved?: boolean;
  } | null = null;
  let pinch: { c: Pt; d: number } | null = null;
  let lastTap: { t: number; p: Pt } | null = null;
  const viewportOf = (el: Element | null): HTMLElement | null => el?.closest<HTMLElement>('.md-viewport') ?? null;
  const at = (p: Pt): Element => document.elementFromPoint(p.x, p.y) ?? root;
  const sendView = (vp: HTMLElement, d: TouchViewDetail): void => void vp.dispatchEvent(new CustomEvent(TOUCH_VIEW_EVENT, { detail: d }));

  /**
   * Sự kiện chạm luôn bắn vào **đúng phần tử lúc đặt ngón xuống**, kể cả khi phần tử đó vừa bị gỡ khỏi trang (sơ đồ
   * dựng lại nút giữa lúc kéo) — khi đó chúng không nổi lên tới `root` nữa. Vì vậy rê / nhấc ngón được nghe **ngay trên
   * phần tử đó** (gắn lúc chạm, gỡ khi nhấc hết ngón).
   */
  const tracked = new Set<EventTarget>();
  const track = (t: EventTarget): void => {
    if (tracked.has(t)) return;
    tracked.add(t);
    t.addEventListener('touchmove', onMove as EventListener, { passive: false });
    t.addEventListener('touchend', onEnd as EventListener, { passive: false });
    t.addEventListener('touchcancel', onCancel as EventListener, { passive: false });
  };
  const untrackAll = (): void => {
    for (const t of tracked) {
      t.removeEventListener('touchmove', onMove as EventListener);
      t.removeEventListener('touchend', onEnd as EventListener);
      t.removeEventListener('touchcancel', onCancel as EventListener);
    }
    tracked.clear();
  };

  root.addEventListener(
    'touchstart',
    (e) => {
      const target = e.target as Element;
      const vp = viewportOf(target);
      if (!vp || target.closest(MD_NATIVE)) return;
      e.preventDefault();
      track(target);
      const ts = e.touches;
      if (ts.length >= 2) {
        if (g && g.mode === 'forward') return;
        if (g?.timer) clearTimeout(g.timer);
        if (g) g.mode = 'done';
        pinch = { c: center(ts), d: spread(ts) };
        return;
      }
      const t = e.changedTouches[0]!;
      const p = pt(t);
      const pen = /\bpen-/.test(vp.className);
      const hit = pen || !!target.closest(MD_HIT);
      g = { id: t.identifier, start: p, last: p, target, hit, mode: 'wait', timer: null };
      if (pen) {
        // bút vẽ: vẽ ngay theo ngón tay
        g.mode = 'forward';
        mouse(target, 'mousedown', p.x, p.y);
        return;
      }
      if (vp.classList.contains('moving')) {
        // đang cầm nút (máy vừa chọn ở bảng chọn máy / phím M): ngón tay là con trỏ, nhấc ngón = đặt
        g.mode = 'hover';
        mouse(target, 'mousemove', p.x, p.y);
        return;
      }
      if (target.closest('.md-port') && !target.closest('.md-plate')) {
        // cổng: rê ngay = kéo nối (xem touchmove); giữ ~0,35 s = nhấn giữ chuột trên cổng (Modeler chuyển sang đổi chỗ
        // cổng sau 320 ms, rê để chọn chỗ); giữ tiếp tới ~1,1 s mà không rê = menu chuột phải của cổng
        g.timer = setTimeout(() => {
          if (!g || g.mode !== 'wait') return;
          g.mode = 'forward';
          vibrate(15);
          mouse(g.target, 'mousedown', g.start.x, g.start.y);
          g.timer = setTimeout(() => {
            if (!g || g.mode !== 'forward' || g.moved) return;
            g.timer = null;
            g.mode = 'done';
            mouse(g.target, 'mouseup', g.start.x, g.start.y);
            vibrate(25);
            g.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: g.start.x, clientY: g.start.y, button: 2, buttons: 2 }));
          }, PORT_MENU_MS - PORT_HOLD_MS);
        }, PORT_HOLD_MS);
        return;
      }
      g.timer = setTimeout(
        () => {
          if (!g || g.mode !== 'wait') return;
          g.timer = null;
          vibrate(25);
          if (g.hit) {
            // giữ lâu trên nút / cổng / đường = chuột phải (menu cổng, bỏ nối, xoá điểm neo)
            g.mode = 'done';
            g.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: g.start.x, clientY: g.start.y, button: 2, buttons: 2 }));
          } else {
            // giữ ở chỗ trống = kéo khung chọn (chuột trái kéo trên nền)
            g.mode = 'box';
            mouse(g.target, 'mousedown', g.start.x, g.start.y);
          }
        },
        g.hit ? MENU_MS : HOLD_MS,
      );
    },
    { passive: false },
  );

  function onMove(e: TouchEvent): void {
    {
      const ts = e.touches;
      if (pinch && ts.length >= 2) {
        e.preventDefault();
        const vp = viewportOf(e.target as Element) ?? root.querySelector<HTMLElement>('.md-viewport');
        const c = center(ts);
        const d = spread(ts);
        if (vp) sendView(vp, { dx: c.x - pinch.c.x, dy: c.y - pinch.c.y, factor: d / pinch.d, cx: c.x, cy: c.y });
        pinch = { c, d };
        return;
      }
      if (!g) return;
      const t = [...e.changedTouches].find((x) => x.identifier === g!.id);
      if (!t) return;
      e.preventDefault();
      const p = pt(t);
      if (g.mode === 'wait') {
        if (dist(p, g.start) < SLOP) return;
        if (g.timer) clearTimeout(g.timer);
        g.timer = null;
        if (g.hit) {
          // rê từ nút / cổng ⇒ kéo như chuột trái
          g.mode = 'forward';
          mouse(g.target, 'mousedown', g.start.x, g.start.y);
        } else g.mode = 'pan';
      }
      if (g.mode === 'pan') {
        const vp = viewportOf(g.target) ?? root.querySelector<HTMLElement>('.md-viewport');
        if (vp) sendView(vp, { dx: p.x - g.last.x, dy: p.y - g.last.y, factor: 1, cx: p.x, cy: p.y });
      } else if (g.mode === 'forward' || g.mode === 'box' || g.mode === 'hover') {
        if (!g.moved && dist(p, g.start) >= SLOP) g.moved = true;
        if (g.moved || g.mode !== 'forward') mouse(at(p), 'mousemove', p.x, p.y);
      }
      g.last = p;
    }
  }
  function onEnd(e: TouchEvent): void {
    end(e, false);
  }
  function onCancel(e: TouchEvent): void {
    end(e, true);
  }

  const end = (e: TouchEvent, cancel: boolean): void => {
    if (e.touches.length === 0) untrackAll();
    if (pinch) {
      if (e.touches.length < 2) pinch = null;
      if (e.touches.length === 0) g = null;
      e.preventDefault();
      return;
    }
    if (!g) return;
    const t = [...e.changedTouches].find((x) => x.identifier === g!.id);
    if (!t) return;
    e.preventDefault();
    if (g.timer) clearTimeout(g.timer);
    const p = pt(t);
    const { mode, target } = g;
    g = null;
    if (mode === 'forward' || mode === 'box') {
      mouse(at(p), 'mouseup', p.x, p.y);
      return;
    }
    if (mode === 'hover') {
      if (cancel) return;
      mouse(at(p), 'mousemove', p.x, p.y);
      mouse(at(p), 'mousedown', p.x, p.y);
      mouse(at(p), 'mouseup', p.x, p.y);
      return;
    }
    if (mode !== 'wait' || cancel) return;
    // chạm nhanh = bấm; hai lần liền nhau tại một chỗ = bấm đúp (mở hộp công thức của nút…)
    const now = performance.now();
    const dbl = !!lastTap && now - lastTap.t < 350 && dist(lastTap.p, p) < 24;
    lastTap = dbl ? null : { t: now, p };
    mouse(target, 'mousemove', p.x, p.y);
    mouse(target, 'mousedown', p.x, p.y, { detail: dbl ? 2 : 1 });
    mouse(at(p), 'mouseup', p.x, p.y, { detail: dbl ? 2 : 1 });
    mouse(target, 'click', p.x, p.y, { detail: dbl ? 2 : 1 });
    if (dbl) mouse(target, 'dblclick', p.x, p.y, { detail: 2 });
  };
}

// ------------------------------------------------------------------ kéo thả ở phần còn lại

/**
 * Giữ ~0,4 s rồi rê trên phần tử kéo được (`[data-touch-drag]` = kéo bằng chuột — bảng chọn máy; `[draggable=true]` =
 * kéo thả HTML — thanh tab, thẻ bản vẽ) ⇒ phát sự kiện chuột / kéo thả giả. Rê ngay khi vừa chạm = cuộn như thường.
 */
export function attachDragEmulation(): void {
  let g: {
    id: number;
    start: Pt;
    el: HTMLElement;
    html5: boolean;
    timer: ReturnType<typeof setTimeout> | null;
    active: boolean;
    dt: DataTransfer | null;
    over: Element | null;
    /** ngón tay đã rê đi sau khi bắt đầu kéo — chưa rê mà nhấc tay = nhấn giữ thường (menu chuột phải) */
    moved: boolean;
    off?: () => void;
  } | null = null;
  const at = (p: Pt): Element => document.elementFromPoint(p.x, p.y) ?? document.body;
  const drag = (type: string, target: Element, p: Pt, dt: DataTransfer): boolean =>
    target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, dataTransfer: dt }));

  document.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) {
        if (g?.timer) clearTimeout(g.timer);
        g?.off?.();
        g = null;
        return;
      }
      const target = e.target as Element;
      if (target.closest('canvas.board, .md-viewport')) return;
      const src = target.closest<HTMLElement>('[data-touch-drag], [draggable="true"]');
      if (!src) return;
      const t = e.changedTouches[0]!;
      const p = pt(t);
      const html5 = src.getAttribute('draggable') === 'true' && !src.dataset.touchDrag;
      g = { id: t.identifier, start: p, el: src, html5, timer: null, active: false, dt: null, over: null, moved: false };
      // tắt kéo-thả **gốc** của Android trong lúc chạm: nhấn giữ một phần tử `draggable` thì WebView tự bắt đầu kéo gốc
      // (~0,5 s), bật menu nhấn giữ rồi huỷ thao tác chạm ⇒ kéo tab không đổi chỗ / gộp được (người dùng 2026-10-06)
      if (html5) src.setAttribute('draggable', 'false');
      // rê / nhấc ngón nghe ngay trên phần tử được chạm: bảng chọn máy dựng lại lúc bắt đầu kéo (cầm máy) ⇒ phần tử bị
      // gỡ khỏi trang, sự kiện chạm sau đó không còn nổi lên `document` (lỗi thấy trên máy thật 2026-10-05)
      const mv = onMove as EventListener;
      const en = onEnd as EventListener;
      target.addEventListener('touchmove', mv, { passive: false });
      target.addEventListener('touchend', en, { passive: false });
      target.addEventListener('touchcancel', en, { passive: false });
      const off = (): void => {
        target.removeEventListener('touchmove', mv);
        target.removeEventListener('touchend', en);
        target.removeEventListener('touchcancel', en);
        if (html5) src.setAttribute('draggable', 'true');
      };
      g.off = off;
      g.timer = setTimeout(() => {
        if (!g) return;
        g.timer = null;
        g.active = true;
        vibrate(20);
        if (g.html5) {
          g.dt = new DataTransfer();
          drag('dragstart', g.el, g.start, g.dt);
        } else mouse(g.el, 'mousedown', g.start.x, g.start.y);
      }, DRAG_HOLD_MS);
    },
    { passive: true, capture: true },
  );

  function onMove(e: TouchEvent): void {
    {
      if (!g) return;
      const t = [...e.changedTouches].find((x) => x.identifier === g!.id);
      if (!t) return;
      const p = pt(t);
      if (!g.active) {
        // rê trước khi kịp giữ ⇒ cuộn như thường
        if (dist(p, g.start) > SLOP) {
          if (g.timer) clearTimeout(g.timer);
          g.off?.();
          g = null;
        }
        return;
      }
      e.preventDefault();
      if (dist(p, g.start) > SLOP) g.moved = true;
      if (g.html5 && g.dt) {
        g.over = at(p);
        drag('dragover', g.over, p, g.dt);
      } else mouse(at(p), 'mousemove', p.x, p.y);
    }
  }

  function onEnd(e: TouchEvent): void {
    if (!g) return;
    const t = [...e.changedTouches].find((x) => x.identifier === g!.id);
    if (!t) return;
    if (g.timer) clearTimeout(g.timer);
    const was = g;
    g = null;
    was.off?.();
    if (!was.active) return;
    e.preventDefault(); // không để trình duyệt "bấm" thêm sau khi thả
    const p = pt(t);
    if (was.html5 && was.dt) {
      if (!was.moved) {
        // giữ yên rồi nhấc tay (không rê) ⇒ không thả gì cả, coi như nhấn giữ thường: menu chuột phải của phần tử dưới
        // ngón tay (vd. đổi tên tab)
        drag('dragend', was.el, p, was.dt);
        at(p).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 2 }));
        return;
      }
      const over = at(p);
      if (!drag('dragover', over, p, was.dt)) drag('drop', over, p, was.dt);
      drag('dragend', was.el, p, was.dt);
    } else mouse(at(p), 'mouseup', p.x, p.y);
  }
  // đang kéo thì không hiện menu nhấn giữ của trình duyệt, cũng không để phần tử nhận nó giữa chừng (bắt ở pha capture)
  document.addEventListener(
    'contextmenu',
    (e) => {
      if (!e.isTrusted) return;
      if (g?.active) {
        e.preventDefault();
        e.stopPropagation();
      } else if ((e.target as Element | null)?.closest?.('[data-touch-drag], [draggable]')) e.preventDefault();
    },
    true,
  );
}

// ------------------------------------------------------------------ bàn phím ảo

/**
 * **Bàn phím ảo đang mở** (đang gõ trong một ô chữ — người dùng 2026-10-05): không cho bấm trúng gì bên ngoài; chạm
 * ra ngoài ô đang gõ ⇒ chỉ tắt bàn phím (bỏ focus khỏi ô), chạm đó không đi tiếp xuống giao diện.
 */
export function attachKeyboardGuard(): void {
  const typing = (): HTMLElement | null => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body) return null;
    if (a.isContentEditable) return a;
    if (a.tagName === 'TEXTAREA') return a;
    if (a.tagName === 'INPUT') {
      const type = (a as HTMLInputElement).type;
      return ['text', 'search', 'number', 'email', 'url', 'tel', 'password', ''].includes(type) ? a : null;
    }
    return null;
  };
  let swallow = false;
  const block = (e: Event): void => {
    if (!swallow) return;
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener(
    'touchstart',
    (e) => {
      const field = typing();
      if (!field || field.contains(e.target as Node)) return;
      swallow = true;
      e.preventDefault();
      e.stopPropagation();
      field.blur();
    },
    { capture: true, passive: false },
  );
  for (const t of ['touchmove', 'touchend', 'mousedown', 'mouseup', 'click'] as const) document.addEventListener(t, block, { capture: true, passive: false });
  document.addEventListener(
    'touchend',
    (e) => {
      if (swallow && e.touches.length === 0) setTimeout(() => (swallow = false), 0);
    },
    { capture: true },
  );
}

/**
 * **Kéo ngang để đóng / mở hai bảng bên** (người dùng 2026-10-06), cả Map lẫn Modeler, mọi chế độ — bảng **đi theo
 * ngón tay**:
 *  - tay kéo (mũi tên) mép phải — kể cả khi thanh thao tác đang che nó (bắt đầu kéo trên thanh thao tác cũng được) — và
 *    chính bảng Tổng hợp: kéo sang trái mở, sang phải đóng; các nút dính mép bảng (cột nút, thanh thao tác, cửa sổ Máy…)
 *    trượt theo;
 *  - bảng chọn máy bên trái: kéo sang phải mở rộng, sang trái thu gọn (cột giãn / co theo tay); đã thu gọn mà kéo sang
 *    trái thêm lần nữa ⇒ **giấu hẳn** vào mép trái (`palette-hidden`, người dùng 2026-10-07), một nút mũi tên nhô ra ở mép
 *    trái — bấm nó hoặc vuốt sang phải từ sát mép trái để hiện lại.
 * Kéo hết **2 cm** trên màn hình (≈ 126 px CSS — trên Android 1 px CSS = 1 dp = 1/160 inch) là mở / đóng hẳn; thả tay
 * giữa chừng ⇒ trượt nốt về phía đang gần hơn. Chỉ nhận cú kéo **ngang** (lệch ngang rõ hơn lệch dọc) ⇒ cuộn dọc danh
 * sách vẫn như cũ; kéo xong thì nuốt cú bấm (click) có thể tới ngay sau, để không bấm nhầm nút dưới ngón tay.
 */
export function attachPanelSwipes(app: HTMLElement): void {
  type Zone = 'palette' | 'handle' | 'summary';
  const SPAN_LAND = 126; // 2 cm
  /**
   * Màn **dọc** (người dùng 2026-10-07: "tầm nhận trượt quá bé"): vùng nhận vuốt của bảng chọn máy rộng **gấp rưỡi** bảng
   * (thêm nửa bề ngang bảng thu gọn, ra cả phần bản đồ sát bảng), nhận cú vuốt sớm hơn và kéo ngắn hơn là đủ.
   */
  const portrait = (): boolean => window.innerHeight > window.innerWidth;
  const span = (): number => (portrait() ? 84 : SPAN_LAND);
  const LEFT_MIN = 58;
  const LEFT_MAX = 260;
  const FOLLOW = '.dock, .touch-actions, .machine-window, .touch-modebar, .md-dock, .md-penbar';
  let g: { id: number; x: number; y: number; zone: Zone; live: boolean; p0: number; p: number; w: number; panel: HTMLElement | null; outside: EventTarget | null } | null = null;
  /** Vùng sát mép trái nhận cú vuốt mở lại bảng đã giấu (px CSS). */
  // web điện thoại: nới rộng hơn (không chặn được cử chỉ hệ thống như trong app — người dùng 2026-10-07)
  const EDGE = document.documentElement.classList.contains('native-app') ? 22 : 36;
  const HIDDEN_KEY = 'efp:palette-hidden';
  const setHidden = (on: boolean): void => {
    app.classList.toggle('palette-hidden', on);
    try {
      localStorage.setItem(HIDDEN_KEY, on ? '1' : '0');
    } catch {
      /* không lưu được thì thôi */
    }
  };
  try {
    if (localStorage.getItem(HIDDEN_KEY) === '1') app.classList.add('palette-hidden');
  } catch {
    /* bỏ qua */
  }
  // nút mũi tên nhô ra ở mép trái khi bảng đang giấu: bấm ⇒ hiện lại (về dạng thu gọn)
  const peek = document.createElement('button');
  peek.className = 'palette-peek';
  peek.type = 'button';
  peek.title = tr('Hiện bảng chọn máy');
  peek.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  peek.addEventListener('click', (e) => {
    e.stopPropagation();
    setHidden(false);
  });
  app.append(peek);
  const collapsed = (): boolean => app.classList.contains('palette-collapsed');
  const setCollapsed = (on: boolean): void => {
    if (collapsed() !== on) window.dispatchEvent(new Event('efp:toggle-palette'));
  };
  let settling = false;
  const zoneOf = (t: EventTarget | null): Zone | null => {
    const e = t instanceof Element ? t : null;
    if (!e) return null;
    if (e.closest('.palette-peek')) return 'palette';
    if (e.closest('.drawer-handle, .touch-actions')) return 'handle';
    if (e.closest('.panel.left')) return 'palette';
    if (e.closest('.panel.right') && !e.closest('input, select, textarea')) return 'summary';
    return null;
  };
  const swallowClick = (): void => {
    const eat = (e: Event): void => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('click', eat, true);
    setTimeout(() => window.removeEventListener('click', eat, true), 350);
  };
  const summaryPanel = (): HTMLElement | null =>
    [...document.querySelectorAll<HTMLElement>('.panel.right')].find((p) => getComputedStyle(p).display !== 'none') ?? null;
  const followers = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(FOLLOW)].filter((f) => f.offsetParent !== null);

  /** Vẽ trạng thái mở `p` (0 = đóng, 1 = mở) của bảng đang kéo. */
  const show = (d: NonNullable<typeof g>, p: number): void => {
    if (d.zone === 'palette') {
      // p ∈ [−1, 1]: −1 giấu hẳn (rộng 0), 0 thu gọn, 1 mở rộng; đang kéo về phía mở rộng thì dựng ngay danh sách đầy đủ,
      // cột vẫn hẹp ⇒ kéo ra tới đâu lộ ra tới đó
      if (p > 0) setCollapsed(false);
      app.style.setProperty('--left-w', `${p >= 0 ? LEFT_MIN + p * (LEFT_MAX - LEFT_MIN) : LEFT_MIN * (1 + p)}px`);
      return;
    }
    if (d.panel) d.panel.style.transform = `translateX(${(1 - p) * (d.w + 16)}px)`;
    for (const f of followers()) f.style.transform = `translateX(${-(p - d.p0) * d.w}px)`;
  };
  const begin = (d: NonNullable<typeof g>): void => {
    d.live = true;
    if (d.zone === 'palette') {
      d.p0 = app.classList.contains('palette-hidden') ? -1 : collapsed() ? 0 : 1;
      app.style.transition = 'none';
      app.style.setProperty('--left-w', `${d.p0 === 1 ? LEFT_MAX : d.p0 === 0 ? LEFT_MIN : 0}px`);
    } else {
      d.p0 = app.classList.contains('right-collapsed') ? 0 : 1;
      d.panel = summaryPanel();
      if (!d.panel) return;
      d.w = d.panel.offsetWidth;
      Object.assign(d.panel.style, { transition: 'none', visibility: 'visible', opacity: '1', pointerEvents: 'none' });
      for (const f of followers()) f.style.transition = 'none';
    }
    d.p = d.p0;
  };
  /** Thả tay: trượt nốt về phía gần hơn rồi mới đổi trạng thái thật (class), bỏ hết kiểu tạm. */
  const finish = (d: NonNullable<typeof g>): void => {
    // màn dọc: kéo được hơn 1/3 quãng là đủ sang trạng thái kế tiếp theo hướng kéo
    const bias = portrait() ? Math.sign(d.p - d.p0) * 0.17 : 0;
    const q = d.p + bias;
    const target = q >= 0.5 ? 1 : q <= -0.5 && d.zone === 'palette' ? -1 : 0;
    settling = true;
    const ms = 200;
    if (d.zone === 'palette') {
      app.style.transition = `--left-w ${ms}ms ease`;
      show(d, target);
    } else {
      const ease = `transform ${ms}ms ease`;
      if (d.panel) d.panel.style.transition = ease;
      for (const f of followers()) f.style.transition = ease;
      show(d, target);
    }
    setTimeout(() => {
      if (d.zone === 'palette') {
        setCollapsed(target <= 0);
        setHidden(target === -1);
        app.style.transition = 'none';
        app.style.removeProperty('--left-w');
        void app.offsetWidth;
        app.style.transition = '';
      } else {
        const all = [d.panel, ...followers()].filter((x): x is HTMLElement => !!x);
        for (const x of all) x.style.transition = 'none';
        if (target !== d.p0) window.dispatchEvent(new Event('efp:toggle-summary'));
        for (const x of [d.panel, ...followers()].filter((v): v is HTMLElement => !!v)) {
          x.style.transition = 'none';
          x.style.transform = '';
        }
        if (d.panel) Object.assign(d.panel.style, { visibility: '', opacity: '', pointerEvents: '' });
        void app.offsetWidth;
        requestAnimationFrame(() => {
          for (const x of [d.panel, ...followers()].filter((v): v is HTMLElement => !!v)) x.style.transition = '';
        });
      }
      settling = false;
    }, ms + 10);
  };

  window.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1 || settling) {
        g = null;
        return;
      }
      const t = e.touches[0]!;
      // bảng chọn máy đang giấu: vuốt từ sát mép trái kéo nó ra lại
      let zone: Zone | null = app.classList.contains('palette-hidden') && t.clientX <= EDGE ? 'palette' : zoneOf(e.target);
      // màn dọc: vùng nhận vuốt của bảng chọn máy nới ra quá mép phải bảng thêm nửa bề ngang bảng thu gọn (gấp rưỡi)
      let outside: EventTarget | null = null;
      if (!zone && portrait() && !app.classList.contains('palette-hidden') && e.target instanceof Element && e.target.closest('.board-wrap canvas, .md-viewport')) {
        const edge = (document.querySelector('.panel.left')?.getBoundingClientRect().right ?? 0) + LEFT_MIN / 2;
        if (t.clientX <= edge) {
          zone = 'palette';
          outside = e.target;
        }
      }
      g = zone ? { id: t.identifier, x: t.clientX, y: t.clientY, zone, live: false, p0: 0, p: 0, w: 0, panel: null, outside } : null;
      // nghe cả trên phần tử được chạm: mở bảng chọn máy làm danh sách dựng lại ⇒ phần tử dưới ngón tay bị gỡ khỏi trang,
      // sự kiện chạm sau đó không còn nổi lên `window` (bảng kẹt giữa chừng — thấy trên máy thật 2026-10-06)
      const target = e.target;
      if (g && target instanceof EventTarget && target !== window) {
        offTarget?.();
        target.addEventListener('touchmove', move as EventListener, { passive: false });
        target.addEventListener('touchend', end);
        target.addEventListener('touchcancel', end);
        offTarget = (): void => {
          target.removeEventListener('touchmove', move as EventListener);
          target.removeEventListener('touchend', end);
          target.removeEventListener('touchcancel', end);
        };
      }
    },
    { capture: true, passive: true },
  );
  let offTarget: (() => void) | null = null;
  /** Mỗi sự kiện chỉ xử lý một lần (nghe ở cả `window` lẫn phần tử được chạm). */
  const seen = new WeakSet<Event>();
  function move(e: TouchEvent): void {
      if (seen.has(e)) return;
      seen.add(e);
      const d = g;
      if (!d) return;
      const t = [...e.touches].find((v) => v.identifier === d.id);
      if (!t) return;
      const dx = t.clientX - d.x;
      const dy = t.clientY - d.y;
      if (!d.live) {
        if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
          g = null; // đang cuộn dọc
          return;
        }
        const minDx = portrait() ? 6 : 10;
        if (Math.abs(dx) < minDx || Math.abs(dx) < Math.abs(dy) * (portrait() ? 1 : 1.2)) return;
        begin(d);
        // bắt đầu trên bản đồ: huỷ cú chạm của bản đồ (không thành chạm / giữ / kéo bản đồ)
        if (d.outside) {
          const cancel = new TouchEvent('touchcancel', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [...e.changedTouches] });
          seen.add(cancel); // chính bộ vuốt này không coi nó là nhấc tay
          d.outside.dispatchEvent(cancel);
        }
      }
      e.preventDefault();
      // bảng chọn máy mở sang phải; bảng Tổng hợp mở sang trái
      const dir = d.zone === 'palette' ? 1 : -1;
      // giấu hẳn chỉ từ dạng thu gọn (kéo trái thêm một lần nữa), không đi thẳng từ dạng mở rộng
      const lo = d.zone === 'palette' && d.p0 <= 0 ? -1 : 0;
      d.p = Math.max(lo, Math.min(1, d.p0 + (dir * dx) / span()));
      // vuốt bắt đầu trên bản đồ (vùng nới thêm cạnh bảng): bản đồ không nhận cú kéo này
      if (d.outside) e.stopPropagation();
      show(d, d.p);
  }
  window.addEventListener('touchmove', move, { capture: true, passive: false });
  function end(e: Event): void {
    if (seen.has(e)) return;
    seen.add(e);
    offTarget?.();
    offTarget = null;
    const d = g;
    g = null;
    if (!d?.live) return;
    if (d.outside) e.stopPropagation();
    finish(d);
    swallowClick();
  }
  window.addEventListener('touchend', end, { capture: true, passive: true });
  window.addEventListener('touchcancel', end, { capture: true, passive: true });

  // App Android: tay kéo dính mép phải ⇒ vuốt nó bị Android hiểu là cử chỉ "Quay lại" của hệ thống, app không nhận được
  // gì. Báo vị trí tay kéo (nới thêm cho dễ trúng) để `MainActivity` loại vùng đó khỏi cử chỉ hệ thống.
  const native = (window as unknown as { EfpNative?: { setGestureExclusion(spec: string): void } }).EfpNative;
  if (!native) return;
  let last = '';
  const report = (): void => {
    const rects: string[] = [];
    for (const h of document.querySelectorAll<HTMLElement>('.drawer-handle')) {
      if (h.offsetParent === null) continue;
      const r = h.getBoundingClientRect();
      if (r.width === 0 || r.right < window.innerWidth - 40) continue; // chỉ khi đứng sát mép (bảng đang đóng)
      rects.push([r.left - 16, r.top - 30, window.innerWidth - r.left + 16, r.height + 60].map((v) => Math.round(v)).join(','));
    }
    // bảng chọn máy đang giấu: dải sát mép trái quanh nút mũi tên — vuốt phải ở đó là kéo bảng ra, không phải "Quay lại"
    // (Android chỉ cho loại tối đa 200 dp mỗi mép)
    if (app.classList.contains('palette-hidden')) {
      const r = peek.getBoundingClientRect();
      rects.push([0, Math.max(0, r.top - 60), EDGE + 10, r.height + 120].map((v) => Math.round(v)).join(','));
    }
    const spec = rects.join(';');
    if (spec === last) return;
    last = spec;
    native.setGestureExclusion(spec);
  };
  setInterval(report, 500);
  report();
}

/**
 * **Lớp cửa sổ** trên điện thoại (người dùng 2026-10-06): thanh mô phỏng, cửa sổ Máy, bảng Tổng hợp và thanh thao tác
 * chồng lên nhau thay vì co lại nhường chỗ. Chạm vào cái nào ⇒ cái đó lên trên cùng; chạm thanh thao tác ⇒ mọi thứ về
 * thứ tự mặc định (thanh thao tác trên cùng).
 */
export function attachLayers(): void {
  // thứ tự mặc định (CSS): bảng Tổng hợp < cửa sổ Máy < thanh mô phỏng < thanh thao tác; phần tử vừa chạm lên trên cùng
  const LAYERED = '.machine-window, .panel.right, .sim-bar';
  window.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!t) return;
      const win = t.closest<HTMLElement>(LAYERED);
      if (!win && !t.closest('.touch-actions')) return;
      for (const w of document.querySelectorAll<HTMLElement>(LAYERED)) w.classList.toggle('layer-front', w === win);
    },
    { capture: true, passive: true },
  );
}
