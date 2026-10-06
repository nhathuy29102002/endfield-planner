import type { BeltTile, Blueprint, Cell, Dir4, Link } from '../model/types';
import type { Terrain } from '../grid/grid';
import { tr } from '../i18n';

export interface SavedPlan {
  format: 'endfield-planner';
  version: 1;
  blueprint: Blueprint;
  terrain: Terrain;
}

const MAGIC = 'EFP1';

export const toJson = (bp: Blueprint, terrain: Terrain): string =>
  JSON.stringify({ format: 'endfield-planner', version: 1, blueprint: bp, terrain } satisfies SavedPlan);

const dirOf = (a: Cell, b: Cell): Dir4 =>
  (b.z < a.z ? 0 : b.x > a.x ? 1 : b.z > a.z ? 2 : 3) as Dir4;

/**
 * Bản vẽ định dạng 1 lưu "tuyến nối cổng A tới cổng B" kèm đường đi. Định dạng 2 lưu
 * từng ô với hướng vào/ra. Đổi được mà không cần dữ liệu máy: hướng của mỗi ô suy từ
 * ô trước và ô sau nó trên đường đi; hai đầu thì giữ thẳng.
 */
function migrateLinks(links: Link[], nextUid: number): { belts: BeltTile[]; nextUid: number } {
  const belts: BeltTile[] = [];
  for (const l of links) {
    const p = l.path;
    if (p.length === 0) continue;
    const group = nextUid++;
    for (let i = 0; i < p.length; i++) {
      const prev = p[i - 1];
      const cur = p[i]!;
      const next = p[i + 1];
      const out: Dir4 = next ? dirOf(cur, next) : prev ? dirOf(prev, cur) : 2;
      const inn: Dir4 = prev ? dirOf(prev, cur) : out;
      belts.push({ x: cur.x, z: cur.z, kind: l.kind, in: inn, out, group });
    }
  }
  return { belts, nextUid };
}

export function fromJson(text: string): SavedPlan {
  const data = JSON.parse(text) as Partial<SavedPlan> & { blueprint?: Blueprint & { links?: Link[] } };
  if (data.format !== 'endfield-planner' || !data.blueprint)
    throw new Error(tr('Không phải file bản vẽ của ứng dụng này'));
  const bp = data.blueprint;
  if (!Array.isArray(bp.belts)) {
    const m = migrateLinks(bp.links ?? [], bp.nextUid ?? 1);
    bp.belts = m.belts;
    bp.nextUid = m.nextUid;
  }
  delete bp.links;
  bp.version = 2;
  return { format: 'endfield-planner', version: 1, blueprint: bp, terrain: data.terrain ?? {} };
}

const b64encode = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const b64decode = (text: string): Uint8Array => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Mã chia sẻ: `EFP1` + deflate + base64url. Nén vì đường đi của tuyến chiếm phần
 * lớn dung lượng và nó rất dễ nén.
 */
export async function toShareCode(bp: Blueprint, terrain: Terrain): Promise<string> {
  const raw = new TextEncoder().encode(toJson(bp, terrain));
  return MAGIC + b64encode(await deflate(raw));
}

export async function fromShareCode(code: string): Promise<SavedPlan> {
  const trimmed = code.trim();
  if (!trimmed.startsWith(MAGIC)) throw new Error(tr('Mã phải bắt đầu bằng {0}', MAGIC));
  const raw = await inflate(b64decode(trimmed.slice(MAGIC.length)));
  return fromJson(new TextDecoder().decode(raw));
}
