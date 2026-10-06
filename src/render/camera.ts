import type { Cell } from '../model/types';

export type Turns = 0 | 1 | 2 | 3;

/** Quay vector `(x, y)` của màn hình `t` × 90° theo chiều kim đồng hồ (trục y hướng xuống). */
function rot(x: number, y: number, t: number): { x: number; y: number } {
  switch (((t % 4) + 4) % 4) {
    case 1:
      return { x: -y, y: x };
    case 2:
      return { x: -x, y: -y };
    case 3:
      return { x: y, y: -x };
    default:
      return { x, y };
  }
}

/**
 * Đổi qua lại giữa toạ độ ô và toạ độ pixel trên canvas, và chuyển động mượt.
 *
 * Vị trí là số thực (đơn vị: ô), nên camera dừng ở bất kỳ đâu chứ không nhảy theo ô.
 * Zoom có hai giá trị: `cell` đang hiển thị và `targetCell` đang hướng tới — lăn chuột
 * chỉ đổi đích, còn `update()` gọi mỗi khung hình kéo `cell` tiến dần tới đích, giữ cố
 * định điểm nằm dưới con trỏ.
 *
 * **Xoay camera** (Ctrl+R): cả bản vẽ được vẽ trong một "khung" chưa xoay rồi khung đó quay
 * `turns` × 90° quanh tâm màn hình. `toScreen` trả về toạ độ **trong khung** (renderer vẽ
 * sau khi đã áp phép quay), còn mọi thứ nhận toạ độ **màn hình** thật — con trỏ, kéo, lăn
 * chuột — đi qua `screenToFrame` trước.
 */
export class Camera {
  x = 0;
  z = 0;
  /** Số pixel một ô, đang hiển thị. */
  cell = 18;
  /** Số pixel một ô, đích đang zoom tới. */
  targetCell = 18;
  /** Số lần quay 90° theo chiều kim đồng hồ của cả khung nhìn. */
  turns: Turns = 0;
  /**
   * Góc quay **còn lại** của hiệu ứng xoay mượt (radian, người dùng 2026-09-30): `rotateView` đổi `turns` ngay
   * (con trỏ, phím đều theo hướng mới) nhưng hình vẽ bắt đầu từ góc cũ và trượt dần về 0 trong `update()`.
   * Góc đang hiển thị = `turns × 90° + spin`.
   */
  spin = 0;
  /** Kích thước màn hình (px CSS) — cần để quay quanh tâm. Renderer cập nhật mỗi lần vẽ. */
  viewW = 0;
  viewH = 0;
  /** Điểm (trong khung) giữ cố định khi zoom (thường là vị trí con trỏ). */
  private anchor = { sx: 0, sy: 0 };

  static readonly MIN_CELL = 5;
  static readonly MAX_CELL = 72;
  /** Tốc độ zoom hội tụ; càng lớn càng nhanh. */
  static readonly ZOOM_RATE = 16;
  /** Tốc độ hội tụ của hiệu ứng xoay camera. */
  static readonly SPIN_RATE = 13;

  setView(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  /**
   * Đổi cỡ màn hình mà **bản đồ đứng yên**: điểm thế giới đang ở góc trên-trái màn hình giữ nguyên chỗ. Khung quay quanh
   * tâm màn hình nên khi camera đang xoay, chỉ `setView` thôi thì cả bản đồ trượt theo tâm (người dùng 2026-10-06: thanh
   * tab trượt xuống / lên trên điện thoại làm cả khung hình trượt theo). Lần đầu (chưa có cỡ cũ) thì như `setView`.
   */
  resizeView(w: number, h: number): void {
    if (this.viewW <= 0 || this.viewH <= 0 || (w === this.viewW && h === this.viewH)) {
      this.setView(w, h);
      return;
    }
    const before = this.screenToFrame(0, 0);
    this.setView(w, h);
    const after = this.screenToFrame(0, 0);
    this.x += (before.sx - after.sx) / this.cell;
    this.z += (before.sy - after.sy) / this.cell;
  }

  /** Kích thước khung vẽ (chưa quay): quay lẻ lần thì dài/rộng đổi chỗ. */
  get frame(): { w: number; h: number } {
    return this.turns % 2 === 1 ? { w: this.viewH, h: this.viewW } : { w: this.viewW, h: this.viewH };
  }

  /** Điểm trên màn hình → điểm trong khung vẽ. */
  screenToFrame(sx: number, sy: number): { sx: number; sy: number } {
    const f = this.frame;
    const v = rot(sx - this.viewW / 2, sy - this.viewH / 2, 4 - this.turns);
    return { sx: f.w / 2 + v.x, sy: f.h / 2 + v.y };
  }

  /** Vector trên màn hình (kéo chuột, phím WASD) → vector trong khung vẽ. */
  screenVec(dx: number, dy: number): { x: number; y: number } {
    return rot(dx, dy, 4 - this.turns);
  }

  /** Toạ độ **trong khung vẽ** của một điểm lưới. */
  toScreen(c: { x: number; z: number }): { sx: number; sy: number } {
    return { sx: (c.x - this.x) * this.cell, sy: (c.z - this.z) * this.cell };
  }

  /** Ô dưới một điểm **trên màn hình**. */
  toCell(sx: number, sy: number): Cell {
    const p = this.screenToFrame(sx, sy);
    return { x: Math.floor(p.sx / this.cell + this.x), z: Math.floor(p.sy / this.cell + this.z) };
  }

  /** Xoay khung nhìn `delta` × 90° (dương = chiều kim đồng hồ), giữ nguyên điểm ở tâm màn hình. */
  rotateView(delta: number): void {
    const f0 = this.frame;
    const cx = this.x + f0.w / 2 / this.cell;
    const cz = this.z + f0.h / 2 / this.cell;
    this.turns = ((((this.turns + delta) % 4) + 4) % 4) as Turns;
    const f1 = this.frame;
    this.x = cx - f1.w / 2 / this.cell;
    this.z = cz - f1.h / 2 / this.cell;
    // hình vẽ vẫn đứng ở góc cũ, `update()` quay dần tới góc mới (bấm liên tiếp thì cộng dồn)
    this.spin -= (delta * Math.PI) / 2;
  }

  /** Góc quay đang hiển thị (radian). */
  get angle(): number {
    return (this.turns * Math.PI) / 2 + this.spin;
  }

  private clamp(v: number): number {
    return Math.min(Camera.MAX_CELL, Math.max(Camera.MIN_CELL, v));
  }

  /** Đặt cỡ ô ngay lập tức, giữ cố định điểm màn hình (sx, sy). */
  private setCellAt(sx: number, sy: number, cell: number): void {
    const wx = sx / this.cell + this.x;
    const wz = sy / this.cell + this.z;
    this.cell = this.clamp(cell);
    this.x = wx - sx / this.cell;
    this.z = wz - sy / this.cell;
  }

  /** Zoom mượt: chỉ đổi đích, `update()` sẽ trượt tới. `(sx, sy)` là điểm trên màn hình. */
  zoomTowards(sx: number, sy: number, factor: number): void {
    this.targetCell = this.clamp(this.targetCell * factor);
    this.anchor = this.screenToFrame(sx, sy);
  }

  /** Zoom tức thì (dùng cho vừa khung). */
  zoomAt(sx: number, sy: number, factor: number): void {
    const p = this.screenToFrame(sx, sy);
    this.setCellAt(p.sx, p.sy, this.cell * factor);
    this.targetCell = this.cell;
  }

  /** Dịch theo pixel màn hình — kéo chuột, phím WASD. */
  pan(dxPixels: number, dyPixels: number): void {
    const v = this.screenVec(dxPixels, dyPixels);
    this.x -= v.x / this.cell;
    this.z -= v.y / this.cell;
  }

  /**
   * Tiến một khung hình. Trả về `true` nếu camera có thay đổi (cần vẽ lại).
   * Tiệm cận theo hàm mũ nên mượt ở mọi tốc độ khung hình, không phụ thuộc máy.
   */
  update(dt: number): boolean {
    const spun = this.updateSpin(dt);
    return this.updateZoom(dt) || spun;
  }

  /** Xoay mượt: góc còn lại giảm dần theo hàm mũ (~0,35 s), đủ nhỏ thì dừng hẳn. */
  private updateSpin(dt: number): boolean {
    if (this.spin === 0) return false;
    this.spin *= Math.exp(-dt * Camera.SPIN_RATE);
    if (Math.abs(this.spin) < 0.002) this.spin = 0;
    return true;
  }

  private updateZoom(dt: number): boolean {
    const diff = this.targetCell - this.cell;
    if (Math.abs(diff) < 0.01) {
      if (diff !== 0) this.setCellAt(this.anchor.sx, this.anchor.sy, this.targetCell);
      return diff !== 0;
    }
    const k = 1 - Math.exp(-dt * Camera.ZOOM_RATE);
    this.setCellAt(this.anchor.sx, this.anchor.sy, this.cell + diff * k);
    return true;
  }

  fitBox(box: { x: number; z: number; w: number; d: number }, viewW: number, viewH: number, pad = 3): void {
    this.cell = this.clamp(Math.min(viewW / (box.w + pad * 2), viewH / (box.d + pad * 2)));
    this.targetCell = this.cell;
    this.x = box.x + box.w / 2 - viewW / this.cell / 2;
    this.z = box.z + box.d / 2 - viewH / this.cell / 2;
  }

  fit(areaW: number, areaD: number, viewW: number, viewH: number): void {
    this.fitBox({ x: 0, z: 0, w: areaW, d: areaD }, viewW, viewH, 1);
  }
}
