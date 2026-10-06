import { describe, expect, it } from 'vitest';
import { replacedBlueprint } from '../src/ui/library';
import type { SavedBlueprint } from '../src/blueprint/library';

/**
 * Người dùng 2026-10-02 (đợt 2): khi cửa sổ thêm bản vẽ đang mở, bấm vào một bản vẽ có sẵn ⇒ cập nhật bản vẽ đó
 * thành bản vẽ mới (có hỏi lại). Bản cũ giữ id (ghim trên thanh đặt máy không mất) và ngày tạo.
 */
describe('cập nhật bản vẽ có sẵn thành bản vẽ mới', () => {
  const old: SavedBlueprint = {
    id: 'bp-old',
    name: 'Dây sắt',
    icon: 'item_iron_nugget',
    kind: 'modeler',
    created: 1000,
    preview: 'data:image/webp;base64,OLD',
    modeler: { nodes: [], links: [] } as unknown as SavedBlueprint['modeler'],
  };
  const fresh = { nodes: [{ id: 'n1' }], links: [] } as unknown as SavedBlueprint['modeler'];

  it('giữ id, loại, ngày tạo; nội dung và ảnh lấy bản mới', () => {
    const r = replacedBlueprint(old, { entry: { modeler: fresh }, preview: 'data:image/webp;base64,NEW', name: '', icon: null });
    expect(r.id).toBe('bp-old');
    expect(r.kind).toBe('modeler');
    expect(r.created).toBe(1000);
    expect(r.preview).toBe('data:image/webp;base64,NEW');
    expect(r.modeler).toBe(fresh);
  });

  it('ô tên trống / chưa chọn biểu tượng ⇒ giữ tên và biểu tượng cũ', () => {
    const r = replacedBlueprint(old, { entry: { modeler: fresh }, preview: 'x', name: '   ', icon: null });
    expect(r.name).toBe('Dây sắt');
    expect(r.icon).toBe('item_iron_nugget');
  });

  it('đã điền tên / chọn biểu tượng ⇒ dùng cái mới', () => {
    const r = replacedBlueprint(old, { entry: { modeler: fresh }, preview: 'x', name: ' Dây sắt v2 ', icon: 'item_glass' });
    expect(r.name).toBe('Dây sắt v2');
    expect(r.icon).toBe('item_glass');
  });
});
