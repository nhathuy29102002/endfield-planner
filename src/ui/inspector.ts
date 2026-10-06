import { itemName, phaseOf } from '../model/dataset';
import { roleOf } from '../model/roles';
import { machineMeta } from '../model/categories';
import { footprintGrid } from './footprint';
import { beltOutletPanel, clockPanel, disposalSections, envBox, filterRateSlider, generatorSections, isBeltOutlet, isOutlet, layoutPanel, outletPanel, recipeSections, routerPanel } from './machineParts';
import { closeItemPicker, itemButton } from './itemPicker';
import { busStatus } from '../model/bus';
import { isFilter, setDepotItem, setInfinite, setMode, setOutletItem, pairCandidates, setPairTarget, setSource } from '../editor/ops';
import type { AppState } from '../editor/state';
import { CATALYST_ENV_LABEL, type PlacedMachine } from '../model/types';
import { RATES } from '../sim/rates';
import { DISPOSAL, SEWAGE } from '../sim/solver';
import { itemColor } from '../render/renderer';
import { clear, el, fmt, pct } from './dom';
import { tr } from '../i18n';
import { isTouchUI } from '../platform';
import { MACHINE_MODE_ICONS, modeIconSvg } from './modeIcons';

/** Chấm màu + ảnh biểu tượng của một vật tư. */
export function itemChip(state: AppState, itemId: string): HTMLElement {
  const wrap = el('span', { class: 'chip' });
  const img = el('img', {
    class: 'chip-img',
    src: `img/itemicon/${state.ds.items.get(itemId)?.icon ?? itemId}.png`,
    alt: '',
    loading: 'lazy',
  });
  img.addEventListener('error', () => {
    img.remove();
    const dot = el('span', { class: 'dot' });
    dot.style.background = itemColor(itemId);
    wrap.prepend(dot);
  });
  wrap.append(img);
  return wrap;
}

const WIN_KEY = 'efp:machwin';
const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(WIN_KEY) === 'collapsed';
  } catch {
    return false;
  }
};
const saveCollapsed = (v: boolean): void => {
  try {
    localStorage.setItem(WIN_KEY, v ? 'collapsed' : 'open');
  } catch {
    /* không lưu được thì thôi */
  }
};

/**
 * Cửa sổ **Máy** nổi ở góc phải dưới bản vẽ — chỉ hiện khi đang chọn đúng một máy.
 * Tiêu đề là icon + tên máy + hình diện tích. Thu gọn được thành một nút nhỏ; trạng thái
 * thu gọn dùng chung cho mọi máy và nhớ tới khi người dùng mở lại.
 */
/** Chế độ lần vẽ trước của từng máy — để thanh chọn chế độ lăn từ vị trí cũ sang vị trí mới. */
const lastMode = new Map<number, 'A' | 'B'>();

/** Giao diện cảm ứng (app Android). */
const touch = isTouchUI();

/**
 * Chế độ Simulation (người dùng 2026-10-03) thay **ô INPUT / OUTPUT** của máy chế biến bằng thanh sản xuất động
 * (`ui/simMode.ts` + `ui/simMachine.ts`); phần còn lại của cửa sổ Máy giữ nguyên. `null` = Map thường.
 */
let clockOverride: ((m: PlacedMachine) => HTMLElement | null) | null = null;
export function setClockOverride(fn: ((m: PlacedMachine) => HTMLElement | null) | null): void {
  clockOverride = fn;
}

export function mountInspector(root: HTMLElement, state: AppState, onLayout: () => void = () => {}): () => void {
  let collapsed = readCollapsed();
  const body = el('div', { class: 'panel-body' });

  const render = (): void => {
    renderBody();
    onLayout(); // bảng Tổng hợp co lại theo chiều cao mới
  };

  /**
   * Animation đóng/mở (người dùng 2026-09-29): mở = trượt vào từ mép phải + hiện dần; đóng = trượt ra
   * rồi mới ẩn — trong lúc đóng vẫn giữ nội dung cũ. Đổi từ máy này sang máy khác thì không chạy lại.
   */
  const ANIM_MS = 220;
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  const reduced = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  /** Chạy một animation CSS một lần trên cửa sổ (bỏ lớp cũ, ép vẽ lại, gắn lớp mới). */
  const playOnce = (cls: string): void => {
    if (reduced()) return;
    root.classList.remove('mw-opening', 'mw-grow', 'mw-pop');
    void root.offsetWidth;
    root.classList.add(cls);
    setTimeout(() => root.classList.remove(cls), ANIM_MS + 40);
  };
  const finishClose = (): void => {
    closeTimer = null;
    root.classList.remove('mw-closing');
    root.hidden = true;
    clear(root);
    onLayout();
  };

  const renderBody = (): void => {
    closeItemPicker(); // bảng chọn icon đang mở thuộc về nội dung cũ
    const uid = state.selection;
    const m = uid === null ? undefined : state.bp.machines.find((v) => v.uid === uid);
    const def = m ? state.ds.machines.get(m.machineId) : undefined;
    // chỉ hiện khi đang chọn đúng một máy (và không đang cầm máy đi): di chuyển / sao chép / dán mà cửa sổ còn mở thì
    // nó che mất góc phải dưới bản vẽ — bấm đặt máy ở đó rơi vào cửa sổ (người dùng 2026-10-02: "copy van không đặt
    // lên băng được")
    const holding = state.tool.kind === 'place' || state.tool.kind === 'group' || state.tool.kind === 'stamp';
    if (!m || !def || holding) {
      if (root.hidden || closeTimer) return;
      root.classList.remove('mw-opening');
      if (reduced()) return finishClose();
      root.classList.add('mw-closing');
      closeTimer = setTimeout(finishClose, ANIM_MS);
      return;
    }
    const opening = root.hidden || closeTimer !== null;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
      root.classList.remove('mw-closing');
    }
    clear(root);
    clear(body);
    root.hidden = false;
    if (opening && !reduced()) {
      root.classList.remove('mw-opening');
      void root.offsetWidth; // chạy lại animation từ đầu
      root.classList.add('mw-opening');
    }
    const role = roleOf(def);
    const flow = state.result.machines.get(m.uid);
    // bản đã thu hẹp kiểu cho hai hàm khai báo phía dưới (modeSwitch / viewToggle)
    const defN = def;
    const mN = m;
    const icon = (): HTMLImageElement => el('img', { class: 'mw-icon', src: `img/items/${def.icon}.png`, alt: '' });

    root.classList.toggle('collapsed', collapsed);
    if (collapsed) {
      root.append(
        el(
          'button',
          {
            class: 'mw-mini',
            title: tr('{0} — bấm để mở cửa sổ máy', def.name),
            onclick: () => {
              collapsed = false;
              saveCollapsed(false);
              render();
              // mở ra: cửa sổ nở từ góc phải dưới (chỗ icon thu gọn) — người dùng 2026-09-29
              playOnce('mw-grow');
            },
          },
          icon(),
        ),
      );
      return;
    }
    // Cảnh báo của máy (mất điện, chưa có công thức, thiếu đầu vào…) gom vào **một nút "!" đỏ**
    // cạnh tên máy, hover để đọc — thân cửa sổ không còn dòng cảnh báo riêng (người dùng yêu
    // cầu 2026-09-28).
    /** Dấu × trong hộp cảnh báo: ẩn hộp (kể cả khi trình duyệt / điện thoại còn giữ trạng thái rê chuột) và bỏ focus. */
    const closeWarn = (e: Event): void => {
      e.stopPropagation();
      const w = (e.target as Element).closest<HTMLElement>('.mw-warn');
      w?.classList.add('tip-closed');
      w?.blur();
    };
    const warnings: string[] = [];
    if (flow?.powered === false) warnings.push(flow.blackout ? tr('Hệ thống đang sụp điện') : tr('Ngoài tầm cấp điện'));
    if (flow?.bottleneck && !warnings.some((w) => flow.bottleneck!.startsWith(w))) warnings.push(flow.bottleneck);
    const warnBtn =
      warnings.length > 0
        ? el(
            'span',
            { class: 'mw-warn', tabindex: '0', 'aria-label': tr('Cảnh báo: {0}', warnings.join('; ')) },
            '!',
            // hộp chữ hiện **ngay** khi rê chuột vào (không dùng `title` — trình duyệt chờ gần 1 giây
            // mới hiện; người dùng yêu cầu 2026-09-29)
            el(
              'span',
              { class: 'mw-warn-tip', role: 'tooltip' },
              // dấu × tắt hộp cảnh báo (người dùng 2026-10-05); bấm lại "!" để mở lại
              el('button', { class: 'mw-warn-close', type: 'button', title: tr('Đóng'), onclick: (e: Event) => closeWarn(e) }, '×'),
              ...warnings.map((w) => el('div', {}, w)),
            ),
          )
        : null;
    if (warnBtn) warnBtn.addEventListener('pointerdown', (e) => {
      // bấm vào chính nút "!" (không phải dấu ×) ⇒ cho hộp hiện lại
      if (!(e.target as Element).closest('.mw-warn-close')) warnBtn.classList.remove('tip-closed');
    });
    root.append(
      el(
        'div',
        { class: 'mw-head' },
        icon(),
        el(
          'div',
          { class: 'mw-title' },
          el('div', { class: 'mw-name-row' }, el('div', { class: 'mw-name' }, def.name), warnBtn),
          el('div', { class: 'mw-meta' }, machineMeta(def)),
        ),
        // điện thoại (người dùng 2026-10-05, bản phác lần 2): đầu cửa sổ chỉ còn icon + tên (+ "!"); thanh chế độ xuống
        // ngay dưới tên, môi trường / chất kích hoạt vào thẻ máy bên dưới. Ô vuông (đổi Layout ⇄ INPUT / OUTPUT) giữ lại.
        touch ? null : footprintGrid(def.size.w, def.size.d, { w: 48, h: 32 }),
        // góc phải trên: môi trường xúc tác / chất kích hoạt — máy nào dùng mới có
        touch ? null : envBox(state, m, def, flow),
        el(
          'button',
          {
            class: 'mw-collapse',
            title: tr('Thu gọn (nhớ cho mọi máy)'),
            onclick: () => {
              // thu vào: cửa sổ co về góc phải dưới rồi mới thành icon (người dùng 2026-09-29)
              if (reduced()) {
                collapsed = true;
                saveCollapsed(true);
                render();
                return;
              }
              root.classList.remove('mw-opening', 'mw-grow', 'mw-pop');
              root.classList.add('mw-shrink');
              setTimeout(() => {
                root.classList.remove('mw-shrink');
                collapsed = true;
                saveCollapsed(true);
                render();
                playOnce('mw-pop');
              }, ANIM_MS);
            },
          },
          '–',
        ),
      ),
      body,
    );

    // ---- chế độ máy
    if (def.modes && def.modes.length === 2 && !touch) {
      body.append(row(tr('Chế độ'), modeSwitch()!));
      if (!def.modeAffectsRecipes)
        body.append(
          el('div', { class: 'note' }, tr('Chế độ này chỉ đổi cách máy vận hành, không đổi bộ công thức.')),
        );
    }
    function modeSwitch(): HTMLElement | null {
      const def = defN;
      const m = mN;
      const mode = m.mode ?? 'A';
      if (!def.modes || def.modes.length !== 2) return null;
      // Thanh chọn chế độ (người dùng 2026-09-29): khung bo tròn hai đầu, hai nửa bằng nhau như hai
      // nút cũ, con lăn dài phủ nửa đang chọn và **lăn** sang nửa kia khi đổi (trái = chế độ 1, phải
      // = chế độ 2). Tên cả hai chế độ luôn nằm trong khung. Tab cũng đổi.
      const [a, b] = def.modes as [NonNullable<typeof def.modes>[number], NonNullable<typeof def.modes>[number]];
      const set = (id: 'A' | 'B'): void => {
        if (id !== mode) state.mutate(tr('Đổi chế độ'), () => setMode(state.bp, state.ds, m.uid, id));
      };
      // cửa sổ dựng lại cả DOM sau mỗi lần đổi ⇒ vẽ con lăn ở vị trí cũ rồi mới lăn sang vị trí mới
      const prev = lastMode.get(m.uid);
      lastMode.set(m.uid, mode);
      const knob = el('span', { class: 'ms-knob' });
      // icon chế độ như EnKAD (người dùng 2026-10-05): nửa trái icon **sát trái** tên, nửa phải icon **sát phải** tên
      const icons = MACHINE_MODE_ICONS[def.id];
      const opt = (o: typeof a, side: 'A' | 'B'): HTMLElement => {
        const icon = icons ? el('span', { class: 'ms-icon' }) : null;
        if (icon && icons) icon.innerHTML = modeIconSvg(icons[side]);
        const label = el('span', { class: 'ms-label' }, o.label);
        return el(
          'button',
          { class: `ms-opt${mode === o.id ? ' on' : ''}`, role: 'radio', 'aria-checked': String(mode === o.id), onclick: () => set(o.id) },
          ...(side === 'A' ? [icon, label] : [label, icon]),
        );
      };
      const sw = el(
        'div',
        { class: `mode-switch${(prev ?? mode) === b.id ? ' right' : ''}`, role: 'radiogroup', title: tr('Đổi chế độ  (Tab)') },
        knob,
        opt(a, 'A'),
        opt(b, 'B'),
      );
      if (prev !== undefined && prev !== mode)
        // đợi khung dựng xong (đã vẽ ở vị trí cũ) rồi mới đổi ⇒ CSS transition lăn con lăn
        setTimeout(() => sw.classList.toggle('right', mode === b.id), 30);
      return sw;
    }
    /**
     * Điện thoại — **thẻ máy** (bản phác của người dùng 2026-10-05): khung bo tròn; dải tên môi trường ("Stable ENV") ở
     * trên **chỉ khi máy đang ở đúng môi trường công thức cần**; giữa là sơ đồ máy với mũi tên cổng, icon vật phẩm ở chỗ
     * mũi tên chỉ vào / ra và lưu lượng mỗi cổng; máy có cổng kích hoạt ⇒ đồng hồ lưu lượng chất kích hoạt treo bên
     * dưới. Ô vuông ở đầu cửa sổ đổi thẻ này sang ô INPUT / OUTPUT (như trước).
     */
    function machineCard(): HTMLElement {
      const def = defN;
      const m = mN;
      const card = el('div', { class: 'mw-card' });
      // máy nằm trong vùng môi trường nào thì hiện môi trường đó (máy nào cũng được hưởng — người dùng 2026-10-05)
      const here = flow?.env ?? 'None';
      if (here !== 'None')
        card.append(el('div', { class: `rc-env mw-card-env env-${here.toLowerCase()}`, title: tr('Môi trường {0}', CATALYST_ENV_LABEL[here]) }, `${here === 'Acid' ? 'Acrid' : here} ENV`));
      // sơ đồ máy: icon vật phẩm + lưu lượng ở từng cổng; cổng kích hoạt có đồng hồ bán nguyệt ngay trong sơ đồ
      card.append(el('div', { class: 'mw-card-layout' }, layoutPanel(state, m, def, { rates: true, size: 196 })));
      return card;
    }

    // ---- Clock Speed | Layout máy
    // máy xuất hàng (lõi, lõi phụ, máy dỡ kho, cửa xả ống): Clock Speed của vật phẩm xuất ra,
    // icon lớn bên trái sơ đồ; bấm cổng ra trên sơ đồ để đổi vật phẩm
    const outlet = isOutlet(def);
    const ioPanel =
        role === 'crafter'
          ? (clockOverride?.(m) ?? clockPanel(state, m, def, flow))
          : role === 'generator'
            ? (clockOverride?.(m) ?? null) // trạm điện: thanh sản xuất khi mô phỏng; nhiên liệu ⇒ điện là thẻ công thức bên dưới (2026-10-05)
          : (role === 'router' || isFilter(def)) && !def.type.includes('Connector')
            ? routerPanel(state, m, def, flow) // van tách / gộp / cảng kiểm soát: INPUT / OUTPUT (2026-10-02)
            : isBeltOutlet(def)
            ? beltOutletPanel(state, m, def, flow) // máy dỡ kho / 2 lõi: ô + chọn vật phẩm từng cổng
            : outlet
              ? outletPanel(state, def, flow)
              : null;
    // điện thoại (người dùng 2026-10-05): chỉ một trong hai — INPUT / OUTPUT hoặc Layout (đổi bằng ô vuông ở đầu cửa sổ);
    // máy không có ô INPUT / OUTPUT thì luôn là Layout
    if (touch) {
      // thanh chế độ ngay dưới tên (cả chiều ngang cửa sổ)
      const sw = modeSwitch();
      if (sw) body.append(el('div', { class: 'mw-mode-row' }, sw));
      body.append(machineCard());
      // ô INPUT / OUTPUT đã bỏ trên điện thoại (số lưu lượng nằm ngay trên sơ đồ — người dùng 2026-10-05); riêng lúc
      // **mô phỏng** chỗ đó là thanh sản xuất động ⇒ vẫn hiện dưới thẻ máy
      if (clockOverride && ioPanel) body.append(el('div', { class: 'mw-sim-prod' }, ioPanel));
    } else
      // máy tính: giữ nguyên bố cục cửa sổ, chỉ thay sơ đồ cổng bằng bản mới của điện thoại — lưu lượng từng cổng, đồng hồ
      // bán nguyệt ở cổng kích hoạt (người dùng 2026-10-05)
      body.append(el('div', { class: 'mp-row' }, ioPanel, layoutPanel(state, m, def, { rates: true, size: 184 })));

    /** Chọn vật tư bằng icon (không dùng danh sách chữ) — mọi món đi được qua loại cổng này. */
    const itemsOfKinds = (kinds: Set<string>): string[] =>
      [...state.ds.items.values()]
        .filter((i) => kinds.has(phaseOf(state.ds, i.id) === 'solid' ? 'belt' : 'pipe'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((i) => i.id);

    // ---- công thức hoặc khai báo nguồn
    if (role === 'crafter') {
      // đang chạy → đang chờ → chế độ khác
      body.append(recipeSections(state, m, def, flow));
    } else if (m.machineId === SEWAGE.inlet || m.machineId === SEWAGE.outlet) {
      // Cửa Nạp Nước Thải / Cửa Xả Phụ Phẩm: luôn nối với nhau, không có gì để khai báo
      const sewageIn = [...state.result.machines.values()]
        .filter((f) => f.machineId === SEWAGE.inlet)
        .reduce((a, f) => a + f.inputs.reduce((b, i) => b + i.actual, 0), 0);
      const outlets = state.bp.machines.filter((v) => v.machineId === SEWAGE.outlet).length;
      body.append(
        el(
          'div',
          { class: 'note' },
          tr('Cửa Nạp Nước Thải chỉ nhận {0} qua ống và luôn nối với Cửa Xả Phụ Phẩm ', itemName(state.ds, SEWAGE.input)) +
            tr('(chỉ có một trên map). Cứ {0} {1} nạp vào thì cửa xả đẩy ra 1 ', SEWAGE.ratio, itemName(state.ds, SEWAGE.input)) +
            tr('{0} qua ống.', itemName(state.ds, SEWAGE.output)),
        ),
        row(tr('Đang nạp'), el('span', {}, tr('{0}/phút', fmt(sewageIn, 1)))),
        row(tr('Cửa xả ra'), el('span', {}, outlets > 0 ? tr('{0}/phút', fmt(sewageIn / SEWAGE.ratio, 2)) : tr('chưa đặt Cửa Xả Phụ Phẩm'))),
      );
    } else if (role === 'source') {
      const rate = el('input', {
        class: 'num',
        type: 'number',
        min: '0',
        step: '10',
        value: String(m.source?.perMinute ?? 0),
      });
      const kinds = new Set(def.ports.filter((p) => p.dir === 'out').map((p) => p.kind));
      const pick = itemButton(
        state,
        m.source?.itemId || null,
        () => itemsOfKinds(kinds),
        (v) => state.mutate(tr('Đổi tài nguyên nguồn'), () => setSource(state.bp, m.uid, v ?? '', Number(rate.value))),
        { allowNone: true, title: tr('Tài nguyên') },
      );
      rate.addEventListener('change', () =>
        state.mutate(tr('Đổi sản lượng nguồn'), () => setSource(state.bp, m.uid, m.source?.itemId ?? '', Number(rate.value))),
      );
      body.append(
        el(
          'div',
          { class: 'note' },
          tr('Bảng dữ liệu game không có sản lượng cho máy khai thác — nó phụ thuộc mỏ, nên khai báo tay ở đây.'),
        ),
        // một dòng: "Tài nguyên  [món]  [sản lượng] /phút" (người dùng 2026-10-06)
        el(
          'div',
          { class: 'row source-row' },
          el('span', { class: 'row-label' }, tr('Tài nguyên')),
          el('span', { class: 'source-ctl' }, pick, rate, el('span', { class: 'source-unit' }, tr('/phút'))),
        ),
      );
    } else if (role === 'generator') {
      // trạm điện: nhiên liệu ⇒ điện dạng thẻ công thức như máy sản xuất (người dùng 2026-10-05)
      body.append(generatorSections(state, flow));
    } else if (DISPOSAL[m.machineId]) {
      // Bộ Xử Lý Nước Thải: công thức "chất thải → Empty"
      body.append(disposalSections(state, m, flow)!);
    } else if (role === 'sink') {
      body.append(
        el(
          'div',
          { class: 'note' },
          outlet
            ? tr('Lõi: nhận mọi thứ đưa tới, và rút hàng từ kho tổng ra các cổng băng — bấm cổng ra trên sơ đồ để chọn vật phẩm.')
            : tr('Kho / Hub: nhận mọi thứ đưa tới, không hãm máy phía trước.'),
        ),
      );
    } else if (role === 'depotOut' || role === 'depotIn') {
      const wants = role === 'depotOut' ? 'out' : 'in';
      const kinds = new Set(def.ports.filter((p) => p.dir === wants && !p.virtual).map((p) => p.kind));
      body.append(
        el(
          'div',
          { class: 'note' },
          role === 'depotOut'
            ? tr('Rút từ kho tổng: nguồn không giới hạn, chỉ bị chặn bởi sức chở của tuyến. Bấm cổng ra trên sơ đồ hoặc ô dưới đây để chọn vật phẩm.')
            : tr('Nạp vào kho tổng: nhận bao nhiêu cũng được.'),
        ),
      );
      if (role === 'depotOut')
        body.append(
          row(
            tr('Vật tư'),
            itemButton(
              state,
              m.depotItem ?? null,
              () => itemsOfKinds(kinds),
              (v) => state.mutate(tr('Chọn vật tư kho tổng'), () => setDepotItem(state.bp, m.uid, v)),
              { allowNone: true, title: tr('Vật tư rút từ kho tổng') },
            ),
          ),
        );
    } else if (role === 'udpipeIn' || role === 'udpipeOut') {
      // Ghép cặp = **chỉ định trên map** (người dùng 2026-09-29, thay danh sách thả xuống): bấm nút
      // ⇒ các máy ghép được tô xanh, bấm một máy trên map để ghép; Esc để thôi.
      const partner = m.pairTarget != null ? state.bp.machines.find((o) => o.uid === m.pairTarget) : undefined;
      const partnerDef = partner ? state.ds.machines.get(partner.machineId) : undefined;
      const picking = state.tool.kind === 'pair' && state.tool.uid === m.uid;
      const pairCtl = el(
        'div',
        { class: 'pair-ctl' },
        el(
          'button',
          {
            class: `pair-pick${picking ? ' active' : ''}`,
            title: picking ? tr('Đang chọn trên map — bấm máy tô xanh, Esc để thôi') : tr('Chỉ định đầu kia trên map'),
            onclick: () => {
              if (picking) {
                state.setTool({ kind: 'select' });
                return;
              }
              if (pairCandidates(state.bp, state.ds, m.uid).length === 0) {
                state.notify(role === 'udpipeIn' ? tr('Chưa có đầu ra ống ngầm nào trên map') : tr('Chưa có đầu vào ống ngầm nào trên map'));
                return;
              }
              state.setTool({ kind: 'pair', uid: m.uid });
              state.notify(tr('Bấm vào máy tô xanh trên map để ghép — Esc để thôi'));
            },
          },
          el('span', { class: 'pair-icon' }, '⌖'),
          picking
            ? tr('Đang chọn trên map…')
            : partner && partnerDef
              ? `${partnerDef.name} #${partner.uid}`
              : tr('Chỉ định trên map'),
        ),
        partner
          ? el(
              'button',
              {
                class: 'pair-clear',
                title: tr('Bỏ ghép'),
                onclick: () =>
                  state.mutate(tr('Bỏ ghép cặp ống ngầm'), () => {
                    setPairTarget(state.bp, state.ds, m.uid, null);
                    setPairTarget(state.bp, state.ds, partner.uid, null);
                  }),
              },
              '×',
            )
          : null,
      );
      body.append(
        el(
          'div',
          { class: 'note' },
          tr('Khí và chất lỏng **không có kho tổng**. Muốn đưa chúng đi xa thì ghép một đầu vào ') +
            tr('với một đầu ra ở đây — cặp này đi thẳng, không dùng băng chuyền cũng không dùng ống.'),
        ),
        row(tr('Ghép với'), pairCtl),
      );
      if (role === 'udpipeOut') {
        // "Nguồn vô hạn" là **một nút chọn khí / lỏng** (người dùng yêu cầu 2026-09-28): chọn món
        // ⇒ bật nguồn vô hạn đẩy món đó (bỏ qua cặp ghép); chọn × ⇒ tắt, lại nhận hàng qua cặp ghép.
        const port = def.ports.find((p) => p.dir === 'out' && !p.virtual);
        body.append(
          row(
            tr('Nguồn vô hạn'),
            itemButton(
              state,
              m.infinite && m.source?.itemId ? m.source.itemId : null,
              () => itemsOfKinds(new Set(['pipe'])),
              (v) =>
                state.mutate(v ? tr('Bật nguồn vô hạn') : tr('Tắt nguồn vô hạn'), () => {
                  if (port) setOutletItem(state.bp, state.ds, m.uid, `out${port.index}`, v);
                  else setInfinite(state.bp, m.uid, false);
                }),
              { allowNone: true, title: tr('Nguồn vô hạn — chọn khí / lỏng (× để tắt)') },
            ),
          ),
        );
      }
    } else if (role === 'bus') {
      body.append(
        el(
          'div',
          { class: 'note' },
          tr('Tổng tuyến kho hàng: đường thông ra kho tổng. Các đoạn chạm nhau thành một dải; dải phải chạm ') +
            tr('Cổng Tổng Tuyến Kho Hàng mới thông. Loader và Unloader phải đặt sát tuyến, ở phía đối diện cổng ') +
            tr('băng của chúng, thì mới nạp/rút được hàng.'),
        ),
      );
      // đoạn chưa nối về cổng (người dùng 2026-10-02)
      if (def.type === 'BusFree' && busStatus(state.bp, state.ds).deadBus.has(m.uid))
        body.append(el('div', { class: 'note warn' }, tr('⛓ Đoạn này chưa nối về Cổng Tổng Tuyến — máy dỡ / nâng hàng gắn vào nó không chạy.')));
    } else if (isFilter(def)) {
      // Cảng kiểm soát: chọn món được qua (icon); cảng ống còn chọn tốc độ tối đa
      const pipe = def.type === 'LogPipeConditioner';
      body.append(
        el(
          'div',
          { class: 'note' },
          tr('Chỉ cho món đã chọn ở ô OUTPUT đi tiếp; gặp món khác thì cả tuyến vào bị nghẽn. Chưa chọn thì cho qua mọi thứ.') +
            (pipe ? tr(' Cảng ống: kéo thanh trượt để giới hạn lưu lượng (bội số của 6, tối đa 60); nằm trên cao nên đặt được phía trên băng chuyền.') : ''),
        ),
      );
    } else if (role === 'router') {
      body.append(
        el(
          'div',
          { class: 'note' },
          def.type.includes('Splitter')
            ? tr('Van tách: chia đều hàng vào cho các nhánh đang nối; nhánh nào nhận ít hơn thì phần dư sang nhánh khác.')
            : tr('Van gộp: cộng dồn hàng các đường vào, tối đa bằng sức chở của đường ra (băng 30, ống 120). Băng gộp được nhiều món khác nhau; ống chỉ một chất.'),
        ),
      );
    } else if (role === 'bridge') {
      body.append(
        el(
          'div',
          { class: 'note' },
          tr('Cầu: hai tuyến cắt nhau mà không trộn hàng — hàng đi dọc ra dọc, đi ngang ra ngang. ') +
            tr('Đặt băng đi vào cầu thì lần kéo tiếp tự bắt đầu ở phía bên kia.'),
        ),
      );
    } else if (role === 'envgen') {
      body.append(
        el(
          'div',
          { class: 'note' },
          tr('Máy tạo môi trường: phủ {0}×{1} ô quanh nó. ', def.aura?.w ?? 13, def.aura?.d ?? 13) +
            tr('Loại môi trường do **khí nạp vào cổng kích hoạt** quyết định. ') +
            tr('Máy hưởng tác dụng phải nằm trọn trong vùng, thò ra một ô cũng không tính.'),
        ),
      );
    }

    // ---- kết quả tính toán (máy chế biến: cảnh báo đã nằm ở nút "!" trên tiêu đề)
    // điện thoại: cảng kiểm soát ống ⇒ mục "Kiểm soát lưu lượng" (thanh trượt bội số của 6) thay cho "Thông lượng"
    // (người dùng 2026-10-06); món được qua chọn ngay ở cổng ra trên sơ đồ
    if (touch && def.type === 'LogPipeConditioner')
      body.append(el('div', { class: 'section' }, tr('Kiểm soát lưu lượng')), filterRateSlider(state, m));
    else if (flow && role !== 'crafter') {
      body.append(el('div', { class: 'section' }, tr('Thông lượng')));
      const u = flow.utilization;
      const bar = el('div', { class: 'bar' });
      const fill = el('div', { class: `bar-fill ${u >= 0.999 ? 'full' : u <= 0.001 ? 'stall' : 'part'}` });
      fill.style.width = `${Math.max(0, Math.min(1, u)) * 100}%`;
      bar.append(fill);
      body.append(row(tr('Hệ số chạy'), el('span', { class: 'mono' }, pct(u))), bar);
      if (flow.activator) {
        const a = flow.activator;
        const ok = a.factor >= 1 - 1e-6;
        body.append(
          el('div', { class: 'section thin' }, tr('Cổng kích hoạt')),
          el(
            'div',
            { class: 'note' },
            tr('Nhận tối đa {0}/phút nhưng chỉ cần {1}/phút là chạy hết công suất — giống như điện.', RATES.activatorMaxPerMinute, RATES.activatorFloorPerMinute),
          ),
          row(
            tr('Đang nạp'),
            el(
              'span',
              { class: `mono ${ok ? '' : 'short'}` },
              a.itemId
                ? `${itemName(state.ds, a.itemId)} · ${fmt(a.supply, 1)}/${RATES.activatorFloorPerMinute}`
                : tr('chưa nối'),
            ),
          ),
        );
      }

      if (flow.envRequired !== 'None' || flow.env !== 'None' || role === 'envgen') {
        const need = flow.envRequired;
        const have = flow.env;
        const okEnv = need === 'None' || need === have;
        body.append(
          row(
            role === 'envgen' ? tr('Đang phát ra') : tr('Môi trường'),
            el(
              'span',
              { class: `mono ${okEnv ? '' : 'short'}` },
              role === 'envgen'
                ? (state.result.env.zones.find((z) => z.uid === m.uid)?.env ?? tr('chưa có'))
                : `${CATALYST_ENV_LABEL[have]}${need === 'None' ? '' : tr(' (cần {0})', CATALYST_ENV_LABEL[need])}`,
            ),
          ),
        );
      }

      if (flow.onBus !== null)
        body.append(
          row(
            tr('Tổng tuyến'),
            el(
              'span',
              { class: `mono ${flow.onBus ? '' : 'short'}` },
              flow.onBus ? tr('đã gắn') : tr('chưa gắn — đặt sát tuyến, phía đối diện cổng băng'),
            ),
          ),
        );

      if (role === 'generator') {
        const burning = flow.inputs.find((i) => i.actual > 1e-9);
        body.append(
          row(
            tr('Đang phát'),
            el(
              'span',
              { class: 'mono' },
              burning
                ? tr('{0} điện · đốt {1}', fmt(flow.generation, 0), itemName(state.ds, burning.itemId))
                : tr('0 điện · chưa có nhiên liệu'),
            ),
          ),
          el(
            'div',
            { class: 'note' },
            tr('Đốt pin hoặc quặng originium từ băng chuyền. Mỗi đơn vị cháy một khoảng thời gian cố định; ') +
              tr('thiếu nhiên liệu thì phát theo tỉ lệ thời gian có lửa.'),
          ),
        );
      }

      if (flow.powered !== null)
        body.append(
          row(
            tr('Điện'),
            el(
              'span',
              { class: `mono ${flow.powered ? '' : 'short'}` },
              flow.powered ? tr('trong tầm phủ · {0}/máy', def.power) : tr('ngoài tầm phủ'),
            ),
          ),
        );


      for (const [label, entries] of [
        [tr('Vào /phút'), flow.pairIn ?? flow.inputs],
        [tr('Ra /phút'), flow.pairOut ?? flow.outputs],
      ] as const) {
        if (entries.length === 0) continue;
        body.append(el('div', { class: 'section thin' }, label));
        for (const e of entries) {
          body.append(
            el(
              'div',
              { class: 'flow-row' },
              itemChip(state, e.itemId),
              el('span', { class: 'flow-name' }, itemName(state.ds, e.itemId)),
              el(
                'span',
                { class: `mono ${e.actual < e.nominal - 1e-6 ? 'short' : ''}` },
                `${fmt(e.actual, 1)} / ${fmt(e.nominal, 1)}`,
              ),
            ),
          );
        }
      }
    }
  };

  // `div` chứ không phải `label`: bấm vào chữ của nhãn không được bấm hộ nút icon bên trong
  const row = (label: string, control: HTMLElement): HTMLElement =>
    el('div', { class: 'row' }, el('span', { class: 'row-label' }, label), control);

  render();
  return render;
}
