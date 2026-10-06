import type { AppState } from '../editor/state';
import { emptySelection, type Pieces } from '../editor/group';
import type { Terrain } from '../grid/grid';
import { footprintCells } from '../model/geometry';
import type { Blueprint, Dataset } from '../model/types';
import { Renderer, SCENE_PREVIEW } from '../render/renderer';
import { solve } from '../sim/solver';

/**
 * Ảnh xem trước một bản vẽ: vẽ bằng **chính** `Renderer` của bản vẽ chính lên một canvas
 * ẩn, nên trông y như lúc đang sửa (sprite, băng, ống). Dùng chung kho ảnh với renderer
 * chính — ảnh đã tải rồi nên vẽ được ngay. Trả về dataURL nhỏ để lưu vào thư viện: **WebP nền trong suốt**
 * (người dùng 2026-10-02 — ảnh không dính màu nền của giao diện lúc lưu; trình duyệt không mã hoá được WebP thì ra PNG).
 */
export function renderPreview(main: Renderer, ds: Dataset, bp: Blueprint, terrain: Terrain, w = 320, h = 200): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const fake = {
    ds,
    bp,
    terrain,
    tool: { kind: 'select' },
    sel: emptySelection(),
    result: solve(bp, ds),
    selection: null,
  } as unknown as AppState;
  const r = new Renderer(canvas, fake, main.icons);
  r.scene = SCENE_PREVIEW; // nền trong suốt, không dính màu giao diện đang bật
  r.showLabels = false;
  r.showStatus = false;
  r.activeLayer = 0;

  // khung vừa với nội dung, không phải cả khu 70×70
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  const add = (x: number, z: number): void => {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  };
  for (const m of bp.machines) {
    const def = ds.machines.get(m.machineId);
    for (const c of def ? footprintCells(m, def) : [m]) add(c.x, c.z);
  }
  for (const t of bp.belts) add(t.x, t.z);
  const box = x0 === Infinity ? { x: 0, z: 0, w: bp.area.w, d: bp.area.d } : { x: x0, z: z0, w: x1 - x0 + 1, d: z1 - z0 + 1 };
  // tự đặt camera, không qua `fitBox`: bản vẽ lớn cần ô nhỏ hơn mức zoom tối thiểu của màn hình chính
  const cell = Math.min(w / (box.w + 2), h / (box.d + 2));
  r.camera.cell = r.camera.targetCell = cell;
  r.camera.x = box.x + box.w / 2 - w / cell / 2;
  r.camera.z = box.z + box.d / 2 - h / cell / 2;
  r.draw();
  return canvas.toDataURL('image/webp', 0.85);
}

/** Bản vẽ tạm chứa một module (đã dời về gốc) — để vẽ ảnh xem trước. */
export function piecesBlueprint(pieces: Pieces, size: { w: number; d: number }): Blueprint {
  return {
    version: 2,
    name: '',
    area: { w: size.w, d: size.d },
    machines: pieces.machines,
    belts: pieces.tiles,
    nextUid: 1,
    enforcePower: false,
  };
}

/** Ảnh xem trước kiểu cũ (JPEG, nền tối / sáng in cứng vào ảnh) ⇒ nên vẽ lại. */
export const isOldPreview = (url: string | undefined): boolean => !url || url.startsWith('data:image/jpeg');
