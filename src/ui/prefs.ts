/**
 * **Tuỳ chọn hiển thị** trong bảng Cài đặt (nút bánh răng góc phải dưới — người dùng 2026-10-05), lưu `efp:prefs`:
 *  - `noTooltips` — **không hiện tooltip** (chữ nổi của trình duyệt khi rê chuột: thuộc tính `title`, thẻ `<title>` của SVG);
 *  - `ground` — nền bản vẽ: `simple` (nền phẳng như trước) / `grass` (ảnh mặt đất trong game, `render/grassTex.ts` — 2026-10-06);
 *  - `pointer` — **con trỏ ô**: bật ⇒ rê chuột tới ô nào trên Map thì hiện khung ô đó (như trước); tắt ⇒ không hiện gì
 *    (người dùng 2026-10-05 lần 2 — lần đầu là 4 góc vuông). Mặc định bật.
 */
export interface Prefs {
  noTooltips: boolean;
  ground: 'simple' | 'grass';
  pointer: boolean;
}

const KEY = 'efp:prefs';
const DEFAULTS: Prefs = { noTooltips: false, ground: 'simple', pointer: true };

const load = (): Prefs => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    return {
      noTooltips: v.noTooltips === true,
      ground: v.ground === 'grass' ? 'grass' : 'simple',
      pointer: v.pointer !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
};

let current = load();
const listeners = new Set<(p: Prefs) => void>();

export const prefs = (): Readonly<Prefs> => current;

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  current = { ...current, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* không lưu được thì thôi */
  }
  for (const f of listeners) f(current);
}

/** Gọi `f` ngay với giá trị hiện tại và mỗi khi đổi. */
export function onPrefs(f: (p: Prefs) => void): void {
  listeners.add(f);
  f(current);
}

// ------------------------------------------------------------------ tắt tooltip

/** Tên thuộc tính cất tạm `title` khi đang tắt tooltip. */
const STASH = 'data-tip-off';

/**
 * Tắt tooltip: **gỡ ngay mọi `title`** trong trang (cất sang `data-tip-off`; chữ của thẻ `<title>` trong SVG cũng cất), và
 * một `MutationObserver` gỡ tiếp ở mọi phần tử / `title` mới sinh ra. Bật lại ⇒ trả mọi thứ về chỗ cũ.
 * Trước 2026-10-05 chỉ gỡ lúc chuột đi vào phần tử (`mouseover`) — trên điện thoại sự kiện đó đến muộn / không đến nên
 * nút tắt "không có tác dụng" (người dùng 2026-10-05).
 */
function stash(root: ParentNode): void {
  const nodes: Element[] = root instanceof Element ? [root, ...root.querySelectorAll('[title], title')] : [...root.querySelectorAll('[title], title')];
  for (const n of nodes) {
    if (n.tagName.toLowerCase() === 'title' && n.parentElement && n.parentElement.namespaceURI === 'http://www.w3.org/2000/svg') {
      if (n.textContent) {
        n.setAttribute(STASH, n.textContent);
        n.textContent = '';
      }
      continue;
    }
    const t = n.getAttribute('title');
    if (t !== null) {
      n.setAttribute(STASH, t);
      n.removeAttribute('title');
    }
  }
}

function restoreTips(): void {
  for (const n of document.querySelectorAll(`[${STASH}]`)) {
    const t = n.getAttribute(STASH) ?? '';
    if (n.tagName.toLowerCase() === 'title') n.textContent = t;
    else if (!n.hasAttribute('title')) n.setAttribute('title', t);
    n.removeAttribute(STASH);
  }
}

let observer: MutationObserver | null = null;
const watch = (on: boolean): void => {
  if (typeof document === 'undefined') return;
  if (on) {
    stash(document);
    observer ??= new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'attributes' && m.target instanceof Element && m.target.getAttribute('title') !== null) stash(m.target);
        else if (m.type === 'childList') for (const n of m.addedNodes) if (n instanceof Element) stash(n);
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  } else {
    observer?.disconnect();
    restoreTips();
  }
};

let tipsOff = false;
onPrefs((p) => {
  if (p.noTooltips === tipsOff) return;
  tipsOff = p.noTooltips;
  watch(tipsOff);
});
