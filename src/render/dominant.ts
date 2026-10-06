/**
 * **Màu chủ đạo của một ảnh** (người dùng 2026-10-05: khi thu nhỏ ở chế độ mô phỏng, món trên băng vẽ thành ô vuông
 * mang **đúng màu mà ảnh của món đó chứa nhiều nhất**).
 *
 * Gom mọi điểm ảnh đủ đục (alpha ≥ 128) vào 512 ô màu (mỗi kênh 3 bit — gom các sắc độ gần nhau của cùng một màu),
 * lấy ô đông nhất rồi trả về **trung bình màu thật** của các điểm trong ô đó.
 *
 * *Suy luận* (đo trên ảnh game 2026-10-05): nhiều ảnh là **bột / quặng đựng trong bát, bao màu xám tối** — đếm thẳng thì
 * màu nhiều nhất là cái bát, mọi món ra cùng một màu xám. Nên **ưu tiên điểm có sắc** (độ bão hoà ≥ 0,25, không quá tối):
 * nếu chúng chiếm ≥ `MIN_CHROMA` số điểm đục thì lấy màu nhiều nhất trong số đó; ảnh gần như toàn xám (Carbon, Pin…) thì
 * lấy màu nhiều nhất của cả ảnh. Ảnh không có điểm đục nào ⇒ `null`.
 */
const MIN_CHROMA = 0.15;

export function dominantColor(rgba: Uint8ClampedArray | number[]): string | null {
  const all = new Bins();
  const chroma = new Bins();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    all.add(r, g, b);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max >= 50 && (max - min) / max >= 0.25) chroma.add(r, g, b);
  }
  if (all.total === 0) return null;
  return (chroma.total >= all.total * MIN_CHROMA ? chroma : all).best();
}

class Bins {
  total = 0;
  private count = new Uint32Array(512);
  private sum = new Float64Array(512 * 3);
  add(r: number, g: number, b: number): void {
    const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    this.count[k]!++;
    this.sum[k * 3]! += r;
    this.sum[k * 3 + 1]! += g;
    this.sum[k * 3 + 2]! += b;
    this.total++;
  }
  best(): string | null {
    let best = -1;
    for (let k = 0; k < 512; k++) if (this.count[k]! > 0 && (best < 0 || this.count[k]! > this.count[best]!)) best = k;
    if (best < 0) return null;
    const n = this.count[best]!;
    const hex = (v: number): string => Math.round(v / n).toString(16).padStart(2, '0');
    return `#${hex(this.sum[best * 3]!)}${hex(this.sum[best * 3 + 1]!)}${hex(this.sum[best * 3 + 2]!)}`;
  }
}
