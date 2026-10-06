import { describe, expect, it } from 'vitest';
import { AppState } from '../src/editor/state';
import { TabManager, mapFingerprint, serializeTabs, type TabRecord } from '../src/editor/tabs';
import { addMachine } from '../src/editor/ops';
import { emptyBlueprint } from '../src/model/types';

function setup(confirmAnswer = true): { state: AppState; tabs: TabManager; asked: string[] } {
  const state = new AppState();
  const asked: string[] = [];
  const first: TabRecord = { id: 't1', kind: 'map', title: 'Map 1', saved: null, map: { bp: emptyBlueprint(), terrain: {}, undo: [], redo: [] } };
  const tabs = new TabManager(
    state,
    {
      onActivate: () => {},
      camera: () => ({ x: 1, z: 2, cell: 18, turns: 0 }),
      confirm: async (text) => {
        asked.push(text);
        return confirmAnswer;
      },
      changed: () => {},
    },
    { tabs: [first], active: 't1' },
  );
  tabs.start();
  return { state, tabs, asked };
}
const place = (state: AppState, x: number): void =>
  state.mutate('đặt', () => void addMachine(state.bp, state.ds, state.terrain, 'furnance_1', x, 5, 0));

describe('thanh tab Map / Modeler (người dùng 2026-09-29)', () => {
  it('mỗi tab Map giữ bản vẽ và hoàn tác riêng khi chuyển qua lại', () => {
    const { state, tabs } = setup();
    place(state, 5);
    const second = tabs.newTab('map');
    expect(state.bp.machines.length).toBe(0);
    place(state, 10);
    place(state, 20);
    tabs.activate('t1');
    expect(state.bp.machines.length).toBe(1);
    expect(state.canUndo).toBe(true);
    tabs.activate(second.id);
    expect(state.bp.machines.length).toBe(2);
    state.undo();
    expect(state.bp.machines.length).toBe(1);
  });

  it('tab mới: tên Map N / Modeler N; camera của tab cũ được cất', () => {
    const { tabs } = setup();
    expect(tabs.newTab('modeler').title).toBe('Modeler 1');
    expect(tabs.newTab('map').title).toBe('Map 2');
    expect(tabs.tabs[0]!.map!.camera).toEqual({ x: 1, z: 2, cell: 18, turns: 0 });
  });

  it('đóng tab chưa lưu ⇒ hỏi lại; huỷ thì tab còn nguyên', async () => {
    const { state, tabs, asked } = setup(false);
    place(state, 5);
    expect(tabs.dirty(tabs.active)).toBe(true);
    expect(await tabs.close('t1')).toBe(false);
    expect(asked.length).toBe(1);
    expect(tabs.tabs.length).toBe(1);
  });

  it('đã lưu vào thư viện ⇒ không hỏi; đóng tab cuối ⇒ mở một Map trống', async () => {
    const { state, tabs, asked } = setup(false);
    place(state, 5);
    tabs.describeActive({ title: 'Nhà máy A', saved: true });
    expect(tabs.active.title).toBe('Nhà máy A');
    expect(tabs.dirty(tabs.active)).toBe(false);
    expect(await tabs.close('t1')).toBe(true);
    expect(asked.length).toBe(0);
    expect(tabs.tabs.length).toBe(1);
    expect(state.bp.machines.length).toBe(0);
  });

  it('lưu thành chuỗi: đủ các tab, map dạng file bản vẽ', () => {
    const { state, tabs } = setup();
    place(state, 5);
    tabs.newTab('modeler');
    tabs.persistNow();
    const data = JSON.parse(serializeTabs(tabs.tabs, tabs.activeId)) as { tabs: { kind: string; map?: string }[] };
    expect(data.tabs.map((t) => t.kind)).toEqual(['map', 'modeler']);
    expect(JSON.parse(data.tabs[0]!.map!).blueprint.machines.length).toBe(1);
    expect(mapFingerprint(state.bp, state.terrain)).toContain('furnance_1');
  });
});

/**
 * Nhóm tab (người dùng 2026-10-03, lần 2): kéo tab thả vào giữa tab khác ⇒ nhóm; Map và Modeler đều ghép được; nhóm thu
 * gọn / mở bằng ô tên; nhóm dưới hai tab tự bỏ; lưu cùng các tab.
 */
describe('nhóm tab (người dùng 2026-10-03)', () => {
  it('ghép Map với Modeler, các tab cùng nhóm luôn liền nhau, thu gọn / mở, lưu và đọc lại', () => {
    const { tabs } = setup();
    const m2 = tabs.newTab('map');
    const md = tabs.newTab('modeler');
    const m3 = tabs.newTab('map');
    expect(tabs.groupWith(m3.id, 't1')).toBe(true);
    expect(tabs.groupWith(md.id, 't1')).toBe(true); // Modeler ghép được với nhóm Map
    const gid = tabs.groupOf('t1')!.id;
    expect(tabs.members(gid).map((t) => t.id)).toEqual(['t1', m3.id, md.id]);
    expect(tabs.tabs.map((t) => t.id)).toEqual(['t1', m3.id, md.id, m2.id]); // liền nhau
    tabs.toggleGroup(gid);
    expect(tabs.groups[0]!.collapsed).toBe(true);
    const stored = JSON.parse(serializeTabs(tabs.tabs, tabs.activeId, tabs.groups));
    expect(stored.groups[0].collapsed).toBe(true);
    expect(stored.tabs.filter((t: { group?: string }) => t.group === gid).length).toBe(3);
  });

  it('nhóm còn một tab ⇒ tự bỏ nhóm; kéo ra chỗ trống ⇒ rời nhóm', () => {
    const { tabs } = setup();
    const m2 = tabs.newTab('map');
    tabs.groupWith(m2.id, 't1');
    tabs.leaveGroup(m2.id);
    expect(tabs.groups.length).toBe(0);
    expect(tabs.tabs.every((t) => !t.group)).toBe(true);
  });
});

describe('nhóm tab — lưu / đọc lại (lỗi 2026-10-03: tab Modeler mất nhóm sau khi tải lại)', () => {
  it('tab Modeler trong nhóm vẫn ở nhóm sau khi lưu rồi đọc lại', async () => {
    const { tabs } = setup();
    const md = tabs.newTab('modeler');
    tabs.groupWith(md.id, 't1');
    const store = new Map<string, string>();
    const g = globalThis as unknown as { localStorage?: Storage };
    const old = g.localStorage;
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as Storage;
    try {
      store.set('efp:tabs', serializeTabs(tabs.tabs, tabs.activeId, tabs.groups));
      const { loadTabs } = await import('../src/editor/tabs');
      const back = loadTabs()!;
      expect(back.tabs.find((t) => t.id === md.id)!.group).toBe(tabs.groupOf('t1')!.id);
      expect(back.groups!.length).toBe(1);
    } finally {
      g.localStorage = old;
    }
  });
});

describe('dời cả nhóm tab (người dùng 2026-10-03: kéo ô tên nhóm)', () => {
  it('các tab của nhóm giữ thứ tự, chèn liền nhau ở chỗ mới', () => {
    const { tabs } = setup();
    const a = tabs.newTab('map');
    const b = tabs.newTab('modeler');
    const c = tabs.newTab('map');
    tabs.groupWith(a.id, 't1'); // nhóm: t1, a
    const gid = tabs.groupOf('t1')!.id;
    // ra cuối
    tabs.moveGroup(gid, 99);
    expect(tabs.tabs.map((t) => t.id)).toEqual([b.id, c.id, 't1', a.id]);
    // về giữa b và c
    tabs.moveGroup(gid, 1);
    expect(tabs.tabs.map((t) => t.id)).toEqual([b.id, 't1', a.id, c.id]);
    expect(tabs.members(gid).map((t) => t.id)).toEqual(['t1', a.id]);
  });
});

describe('kéo đổi chỗ tab — thả đúng chỗ đang xem trước (người dùng 2026-10-03)', () => {
  it('place: đưa tab lẻ lên đầu (trước cả nhóm), vào nhóm ở đầu nhóm, ra cuối ngoài nhóm', () => {
    const { tabs } = setup();
    const a = tabs.newTab('map');
    const b = tabs.newTab('map');
    tabs.groupWith(a.id, 't1'); // nhóm: t1, a — b lẻ ở cuối
    const gid = tabs.groupOf('t1')!.id;
    tabs.place(b.id, 't1', null); // khe trước ô tên nhóm ⇒ đầu thanh, ngoài nhóm
    expect(tabs.tabs.map((t) => t.id)).toEqual([b.id, 't1', a.id]);
    expect(tabs.tabs[0]!.group).toBeUndefined();
    tabs.place(b.id, 't1', gid); // khe ngay sau ô tên ⇒ đầu nhóm
    expect(tabs.members(gid).map((t) => t.id)).toEqual([b.id, 't1', a.id]);
    tabs.place(b.id, null, null); // ra cuối, ngoài nhóm
    expect(tabs.tabs.map((t) => t.id)).toEqual(['t1', a.id, b.id]);
    expect(tabs.tabs[2]!.group).toBeUndefined();
  });
});
