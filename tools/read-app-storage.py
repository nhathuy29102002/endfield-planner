"""Đọc localStorage (LevelDB của WebView2 / Chromium) — chỉ đọc, trên bản sao lưu. Không cần thư viện ngoài."""
import os, struct, sys, json

def varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1
        r |= (c & 0x7f) << s; s += 7
        if c < 0x80: return r, i

def snappy(b):
    n, i = varint(b, 0)
    out = bytearray()
    while i < len(b):
        t = b[i]; i += 1
        k = t & 3
        if k == 0:
            ln = t >> 2
            if ln >= 60:
                nb = ln - 59
                ln = int.from_bytes(b[i:i + nb], 'little'); i += nb
            ln += 1
            out += b[i:i + ln]; i += ln
            continue
        if k == 1:
            ln = ((t >> 2) & 7) + 4; off = ((t >> 5) << 8) | b[i]; i += 1
        elif k == 2:
            ln = (t >> 2) + 1; off = int.from_bytes(b[i:i + 2], 'little'); i += 2
        else:
            ln = (t >> 2) + 1; off = int.from_bytes(b[i:i + 4], 'little'); i += 4
        for _ in range(ln): out.append(out[-off])
    assert len(out) == n
    return bytes(out)

def block(data, off, size):
    raw = data[off:off + size]
    ctype = data[off + size]
    return snappy(raw) if ctype == 1 else raw

def entries(b):
    nres = struct.unpack('<I', b[-4:])[0]
    end = len(b) - 4 - 4 * nres
    i = 0; key = b''
    while i < end:
        sh, i = varint(b, i); ns, i = varint(b, i); vl, i = varint(b, i)
        key = key[:sh] + b[i:i + ns]; i += ns
        yield key, b[i:i + vl]; i += vl

def table(path):
    d = open(path, 'rb').read()
    foot = d[-48:]
    i = 0
    _, i = varint(foot, i); _, i = varint(foot, i)
    io_, i = varint(foot, i); isz, i = varint(foot, i)
    for _, h in entries(block(d, io_, isz)):
        o, j = varint(h, 0); sz, j = varint(h, j)
        for k, v in entries(block(d, o, sz)):
            tag = struct.unpack('<Q', k[-8:])[0]
            yield k[:-8], tag >> 8, tag & 0xff, v

def log(path):
    d = open(path, 'rb').read()
    recs = []; buf = b''; i = 0
    while i + 7 <= len(d):
        blk_left = 32768 - (i % 32768)
        if blk_left < 7: i += blk_left; continue
        ln = struct.unpack('<H', d[i + 4:i + 6])[0]; t = d[i + 6]
        if ln == 0 and t == 0: i += blk_left; continue
        frag = d[i + 7:i + 7 + ln]; i += 7 + ln
        if t == 1: recs.append(frag)
        elif t == 2: buf = frag
        elif t == 3: buf += frag
        elif t == 4: recs.append(buf + frag); buf = b''
    for r in recs:
        seq = struct.unpack('<Q', r[:8])[0]; cnt = struct.unpack('<I', r[8:12])[0]; j = 12
        for n in range(cnt):
            typ = r[j]; j += 1
            kl, j = varint(r, j); k = r[j:j + kl]; j += kl
            v = b''
            if typ == 1:
                vl, j = varint(r, j); v = r[j:j + vl]; j += vl
            yield k, seq + n, typ, v

def load(folder):
    best = {}
    for f in os.listdir(folder):
        p = os.path.join(folder, f)
        src = table(p) if f.endswith('.ldb') else log(p) if f.endswith('.log') else None
        if src is None: continue
        for k, seq, typ, v in src:
            if k not in best or best[k][0] < seq: best[k] = (seq, typ, v)
    out = {}
    for k, (seq, typ, v) in best.items():
        if typ != 1 or not k.startswith(b'_'): continue
        origin, _, rest = k[1:].partition(b'\x00')
        name = rest[1:].decode('latin-1') if rest[:1] == b'\x01' else rest[1:].decode('utf-16-le', 'replace')
        val = v[1:].decode('latin-1') if v[:1] == b'\x01' else v[1:].decode('utf-16-le', 'replace')
        out[(origin.decode('latin-1'), name)] = val
    return out

if __name__ == '__main__':
    data = load(sys.argv[1])
    for (o, k), v in sorted(data.items()):
        print(o, k, len(v))
    if len(sys.argv) > 2:
        lib = next(v for (o, k), v in data.items() if k == 'efp:library')
        arr = json.loads(lib)
        from collections import Counter
        print('library:', len(arr), Counter(b.get('kind') for b in arr))
        print([b.get('name') for b in arr])
        with open(sys.argv[2], 'w', encoding='utf-8') as fh:
            json.dump({'format': 'efp-library', 'version': 1, 'blueprints': arr}, fh, ensure_ascii=False, indent=1)
        tabs = next((v for (o, k), v in data.items() if k == 'efp:tabs'), None)
        if tabs:
            t = json.loads(tabs)
            print('tabs:', [(x.get('kind'), x.get('title')) for x in t.get('tabs', [])])
