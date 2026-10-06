import type { TabKind, TabManager } from '../editor/tabs';
import { clear, el } from './dom';
import { tr } from '../i18n';

/** Icon riêng cho hai loại tab: Map = lưới ô, Modeler = các nút nối nhau. */
const ICON: Record<TabKind, string> = {
  map: '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
  modeler:
    '<svg viewBox="0 0 24 24"><rect x="2.5" y="4" width="7" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="14.5" y="14" width="7" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9.5 7c5 0 1 10 5 10" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
};
const LABEL: Record<TabKind, string> = { map: 'Map', modeler: 'Modeler' };

const icon = (kind: TabKind): HTMLElement => {
  const s = el('span', { class: 'tb-icon' });
  s.innerHTML = ICON[kind];
  return s;
};

/** Một phần tử trên thanh tab lúc bắt đầu kéo (tab, ô tên nhóm, hoặc cả khung nhóm khi kéo nhóm). */
interface DragItem {
  el: HTMLElement;
  /** Tab: id tab; ô tên nhóm / khung nhóm: id nhóm. */
  id: string;
  kind: 'tab' | 'label' | 'group';
  /** Chỗ bên trái **khi đã bỏ phần đang kéo ra** (các phần sau dồn lên). */
  cl: number;
  /** Chỗ bên trái lúc bắt đầu kéo. */
  orig: number;
  w: number;
  /** Phần tử nằm **trước** khe thả (con trỏ đã đi qua nó). */
  before: boolean;
}

interface DragPlan {
  kind: 'tab' | 'group';
  /** Tab đang kéo, hoặc nhóm đang kéo. */
  id: string;
  el: HTMLElement;
  orig: number;
  /** Bề ngang chỗ phải chừa ra (phần đang kéo + khe). */
  dw: number;
  items: DragItem[];
  /** Thả vào giữa tab này ⇒ ghép nhóm (chỉ khi kéo tab). */
  groupWith: string | null;
}

/**
 * Thanh tab kiểu Chrome sát mép dưới (người dùng 2026-09-29): mỗi tab = icon loại + tên + nút đóng;
 * bấm chuột giữa cũng đóng; kéo để đổi thứ tự; **chuột phải để đổi tên** (Enter lưu, Esc thôi). Nút "+" nhỏ ngay bên phải các tab mở menu **Map /
 * Modeler** ⇒ tab trống mới.
 *
 * **Nhóm tab** (người dùng 2026-10-03): kéo một tab thả vào **giữa** một tab khác (Map hoặc Modeler) ⇒ ghép nhóm; thả ở
 * khe giữa các tab ⇒ đổi chỗ (khe ngay sau ô tên nhóm / giữa hai tab của nhóm ⇒ vào nhóm; khe trước ô tên nhóm hay ngoài
 * nhóm ⇒ ra ngoài). Nhóm là **một tab lớn** bọc ngoài các tab của nó, không có nút xoá nhóm (chỉ đóng từng tab). Sát trái
 * là **ô tên nhóm**: bấm ⇒ thu gọn / mở; bấm đúp ⇒ đổi tên; **kéo ô tên ⇒ dời cả nhóm**. Nhóm thu gọn mà đang mở một tab
 * của nó ⇒ tab đó vẫn hiện trong nhóm ("một phần"); mở tab ngoài nhóm ⇒ cả nhóm thu gọn hẳn. Nhóm có tab đang mở = **nhóm
 * đang chọn**: ô tên vàng, không thì xám.
 *
 * **Kéo đổi chỗ** (người dùng 2026-10-03, làm lại): lúc bắt đầu kéo chụp lại chỗ của mọi phần tử; vị trí thả tính từ con
 * trỏ trên bản chụp đó (không theo phần tử nằm dưới con trỏ — các phần tử đang trượt nên cách cũ giật qua lại), mỗi phần
 * tử có **ngưỡng trễ** (đi qua ¾ mới trượt, quay lại qua ¼ mới trượt về) ⇒ không lặp đi lặp lại; vùng giữa tab vẫn để
 * ghép nhóm. **Thả ra đúng như đang xem trước** (không tính lại), rồi mọi thứ trượt về chỗ mới (FLIP).
 */
export function mountTabBar(root: HTMLElement, tabs: TabManager): () => void {
  let menu: HTMLElement | null = null;
  const closeMenu = (): void => {
    menu?.remove();
    menu = null;
    window.removeEventListener('mousedown', onOutside, true);
  };
  const onOutside = (e: MouseEvent): void => {
    if (menu && !menu.contains(e.target as Node) && !(e.target as HTMLElement).closest('.tb-add')) closeMenu();
  };
  /** Bấm một lần ⇒ thu gọn / mở (chờ một nhịp để bấm đúp không bị tính thành hai lần bấm). */
  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  /** Đổi tên nhóm tại chỗ. */
  const startGroupRename = (gid: string, label: HTMLElement): void => {
    const g = tabs.groups.find((x) => x.id === gid);
    if (!g) return;
    const input = el('input', { class: 'tb-rename', type: 'text', value: g.name, maxlength: '40', placeholder: tr('Tên nhóm') });
    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      if (save) tabs.renameGroup(gid, input.value);
      render();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    // bấm trong ô nhập không được tính là bấm ô tên nhóm (thu gọn / mở)
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());
    label.replaceWith(input);
    input.focus();
    input.select();
  };

  /** Đổi tên tại chỗ: thay tên tab bằng ô nhập. */
  const startRename = (id: string, titleEl: HTMLElement): void => {
    const t = tabs.tabs.find((x) => x.id === id);
    if (!t) return;
    const input = el('input', { class: 'tb-rename', type: 'text', value: t.title, maxlength: '60' });
    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      if (save) tabs.rename(id, input.value);
      render();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // phím tắt của bản vẽ không chạy khi đang gõ tên
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    titleEl.replaceWith(input);
    input.focus();
    input.select();
  };

  /** Tab trong nhóm đang hiện (nhóm thu gọn chỉ hiện tab đang mở) — để biết tab nào vừa ẩn / vừa hiện mà chạy hiệu ứng. */
  const groupVisible = (): Set<string> =>
    new Set(tabs.tabs.filter((t) => t.group && (!tabs.groups.find((g) => g.id === t.group)?.collapsed || t.id === tabs.activeId)).map((t) => t.id));
  let lastVisible: Set<string> | null = null;
  let closing = false;
  const reduced = (): boolean => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const tabNode = (id: string): HTMLElement | null => root.querySelector<HTMLElement>(`.tb-tab[data-id="${CSS.escape(id)}"]`);

  /**
   * Vẽ lại thanh tab, có **hiệu ứng đóng / mở nhóm** (người dùng 2026-10-03): tab sắp ẩn (thu gọn nhóm, hoặc nhóm thu gọn
   * mà chuyển sang tab ngoài nhóm) co bề ngang về 0 và mờ đi rồi mới vẽ lại; tab vừa hiện (mở nhóm) nở ra từ 0.
   */
  const render = (afterClose = false): void => {
    const next = groupVisible();
    if (closing) return; // đang co: vẽ lại một lần khi co xong (lúc đó đọc trạng thái mới nhất)
    if (lastVisible && !afterClose && !reduced()) {
      const leaving = [...lastVisible].filter((id) => !next.has(id) && tabs.tabs.some((t) => t.id === id && t.group)).map(tabNode).filter((n): n is HTMLElement => !!n);
      if (leaving.length > 0) {
        closing = true;
        const anims = leaving.map((n) => {
          n.style.overflow = 'hidden';
          return n.animate(
            [
              { width: `${n.offsetWidth}px`, minWidth: '0px', opacity: 1 },
              { width: '0px', minWidth: '0px', paddingLeft: '0px', paddingRight: '0px', opacity: 0 },
            ],
            { duration: 200, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
          );
        });
        const done = Promise.race([Promise.all(anims.map((a) => a.finished.catch(() => undefined))), new Promise((r) => setTimeout(r, 320))]);
        void done.then(() => {
          closing = false;
          render(true); // vẽ lại thật, không co thêm lần nữa
        });
        return;
      }
    }
    draw();
    // tab vừa hiện trong nhóm (mở nhóm) ⇒ nở ra từ bề ngang 0
    if (lastVisible && !reduced())
      for (const id of next) {
        if (lastVisible.has(id)) continue;
        const n = tabNode(id);
        if (!n) continue;
        const w = n.offsetWidth;
        n.style.overflow = 'hidden';
        const a = n.animate(
          [
            { width: '0px', minWidth: '0px', paddingLeft: '0px', paddingRight: '0px', opacity: 0 },
            { width: `${w}px`, minWidth: '0px', opacity: 1 },
          ],
          { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
        );
        a.onfinish = () => (n.style.overflow = '');
      }
    lastVisible = next;
  };

  // ---------------------------------------------------------------- kéo đổi chỗ (tab hoặc cả nhóm)
  const GAP = 2;
  let plan: DragPlan | null = null;
  const strip = (): HTMLElement | null => root.querySelector<HTMLElement>('.tb-strip');
  const shift = (n: HTMLElement, dx: number): void => {
    n.style.transform = Math.abs(dx) > 0.01 ? `translateX(${dx}px)` : '';
  };
  const tabOf = (id: string): ReturnType<typeof tabs.tabs.find> => tabs.tabs.find((x) => x.id === id);
  const canGroup = (dragId: string, targetId: string): boolean => {
    const a = tabOf(dragId);
    const b = tabOf(targetId);
    return !!a && !!b && a !== b && !(a.group && a.group === b.group);
  };

  /** Chụp lại chỗ mọi phần tử lúc bắt đầu kéo. */
  const startDrag = (kind: 'tab' | 'group', id: string, node: HTMLElement): void => {
    const s = strip();
    if (!s) return;
    const all =
      kind === 'tab'
        ? [...s.querySelectorAll<HTMLElement>('.tb-tab[data-id], .tb-group-name')]
        : [...s.querySelectorAll<HTMLElement>(':scope > .tb-tab[data-id], :scope > .tb-group')];
    const src = all.indexOf(node);
    const rect = node.getBoundingClientRect();
    const dw = rect.width + (kind === 'group' ? 8 : GAP);
    const items: DragItem[] = [];
    all.forEach((n, j) => {
      if (j === src) return;
      const r = n.getBoundingClientRect();
      const isLabel = n.classList.contains('tb-group-name');
      const isGroup = n.classList.contains('tb-group');
      const gid = isLabel ? n.closest<HTMLElement>('.tb-group')!.dataset.group! : isGroup ? n.dataset.group! : n.dataset.id!;
      items.push({ el: n, id: gid, kind: isLabel ? 'label' : isGroup ? 'group' : 'tab', orig: r.left, cl: r.left - (j > src ? dw : 0), w: r.width, before: j < src });
    });
    plan = { kind, id, el: node, orig: rect.left, dw, items, groupWith: null };
    s.classList.add('reordering');
    requestAnimationFrame(() => node.classList.add('dragging'));
    if (kind === 'group') node.classList.add('dragging');
  };

  /** Con trỏ ở `x`: cập nhật bên nào của khe từng phần tử nằm (có ngưỡng trễ), rồi dời các phần tử cho khớp. */
  const dragOver = (x: number, target: Element | null): void => {
    const p0 = plan;
    if (!p0) return;
    for (const it of p0.items) {
      if (it.before && x < it.cl + it.w * 0.25) it.before = false;
      else if (!it.before && x > it.cl + p0.dw + it.w * 0.75) it.before = true;
    }
    // các phần tử "trước khe" phải liền nhau từ đầu
    const p = p0.items.findIndex((it) => !it.before);
    const cut = p < 0 ? p0.items.length : p;
    p0.items.forEach((it, i) => (it.before = i < cut));
    // vùng giữa một tab (ở chỗ đang hiện) ⇒ ghép nhóm
    p0.groupWith = null;
    if (p0.kind === 'tab') {
      const t = target?.closest<HTMLElement>('.tb-tab[data-id]');
      if (t && t !== p0.el && canGroup(p0.id, t.dataset.id!)) {
        const r = t.getBoundingClientRect();
        const f = (x - r.left) / Math.max(1, r.width);
        if (f > 0.25 && f < 0.75) p0.groupWith = t.dataset.id!;
      }
      for (const it of p0.items) it.el.classList.toggle('drop-group', it.kind === 'tab' && it.id === p0.groupWith);
    }
    for (const it of p0.items) shift(it.el, it.cl + (it.before ? 0 : p0.dw) - it.orig);
    const n = p0.items.length;
    const gapLeft = cut < n ? p0.items[cut]!.cl : n > 0 ? p0.items[n - 1]!.cl + p0.items[n - 1]!.w + GAP : p0.orig;
    shift(p0.el, gapLeft - p0.orig);
  };

  /** Thả: làm đúng như đang xem trước. */
  const drop = (): void => {
    const p0 = plan;
    if (!p0) return;
    const cut = p0.items.filter((it) => it.before).length;
    const next = p0.items[cut];
    const prev = p0.items[cut - 1];
    flipMove(() => {
      if (p0.kind === 'tab') {
        if (p0.groupWith) {
          tabs.groupWith(p0.id, p0.groupWith);
          return;
        }
        // khe trước ô tên nhóm ⇒ trước cả nhóm, ngoài nhóm; khe sau ô tên / giữa hai tab cùng nhóm ⇒ vào nhóm đó
        let beforeId: string | null = null;
        let group: string | null = null;
        if (next?.kind === 'label') beforeId = tabs.members(next.id)[0]?.id ?? null;
        else if (next?.kind === 'tab') {
          beforeId = next.id;
          const g = tabOf(next.id)?.group;
          if (g && ((prev?.kind === 'label' && prev.id === g) || (prev?.kind === 'tab' && tabOf(prev.id)?.group === g))) group = g;
        }
        tabs.place(p0.id, beforeId, group);
      } else {
        const rest = tabs.tabs.filter((t) => t.group !== p0.id);
        let to = rest.length;
        if (next) {
          const first = next.kind === 'group' ? tabs.members(next.id)[0]?.id : next.id;
          const i = rest.findIndex((t) => t.id === first);
          if (i >= 0) to = i;
        }
        tabs.moveGroup(p0.id, to);
      }
    });
    endDrag();
  };

  const endDrag = (): void => {
    const s = strip();
    s?.classList.remove('reordering');
    if (plan) {
      for (const it of plan.items) {
        it.el.classList.remove('drop-group');
        shift(it.el, 0);
      }
      plan.el.classList.remove('dragging');
      shift(plan.el, 0);
    }
    plan = null;
  };

  /** Đổi chỗ có **trượt**: đo chỗ đang hiện (kể cả đang xem trước), làm `fn`, rồi cho từng phần tử trượt về chỗ mới. */
  const flipMove = (fn: () => void): void => {
    const items = (): [string, HTMLElement][] => [
      ...[...root.querySelectorAll<HTMLElement>('.tb-tab[data-id]')].map((n) => [n.dataset.id!, n] as [string, HTMLElement]),
      ...[...root.querySelectorAll<HTMLElement>('.tb-group[data-group]')].map((g) => [`g:${g.dataset.group}`, g.querySelector<HTMLElement>('.tb-group-name')!] as [string, HTMLElement]),
    ];
    const before = new Map(items().map(([k, n]) => [k, n.getBoundingClientRect().left]));
    fn();
    if (reduced()) return;
    for (const [k, n] of items()) {
      const b = before.get(k);
      if (b === undefined) continue;
      const dx = b - n.getBoundingClientRect().left;
      if (Math.abs(dx) > 0.5) n.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    }
  };

  // một bộ nghe cho cả thanh tab (gắn một lần — `draw` chỉ dựng lại phần bên trong)
  root.addEventListener('dragover', (e) => {
    if (!plan) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dragOver(e.clientX, e.target as Element);
  });
  root.addEventListener('drop', (e) => {
    if (!plan) return;
    e.preventDefault();
    drop();
  });

  const draw = (): void => {
    clear(root);
    const stripEl = el('div', { class: 'tb-strip' });
    tabs.tabs.forEach((t, i) => {
      const active = t.id === tabs.activeId;
      const dirty = tabs.dirty(t);
      const group = t.group ? tabs.groups.find((g) => g.id === t.group) : undefined;
      // nhóm: khung "tab lớn" bọc các tab của nhóm, mở đầu bằng ô tên — tạo khi gặp tab đầu tiên của nhóm
      let host: HTMLElement = stripEl;
      if (group) {
        if (tabs.tabs[i - 1]?.group !== group.id) {
          const members = tabs.members(group.id);
          const selected = members.some((x) => x.id === tabs.activeId);
          const collapsed = !!group.collapsed;
          const label = el('span', { class: 'tb-group-text' }, group.name || tr('{0} tab', members.length));
          const name = el(
            'div',
            {
              class: `tb-group-name${group.name ? '' : ' unnamed'}`,
              draggable: 'true',
              title: tr('Nhóm tab — bấm: {0} · bấm đúp: đổi tên · kéo: dời cả nhóm. Map trong nhóm mô phỏng chung kho tổng và điện', collapsed ? tr('mở nhóm') : tr('thu gọn nhóm')),
              ondragstart: (e: Event) => {
                // kéo ô tên ⇒ kéo cả nhóm
                if (clickTimer) clearTimeout(clickTimer);
                clickTimer = null;
                (e as DragEvent).dataTransfer?.setData('text/plain', group.id);
                const wrap = (e.currentTarget as HTMLElement).closest<HTMLElement>('.tb-group')!;
                startDrag('group', group.id, wrap);
              },
              ondragend: () => endDrag(),
              onclick: () => {
                if (clickTimer) clearTimeout(clickTimer);
                clickTimer = setTimeout(() => {
                  clickTimer = null;
                  tabs.toggleGroup(group.id);
                }, 230);
              },
              ondblclick: () => {
                if (clickTimer) clearTimeout(clickTimer);
                clickTimer = null;
                startGroupRename(group.id, label);
              },
            },
            el('span', { class: 'tb-group-caret' }, collapsed ? '▸' : '▾'),
            label,
          );
          // thu gọn hẳn (không còn tab nào hiện sau ô tên) ⇒ ô tên đứng một mình, cạnh phải như cạnh phải tab con
          const alone = collapsed && !selected;
          stripEl.append(el('div', { class: `tb-group${selected ? ' selected' : ''}${collapsed ? ' collapsed' : ''}${alone ? ' alone' : ''}`, 'data-group': group.id }, name));
        }
        host = stripEl.querySelector<HTMLElement>(`.tb-group[data-group="${group.id}"]`)!;
        // nhóm thu gọn: chỉ còn tab đang mở (nếu nó thuộc nhóm) — "mở một phần"
        if (group.collapsed && !active) return;
      }
      const tab = el(
        'div',
        {
          class: `tb-tab ${t.kind}${active ? ' active' : ''}${group ? ' grouped' : ''}`,
          'data-id': t.id,
          title: `${LABEL[t.kind]} — ${t.title}${dirty ? tr(' (chưa lưu vào thư viện)') : ''}`,
          draggable: 'true',
          onclick: () => tabs.activate(t.id),
          onauxclick: (e: Event) => {
            if ((e as MouseEvent).button === 1) void tabs.close(t.id);
          },
          ondragstart: (e: Event) => {
            (e as DragEvent).dataTransfer?.setData('text/plain', t.id);
            startDrag('tab', t.id, e.currentTarget as HTMLElement);
          },
          ondragend: () => endDrag(),
          oncontextmenu: (e: Event) => {
            e.preventDefault();
            const titleEl = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.tb-title');
            if (titleEl) startRename(t.id, titleEl);
          },
        },
        icon(t.kind),
        el('span', { class: 'tb-title' }, t.title),
        dirty ? el('span', { class: 'tb-dirty', title: tr('Chưa lưu vào thư viện') }, '●') : null,
        el(
          'button',
          {
            class: 'tb-close',
            title: tr('Đóng tab'),
            onclick: (e: Event) => {
              e.stopPropagation();
              void tabs.close(t.id);
            },
          },
          '×',
        ),
      );
      host.append(tab);
    });
    const add = el(
      'button',
      {
        class: 'tb-add',
        title: tr('Tab mới — Map hoặc Modeler'),
        onclick: () => {
          if (menu) return closeMenu();
          menu = el(
            'div',
            { class: 'tb-menu' },
            ...(['map', 'modeler'] as const).map((kind) =>
              el(
                'button',
                {
                  class: 'tb-menu-item',
                  onclick: () => {
                    closeMenu();
                    tabs.newTab(kind);
                  },
                },
                icon(kind),
                el('span', {}, LABEL[kind]),
              ),
            ),
          );
          const r = add.getBoundingClientRect();
          menu.style.left = `${Math.round(r.left)}px`;
          menu.style.bottom = `${Math.round(window.innerHeight - r.top + 4)}px`;
          document.body.append(menu);
          window.addEventListener('mousedown', onOutside, true);
        },
      },
      '+',
    );
    stripEl.append(add);
    root.append(stripEl);
  };
  render();
  return render;
}
