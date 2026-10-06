/**
 * Thông số thông lượng và cổng kích hoạt.
 *
 * Sức chở băng/ống lấy theo số thật trong game. Ngưỡng của cổng kích hoạt cũng vậy:
 * máy nhận và tiêu thụ **tối đa 30** đơn vị mỗi phút, nhưng chỉ cần **6** là đã chạy
 * hết công suất — giống như điện, có đủ thì thôi, không nhanh hơn.
 */
export const RATES = {
  /** Vật rắn mỗi phút mà một băng chuyền chở được. */
  beltPerMinute: 30,
  /** Chất lỏng hoặc khí mỗi phút mà một ống chở được. */
  pipePerMinute: 120,
  /** Lượng tối đa một cổng kích hoạt rút về. */
  activatorMaxPerMinute: 30,
  /** Mức sàn để máy chạy 100%. Dưới ngưỡng này máy chậm lại theo tỉ lệ. */
  activatorFloorPerMinute: 6,
} as const;

export const capacityOf = (kind: 'belt' | 'pipe'): number =>
  kind === 'belt' ? RATES.beltPerMinute : RATES.pipePerMinute;

/**
 * Hệ số chạy mà cổng kích hoạt cho phép, ứng với lượng nạp vào mỗi phút.
 *
 * Trên mức sàn là 100%; dưới mức sàn giảm tuyến tính. Game không nói rõ hành vi dưới
 * sàn nên đây là giả định — nhưng nó đúng ở hai đầu và không tạo bậc nhảy.
 */
export const activatorFactor = (supplyPerMinute: number): number =>
  Math.max(0, Math.min(1, supplyPerMinute / RATES.activatorFloorPerMinute));
