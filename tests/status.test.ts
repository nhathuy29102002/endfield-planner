import { describe, expect, it } from 'vitest';
import { setRecipe } from '../src/editor/ops';
import { machineStatus } from '../src/render/status';
import { solve } from '../src/sim/solver';
import { ds, put, scene, source, wire } from './helpers';

describe('trạng thái hiển thị của máy', () => {
  it('mất điện: máy cần điện mà không chạm cột/trụ nào', () => {
    const s = scene(40, 40, true);
    const f = put(s, 'furnance_1', 10, 10);
    expect(machineStatus(solve(s.bp, ds).machines.get(f))).toBe('unpowered');
    put(s, 'power_diffuser_1', 14, 10);
    expect(machineStatus(solve(s.bp, ds).machines.get(f))).not.toBe('unpowered');
  });

  it('đang sản xuất: chỉ khi có đủ đầu vào', () => {
    const s = scene(40, 40);
    put(s, 'power_diffuser_1', 15, 10); // có điện, để xét riêng chuyện đầu vào
    const f = put(s, 'furnance_1', 10, 10);
    setRecipe(s.bp, ds, f, 'furnance_carbon_enr_1');
    const out = put(s, 'storager_1', 10, 4);
    wire(s, f, 0, out, 0);
    // chưa có nguyên liệu ⇒ nhàn rỗi (ZZ)
    expect(machineStatus(solve(s.bp, ds).machines.get(f))).toBe('idle');
    // có nguyên liệu ⇒ đang sản xuất
    const src = put(s, 'miner_1', 10, 18);
    source(s, src, 'item_carbon_enr_powder', 30);
    wire(s, src, 0, f, 0);
    const flow = solve(s.bp, ds).machines.get(f)!;
    expect(machineStatus(flow)).toBe('working');
    expect(flow.outputs[0]!.itemId).toBe('item_carbon_enr');
  });

  it('thiếu môi trường xúc tác thì là nhàn rỗi, không phải đang sản xuất', () => {
    const s = scene(40, 40);
    put(s, 'power_diffuser_1', 16, 12);
    const p = put(s, 'liquid_purifier_1', 10, 10);
    setRecipe(s.bp, ds, p, 'liquid_purifier_gas_copper_enr_2'); // cần môi trường Stable
    expect(machineStatus(solve(s.bp, ds).machines.get(p))).toBe('idle');
  });

  it('kẹt (⊘): có đầu vào nhưng đầu ra không thoát kịp', () => {
    const s = scene(40, 40);
    put(s, 'power_diffuser_1', 15, 10);
    const a = put(s, 'furnance_1', 10, 10);
    setRecipe(s.bp, ds, a, 'furnance_carbon_enr_powder_1');
    s.bp.machines.find((m) => m.uid === a)!.count = 4; // làm được 120/phút, một băng ra chỉ chở 30
    const src = put(s, 'miner_1', 10, 18);
    source(s, src, 'item_plant_moss_enr_powder_1', 30);
    wire(s, src, 0, a, 0);
    const out = put(s, 'storager_1', 10, 4);
    wire(s, a, 0, out, 0);
    const flow = solve(s.bp, ds).machines.get(a)!;
    // đầu vào 30/phút, đầu ra 30/phút ⇒ hai phía hãm bằng nhau ⇒ vẫn là thiếu đầu vào
    expect(flow.limitedBy).toBe('input');

    // chặn đầu ra hẳn: xoá kho nhận ⇒ băng ra cụt ⇒ kẹt
    s.bp.machines = s.bp.machines.filter((m) => m.uid !== out);
    const jam = solve(s.bp, ds).machines.get(a)!;
    expect(jam.limitedBy).toBe('output');
    expect(machineStatus(jam)).toBe('blocked');
  });

  it('kẹt lan ngược: máy sau kẹt thì máy trước cũng kẹt, không bị nhầm thành ngủ', () => {
    const s = scene(40, 40);
    put(s, 'power_diffuser_1', 15, 14);
    const src = put(s, 'miner_1', 10, 26);
    source(s, src, 'item_plant_moss_enr_powder_1', 30);
    const a = put(s, 'furnance_1', 10, 20);
    const b = put(s, 'furnance_1', 10, 14);
    setRecipe(s.bp, ds, a, 'furnance_carbon_enr_powder_1');
    setRecipe(s.bp, ds, b, 'furnance_carbon_enr_1');
    wire(s, src, 0, a, 0);
    wire(s, a, 0, b, 0); // b không có đường ra
    const r = solve(s.bp, ds);
    expect(machineStatus(r.machines.get(b))).toBe('blocked');
    expect(machineStatus(r.machines.get(a))).toBe('blocked');
  });
});

describe('màu hai đầu ống ra', () => {
  it('máy có đúng hai đầu ống ra: vàng rồi cam; van/cầu và máy một đầu thì không', async () => {
    const { pipeOutColor, PIPE_OUT_COLORS } = await import('../src/render/portColors');
    const p = ds.machines.get('liquid_purifier_1')!;
    expect(pipeOutColor(p, 'out0')).toBe(PIPE_OUT_COLORS[0]);
    expect(pipeOutColor(p, 'out1')).toBe(PIPE_OUT_COLORS[1]);
    expect(pipeOutColor(ds.machines.get('log_pipe_splitter')!, 'out0')).toBeUndefined();
    expect(pipeOutColor(ds.machines.get('log_pipe_connector')!, 'out0')).toBeUndefined();
    expect(pipeOutColor(ds.machines.get('vaporizer_1')!, 'out0')).toBeUndefined();
  });
});
