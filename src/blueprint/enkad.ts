import idsJson from '../../data/enkad-ids.json';
import type { Pieces } from '../editor/group';
import {
  addMachine,
  setDepotItem,
  setFilterItem,
  setFilterRate,
  setMode,
  setOutletItem,
  setPairTarget,
  setRecipe,
  toggleNotedRecipe,
  FILTER_RATES,
} from '../editor/ops';
import { cellKey } from '../model/geometry';
import { roleOf } from '../model/roles';
import { activePorts, emptyBlueprint, type BeltTile, type Dataset, type Dir4, type Facing, type PortKey } from '../model/types';
import { tr } from '../i18n';
import { isNativeApp, nativePlugin } from '../platform';

/**
 * Nhập bản vẽ của **EnKAD** / của game (người dùng 2026-09-29).
 *
 * EnKAD lưu bản vẽ bằng protobuf `factory.proto` (khảo sát từ mã EnKAD, mô tả file nhúng trong
 * bundle): `Factory { version, area_width, area_height, layers[] { layer_tag, entities[] } }`,
 * `Entity { type, entity_id, x, y, building | belt | pipe | annotation, uid }`. Mã bản vẽ của game
 * (`EFO0…`) được EnKAD tra qua `/api/efbp?code=…&server=…` rồi trả về chính chuỗi base64 đó.
 *
 * - `entity_id`: số thứ tự nội bộ của EnKAD ⇒ `data/enkad-ids.json` (bảng `idToInt` chép từ EnKAD:
 *   công trình, vật phẩm, công thức).
 * - Công trình: `(x, y)` = góc trên-trái footprint **sau khi quay**, `rotation` 0/90/180/270 cùng
 *   chiều với `rot` của ứng dụng; `mode` 0 = A, 1 = B; `recipe_ids` = công thức đã chọn; `port_items`
 *   = vật phẩm đã chọn trên cổng (chỉ số theo danh sách cổng của EnKAD: cổng ra trước, rồi cổng vào,
 *   đã lọc theo chế độ); `channel` = kênh ghép cặp ống ngầm; `value` = tốc độ cảng kiểm soát ×2.
 * - Băng / ống: `points` = các điểm gấp khúc, **tương đối** so với `(x, y)`; điểm đầu (`type` 1) và
 *   điểm cuối (`type` 2) là hai ô neo nằm ngoài tuyến (cổng nguồn / cổng đích) — các ô thật là đoạn
 *   thẳng nối các điểm ở giữa.
 */

const IDS = idsJson as { buildings: Record<string, number>; items: Record<string, number>; recipes: Record<string, number> };
const invert = (m: Record<string, number>): Map<number, string> => new Map(Object.entries(m).map(([k, v]) => [v, k]));
const BUILDING = invert(IDS.buildings);
const ITEM = invert(IDS.items);
const RECIPE = invert(IDS.recipes);
const BELT_ID = IDS.buildings['grid_belt_01'];
const PIPE_ID = IDS.buildings['log_pipe_01'];

// ------------------------------------------------------------------ protobuf tối giản

/** `lo` = 32 bit thấp của varint — đọc int32 âm (mã hoá 10 byte) mà không mất chính xác. */
type Field = { no: number; wire: number; num: number; lo: number; bytes: Uint8Array };

function readFields(b: Uint8Array): Field[] {
  const out: Field[] = [];
  let i = 0;
  let lo = 0;
  const varint = (): number => {
    let r = 0;
    let mul = 1;
    let shift = 0;
    lo = 0;
    for (;;) {
      if (i >= b.length) throw new Error(tr('protobuf hỏng'));
      const c = b[i++]!;
      r += (c & 0x7f) * mul;
      if (shift < 32) lo = (lo | ((c & 0x7f) << shift)) >>> 0;
      if (c < 0x80) return r;
      mul *= 128;
      shift += 7;
    }
  };
  while (i < b.length) {
    const key = varint();
    const no = Math.floor(key / 8);
    const wire = key & 7;
    if (wire === 0) {
      const v = varint();
      out.push({ no, wire, num: v, lo, bytes: new Uint8Array() });
    } else if (wire === 2) {
      const len = varint();
      out.push({ no, wire, num: 0, lo: 0, bytes: b.subarray(i, i + len) });
      i += len;
    } else if (wire === 5) i += 4;
    else if (wire === 1) i += 8;
    else throw new Error(tr('protobuf hỏng'));
  }
  return out;
}

const one = (fs: Field[], no: number): Field | undefined => fs.find((f) => f.no === no);
/** `signed`: int32 — âm được mã hoá thành varint 64 bit, lấy 32 bit thấp rồi đổi dấu. */
const num = (fs: Field[], no: number, signed = false): number => {
  const f = one(fs, no);
  if (!f) return 0;
  return signed ? f.lo | 0 : f.num;
};

export interface EnkadPoint {
  x: number;
  y: number;
  type: number;
}
export interface EnkadEntity {
  type: number;
  id: number;
  x: number;
  y: number;
  building?: {
    rotation: number;
    portItems: { portIndex: number; itemId: number }[];
    recipeIds: number[];
    infinite: boolean;
    mode: number;
    value: number;
    channel: number;
  };
  points?: EnkadPoint[];
}
export interface EnkadFactory {
  width: number;
  height: number;
  entities: EnkadEntity[];
}

function base64Bytes(text: string): Uint8Array {
  let s = text.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+=*$/.test(s)) throw new Error(tr('Không phải chuỗi bản vẽ (base64)'));
  s += '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
  return out;
}

/** Giải chuỗi bản vẽ EnKAD (base64 thường hoặc url-safe). */
export function decodeEnkad(text: string): EnkadFactory {
  const top = readFields(base64Bytes(text));
  const entities: EnkadEntity[] = [];
  for (const layer of top.filter((f) => f.no === 4)) {
    for (const ef of readFields(layer.bytes).filter((f) => f.no === 2)) {
      const e = readFields(ef.bytes);
      const ent: EnkadEntity = { type: num(e, 1), id: num(e, 2), x: num(e, 3, true), y: num(e, 4, true) };
      const b = one(e, 5);
      if (b) {
        const bf = readFields(b.bytes);
        const recipeIds = [num(bf, 3), ...bf.filter((f) => f.no === 4 && f.wire === 0).map((f) => f.num)];
        // `recipe_ids` là trường lặp: có thể nằm gói (packed) trong một khối bytes
        for (const f of bf.filter((x) => x.no === 4 && x.wire === 2)) {
          let i = 0;
          while (i < f.bytes.length) {
            let r = 0;
            let mul = 1;
            for (;;) {
              const c = f.bytes[i++]!;
              r += (c & 0x7f) * mul;
              if (c < 0x80) break;
              mul *= 128;
            }
            recipeIds.push(r);
          }
        }
        ent.building = {
          rotation: num(bf, 1),
          portItems: bf.filter((f) => f.no === 2).map((f) => {
            const p = readFields(f.bytes);
            return { portIndex: num(p, 1), itemId: num(p, 2) };
          }),
          recipeIds: [...new Set(recipeIds.filter((r) => r > 0))],
          infinite: num(bf, 6) === 1,
          mode: num(bf, 7),
          value: num(bf, 8, true),
          channel: num(bf, 9),
        };
      }
      const path = one(e, 6) ?? one(e, 7);
      if (path)
        ent.points = readFields(path.bytes)
          .filter((f) => f.no === 1)
          .map((f) => {
            const p = readFields(f.bytes);
            return { x: num(p, 1, true), y: num(p, 2, true), type: num(p, 3) };
          });
      entities.push(ent);
    }
  }
  return { width: num(top, 2), height: num(top, 3), entities };
}

// ------------------------------------------------------------------ chuyển sang bản vẽ của ứng dụng

const dirOf = (dx: number, dz: number): Dir4 =>
  Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 1 : 3) : dz > 0 ? 2 : 0;

/** Ô của một tuyến EnKAD: đi thẳng qua các điểm giữa, hai điểm neo đầu/cuối cho hướng vào/ra. */
export function pathTiles(e: EnkadEntity, kind: 'belt' | 'pipe', group: number): BeltTile[] {
  const pts = (e.points ?? []).map((p) => ({ x: e.x + p.x, z: e.y + p.y }));
  if (pts.length < 3) return [];
  const cells: { x: number; z: number }[] = [];
  for (let k = 1; k < pts.length - 1; k++) {
    const a = pts[k]!;
    if (cells.length === 0) cells.push(a);
    const b = k + 1 < pts.length - 1 ? pts[k + 1]! : null;
    if (!b) break;
    const sx = Math.sign(b.x - a.x);
    const sz = Math.sign(b.z - a.z);
    let c = a;
    while (c.x !== b.x || c.z !== b.z) {
      c = { x: c.x + (c.x !== b.x ? sx : 0), z: c.z + (c.x === b.x ? sz : 0) };
      cells.push(c);
    }
  }
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  return cells.map((c, k) => {
    const prev = k === 0 ? first : cells[k - 1]!;
    const next = k === cells.length - 1 ? last : cells[k + 1]!;
    return { x: c.x, z: c.z, kind, in: dirOf(c.x - prev.x, c.z - prev.z), out: dirOf(next.x - c.x, next.z - c.z), group };
  });
}

export interface EnkadImport {
  pieces: Pieces;
  /** Công trình / vật phẩm không có trong dữ liệu của ứng dụng (bỏ qua). */
  skipped: string[];
  /** Công trình đặt không được (chồng nhau…). */
  failed: string[];
}

/**
 * Dựng module (dời về gốc 0,0) từ bản vẽ EnKAD. Máy được đặt qua đúng các thao tác của ứng dụng
 * (`addMachine`, `setMode`, `setRecipe`…) nên mọi thiết lập tự khớp luật của ứng dụng.
 */
export function enkadToPieces(text: string, ds: Dataset): EnkadImport {
  const f = decodeEnkad(text);
  const skipped = new Set<string>();
  const failed: string[] = [];
  // khung tạm đủ rộng (toạ độ EnKAD có thể âm / vượt khung khai báo)
  let x0 = 0;
  let z0 = 0;
  let x1 = f.width;
  let z1 = f.height;
  for (const e of f.entities) {
    for (const p of e.points ?? [{ x: 0, y: 0, type: 0 }]) {
      x0 = Math.min(x0, e.x + p.x);
      z0 = Math.min(z0, e.y + p.y);
      x1 = Math.max(x1, e.x + p.x + 12);
      z1 = Math.max(z1, e.y + p.y + 12);
    }
  }
  const ox = -x0 + 2;
  const oz = -z0 + 2;
  const bp = emptyBlueprint(x1 - x0 + 4, z1 - z0 + 4);

  const channels = new Map<number, number[]>();
  for (const e of f.entities) {
    if (e.type !== 0 || !e.building) continue;
    const id = BUILDING.get(e.id);
    const def = id ? ds.machines.get(id) : undefined;
    if (!id || !def) {
      skipped.add(id ?? `#${e.id}`);
      continue;
    }
    const b = e.building;
    const rot = (((b.rotation % 360) + 360) % 360) as Facing;
    const r = addMachine(bp, ds, {}, id, e.x + ox, e.y + oz, rot);
    if (!r.ok || r.uid === undefined) {
      failed.push(`${def.name}: ${r.reason ?? tr('không đặt được')}`);
      continue;
    }
    const uid = r.uid;
    const m = bp.machines.find((v) => v.uid === uid)!;
    if (def.modes && b.mode === 1) setMode(bp, ds, uid, 'B');
    const recipes = b.recipeIds.map((n) => RECIPE.get(n)).filter((x): x is string => !!x && ds.recipes.has(x));
    if (recipes[0]) setRecipe(bp, ds, uid, recipes[0]);
    for (const rid of recipes.slice(1)) toggleNotedRecipe(bp, ds, uid, rid);
    // danh sách cổng theo thứ tự EnKAD: cổng ra trước, rồi cổng vào (đã lọc theo chế độ)
    const ports = activePorts(def, m.mode);
    const order: PortKey[] = [
      ...ports.filter((p) => p.dir === 'out').map((p) => `out${p.index}`),
      ...ports.filter((p) => p.dir === 'in').map((p) => `in${p.index}`),
    ];
    const role = roleOf(def);
    for (const pi of b.portItems) {
      const item = ITEM.get(pi.itemId);
      const key = order[pi.portIndex];
      if (!item || !ds.items.has(item)) {
        if (item) skipped.add(item);
        continue;
      }
      if (def.type === 'LogConditioner' || def.type === 'LogPipeConditioner') setFilterItem(bp, ds, uid, item);
      else if (role === 'depotOut') setDepotItem(bp, uid, item);
      else if (key && (def.type === 'Hub' || def.type === 'SubHub' || role === 'udpipeOut')) setOutletItem(bp, ds, uid, key, item);
      else if (key) m.binding = { ...m.binding, [key]: item };
    }
    if (role === 'udpipeOut' && b.infinite) m.infinite = true;
    if (def.type === 'LogPipeConditioner' && b.value > 0) {
      const rate = b.value / 2;
      if ((FILTER_RATES as readonly number[]).includes(rate)) setFilterRate(bp, ds, uid, rate);
    }
    if (def.pairable) channels.set(b.channel, [...(channels.get(b.channel) ?? []), uid]);
  }
  // ống ngầm: đầu vào và đầu ra cùng kênh thì ghép cặp
  for (const list of channels.values()) {
    const ins = list.filter((u) => roleOf(ds.machines.get(bp.machines.find((v) => v.uid === u)!.machineId)!) === 'udpipeIn');
    const outs = list.filter((u) => !ins.includes(u));
    if (ins[0] !== undefined && outs[0] !== undefined) setPairTarget(bp, ds, ins[0], outs[0]);
  }

  const taken = new Set(bp.belts.map((t) => `${t.kind}:${cellKey(t)}`));
  for (const e of f.entities) {
    if (e.type === 0 || !e.points) continue;
    const kind = e.id === BELT_ID ? 'belt' : e.id === PIPE_ID ? 'pipe' : null;
    if (!kind) continue;
    const group = bp.nextUid++;
    for (const t of pathTiles({ ...e, x: e.x + ox, y: e.y + oz }, kind, group)) {
      const k = `${kind}:${cellKey(t)}`;
      if (taken.has(k)) continue;
      taken.add(k);
      bp.belts.push(t);
    }
  }

  // dời về gốc (0,0) như module của thư viện
  let mx = Infinity;
  let mz = Infinity;
  for (const m of bp.machines) {
    mx = Math.min(mx, m.x);
    mz = Math.min(mz, m.z);
  }
  for (const t of bp.belts) {
    mx = Math.min(mx, t.x);
    mz = Math.min(mz, t.z);
  }
  if (mx !== Infinity) {
    for (const m of bp.machines) {
      m.x -= mx;
      m.z -= mz;
    }
    for (const t of bp.belts) {
      t.x -= mx;
      t.z -= mz;
    }
  }
  return { pieces: { machines: bp.machines, tiles: bp.belts }, skipped: [...skipped], failed };
}

/** Máy chủ của mã bản vẽ trong game — đúng ba lựa chọn của EnKAD. */
export const EFBP_SERVERS = [
  { id: 'euandus', label: 'EU & US' },
  { id: 'asiapacific', label: 'Asia-Pacific' },
  { id: 'beyondcn', label: 'CN' },
] as const;

/** Lấy mã `EFO0…` ra khỏi chữ dán vào (có thể kèm chữ khác), như EnKAD. */
export const extractCode = (text: string): string | null => text.match(/EFO?0[a-zA-Z0-9]+/)?.[0] ?? null;

/** Đang chạy trong app desktop Tauri (`src-tauri/`). */
const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Tra mã bản vẽ qua lệnh Rust `efbp` của app Tauri — trả về dạng giống `Response` để dùng chung đoạn xử lý lỗi. */
async function tauriEfbp(code: string, server: string): Promise<{ ok: boolean; status: number; statusText: string; text(): Promise<string> }> {
  const { invoke } = await import('@tauri-apps/api/core');
  const r = await invoke<{ status: number; body: string }>('efbp', { code, server });
  return { ok: r.status >= 200 && r.status < 300, status: r.status, statusText: '', text: () => Promise.resolve(r.body) };
}

/**
 * App Android (Capacitor, người dùng 2026-10-05): không có proxy Vite ⇒ gọi thẳng EnKAD bằng HTTP gốc của Android
 * (plugin `CapacitorHttp` có sẵn trong Capacitor — không đi qua WebView nên không vướng CORS).
 */
async function nativeEfbp(code: string, server: string): Promise<{ ok: boolean; status: number; statusText: string; text(): Promise<string> }> {
  const http = nativePlugin<{ request(o: { url: string; method: string; responseType?: string }): Promise<{ status: number; data: unknown }> }>('CapacitorHttp')!;
  const url = `https://beta.enka.network/endfield/aic/api/efbp?${new URLSearchParams({ code, server })}`;
  const r = await http.request({ url, method: 'GET', responseType: 'text' });
  const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, statusText: '', text: () => Promise.resolve(body) };
}

/**
 * Tra mã bản vẽ của game qua API của EnKAD. EnKAD không mở CORS nên đi qua proxy `api/efbp` của
 * Vite (`vite.config.ts`, cả `dev` lẫn `preview`); bản `dist/` chạy trên host tĩnh khác thì không có
 * proxy ⇒ dán thẳng chuỗi bản vẽ (blob) vào ô nhập.
 * Trong app desktop (Tauri, `src-tauri/`) không có proxy Vite ⇒ gọi lệnh Rust `efbp` (tự tải từ EnKAD, không vướng CORS).
 */
export async function fetchBlueprintCode(code: string, server: string): Promise<string> {
  const res = isTauri()
    ? await tauriEfbp(code, server)
    : isNativeApp()
      ? await nativeEfbp(code, server)
      : await fetch(`api/efbp?${new URLSearchParams({ code, server })}`);
  const text = await res.text();
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (JSON.parse(text) as { message?: string }).message ?? msg;
    } catch {
      /* không phải JSON */
    }
    throw new Error(res.status === 404 && !msg ? tr('Không tìm thấy bản vẽ') : msg || tr('Lỗi {0}', res.status));
  }
  return text.trim();
}
