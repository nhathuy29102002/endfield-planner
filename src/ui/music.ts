import { tr } from '../i18n';
import { el } from './dom';
import { toast } from './toast';

/**
 * **Nhạc nền** (người dùng 2026-10-04): nút loa nhỏ cạnh nút Cài đặt ở góc phải thanh tab — bấm để phát / dừng bản
 * "Wuling City Core AIC Area Theme 2 — Forge" (file của người dùng, `public/audio/wuling-forge.mp3`), **lặp lại** liên
 * tục. Lần sau mở app mà lần trước đang bật thì phát lại ngay khi người dùng bấm / gõ phím lần đầu (trình duyệt chặn tự
 * phát âm thanh khi chưa có thao tác nào).
 *
 * **Người dùng tự chọn file nhạc** (2026-10-06 — bản public không kèm nhạc game): Cài đặt ⇒ "Nhạc nền: Chọn MP3…".
 * File được lưu trong **IndexedDB** của trình duyệt (`efp-music` / `files` / `track`; localStorage quá nhỏ cho MP3) ⇒ mở
 * lại app vẫn còn; nút × bỏ file đó. Chưa chọn file ⇒ dùng bản có sẵn `audio/wuling-forge.mp3` nếu bản build có kèm
 * (máy của người dùng); không có ⇒ bấm loa thì nhắc chọn file.
 */
const KEY = 'efp:music';
const SRC = 'audio/wuling-forge.mp3';
const DEFAULT_NAME = 'Wuling City Core — Forge';

// ---------------------------------------------------------------- file nhạc người dùng chọn (IndexedDB)
interface Track {
  name: string;
  blob: Blob;
}
const DB = 'efp-music';
const openDb = (): Promise<IDBDatabase> =>
  new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
async function dbDo<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const req = fn(db.transaction('files', mode).objectStore('files'));
    req.onsuccess = () => res(req.result as T | undefined);
    req.onerror = () => rej(req.error);
  });
}
const loadTrack = (): Promise<Track | undefined> => dbDo<Track>('readonly', (s) => s.get('track')).catch(() => undefined);
const saveTrack = (t: Track | null): Promise<unknown> =>
  dbDo('readwrite', (s) => (t ? s.put(t, 'track') : s.delete('track'))).catch(() => undefined);
const VOLUME = 0.45;
const VOL_KEY = 'efp:musicvol';
/** Âm lượng đã chọn lần trước (0…1). */
const storedVolume = (): number => {
  try {
    const v = Number(localStorage.getItem(VOL_KEY));
    return localStorage.getItem(VOL_KEY) !== null && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : VOLUME;
  } catch {
    return VOLUME;
  }
};

/** Hình loa (đang phát / tắt) — cả nút loa trong Cài đặt bản điện thoại dùng. */
export const SPEAKER_ON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fill-opacity="0.25"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/></svg>';
export const SPEAKER_OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" fill-opacity="0.25"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';

const stored = (): boolean => {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
};
const store = (on: boolean): void => {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* không lưu được thì thôi */
  }
};

/** Điều khiển nhạc nền — bảng Cài đặt của bản điện thoại dùng (người dùng 2026-10-05: loa + âm lượng vào Cài đặt). */
export interface MusicControl {
  isOn(): boolean;
  toggle(): void;
  volume(): number;
  setVolume(v: number): void;
  /** Tên bài đang dùng (file người dùng chọn, hoặc bản có sẵn); `null` = chưa có bài nào. */
  trackName(): string | null;
  /** Dùng file nhạc người dùng chọn (lưu lại cho lần sau). */
  setFile(file: File): Promise<void>;
  /** Bỏ file đã chọn ⇒ về bản có sẵn (nếu có). */
  clearFile(): Promise<void>;
  /** Báo khi tên bài đổi (để Cài đặt vẽ lại). */
  onChange(fn: () => void): void;
}

/** Bản nhạc có sẵn trong bản build không (bản public không kèm). */
let defaultExists: boolean | null = null;
const checkDefault = async (): Promise<boolean> => {
  if (defaultExists !== null) return defaultExists;
  try {
    const r = await fetch(SRC, { method: 'HEAD' });
    defaultExists = r.ok && !(r.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    defaultExists = false;
  }
  return defaultExists;
};

/** `root` = nơi đặt nút loa (thanh tab); `null` ⇒ không có nút (điện thoại — điều khiển trong Cài đặt). */
export function mountMusic(root: HTMLElement | null): MusicControl {
  let audio: HTMLAudioElement | null = null;
  let on = false;
  let volume = storedVolume();
  /** File người dùng chọn (đọc từ IndexedDB lúc mở app). */
  let track: Track | null = null;
  let trackUrl: string | null = null;
  let hasDefault = false;
  const listeners: (() => void)[] = [];
  const changed = (): void => {
    draw();
    for (const fn of listeners) fn();
  };
  const useTrack = (t: Track | null): void => {
    track = t;
    if (trackUrl) URL.revokeObjectURL(trackUrl);
    trackUrl = t ? URL.createObjectURL(t.blob) : null;
    const wasOn = on;
    audio?.pause();
    audio = null;
    on = false;
    if (wasOn) play();
    changed();
  };
  const name = (): string | null => track?.name ?? (hasDefault ? DEFAULT_NAME : null);
  const btn = el('button', { class: 'tb-music' });
  // rê chuột vào nút loa ⇒ hiện thanh âm lượng phía trên (người dùng 2026-10-04)
  const slider = el('input', { class: 'tb-music-slider', type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(volume * 100)), title: tr('Âm lượng') });
  const pct = el('span', { class: 'tb-music-pct' }, `${Math.round(volume * 100)}%`);
  const pop = el('div', { class: 'tb-music-vol' }, slider, pct);
  const wrap = el('div', { class: 'tb-music-wrap' }, pop, btn);
  slider.addEventListener('input', () => {
    volume = Number(slider.value) / 100;
    pct.textContent = `${slider.value}%`;
    if (audio) audio.volume = volume;
    try {
      localStorage.setItem(VOL_KEY, String(volume));
    } catch {
      /* không lưu được thì thôi */
    }
  });
  slider.addEventListener('keydown', (e) => e.stopPropagation());

  const draw = (): void => {
    btn.innerHTML = on ? SPEAKER_ON : SPEAKER_OFF;
    btn.classList.toggle('on', on);
    const n = name();
    btn.title = on ? tr('Đang phát nhạc nền — bấm để tắt') : n ? tr('Bật nhạc nền ({0}, lặp lại)', n) : tr('Chưa có nhạc nền — chọn file MP3 trong Cài đặt');
  };
  const play = (): void => {
    const src = trackUrl ?? (hasDefault ? SRC : null);
    if (!src) {
      on = false;
      draw();
      toast(tr('Chưa có nhạc nền — mở Cài đặt (bánh răng) ⇒ "Chọn MP3…" để chọn file nhạc của bạn'), 'info');
      return;
    }
    audio ??= Object.assign(new Audio(src), { loop: true, volume, preload: 'auto' });
    audio.volume = volume;
    on = true;
    draw();
    void audio.play().catch(() => {
      // trình duyệt chưa cho phát (chưa có thao tác) ⇒ chờ lần bấm / gõ phím đầu tiên
      on = false;
      draw();
      armFirstGesture();
    });
  };
  const stop = (): void => {
    audio?.pause();
    on = false;
    draw();
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    disarm();
    if (on) stop();
    else play();
    store(on);
  });

  // lần trước đang bật ⇒ phát lại ở thao tác đầu tiên của người dùng
  const first = (e: Event): void => {
    if ((e.target as Element | null)?.closest?.('.tb-music-wrap')) return; // bấm thẳng vào nút / thanh âm lượng: để chúng tự xử lý
    disarm();
    play();
  };
  const armFirstGesture = (): void => {
    window.addEventListener('pointerdown', first, true);
    window.addEventListener('keydown', first, true);
  };
  const disarm = (): void => {
    window.removeEventListener('pointerdown', first, true);
    window.removeEventListener('keydown', first, true);
  };

  draw();
  root?.append(wrap);
  // đọc file đã chọn lần trước + xem bản có sẵn có không, rồi mới hẹn phát lại ở thao tác đầu tiên
  void Promise.all([loadTrack(), checkDefault()]).then(([t, d]) => {
    hasDefault = d;
    if (t) useTrack(t);
    else changed();
    if (stored() && name()) armFirstGesture();
  });
  return {
    isOn: () => on,
    toggle: () => {
      disarm();
      if (on) stop();
      else play();
      store(on);
    },
    volume: () => volume,
    setVolume: (v: number) => {
      slider.value = String(Math.round(v * 100));
      slider.dispatchEvent(new Event('input'));
    },
    trackName: name,
    setFile: async (file: File) => {
      const t = { name: file.name.replace(/\.[^.]+$/, ''), blob: file };
      await saveTrack(t);
      useTrack(t);
      toast(tr('Nhạc nền: {0}', t.name), 'info');
    },
    clearFile: async () => {
      await saveTrack(null);
      useTrack(null);
    },
    onChange: (fn) => listeners.push(fn),
  };
}

/**
 * Dòng **"Nhạc nền"** trong bảng Cài đặt (người dùng 2026-10-06): tên bài đang dùng + nút "Chọn MP3…" (mở hộp chọn file
 * của trình duyệt / app) + nút × bỏ file đã chọn. Cả máy tính lẫn điện thoại.
 */
export function musicFileRow(music: MusicControl): HTMLElement {
  const input = el('input', { type: 'file', accept: 'audio/mpeg,audio/*,.mp3', hidden: true });
  const label = el('span', { class: 'set-music-name' });
  const pick = el('button', { class: 'tool small set-music-pick', type: 'button', onclick: () => input.click() }, tr('Chọn MP3…'));
  const clear = el('button', { class: 'tool small set-music-clear', type: 'button', title: tr('Bỏ file nhạc đã chọn'), onclick: () => void music.clearFile() }, '×');
  const draw = (): void => {
    const n = music.trackName();
    label.textContent = n ?? tr('Chưa có — chọn file MP3 của bạn');
    label.title = n ?? '';
    label.classList.toggle('none', !n);
  };
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = '';
    if (f) void music.setFile(f);
  });
  music.onChange(draw);
  draw();
  return el(
    'div',
    { class: 'set-row set-music', title: tr('File nhạc chỉ lưu trong trình duyệt / app trên máy này, không gửi đi đâu') },
    el('span', { class: 'set-music-head' }, tr('Nhạc nền')),
    label,
    pick,
    clear,
    input,
  );
}

