import { canSwitchOff } from '../model/switchOff';
import { GRASS_BASE, grassLayers, grassLevel, type GrassLayer } from './grassTex';
import type { TerrainKind } from '../grid/grid';
import { BUILD_MARGIN, envZonesOf, ghostCells, validatePlacement } from '../grid/grid';
import type { AppState } from '../editor/state';
import { DIRS, footprint, footprintCells, worldPorts, type WorldPort } from '../model/geometry';
import { roleOf } from '../model/roles';
import { auraRect } from '../model/env';
import type { BeltPlan } from '../editor/belts';
import { planGroup, planPieces, tileKeyOf } from '../editor/group';
import { machineAt, pairCandidates, placementGrid } from '../editor/ops';
import { busStatus } from '../model/bus';
import type { Cell, Dir4, Facing, MachineDef, PlacedMachine, PortKind } from '../model/types';
import type { MachineFlow } from '../sim/solver';
import { machineStatus, statusProduct, type MachineStatus } from './status';
import { Camera } from './camera';
import { IconCache, SPRITE_2D_SCALE } from './icons';
import { hasPortGlow, pipeOutColor, portGlowColor } from './portColors';
import { EMPTY_PIPE, FLUID_COLORS } from '../model/fluidColors';
import { buildNetwork } from '../model/network';
import type { SolveResult } from '../sim/solver';
import { tr } from '../i18n';

/**
 * Màu **nền bản vẽ** theo giao diện tối / sáng (người dùng 2026-10-02: chế độ sáng). Chỉ những gì vẽ thẳng lên
 * nền mới đổi; máy, băng chuyền, nhãn trên máy (nền tối riêng)… giữ nguyên ở cả hai chế độ. Đổi bằng
 * `setSceneTheme` (`src/ui/theme.ts`).
 */
/** Ô nhỏ hơn mức này (px) thì không vẽ dải sáng cổng — quá xa, không thấy, khỏi tốn công vẽ lại. */
const GLOW_MIN_CELL = 7;

const SCENE_DARK = {
  bg: '#12161c',
  gridMinor: '#1b212a',
  gridMajor: '#232c37',
  areaEdge: '#3d4c5e',
  /** dải nới quanh vùng xây: tô mờ + viền nét đứt */
  marginFill: 'rgba(255,255,255,0.035)',
  marginEdge: 'rgba(200,210,220,0.45)',
  /** Viền tầm cấp điện: nét đứt trắng chạy vòng (người dùng chốt 2026-09-29, bỏ lớp tô vàng). */
  powerDash: '#ffffff',
  hover: 'rgba(255,255,255,0.25)',
  /**
   * Màu viền nét đứt của vùng máy khuếch tán khí: xanh lơ = khí trơ (Ổn định), vàng = khí axit
   * (người dùng chốt 2026-09-29). Hai loại còn lại lấy màu gần với icon môi trường.
   */
  envDash: { Stable: '#4fd6ff', Acid: '#f2c230', Humidity: '#8fd3ff', Xiranite: '#9ed72a', None: '#c9d1d9' } as Record<string, string>,
};
/** Nền sáng: cùng ý nghĩa màu, đậm hơn để còn thấy trên nền trắng. */
const SCENE_LIGHT: typeof SCENE_DARK = {
  bg: '#eef1f4',
  gridMinor: '#dde2e8',
  gridMajor: '#c3cad3',
  areaEdge: '#8c959f',
  marginFill: 'rgba(0,0,0,0.035)',
  marginEdge: 'rgba(60,70,80,0.5)',
  powerDash: '#3b4148',
  hover: 'rgba(0,0,0,0.35)',
  envDash: { Stable: '#0598bc', Acid: '#b08800', Humidity: '#2f81f7', Xiranite: '#4d8a00', None: '#6e7781' },
};
/**
 * Ảnh xem trước lưu vào thư viện (người dùng 2026-10-02: ảnh lưu về từng dính màu nền của giao diện đang bật): nền
 * **trong suốt**, lưới / viền màu xám trung tính, viền vùng đậm như bản sáng ⇒ cùng một ảnh hợp cả nền tối lẫn sáng
 * (khung ảnh trong thư viện tô màu nền theo giao diện đang bật — `.bp-thumb`).
 */
export const SCENE_PREVIEW: typeof SCENE_DARK = {
  bg: 'transparent',
  gridMinor: 'rgba(128,138,150,0.16)',
  gridMajor: 'rgba(128,138,150,0.3)',
  areaEdge: 'rgba(128,138,150,0.65)',
  marginFill: 'rgba(128,138,150,0.06)',
  marginEdge: 'rgba(128,138,150,0.55)',
  powerDash: '#8b949e',
  hover: 'transparent',
  envDash: SCENE_LIGHT.envDash,
};
let SCENE = SCENE_DARK;
export function setSceneTheme(theme: 'dark' | 'light'): void {
  SCENE = theme === 'light' ? SCENE_LIGHT : SCENE_DARK;
}

const COLORS = {
  text: '#e6edf3',
  dim: '#8b98a8',
  role: {
    crafter: '#3c5a80',
    source: '#7a5a22',
    sink: '#2f5f43',
    envgen: '#5a3a70',
    router: '#4a4f57',
    depotIn: '#2c5566',
    depotOut: '#2c5566',
    passive: '#3a4149',
  } as Record<string, string>,
  stalled: '#a33a3a',
  partial: '#b8860b',
  selection: '#6ea8fe',
  ghostOk: 'rgba(110,168,254,0.45)',
  ghostBad: 'rgba(200,70,70,0.45)',
  portIn: '#5fb0ff',
  portOut: '#7ee08a',
  linkBad: '#e05555',
  activator: '#c77dff',
  /** Băng chuyền: một màu cam cho mọi tuyến, như trong game. */
  belt: '#e8912d',
  beltCasing: '#3a2c18',
  /** Ống: một màu xanh nước biển cho mọi tuyến. */
  pipe: '#3aa0e8',
  pipeCasing: '#16303f',
} as const;


/** Màu vùng phủ theo loại môi trường xúc tác. */
export const ENV_COLOR: Record<string, string> = {
  Stable: '#6ea8fe',
  Humidity: '#4fc3f7',
  Acid: '#9ccc65',
  Xiranite: '#ce93d8',
  None: '#8b98a8',
};

const TERRAIN_COLOR: Record<TerrainKind, string> = {
  mine: 'rgba(150,105,60,0.45)',
  crop: 'rgba(90,150,70,0.35)',
  water: 'rgba(60,120,190,0.40)',
  road: 'rgba(130,130,130,0.30)',
};

/** Màu theo item, suy từ chính id nên ổn định giữa các lần chạy. */
export function itemColor(itemId: string): string {
  let h = 0;
  for (let i = 0; i < itemId.length; i++) h = (h * 31 + itemId.charCodeAt(i)) | 0;
  return `hsl(${((h % 360) + 360) % 360} 65% 60%)`;
}

/** Độ mờ quầng sáng quanh ống. */
const PIPE_HALO_ALPHA = 0.16;

type BeltTileLike = { x: number; z: number; in: Dir4; out: Dir4 };

interface TileStyle {
  core: string;
  alpha: number;
  problem?: boolean;
  saturated?: boolean;
  casing?: string;
  /** Đang chọn / đang cầm: phủ xanh **đúng thân băng/ống**, không tô cả ô. */
  selected?: boolean;
  /** Màu mũi tên riêng (ô ống đầu tiên của máy hai-đầu-ống-ra). */
  arrow?: string;
  /** Chỉ vẽ quầng sáng (`halo`), chỉ vẽ thân (`body`), hay cả hai (mặc định). */
  part?: 'halo' | 'body' | 'all';
}

export interface HoverInfo {
  cell: Cell | null;
  port: WorldPort | null;
}

export class Renderer {
  /** Bảng màu nền riêng cho renderer này (ảnh xem trước); không đặt ⇒ theo giao diện đang bật. */
  scene: typeof SCENE_DARK | null = null;
  private get sc(): typeof SCENE_DARK {
    return this.scene ?? SCENE;
  }
  readonly camera = new Camera();
  hover: HoverInfo = { cell: null, port: null };
  /** Phương án đặt băng/ống đang xem trước: trắng nếu đặt được, đỏ nếu vướng. */
  preview: BeltPlan | null = null;
  /** Ô dưới con trỏ bắt đầu đặt băng được (trước khi bấm điểm đầu). */
  startHint: Cell | null = null;
  /** Góc trên-trái của máy đang preview (đặt mới / di chuyển / sao chép). */
  ghost: Cell | null = null;
  /** Ô đặt nhóm đang cầm (công cụ `group`): ô `anchor` của nhóm sẽ nằm ở đây. */
  groupTarget: Cell | null = null;
  /** Khung chọn vùng đang kéo, hai góc tính theo ô. */
  box: { a: Cell; b: Cell } | null = null;
  /** Hộp đang kéo: chọn thêm / bỏ chọn (chế độ hàng loạt, chuột phải). */
  boxMode: 'add' | 'remove' = 'add';
  /** Layer đang làm việc: tô đậm layer này, layer kia mờ đi. */
  activeLayer: 0 | 1 = 0;

  /** Bật/tắt vẽ biểu tượng; tắt thì về khối màu, nhanh hơn khi bản vẽ rất lớn. */
  showIcons = true;
  /** Bật/tắt biển tên trên thân máy. Lưu trong trình duyệt. */
  showLabels = readLabelSetting();

  /** Vẽ icon trạng thái máy (mất điện, ZZ, ⊘…). Ảnh xem trước bản vẽ thì tắt. */
  showStatus = true;

  /** Đầu ống / đầu băng đang vẽ bằng ngón tay (app Android, `ui/touchMap.ts`) — vẽ vòng sáng ở ô này. */
  pathHead: Cell | null = null;

  /** Nền bản vẽ (Cài đặt, người dùng 2026-10-05): `simple` = nền phẳng như trước, `grass` = nền cỏ tự vẽ (`grassTex.ts`). */
  ground: 'simple' | 'grass' = 'simple';
  /**
   * Con trỏ ô (Cài đặt): bật ⇒ ô dưới chuột có khung mờ (như trước 2026-10-05), tắt ⇒ không hiện gì. Lần 1 (2026-10-05)
   * bật là 4 góc vuông, tắt là khung mờ — người dùng đổi lại ngay sau đó. Mặc định **bật** để giữ cách cũ.
   */
  pointer = true;
  /** Ảnh nền cỏ (tải khi cần lần đầu) và pattern dựng từ chúng. */
  /** Nền cỏ = ảnh mặt đất trong game + mipmap (`grassTex.ts`), nạp lần đầu bật nền cỏ. */
  private grass: GrassLayer[] | null = null;

  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  /**
   * Lớp vẽ của chế độ Simulation (`ui/simMode.ts`): món trên băng (`belt`, sau lớp băng), thanh tiến độ máy (`machines`),
   * món trong ống (`pipe`, sau lớp ống). `null` = Map tĩnh như thường.
   */
  simLayer: ((what: 'belt' | 'pipe' | 'machines', ctx: CanvasRenderingContext2D) => void) | null = null;
  readonly icons: IconCache;

  /**
   * `icons` — dùng chung kho ảnh của renderer khác (ảnh xem trước bản vẽ vẽ ngay một lần,
   * không đợi tải ảnh lại được).
   */
  constructor(
    private canvas: HTMLCanvasElement,
    private state: AppState,
    icons?: IconCache,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(tr('Canvas 2D không khả dụng'));
    this.ctx = ctx;
    this.icons = icons ?? new IconCache(() => this.draw());
  }

  /**
   * Trả về `true` nếu bộ đệm canvas thực sự đổi kích thước.
   *
   * Gán `canvas.width` làm trình duyệt bố cục lại, mà ResizeObserver lại gọi vào
   * đây — không chặn thì thành vòng lặp vô tận và trang đứng hình.
   */
  resize(): boolean {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width * this.dpr);
    const h = Math.round(rect.height * this.dpr);
    if (w === this.canvas.width && h === this.canvas.height) return false;
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.camera.resizeView(w / this.dpr, h / this.dpr);
    return true;
  }

  /** Kích thước màn hình (px CSS). */
  get viewSize(): { w: number; h: number } {
    return { w: this.canvas.width / this.dpr, h: this.canvas.height / this.dpr };
  }

  /** Kích thước khung vẽ chưa xoay — mọi toạ độ vẽ và phép cắt ngoài màn hình dùng cái này. */
  private get frame(): { w: number; h: number } {
    const { w, h } = this.viewSize;
    this.camera.setView(w, h);
    return this.camera.frame;
  }

  /**
   * Vẽ `fn` quanh điểm `(cx, cy)` của khung nhưng **đứng thẳng trên màn hình** — chữ, icon
   * trạng thái không quay theo camera. Trong `fn`, trục đã về đúng chiều màn hình.
   */
  private upright(cx: number, cy: number, fn: () => void): void {
    // góc đang hiển thị (kể cả lúc đang xoay mượt) ⇒ chữ luôn đứng thẳng
    const angle = this.camera.angle;
    if (angle === 0) {
      fn();
      return;
    }
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-angle);
    ctx.translate(-cx, -cy);
    fn();
    ctx.restore();
  }

  /**
   * Phần nới thêm (px) quanh khung khi cắt bỏ thứ nằm ngoài màn hình: đang xoay mượt thì màn hình nhìn thấy
   * cả những góc ngoài khung chưa xoay ⇒ nới bằng nửa phần chênh giữa đường chéo và cạnh ngắn.
   */
  private get cullPad(): number {
    if (this.camera.spin === 0) return 0;
    const { w, h } = this.viewSize;
    return (Math.hypot(w, h) - Math.min(w, h)) / 2 + this.camera.cell;
  }

  /** Hộp `w × h` của khung, nhìn trên màn hình (quay lẻ lần thì đổi chỗ). */
  private screenBox(w: number, h: number): { w: number; h: number } {
    return this.camera.turns % 2 === 1 ? { w: h, h: w } : { w, h };
  }

  /**
   * Vừa khung theo **nội dung** khi bản vẽ đã có máy — nhìn cả khu 70×70 trống thì
   * mọi thứ bé như hạt vừng. Bản vẽ trống thì mới vừa cả khu.
   */
  fit(): void {
    const { w, h } = this.frame;
    const s = this.state;
    const cells: Cell[] = [];
    for (const m of s.bp.machines) {
      const def = s.ds.machines.get(m.machineId);
      if (def) cells.push(...footprintCells(m, def));
    }
    cells.push(...s.bp.belts);
    if (cells.length === 0) {
      this.camera.fit(s.bp.area.w, s.bp.area.d, w, h);
      return;
    }
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const c of cells) {
      minX = Math.min(minX, c.x);
      minZ = Math.min(minZ, c.z);
      maxX = Math.max(maxX, c.x);
      maxZ = Math.max(maxZ, c.z);
    }
    this.camera.fitBox({ x: minX, z: minZ, w: maxX - minX + 1, d: maxZ - minZ + 1 }, w, h);
  }

  draw(): void {
    const { ctx } = this;
    const { w, h } = this.viewSize;

    if (this.sc.bg === 'transparent') ctx.clearRect(0, 0, w, h);
    else {
      ctx.fillStyle = this.sc.bg;
      ctx.fillRect(0, 0, w, h);
    }

    // camera xoay: vẽ mọi thứ trong khung chưa xoay rồi quay cả khung quanh tâm màn hình. Đang xoay mượt
    // (`camera.spin`, người dùng 2026-09-30) thì góc là góc trung gian.
    const f = this.frame;
    const angle = this.camera.angle;
    ctx.save();
    if (angle !== 0) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(angle);
      ctx.translate(-f.w / 2, -f.h / 2);
    }
    this.drawScene();
    ctx.restore();
  }

  private drawScene(): void {
    const s = this.state;
    this.drawGrid();
    this.drawTerrain();
    this.drawPowerZones();
    this.drawEnvZones();
    this.drawPortGlows();

    // băng chuyền dưới, máy giữa, ống trên — đúng thứ tự cao độ thật
    this.drawBelts('belt');
    this.simLayer?.('belt', this.ctx);
    for (const m of s.bp.machines) this.drawMachine(m);
    this.flushPortArrows();
    this.simLayer?.('machines', this.ctx);
    this.drawBelts('pipe');
    this.simLayer?.('pipe', this.ctx);
    // Không vẽ dấu cổng (tròn/vuông) trên máy đã đặt nữa: hướng cổng giờ chỉ hiện bằng
    // mũi tên khi preview. Dấu cũ còn vẽ sai chỗ khi máy đang được nhấc đi.

    this.drawPairs();
    this.drawGhost();
    this.drawGroupGhost();
    this.drawBox();
    this.drawEraseHover();
    this.drawPairPick();
    this.drawPairPartner();
    this.drawLinkInProgress();
    this.drawHover();
  }

  // ------------------------------------------------------------------ lớp nền
  /**
   * **Nền cỏ** — ảnh mặt đất chụp trong game, lát liền mạch (`grassTex.ts`, người dùng 2026-10-06). Vân **gắn vào mặt
   * đất**: chu kỳ tính bằng ô, neo ở gốc bản đồ ⇒ kéo hay zoom thì cỏ đi / phóng đúng theo bản đồ như một vật thể 2D
   * đứng yên (2026-10-06: trước đây zoom mà vân đứng yên trên màn hình ⇒ trông như tấm nền giả phía sau). Mỗi lớp lấy
   * cấp mipmap hợp cỡ đang hiện ⇒ zoom xa vẫn chỉ vài chục lần `drawImage`, không nhấp nháy. Phủ cả khu vực và tràn ra
   * 10 ô, mép ngoài tối dần.
   */
  private drawGrass(area: { w: number; d: number }): void {
    const { ctx, camera } = this;
    this.grass ??= grassLayers(() => this.draw());
    const M = 10;
    const a = camera.toScreen({ x: -M, z: -M });
    const b = camera.toScreen({ x: area.w + M, z: area.d + M });
    const o = camera.toScreen({ x: 0, z: 0 });
    ctx.save();
    ctx.fillStyle = GRASS_BASE;
    ctx.fillRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
    // chỉ lát phần nhìn thấy: khung (nới khi đang xoay) giao với khu vực
    const { w: fw, h: fh } = this.frame;
    const pad = this.cullPad;
    const vx0 = Math.max(a.sx, -pad);
    const vy0 = Math.max(a.sy, -pad);
    const vx1 = Math.min(b.sx, fw + pad);
    const vy1 = Math.min(b.sy, fh + pad);
    if (vx1 > vx0 && vy1 > vy0) {
      ctx.beginPath();
      ctx.rect(vx0, vy0, vx1 - vx0, vy1 - vy0);
      ctx.clip();
      for (const L of this.grass) {
        const p = L.period * camera.cell; // px màn hình mỗi chu kỳ
        const lv = grassLevel(L, p * this.dpr);
        if (!lv) continue;
        const T = lv.reps * p; // cỡ tấm trên màn hình
        const i0 = Math.floor((vx0 - o.sx) / T);
        const j0 = Math.floor((vy0 - o.sy) / T);
        for (let j = j0; o.sy + j * T < vy1; j++)
          for (let i = i0; o.sx + i * T < vx1; i++) ctx.drawImage(lv.canvas, o.sx + i * T, o.sy + j * T, T, T);
      }
      ctx.restore();
      ctx.save();
    }
    // mép ngoài tối dần về màu nền (như `box-shadow: inset … #000` của EnKAD)
    const fade = 8 * camera.cell;
    const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number): void => {
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, this.sc.bg === 'transparent' ? 'rgba(0,0,0,0)' : this.sc.bg);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(rx, ry, rw, rh);
    };
    const W = b.sx - a.sx;
    const H = b.sy - a.sy;
    edge(a.sx, 0, a.sx + fade, 0, a.sx, a.sy, fade, H);
    edge(b.sx, 0, b.sx - fade, 0, b.sx - fade, a.sy, fade, H);
    edge(0, a.sy, 0, a.sy + fade, a.sx, a.sy, W, fade);
    edge(0, b.sy, 0, b.sy - fade, a.sx, b.sy - fade, W, fade);
    ctx.restore();
  }

  /**
   * Lưới trên nền cỏ = **dấu cộng nhỏ ở mỗi góc ô** như EnKAD (`.grid`: hai vệt elip trắng `#fff6`, bán kính 0,2 × 0,05
   * ô, đặt ở góc ô, cả lớp độ đậm 0,7) — không kẻ đường như nền đơn giản.
   */
  private drawGrassGrid(area: { w: number; d: number }): void {
    const { ctx, camera } = this;
    const { w, h } = this.frame;
    const c = camera.cell;
    const pad = this.cullPad;
    const padCells = Math.ceil(pad / c);
    const M = BUILD_MARGIN;
    const x0 = Math.max(-M, Math.floor(camera.x) - padCells);
    const z0 = Math.max(-M, Math.floor(camera.z) - padCells);
    const x1 = Math.min(area.w + M, Math.floor(camera.x) + Math.ceil(w / c) + 1 + padCells);
    const z1 = Math.min(area.d + M, Math.floor(camera.z) + Math.ceil(h / c) + 1 + padCells);
    const arm = c * 0.12;
    const thick = Math.max(1, c * 0.05);
    const o = camera.toScreen({ x: 0, z: 0 });
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    for (let gz = z0; gz <= z1; gz++)
      for (let gx = x0; gx <= x1; gx++) {
        const sx = o.sx + gx * c;
        const sy = o.sy + gz * c;
        ctx.rect(sx - arm, sy - thick / 2, arm * 2, thick);
        ctx.rect(sx - thick / 2, sy - arm, thick, arm * 2);
      }
    ctx.fill();
    ctx.restore();
  }

  private drawGrid(): void {
    const { ctx, camera } = this;
    const { w, h } = this.frame;
    const area = this.state.bp.area;
    const grass = this.ground === 'grass';
    if (grass) this.drawGrass(area);

    const pad = this.cullPad;
    if (grass && camera.cell >= 7) this.drawGrassGrid(area);
    else if (camera.cell >= 7) {
      const padCells = Math.ceil(pad / camera.cell);
      const x0 = Math.floor(camera.x) - padCells;
      const z0 = Math.floor(camera.z) - padCells;
      const cols = Math.ceil(w / camera.cell) + 1 + 2 * padCells;
      const rows = Math.ceil(h / camera.cell) + 1 + 2 * padCells;
      ctx.lineWidth = 1;
      const M = BUILD_MARGIN;
      for (let i = 0; i <= cols; i++) {
        const gx = x0 + i;
        if (gx < -M || gx > area.w + M) continue;
        const { sx } = camera.toScreen({ x: gx, z: 0 });
        ctx.strokeStyle = gx % 5 === 0 ? this.sc.gridMajor : this.sc.gridMinor;
        ctx.beginPath();
        ctx.moveTo(Math.round(sx) + 0.5, -pad);
        ctx.lineTo(Math.round(sx) + 0.5, h + pad);
        ctx.stroke();
      }
      for (let i = 0; i <= rows; i++) {
        const gz = z0 + i;
        if (gz < -M || gz > area.d + M) continue;
        const { sy } = camera.toScreen({ x: 0, z: gz });
        ctx.strokeStyle = gz % 5 === 0 ? this.sc.gridMajor : this.sc.gridMinor;
        ctx.beginPath();
        ctx.moveTo(-pad, Math.round(sy) + 0.5);
        ctx.lineTo(w + pad, Math.round(sy) + 0.5);
        ctx.stroke();
      }
    }

    const a = camera.toScreen({ x: 0, z: 0 });
    const b = camera.toScreen({ x: area.w, z: area.d });
    // viền nới BUILD_MARGIN ô quanh vùng xây: máy được thò ra, băng chuyền thì không — tô sọc mờ, viền nét đứt
    const core = this.state.bp.buildArea ?? { x: 0, z: 0, w: area.w, d: area.d };
    const oa = camera.toScreen({ x: Math.max(core.x - BUILD_MARGIN, -BUILD_MARGIN), z: Math.max(core.z - BUILD_MARGIN, -BUILD_MARGIN) });
    const ob = camera.toScreen({
      x: Math.min(core.x + core.w + BUILD_MARGIN, area.w + BUILD_MARGIN),
      z: Math.min(core.z + core.d + BUILD_MARGIN, area.d + BUILD_MARGIN),
    });
    const ca = camera.toScreen({ x: core.x, z: core.z });
    const cb = camera.toScreen({ x: core.x + core.w, z: core.z + core.d });
    ctx.save();
    ctx.fillStyle = this.sc.marginFill;
    ctx.beginPath();
    ctx.rect(oa.sx, oa.sy, ob.sx - oa.sx, ob.sy - oa.sy);
    ctx.rect(ca.sx, ca.sy, cb.sx - ca.sx, cb.sy - ca.sy);
    ctx.fill('evenodd');
    ctx.strokeStyle = this.sc.marginEdge;
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(oa.sx, oa.sy, ob.sx - oa.sx, ob.sy - oa.sy);
    ctx.restore();
    ctx.strokeStyle = this.sc.areaEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);

    // vùng xây của căn cứ (tab Base): ngoài vùng tối đi, viền vàng như EnKAD
    const build = this.state.bp.buildArea;
    if (build) {
      const p = camera.toScreen({ x: build.x, z: build.z });
      const q = camera.toScreen({ x: build.x + build.w, z: build.z + build.d });
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.rect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
      ctx.rect(p.sx, p.sy, q.sx - p.sx, q.sy - p.sy);
      ctx.fill('evenodd');
      ctx.strokeStyle = '#e8c547';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.sx, p.sy, q.sx - p.sx, q.sy - p.sy);
      ctx.restore();
    }
  }

  private drawTerrain(): void {
    const { ctx, camera } = this;
    for (const [key, kind] of Object.entries(this.state.terrain)) {
      const [xs, zs] = key.split(',');
      const cell = { x: Number(xs), z: Number(zs) };
      const { sx, sy } = camera.toScreen(cell);
      if (sx < -camera.cell || sy < -camera.cell) continue;
      ctx.fillStyle = TERRAIN_COLOR[kind];
      ctx.fillRect(sx, sy, camera.cell, camera.cell);
    }
  }

  /**
   * Tầm cấp điện của cột (7×7) và trụ (12×12).
   *
   * Vẽ nhạt hơn vùng môi trường và **không** vẽ viền đậm: vùng điện chồng nhau được,
   * máy chỉ cần chạm vào là đủ, nên viền không mang thông tin gì.
   */
  private drawPowerZones(): void {
    if (this.state.bp.enforcePower === false) return;
    const lifted = this.liftedUids();
    for (const z of this.state.result.env.powerZones) {
      // cột đang được nhấc đi: vùng của nó đi theo preview, không đứng lại chỗ cũ
      if (lifted.has(z.uid)) continue;
      this.strokeZone(z.rect, this.sc.powerDash, 0.55);
    }
  }

  /**
   * Viền vùng phủ dạng **nét đứt chạy vòng theo chiều kim đồng hồ** (người dùng chốt
   * 2026-09-29). `strokeRect` đi trên → phải → dưới → trái, tức là theo chiều kim đồng hồ trên
   * màn hình (xoay camera là phép quay, không lật, nên chiều vẫn giữ); lùi `lineDashOffset`
   * theo thời gian thì các vạch chạy xuôi theo đường đó.
   */
  private strokeZone(rect: { x: number; z: number; w: number; d: number }, color: string, alpha = 0.9): void {
    const { ctx, camera } = this;
    const a = camera.toScreen(rect);
    const w = rect.w * camera.cell;
    const d = rect.d * camera.cell;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -((performance.now() / 1000) * 22) % 14;
    ctx.strokeRect(a.sx + 0.5, a.sy + 0.5, w - 1, d - 1);
    ctx.restore();
  }

  /** Đang cầm máy / nhóm / bản vẽ theo con trỏ (đặt mới, di chuyển, sao chép, đặt bản vẽ). */
  private placing(): boolean {
    const k = this.state.tool.kind;
    return k === 'place' || k === 'group' || k === 'stamp';
  }

  /**
   * Sọc chéo trong hộp `(x, y, w, h)` vẽ bằng **nét** (cắt theo hộp). Trước đây là `fillRect` với `CanvasPattern`, nhưng
   * trên WebView Android mọi lần tô bằng pattern ép GPU vẽ xong cả khung **đồng bộ** ⇒ chọn một máy làm mỗi khung từ
   * ~1 ms lên ~24 ms (người dùng 2026-10-06: chọn máy trong khung nhìn là tụt nửa fps, chọn nhiều máy dưới 10 fps).
   */
  private stripeRect(x: number, y: number, w: number, h: number, gap: number, width: number, color: string): void {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.beginPath();
    // nét "/" neo theo gốc canvas như pattern cũ ⇒ sọc các máy kề nhau nối liền
    const k0 = Math.floor((x + y) / gap) * gap;
    for (let k = k0; k <= x + y + w + h; k += gap) {
      ctx.moveTo(k - y - h, y + h);
      ctx.lineTo(k - y, y);
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  /** Máy đang được nhấc lên (di chuyển một máy / cả nhóm) — vùng phủ cũ của chúng không vẽ. */
  private liftedUids(): Set<number> {
    const t = this.state.tool;
    if (t.kind === 'place' && t.mode === 'move' && t.sourceUid !== undefined) return new Set([t.sourceUid]);
    if (t.kind === 'group' && t.mode === 'move') return this.state.sel.machines;
    return new Set();
  }

  /** Có dải sáng cổng nào cần vẽ (Map thường, đủ gần) — xem `drawPortGlows`. */
  private glowsOn(): boolean {
    return this.camera.cell >= GLOW_MIN_CELL && this.state.bp.machines.some((m) => {
      const def = this.state.ds.machines.get(m.machineId);
      return !!def && hasPortGlow(def);
    });
  }

  /**
   * **Dải sáng nhấp nháy ở ô kề cổng** (người dùng 2026-10-05): cổng ra ống của Lò Phản Ứng / Lò Mở Rộng / Quả Cầu Phản
   * Ứng Khí / Máy Tinh Chế ⇒ đúng màu vàng / cam của cổng; cổng kích hoạt của mọi máy cần chất kích hoạt ⇒ xanh lá
   * (`portGlowColor`). Một dải mỏng (~ 30 % bề sâu ô, chừa hai đầu) sát cạnh máy, mờ dần ra ngoài, độ sáng nhấp nháy nhẹ.
   * Vẽ dưới băng / ống (ô đã có tuyến thì tuyến đè lên). Không vẽ khi quá xa hoặc máy đang được nhấc lên. Lần 2
   * (2026-10-05): vẽ **cả khi mô phỏng** (trước đó tắt) và thêm Máy Chuyển Hoá Khí Lỏng / Rắn.
   */
  private drawPortGlows(): void {
    const { ctx, camera } = this;
    const c = camera.cell;
    if (c < GLOW_MIN_CELL) return;
    const view = this.frame;
    const lifted = this.liftedUids();
    // nhấp nháy: chu kỳ 1,6 s, độ sáng 45 % → 100 %
    const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((performance.now() / 1600) * Math.PI * 2));
    const depth = c * 0.3;
    const margin = c * 0.12;
    ctx.save();
    for (const m of this.state.bp.machines) {
      if (lifted.has(m.uid)) continue;
      const def = this.state.ds.machines.get(m.machineId);
      if (!def || !hasPortGlow(def)) continue;
      for (const p of worldPorts(m, def)) {
        if (p.virtual) continue;
        const color = portGlowColor(def, p.key);
        if (!color) continue;
        const { sx, sy } = camera.toScreen(p.attach);
        if (sx + c < 0 || sy + c < 0 || sx > view.w || sy > view.h) continue;
        // cạnh chung với máy = phía ngược `outward`
        const o = p.outward;
        const ex = o.dx === 0 ? sx + margin : o.dx > 0 ? sx : sx + c - depth;
        const ey = o.dz === 0 ? sy + margin : o.dz > 0 ? sy : sy + c - depth;
        const ew = o.dx === 0 ? c - margin * 2 : depth;
        const eh = o.dz === 0 ? c - margin * 2 : depth;
        // dốc mờ: đậm sát máy, nhạt dần ra ngoài
        const x0 = o.dx > 0 ? ex : o.dx < 0 ? ex + ew : ex;
        const y0 = o.dz > 0 ? ey : o.dz < 0 ? ey + eh : ey;
        const g = ctx.createLinearGradient(x0, y0, x0 + o.dx * depth, y0 + o.dz * depth);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.8 * pulse;
        ctx.fillStyle = g;
        ctx.fillRect(ex, ey, ew, eh);
      }
    }
    ctx.restore();
  }

  /** Có vạch nét đứt nào đang hiện (vòng lặp khung hình phải vẽ lại liên tục để chúng chạy). */
  animating(): boolean {
    const s = this.state;
    if (this.glowsOn()) return true; // dải sáng cổng nhấp nháy
    if (s.result.env.powerZones.length > 0 && s.bp.enforcePower !== false) return true;
    if (s.bp.machines.some((m) => s.ds.machines.get(m.machineId)?.aura?.kind === 'env')) return true;
    const t = s.tool;
    if (t.kind === 'place') return !!s.ds.machines.get(t.machineId)?.aura;
    return t.kind === 'group' || t.kind === 'stamp';
  }

  /**
   * Preview vùng phủ của một cột điện / máy khuếch tán khí **ở chỗ sắp đặt** (người dùng chốt
   * 2026-09-29): viền nét đứt chạy vòng, và tô sáng những máy sẽ được hưởng —
   *  - cột/trụ điện: máy chỉ cần **chạm** vùng là có điện;
   *  - máy khuếch tán khí: máy phải nằm **trọn** trong vùng; màu theo khí máy gốc đang nạp
   *    (xanh lơ = trơ, vàng = axit; máy mới chưa nạp gì thì xám).
   */
  private drawAuraPreview(def: MachineDef, probe: PlacedMachine, sourceUid?: number): void {
    const s = this.state;
    const aura = def.aura;
    if (!aura) return;
    // cột điện: preview vùng bao **cả khi đang tắt hiện tầm điện** (người dùng chốt 2026-09-29)
    const rect = auraRect(probe, def);
    if (!rect) return;
    const env = aura.kind === 'env' ? (s.result.env.zones.find((z) => z.uid === sourceUid)?.env ?? 'None') : null;
    const color = aura.kind === 'power' ? this.sc.powerDash : this.sc.envDash[env ?? 'None']!;
    const inRect = (c: Cell): boolean => c.x >= rect.x && c.z >= rect.z && c.x < rect.x + rect.w && c.z < rect.z + rect.d;
    const lifted = this.liftedUids();
    const { ctx, camera } = this;
    for (const m of s.bp.machines) {
      if (lifted.has(m.uid) || m.uid === sourceUid) continue;
      const md = s.ds.machines.get(m.machineId);
      if (!md) continue;
      if (aura.kind === 'power' && (md.power <= 0 || md.aura?.kind === 'power')) continue;
      // môi trường chỉ có ý nghĩa với máy chế biến (máy chạy công thức)
      if (aura.kind === 'env' && roleOf(md) !== 'crafter') continue;
      const cells = footprintCells(m, md);
      const hit = aura.kind === 'power' ? cells.some(inRect) : cells.every(inRect);
      if (!hit) continue;
      const box = footprint(md, m.rot);
      const { sx, sy } = camera.toScreen(m);
      ctx.save();
      if (aura.kind === 'power') {
        // máy sẽ có điện: sọc chéo trắng (người dùng chốt 2026-09-29)
        this.stripeRect(sx, sy, box.w * camera.cell, box.d * camera.cell, 12, 2.5, 'rgba(255,255,255,0.8)');
      } else {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = color;
        ctx.fillRect(sx, sy, box.w * camera.cell, box.d * camera.cell);
      }
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + 1, sy + 1, box.w * camera.cell - 2, box.d * camera.cell - 2);
      ctx.restore();
    }
    this.strokeZone(rect, color, 1);
  }

  /**
   * Cặp ống ngầm: đường cong nối hai đầu, không đi qua lưới.
   *
   * Vẽ hẳn thành cung cong thay vì đường gấp khúc để không lẫn với tuyến băng/ống —
   * cặp này không chiếm ô nào cả.
   */
  private drawPairs(): void {
    const { ctx, camera } = this;
    const s = this.state;
    // tắt hiện vùng điện (nút ⚡) thì tắt luôn đường cong nối cặp ống ngầm — cặp vẫn nối, chỉ
    // không vẽ (người dùng yêu cầu 2026-09-28)
    if (s.bp.enforcePower === false) return;
    for (const m of s.bp.machines) {
      if (!m.pairTarget) continue;
      const def = s.ds.machines.get(m.machineId);
      if (!def || roleOf(def) !== 'udpipeIn') continue; // vẽ một lần cho mỗi cặp
      const other = s.bp.machines.find((o) => o.uid === m.pairTarget);
      const otherDef = other ? s.ds.machines.get(other.machineId) : undefined;
      if (!other || !otherDef) continue;

      const a = camera.toScreen({ x: m.x + def.size.w / 2, z: m.z + def.size.d / 2 });
      const b = camera.toScreen({ x: other.x + otherDef.size.w / 2, z: other.z + otherDef.size.d / 2 });
      const mid = { x: (a.sx + b.sx) / 2, y: (a.sy + b.sy) / 2 - Math.hypot(b.sx - a.sx, b.sy - a.sy) * 0.18 };

      ctx.save();
      ctx.strokeStyle = COLORS.activator;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1.5, camera.cell * 0.12);
      ctx.setLineDash([camera.cell * 0.45, camera.cell * 0.35]);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.quadraticCurveTo(mid.x, mid.y, b.sx, b.sy);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Vùng môi trường xúc tác 13×13 quanh máy tạo môi trường.
   *
   * Vẽ trước máy và chỉ tô rất nhạt: nó là *nền*, còn thứ người dùng cần đọc nhanh là
   * viền — máy phải nằm **trọn** trong viền thì mới được tính là ở trong môi trường.
   */
  private drawEnvZones(): void {
    const { ctx, camera } = this;
    const lifted = this.liftedUids();
    for (const m of this.state.bp.machines) {
      const def = this.state.ds.machines.get(m.machineId);
      if (def?.aura?.kind !== 'env') continue;
      if (lifted.has(m.uid)) continue; // đang nhấc đi: vùng đi theo preview
      const rect = auraRect(m, def);
      if (!rect) continue;
      const zone = this.state.result.env.zones.find((z) => z.uid === m.uid);
      const color = ENV_COLOR[zone?.env ?? 'None']!;
      const a = camera.toScreen(rect);
      const w = rect.w * camera.cell;
      const d = rect.d * camera.cell;
      ctx.save();
      ctx.globalAlpha = zone ? 0.1 : 0.05;
      ctx.fillStyle = color;
      ctx.fillRect(a.sx, a.sy, w, d);
      ctx.restore();
      // viền: nét đứt chạy vòng, xanh lơ = khí trơ, vàng = axit (người dùng chốt 2026-09-29)
      this.strokeZone(rect, this.sc.envDash[zone?.env ?? 'None']!, zone ? 0.9 : 0.45);
    }
  }

  // -------------------------------------------------------------------- máy
  /**
   * Một máy, vẽ theo lối nhìn từ trên xuống: bóng đổ, tấm đế có vát cạnh, hình máy,
   * và biển tên như trong game.
   *
   * Ưu tiên sprite trải kín đế nếu có file trong `public/img/sprites/`; không có thì
   * dùng ảnh biểu tượng của máy đặt giữa tấm đế. Nhờ vậy chỉ cần làm sprite cho vài
   * máy hay dùng, phần còn lại vẫn hiện tử tế.
   */
  private drawMachine(m: PlacedMachine): void {
    const { ctx, camera } = this;
    const def = this.state.ds.machines.get(m.machineId);
    if (!def) return;
    // máy đang được nhấc lên để di chuyển: không vẽ ở chỗ cũ, chỉ vẽ preview theo con trỏ
    const t = this.state.tool;
    if (t.kind === 'place' && t.mode === 'move' && t.sourceUid === m.uid) return;
    if (t.kind === 'group' && t.mode === 'move' && this.state.sel.machines.has(m.uid)) return;

    const box = footprint(def, m.rot);
    const { sx, sy } = camera.toScreen(m);
    const w = box.w * camera.cell;
    const h = box.d * camera.cell;
    const view = this.frame;
    const P = this.cullPad;
    if (sx + w < -P || sy + h < -P || sx > view.w + P || sy > view.h + P) return;

    const flow = this.state.result.machines.get(m.uid);
    const role = roleOf(def);
    const base = COLORS.role[role] ?? COLORS.role.passive!;
    const selected = this.state.sel.machines.has(m.uid);
    const inset = Math.min(1.5, camera.cell * 0.08);

    // Sprite vẽ ở hướng chưa quay rồi xoay quanh tâm đế, khớp bề rộng với đế chưa quay và
    // neo mép dưới — xem drawSprite. Sprite PNG có nền trong suốt: bóng đổ bám theo đúng
    // hình công trình, **không** vẽ khối tối vuông hay viền đen dưới nó (trước đây chính
    // khối đó làm phần trong suốt trông như nền đen). Không có sprite thì vẽ tấm đế.
    const sprite = this.drawSprite(def, m.rot, sx, sy, w, h, 1, camera.cell >= 8);
    if (!sprite) {
      // bóng đổ — thứ duy nhất tạo cảm giác khối trên nền phẳng
      if (camera.cell >= 8) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(sx + inset + 2, sy + inset + 2, w - inset * 2, h - inset * 2);
      }
      // tấm đế: dốc sáng từ góc trên-trái để mắt đọc ra mặt phẳng nghiêng
      const g = ctx.createLinearGradient(sx, sy, sx + w, sy + h);
      g.addColorStop(0, shade(base, 1.35));
      g.addColorStop(0.5, base);
      g.addColorStop(1, shade(base, 0.7));
      ctx.fillStyle = g;
      ctx.fillRect(sx + inset, sy + inset, w - inset * 2, h - inset * 2);

      if (camera.cell >= 10) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.beginPath();
        ctx.moveTo(sx + inset, sy + h - inset);
        ctx.lineTo(sx + inset, sy + inset);
        ctx.lineTo(sx + w - inset, sy + inset);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.moveTo(sx + w - inset, sy + inset);
        ctx.lineTo(sx + w - inset, sy + h - inset);
        ctx.lineTo(sx + inset, sy + h - inset);
        ctx.stroke();
      }

      const icon = this.showIcons ? this.icons.machine(this.state.ds, m.machineId) : undefined;
      if (icon && Math.min(w, h) >= 12) {
        // ảnh máy chiếm gần hết đế: đây mới là thứ người dùng nhận ra máy, không phải màu nền
        const size = Math.min(w, h) * 0.88;
        ctx.globalAlpha = 0.95;
        ctx.drawImage(icon, sx + (w - size) / 2, sy + (h - size) / 2, size, size);
        ctx.globalAlpha = 1;
      }
    }

    // dải hệ số chạy ở mép dưới: nhìn một phát biết cụm nào đang đói
    if (flow && role === 'crafter' && flow.recipeId) {
      const u = Math.max(0, Math.min(1, flow.utilization));
      const barH = Math.max(2, camera.cell * 0.12);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(sx + inset, sy + h - inset - barH, w - inset * 2, barH);
      ctx.fillStyle = u >= 0.999 ? '#3f8f5a' : u <= 0.001 ? COLORS.stalled : COLORS.partial;
      ctx.fillRect(sx + inset, sy + h - inset - barH, (w - inset * 2) * u, barH);
    }

    // máy người dùng đã tắt (Tab — 2026-10-06): phủ tối + biểu tượng nút nguồn, không coi là lỗi (không viền đỏ / icon)
    const off = m.off === true && canSwitchOff(def);
    // viền: tấm đế luôn có viền tối; sprite chỉ có viền khi máy có vấn đề (viền đỏ)
    if (!sprite || (flow?.bottleneck && !off)) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = flow?.bottleneck && !off ? COLORS.stalled : 'rgba(0,0,0,0.55)';
      ctx.strokeRect(sx + inset + 0.5, sy + inset + 0.5, w - inset * 2 - 1, h - inset * 2 - 1);
    }
    if (off) this.upright(sx + w / 2, sy + h / 2, () => this.drawOffOverlay(sx + inset, sy + inset, w - inset * 2, h - inset * 2));

    if (!selected && this.showStatus && !off)
      this.upright(sx + w / 2, sy + h / 2, () => this.drawStatusIcon(machineStatus(flow), flow, sx, sy, w, h));
    // đoạn tổng tuyến chưa nối về Cổng Tổng Tuyến: icon dây xích đứt màu vàng (người dùng 2026-10-02)
    if (this.deadBus().has(m.uid) && camera.cell >= 5) this.upright(sx + w / 2, sy + h / 2, () => this.drawBrokenChain(sx + w / 2, sy + h / 2, Math.min(w, h)));

    // Đang chọn: phủ xanh nước biển có vạch chéo, như trong game — kèm mũi tên hướng các cổng
    // vào/ra y như lúc di chuyển / sao chép (người dùng yêu cầu 2026-09-28)
    if (selected) this.drawSelectionOverlay(sx + inset, sy + inset, w - inset * 2, h - inset * 2, true);
    // Mũi tên cổng vào/ra: máy đang chọn, và **mọi máy trên map** khi đang đặt / di chuyển / sao
    // chép / đặt bản vẽ (người dùng yêu cầu 2026-09-29) — để thấy cổng nào sẽ khớp với máy đang cầm.
    // gom lại vẽ một lần sau cả lớp máy (`flushPortArrows`) — chọn vài trăm máy từng làm mỗi khung vẽ hàng nghìn mũi
    // tên riêng lẻ (người dùng 2026-10-05: chọn vùng nhiều máy bị lag)
    if ((selected || this.placing()) && camera.cell >= 8)
      for (const port of worldPorts(m, def))
        if (!port.virtual) this.arrowQueue.push({ cell: port.attach, flow: port.flow, kind: port.kind, color: pipeOutColor(def, port.key) ?? '#e6f7ff' });

    // vòng icon trên cửa ra của máy xuất hàng — vẽ sau lớp chọn để không bị phủ xanh
    this.drawOutletBadges(m, def, flow);

    // biển tên: nền tối, chữ sáng — đọc được trên mọi màu đế
    // van/cầu 1×1: không biển tên — chữ che kín hình, mà hình đã đủ nhận ra
    if (this.showLabels && camera.cell >= 13 && def.size.w * def.size.d > 1) {
      // camera xoay thì biển tên vẫn nằm ngang, ở mép **trên màn hình** của máy
      const cx = sx + w / 2;
      const cy = sy + h / 2;
      const sb = this.screenBox(w, h);
      this.upright(cx, cy, () => {
        const label = shortName(def) + (m.count > 1 ? ` ×${m.count}` : '');
        const fontSize = Math.min(12, Math.max(9, camera.cell * 0.45));
        ctx.font = `${fontSize}px system-ui, sans-serif`;
        const tw = Math.min(sb.w - 6, ctx.measureText(label).width + 8);
        const tx = cx - tw / 2;
        const ty = cy - sb.h / 2 + inset + 2;
        ctx.fillStyle = 'rgba(8,10,14,0.78)';
        ctx.fillRect(tx, ty, tw, fontSize + 4);
        ctx.save();
        ctx.beginPath();
        ctx.rect(tx, ty, tw, fontSize + 4);
        ctx.clip();
        ctx.fillStyle = COLORS.text;
        ctx.textBaseline = 'top';
        ctx.fillText(label, tx + 4, ty + 2);
        ctx.restore();
      });
    }
  }

  /**
   * Máy xuất hàng (Lõi Tự Động Hoá, Lõi Giao Thức Phụ, Cửa Xả Ống Dẫn, Ống Dẫn Dòng Ra, Máy Dỡ
   * Hàng Kho): mỗi cửa ra có một **vòng tròn chứa icon vật phẩm** nó đang nhả ra, nằm ngay trên
   * ô cổng — nhìn bản đồ là biết cửa nào ra món gì (người dùng yêu cầu 2026-09-28).
   */
  private drawOutletBadges(m: PlacedMachine, def: MachineDef, flow: MachineFlow | undefined): void {
    const { ctx, camera } = this;
    if (!this.showIcons || camera.cell < 10) return;
    const role = roleOf(def);
    const hub = def.type === 'Hub' || def.type === 'SubHub';
    // cảng kiểm soát đã chọn món lọc: vòng icon ngay trên van
    if ((def.type === 'LogConditioner' || def.type === 'LogPipeConditioner') && m.filterItem) {
      const icon = this.icons.item(this.state.ds, m.filterItem);
      const p = camera.toScreen(m);
      const cx = p.sx + camera.cell / 2;
      const cy = p.sy + camera.cell / 2;
      const r = camera.cell * 0.34;
      this.upright(cx, cy, () => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244,246,248,0.94)';
        ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.14);
        ctx.strokeStyle = '#e2c541';
        ctx.stroke();
        if (icon) ctx.drawImage(icon, cx - r * 0.75, cy - r * 0.75, r * 1.5, r * 1.5);
        ctx.restore();
      });
      return;
    }
    if (!hub && role !== 'depotOut' && role !== 'udpipeOut') return;
    for (const port of worldPorts(m, def)) {
      if (port.dir !== 'out' || port.virtual) continue;
      const itemId = hub
        ? (m.binding[port.key] ?? null)
        : role === 'depotOut'
          ? (m.depotItem ?? null)
          : m.infinite && m.source?.itemId
            ? m.source.itemId
            : (flow?.outputs[0]?.itemId ?? null);
      if (!itemId) continue;
      const icon = this.icons.item(this.state.ds, itemId);
      const p = camera.toScreen(port.cell);
      const cx = p.sx + camera.cell / 2;
      const cy = p.sy + camera.cell / 2;
      const r = camera.cell * 0.44;
      this.upright(cx, cy, () => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244,246,248,0.94)';
        ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.strokeStyle = port.kind === 'pipe' ? (pipeOutColor(def, port.key) ?? '#3aa0e8') : '#e8912d';
        ctx.stroke();
        if (icon) {
          const size = r * 1.5;
          ctx.drawImage(icon, cx - size / 2, cy - size / 2, size, size);
        }
        ctx.restore();
      });
    }
  }

  /**
   * Icon trạng thái ở giữa máy, theo đúng ký hiệu trong game:
   * - chưa nối điện: hai phích cắm rời nhau trong vòng cam;
   * - đã nối điện nhưng hệ thống sụp điện: cùng hình phích cắm, đỏ-trắng;
   * - đang sản xuất: vòng xanh, sản phẩm đầu ra ở giữa;
   * - ngủ (ZZ): vòng xám, sản phẩm ở giữa, chữ "ZZ" — không đủ đầu vào, vẫn ăn điện;
   * - kẹt (⊘): vòng đỏ, sản phẩm ở giữa, dấu cấm đỏ — đầu ra không thoát kịp.
   */
  /** Đoạn tổng tuyến chưa nối về cổng — tính lại khi bản vẽ đổi. */
  private deadBusMemo: { result: SolveResult; set: Set<number> } | null = null;
  private deadBus(): Set<number> {
    if (this.deadBusMemo?.result !== this.state.result)
      this.deadBusMemo = { result: this.state.result, set: busStatus(this.state.bp, this.state.ds).deadBus };
    return this.deadBusMemo.set;
  }

  /** Icon cảnh báo: hai mắt xích bị tách rời, nền tròn tối viền vàng. */
  private drawBrokenChain(cx: number, cy: number, size: number): void {
    const { ctx } = this;
    const r = Math.max(9, Math.min(22, size * 0.32));
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,15,20,0.85)';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.strokeStyle = '#f2c230';
    ctx.stroke();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    const lw = Math.max(1.6, r * 0.16);
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#f2c230';
    // hai mắt xích (hình viên thuốc) lệch nhau, khe hở ở giữa
    const link = (x: number): void => {
      const lw2 = r * 0.42;
      const lh = r * 0.26;
      ctx.beginPath();
      ctx.moveTo(x - lw2 / 2, -lh);
      ctx.lineTo(x + lw2 / 2, -lh);
      ctx.arc(x + lw2 / 2, 0, lh, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x - lw2 / 2, lh);
      ctx.arc(x - lw2 / 2, 0, lh, Math.PI / 2, (Math.PI * 3) / 2);
      ctx.stroke();
    };
    link(-r * 0.42);
    link(r * 0.42);
    // tia gãy ở khe
    ctx.beginPath();
    ctx.moveTo(-r * 0.06, -r * 0.55);
    ctx.lineTo(r * 0.06, -r * 0.38);
    ctx.moveTo(r * 0.06, r * 0.55);
    ctx.lineTo(-r * 0.06, r * 0.38);
    ctx.stroke();
    ctx.restore();
  }

  private drawStatusIcon(
    status: MachineStatus,
    flow: MachineFlow | undefined,
    sx: number,
    sy: number,
    w: number,
    h: number,
  ): void {
    if (status === 'normal' || this.camera.cell < 8) return;
    const { ctx } = this;
    const r = Math.max(7, Math.min(24, Math.min(w, h) * 0.2));
    const cx = sx + w / 2;
    const cy = sy + h / 2;
    const ring = {
      unpowered: '#f0a030',
      blackout: '#ffffff',
      working: '#7fd88a',
      partial: '#f2c230',
      idle: '#9aa6b4',
      blocked: '#ff5a5a',
    }[status];

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    // sụp điện: nền đỏ, viền + phích cắm trắng — khác hẳn "chưa nối điện" màu cam
    ctx.fillStyle = status === 'blackout' ? '#d32f2f' : 'rgba(12,15,20,0.82)';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.strokeStyle = ring;
    ctx.stroke();

    if (status === 'unpowered' || status === 'blackout') {
      // hai phích cắm quay đầu vào nhau nhưng chưa chạm: "không có điện"
      ctx.fillStyle = status === 'blackout' ? '#ffffff' : '#f0a030';
      const bw = r * 0.46;
      const bh = r * 0.5;
      const gap = r * 0.16;
      for (const side of [-1, 1]) {
        const bx = side < 0 ? cx - gap - bw : cx + gap;
        ctx.fillRect(bx, cy - bh / 2, bw, bh);
        const px = side < 0 ? bx + bw : bx - r * 0.2;
        ctx.fillRect(px, cy - bh * 0.32, r * 0.2, bh * 0.16);
        ctx.fillRect(px, cy + bh * 0.16, r * 0.2, bh * 0.16);
      }
      ctx.restore();
      return;
    }

    const product = flow ? statusProduct(flow) : undefined;
    const icon = product ? this.icons.item(this.state.ds, product) : undefined;
    if (icon) {
      const size = r * 1.45;
      ctx.globalAlpha = status === 'idle' ? 0.55 : 1;
      ctx.drawImage(icon, cx - size / 2, cy - size / 2, size, size);
      ctx.globalAlpha = 1;
    }

    if (status === 'idle') {
      // "ZZ" — máy đang ngủ
      ctx.font = `bold ${Math.round(r * 0.9)}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(8,10,14,0.9)';
      ctx.fillStyle = '#8fd0ff';
      const tx = cx + r * 0.1;
      const ty = cy + r * 0.35;
      ctx.strokeText('ZZ', tx, ty);
      ctx.fillText('ZZ', tx, ty);
    } else if (status === 'partial') {
      // dấu "!" vàng ở góc dưới-phải — máy chạy không hết công suất
      const br = r * 0.46;
      const bx = cx + r * 0.72;
      const by = cy + r * 0.72;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = '#f2c230';
      ctx.fill();
      ctx.lineWidth = Math.max(1, br * 0.18);
      ctx.strokeStyle = 'rgba(8,10,14,0.9)';
      ctx.stroke();
      ctx.fillStyle = '#1a1405';
      ctx.fillRect(bx - br * 0.13, by - br * 0.62, br * 0.26, br * 0.8);
      ctx.fillRect(bx - br * 0.13, by + br * 0.34, br * 0.26, br * 0.26);
    } else if (status === 'blocked') {
      // dấu cấm đỏ ở góc dưới-phải của vòng — sản phẩm kẹt trong máy
      const br = r * 0.46;
      const bx = cx + r * 0.72;
      const by = cy + r * 0.72;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, br * 0.3);
      ctx.strokeStyle = '#e53935';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx - br * 0.62, by + br * 0.62);
      ctx.lineTo(bx + br * 0.62, by - br * 0.62);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Một mũi tên cổng: `^` rỗng cho băng chuyền, tam giác đặc cho khí/lỏng. */
  /** Mũi tên cổng của máy đang chọn / mọi máy khi đang cầm máy — xếp hàng trong `drawMachine`, vẽ ở `flushPortArrows`. */
  private arrowQueue: { cell: Cell; flow: Dir4; kind: PortKind; color: string }[] = [];

  /**
   * Vẽ cả hàng mũi tên cổng **gom theo loại**: mọi mũi tên băng một đường (viền tối rồi nét trắng), mũi tên ống gom theo
   * màu — vài lệnh vẽ thay cho mỗi mũi tên một `save / restore` + `fill` + `stroke`. Hình y hệt `drawPortArrow`.
   */
  private flushPortArrows(): void {
    const q = this.arrowQueue;
    if (q.length === 0) return;
    this.arrowQueue = [];
    const { ctx, camera } = this;
    const c = camera.cell;
    const view = this.frame;
    const shape = (a: (typeof q)[number]): { l: { x: number; y: number }; tip: { x: number; y: number }; r: { x: number; y: number } } | null => {
      const { sx, sy } = camera.toScreen(a.cell);
      if (sx + c < 0 || sy + c < 0 || sx > view.w || sy > view.h) return null;
      const cx = sx + c / 2;
      const cy = sy + c / 2;
      const d = DIRS[a.flow]!;
      const tipLen = c * 0.16;
      const back = c * 0.12;
      const half = c * 0.34;
      return {
        tip: { x: cx + d.dx * tipLen, y: cy + d.dz * tipLen },
        l: { x: cx - d.dx * back - d.dz * half, y: cy - d.dz * back + d.dx * half },
        r: { x: cx - d.dx * back + d.dz * half, y: cy - d.dz * back - d.dx * half },
      };
    };
    ctx.save();
    // ống: tam giác đặc, gom theo màu
    const pipes = new Map<string, NonNullable<ReturnType<typeof shape>>[]>();
    const belts: NonNullable<ReturnType<typeof shape>>[] = [];
    for (const a of q) {
      const sh = shape(a);
      if (!sh) continue;
      if (a.kind === 'pipe') {
        const list = pipes.get(a.color);
        if (list) list.push(sh);
        else pipes.set(a.color, [sh]);
      } else belts.push(sh);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(8,20,30,0.8)';
    for (const [color, list] of pipes) {
      ctx.beginPath();
      for (const { l, tip, r } of list) {
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.lineTo(r.x, r.y);
        ctx.closePath();
      }
      ctx.fillStyle = color;
      ctx.fill();
      ctx.stroke();
    }
    // băng: chữ V, viền tối rồi nét trắng
    if (belts.length > 0) {
      ctx.beginPath();
      for (const { l, tip, r } of belts) {
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.lineTo(r.x, r.y);
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(8,10,14,0.7)';
      ctx.lineWidth = Math.max(3, c * 0.14);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.8, c * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPortArrow(cell: Cell, flow: Dir4, kind: PortKind, color = '#e6f7ff'): void {
    const { ctx, camera } = this;
    const c = camera.cell;
    const { sx, sy } = camera.toScreen(cell);
    const cx = sx + c / 2;
    const cy = sy + c / 2;
    const d = DIRS[flow]!;
    // dẹt và bè ngang: mũi nhô ra ít, hai cánh xoè rộng gần hết bề ngang ô
    const fwd = { x: d.dx, y: d.dz };
    const side = { x: -d.dz, y: d.dx };
    const tipLen = c * 0.16;
    const back = c * 0.12;
    const half = c * 0.34;
    const tip = { x: cx + fwd.x * tipLen, y: cy + fwd.y * tipLen };
    const l = { x: cx - fwd.x * back + side.x * half, y: cy - fwd.y * back + side.y * half };
    const r = { x: cx - fwd.x * back - side.x * half, y: cy - fwd.y * back - side.y * half };
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(r.x, r.y);
    if (kind === 'pipe') {
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.strokeStyle = 'rgba(8,20,30,0.8)';
      ctx.lineWidth = 1;
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(8,10,14,0.7)';
      ctx.lineWidth = Math.max(3, c * 0.14);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.8, c * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }


  /**
   * Lớp phủ xanh nước biển. `striped` = đang chọn (có vạch chéo); không vạch = preview.
   * Vạch chéo vẽ sẵn một lần thành pattern rồi dùng lại.
   */
  private drawSelectionOverlay(x: number, y: number, w: number, h: number, striped: boolean): void {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(56,196,255,0.38)';
    ctx.fillRect(x, y, w, h);
    if (striped) this.stripeRect(x, y, w, h, 14, 4, 'rgba(8,40,60,0.55)');
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#6fd6ff';
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.restore();
  }

  /** Sprite của máy tại khung (sx, sy, w, h) đã quay — dùng chung cho máy đã đặt và preview. */
  private drawSprite(
    def: MachineDef,
    rot: Facing,
    sx: number,
    sy: number,
    w: number,
    h: number,
    alpha = 1,
    shadow = false,
  ): boolean {
    // hình 2D khít đế (van/cầu) được ưu tiên: kéo đúng bằng đế, không neo mép dưới
    const flat = this.showIcons ? this.icons.sprite2d(def.id) : undefined;
    const sprite = flat ?? (this.showIcons ? this.icons.sprite(this.state.ds, def.id) : undefined);
    if (!sprite) return false;
    const { ctx, camera } = this;
    // hình 2D cắt từ ảnh game rộng hơn đế (vòng nắp thò ra ngoài ô) ⇒ phóng đúng tỉ lệ, vẫn canh giữa ô
    const k = flat ? SPRITE_2D_SCALE : 1;
    const baseW = def.size.w * camera.cell * k;
    const baseH = def.size.d * camera.cell * k;
    const sh = flat ? baseH : sprite.naturalHeight * (baseW / sprite.naturalWidth);
    // máy đã đặt, zoom đứng yên: chép hình vẽ sẵn (đã thu nhỏ + có bóng) — xem `cachedSprite`
    if (shadow && camera.cell === camera.targetCell && sprite.complete && sprite.naturalWidth > 0) {
      const c = this.cachedSprite(sprite, def.id, rot, baseW, baseH, sh);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(c.canvas, sx + w / 2 - c.ox, sy + h / 2 - c.oy, c.w, c.h);
      ctx.restore();
      return true;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    if (shadow) {
      // bóng theo kênh alpha của ảnh ⇒ đúng hình công trình, không thành khối vuông
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = Math.min(8, camera.cell * 0.25);
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    }
    ctx.translate(sx + w / 2, sy + h / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(sprite, -baseW / 2, baseH / 2 - sh, baseW, sh);
    ctx.restore();
    return true;
  }

  /**
   * **Hình máy vẽ sẵn** (tăng tốc 2026-09-30): vẽ sprite kèm bóng đổ theo kênh alpha mỗi khung rất tốn, nhất là
   * trên Firefox (đo trên map 88 máy, zoom xa: phần vẽ máy 7,9 ms/khung, bỏ bóng còn 3,3 ms, phần còn lại là thu
   * nhỏ ảnh gốc lớn). Nên mỗi (máy, hướng, cỡ ô, hướng camera) được vẽ **một lần** vào canvas phụ — đã thu nhỏ, đã
   * xoay, có bóng — rồi mỗi khung chỉ chép lại. Kết quả trông y như vẽ trực tiếp: bóng vẫn lệch xuống-phải **trên
   * màn hình** dù camera quay. Đang zoom (cỡ ô đổi từng khung) thì vẫn vẽ trực tiếp như cũ.
   */
  private spriteCache = new Map<string, { canvas: HTMLCanvasElement; ox: number; oy: number; w: number; h: number }>();
  private cachedSprite(
    sprite: CanvasImageSource & { naturalWidth: number },
    id: string,
    rot: Facing,
    baseW: number,
    baseH: number,
    sh: number,
  ): { canvas: HTMLCanvasElement; ox: number; oy: number; w: number; h: number } {
    const turns = this.camera.turns;
    const dpr = this.dpr;
    const key = `${id}|${rot}|${baseW.toFixed(3)}|${turns}|${dpr}`;
    const hit = this.spriteCache.get(key);
    if (hit) return hit;
    if (this.spriteCache.size > 300) this.spriteCache.clear();
    const a = (rot * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [x, y] of [
      [-baseW / 2, baseH / 2 - sh],
      [baseW / 2, baseH / 2 - sh],
      [-baseW / 2, baseH / 2],
      [baseW / 2, baseH / 2],
    ] as const) {
      const rx = x * cos - y * sin;
      const ry = x * sin + y * cos;
      x0 = Math.min(x0, rx);
      x1 = Math.max(x1, rx);
      y0 = Math.min(y0, ry);
      y1 = Math.max(y1, ry);
    }
    const blur = Math.min(8, this.camera.cell * 0.25);
    const pad = Math.ceil(blur * 2 + 4);
    const w = x1 - x0 + 2 * pad;
    const h = y1 - y0 + 2 * pad;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * dpr));
    canvas.height = Math.max(1, Math.ceil(h * dpr));
    const c = canvas.getContext('2d')!;
    // bóng lệch (2, 2) px **màn hình**: canvas phụ nằm trong khung chưa xoay ⇒ quay ngược theo camera
    const t = (4 - turns) % 4;
    const off = t === 1 ? { x: -2, y: 2 } : t === 2 ? { x: -2, y: -2 } : t === 3 ? { x: 2, y: -2 } : { x: 2, y: 2 };
    c.shadowColor = 'rgba(0,0,0,0.55)';
    c.shadowBlur = blur;
    c.shadowOffsetX = off.x;
    c.shadowOffsetY = off.y;
    c.scale(dpr, dpr);
    const ox = pad - x0;
    const oy = pad - y0;
    c.translate(ox, oy);
    c.rotate(a);
    c.drawImage(sprite, -baseW / 2, baseH / 2 - sh, baseW, sh);
    const entry = { canvas, ox, oy, w: canvas.width / dpr, h: canvas.height / dpr };
    this.spriteCache.set(key, entry);
    return entry;
  }

  // ----------------------------------------------------------------- tuyến
  /**
   * Mọi ô băng (hoặc mọi ô ống), vẽ **từng ô một** theo đúng hình game: ô thẳng là một
   * đoạn thẳng xuyên ô, ô góc là một cung bẻ 90° nối hai cạnh kề nhau. Vì mỗi ô vẽ
   * kín tới mép của nó nên các ô liền nhau tự nối thành dải liền mạch.
   */
  /**
   * Tầng nào đang bị làm mờ.
   *
   * Chỉ làm mờ khi thật sự cần phân biệt: lúc đang đặt băng thì mờ ống, đang đặt ống thì
   * mờ băng, và lúc người dùng chủ động chuyển sang xem "trên cao" thì mờ mặt đất. Bình
   * thường (xem mặt đất, không đặt gì) thì **không mờ gì cả** — ống vốn nằm trên cao,
   * làm mờ nó chỉ khiến bản vẽ khó đọc.
   */
  private dimmed(layer: 0 | 1): boolean {
    const t = this.state.tool;
    if (t.kind === 'link') return (t.linkKind === 'pipe' ? 1 : 0) !== layer;
    return this.activeLayer === 1 && layer === 0;
  }

  /**
   * Ô ống đầu tiên ra khỏi mỗi đầu của máy hai-đầu-ống-ra → màu mũi tên (vàng / cam).
   * Tính lại chỉ khi bản vẽ đổi (kết quả giải đổi), không phải mỗi khung hình.
   */
  private outMarks: { result: SolveResult; map: Map<number, string> } | null = null;
  private firstTileColors(): Map<number, string> {
    const s = this.state;
    if (this.outMarks?.result === s.result) return this.outMarks.map;
    const map = new Map<number, string>();
    for (const chain of buildNetwork(s.bp, s.ds).chains) {
      if (chain.kind !== 'pipe' || !chain.from || chain.tiles.length === 0) continue;
      const m = s.bp.machines.find((v) => v.uid === chain.from!.uid);
      const def = m ? s.ds.machines.get(m.machineId) : undefined;
      const color = def ? pipeOutColor(def, chain.from.portKey) : undefined;
      if (color) map.set(chain.tiles[0]!, color);
    }
    this.outMarks = { result: s.result, map };
    return map;
  }

  /** Canvas phụ để vẽ một lớp **đục** rồi phủ lên canvas chính với độ mờ chung một lần. */
  private layerCanvas: HTMLCanvasElement | null = null;

  /**
   * Vẽ `fn` lên lớp phụ rồi dán lớp đó lên bản vẽ với độ mờ `alpha`.
   *
   * Vẽ thẳng từng ô với `globalAlpha` thấp thì hai ô kề nhau chồng lên nhau ở chỗ nối ⇒ chỗ
   * đó đậm gấp đôi, thành chấm tròn sáng ở mỗi khớp ống. Vẽ đục lên lớp phụ thì phần chồng
   * chỉ là một lớp, rồi cả lớp mờ đều nhau.
   */
  private onLayer(alpha: number, fn: () => void, box?: { x0: number; y0: number; x1: number; y1: number }): void {
    if (alpha >= 1) {
      fn();
      return;
    }
    if (box && (box.x1 <= box.x0 || box.y1 <= box.y0)) return;
    // Canvas chưa có kích thước (tab ẩn / chưa bố cục xong): không có gì để vẽ, và
    // `drawImage` một canvas rộng 0 thì trình duyệt ném lỗi làm dừng cả lúc khởi động.
    if (this.canvas.width === 0 || this.canvas.height === 0) return;
    const main = this.ctx;
    const lc = (this.layerCanvas ??= document.createElement('canvas'));
    if (lc.width !== this.canvas.width || lc.height !== this.canvas.height) {
      lc.width = this.canvas.width;
      lc.height = this.canvas.height;
    }
    const layer = lc.getContext('2d');
    if (!layer) {
      fn();
      return;
    }
    // `box` (toạ độ khung vẽ) ⇒ chỉ xoá / dán đúng phần đó của lớp phụ — dán cả màn hình mỗi khung hình rất tốn trên
    // điện thoại (người dùng 2026-10-05, app Android)
    const m = main.getTransform();
    let rx = 0;
    let ry = 0;
    let rw = lc.width;
    let rh = lc.height;
    if (box) {
      const pts = [m.transformPoint(new DOMPoint(box.x0, box.y0)), m.transformPoint(new DOMPoint(box.x1, box.y0)), m.transformPoint(new DOMPoint(box.x0, box.y1)), m.transformPoint(new DOMPoint(box.x1, box.y1))];
      rx = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))) - 2);
      ry = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y))) - 2);
      rw = Math.min(lc.width, Math.ceil(Math.max(...pts.map((p) => p.x))) + 2) - rx;
      rh = Math.min(lc.height, Math.ceil(Math.max(...pts.map((p) => p.y))) + 2) - ry;
      if (rw <= 0 || rh <= 0) return;
    }
    layer.setTransform(1, 0, 0, 1, 0, 0);
    layer.clearRect(rx, ry, rw, rh);
    layer.setTransform(m);
    this.ctx = layer;
    try {
      fn();
    } finally {
      this.ctx = main;
    }
    main.save();
    main.setTransform(1, 0, 0, 1, 0, 0);
    main.globalAlpha = alpha;
    main.drawImage(lc, rx, ry, rw, rh, rx, ry, rw, rh);
    main.restore();
  }

  private drawBelts(kind: PortKind): void {
    const s = this.state;
    const marks = kind === 'pipe' ? this.firstTileColors() : undefined;
    const dim = this.dimmed(kind === 'pipe' ? 1 : 0);
    const tool = s.tool;
    const lifted = tool.kind === 'group' && tool.mode === 'move';
    const jobs: { t: BeltTileLike; style: TileStyle }[] = [];
    s.bp.belts.forEach((t, i) => {
      if (t.kind !== kind) return;
      const picked = s.sel.tiles.has(tileKeyOf(t));
      // ô đang được nhấc đi: không vẽ ở chỗ cũ, chỉ vẽ preview theo con trỏ
      if (picked && lifted) return;

      const chain = s.result.links.get(s.result.chainOf.get(i) ?? '');
      // ống tô theo chất đang chảy (như EnKAD): nhìn màu là biết ống nào chở gì
      const core =
        kind === 'belt'
          ? COLORS.belt
          : chain?.itemId
            ? (FLUID_COLORS[chain.itemId] ?? COLORS.pipe)
            : EMPTY_PIPE;
      jobs.push({
        t,
        style: {
          core,
          // Băng có vấn đề (cụt, chưa có nguồn) vẫn vẽ **đủ màu** — chỉ thêm nét đứt đỏ.
          // Vẽ mờ đi thì băng vừa đặt, chưa kịp nối, trông như bị khoá ở tầng khác.
          alpha: 1,
          problem: chain?.invalid != null,
          saturated: chain?.saturated === true,
          selected: picked,
          arrow: marks?.get(i),
        },
      });
    });
    const layerAlpha = dim ? 0.3 : 1;
    // quầng sáng quanh ống: mỗi màu **một nét gộp** mọi ô rồi tô mờ một lần — trong một nét, chỗ hai ô chồng nhau ở
    // khớp nối chỉ tô một lần nên không đậm lên thành chấm. Trước 2026-10-05 dùng lớp canvas phụ (`onLayer`): trên
    // điện thoại (app Android) riêng việc dán lớp phụ tốn ~12 ms mỗi khung hình (vẽ nét gộp ~0,1 ms).
    if (kind === 'pipe') this.drawPipeHalos(jobs, PIPE_HALO_ALPHA * layerAlpha);
    // khung bao các ô đang thấy — lớp phụ (chỉ khi làm mờ tầng) chỉ xoá / dán phần này
    const c = this.camera.cell;
    const view = this.frame;
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const j of jobs) {
      const { sx, sy } = this.camera.toScreen(j.t);
      if (sx < -c || sy < -c || sx > view.w || sy > view.h) continue;
      box.x0 = Math.min(box.x0, sx - c);
      box.y0 = Math.min(box.y0, sy - c);
      box.x1 = Math.max(box.x1, sx + 2 * c);
      box.y1 = Math.max(box.y1, sy + 2 * c);
    }
    this.onLayer(
      layerAlpha,
      () => {
        for (const j of jobs) this.drawTile(j.t, kind, { ...j.style, part: 'body' });
      },
      box,
    );
  }

  /** Khung bao (toạ độ khung vẽ, nới 1 ô) của các ô — để lớp phụ chỉ xoá / dán phần cần (`onLayer`). */
  private cellsBox(cells: readonly { x: number; z: number }[]): { x0: number; y0: number; x1: number; y1: number } {
    const c = this.camera.cell;
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const t of cells) {
      const { sx, sy } = this.camera.toScreen(t);
      box.x0 = Math.min(box.x0, sx - c);
      box.y0 = Math.min(box.y0, sy - c);
      box.x1 = Math.max(box.x1, sx + 2 * c);
      box.y1 = Math.max(box.y1, sy + 2 * c);
    }
    return box;
  }

  /** Quầng sáng của các ô ống: gom theo màu, mỗi màu một đường gồm mọi ô, một lần `stroke` với độ mờ `alpha`. */
  private drawPipeHalos(jobs: { t: BeltTileLike; style: TileStyle }[], alpha: number): void {
    const { ctx, camera } = this;
    const c = camera.cell;
    const view = this.frame;
    const P = this.cullPad;
    const byColor = new Map<string, BeltTileLike[]>();
    for (const j of jobs) {
      const { sx, sy } = camera.toScreen(j.t);
      if (sx < -c - P || sy < -c - P || sx > view.w + P || sy > view.h + P) continue;
      const list = byColor.get(j.style.core);
      if (list) list.push(j.t);
      else byColor.set(j.style.core, [j.t]);
    }
    if (byColor.size === 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, c * 0.3) * 1.9;
    for (const [color, tiles] of byColor) {
      ctx.beginPath();
      for (const t of tiles) {
        const { sx, sy } = camera.toScreen(t);
        const cx = sx + c / 2;
        const cy = sy + c / 2;
        const a = DIRS[t.in]!;
        const b = DIRS[t.out]!;
        ctx.moveTo(cx - (a.dx * c) / 2, cy - (a.dz * c) / 2);
        if (t.in === t.out) ctx.lineTo(cx + (b.dx * c) / 2, cy + (b.dz * c) / 2);
        else ctx.quadraticCurveTo(cx, cy, cx + (b.dx * c) / 2, cy + (b.dz * c) / 2);
      }
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawTile(t: BeltTileLike, kind: PortKind, style: TileStyle): void {
    const { ctx, camera } = this;
    const c = camera.cell;
    const { sx, sy } = camera.toScreen(t);
    const view = this.frame;
    const P = this.cullPad;
    if (sx < -c - P || sy < -c - P || sx > view.w + P || sy > view.h + P) return;
    const cx = sx + c / 2;
    const cy = sy + c / 2;
    const a = DIRS[t.in]!;
    const b = DIRS[t.out]!;
    // hàng đi vào theo hướng `in` ⇒ nó bước vào từ cạnh phía ngược lại
    const entry = { x: cx - (a.dx * c) / 2, y: cy - (a.dz * c) / 2 };
    const exit = { x: cx + (b.dx * c) / 2, y: cy + (b.dz * c) / 2 };
    const straight = t.in === t.out;
    const isPipe = kind === 'pipe';
    const width = Math.max(2, c * (isPipe ? 0.3 : 0.92));

    const path = (): void => {
      ctx.beginPath();
      ctx.moveTo(entry.x, entry.y);
      if (straight) ctx.lineTo(exit.x, exit.y);
      else ctx.quadraticCurveTo(cx, cy, exit.x, exit.y);
    };

    ctx.save();
    ctx.globalAlpha = style.alpha;
    // Đầu nét **bằng**: mỗi ô vẽ kín tới mép nên các ô kề nhau khớp liền; đầu tròn thì nét
    // của ô này lấn sang ô kia, và nét mờ (vạch sáng, lớp chọn) đậm lên thành chấm ở khớp.
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';

    const part = style.part ?? 'all';
    if (isPipe && part !== 'body') {
      // quầng sáng cùng màu chất trong ống. Vẽ `halo` thì nét đục — `onLayer` lo độ mờ
      // chung; vẽ lẻ (`all`) thì tự làm mờ.
      if (part === 'all') ctx.globalAlpha = style.alpha * PIPE_HALO_ALPHA;
      ctx.strokeStyle = style.core;
      ctx.lineWidth = width * 1.9;
      path();
      ctx.stroke();
      ctx.globalAlpha = style.alpha;
    }
    if (part === 'halo') {
      ctx.restore();
      return;
    }
    ctx.strokeStyle = style.casing ?? (isPipe ? COLORS.pipeCasing : COLORS.beltCasing);
    ctx.lineWidth = width;
    path();
    ctx.stroke();
    ctx.strokeStyle = style.core;
    ctx.lineWidth = Math.max(1, width * (isPipe ? 0.55 : 0.74));
    path();
    ctx.stroke();

    if (style.selected) {
      ctx.strokeStyle = 'rgba(56,196,255,0.62)';
      ctx.lineWidth = isPipe ? width * 1.35 : width;
      path();
      ctx.stroke();
    }

    if (isPipe && c >= 12) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = Math.max(0.8, width * 0.16);
      path();
      ctx.stroke();
    }

    if (style.problem && c >= 9) {
      ctx.strokeStyle = COLORS.linkBad;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([c * 0.18, c * 0.14]);
      path();
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (style.saturated && c >= 9) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([c * 0.12, c * 0.2]);
      path();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // mũi tên theo hướng ra — trên ô góc nó chỉ đúng chiều sau khi bẻ
    if (c >= 11) {
      const size = c * (isPipe ? 0.14 : 0.2);
      const ang = Math.atan2(b.dz, b.dx);
      const px = straight ? cx : cx + (b.dx * c) / 4;
      const py = straight ? cy : cy + (b.dz * c) / 4;
      ctx.fillStyle = style.arrow ?? (isPipe ? 'rgba(255,255,255,0.6)' : 'rgba(40,24,6,0.85)');
      ctx.beginPath();
      ctx.moveTo(px + size * Math.cos(ang), py + size * Math.sin(ang));
      ctx.lineTo(px - size * Math.cos(ang - 0.7), py - size * Math.sin(ang - 0.7));
      ctx.lineTo(px - size * Math.cos(ang + 0.7), py - size * Math.sin(ang + 0.7));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------- lớp tương tác
  /**
   * Preview máy đang cầm (đặt mới, di chuyển, sao chép): hình công trình thật phủ xanh,
   * **không** vạch chéo; ô nào chồng lên công trình khác thì tô đỏ đúng ô đó. Không đặt
   * được vì lý do khác (ra ngoài khu vực, vùng môi trường chồng nhau) thì đỏ cả máy.
   */
  private drawGhost(): void {
    const s = this.state;
    const tool = s.tool;
    if (tool.kind !== 'place' || !this.ghost) return;
    const def = s.ds.machines.get(tool.machineId);
    if (!def) return;

    const ignore = tool.mode === 'move' ? tool.sourceUid : undefined;
    const { x, z } = this.ghost;
    // van/cầu đặt lên ô băng/ống thẳng đúng chiều: ô đó sẽ bị thay nên không tính là vướng
    const { grid, wrongWay } = placementGrid(s.bp, s.ds, def, x, z, tool.rot);
    const raw = validatePlacement(grid, s.terrain, def, x, z, tool.rot, ignore, envZonesOf(s.bp, s.ds));
    const check = !raw.ok && wrongWay ? { ok: false, reason: tr('Van/cầu phải đặt đúng chiều dòng chảy của tuyến (cầu chỉ đặt lên ô thẳng)') } : raw;
    const cells = ghostCells(grid, def, x, z, tool.rot, ignore);

    const { ctx, camera } = this;
    const box = footprint(def, tool.rot);
    const { sx, sy } = camera.toScreen({ x, z });
    const w = box.w * camera.cell;
    const h = box.d * camera.cell;

    if (!this.drawSprite(def, tool.rot, sx, sy, w, h, 0.85)) {
      ctx.fillStyle = 'rgba(58,90,128,0.8)';
      ctx.fillRect(sx, sy, w, h);
    }
    this.drawSelectionOverlay(sx, sy, w, h, false);
    this.drawAuraPreview(
      def,
      { uid: -1, machineId: def.id, x, z, rot: tool.rot, recipeId: null, binding: {}, count: 1, mode: tool.machineMode },
      tool.sourceUid,
    );

    ctx.save();
    ctx.fillStyle = 'rgba(235,64,64,0.62)';
    const occupancyOnly = cells.some((c) => c.blocked);
    for (const c of cells) {
      if (!c.blocked && (check.ok || occupancyOnly)) continue;
      const p = camera.toScreen(c.cell);
      ctx.fillRect(p.sx, p.sy, camera.cell, camera.cell);
    }
    ctx.restore();

    // Mũi tên cổng — chỉ khi đang preview, đặt xuống là mất. Nằm ở ô chạm ngay ngoài đế,
    // chỉ theo **chiều dòng chảy**: cổng vào chỉ vào máy, cổng ra chỉ ra xa. Băng chuyền vẽ
    // "^" rỗng màu trắng, khí/lỏng vẽ tam giác đặc. Xoay theo hướng máy vì lấy từ worldPorts.
    if (camera.cell >= 8) {
      const probe: PlacedMachine = { uid: -1, machineId: def.id, x, z, rot: tool.rot, recipeId: null, binding: {}, count: 1, mode: tool.machineMode };
      for (const port of worldPorts(probe, def)) {
        if (port.virtual) continue;
        this.drawPortArrow(port.attach, port.flow, port.kind, pipeOutColor(def, port.key));
      }
    }

    if (!check.ok && camera.cell >= 10) {
      const cx = sx + w / 2;
      const cy = sy + h / 2;
      const below = cy + this.screenBox(w, h).h / 2;
      this.upright(cx, cy, () => {
        ctx.save();
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(12,15,20,0.85)';
        const text = check.reason ?? tr('Không đặt được');
        const tw = ctx.measureText(text).width + 10;
        ctx.fillRect(cx - tw / 2, below + 4, tw, 18);
        ctx.fillStyle = '#ffb3b3';
        ctx.textBaseline = 'top';
        ctx.fillText(text, cx - tw / 2 + 5, below + 7);
        ctx.restore();
      });
    }
  }

  /**
   * Preview cả nhóm đang cầm (di chuyển / sao chép / kéo máy): băng/ống và máy ở chỗ mới
   * đúng như sẽ đặt — đã quay, cổng có mũi tên — phủ xanh không vạch; ô nào vướng thì
   * tô đỏ đúng ô đó.
   */
  private drawGroupGhost(): void {
    const s = this.state;
    const tool = s.tool;
    if ((tool.kind !== 'group' && tool.kind !== 'stamp') || !this.groupTarget) return;
    const mv = { anchor: tool.anchor, target: this.groupTarget, turns: tool.turns };
    const plan =
      tool.kind === 'group'
        ? planGroup(s.bp, s.ds, s.terrain, s.sel, mv, tool.mode)
        : planPieces(s.ds, s.terrain, tool.pieces, mv, s.bp);
    const { ctx, camera } = this;

    for (const kind of ['belt', 'pipe'] as const) {
      const tiles = plan.tiles.filter((t) => t.kind === kind);
      if (tiles.length === 0) continue; // không có ô loại này ⇒ khỏi dựng lớp phụ (tốn trên điện thoại)
      this.onLayer(
        0.85,
        () => {
          for (const t of tiles) this.drawTile(t, kind, { core: kind === 'pipe' ? COLORS.pipe : COLORS.belt, alpha: 1, selected: true });
        },
        this.cellsBox(tiles),
      );
    }
    for (const e of plan.machines) {
      const def = s.ds.machines.get(e.src.machineId);
      if (!def) continue;
      const box = footprint(def, e.rot);
      const { sx, sy } = camera.toScreen(e);
      const w = box.w * camera.cell;
      const h = box.d * camera.cell;
      if (!this.drawSprite(def, e.rot, sx, sy, w, h, 0.85)) {
        ctx.fillStyle = 'rgba(58,90,128,0.8)';
        ctx.fillRect(sx, sy, w, h);
      }
      this.drawSelectionOverlay(sx, sy, w, h, false);
      // chế độ đổi bằng Tab lúc đang cầm nhóm ⇒ preview cổng theo chế độ mới
      const mode = tool.kind === 'group' ? (tool.modes?.[e.src.uid] ?? e.src.mode) : e.src.mode;
      this.drawAuraPreview(def, { ...e.src, x: e.x, z: e.z, rot: e.rot, mode }, tool.kind === 'group' ? e.src.uid : undefined);
      if (camera.cell >= 8) {
        for (const port of worldPorts({ ...e.src, x: e.x, z: e.z, rot: e.rot, mode }, def)) {
          if (!port.virtual) this.drawPortArrow(port.attach, port.flow, port.kind, pipeOutColor(def, port.key));
        }
      }
    }

    ctx.save();
    ctx.fillStyle = 'rgba(235,64,64,0.62)';
    for (const c of plan.blocked) {
      const p = camera.toScreen(c);
      ctx.fillRect(p.sx, p.sy, camera.cell, camera.cell);
    }
    ctx.restore();

    if (!plan.ok && camera.cell >= 10) {
      const c = camera.toScreen(this.groupTarget);
      const cx = c.sx + camera.cell / 2;
      const cy = c.sy + camera.cell / 2;
      this.upright(cx, cy, () => {
        ctx.save();
        ctx.font = '12px system-ui, sans-serif';
        const text = plan.reason ?? tr('Không đặt được');
        const tw = ctx.measureText(text).width + 10;
        ctx.fillStyle = 'rgba(12,15,20,0.85)';
        ctx.fillRect(cx - tw / 2, cy + camera.cell / 2 + 6, tw, 18);
        ctx.fillStyle = '#ffb3b3';
        ctx.textBaseline = 'top';
        ctx.fillText(text, cx - tw / 2 + 5, cy + camera.cell / 2 + 9);
        ctx.restore();
      });
    }
  }

  /**
   * Chế độ Xoá: vật thể dưới con trỏ tô đỏ — đúng thứ công cụ Xoá sẽ xoá khi bấm: máy
   * trước, không có máy thì ô băng/ống ở tầng đang xem (tô đỏ đúng thân băng/ống).
   */
  private drawEraseHover(): void {
    const s = this.state;
    const c = this.hover.cell;
    if (s.tool.kind !== 'erase' || !c) return;
    const { ctx, camera } = this;
    const m = machineAt(s.bp, s.ds, c);
    const def = m ? s.ds.machines.get(m.machineId) : undefined;
    if (m && def) {
      const box = footprint(def, m.rot);
      const { sx, sy } = camera.toScreen(m);
      ctx.save();
      ctx.fillStyle = 'rgba(235,64,64,0.5)';
      ctx.fillRect(sx, sy, box.w * camera.cell, box.d * camera.cell);
      ctx.strokeStyle = '#ff5a5a';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, box.w * camera.cell - 2, box.d * camera.cell - 2);
      ctx.restore();
      return;
    }
    const kind: PortKind = this.activeLayer === 1 ? 'pipe' : 'belt';
    const t = s.bp.belts.find((b) => b.kind === kind && b.x === c.x && b.z === c.z);
    if (t) this.drawTile(t, kind, { core: '#ff4d4f', casing: 'rgba(90,10,10,0.95)', alpha: 1 });
  }

  /**
   * Đang chỉ định đầu kia của cặp ống ngầm (`tool.kind === 'pair'`): máy ghép được tô xanh (máy
   * dưới con trỏ đậm hơn), đường nét đứt từ máy đang ghép tới con trỏ.
   */
  private drawPairPick(): void {
    const s = this.state;
    const tool = s.tool;
    if (tool.kind !== 'pair') return;
    const { ctx, camera } = this;
    const src = s.bp.machines.find((m) => m.uid === tool.uid);
    const srcDef = src ? s.ds.machines.get(src.machineId) : undefined;
    if (!src || !srcDef) return;
    const hover = this.hover.cell ? machineAt(s.bp, s.ds, this.hover.cell) : undefined;
    const rect = (m: PlacedMachine, def: MachineDef): { sx: number; sy: number; w: number; h: number } => {
      const box = footprint(def, m.rot);
      const { sx, sy } = camera.toScreen(m);
      return { sx, sy, w: box.w * camera.cell, h: box.d * camera.cell };
    };
    ctx.save();
    for (const c of pairCandidates(s.bp, s.ds, tool.uid)) {
      const def = s.ds.machines.get(c.machineId)!;
      const r = rect(c, def);
      const on = hover?.uid === c.uid;
      ctx.fillStyle = on ? 'rgba(63,185,80,0.5)' : 'rgba(63,185,80,0.22)';
      ctx.fillRect(r.sx, r.sy, r.w, r.h);
      ctx.strokeStyle = '#3fb950';
      ctx.lineWidth = on ? 3 : 1.5;
      ctx.strokeRect(r.sx + 1, r.sy + 1, r.w - 2, r.h - 2);
    }
    const r = rect(src, srcDef);
    ctx.strokeStyle = '#e8c547';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(r.sx + 1, r.sy + 1, r.w - 2, r.h - 2);
    if (this.hover.cell) {
      const a = { x: r.sx + r.w / 2, y: r.sy + r.h / 2 };
      const b = camera.toScreen({ x: this.hover.cell.x + 0.5, z: this.hover.cell.z + 0.5 });
      ctx.strokeStyle = '#e8c547';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Đang chọn một đầu ống ngầm đã ghép ⇒ đầu kia phủ **sọc chéo trắng** như preview cấp điện của cột
   * điện (người dùng 2026-09-29), để thấy ngay nó nối với máy nào.
   */
  private drawPairPartner(): void {
    const s = this.state;
    if (s.tool.kind !== 'select' || s.selection === null) return;
    const m = s.bp.machines.find((v) => v.uid === s.selection);
    const def = m ? s.ds.machines.get(m.machineId) : undefined;
    if (!m || !def?.pairable) return;
    // cặp thật là con trỏ của **đầu vào** (solver cũng đọc như vậy): chọn đầu vào ⇒ máy nó trỏ tới;
    // chọn đầu ra ⇒ các đầu vào đang trỏ về nó
    const partners =
      roleOf(def) === 'udpipeIn'
        ? s.bp.machines.filter((o) => o.uid === m.pairTarget)
        : s.bp.machines.filter((o) => o.uid !== m.uid && o.pairTarget === m.uid && roleOf(s.ds.machines.get(o.machineId)!) === 'udpipeIn');
    const { ctx, camera } = this;
    for (const o of partners) {
      const od = s.ds.machines.get(o.machineId);
      if (!od) continue;
      const box = footprint(od, o.rot);
      const { sx, sy } = camera.toScreen(o);
      ctx.save();
      this.stripeRect(sx, sy, box.w * camera.cell, box.d * camera.cell, 12, 2.5, 'rgba(255,255,255,0.8)');
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + 1, sy + 1, box.w * camera.cell - 2, box.d * camera.cell - 2);
      ctx.restore();
    }
  }

  /** Khung chọn vùng: viền xanh nét đứt, nền xanh rất nhạt. */
  /** Máy đã tắt: phủ tối + vòng nút nguồn xám + chữ OFF (khi ô đủ lớn). */
  private drawOffOverlay(x: number, y: number, w: number, h: number): void {
    const { ctx, camera } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(8, 10, 14, 0.55)';
    ctx.fillRect(x, y, w, h);
    const r = Math.max(4, Math.min(w, h) * 0.18);
    const cx = x + w / 2;
    const cy = y + h / 2 - (camera.cell >= 14 ? r * 0.35 : 0);
    ctx.strokeStyle = '#c9d1d9';
    ctx.lineWidth = Math.max(1.5, r * 0.22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.32, Math.PI * 1.32);
    ctx.moveTo(cx, cy - r * 1.15);
    ctx.lineTo(cx, cy - r * 0.2);
    ctx.stroke();
    if (camera.cell >= 14) {
      ctx.fillStyle = '#c9d1d9';
      ctx.font = `700 ${Math.max(9, Math.round(r * 0.75))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('OFF', cx, cy + r * 1.35);
    }
    ctx.restore();
  }

  private drawBox(): void {
    if (!this.box) return;
    const { ctx, camera } = this;
    const { a, b } = this.box;
    const p = camera.toScreen({ x: Math.min(a.x, b.x), z: Math.min(a.z, b.z) });
    const w = (Math.abs(a.x - b.x) + 1) * camera.cell;
    const h = (Math.abs(a.z - b.z) + 1) * camera.cell;
    // chế độ hàng loạt: chuột phải kéo hộp = bỏ chọn ⇒ hộp đỏ (người dùng 2026-10-06)
    const remove = this.boxMode === 'remove';
    ctx.save();
    ctx.fillStyle = remove ? 'rgba(255,90,90,0.12)' : 'rgba(56,196,255,0.1)';
    ctx.fillRect(p.sx, p.sy, w, h);
    ctx.strokeStyle = remove ? '#ff8080' : '#6fd6ff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(p.sx + 0.5, p.sy + 0.5, w - 1, h - 1);
    ctx.restore();
  }

  /**
   * Xem trước băng/ống đang kéo: **trắng** nếu đặt được, **đỏ** nếu vướng vật cản hoặc
   * không có đường ≤ 3 góc. Vẽ đúng từng ô thẳng / ô góc như khi đã đặt, để thấy trước
   * chính xác băng sẽ bẻ ở đâu.
   */
  private drawLinkInProgress(): void {
    const s = this.state;
    const tool = s.tool;
    if (tool.kind !== 'link') return;
    const { ctx, camera } = this;

    if (this.startHint) {
      const { sx, sy } = camera.toScreen(this.startHint);
      ctx.save();
      ctx.strokeStyle = tool.linkKind === 'pipe' ? COLORS.pipe : COLORS.belt;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, camera.cell - 2, camera.cell - 2);
      ctx.restore();
    }

    const plan = this.preview;
    if (!plan) return;
    // đầu ống đang theo ngón tay: khung vàng quanh ô đầu (vẽ sau cùng, xem dưới)
    const head = this.pathHead;
    const bridges = new Set((plan.bridges ?? []).map((c) => `${c.x},${c.z}`));
    this.onLayer(
      0.85,
      () => {
        plan.cells.forEach((c, i) => {
          if (bridges.has(`${c.x},${c.z}`)) return;
          this.drawTile({ x: c.x, z: c.z, in: plan.ins[i]!, out: plan.outs[i]! }, plan.kind, {
            core: plan.ok ? '#f4f6f8' : '#ff4d4f',
            casing: plan.ok ? 'rgba(20,24,30,0.9)' : 'rgba(70,10,10,0.9)',
            alpha: 1,
          });
        });
      },
      this.cellsBox(plan.cells),
    );
    // chỗ cắt ngang tuyến có sẵn: sẽ tự đặt cầu nối
    const bridgeDef = s.ds.machines.get(plan.kind === 'pipe' ? 'log_pipe_connector' : 'log_connector');
    if (bridgeDef)
      for (const key of bridges) {
        const [x, z] = key.split(',').map(Number) as [number, number];
        const p = camera.toScreen({ x, z });
        if (!this.drawSprite(bridgeDef, 0, p.sx, p.sy, camera.cell, camera.cell, 0.9)) {
          ctx.fillStyle = 'rgba(200,200,200,0.8)';
          ctx.fillRect(p.sx, p.sy, camera.cell, camera.cell);
        }
        this.drawSelectionOverlay(p.sx, p.sy, camera.cell, camera.cell, false);
      }
    if (head) {
      const { sx, sy } = camera.toScreen(head);
      const c = camera.cell;
      ctx.save();
      ctx.strokeStyle = plan.ok ? '#e8c547' : '#ff4d4f';
      ctx.lineWidth = Math.max(2, c * 0.08);
      ctx.strokeRect(sx + 1, sy + 1, c - 2, c - 2);
      ctx.restore();
    }
  }

  private drawHover(): void {
    const c = this.hover.cell;
    const k = this.state.tool.kind;
    if (!c || k === 'place' || k === 'group' || k === 'stamp') return;
    const { ctx, camera } = this;
    const { sx, sy } = camera.toScreen(c);
    // Con trỏ ô (Cài đặt, người dùng 2026-10-05 lần 2): tắt ⇒ không hiện gì; bật ⇒ khung ô mờ như trước đây
    if (!this.pointer) return;
    ctx.strokeStyle = this.sc.hover;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, camera.cell - 1, camera.cell - 1);
  }
}

const LABEL_KEY = 'efp:labels';

function readLabelSetting(): boolean {
  try {
    return localStorage.getItem(LABEL_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveLabelSetting(on: boolean): void {
  try {
    localStorage.setItem(LABEL_KEY, on ? 'on' : 'off');
  } catch {
    /* không lưu được thì thôi */
  }
}

/** Đổi độ sáng một màu hex; dùng để dựng dốc sáng trên tấm đế máy. */
function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * factor);
  const g = clamp(((n >> 8) & 255) * factor);
  const b = clamp((n & 255) * factor);
  return `rgb(${r} ${g} ${b})`;
}

/** Tên ngắn để nhét vào ô máy: bỏ hậu tố cấp, giữ phần nhận dạng. */
function shortName(def: MachineDef): string {
  return def.name.replace(/\s+\d+$/, '');
}

export { COLORS };
