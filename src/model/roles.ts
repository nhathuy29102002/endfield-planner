import type { MachineDef, PortKind } from './types';
import { tr } from '../i18n';

/**
 * Vai trò của máy trong đồ thị dòng chảy.
 *
 * Bảng công thức của game **không** phủ hết: máy khai thác không có công thức (sản
 * lượng phụ thuộc mỏ), hub và kho là điểm nhận không giới hạn, van chia/gộp chỉ dẫn
 * hàng đi qua, máy tạo môi trường thì không sản xuất gì cả. Năm vai trò này phải tách
 * riêng, nếu không thì không bản vẽ nào chạy được.
 */
export type Role =
  | 'crafter'
  | 'source'
  | 'sink'
  | 'router'
  | 'envgen'
  | 'depotIn'
  | 'depotOut'
  | 'udpipeIn'
  | 'udpipeOut'
  | 'power'
  | 'generator'
  | 'bridge'
  | 'bus'
  | 'passive';

const BY_TYPE: Record<string, Role> = {
  Miner: 'source',
  GasMiner: 'source',
  FluidPumpIn: 'source',

  Hub: 'sink',
  SubHub: 'sink',
  Storager: 'sink',
  FluidContainer: 'sink',
  VirtualFluidContainer: 'sink',
  FluidConsume: 'sink',
  FluidPumpOut: 'sink',
  // Cửa Nạp Nước Thải (ống **vào**) là nơi nhận; Cửa Xả Phụ Phẩm (ống **ra**) là nguồn — trước
  // 2026-09-29 hai vai này bị đảo. Luật trao đổi giữa hai cửa: `SEWAGE` trong `sim/solver.ts`.
  SewageTreatPlantImport: 'sink',
  SewageTreatPlantExport: 'source',

  MachineCrafter: 'crafter',
  FluidReaction: 'crafter',
  FluidSpray: 'crafter',
  MachineWithActivator: 'crafter',

  EnvGenWithActivator: 'envgen',

  // Kho tổng **chỉ dùng băng chuyền**: Loader nạp vào, Unloader rút ra.
  Loader: 'depotIn',
  Unloader: 'depotOut',

  // Khí và lỏng không có kho tổng. Hai đầu ống ngầm ghép cặp trực tiếp với nhau.
  UdPipeLoader: 'udpipeIn',
  UdPipeUnloader: 'udpipeOut',

  PowerPole: 'power',
  PowerDiffuser: 'power',
  PowerStation: 'generator',
  PowerTerminal: 'power',
  PowerPort: 'power',

  LogSplitter: 'router',
  LogConverger: 'router',
  LogConditioner: 'router',
  LogPipeSplitter: 'router',
  LogPipeConverger: 'router',
  LogPipeConditioner: 'router',

  // Cầu: hai tuyến cắt nhau mà không trộn hàng — mỗi trục một kênh riêng.
  LogConnector: 'bridge',
  LogPipeConnector: 'bridge',

  // Tổng tuyến kho hàng: loader/unloader phải gắn vào đây mới thông với kho tổng.
  BusFree: 'bus',
  BusStart: 'bus',
};

export function roleOf(def: MachineDef): Role {
  return BY_TYPE[def.type] ?? 'passive';
}

export const ROLE_LABEL: Record<Role, string> = {
  // máy khai thác và bơm không lấy được tài nguyên trực tiếp từ căn cứ AIC
  source: tr('Khai thác — ngoài căn cứ (mỏ, bơm)'),
  crafter: tr('Chế biến'),
  envgen: tr('Tạo môi trường'),
  router: tr('Van chia / gộp'),
  depotOut: tr('Rút từ kho tổng (băng)'),
  depotIn: tr('Nạp vào kho tổng (băng)'),
  udpipeOut: tr('Đầu ra ống ngầm'),
  udpipeIn: tr('Đầu vào ống ngầm'),
  power: tr('Cột / trụ điện'),
  generator: tr('Trạm phát điện'),
  bridge: tr('Cầu băng / cầu ống'),
  bus: tr('Tổng tuyến kho hàng'),
  sink: tr('Kho / Điểm nhận'),
  passive: tr('Hạ tầng'),
};

/**
 * Thứ tự hiển thị trong bảng chọn. Trong căn cứ, nguyên liệu vào từ kho tổng (rắn) và
 * đầu ra ống ngầm vô hạn (khí/lỏng), nên hai nhóm đó đứng đầu; máy khai thác xuống cuối.
 */
export const ROLE_ORDER: Role[] = [
  'bus',
  'depotOut',
  'udpipeOut',
  'crafter',
  'envgen',
  'router',
  'bridge',
  'depotIn',
  'udpipeIn',
  'generator',
  'power',
  'sink',
  'passive',
  'source',
];

/**
 * Công trình chỉ được có **một** trên cả map (người dùng 2026-09-29): Cửa Xả Phụ Phẩm.
 * `addMachine` và việc đặt nhóm / bản vẽ (`planPieces`) đều chặn cái thứ hai.
 */
export const UNIQUE_MACHINES: ReadonlySet<string> = new Set(['liquid_recycle_gate_1']);

export function portKindsOf(def: MachineDef, dir: 'in' | 'out'): PortKind[] {
  const kinds = new Set<PortKind>();
  for (const p of def.ports) if (p.dir === dir) kinds.add(p.kind);
  return [...kinds];
}

/** Sản lượng mặc định của một máy khai thác, mỗi phút. Người dùng sửa được. */
export const DEFAULT_SOURCE_RATE = 30;
