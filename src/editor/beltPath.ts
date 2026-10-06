import { Grid } from '../grid/grid';
import { beltAt } from '../model/network';
import { cellKey, footprintCells, worldPorts } from '../model/geometry';
import type { BeltTile, Blueprint, Cell, Dataset, Dir4, Endpoint, PortKind } from '../model/types';
import type { BeltPlan } from './belts';
import { tr } from '../i18n';

/**
 * **Vẽ băng / ống bằng ngón tay** (app Android, người dùng 2026-10-05) — khác hẳn bản máy tính (bấm điểm đầu rồi tự
 * tìm đường ≤ 3 góc tới con trỏ):
 *  - đường đi **đúng theo các ô ngón tay đi qua**; ô ở đầu ngón tay là **đầu ống**, rẽ theo hướng ngón tay rẽ;
 *  - đi ngược lại vào một trong **2 ô liền trước** ⇒ tua đầu ống ngược về đó;
 *  - ô vướng vật cản thì đầu ống đứng lại; ngón tay đi qua vật cản **quá 4 ô** ⇒ **ngắt ống** (thôi theo ngón tay cho
 *    tới khi nhấc ngón);
 *  - gặp băng / ống cùng loại: **giống bản máy tính** (`belts.ts`) — cắt **vuông góc** qua một ô **thẳng** ⇒ đặt **cầu**
 *    (đi qua cầu thì không rẽ được ở đó); ô góc hoặc đi dọc tuyến cũ ⇒ **đè** lên;
 *  - bắt đầu trên thân máy ⇒ đi ra qua ô trước một **cổng ra** cùng loại (đúng hướng cổng); đi vào máy qua ô trước một
 *    **cổng vào** cùng loại (đúng hướng cổng) ⇒ kết thúc vào cổng đó; bắt đầu trên một ô cùng loại ⇒ thay ô đó (nối tiếp).
 * Không sửa bản vẽ: `plan()` trả về một `BeltPlan` như bản máy tính để xem trước (cả cầu) và `commitPlan` khi bấm Đặt.
 */

/** Ngón tay đi qua vật cản quá chừng này ô liền nhau ⇒ ngắt ống. */
export const BREAK_CELLS = 4;

type NodeKind = 'free' | 'overwrite' | 'bridge';
interface PathNode {
  cell: Cell;
  /** Hướng đi **vào** ô này (`null` = ô đầu tiên bắt đầu ở ô trống, chưa biết hướng). */
  dir: Dir4 | null;
  kind: NodeKind;
}

const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.z === b.z;
/** Hướng từ `a` sang ô kề `b`; không kề nhau ⇒ `null`. */
function dirTo(a: Cell, b: Cell): Dir4 | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (Math.abs(dx) + Math.abs(dz) !== 1) return null;
  return dz < 0 ? 0 : dx > 0 ? 1 : dz > 0 ? 2 : 3;
}

export class BeltPath {
  private nodes: PathNode[] = [];
  private grid: Grid;
  /** Bắt đầu trên thân máy: đợi ngón tay đi ra khỏi máy qua một cổng ra. */
  private waitMachine: number | null = null;
  private finger: Cell | null = null;
  private blocked = 0;
  private toDir: Dir4 | null = null;
  from?: Endpoint;
  to?: Endpoint;
  replace?: BeltTile;
  /** Ngón tay đã đi qua vật cản quá `BREAK_CELLS` ô. */
  broken = false;
  /** Lý do gần nhất đầu ống không đi tiếp được (để báo). */
  reason = '';

  constructor(
    private bp: Blueprint,
    private ds: Dataset,
    readonly kind: PortKind,
  ) {
    this.grid = Grid.fromBlueprint(bp, ds);
  }

  private get layer(): 0 | 1 {
    return this.kind === 'pipe' ? 1 : 0;
  }

  get empty(): boolean {
    return this.nodes.length === 0;
  }

  /** Ô đầu ống (ô cuối của đường), hoặc `null`. */
  get head(): Cell | null {
    return this.nodes[this.nodes.length - 1]?.cell ?? null;
  }

  /** Máy (không phải đặt sẵn) có ô `c`. */
  private machineAt(c: Cell): { uid: number; def: NonNullable<ReturnType<Dataset['machines']['get']>>; m: Blueprint['machines'][number] } | null {
    for (const m of this.bp.machines) {
      const def = this.ds.machines.get(m.machineId);
      if (def && footprintCells(m, def).some((f) => same(f, c))) return { uid: m.uid, def, m };
    }
    return null;
  }

  /**
   * Đặt ngón tay xuống ô `c` để bắt đầu (hoặc nối tiếp khi `c` là đầu ống / ô kề nó). Trả về `false` nếu không bắt đầu
   * được ở đó (lý do ở `reason`).
   */
  begin(c: Cell): boolean {
    this.broken = false;
    this.blocked = 0;
    this.finger = c;
    const head = this.head;
    if (head && (same(head, c) || dirTo(head, c) !== null)) {
      // nối tiếp đường đang vẽ dở
      if (!same(head, c)) this.step(c, head);
      return true;
    }
    this.nodes = [];
    this.from = this.to = this.replace = undefined;
    this.toDir = null;
    this.waitMachine = null;
    const mac = this.machineAt(c);
    if (mac) {
      this.waitMachine = mac.uid;
      return true;
    }
    const hit = beltAt(this.bp, this.kind, c);
    if (hit) {
      // ô băng / ống có sẵn: đoạn mới bắt đầu bằng chính ô đó (thay nó), nhận hàng đúng hướng cũ
      this.replace = hit.tile;
      this.nodes = [{ cell: c, dir: hit.tile.in, kind: 'free' }];
      return true;
    }
    if (this.usableFree(c)) {
      this.nodes = [{ cell: c, dir: null, kind: 'free' }];
      return true;
    }
    this.reason = tr('Không bắt đầu được ở đây');
    return false;
  }

  /** Ngón tay đi tới ô `c` (có thể nhảy nhiều ô): đi từng ô kề nhau từ ô trước đó tới `c`. */
  moveTo(c: Cell): void {
    let prev = this.finger ?? c;
    if (same(prev, c)) return;
    // đi bậc thang 4 hướng, trục nào còn xa hơn thì đi trước
    while (!same(prev, c)) {
      const dx = c.x - prev.x;
      const dz = c.z - prev.z;
      const next = Math.abs(dx) >= Math.abs(dz) ? { x: prev.x + Math.sign(dx), z: prev.z } : { x: prev.x, z: prev.z + Math.sign(dz) };
      this.step(next, prev);
      prev = next;
    }
    this.finger = c;
  }

  private usableFree(c: Cell): boolean {
    if (this.kind === 'belt' && !this.grid.inCore(c)) return false;
    return this.grid.free(this.layer, c);
  }

  /** Một bước ngón tay từ ô `prev` sang ô kề `c`. */
  private step(c: Cell, prev: Cell): void {
    this.finger = c;
    if (this.broken) return;
    if (this.waitMachine !== null) {
      this.leaveMachine(c, prev);
      return;
    }
    const head = this.head;
    if (!head) return;
    if (this.to) {
      // đã cắm vào cổng: ngón tay quay lại đầu ống ⇒ rút ra
      if (same(c, head)) {
        this.to = undefined;
        this.toDir = null;
      }
      return;
    }
    if (same(c, head)) {
      this.blocked = 0;
      return;
    }
    // đi ngược vào 1 trong 2 ô liền trước ⇒ tua đầu ống về đó
    const n = this.nodes.length;
    for (const back of [2, 3]) {
      if (n >= back && same(this.nodes[n - back]!.cell, c)) {
        this.nodes.length = n - back + 1;
        this.blocked = 0;
        return;
      }
    }
    const d = dirTo(head, c);
    if (d === null) return this.hitObstacle(tr('Đầu ống ở chỗ khác — rê từ đầu ống'));
    const last = this.nodes[n - 1]!;
    if (last.kind === 'bridge' && last.dir !== d) return this.hitObstacle(tr('Không rẽ được ngay trên cầu'));
    if (last.dir !== null && (last.dir + 2) % 4 === d) return this.hitObstacle(tr('Không quay đầu được'));
    // vào máy: chỉ qua đúng ô trước một cổng vào cùng loại, đúng hướng cổng
    const mac = this.machineAt(c);
    if (mac) {
      const port = worldPorts(mac.m, mac.def).find(
        (p) => p.dir === 'in' && p.kind === this.kind && (p.virtual || (same(p.attach, head) && p.flow === d)) && p.key !== mac.def.activatorPort,
      );
      const act = worldPorts(mac.m, mac.def).find((p) => p.dir === 'in' && p.kind === this.kind && !p.virtual && p.key === mac.def.activatorPort && same(p.attach, head) && p.flow === d);
      const target = port ?? act;
      if (target && last.kind !== 'bridge') {
        this.to = { uid: mac.uid, portKey: target.key };
        this.toDir = d;
        this.blocked = 0;
        return;
      }
      return this.hitObstacle(tr('Máy chặn — đi vào máy qua ô trước một cổng vào'));
    }
    if (this.nodes.some((v, i) => i < n - 1 && same(v.cell, c))) return this.hitObstacle(tr('Đường tự cắt chính nó'));
    const kind = this.classify(c, d);
    if (!kind) return this.hitObstacle(tr('Vướng vật cản'));
    // ô đầu tiên chưa có hướng: lấy theo bước đầu
    if (last.dir === null) last.dir = d;
    this.nodes.push({ cell: c, dir: d, kind });
    this.blocked = 0;
    this.reason = '';
  }

  /** Ô `c` đi theo hướng `d` vào được không, và bằng cách nào. */
  private classify(c: Cell, d: Dir4): NodeKind | null {
    const hit = beltAt(this.bp, this.kind, c);
    if (hit) {
      const t = hit.tile;
      // cắt vuông góc qua ô thẳng ⇒ cầu (cầu ống chiếm cả mặt đất nên mặt đất phải trống)
      if (t.in === t.out && t.in % 2 !== d % 2) return this.kind === 'belt' || this.grid.free(0, c) ? 'bridge' : null;
      if (this.kind === 'belt' && !this.grid.inCore(c)) return null;
      return 'overwrite';
    }
    return this.usableFree(c) ? 'free' : null;
  }

  private hitObstacle(reason: string): void {
    this.reason = reason;
    this.blocked++;
    if (this.blocked > BREAK_CELLS) {
      this.broken = true;
      this.reason = tr('Ngắt ống — đi qua vật cản quá {0} ô', BREAK_CELLS);
    }
  }

  /** Bắt đầu trên thân máy: ra khỏi máy qua ô trước một cổng ra cùng loại, đúng hướng cổng. */
  private leaveMachine(c: Cell, prev: Cell): void {
    const mac = this.machineAt(c);
    if (mac && mac.uid === this.waitMachine) return; // còn trong máy
    const owner = this.bp.machines.find((v) => v.uid === this.waitMachine);
    const def = owner ? this.ds.machines.get(owner.machineId) : undefined;
    const d = dirTo(prev, c);
    if (!owner || !def || d === null) return this.hitObstacle(tr('Không bắt đầu được ở đây'));
    const port = worldPorts(owner, def).find((p) => p.dir === 'out' && p.kind === this.kind && (p.virtual || (same(p.attach, c) && p.flow === d)));
    const kind = this.classify(c, d);
    if (!port || !kind || kind === 'bridge') {
      this.waitMachine = null;
      return this.hitObstacle(port ? tr('Ô trước cổng ra đang vướng') : tr('Không có cổng ra {0} ở mặt này của máy', this.kind === 'pipe' ? tr('ống') : tr('băng')));
    }
    this.waitMachine = null;
    this.from = { uid: owner.uid, portKey: port.key };
    this.nodes = [{ cell: c, dir: d, kind }];
  }

  /** Phương án để xem trước / đặt; `null` khi chưa có ô nào. */
  plan(): BeltPlan | null {
    const n = this.nodes.length;
    if (n === 0) return null;
    const cells = this.nodes.map((v) => v.cell);
    const ins: Dir4[] = [];
    const outs: Dir4[] = [];
    this.nodes.forEach((v, i) => {
      const next = this.nodes[i + 1];
      const into = v.dir ?? next?.dir ?? this.toDir ?? 1;
      ins.push(into);
      outs.push(next ? next.dir! : (this.toDir ?? into));
    });
    const bridges = this.nodes.filter((v) => v.kind === 'bridge').map((v) => v.cell);
    const headOnBridge = this.nodes[n - 1]!.kind === 'bridge' && !this.to;
    return {
      ok: !headOnBridge,
      kind: this.kind,
      cells,
      ins,
      outs,
      reason: headOnBridge ? tr('Đầu ống đang nằm trên cầu — rê thêm một ô') : undefined,
      endsAtPort: !!this.to,
      replace: this.replace,
      from: this.from,
      to: this.to,
      bridges,
    };
  }

  /** Số ô sẽ đặt (không kể cầu). */
  get length(): number {
    return this.nodes.length;
  }
}

/** Khoá ô để so sánh nhanh (dùng ở test). */
export const pathKeys = (p: BeltPlan | null): string[] => (p ? p.cells.map(cellKey) : []);
