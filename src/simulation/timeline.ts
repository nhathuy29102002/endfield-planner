/**
 * **Simulation — thanh thời gian** (giai đoạn 3, người dùng 2026-10-03; `SIMULATION.md` §1 mục 8: điều khiển như video,
 * **kéo lùi** về bất kỳ lúc nào). Lần 2 (người dùng 2026-10-03): **tính sẵn cả 24 giờ** ở nền (worker, `simWorker.ts`)
 * để tua tới bất kỳ lúc nào trong 24 giờ; nhiều map của một nhóm tab chạy chung (`world.ts`).
 *
 * - Cứ `SNAP_EVERY` giây mô phỏng có một **ảnh chụp trạng thái** cả nhóm (nén thành chuỗi, `encodeState`). Về lúc `t` =
 *   dựng lại từ ảnh chụp gần nhất trước `t` rồi chạy nốt theo lưới (≤ `SNAP_EVERY` giây — vài mili giây).
 * - Cứ `MARK_EVERY` giây có một **mốc số liệu** (tổng làm ra / nạp vào kho tổng của cả nhóm) cho biểu đồ và bảng tổng hợp.
 * - Bản đang phát trên màn hình và bản tính sẵn bước **cùng một lưới** (`GRID`) nên trùng khít.
 * - **Sửa map / xoá ô của máy** lúc `t`: dựng lại thế giới trên map mới, giữ những gì đang chạy; bỏ mọi ảnh chụp / mốc
 *   sau `t`, chụp thêm một ảnh đúng lúc `t`, rồi tính lại từ `t` tới 24 giờ. Kéo lùi về **trước** lúc sửa thì trạng thái
 *   cũ hiện trên **map hiện tại** (map không lùi theo — muốn lùi map dùng Hoàn tác) — *suy luận*, xem `SIMULATION.md`.
 */
import type { Dataset, RecipeDef } from '../model/types';
import type { SimItem, SimOptions, SimTotals } from './engine';
import { MAX_SECONDS } from './params';
import { GRID, createWorld, type SimWorld, type WorldMap, type WorldState } from './world';

/** Giây mô phỏng giữa hai ảnh chụp trạng thái. */
export const SNAP_EVERY = 120;
/** Giây mô phỏng giữa hai mốc số liệu (biểu đồ, bảng tổng hợp). */
export const MARK_EVERY = 10;
const EPS = 1e-6;

// ------------------------------------------------------------------ nén / giải nén trạng thái
/**
 * Mã hoá một giá trị trạng thái thành dạng JSON được: `Map` ⇒ `{$m}`, `Set` ⇒ `{$s}`, công thức ⇒ `{$r: id}` (giữ đúng
 * đối tượng công thức của dữ liệu khi giải nén — bộ máy so sánh công thức theo tham chiếu), số vô cực ⇒ `{$n}`, đối
 * tượng thường giữ nguyên (khoá của trạng thái không bao giờ bắt đầu bằng `$`). Hàng trên một tuyến (phần lớn dung
 * lượng) ⇒ `{$q: {s: [mã món], v: [chỉ số, ready, entered, …]}}`.
 */
function enc(v: unknown): unknown {
  if (v === null || v === undefined || typeof v === 'string' || typeof v === 'boolean') return v ?? null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
  if (v instanceof Map) return { $m: [...v].map(([k, x]) => [enc(k), enc(x)]) };
  if (v instanceof Set) return { $s: [...v].map(enc) };
  if (Array.isArray(v)) return v.map(enc);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.id === 'string' && Array.isArray(o.ingredients) && Array.isArray(o.outcomes)) return { $r: o.id };
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = k === 'items' && Array.isArray(x) && isItems(x) ? encItems(x) : enc(x);
    return out;
  }
  return null;
}

/** Mảng hàng trên tuyến (`SimItem[]`)? */
const isItems = (a: unknown[]): a is SimItem[] => a.length > 0 && typeof a[0] === 'object' && a[0] !== null && 'itemId' in a[0] && 'ready' in a[0];

function encItems(items: SimItem[]): unknown {
  const ids: string[] = [];
  const v: number[] = [];
  for (const it of items) {
    let i = ids.indexOf(it.itemId);
    if (i < 0) i = ids.push(it.itemId) - 1;
    v.push(i, it.ready, it.entered);
  }
  return { $q: { s: ids, v } };
}

function dec(v: unknown, recipes: Map<string, RecipeDef>): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => dec(x, recipes));
  const o = v as Record<string, unknown>;
  if ('$n' in o) return Number(o.$n);
  if ('$m' in o) return new Map((o.$m as [unknown, unknown][]).map(([k, x]) => [dec(k, recipes), dec(x, recipes)]));
  if ('$s' in o) return new Set((o.$s as unknown[]).map((x) => dec(x, recipes)));
  if ('$r' in o) return recipes.get(o.$r as string) ?? null;
  if ('$q' in o) {
    const { s, v: flat } = o.$q as { s: string[]; v: number[] };
    const items: SimItem[] = [];
    for (let i = 0; i < flat.length; i += 3) items.push({ itemId: s[flat[i]!]!, ready: flat[i + 1]!, entered: flat[i + 2]! });
    return items;
  }
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(o)) out[k] = dec(x, recipes);
  return out;
}

/** Nén trạng thái (một map hoặc cả nhóm) thành chuỗi — bản sao độc lập, chạy tiếp không làm đổi nó. */
export const encodeState = (s: unknown): string => JSON.stringify(enc(s));
/** Giải nén chuỗi của `encodeState` — mỗi lần ra một bản mới. */
export const decodeState = <T>(text: string, ds: Dataset): T => dec(JSON.parse(text), ds.recipes) as T;

// ------------------------------------------------------------------ mốc số liệu
/** Mốc số liệu: tổng cộng dồn của cả nhóm tới lúc `t`. */
export interface SimMark {
  t: number;
  produced: Record<string, number>;
  /** Nạp vào kho tổng. */
  depotIn: Record<string, number>;
  /** Rút ra khỏi kho tổng (bảng "sản lượng thâm hụt" = nạp vào − rút ra). */
  depotOut: Record<string, number>;
}
export type MarkKey = 'produced' | 'depotIn' | 'depotOut';

export const markOf = (t: number, totals: SimTotals): SimMark => ({
  t,
  produced: Object.fromEntries(totals.produced),
  depotIn: Object.fromEntries(totals.depotIn),
  depotOut: Object.fromEntries(totals.depotOut),
});

/** Mốc lúc `t` (nội suy tuyến tính giữa hai mốc kề nhau; ngoài khoảng đã có ⇒ mốc gần nhất). */
function valueAt(marks: SimMark[], t: number, key: MarkKey, item: string): number {
  if (marks.length === 0) return 0;
  const i = Math.max(0, Math.min(marks.length - 1, Math.floor(t / MARK_EVERY + EPS)));
  const a = marks[i]!;
  const b = marks[i + 1];
  const va = a[key][item] ?? 0;
  if (!b || t <= a.t) return va;
  return va + (((b[key][item] ?? 0) - va) * (t - a.t)) / (b.t - a.t);
}

/**
 * Trung bình **mỗi phút** của món `item` trong khoảng [t1, t2] (bảng tổng hợp: "30 phút tới", "N giờ tới"). Khoảng vượt
 * quá phần đã tính thì cắt tại đó (`span` = số giây thật sự đo được).
 */
export function rateBetween(marks: SimMark[], t1: number, t2: number, key: MarkKey, item: string): { rate: number; span: number } {
  const last = marks[marks.length - 1]?.t ?? 0;
  const b = Math.min(t2, last);
  const span = b - t1;
  if (span <= EPS) return { rate: 0, span: 0 };
  return { rate: ((valueAt(marks, b, key, item) - valueAt(marks, t1, key, item)) / span) * 60, span };
}

/**
 * Sản lượng mỗi phút theo thời gian (biểu đồ) trong [0, `until`]: mỗi điểm = trung bình trong cửa sổ `window` giây
 * kết thúc tại đó. Trước khi đủ một cửa sổ thì chia theo thời gian đã có.
 */
export function rateSeries(marks: SimMark[], item: string, window = 60, key: MarkKey = 'produced', until = Infinity, every = MARK_EVERY): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  const end = Math.min(until, marks[marks.length - 1]?.t ?? 0);
  const stepT = Math.max(MARK_EVERY, Math.round(every / MARK_EVERY) * MARK_EVERY);
  for (let t = stepT; t <= end + EPS; t += stepT) {
    const a = Math.max(0, t - window);
    const span = t - a;
    out.push({ t, v: ((valueAt(marks, t, key, item) - valueAt(marks, a, key, item)) / span) * 60 });
  }
  return out;
}

// ------------------------------------------------------------------ tính sẵn (chạy trong worker, hoặc thẳng trong test)
export interface JobRequest {
  type: 'run';
  job: number;
  maps: { key: string; bp: WorldMap['bp'] }[];
  opts: Pick<SimOptions, 'infiniteDepot' | 'depotCapacity' | 'depotGen'>;
  /** Trạng thái bắt đầu (đã nén); `null` = từ đầu, mọi máy rỗng. */
  from: string | null;
  /** Tính tới lúc nào (giây). */
  until: number;
}

export interface JobChunk {
  type: 'chunk';
  job: number;
  snaps: { t: number; text: string }[];
  marks: SimMark[];
  /** Đã tính tới lúc này. */
  computed: number;
  done: boolean;
}

/**
 * Tính sẵn từ trạng thái `req.from` tới `req.until`: ảnh chụp mỗi `SNAP_EVERY` giây, mốc số liệu mỗi `MARK_EVERY` giây,
 * gửi về từng đợt (`post`) — mỗi đợt ~`batch` giây mô phỏng.
 */
export function runJob(req: JobRequest, ds: Dataset, post: (c: JobChunk) => void, batch = 600): void {
  const prev = req.from ? decodeState<WorldState>(req.from, ds) : undefined;
  const world = createWorld(
    req.maps.map((m) => ({ key: m.key, bp: m.bp })),
    ds,
    req.opts,
    prev,
  );
  let snaps: JobChunk['snaps'] = [];
  let marks: SimMark[] = [];
  // mốc lúc bắt đầu (từ đầu: t = 0)
  if (!prev) marks.push(markOf(0, world.totals()));
  let lastPost = world.now;
  const until = Math.min(req.until, MAX_SECONDS);
  while (world.now < until - EPS) {
    world.stepGrid();
    const t = world.now;
    if (Math.abs(t / MARK_EVERY - Math.round(t / MARK_EVERY)) < EPS) marks.push(markOf(Math.round(t / MARK_EVERY) * MARK_EVERY, world.totals()));
    if (Math.abs(t / SNAP_EVERY - Math.round(t / SNAP_EVERY)) < EPS) snaps.push({ t: Math.round(t / SNAP_EVERY) * SNAP_EVERY, text: encodeState(world.state()) });
    if (t - lastPost >= batch - EPS || t >= until - EPS) {
      post({ type: 'chunk', job: req.job, snaps, marks, computed: t, done: t >= until - EPS });
      snaps = [];
      marks = [];
      lastPost = t;
    }
  }
  if (lastPost < world.now || world.now >= until - EPS) {
    if (snaps.length || marks.length) post({ type: 'chunk', job: req.job, snaps, marks, computed: world.now, done: true });
  }
}

// ------------------------------------------------------------------ dòng thời gian của một phiên mô phỏng
/** Bắt đầu một việc tính sẵn; trả về hàm huỷ. Trình duyệt: worker; test: chạy thẳng. */
export type JobSpawner = (req: JobRequest, onChunk: (c: JobChunk) => void) => () => void;

export class SimTimeline {
  world: SimWorld;
  /** Ảnh chụp trạng thái, theo thời gian tăng dần. */
  readonly snaps: { t: number; text: string }[] = [];
  /** Mốc số liệu: `marks[i].t = i × MARK_EVERY`. */
  readonly marks: SimMark[] = [];
  /** Đã tính sẵn tới lúc này (giây). */
  computed = 0;
  /** Phần lẻ dưới một bước lưới — để vẽ mượt giữa hai bước (`view`). */
  private carry = 0;
  private job = 0;
  private cancel: (() => void) | null = null;

  constructor(
    private maps: () => WorldMap[],
    private ds: Dataset,
    private opts: SimOptions,
    private spawn: JobSpawner,
  ) {
    this.world = createWorld(maps(), ds, opts);
    this.begin();
  }

  get now(): number {
    return this.world.now;
  }

  /** Lúc đang hiện trên màn hình (giữa hai bước lưới). */
  get view(): number {
    return this.world.now + this.carry;
  }

  private begin(): void {
    this.snaps.length = 0;
    this.marks.length = 0;
    this.snaps.push({ t: this.world.now, text: encodeState(this.world.state()) });
    this.marks.push(markOf(this.world.now, this.world.totals()));
    this.computed = this.world.now;
    this.launch();
  }

  /** Tính lại từ lúc hiện tại tới 24 giờ (huỷ việc đang tính dở). */
  private launch(): void {
    this.cancel?.();
    const job = ++this.job;
    const from = this.snaps[this.snaps.length - 1]!;
    this.cancel = this.spawn(
      { type: 'run', job, maps: this.maps().map((m) => ({ key: m.key, bp: m.bp })), opts: { infiniteDepot: this.opts.infiniteDepot, depotCapacity: this.opts.depotCapacity, depotGen: this.opts.depotGen }, from: from.text, until: MAX_SECONDS },
      (c) => {
        if (c.job !== this.job) return;
        for (const s of c.snaps) if (s.t > (this.snaps[this.snaps.length - 1]?.t ?? -1) + EPS) this.snaps.push(s);
        for (const m of c.marks) if (m.t > (this.marks[this.marks.length - 1]?.t ?? -1) + EPS) this.marks.push(m);
        this.computed = Math.max(this.computed, c.computed);
      },
    );
  }

  /** Dừng mọi việc tính nền (thoát chế độ mô phỏng). */
  dispose(): void {
    this.cancel?.();
    this.cancel = null;
    this.job++;
  }

  /** Làm lại từ đầu (mọi máy rỗng) — `opts` mới khi đổi luật (vd. kho tổng vô hạn). */
  reset(opts?: SimOptions): void {
    if (opts) this.opts = opts;
    this.world = createWorld(this.maps(), this.ds, this.opts);
    this.carry = 0;
    this.begin();
  }

  /**
   * Phát tiếp `seconds` giây (theo lưới), không vượt `limit` và phần đã tính sẵn. Trả về `false` nếu phải đứng chờ
   * (chạm `limit` hoặc chờ tính).
   */
  play(seconds: number, limit = MAX_SECONDS): boolean {
    const cap = Math.min(limit, this.computed, MAX_SECONDS);
    const target = Math.min(this.view + seconds, cap);
    if (target <= this.world.now + EPS && this.view >= cap - EPS) {
      this.carry = Math.max(0, Math.min(this.carry, cap - this.world.now));
      return false;
    }
    this.world.advanceTo(target);
    this.carry = Math.max(0, Math.min(GRID - EPS, target - this.world.now));
    return true;
  }

  /** Về lúc `t` (trong phần đã tính). */
  seek(t: number): void {
    const to = Math.max(0, Math.min(this.computed, t));
    let i = this.snaps.length - 1;
    while (i > 0 && this.snaps[i]!.t > to + EPS) i--;
    const s = this.snaps[i]!;
    this.world = createWorld(this.maps(), this.ds, this.opts, decodeState<WorldState>(s.text, this.ds));
    this.world.advanceTo(to);
    this.carry = Math.max(0, Math.min(GRID - EPS, to - this.world.now));
  }

  /**
   * Map vừa đổi (đặt / xoá / sửa máy, hoàn tác…) hoặc trạng thái vừa bị sửa tay (`mutate`, vd. xoá ô của máy): dựng lại
   * thế giới trên map mới, giữ những gì đang chạy; bỏ phần đã tính **sau** lúc này, chụp lại lúc này, tính lại tới 24 giờ.
   */
  rebuild(mutate?: (w: SimWorld) => void): void {
    const now = this.world.now;
    this.world = createWorld(this.maps(), this.ds, this.opts, this.world.state());
    mutate?.(this.world);
    this.carry = 0;
    while (this.snaps.length > 1 && this.snaps[this.snaps.length - 1]!.t > now - EPS) this.snaps.pop();
    if (this.snaps.length === 1 && this.snaps[0]!.t > now - EPS) this.snaps.pop();
    while (this.marks.length > 1 && this.marks[this.marks.length - 1]!.t > now + EPS) this.marks.pop();
    this.snaps.push({ t: now, text: encodeState(this.world.state()) });
    this.computed = now;
    this.launch();
  }

  /** Đổi tuỳ chọn (vd. kho tổng tự sinh) **từ lúc này**: phần đã tính trước lúc này giữ nguyên, sau đó tính lại. */
  setOptions(opts: SimOptions): void {
    this.opts = opts;
    this.rebuild();
  }

  /** Dung lượng các ảnh chụp (ký tự). */
  size(): number {
    return this.snaps.reduce((a, s) => a + s.text.length, 0);
  }
}
