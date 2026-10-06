import { describe, expect, it } from 'vitest';
import { setFilterRate, setOutletItem, setSource } from '../src/editor/ops';
import { solve } from '../src/sim/solver';
import { ds, put, scene, wire } from './helpers';

/**
 * Người dùng 2026-10-06: máy chỉ đẩy hàng ra (cửa xả ống, bơm, máy tách khí…) — hệ số chạy = lượng thật đang ra ÷ lượng
 * tối đa. Cửa xả ống tối đa 120 mà chỉ ra 60 ⇒ 50%, không phải 100%.
 */
describe('hệ số chạy của máy xả / bơm', () => {
  const limited = (id: string, setup: (s: ReturnType<typeof scene>, uid: number) => void): { alone: number; half: number } => {
    const s = scene(60, 60);
    const a = put(s, id, 5, 5);
    setup(s, a);
    const alone = solve(s.bp, ds).machines.get(a)!.utilization;
    const c = put(s, 'log_pipe_conditioner', 20, 6);
    setFilterRate(s.bp, ds, c, 60);
    const st = put(s, 'liquid_storager_1', 30, 5);
    wire(s, a, 0, c, 0);
    wire(s, c, 0, st, 0);
    const f = solve(s.bp, ds).machines.get(a)!;
    expect(f.outputs[0]).toMatchObject({ nominal: 120, actual: 60 });
    return { alone, half: f.utilization };
  };

  it('cửa xả ống dẫn: 60 / 120 ⇒ 50%; chưa nối ⇒ 0%', () => {
    expect(limited('udpipe_unloader_1', (s, a) => setOutletItem(s.bp, ds, a, 'out0', 'item_liquid_water'))).toEqual({ alone: 0, half: 0.5 });
  });

  it('máy bơm chất lỏng (khai báo 120/phút): 60 / 120 ⇒ 50%', () => {
    expect(limited('pump_1', (s, a) => setSource(s.bp, a, 'item_liquid_water', 120))).toEqual({ alone: 0, half: 0.5 });
  });
});
