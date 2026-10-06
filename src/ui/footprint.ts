import { el } from './dom';
import { tr } from '../i18n';

/**
 * Hình diện tích máy: `w × d` ô vuông vàng, đúng số ô máy chiếm (chưa quay). Co lại cho
 * vừa khung `box` — máy lớn thì ô nhỏ đi, nhưng vẫn đếm được ô.
 */
export function footprintGrid(w: number, d: number, box = { w: 40, h: 28 }): HTMLElement {
  const gap = 1;
  const cell = Math.max(2, Math.min(6, Math.floor(Math.min((box.w + gap) / w, (box.h + gap) / d)) - gap));
  const node = el('span', {
    class: 'footprint',
    title: tr('{0}×{1} = {2} ô', w, d, w * d),
    style: `grid-template-columns: repeat(${w}, ${cell}px); grid-auto-rows: ${cell}px; gap: ${gap}px;`,
  });
  for (let i = 0; i < w * d; i++) node.append(el('span', {}));
  return node;
}
