import { describe, expect, it } from 'vitest';
import { Camera } from '../src/render/camera';

describe('camera', () => {
  it('zoom mượt: lăn chuột chỉ đổi đích, cỡ ô tiến dần tới đích', () => {
    const c = new Camera();
    c.cell = c.targetCell = 20;
    c.zoomTowards(100, 100, 2);
    expect(c.cell).toBe(20); // chưa nhảy ngay
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) {
      c.update(1 / 60);
      seen.push(c.cell);
    }
    // tăng đều, không vượt quá đích, tới gần sát đích sau nửa giây
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(Math.max(...seen)).toBeLessThanOrEqual(40);
    expect(seen[seen.length - 1]!).toBeGreaterThan(39);
  });

  it('zoom giữ nguyên điểm dưới con trỏ', () => {
    const c = new Camera();
    c.cell = c.targetCell = 20;
    c.x = 3;
    c.z = 7;
    const anchor = { sx: 250, sy: 130 };
    const worldBefore = { x: anchor.sx / c.cell + c.x, z: anchor.sy / c.cell + c.z };
    c.zoomTowards(anchor.sx, anchor.sy, 1.5);
    for (let i = 0; i < 60; i++) c.update(1 / 60);
    const worldAfter = { x: anchor.sx / c.cell + c.x, z: anchor.sy / c.cell + c.z };
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6);
    expect(worldAfter.z).toBeCloseTo(worldBefore.z, 6);
  });

  it('không có gì để zoom thì báo không cần vẽ lại', () => {
    const c = new Camera();
    expect(c.update(1 / 60)).toBe(false);
  });

  it('di chuyển theo pixel: toạ độ thực, không nhảy theo ô', () => {
    const c = new Camera();
    c.cell = 20;
    c.pan(-7, 0); // 7 pixel = 0.35 ô
    expect(c.x).toBeCloseTo(0.35, 9);
  });
});
