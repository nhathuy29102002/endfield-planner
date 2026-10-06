import { describe, expect, it } from 'vitest';
import { dominantColor } from '../src/render/dominant';

/** Màu chủ đạo của ảnh món — ô vuông khi thu nhỏ ở chế độ mô phỏng (người dùng 2026-10-05). */
describe('dominantColor', () => {
  const px = (r: number, g: number, b: number, a = 255): number[] => [r, g, b, a];
  it('lấy màu chiếm nhiều điểm ảnh nhất, bỏ qua điểm trong suốt', () => {
    const data = [
      ...Array(10).fill(px(200, 40, 40)).flat(), // đỏ: 10 điểm
      ...Array(4).fill(px(20, 20, 20)).flat(), // viền đen: 4 điểm
      ...Array(50).fill(px(0, 200, 0, 0)).flat(), // nền trong suốt: bỏ qua
    ];
    expect(dominantColor(data)).toBe('#c82828');
  });
  it('các sắc độ gần nhau của cùng một màu gom chung, trả về trung bình màu thật', () => {
    const data = [...px(100, 150, 230), ...px(104, 154, 226), ...px(250, 250, 250)];
    expect(dominantColor(data)).toBe('#6698e4');
  });
  it('bột đựng trong bát xám: lấy màu của bột (điểm có sắc), không lấy màu cái bát', () => {
    const data = [
      ...Array(30).fill(px(32, 32, 34)).flat(), // bát xám tối — nhiều điểm nhất
      ...Array(12).fill(px(150, 70, 60)).flat(), // bột đỏ nâu
    ];
    expect(dominantColor(data)).toBe('#96463c');
  });
  it('ảnh gần như toàn xám (vd. Carbon, Pin) ⇒ vẫn lấy màu xám nhiều nhất', () => {
    const data = [...Array(30).fill(px(40, 40, 44)).flat(), ...px(150, 70, 60)];
    expect(dominantColor(data)).toBe('#28282c');
  });
  it('ảnh trong suốt hoàn toàn ⇒ null', () => {
    expect(dominantColor([0, 0, 0, 0, 255, 255, 255, 10])).toBeNull();
  });
});
