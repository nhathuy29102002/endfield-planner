import { describe, expect, it } from 'vitest';
import { CATEGORY_ORDER, categoryOf, machineMeta } from '../src/model/categories';
import { placeableMachines } from '../src/model/dataset';
import { ds } from './helpers';

describe('nhóm máy như EnKAD', () => {
  it('mọi máy đặt được đều thuộc một trong 7 nhóm', () => {
    for (const d of placeableMachines(ds)) {
      const c = categoryOf(d);
      if (c !== null) expect(CATEGORY_ORDER).toContain(c);
    }
  });

  it('đúng nhóm theo quickBarType của game', () => {
    const cat = (id: string): string | null => categoryOf(ds.machines.get(id)!);
    expect(cat('log_splitter')).toBe('Logistic Unit');
    expect(cat('log_pipe_connector')).toBe('Logistic Unit');
    expect(cat('furnance_1')).toBe('Production I');
    expect(cat('filling_powder_mc_1')).toBe('Production II');
    expect(cat('unloader_1')).toBe('Depot Access');
    expect(cat('miner_1')).toBe('Resourcing');
    expect(cat('power_diffuser_1')).toBe('Power');
    expect(cat('carrier_1')).toBe('Miscellaneous');
  });

  it('dòng phụ: kích thước · điện', () => {
    expect(machineMeta(ds.machines.get('filling_powder_mc_1')!)).toBe('6x4 · 20MW');
  });
});
