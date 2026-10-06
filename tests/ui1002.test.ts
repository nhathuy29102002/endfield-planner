import { describe, expect, it } from 'vitest';
import { addPanelLayout } from '../src/ui/library';

/** Cửa sổ thêm bản vẽ (người dùng 2026-10-02): đứng sát bên phải cửa sổ Bản vẽ, cả cặp nằm giữa màn hình. */
describe('cửa sổ thêm bản vẽ — bố cục', () => {
  it('màn hình rộng: cửa sổ Bản vẽ giữ bề rộng, chỉ dịch sang trái', () => {
    const l = addPanelLayout(1920, 1100);
    expect(l.libW).toBe(1100);
    expect(l.panelW).toBe(380);
    const libLeft = (1920 - 1100) / 2 + l.shift;
    // cặp nằm giữa: lề trái = lề phải
    expect(libLeft).toBeCloseTo(1920 - (l.panelLeft + l.panelW));
    // khe 12px giữa hai cửa sổ
    expect(l.panelLeft - (libLeft + l.libW)).toBeCloseTo(12);
  });

  it('màn hình hẹp: cửa sổ Bản vẽ hẹp lại cho vừa, không cửa sổ nào tràn ra ngoài', () => {
    const l = addPanelLayout(1024, 901);
    const libLeft = (1024 - l.libW) / 2 + l.shift;
    expect(l.libW).toBeLessThan(901);
    expect(libLeft).toBeGreaterThanOrEqual(0);
    expect(l.panelLeft + l.panelW).toBeLessThanOrEqual(1024);
    expect(l.panelLeft).toBeGreaterThan(libLeft + l.libW);
  });
});

describe('ghim bản vẽ lên thanh đặt máy thu gọn', () => {
  it('ghim / bỏ ghim giữ thứ tự ghim, không trùng', async () => {
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const { loadBlueprintPins, setBlueprintPinned } = await import('../src/blueprint/library');
    setBlueprintPinned('a', true);
    setBlueprintPinned('b', true);
    setBlueprintPinned('a', true);
    expect(loadBlueprintPins()).toEqual(['b', 'a']);
    setBlueprintPinned('b', false);
    expect(loadBlueprintPins()).toEqual(['a']);
    delete (globalThis as Record<string, unknown>).localStorage;
  });
});
