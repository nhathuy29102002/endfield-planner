import { tr } from '../i18n';
/** Kiểu dữ liệu nền của dự án. Mọi module khác chỉ nói chuyện qua đây. */

/** Hướng quay của máy trên lưới, độ, theo chiều kim đồng hồ. */
export type Facing = 0 | 90 | 180 | 270;

/** Băng chuyền chở vật rắn; ống chở cả chất lỏng lẫn khí. Hai hệ không nối với nhau. */
export type PortKind = 'belt' | 'pipe';

/** Pha của vật tư. Rắn đi băng, lỏng và khí đều đi ống. */
export type Phase = 'solid' | 'liquid' | 'gas';

/**
 * Môi trường xúc tác do máy tạo môi trường phủ lên một vùng.
 * Lấy nguyên enum của game: `NONE / STABLE / HUMIDITY / ACID / XIRANITE`.
 */
export type CatalystEnv = 'None' | 'Stable' | 'Humidity' | 'Acid' | 'Xiranite';

export const CATALYST_ENV_LABEL: Record<CatalystEnv, string> = {
  None: tr('không yêu cầu'),
  Stable: tr('trơ / ổn định'),
  Humidity: tr('ẩm'),
  Acid: 'axit',
  Xiranite: 'xiranite',
};

export type PortDir = 'in' | 'out';

/**
 * Hai layer routing độc lập.
 * - `0` mặt đất: băng chuyền, đế máy.
 * - `1` trên cao: ống. Ống bắc qua băng chuyền được, nhưng không xuyên máy cao.
 */
export type Layer = 0 | 1;

/** Cao độ (đơn vị của game) mà ống chạy. Máy cao hơn mức này thì chắn ống. */
export const PIPE_LEVEL = 3;

export interface Cell {
  x: number;
  z: number;
}

/** Ràng buộc chỗ đặt, lấy nguyên từ `limitType` của bảng dữ liệu game. */
export type Placement =
  | 'NoLimit'
  | 'OnMineOnly'
  | 'PumpReachLiquid'
  | 'MustInCropArea'
  | 'RoadAttach';

/** Một cổng, toạ độ là **local** trong footprint chưa quay. */
export interface Port {
  index: number;
  dir: PortDir;
  kind: PortKind;
  x: number;
  z: number;
  /** `y` của game: 0 = mặt đất, 3 = cao độ ống. */
  level: number;
  /** `rotation.y` của game — là **hướng dòng chảy**: 0→+z, 90→+x, 180→-z, 270→-x. */
  facing: number;
  /** Cổng phụ dùng chung đầu nối vật lý; không nối tuyến vào đây. */
  virtual?: boolean;
}

/**
 * Vùng phủ hình vuông quanh máy.
 * - `env` — môi trường xúc tác. Hai vùng **không được** chồng nhau.
 * - `power` — tầm cấp điện của cột (7×7) và trụ (12×12). Chồng nhau thoải mái.
 */
export interface Aura {
  w: number;
  d: number;
  dx: number;
  dz: number;
  kind: 'env' | 'power';
}

/** Một chế độ vận hành của máy. Đổi chế độ thường đổi luôn bộ công thức dùng được. */
export interface MachineMode {
  id: 'A' | 'B';
  /** Nhãn hiển thị — tiếng Việt (người dùng 2026-09-29); `labelEn` = nhãn gốc của game, cho bản tiếng Anh sau này. */
  label: string;
  labelEn?: string;
}

export interface MachineDef {
  id: string;
  /** Tên hiển thị theo ngôn ngữ đang chọn (`loadDataset` chọn giữa `nameVi` / `nameEn`; không có thì suy từ mã). */
  name: string;
  nameVi?: string;
  nameEn?: string;
  type: string;
  size: { w: number; d: number; h: number };
  power: number;
  placement: Placement;
  domains: string[];
  quickBar: string;
  /** Tên file ảnh (không đuôi). */
  icon: string;
  /** Van chia/gộp 1×1: cổng vào và ra **dùng chung ô**, chỉ khác hướng dòng chảy. */
  router: boolean;
  aura?: Aura;
  /**
   * Cổng nạp khí/lỏng để máy chạy được — **không** phải nguyên liệu của công thức.
   * Giống như điện: có đủ thì máy chạy, thiếu thì máy chậm lại.
   */
  activatorPort: PortKey | null;
  modes?: MachineMode[];
  /** `true` khi đổi chế độ đổi luôn danh sách công thức (chứ không chỉ đổi hành vi). */
  modeAffectsRecipes?: boolean;
  /**
   * Cổng tồn tại ở từng chế độ, theo `index` mỗi chiều; chiều không ghi = mọi cổng. Không có bảng
   * này ⇒ mọi cổng luôn tồn tại. Đọc qua `activePorts`, đừng đọc `ports` thẳng.
   */
  modePorts?: Partial<Record<'A' | 'B', { in?: number[]; out?: number[] }>>;
  /** Ống ngầm: ghép cặp trực tiếp với một máy khác, không qua băng hay ống. */
  pairable: boolean;
  ports: Port[];
}

/** Cổng **đang tồn tại** của một máy ở chế độ `mode` (mặc định `A`) — xem `modePorts`. */
export function activePorts(def: MachineDef, mode?: 'A' | 'B'): Port[] {
  const t = def.modePorts?.[mode ?? 'A'];
  if (!t) return def.ports;
  return def.ports.filter((p) => {
    const list = t[p.dir];
    return !list || list.includes(p.index);
  });
}

export interface ItemDef {
  id: string;
  /** Tên hiển thị theo ngôn ngữ đang chọn — xem `MachineDef.name`. */
  name: string;
  nameVi?: string;
  nameEn?: string;
  phase: Phase;
  /** Tên file ảnh (không đuôi). Bình đã nạp: `filled/<id>` (vỏ + khí/lỏng ghép sẵn, `loadDataset`). */
  icon: string;
  /** Khí nạp vào máy tạo môi trường sẽ sinh ra môi trường loại này. */
  producesEnv?: CatalystEnv;
  /** Đốt được trong trạm điện: phát `power` trong `seconds` giây cho mỗi đơn vị. */
  fuel?: { power: number; seconds: number };
}

export interface Stack {
  itemId: string;
  count: number;
}

export interface RecipeDef {
  id: string;
  machineId: string;
  group: string;
  /** Thời gian một chu kỳ, giây. */
  seconds: number;
  ingredients: Stack[];
  outcomes: Stack[];
  /** Nhóm sản phẩm phụ (một số công thức có nhiều nhóm outcome). */
  altOutcomes: Stack[][];
  /** Buffer nội bộ theo item — nguồn gây nghẽn khi máy chạy không đều. */
  buffers: Record<string, number>;
  /** Chế độ máy phải bật để chạy được công thức này; `null` = chế độ không liên quan. */
  mode: 'A' | 'B' | null;
  /** `None` = chạy ở đâu cũng được; khác `None` = bắt buộc nằm trong môi trường đó. */
  catalystEnv: CatalystEnv;
}

export interface Dataset {
  machines: Map<string, MachineDef>;
  recipes: Map<string, RecipeDef>;
  items: Map<string, ItemDef>;
  /** Công thức theo máy, giữ nguyên thứ tự trong dữ liệu gốc. */
  recipesByMachine: Map<string, RecipeDef[]>;
}

/** Khoá định danh cổng trong một máy. `index` trùng nhau giữa in và out nên phải ghép `dir`. */
export type PortKey = string;

export const portKey = (dir: PortDir, index: number): PortKey => `${dir}${index}`;

export interface PlacedMachine {
  uid: number;
  machineId: string;
  /** Góc trên-trái của footprint sau khi quay. */
  x: number;
  z: number;
  rot: Facing;
  recipeId: string | null;
  /**
   * Công thức được **tích thêm** trong cửa sổ Máy (ngoài công thức đang chạy). Người dùng
   * đã chốt: chỉ để ghi chú — tính toán chỉ dùng `recipeId`.
   */
  notedRecipes?: string[];
  /**
   * Item chạy qua từng cổng. **Luôn lưu tường minh.**
   * Khi số slot bằng số item thì UI tự gán và khoá lại; khi slot nhiều hơn thì
   * người dùng chọn — và lúc đó không suy ra được, buộc phải lưu.
   */
  binding: Record<PortKey, string | null>;
  /** Số máy giống nhau gộp vào một khối, để tính công suất nhanh. */
  count: number;
  /**
   * Chỉ dùng cho máy **nguồn** (khai thác, bơm vào, nhập từ bus): bảng công thức
   * của game không mô tả sản lượng của chúng vì nó phụ thuộc mỏ. Người dùng khai báo
   * tay ở đây.
   */
  source?: { itemId: string; perMinute: number };
  /** Máy nạp/rút kho tổng: vật tư mà nó bơm vào hoặc lấy ra. */
  depotItem?: string | null;
  /** Chế độ đang bật. Máy không có chế độ thì bỏ trống. */
  mode?: 'A' | 'B';
  /**
   * **Đã tắt** (Tab — người dùng 2026-10-06, "tiết kiệm điện"): chỉ máy dùng điện và trạm điện. Máy tắt không chạy, không
   * nhận hàng, không tính điện tiêu thụ; trạm điện tắt không đốt nhiên liệu, không phát điện. Không có = đang bật.
   */
  off?: boolean;
  /**
   * Ống ngầm: uid của máy đầu kia.
   *
   * Khí và chất lỏng **không có kho tổng** — muốn chuyển xa thì đặt một
   * `udpipe_loader` và một `udpipe_unloader` rồi ghép cặp chúng ở đây. Cặp này là
   * một đường đi riêng, không dùng băng chuyền cũng không dùng ống.
   */
  pairTarget?: number | null;
  /** Đầu ra ống ngầm đặt ở chế độ nguồn vô hạn (`infinitable` trong game). */
  infinite?: boolean;
  /**
   * Cảng Kiểm Soát Vật Phẩm / Cảng Kiểm Soát Ống: chỉ cho món này đi tiếp; gặp món khác thì cả
   * tuyến vào bị nghẽn. Chưa chọn (`null` / không có) ⇒ cho qua mọi thứ.
   */
  filterItem?: string | null;
  /**
   * Cảng Kiểm Soát Ống: tốc độ tối đa cho qua, mỗi phút — bội số của 6, tối đa 60. Chưa chọn ⇒
   * không giới hạn (tới sức chở của ống).
   */
  filterRate?: number | null;
  /**
   * Công trình **đặt sẵn** của căn cứ (dải kho tổng Valley IV, tab Base): không chọn, di chuyển,
   * quay hay xoá được.
   */
  fixed?: boolean;
}

export interface Endpoint {
  uid: number;
  portKey: PortKey;
}

/**
 * Hướng trên lưới, trùng thứ tự với `DIRS`: `0` = lên (−z), `1` = phải (+x),
 * `2` = xuống (+z), `3` = trái (−x).
 */
export type Dir4 = 0 | 1 | 2 | 3;

/**
 * Một ô băng chuyền hoặc ống.
 *
 * Game chỉ có hai loại ô: **thẳng** (hàng vào một phía, ra phía đối diện) và **góc**
 * (bẻ 90°, hàng vào và ra ở hai ô chéo nhau). Cả hai mô tả được bằng đúng một cặp
 * hướng — `in` là hướng dòng chảy khi đi vào ô, `out` là khi rời ô. `in === out` là
 * ô thẳng, lệch 90° là ô góc, ngược chiều thì không tồn tại.
 *
 * Tuyến **không** lưu "nối cổng A tới cổng B". Kết nối suy ra từ hình học: ô cuối
 * có `out` chĩa đúng vào một cổng vào theo đúng hướng của cổng đó thì mới vào máy.
 * Nhờ vậy băng cụt, băng nối tiếp băng, rẽ nhánh giữa chừng đều biểu diễn được.
 */
export interface BeltTile {
  x: number;
  z: number;
  kind: PortKind;
  in: Dir4;
  out: Dir4;
  /** Mã của lần đặt — để xoá cả đoạn một lúc và để tô trạng thái theo đoạn. */
  group: number;
}

/** @deprecated Định dạng cũ, chỉ còn để chuyển đổi file lưu trước đây. */
export interface Link {
  uid: number;
  kind: PortKind;
  from: Endpoint;
  to: Endpoint;
  path: Cell[];
}

export interface Blueprint {
  version: 2;
  name: string;
  area: { w: number; d: number };
  machines: PlacedMachine[];
  /** Mọi ô băng chuyền và ống. */
  belts: BeltTile[];
  nextUid: number;
  /**
   * Bắt buộc máy phải nằm trong tầm cột/trụ điện mới chạy — đúng như trong game.
   * Tắt đi khi đang phác thảo dây chuyền và chưa muốn bận tâm tới điện.
   */
  enforcePower?: boolean;
  /** Điện nền do lõi căn cứ cấp, cộng thêm vào điện các trạm phát. Mặc định 200. */
  basePower?: number;
  /**
   * Vùng **được xây** khi nó nhỏ hơn cả khung (`area`): map tạo từ tab Base có dải kho tổng đặt
   * sẵn ở rìa (Valley IV "Upgrade 2, depots") — như EnKAD, khung = vùng xây + 5 ô mỗi phía. Máy,
   * băng, ống chỉ đặt được trong vùng này. Không có = cả khung.
   */
  buildArea?: { x: number; z: number; w: number; d: number };
  /** Căn cứ tạo từ tab Base (vùng + cấu hình). Không có = map tự do như trước. */
  base?: { region: BaseRegion; label: string };
}

/**
 * Vùng căn cứ (tab Base, chép từ EnKAD "Create new"). Valley IV **không** tự đặt được tổng tuyến
 * kho hàng — kho tổng là dải đặt sẵn ngoài vùng xây; Wuling tự đặt tổng tuyến như trước.
 */
export type BaseRegion = 'valley4' | 'valley4_outpost' | 'wuling' | 'wuling_outpost' | 'custom';
export const isValley = (r: BaseRegion | undefined): boolean => r === 'valley4' || r === 'valley4_outpost';

export const DEFAULT_BASE_POWER = 200;

export const emptyBlueprint = (w = 70, d = 70): Blueprint => ({
  version: 2,
  name: tr('Bản vẽ chưa đặt tên'),
  area: { w, d },
  machines: [],
  belts: [],
  nextUid: 1,
  // mặc định **tắt** kiểm tra tầm điện (người dùng 2026-10-07: chế độ mặc định khi cài mới)
  enforcePower: false,
});

/** Băng chở được vật rắn; lỏng và khí phải đi ống. */
export const kindOfPhase = (phase: Phase): PortKind => (phase === 'solid' ? 'belt' : 'pipe');
