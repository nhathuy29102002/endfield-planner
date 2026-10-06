"""
Vẽ icon cho bản ứng dụng máy tính (Tauri): nền tối bo góc, lưới ô (Map) + hai nút nối nhau (Modeler), màu vàng
nhấn của giao diện. Xuất `src-tauri/app-icon.png` (1024×1024) rồi chạy `npx tauri icon src-tauri/app-icon.png`
để sinh mọi kích thước (.ico, .png…).

Chạy: python tools/make-app-icon.py   (cần Pillow)
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024
im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
BG, GRID, YELLOW, BLUE, INK = (15, 19, 24, 255), (45, 56, 70, 255), (232, 197, 71, 255), (88, 166, 255, 255), (217, 220, 223, 255)

d.rounded_rectangle((40, 40, S - 40, S - 40), radius=200, fill=BG)
# lưới ô
for i in range(1, 6):
    v = 40 + i * (S - 80) // 6
    d.line((v, 120, v, S - 120), fill=GRID, width=10)
    d.line((120, v, S - 120, v), fill=GRID, width=10)
# đường nối cong giữa hai nút
pts = []
for k in range(101):
    t = k / 100
    x0, y0, x1, y1 = 380, 360, 640, 660
    cx0, cx1 = 560, 460
    x = (1 - t) ** 3 * x0 + 3 * (1 - t) ** 2 * t * cx0 + 3 * (1 - t) * t ** 2 * cx1 + t ** 3 * x1
    y = (1 - t) ** 3 * y0 + 3 * (1 - t) ** 2 * t * y0 + 3 * (1 - t) * t ** 2 * y1 + t ** 3 * y1
    pts.append((x, y))
d.line(pts, fill=YELLOW, width=34, joint='curve')
# hai nút
d.rounded_rectangle((170, 250, 400, 470), radius=44, fill=INK, outline=(17, 17, 17, 255), width=14)
d.rounded_rectangle((620, 550, 850, 770), radius=44, fill=INK, outline=(17, 17, 17, 255), width=14)
d.rounded_rectangle((215, 295, 355, 425), radius=26, fill=BLUE)
d.rounded_rectangle((665, 595, 805, 725), radius=26, fill=YELLOW)

out = os.path.join(ROOT, 'src-tauri', 'app-icon.png')
im.save(out)
print('saved', out)
