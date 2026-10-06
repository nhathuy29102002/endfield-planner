import { afterEach, describe, expect, it } from 'vitest';
import { LOCALES, SOURCE_LOCALE, lang, localName, otherName, setLang, tr } from '../src/i18n';
import { loadDataset } from '../src/model/dataset';
// @ts-expect-error — script Node thuần (không có file .d.ts)
import { sourceKeys } from '../tools/i18n-keys.mjs';

/**
 * Đa ngôn ngữ (người dùng 2026-10-02). Mọi câu `tr('…')` trong `src/` phải có bản dịch ở mọi ngôn ngữ; thiếu câu
 * nào thì test in ra đúng câu đó và chỗ dùng (xem `npm run i18n -- <mã>`).
 */
const keys = sourceKeys() as Map<string, string>;
const holes = (s: string): string => [...s.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort().join();

afterEach(() => setLang(SOURCE_LOCALE.code));

describe('i18n', () => {
  it('quét được câu cần dịch trong mã', () => {
    expect(keys.size).toBeGreaterThan(600);
    expect(keys.has('Không đặt được: {0}')).toBe(true);
  });

  for (const loc of LOCALES.filter((l) => l !== SOURCE_LOCALE)) {
    it(`${loc.code}: đủ bản dịch, giữ nguyên {0}… và khoảng trắng đầu / cuối`, () => {
      const missing = [...keys].filter(([k]) => !(k in loc.strings)).map(([k, where]) => `${where}  ${k}`);
      expect(missing).toEqual([]);
      for (const [k, v] of Object.entries(loc.strings)) {
        expect(holes(v), k).toBe(holes(k));
        expect(v.startsWith(' '), k).toBe(k.startsWith(' '));
        expect(v.endsWith(' '), k).toBe(k.endsWith(' '));
      }
    });

    it(`${loc.code}: câu mà mã kiểm tra bằng startsWith vẫn khớp tiền tố đã dịch`, () => {
      // solver.ts: `bottleneck.startsWith(tr('Thiếu'))`; input.ts: `message.startsWith(tr('Không đặt được'))`
      for (const prefix of ['Thiếu', 'Không đặt được']) {
        const head = loc.strings[prefix]!;
        for (const k of keys.keys()) if (k.startsWith(prefix)) expect(loc.strings[k]!.startsWith(head), k).toBe(true);
      }
    });
  }

  it('ngôn ngữ gốc trả lại đúng câu tiếng Việt, điền {0} {1}', () => {
    expect(lang().code).toBe('vi');
    expect(tr('Đã nối {0} vào máy', 3)).toBe('Đã nối 3 vào máy');
    expect(tr('{0}×{1} = {2} ô', 2, 3, 6)).toBe('2×3 = 6 ô');
  });

  it('đổi sang tiếng Anh: câu dịch + tên máy / vật tư theo dữ liệu game', () => {
    setLang('en');
    expect(tr('Đã nối {0} vào máy', 3)).toBe('Connected 3 to the machine');
    expect(tr('câu chưa dịch {0}', 1)).toBe('câu chưa dịch 1');
    const def = { name: 'Van Tách', nameVi: 'Van Tách', nameEn: 'Splitter' };
    expect(localName(def)).toBe('Splitter');
    expect(otherName({ ...def, name: 'Splitter' })).toBe('Van Tách');
    const ds = loadDataset();
    expect(ds.machines.get('log_splitter')!.name).toBe('Splitter');
    expect(ds.items.get('item_gas_inert')!.name).toBe('Inergen');
    // bình đã nạp: tên ghép từ vỏ + chất nạp, theo ngôn ngữ đang chọn
    expect(ds.items.get('item_bottled_liquid_water')?.name ?? ds.items.get([...ds.items.keys()].find((id) => ds.items.get(id)!.icon.startsWith('filled/'))!)!.name).toMatch(/\(.+\)$/);
    expect(ds.machines.get('planter_1')!.modes!.map((m) => m.label)).toEqual(['Normal', 'Water']);
  });

  it('tiếng Việt: dữ liệu giữ tên tiếng Việt như cũ', () => {
    const ds = loadDataset();
    expect(ds.machines.get('log_splitter')!.name).toBe('Van Tách');
    expect(ds.machines.get('planter_1')!.modes!.map((m) => m.label)).toEqual(['Bình thường', 'Nước']);
  });
});
