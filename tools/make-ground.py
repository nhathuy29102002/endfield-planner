"""
Tấm nền cỏ lát lặp được, làm **từ chính ảnh chụp mặt đất trong game** người dùng gửi (2026-10-06:
`tools/ground-src/game-ground.webp`, 1891×1432, cùng mức zoom với ảnh có các van ⇒ ~59 px mỗi ô lưới).

1. Cắt hình vuông `SIZE` ở giữa ảnh (bỏ phần mép tối nhất).
2. **Làm đều độ sáng**: ảnh chụp tối dần về các góc (sương / vignette) ⇒ lát lặp sẽ lộ ô. Chia mỗi kênh màu cho bản
   mờ rất mạnh (bán kính `FLAT_R`, lớn hơn hẳn bãi đá ~200 px nên bãi đá giữ nguyên) rồi nhân lại với màu trung bình.
3. **Liền mạch**: trộn ảnh với chính nó dịch nửa tấm (mép của bản dịch = giữa ảnh gốc ⇒ liền nhau khi lặp); trọng số
   bằng 0 sát mép (dùng bản dịch), bằng 1 ở giữa (dùng ảnh gốc) — đường nối của bản dịch nằm ở giữa nên bị che.
Ra: `public/img/ground/ground.webp`. Chạy: `python tools/make-ground.py`.
"""
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'tools', 'ground-src', 'game-ground.webp')
OUT = os.path.join(ROOT, 'public', 'img', 'ground', 'ground.webp')
SIZE = 1400  # cạnh tấm (px ảnh) ≈ 23,7 ô
FLAT_R = 260  # bán kính làm mờ khi làm đều độ sáng
EDGE0, EDGE1 = 0.08, 0.24  # vùng trộn (tỉ lệ cạnh tính từ mép)

im = Image.open(SRC).convert('RGB')
W, H = im.size
x0 = (W - SIZE) // 2
y0 = (H - SIZE) // 2
tile = im.crop((x0, y0, x0 + SIZE, y0 + SIZE))

# 2. làm đều độ sáng (khử tối góc), giữ màu trung bình
a = np.asarray(tile).astype(np.float64)
low = np.asarray(tile.filter(ImageFilter.GaussianBlur(FLAT_R))).astype(np.float64)
mean = a.reshape(-1, 3).mean(axis=0)
flat = np.clip(a / np.maximum(low, 1) * mean, 0, 255)

# 3. liền mạch
shifted = np.roll(np.roll(flat, SIZE // 2, axis=0), SIZE // 2, axis=1)
t = np.arange(SIZE) / (SIZE - 1)
d = np.minimum(t, 1 - t)  # khoảng cách tới mép gần nhất (0 … 0,5)
w1 = np.clip((d - EDGE0) / (EDGE1 - EDGE0), 0, 1)
w1 = w1 * w1 * (3 - 2 * w1)  # smoothstep
w = np.minimum.outer(w1, w1)[..., None]
out = flat * w + shifted * (1 - w)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
Image.fromarray(out.round().astype(np.uint8)).save(OUT, 'WEBP', quality=88, method=6)
print(OUT, os.path.getsize(OUT), 'bytes; mean', mean.round(1))
