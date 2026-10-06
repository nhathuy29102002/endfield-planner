import { describe, expect, it } from 'vitest';
import { ds } from './helpers';
import { emptyModeler, modelerMachines, type ModelerDoc } from '../src/modeler/doc';
import { inkAddPoint, inkBounds, inkPath, inkTextSize, INK_COLORS } from '../src/modeler/ink';
import { modelerFingerprint } from '../src/editor/tabs';
import { MAP_HINTS, MODELER_HINTS, HINT_MS } from '../src/ui/hints';

/** Đợt 2026-09-30 (người dùng): bút vẽ Modeler, "Hiện ẩn" bên Modeler, hộp hướng dẫn tự ẩn. */
describe('bút vẽ Modeler', () => {
  it('nét: bỏ điểm quá sát, đường mềm qua trung điểm; một điểm = chấm tròn', () => {
    const pts: number[] = [];
    expect(inkAddPoint(pts, 0, 0, 2)).toBe(true);
    expect(inkAddPoint(pts, 1, 0, 2)).toBe(false); // sát quá ⇒ bỏ
    expect(inkAddPoint(pts, 10, 0, 2)).toBe(true);
    expect(inkAddPoint(pts, 10, 10, 2)).toBe(true);
    expect(pts).toEqual([0, 0, 10, 0, 10, 10]);
    expect(inkPath(pts)).toBe('M0 0Q10 0 10 5L10 10');
    expect(inkPath([5, 5])).toBe('M5 5l0 0.01');
    expect(inkPath([0, 0, 3, 4])).toBe('M0 0L3 4');
  });

  it('khung bao: nét tính cả nửa độ dày; chữ theo số dòng / ký tự', () => {
    expect(inkBounds({ id: 'a', kind: 'stroke', color: '#fff', width: 4, points: [0, 0, 10, 20] })).toEqual({ x0: -2, y0: -2, x1: 12, y1: 22 });
    const size = inkTextSize(3);
    expect(size).toBe(17);
    const b = inkBounds({ id: 't', kind: 'text', color: '#fff', width: 3, x: 100, y: 50, text: 'ab\nabcd' });
    expect(b.x0).toBe(100);
    expect(b.y1).toBeCloseTo(50 + 2 * size * 1.25);
    expect(b.x1).toBeCloseTo(100 + 4 * size * 0.6);
  });

  it('bảng màu có sẵn đủ 10 màu, mã hex', () => {
    expect(INK_COLORS).toHaveLength(10);
    for (const c of INK_COLORS) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('dấu vân tay: sơ đồ chưa có nét vẽ giữ nguyên như cũ (không bị coi là "chưa lưu"); có nét ⇒ tính cả nét', () => {
    const doc: ModelerDoc = emptyModeler();
    expect(modelerFingerprint(doc)).toBe(JSON.stringify([[], []]));
    const before = modelerFingerprint(doc);
    doc.drawings = [{ id: 'k', kind: 'stroke', color: '#fff', width: 2, points: [0, 0] }];
    expect(modelerFingerprint(doc)).not.toBe(before);
  });
});

describe('bảng chọn máy bên Modeler: bỏ tick "Hiện ẩn" ⇒ ẩn máy không đặt được lên sơ đồ', () => {
  it('giàn khai thác, mối nối băng, cột điện… không dùng trong Modeler; máy chế tạo thì có', () => {
    const usable = new Set(modelerMachines(ds).map((d) => d.id));
    for (const id of ['miner_1', 'miner_2', 'miner_4', 'log_connector', 'log_splitter', 'power_diffuser_1', 'power_pole_2', 'power_station_1'])
      expect(usable.has(id), id).toBe(false);
    for (const id of ['furnance_1', 'unloader_1', 'pump_2']) if (ds.machines.has(id)) expect(usable.has(id), id).toBe(true);
  });
});

describe('hộp hướng dẫn', () => {
  it('Map và Modeler có nội dung riêng; đếm ngược 5 giây', () => {
    expect(HINT_MS).toBe(5000);
    expect(MAP_HINTS.map((r) => r[1])).not.toEqual(MODELER_HINTS.map((r) => r[1]));
    expect(MAP_HINTS.some((r) => r[1].includes('Băng chuyền'))).toBe(true);
    expect(MODELER_HINTS.some((r) => r[1].includes('Bút vẽ'))).toBe(true);
  });
});

describe('xoay camera mượt (người dùng 2026-09-30)', () => {
  it('Ctrl+R đổi hướng ngay, hình vẽ bắt đầu từ góc cũ rồi quay dần tới góc mới', async () => {
    const { Camera } = await import('../src/render/camera');
    const cam = new Camera();
    cam.setView(800, 600);
    cam.targetCell = cam.cell;
    cam.rotateView(1);
    expect(cam.turns).toBe(1);
    expect(cam.angle).toBeCloseTo(0); // chưa quay: vẫn ở góc cũ
    expect(cam.update(1 / 60)).toBe(true); // đang quay ⇒ cần vẽ lại
    expect(cam.angle).toBeGreaterThan(0);
    expect(cam.angle).toBeLessThan(Math.PI / 2);
    for (let i = 0; i < 120; i++) cam.update(1 / 60);
    expect(cam.spin).toBe(0);
    expect(cam.angle).toBeCloseTo(Math.PI / 2);
    expect(cam.update(1 / 60)).toBe(false); // quay xong, đứng yên
  });
  it('bấm liên tiếp: góc cộng dồn, quay ngược cũng mượt', async () => {
    const { Camera } = await import('../src/render/camera');
    const cam = new Camera();
    cam.setView(800, 600);
    cam.rotateView(1);
    cam.rotateView(1);
    expect(cam.turns).toBe(2);
    expect(cam.angle).toBeCloseTo(0);
    cam.update(0.1);
    cam.rotateView(-1);
    expect(cam.turns).toBe(1);
    for (let i = 0; i < 200; i++) cam.update(1 / 60);
    expect(cam.angle).toBeCloseTo(Math.PI / 2);
  });
});
