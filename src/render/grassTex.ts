/**
 * **Nền cỏ = ảnh chụp mặt đất trong game** (người dùng 2026-10-06, lần 3: "làm nền bằng cái ảnh đó", nền tự vẽ trước đó
 * xấu và không rõ nét). Tấm `public/img/ground/ground.webp` do `tools/make-ground.py` làm từ ảnh người dùng gửi
 * (`tools/ground-src/game-ground.webp`): cắt vuông 1400 px, làm đều độ sáng (khử tối góc), trộn mép cho lát liền mạch.
 * Ảnh chụp ở mức zoom ~59 px mỗi ô (đo theo các van trong ảnh cùng chỗ) ⇒ một tấm = 1400 / 59 ≈ 23,7 ô.
 *
 * Vân **gắn vào mặt đất** (toạ độ thế giới, tính bằng ô): kéo hay zoom thì nền đi / phóng theo đúng bản đồ như một vật
 * thể 2D đứng yên (người dùng 2026-10-06). Để zoom xa không tốn công và không nhấp nháy có **chuỗi mipmap**: cấp k = tấm
 * vuông cùng cỡ, số lần lặp gấp 2^k, thu nhỏ từ cấp k−1 (4 lần `drawImage`) ⇒ mỗi khung chỉ vài chục lần `drawImage`
 * (không `CanvasPattern` — xem `renderer.ts`). Ảnh chưa tải xong ⇒ chỉ có màu nền phẳng `GRASS_BASE`.
 */

export interface GrassLayer {
  /** Chu kỳ lặp, tính bằng ô lưới. */
  period: number;
  img: HTMLImageElement;
  /** Các cấp mipmap đã dựng (dựng dần khi cần): `levels[k - 1]` = cấp k. */
  levels: HTMLCanvasElement[];
}

/** Màu nền phẳng dưới ảnh (và khi nền quá nhỏ / ảnh chưa tải) — màu trung bình của tấm ảnh. */
export const GRASS_BASE = '#3e4d3a';

/** Cỡ ảnh chụp: px ảnh mỗi ô lưới. */
const SRC_PX_PER_CELL = 59;

/** Lớp nền cỏ (một tấm ảnh). `onLoad` ⇒ vẽ lại khi ảnh tải xong. */
export function grassLayers(onLoad: () => void): GrassLayer[] {
  const img = new Image();
  const layer: GrassLayer = { period: 1400 / SRC_PX_PER_CELL, img, levels: [] };
  img.onload = () => {
    layer.period = img.naturalWidth / SRC_PX_PER_CELL;
    onLoad();
  };
  img.src = 'img/ground/ground.webp';
  return [layer];
}

const canvas = (size: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
};

/**
 * Tấm vân của lớp `L` hợp với **`devPx` px màn hình (px thật) mỗi chu kỳ**: cấp mipmap có độ phân giải một chu kỳ
 * ≥ `devPx` gần nhất. Trả về tấm + số chu kỳ mỗi cạnh của nó; `null` khi ảnh chưa tải hoặc chu kỳ quá nhỏ (< 2 px).
 */
export function grassLevel(L: GrassLayer, devPx: number): { canvas: HTMLCanvasElement | HTMLImageElement; reps: number } | null {
  const res = L.img.naturalWidth;
  if (!L.img.complete || res === 0 || devPx < 2) return null;
  const want = Math.max(0, Math.floor(Math.log2(res / devPx)));
  const maxK = Math.floor(Math.log2(res / 2));
  const k = Math.min(want, maxK);
  // cấp 0 = chính ảnh (nét nhất khi phóng to)
  if (k === 0) return { canvas: L.img, reps: 1 };
  while (L.levels.length < k) {
    // cấp sau = cấp trước thu nhỏ một nửa, lát 2 × 2 (trình duyệt lọc khi thu nhỏ ⇒ như mipmap)
    const prev = L.levels[L.levels.length - 1] ?? L.img;
    const [c, ctx] = canvas(res);
    ctx.imageSmoothingQuality = 'high';
    const h = res / 2;
    for (const [x, y] of [[0, 0], [h, 0], [0, h], [h, h]] as const) ctx.drawImage(prev, x, y, h, h);
    L.levels.push(c);
  }
  return { canvas: L.levels[k - 1]!, reps: 2 ** k };
}
