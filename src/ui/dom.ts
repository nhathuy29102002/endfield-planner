/** Vài hàm dựng DOM nhỏ, đủ để khỏi phải kéo cả một framework vào. */
type Attrs = Record<string, string | number | boolean | ((e: Event) => void)>;
type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') node.addEventListener(k.replace(/^on/, ''), v as EventListener);
    else if (v === false || v === undefined) continue;
    else if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else node.setAttribute(k, String(v));
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

export const clear = (node: HTMLElement): void => {
  node.textContent = '';
};

export const fmt = (n: number, digits = 1): string =>
  Number.isFinite(n) ? n.toFixed(digits).replace(/\.0+$/, '') : '—';

export const pct = (n: number): string => `${Math.round(n * 100)}%`;
