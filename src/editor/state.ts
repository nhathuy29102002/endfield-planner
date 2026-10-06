import type { Terrain, TerrainKind } from '../grid/grid';
import { loadDataset } from '../model/dataset';
import type { Blueprint, Cell, Dataset, Facing, PlacedMachine, PortKind } from '../model/types';
import type { StartSpec } from './belts';
import type { PlaceMode } from './placement';
import { emptySelection, pruneSelection, singleMachine, type Pieces, type Selection, type Turns } from './group';
import { emptyBlueprint } from '../model/types';
import { solve, type SolveResult } from '../sim/solver';
import { tr } from '../i18n';

export type Tool =
  | { kind: 'select' }
  /**
   * Preview máy bám theo con trỏ. `mode` phân biệt đặt máy mới / di chuyển / sao chép;
   * `sourceUid` là máy đang được di chuyển hoặc sao chép.
   */
  | {
      kind: 'place';
      machineId: string;
      rot: Facing;
      mode?: PlaceMode;
      sourceUid?: number;
      /**
       * Chế độ máy (A/B) của máy đang nhấc lên — Tab đổi được khi di chuyển / sao chép (người
       * dùng 2026-09-29). Áp vào máy lúc đặt xuống; preview cổng theo chế độ này.
       */
      machineMode?: 'A' | 'B';
      /**
       * Dán một van / cầu từ bộ nhớ tạm (Ctrl+V, người dùng 2026-10-02): máy mẫu để chép thiết lập (lọc, lưu lượng…)
       * vào máy đặt mới — đi đường đặt máy nên tự xoay theo tuyến và thay được ô băng / ống.
       */
      template?: PlacedMachine;
    }
  /**
   * Đặt băng chuyền / ống. `start` trống = đang chờ bấm điểm đầu; có `start` = đầu đã
   * chọn, đầu cuối chạy theo con trỏ, bấm lần nữa để đặt.
   */
  | { kind: 'link'; linkKind: PortKind; start?: StartSpec }
  /**
   * Nhấc cả nhóm đang chọn (`state.sel`) lên như một khối cứng. Nhóm được nhấc tại ô
   * `anchor`, đặt xuống tại ô dưới con trỏ, quay `turns` × 90° quanh ô đó.
   * `drag` = đang giữ chuột trái kéo máy: thả chuột là đặt (hoặc huỷ nếu vướng).
   */
  | {
      kind: 'group';
      mode: 'move' | 'copy';
      anchor: Cell;
      turns: Turns;
      drag?: boolean;
      /** Chế độ mới (Tab khi đang cầm / kéo nhóm, người dùng 2026-09-30) theo uid máy — áp vào lúc đặt xuống. */
      modes?: Record<number, 'A' | 'B'>;
    }
  /**
   * Đặt một bản vẽ dạng module từ thư viện: preview `pieces` theo con trỏ (ô `anchor` của
   * bộ nằm dưới con trỏ), bấm trái để đặt — đặt liên tiếp được tới khi Esc.
   */
  | { kind: 'stamp'; name: string; pieces: Pieces; anchor: Cell; turns: Turns }
  | { kind: 'erase' }
  /**
   * Chỉ định đầu kia của cặp ống ngầm **ngay trên map** (người dùng 2026-09-29, thay cho danh sách
   * thả xuống): máy ghép được tô xanh, bấm một máy để ghép với máy `uid`; Esc để thôi.
   */
  | { kind: 'pair'; uid: number }
  | { kind: 'terrain'; paint: TerrainKind | 'clear' };

export interface Snapshot {
  blueprint: string;
  terrain: string;
}

/**
 * - `view` — chỉ vẽ lại canvas. Dùng cho di chuột, pan, zoom: xảy ra hàng chục lần
 *   mỗi giây, dựng lại DOM ở đây thì giao diện đứng hình.
 * - `ui`   — dựng lại panel nhưng **không** giải lại. Dùng cho chọn máy và đổi công
 *   cụ: bản vẽ không đổi nên kết quả tính toán vẫn nguyên, nhưng bảng bên phải phải
 *   cập nhật theo máy đang chọn.
 * - `data` — bản vẽ đã đổi: giải lại rồi dựng lại tất cả.
 */
export type EmitMode = 'view' | 'ui' | 'data';

/** Một map đang mở trong một tab: bản vẽ + địa hình + lịch sử hoàn tác. */
export interface MapDoc {
  bp: Blueprint;
  terrain: Terrain;
  undo: Snapshot[];
  redo: Snapshot[];
}

/**
 * Trạng thái ứng dụng + undo/redo.
 *
 * Undo dùng ảnh chụp JSON thay vì lệnh nghịch đảo: bản vẽ 70×70 chỉ vài chục KB,
 * mà cách này không thể sai lệch dần theo thời gian như cặp lệnh làm/gỡ.
 */
export class AppState {
  readonly ds: Dataset = loadDataset();
  bp: Blueprint = emptyBlueprint();
  terrain: Terrain = {};
  tool: Tool = { kind: 'select' };
  /** Mọi thứ đang chọn: máy + ô băng/ống. */
  sel: Selection = emptySelection();
  /** Thông báo ngắn hiện ở thanh dưới. */
  message = '';
  /**
   * Camera đang xoay mấy lần 90° (Ctrl+R) — bản sao của `camera.turns` để sơ đồ máy trong
   * cửa sổ Máy xoay khớp với cái người dùng đang thấy trên bản vẽ.
   */
  viewTurns: 0 | 1 | 2 | 3 = 0;
  result: SolveResult;

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private listeners = new Set<(mode: EmitMode) => void>();

  constructor() {
    this.result = solve(this.bp, this.ds);
  }

  subscribe(fn: (mode: EmitMode) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(mode: EmitMode = 'data'): void {
    if (mode === 'data') this.result = solve(this.bp, this.ds);
    for (const fn of this.listeners) fn(mode);
  }

  private snapshot(): Snapshot {
    return { blueprint: JSON.stringify(this.bp), terrain: JSON.stringify(this.terrain) };
  }

  /** Bọc mọi thay đổi vào đây để có undo. */
  mutate(label: string, fn: () => void): void {
    const before = this.snapshot();
    const messageBefore = this.message;
    fn();
    // thao tác tự đặt thông báo riêng (vd. "đã đặt 11 ô — kéo tiếp…") thì giữ nó,
    // đừng ghi đè bằng nhãn chung dùng cho lịch sử hoàn tác
    const custom = this.message !== messageBefore;
    const after = this.snapshot();
    if (before.blueprint === after.blueprint && before.terrain === after.terrain) {
      // không đổi gì (vd. đặt máy bị chặn) — không vào lịch sử, nhưng vẫn phải báo lý do
      if (custom) this.emit('ui');
      return;
    }
    this.undoStack.push(before);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    if (!custom) this.message = label;
    this.emit();
  }

  private restore(s: Snapshot): void {
    this.bp = JSON.parse(s.blueprint) as Blueprint;
    this.terrain = JSON.parse(s.terrain) as Terrain;
    this.sel = pruneSelection(this.sel, this.bp);
  }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(this.snapshot());
    this.restore(s);
    this.message = tr('Đã hoàn tác');
    this.emit();
  }

  redo(): void {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.snapshot());
    this.restore(s);
    this.message = tr('Đã làm lại');
    this.emit();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Tài liệu đang mở — bản vẽ, địa hình và **lịch sử hoàn tác** — để thanh tab cất đi khi chuyển
   * sang tab khác (mỗi tab Map có hoàn tác riêng).
   */
  exportDoc(): MapDoc {
    return { bp: this.bp, terrain: this.terrain, undo: this.undoStack, redo: this.redoStack };
  }

  /** Mở lại một tài liệu đã cất (chuyển tab): giữ nguyên lịch sử hoàn tác của nó. */
  importDoc(doc: MapDoc, label: string): void {
    this.bp = doc.bp;
    this.terrain = doc.terrain;
    this.undoStack = doc.undo;
    this.redoStack = doc.redo;
    this.sel = emptySelection();
    this.tool = { kind: 'select' };
    this.message = label;
    this.emit();
  }

  /** Nạp bản vẽ mới (mở file, dán mã) — xoá luôn lịch sử cũ cho khỏi lẫn. */
  load(bp: Blueprint, terrain: Terrain, label: string): void {
    this.undoStack = [];
    this.redoStack = [];
    this.bp = bp;
    this.terrain = terrain;
    this.sel = emptySelection();
    this.tool = { kind: 'select' };
    this.message = label;
    this.emit();
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.emit('ui');
  }

  /**
   * Máy đang chọn khi chọn **đúng một máy** (không kèm ô băng/ống nào) — bảng thuộc tính
   * và các thao tác một máy (M/C/R/Del kiểu cũ) dựa vào đây. Chọn nhiều thì `null`.
   */
  get selection(): number | null {
    return singleMachine(this.sel);
  }

  select(uid: number | null): void {
    this.sel = emptySelection();
    if (uid !== null) this.sel.machines.add(uid);
    this.emit('ui');
  }

  setSelection(sel: Selection): void {
    this.sel = sel;
    this.emit('ui');
  }

  notify(message: string): void {
    this.message = message;
    this.emit('ui');
  }
}
