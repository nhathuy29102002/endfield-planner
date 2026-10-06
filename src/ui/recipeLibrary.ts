import type { AppState } from '../editor/state';
import { OPEN_MODELER_EVENT } from '../editor/tabs';
import { groupItems, itemGroup, itemName, phaseOf } from '../model/dataset';
import {
  buildChain,
  consumers,
  isRawItem,
  setChosenWay,
  waysOf,
  wayKey,
  type ChainNode,
  type Way,
} from '../model/recipeBook';
import type { MachineDef, RecipeDef } from '../model/types';
import { CATALYST_ENV_LABEL } from '../model/types';
import { chainToModeler } from '../modeler/fromChain';
import { ENV_GASES, MODELER_INSERT_EVENT, emptyModeler } from '../modeler/doc';
import { confirmDialog } from './dialog';
import { tr } from '../i18n';
import { autoFocus } from '../platform';
import { clear, el } from './dom';
import { PIN_MACHINE_EVENT, pinnedMachineIds } from './palette';
import { toast } from './toast';

/**
 * **Thư viện công thức** (người dùng 2026-10-06) — mở bằng nút ba cuốn sách ở đầu bảng chọn máy. Ba màn, cùng thanh
 * đường dẫn trên cùng như "Cơ Sở Dữ Liệu Endfield" trong game (màu theo giao diện tối của app):
 *  1. **danh sách vật phẩm** chia nhóm, Sản phẩm khu phức hợp lên đầu, có ô tìm;
 *  2. **Hồ Sơ Vật Phẩm** (ảnh 1 người dùng gửi): tên, nhóm, nhãn công dụng (máy dùng nó), ảnh lớn; bên phải "Nguồn" (cách
 *     làm ra / khai thác) và "Công Thức Áp Dụng" (công thức dùng nó), nút ghim (ghim máy lên bảng chọn máy) và **Xem
 *     Chuỗi**. Dữ liệu không có đoạn mô tả vật phẩm của game ⇒ không có phần đó;
 *  3. **Chuỗi Sản Xuất** (ảnh 2, 3): cây từ nguyên liệu thô (trái) tới thành phẩm (phải), kéo để di chuyển, lăn chuột /
 *     hai ngón để thu phóng. Máy có cách khác ⇒ nút vàng **Công thức khác** mở ra mọi cách, tick "Đặt công thức mặc
 *     định" để dùng cách đó (lưu lại, dùng cả cho Model hoá). Nút **Model hoá** biến chuỗi thành sơ đồ Modeler mới.
 */
export function openRecipeLibrary(state: AppState): void {
  const ds = state.ds;
  document.querySelector('.rl-overlay')?.remove();
  const overlay = el('div', { class: 'rl-overlay', role: 'dialog' });
  const crumbs = el('div', { class: 'rl-crumbs' });
  const search = el('input', { class: 'rl-search', type: 'search', placeholder: tr('Tìm vật phẩm… (không cần dấu)') });
  const back = el('button', { class: 'rl-back', type: 'button', title: tr('Quay lại (Esc)') });
  back.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M13.5 7.5 9 12l4.5 4.5M9.5 12H17" fill="none" stroke="var(--panel)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const body = el('div', { class: 'rl-body' });
  overlay.append(el('div', { class: 'rl-top' }, crumbs, el('label', { class: 'rl-search-box' }, searchIcon(), search), back), body);
  document.body.append(overlay);
  document.body.classList.add('modal-open');

  type View = { kind: 'list' } | { kind: 'item'; item: string } | { kind: 'chain'; item: string };
  const stack: View[] = [{ kind: 'list' }];
  const go = (v: View): void => {
    stack.push(v);
    render();
  };
  const pop = (): void => {
    if (stack.length <= 1) return close();
    stack.pop();
    render();
  };
  const close = (): void => {
    window.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (!document.querySelector('.bp-overlay, .rl-overlay')) document.body.classList.remove('modal-open');
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    pop();
  };
  window.addEventListener('keydown', onKey, true);
  back.addEventListener('click', pop);
  // mọi nút trong thư viện: viền vàng khi rê chuột (CSS) và **nháy sáng khi bấm** (người dùng 2026-10-06, lần 6) — nút lớn
  // Xem Chuỗi / Mô hình hoá có hiệu ứng riêng (`flashOnPress`)
  overlay.addEventListener('pointerdown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>(PRESSABLE);
    if (!b || b.classList.contains('rl-chain-btn') || b.classList.contains('rl-model-btn')) return;
    b.classList.remove('rl-press');
    void b.offsetWidth;
    b.classList.add('rl-press');
  });
  overlay.addEventListener('animationend', (e) => (e.target as HTMLElement).classList?.remove('rl-press'));
  search.addEventListener('input', () => {
    if (stack[stack.length - 1]!.kind !== 'list') stack.splice(1);
    render();
  });
  search.addEventListener('keydown', (e) => e.stopPropagation());

  // dữ liệu wiki tải một lần (file tĩnh trong app — chạy offline được); tải xong thì vẽ lại màn đang xem
  if (!wiki)
    void fetch('wiki/items.json')
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, WikiItem>>) : null))
      .then((d) => {
        if (!d || !overlay.isConnected) return;
        wiki = d;
        render();
      })
      .catch(() => undefined);
  const render = (): void => {
    const v = stack[stack.length - 1]!;
    renderCrumbs(v);
    clear(body);
    overlay.dataset.view = v.kind;
    if (v.kind === 'list') body.append(listView());
    else if (v.kind === 'item') body.append(itemView(v.item));
    else body.append(chainView(v.item));
  };

  // ---------------------------------------------------------------- thanh đường dẫn
  const renderCrumbs = (v: View): void => {
    clear(crumbs);
    const toList = (): void => {
      stack.splice(1);
      render();
    };
    const sep = (): HTMLElement => el('span', { class: 'rl-sep' }, '›');
    const chip = (text: string, onClick?: () => void): HTMLElement =>
      onClick ? el('button', { class: 'rl-chip', type: 'button', onclick: onClick }, text) : el('span', { class: 'rl-chip last' }, text);
    const folder = el('button', { class: 'rl-folder', type: 'button', title: tr('Thư viện công thức'), onclick: toList });
    folder.innerHTML = '<svg viewBox="0 0 24 24"><path d="M2 6.5a1.5 1.5 0 0 1 1.5-1.5h6l2 2.5h9A1.5 1.5 0 0 1 22 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.5z" fill="currentColor"/></svg>';
    crumbs.append(folder, sep(), chip(tr('Cơ Sở Dữ Liệu Endfield'), v.kind === 'list' ? undefined : toList));
    if (v.kind === 'list') return;
    crumbs.append(sep(), chip(tr('Hồ Sơ Vật Phẩm'), toList), sep());
    if (v.kind === 'item') crumbs.append(chip(itemName(ds, v.item)));
    else {
      crumbs.append(
        chip(itemName(ds, v.item), () => {
          stack.pop();
          render();
        }),
        sep(),
        chip(tr('Chuỗi Sản Xuất')),
      );
    }
  };

  // ---------------------------------------------------------------- ô vật phẩm
  // ảnh độ phân giải cao + mô tả lấy từ wiki Endfield (người dùng 2026-10-06, lần 2) — chỉ dùng trong thư viện này, bộ
  // icon cũ vẫn dùng cho mọi chỗ khác; món chưa có ảnh wiki ⇒ icon cũ
  const icon = (item: string): string => (wiki?.[item]?.img ? `img/wiki/${item}.webp` : `img/itemicon/${ds.items.get(item)?.icon ?? item}.png`);
  /** Ô vật phẩm kiểu game: nền tối, dải màu đáy theo thể (rắn xanh lá, lỏng / khí xanh dương), số lượng góc dưới. */
  const tile = (item: string, count?: number, opts: { raw?: boolean; open?: boolean } = {}): HTMLElement => {
    const t = el(
      'button',
      {
        class: `rl-tile ph-${phaseOf(ds, item)}${opts.raw ? ' raw' : ''}`,
        type: 'button',
        title: itemName(ds, item),
        onclick: (e: Event) => {
          // ô không mở hồ sơ (ô trong danh sách, ô thô): để cú bấm đi tiếp lên phần tử cha (người dùng 2026-10-06 —
          // trước đây bấm đúng vào ảnh trong danh sách không mở được gì)
          if (opts.open === false) return;
          e.stopPropagation();
          go({ kind: 'item', item });
        },
      },
      el('img', { src: icon(item), alt: '', draggable: 'false' }),
      count !== undefined ? el('span', { class: 'rl-count' }, String(count)) : null,
    );
    return t;
  };
  const machineIcon = (def: MachineDef | undefined): HTMLElement =>
    el('img', { class: 'rl-micon', src: `img/items/${def?.icon ?? 'empty'}.png`, alt: '', draggable: 'false' });

  // ---------------------------------------------------------------- 1. danh sách
  const listView = (): HTMLElement => {
    const q = fold(search.value.trim());
    const ids = [...ds.items.values()]
      .filter((i) => !q || fold(`${i.name} ${i.nameVi ?? ''} ${i.nameEn ?? ''} ${i.id}`).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => i.id);
    // Sản phẩm khu phức hợp lên đầu, rồi các nhóm khác theo thứ tự sẵn có
    const groups = groupItems(ds, ids).sort((a, b) => Number(b.ids.some((i) => itemGroup(ds, i) === 'product')) - Number(a.ids.some((i) => itemGroup(ds, i) === 'product')));
    const box = el('div', { class: 'rl-list' });
    if (groups.length === 0) box.append(el('div', { class: 'rl-empty' }, tr('Không có vật phẩm nào khớp')));
    for (const g of groups) {
      const grid = el('div', { class: 'rl-grid' });
      for (const id of g.ids)
        grid.append(el('button', { class: 'rl-entry', type: 'button', onclick: () => go({ kind: 'item', item: id }) }, tile(id, undefined, { open: false }), el('span', { class: 'rl-entry-name' }, itemName(ds, id))));
      // mỗi nhóm sản phẩm là một **cửa sổ con** như cửa sổ Máy (người dùng 2026-10-06)
      box.append(
        el(
          'section',
          { class: 'rl-win' },
          el('div', { class: 'rl-win-head' }, el('span', { class: 'rl-win-title' }, g.title), el('span', { class: 'rl-win-count' }, String(g.ids.length))),
          grid,
        ),
      );
    }
    return box;
  };

  // ---------------------------------------------------------------- 2. hồ sơ vật phẩm
  /**
   * Mũi tên chuyển hoá **động** như thanh sản xuất của cửa sổ Máy (người dùng 2026-10-06): thanh xanh chạy hết một vòng
   * đúng bằng thời gian công thức (`--dur`), lặp lại; nhãn thời gian phía trên.
   */
  const arrow = (label: string, seconds: number): HTMLElement =>
    el(
      'div',
      { class: 'rl-arrow', style: `--dur: ${Math.max(0.3, seconds)}s` },
      el('div', { class: 'rl-arrow-time' }, label),
      el('div', { class: 'rl-arrow-bar' }, el('div', { class: 'rl-arrow-track' }), el('div', { class: 'rl-arrow-fill' }), el('div', { class: 'rl-arrow-head' })),
    );
  const plus = (): HTMLElement => el('span', { class: 'rl-plus' }, '+');
  /** Các ô vật phẩm, dấu **+** giữa hai ô (người dùng 2026-10-06). */
  const slots = (stacks: { itemId: string; count: number }[]): HTMLElement =>
    el('div', { class: 'rl-slots' }, ...stacks.flatMap((s, i) => (i ? [plus(), tile(s.itemId, s.count)] : [tile(s.itemId, s.count)])));
  /** Hàng công thức: [nguyên liệu + …] ⇒ mũi tên động (thời gian) ⇒ [sản phẩm + …]. */
  const recipeRow = (r: RecipeDef): HTMLElement => el('div', { class: 'rl-rrow' }, slots(r.ingredients), arrow(`${r.seconds}s`, r.seconds), slots(r.outcomes));
  const pinBtn = (machineId: string): HTMLElement => {
    const on = pinnedMachineIds(ds).includes(machineId);
    const b = el('button', { class: `rl-pin${on ? ' on' : ''}`, type: 'button', title: on ? tr('Bỏ ghim máy này khỏi bảng chọn máy') : tr('Ghim máy này lên bảng chọn máy') });
    b.innerHTML = PIN_SVG;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent(PIN_MACHINE_EVENT, { detail: machineId }));
      const now = pinnedMachineIds(ds).includes(machineId);
      b.classList.toggle('on', now);
      toast(now ? tr('Đã ghim {0}', ds.machines.get(machineId)?.name ?? machineId) : tr('Đã bỏ ghim {0}', ds.machines.get(machineId)?.name ?? machineId));
    });
    return b;
  };
  const card = (def: MachineDef | undefined, row: HTMLElement, env?: string): HTMLElement =>
    el(
      'div',
      { class: 'rl-card' },
      el(
        'div',
        { class: 'rl-card-head' },
        machineIcon(def),
        el('span', { class: 'rl-card-name' }, def?.name ?? '?'),
        env ? el('span', { class: `rl-env env-${env.toLowerCase()}` }, CATALYST_ENV_LABEL[env as keyof typeof CATALYST_ENV_LABEL] ?? env) : null,
        def ? pinBtn(def.id) : null,
      ),
      el('div', { class: 'rl-card-body' }, row),
    );
  const wayCard = (item: string, w: Way): HTMLElement => {
    if (w.kind === 'recipe') return card(ds.machines.get(w.recipe.machineId), recipeRow(w.recipe), w.recipe.catalystEnv !== 'None' ? w.recipe.catalystEnv : undefined);
    return card(
      ds.machines.get(w.machineId),
      el('div', { class: 'rl-rrow' }, el('div', { class: 'rl-slots' }, tile(item, undefined, { raw: true, open: false })), arrow(tr('khai thác'), 2), el('div', { class: 'rl-slots' }, tile(item, 1, { open: false }))),
    );
  };
  const itemView = (item: string): HTMLElement => {
    const it = ds.items.get(item);
    const group = itemGroup(ds, item);
    const groupTitle = groupItems(ds, [item])[0]?.title ?? '';
    const uses = consumers(ds, item);
    // nhãn công dụng: các loại máy dùng vật phẩm này (Lắp, Nghiền, Đúc… — như hàng nhãn dưới tên trong game)
    const tags = [...new Set(uses.map((r) => USE_TAG[r.machineId] ?? ds.machines.get(r.machineId)?.name ?? r.machineId))].slice(0, 6);
    const ways = waysOf(ds, item);
    const left = el(
      'div',
      { class: 'rl-info' },
      el('div', { class: 'rl-name' }, itemName(ds, item)),
      el('div', { class: 'rl-sub' }, groupTitle),
      tags.length ? el('div', { class: 'rl-tags' }, ...tags.map((t) => el('span', { class: 'rl-tag' }, tr(t)))) : null,
      el('div', { class: 'rl-rule' }),
      el(
        'div',
        { class: 'rl-facts' },
        // mô tả của game (tiếng Anh, từ wiki)
        wiki?.[item]?.d1 ? el('div', { class: 'rl-desc' }, `- ${wiki[item]!.d1}`) : null,
        wiki?.[item]?.d2 ? el('div', { class: 'rl-desc lore' }, `- ${wiki[item]!.d2}`) : null,
        el('div', {}, `- ${tr('Thể')}: ${tr(phaseOf(ds, item) === 'solid' ? 'Rắn' : phaseOf(ds, item) === 'liquid' ? 'Lỏng' : 'Khí')}`),
        it?.fuel ? el('div', {}, `- ${tr('Đốt trong trạm điện: {0} MW trong {1} s mỗi đơn vị', it.fuel.power, it.fuel.seconds)}`) : null,
        it?.producesEnv ? el('div', {}, `- ${tr('Nạp vào Máy Khuếch Tán tạo môi trường {0}', CATALYST_ENV_LABEL[it.producesEnv])}`) : null,
        group === 'raw' || ways.every((w) => w.kind === 'source') ? el('div', {}, `- ${tr('Chỉ lấy được bằng khai thác, không sản xuất được')}`) : null,
      ),
      el('div', { class: 'rl-hero' }, el('div', { class: 'rl-hero-mark' }), el('img', { src: icon(item), alt: '', draggable: 'false' })),
    );
    const side = el('div', { class: 'rl-side' });
    const scroll = el('div', { class: 'rl-side-scroll' });
    scroll.append(el('div', { class: 'rl-sec' }, tr('Nguồn')));
    if (ways.length === 0) scroll.append(el('div', { class: 'rl-none' }, tr('Không có cách làm ra — sản phẩm thô')));
    for (const w of ways) scroll.append(wayCard(item, w));
    scroll.append(el('div', { class: 'rl-sec' }, tr('Công Thức Áp Dụng')));
    if (uses.length === 0) scroll.append(el('div', { class: 'rl-none' }, tr('Chưa công thức nào dùng vật phẩm này')));
    for (const r of uses) scroll.append(card(ds.machines.get(r.machineId), recipeRow(r), r.catalystEnv !== 'None' ? r.catalystEnv : undefined));
    const chainBtn = flashOnPress(el('button', { class: 'rl-chain-btn', type: 'button', onclick: () => setTimeout(() => go({ kind: 'chain', item }), 160) }, el('span', { class: 'rl-chain-ico' }), tr('Xem Chuỗi')));
    side.append(scroll, chainBtn);
    return el('div', { class: 'rl-item' }, left, side);
  };

  // ---------------------------------------------------------------- 3. chuỗi sản xuất
  /** Máy đang mở "Công thức khác" (theo khoá nút trong cây). */
  const expanded = new Set<string>();
  /** Máy đang mở rộng thành **thẻ công thức** đầy đủ (khoá phần tử máy `…#w:<cách>`). */
  const opened = new Set<string>();
  /** Máy (khoá nút cây) đang hiện chuỗi làm khí cho máy khuếch tán phía trên. */
  const envOpen = new Set<string>();
  const chainView = (item: string): HTMLElement => {
    const viewport = el('div', { class: 'rl-viewport' });
    const world = el('div', { class: 'rl-world' });
    const svgNS = 'http://www.w3.org/2000/svg';
    viewport.append(world);
    let tf = { x: 0, y: 0, k: 1 };
    const apply = (): void => {
      world.style.transform = `translate(${tf.x}px, ${tf.y}px) scale(${tf.k})`;
    };
    let first = true;
    const motion = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    /**
     * Dựng lại cây. Mỗi phần tử có khoá ổn định (`data-k`) ⇒ chuyển động kiểu FLIP (người dùng 2026-10-06, lần 2):
     *  - mở / đóng "Công thức khác", mở rộng / thu gọn thẻ công thức: phần tử cũ trượt tới chỗ mới (bị đẩy ra), phần tử
     *    mới hiện dần, phần tử bỏ đi mờ dần; thẻ mở rộng lớn dần từ cỡ ô máy cũ;
     *  - chọn công thức mặc định mới / mở chuỗi khí môi trường (`chosen`): các phần tử cũ dạt ra trước, rồi dây chuyền mới
     *    **mở dần sang trái** (cột càng xa càng hiện sau).
     * Cỡ cột và khoảng hàng co giãn theo phần tử thật (đo sau khi dựng) ⇒ thẻ mở rộng đẩy các nút xung quanh ra.
     */
    const draw = (chosen?: { key: string; col: number }): void => {
      const before = new Map<string, { x: number; y: number; w: number; h: number; node: HTMLElement }>();
      for (const n of world.querySelectorAll<HTMLElement>('[data-k]'))
        before.set(n.dataset.k!, { x: parseFloat(n.style.left), y: parseFloat(n.style.top), w: n.offsetWidth, h: n.offsetHeight, node: n });
      clear(world);
      const root = buildChain(ds, item);
      /** Một phần tử: `dy`, `h` tính từ đỉnh hàng; `head` = phần nổi phía trên (dải môi trường, ô "Công thức mặc định"). */
      type Rec = { node: HTMLElement; col: number; row: number; dy: number; w: number; h: number; head: number; card?: boolean; below?: Rec };
      const els: Rec[] = [];
      const COLW = (c: number): number => (c % 2 === 0 ? TILE : MACH_W);
      const put = (node: HTMLElement, key: string, col: number, row: number, dy: number, w: number, h: number, card = false): Rec => {
        node.dataset.k = key;
        const rec: Rec = { node, col, row, dy, w, h, head: 0, card };
        els.push(rec);
        return rec;
      };
      let maxCol = 0;
      const links: { from: Rec; to: Rec; alt?: boolean }[] = [];
      const envLinks: { from: Rec; to: Rec; env: string }[] = [];
      /**
       * Ô máy. Bấm ⇒ **mở rộng** thành thẻ công thức (người dùng 2026-10-06, lần 6): `<máy> | <vào> + <vào> ⏵ <ra> + <ra>`,
       * thời gian chạy trên mũi tên, cả thẻ viền màu môi trường. Thẻ của máy đang dùng có dải môi trường bấm được ⇒ hiện chuỗi
       * làm khí cho máy khuếch tán (`envOpen`).
       */
      const machineNode = (n: ChainNode, w: Way, key: string, col: number, head?: HTMLElement, alt = false): { node: HTMLElement; card: boolean } => {
        const def = ds.machines.get(w.kind === 'recipe' ? w.recipe.machineId : w.machineId);
        const env = w.kind === 'recipe' && w.recipe.catalystEnv !== 'None' ? w.recipe.catalystEnv : null;
        const big = opened.has(key);
        const envText = env ? `${tr('MÔI TRƯỜNG')} ${ENV_SHORT[env] ?? CATALYST_ENV_LABEL[env].toUpperCase()}` : '';
        const showing = envOpen.has(n.key);
        const band = env
          ? big && !alt
            ? el(
                'button',
                {
                  class: `rl-mach-env rl-env-btn env-${env.toLowerCase()}${showing ? ' open' : ''}`,
                  type: 'button',
                  title: tr('Bấm: hiện / ẩn chuỗi làm khí cho máy khuếch tán'),
                  onclick: (e: Event) => {
                    e.stopPropagation();
                    if (envOpen.has(n.key)) {
                      envOpen.delete(n.key);
                      draw();
                    } else {
                      envOpen.add(n.key);
                      draw({ key: '', col: col + 1 });
                    }
                  },
                },
                el('span', {}, envText),
                el('span', { class: 'rl-env-chev' }, '▲'),
              )
            : el('div', { class: `rl-mach-env env-${env.toLowerCase()}` }, envText)
          : null;
        const top = head || band ? el('div', { class: 'rl-mach-top' }, head, band) : null;
        const toggle = (e: Event): void => {
          e.stopPropagation();
          if (opened.has(key)) opened.delete(key);
          else opened.add(key);
          draw();
        };
        const cls = `rl-mach${env ? ` env env-${env.toLowerCase()}` : ''}${big ? ' rl-xcard' : ''}`;
        const title = big ? tr('Bấm: thu gọn') : tr('Bấm: xem đủ công thức');
        if (!big)
          return {
            node: el(
              'div',
              { class: cls, title, onclick: toggle },
              top,
              el('div', { class: 'rl-mach-main' }, machineIcon(def), el('span', { class: 'rl-mach-name' }, def?.name ?? '?')),
              el('div', { class: 'rl-mach-time' }, w.kind === 'recipe' ? `⏱ ${w.recipe.seconds}s` : tr('khai thác')),
            ),
            card: false,
          };
        const plus = (): HTMLElement => el('span', { class: 'rl-plus' }, '+');
        const list = (stacks: { itemId: string; count: number }[], raw = false): HTMLElement[] =>
          stacks.flatMap((s, i) => {
            const t = tile(s.itemId, s.count, { raw: raw || undefined, open: !raw });
            return i ? [plus(), t] : [t];
          });
        const ins = w.kind === 'recipe' ? list(w.recipe.ingredients) : list([{ itemId: n.item, count: 1 }], true);
        const outs = w.kind === 'recipe' ? list(w.recipe.outcomes) : list([{ itemId: n.item, count: 1 }]);
        const arrow = el('span', { class: 'rl-xarrow' }, el('span', { class: 'rl-xtime' }, w.kind === 'recipe' ? `${w.recipe.seconds}s` : tr('khai thác')));
        arrow.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 40 10"><path d="M1 5h34" stroke="currentColor" stroke-width="1.6"/><path d="M33 1l6 4-6 4z" fill="currentColor"/></svg>');
        return {
          node: el(
            'div',
            { class: cls, title, onclick: toggle },
            top,
            el(
              'div',
              { class: 'rl-xmain' },
              el('div', { class: 'rl-xm' }, machineIcon(def), el('span', { class: 'rl-xm-name' }, def?.name ?? '?')),
              el('span', { class: 'rl-xsep' }),
              ...ins,
              arrow,
              ...outs,
            ),
          ),
          card: true,
        };
      };
      /**
       * Đặt nút `n` (một vật phẩm) ở cột `col`, bắt đầu từ hàng `row`; trả về số hàng đã dùng. `noTile` ⇒ không có ô thành
       * phẩm, máy là gốc (chuỗi khí môi trường: máy làm khí nối thẳng xuống dải môi trường của thẻ).
       */
      const place = (n: ChainNode, col: number, row: number, path: Set<string>, noTile = false): { used: number; ref: Rec } => {
        maxCol = Math.max(maxCol, col);
        if (!n.way) return { used: 1, ref: put(tile(n.item, undefined, { raw: isRawItem(ds, n.item) }), `${n.key}#i`, noTile ? col + 1 : col, row, TILE_DY, TILE, TILE) };
        const cur = wayKey(n.way);
        const mk = `${n.key}#w:${cur}`;
        let r = row;
        // chuỗi làm khí cho máy khuếch tán: phía trên, máy làm khí cùng cột với máy cần môi trường (đường chấm thẳng lên)
        let gas: Rec | null = null;
        const env = n.way.kind === 'recipe' ? n.way.recipe.catalystEnv : 'None';
        const next = new Set(path).add(n.item);
        if (env !== 'None' && opened.has(mk) && envOpen.has(n.key)) {
          const g = Object.keys(ENV_GASES).find((x) => ENV_GASES[x] === env);
          if (g && !next.has(g)) {
            const sub = place(buildChain(ds, g, `${n.key}@env/${g}`, next), col, r, next, true);
            gas = sub.ref;
            r += sub.used;
          }
        }
        const r0 = r;
        // nguyên liệu trước: thành phẩm + máy nằm **giữa** nguyên liệu đầu và cuối (người dùng 2026-10-06, lần 4)
        const subs: Rec[] = [];
        if (n.way.kind === 'recipe')
          for (const c of n.inputs) {
            const sub = place(c, col + 2, r, next);
            subs.push(sub.ref);
            r += sub.used;
          }
        let used = Math.max(r0 + 1, r) - row;
        const R = subs.length ? (Math.min(...subs.map((x) => x.row)) + Math.max(...subs.map((x) => x.row))) / 2 : r0;
        const ref = noTile ? null : put(tile(n.item, undefined, { raw: false }), `${n.key}#i`, col, R, TILE_DY, TILE, TILE);
        const open = expanded.has(n.key) && n.ways.length > 1;
        const head = open ? el('label', { class: 'rl-default on' }, tr('Công thức mặc định'), el('span', { class: 'rl-check on' }, '✓')) : undefined;
        const mn = machineNode(n, n.way, mk, col, head);
        const m = put(mn.node, mk, col + 1, R, MACH_DY, MACH_W, MACH_H, mn.card);
        if (ref) links.push({ from: m, to: ref });
        for (const x of subs) links.push({ from: x, to: m });
        if (gas) envLinks.push({ from: gas, to: m, env });
        maxCol = Math.max(maxCol, col + 2);
        if (n.way.kind === 'source') links.push({ from: put(tile(n.item, undefined, { raw: true, open: false }), `${n.key}#raw`, col + 2, r0, TILE_DY, TILE, TILE), to: m });
        if (n.ways.length > 1) {
          // nút vàng "Công thức khác" dưới máy; đang mở ⇒ các cách khác xếp tiếp bên dưới, nút thành "Ẩn"
          const pill = (label: string, up: boolean): HTMLElement =>
            el(
              'button',
              {
                class: `rl-more${up ? ' up' : ''}`,
                type: 'button',
                onclick: (e: Event) => {
                  e.stopPropagation();
                  if (expanded.has(n.key)) expanded.delete(n.key);
                  else expanded.add(n.key);
                  draw();
                },
              },
              label,
              el('span', { class: 'rl-more-ico' }, up ? '⌃' : '☰'),
            );
          if (!open) put(pill(tr('Công thức khác'), false), `${n.key}#pill`, col + 1, R, 0, MACH_W, PILL_H).below = m;
          else {
            let ar = row + used;
            let last = m;
            for (const w of n.ways) {
              const wk = wayKey(w);
              if (wk === cur) continue;
              const pick = el('label', { class: 'rl-default' }, tr('Đặt công thức mặc định'), el('span', { class: 'rl-check' }));
              pick.addEventListener('click', (e) => {
                e.stopPropagation();
                setChosenWay(n.item, wk);
                toast(tr('Đã đặt công thức mặc định cho {0}', itemName(ds, n.item)));
                draw({ key: `${n.key}#w:${wk}`, col: col + 1 });
              });
              const ak = `${n.key}#w:${wk}`;
              const an = machineNode(n, w, ak, col, pick, true);
              const am = put(an.node, ak, col + 1, ar, MACH_DY, MACH_W, MACH_H, an.card);
              last = am;
              if (ref) links.push({ from: am, to: ref, alt: true });
              const ins = w.kind === 'recipe' ? w.recipe.ingredients.map((s) => s.itemId) : [n.item];
              ins.forEach((id, i) => {
                const t = put(tile(id, undefined, { raw: w.kind === 'source' || isRawItem(ds, id) }), `${n.key}#w:${wk}#in${i}`, col + 2, ar + i, TILE_DY, TILE, TILE);
                links.push({ from: t, to: am, alt: true });
              });
              ar += Math.max(1, ins.length);
            }
            put(pill(tr('Ẩn'), true), `${n.key}#pill`, col + 1, last.row, 0, MACH_W, PILL_H).below = last;
            used = ar - row;
          }
        }
        return { used, ref: ref ?? m };
      };
      place(root, 0, 0, new Set());

      // dựng vào trang rồi đo: thẻ mở rộng cỡ theo nội dung, phần nổi trên đầu máy
      for (const e of els) {
        e.node.style.left = '0px';
        e.node.style.top = '0px';
        if (!e.card) e.node.style.width = `${e.w}px`;
        world.append(e.node);
      }
      for (const e of els) {
        const top = e.node.querySelector<HTMLElement>(':scope > .rl-mach-top');
        e.head = top ? top.offsetHeight : 0;
        if (e.card) {
          e.w = e.node.offsetWidth;
          e.h = e.node.offsetHeight;
          e.dy = CY - e.h / 2;
        }
      }
      for (const e of els) if (e.below) e.dy = e.below.dy + e.below.h + 7;

      // cột → toạ độ x (cột rộng theo phần tử rộng nhất): thành phẩm bên phải, nguyên liệu lùi dần sang trái
      const colW: number[] = [];
      for (let c = 0; c <= maxCol; c++) colW[c] = COLW(c);
      for (const e of els) colW[e.col] = Math.max(colW[e.col] ?? 0, e.w);
      const xOf: number[] = [];
      let acc = 0;
      for (let c = 0; c <= maxCol; c++) {
        acc += colW[c]!;
        xOf[c] = -acc;
        acc += GAP;
      }
      const left = -acc + GAP;
      // hàng → toạ độ y: như cũ (ROW mỗi hàng), nhưng hai phần tử liền nhau trong cùng cột chồng lên nhau (thẻ mở rộng cao)
      // ⇒ đẩy mọi hàng phía dưới xuống vừa đủ
      const ext = new Map<string, { col: number; row: number; top: number; bottom: number }>();
      for (const e of els) {
        const k = `${e.col}|${e.row}`;
        const g = ext.get(k) ?? { col: e.col, row: e.row, top: Infinity, bottom: -Infinity };
        g.top = Math.min(g.top, e.dy - e.head);
        g.bottom = Math.max(g.bottom, e.dy + e.h);
        ext.set(k, g);
      }
      const need = new Map<number, { from: number; gap: number }[]>();
      const byCol = new Map<number, { row: number; top: number; bottom: number }[]>();
      for (const g of ext.values()) byCol.set(g.col, [...(byCol.get(g.col) ?? []), g]);
      for (const gs of byCol.values()) {
        gs.sort((a, b) => a.row - b.row);
        for (let i = 1; i < gs.length; i++) need.set(gs[i]!.row, [...(need.get(gs[i]!.row) ?? []), { from: gs[i - 1]!.row, gap: gs[i - 1]!.bottom - gs[i]!.top + 8 }]);
      }
      const rows = [...new Set(els.map((e) => e.row))].sort((a, b) => a - b);
      const yRow = new Map<number, number>();
      rows.forEach((v, i) => {
        let y = i ? yRow.get(rows[i - 1]!)! + ROW * (v - rows[i - 1]!) : v * ROW;
        for (const c of need.get(v) ?? []) y = Math.max(y, yRow.get(c.from)! + c.gap);
        yRow.set(v, y);
      });
      const box = (r: Rec): { x: number; y: number; w: number; h: number } => ({ x: xOf[r.col]! - left + (colW[r.col]! - r.w) / 2, y: yRow.get(r.row)! + r.dy, w: r.w, h: r.h });
      const W = acc;
      const H = Math.max(...els.map((e) => box(e).y + e.h)) + 40;
      // đường nối vuông góc: ra phải nguồn → đường dọc ngay trước máy / ô đích → vào trái đích
      const paths: [string, string][] = [];
      for (const l of links) {
        const a = box(l.from);
        const b = box(l.to);
        const ay = yRow.get(l.from.row)! + CY;
        const by = yRow.get(l.to.row)! + CY;
        const bus = b.x - 16;
        paths.push([`M${a.x + a.w},${ay} H${bus} V${by} H${b.x}`, l.alt ? 'alt' : '']);
      }
      // chuỗi khí môi trường: đường chấm thẳng từ máy làm khí xuống dải môi trường của thẻ
      for (const l of envLinks) {
        const a = box(l.from);
        const b = box(l.to);
        paths.push([`M${b.x + b.w / 2},${a.y + a.h} V${b.y - l.to.head}`, `env env-${l.env.toLowerCase()}`]);
      }
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('class', 'rl-lines');
      svg.setAttribute('width', String(W));
      svg.setAttribute('height', String(H));
      for (const [d, cls] of paths) {
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('d', d);
        if (cls) p.setAttribute('class', cls);
        svg.append(p);
      }
      world.prepend(svg);
      world.style.width = `${W}px`;
      world.style.height = `${H}px`;

      const animate = motion && before.size > 0;
      const MOVE = chosen ? 360 : 260;
      const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
      const seen = new Set<string>();
      for (const e of els) {
        const b = box(e);
        e.node.style.left = `${b.x}px`;
        e.node.style.top = `${b.y}px`;
        if (!animate) continue;
        const k = e.node.dataset.k!;
        seen.add(k);
        const old = before.get(k);
        if (old) {
          const dx = old.x - b.x;
          const dy = old.y - b.y;
          const dw = e.w - old.w;
          const dh = e.h - old.h;
          if (e.card && (dw > 1 || dh > 1)) {
            // vừa mở rộng: thẻ hiện từ đúng khung ô máy cũ rồi lớn dần ra hai chiều
            e.node.animate(
              [
                { transform: `translate(${dx}px, ${dy}px)`, clipPath: `inset(-80px ${Math.max(0, dw)}px ${Math.max(0, dh)}px 0 round 4px)` },
                { transform: 'none', clipPath: 'inset(-80px -4px -4px -4px round 4px)' },
              ],
              { duration: MOVE, easing: EASE },
            );
          } else if (dw < -1 || dh < -1) {
            // vừa thu gọn: co từ cỡ thẻ cũ về ô máy
            e.node.animate(
              [
                { transform: `translate(${dx}px, ${dy}px) scale(${old.w / e.w}, ${old.h / e.h})`, transformOrigin: '0 0', opacity: 0.5 },
                { transform: 'none', transformOrigin: '0 0', opacity: 1 },
              ],
              { duration: MOVE, easing: EASE },
            );
          } else if (Math.abs(dx) + Math.abs(dy) > 0.5) e.node.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: MOVE, easing: EASE });
        } else if (chosen) {
          // dây chuyền mới (công thức vừa chọn / chuỗi khí vừa mở): mở dần sang trái, cột xa hơn hiện sau
          const delay = MOVE + Math.max(0, e.col - chosen.col) * 70;
          e.node.animate([{ opacity: 0, transform: 'translateX(48px)' }, { opacity: 1, transform: 'none' }], { duration: 280, delay, easing: EASE, fill: 'backwards' });
        } else e.node.animate([{ opacity: 0, transform: 'translateY(-10px) scale(0.92)' }, { opacity: 1, transform: 'none' }], { duration: 240, delay: 80, easing: 'ease-out', fill: 'backwards' });
      }
      if (animate) {
        // phần tử bị bỏ đi: mờ dần tại chỗ cũ
        for (const [k, o] of before) {
          if (seen.has(k)) continue;
          world.append(o.node);
          const a = o.node.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
          a.onfinish = () => o.node.remove();
        }
        svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: chosen ? MOVE : 120, fill: 'backwards' });
      }
      if (first) {
        first = false;
        // cỡ đọc được (không thu nhỏ quá 0,7), bắt đầu từ phía nguyên liệu bên trái như trong game
        requestAnimationFrame(() => {
          const vw = viewport.clientWidth;
          const vh = viewport.clientHeight;
          tf.k = Math.max(0.7, Math.min(1, vh / H, vw / W));
          tf.x = W * tf.k < vw ? (vw - W * tf.k) / 2 : 24;
          tf.y = 30;
          apply();
        });
      }
    };
    draw();
    apply();
    attachPanZoom(viewport, () => tf, (v) => {
      tf = v;
      apply();
    });
    const model = flashOnPress(el(
      'button',
      {
        class: 'rl-model-btn',
        type: 'button',
        title: tr('Đưa chuỗi này (theo công thức mặc định) vào sơ đồ Modeler đang mở'),
        onclick: () => void setTimeout(() => void modelIt(item), 160),
      },
      el('span', { class: 'rl-chain-ico' }),
      tr('Mô hình hoá'),
    ));
    const hint = el('div', { class: 'rl-hint' }, tr('Kéo để di chuyển · lăn chuột / hai ngón để thu phóng'));
    return el('div', { class: 'rl-chain' }, viewport, hint, model);
  };

  /**
   * Model hoá (người dùng 2026-10-06, lần 2): đang mở tab Modeler ⇒ thêm thẳng vào sơ đồ đó, các máy mới đang được chọn;
   * không ⇒ hỏi có tạo sơ đồ Modeler mới không.
   */
  const modelIt = async (item: string): Promise<void> => {
    const doc = chainToModeler(ds, buildChain(ds, item));
    const inModeler = !!document.getElementById('app')?.classList.contains('modeler-mode');
    close();
    if (!inModeler) {
      const ok = await confirmDialog(tr('Chưa mở tab Modeler nào. Tạo sơ đồ Modeler mới cho chuỗi {0}?', itemName(ds, item)), tr('Tạo Modeler mới'));
      if (!ok) return;
      window.dispatchEvent(new CustomEvent(OPEN_MODELER_EVENT, { detail: { title: itemName(ds, item), doc: emptyModeler() } }));
      await new Promise((r) => setTimeout(r, 120));
    }
    window.dispatchEvent(new CustomEvent(MODELER_INSERT_EVENT, { detail: doc }));
    toast(tr('Đã mô hình hoá chuỗi {0} — các máy mới đang được chọn', itemName(ds, item)));
  };

  render();
  autoFocus(search);
}

/** Ảnh + mô tả của một vật phẩm trên wiki Endfield (`public/wiki/items.json`, `public/img/wiki/<id>.webp`). */
interface WikiItem {
  title: string;
  type: string;
  d1: string;
  d2: string;
  img?: 1;
}
let wiki: Record<string, WikiItem> | null = null;

/**
 * Chạm / bấm nút lớn (Xem Chuỗi, Model hoá) ⇒ **nháy đổi màu** (sáng lên theo nền rồi về lại — người dùng 2026-10-06,
 * lần 4). Dùng sự kiện `pointerdown` để cảm ứng cũng thấy ngay (`:active` trên điện thoại không ổn định).
 */
function flashOnPress(b: HTMLElement): HTMLElement {
  b.addEventListener('pointerdown', () => {
    b.classList.remove('flash');
    void b.offsetWidth;
    b.classList.add('flash');
  });
  b.addEventListener('animationend', () => b.classList.remove('flash'));
  return b;
}

/** Kéo để di chuyển, lăn chuột / chụm hai ngón để thu phóng (giữ điểm dưới con trỏ / giữa hai ngón). */
function attachPanZoom(vp: HTMLElement, get: () => { x: number; y: number; k: number }, set: (v: { x: number; y: number; k: number }) => void): void {
  const pts = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinch: { d: number; k: number; cx: number; cy: number; x: number; y: number } | null = null;
  const zoomAt = (cx: number, cy: number, k: number): void => {
    const t = get();
    const nk = Math.max(0.25, Math.min(2.5, k));
    const r = vp.getBoundingClientRect();
    const px = cx - r.left;
    const py = cy - r.top;
    set({ k: nk, x: px - ((px - t.x) * nk) / t.k, y: py - ((py - t.y) * nk) / t.k });
  };
  vp.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) moved = 0;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const t = get();
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: t.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, x: t.x, y: t.y };
    }
  });
  vp.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.k * d) / Math.max(1, pinch.d));
      moved += 10;
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved < 4) return;
    if (!vp.hasPointerCapture(e.pointerId)) vp.setPointerCapture(e.pointerId);
    vp.classList.add('panning');
    const t = get();
    set({ ...t, x: t.x + dx, y: t.y + dy });
  });
  const up = (e: PointerEvent): void => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) vp.classList.remove('panning');
  };
  vp.addEventListener('pointerup', up);
  vp.addEventListener('pointercancel', up);
  // vừa kéo xong thì không tính là bấm (không mở hồ sơ vật phẩm dưới ngón tay)
  vp.addEventListener(
    'click',
    (e) => {
      if (moved >= 4) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );
  vp.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, get().k * Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false },
  );
}

const TILE = 54;
const MACH_W = 118;
const MACH_H = 40;
const GAP = 44;
const ROW = 104;
const TILE_DY = 22;
const MACH_DY = 29;
const PILL_H = 20;
/** Đường giữa của mọi phần tử trong hàng (ô vật phẩm, máy, thẻ mở rộng) — đường nối đi ngang ở đây. */
const CY = TILE_DY + TILE / 2;
/** Chữ ngắn trên dải môi trường: "MÔI TRƯỜNG ỔN ĐỊNH" một dòng (người dùng 2026-10-06, lần 6). */
const ENV_SHORT: Record<string, string> = { Stable: tr('ỔN ĐỊNH'), Acid: tr('AXIT') };

/** Nhãn công dụng ngắn theo máy (như hàng nhãn "Lắp · Nghiền · Đúc" dưới tên vật phẩm trong game). */
const USE_TAG: Record<string, string> = {
  component_mc_1: 'Lắp',
  dismantler_1: 'Tách',
  filling_powder_mc_1: 'Chiết',
  furnance_1: 'Luyện',
  gas_reactor_1: 'Phản ứng khí',
  grinder_1: 'Nghiền',
  liquid_purifier_1: 'Tinh chế',
  transmuter_1: 'Chuyển hoá',
  transmuter_2: 'Chuyển hoá',
  planter_1: 'Trồng',
  mix_pool_1: 'Lò phản ứng',
  mix_pool_2: 'Lò phản ứng',
  seedcollector_1: 'Thu hạt',
  shaper_1: 'Đúc',
  thickener_1: 'Nghiền mịn',
  tools_assebling_mc_1: 'Đóng gói',
  winder_1: 'Linh kiện',
  xiranite_oven_1: 'Rèn',
};

/** Phần tử bấm được trong thư viện (viền vàng khi rê chuột, nháy khi bấm). */
const PRESSABLE = 'button, .rl-default:not(.on), .rl-mach, .rl-entry';
const PIN_SVG = '<svg viewBox="0 0 24 24"><path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z" fill="currentColor"/></svg>';
const searchIcon = (): HTMLElement => {
  const s = el('span', { class: 'rl-search-ico' });
  s.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
  return s;
};
const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
