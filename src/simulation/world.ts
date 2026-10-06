/**
 * **Simulation — thế giới nhiều map** (người dùng 2026-10-03): các map trong cùng một **nhóm tab** được mô phỏng cùng
 * nhau, **chung kho tổng và chung điện** (hàng nạp vào kho ở map này rút ra được ở map kia; điện phát của mọi map cộng
 * chung, thiếu điện ⇒ cả nhóm dừng). Map lẻ (không nhóm) = thế giới một map.
 *
 * Thời gian luôn đi theo **lưới cố định** `GRID` giây (`advanceTo`): bản tính sẵn 24 giờ (worker) và bản đang phát
 * trên màn hình bước y hệt nhau ⇒ kết quả trùng khít, tua tới đâu cũng đúng như đã tính.
 */
import type { Blueprint, Dataset } from '../model/types';
import { createSimulation, DEFAULT_DEPOT_CAPACITY, emptyTotals, simBase, type SimBase, type SimOptions, type SimShared, type SimState, type SimTotals, type Simulation } from './engine';

/** Bước thời gian của lưới (giây) — 0,25 s: đủ mịn (mọi chuyển hàng có mốc riêng), 24 giờ map lớn tính trong vài chục giây. */
export const GRID = 0.25;
const EPS = 1e-6;

export interface WorldMap {
  /** Khoá của map (id tab). */
  key: string;
  bp: Blueprint;
  /** Kết quả bộ giải + mạng băng đã tính sẵn (tuỳ chọn). */
  base?: SimBase;
}

export interface WorldState {
  now: number;
  depotStock: Map<string, number>;
  maps: Map<string, SimState>;
}

export interface SimWorld {
  readonly now: number;
  readonly sims: Map<string, Simulation>;
  readonly options: SimOptions;
  /** Chạy tới lúc `t` theo lưới `GRID` (không vượt `t`; dừng ở điểm lưới cuối cùng ≤ `t`). */
  advanceTo(t: number): void;
  /** Một bước tới điểm lưới kế tiếp. */
  stepGrid(): void;
  state(): WorldState;
  /** Tổng cộng của cả nhóm. */
  totals(): SimTotals;
}

/** Điểm lưới kế tiếp sau `t`. */
export const nextGrid = (t: number): number => (Math.floor(t / GRID + EPS) + 1) * GRID;

export function createWorld(maps: WorldMap[], ds: Dataset, opts: SimOptions = {}, prev?: WorldState): SimWorld {
  const shared: SimShared = { depotStock: new Map(prev?.depotStock ?? []), blackout: false };
  const options: SimOptions = { ...opts, shared };
  const sims = new Map<string, Simulation>();
  for (const m of maps) {
    const ps = prev?.maps.get(m.key);
    // map mới thêm vào nhóm giữa chừng: bắt đầu rỗng nhưng cùng đồng hồ
    const from: SimState | undefined = ps ?? (prev ? { ...emptyState(), now: prev.now } : undefined);
    sims.set(m.key, createSimulation(m.bp, ds, options, from, m.base ?? simBase(m.bp, ds)));
  }
  let now = prev?.now ?? 0;
  const depotCap = opts.depotCapacity ?? DEFAULT_DEPOT_CAPACITY;
  const gen = opts.infiniteDepot === false ? Object.entries(opts.depotGen ?? {}).filter(([, v]) => v > 0) : [];

  const stepTo = (t: number): void => {
    // kho tổng tự sinh (người dùng 2026-10-04): cộng đều theo thời gian, không quá sức chứa mỗi món
    if (gen.length > 0) {
      const dt = t - now;
      for (const [item, perMin] of gen) shared.depotStock.set(item, Math.min(depotCap, (shared.depotStock.get(item) ?? 0) + (perMin * dt) / 60));
    }
    // điện cả nhóm: trạm điện châm pin trước, rồi so điện phát (lõi + trạm đang cháy) với điện cần
    for (const s of sims.values()) s.beginStep();
    let demand = 0;
    let supply = 0;
    let enforce = false;
    for (const s of sims.values()) {
      demand += s.powerDemand();
      supply += s.powerSupply();
      enforce ||= s.enforcePower;
    }
    shared.blackout = enforce && demand > supply + 1e-9;
    for (const s of sims.values()) s.stepTo(t);
    now = t;
  };

  const world: SimWorld = {
    get now() {
      return now;
    },
    sims,
    options,
    stepGrid() {
      stepTo(Math.round(nextGrid(now) / GRID) * GRID);
    },
    advanceTo(t) {
      while (nextGrid(now) <= t + EPS) world.stepGrid();
    },
    state() {
      const ms = new Map<string, SimState>();
      for (const [k, s] of sims) {
        const st = s.state();
        ms.set(k, { ...st, depotStock: new Map() });
      }
      return { now, depotStock: shared.depotStock, maps: ms };
    },
    totals() {
      const out = emptyTotals();
      for (const s of sims.values())
        for (const key of Object.keys(out) as (keyof SimTotals)[]) for (const [k, v] of s.totals[key]) out[key].set(k, (out[key].get(k) ?? 0) + v);
      return out;
    },
  };
  return world;
}

/** Trạng thái rỗng (map mới vào nhóm giữa chừng). */
function emptyState(): SimState {
  return { now: 0, rot: 0, sewageIn: 0, depotStock: new Map(), totals: emptyTotals(), nodes: new Map(), lanes: [] };
}
