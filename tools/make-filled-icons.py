"""
Ghép icon cho bình / lọ **đã nạp** (người dùng 2026-09-29).

Game (và dữ liệu EnKAD) cho mọi bình đã nạp dùng chung icon của bình rỗng — Bình Chứa Đồng đựng Khí
Trơ trông y hệt Bình Chứa Đồng đựng Khí Axit. Script này ghép: icon bình/lọ (nền) + icon khí/chất
lỏng thu nhỏ ở góc phải dưới, trên một nền tròn tối cho dễ đọc.

Bình nào đựng gì lấy từ công thức của Máy Chiết Rót (`filling_powder_mc_1`): nguyên liệu rắn = bình
rỗng, nguyên liệu lỏng/khí = thứ được nạp. Kết quả: `public/img/itemicon/filled/<item id>.png`
(`loadDataset` trỏ icon của các vật phẩm này vào đó).

Chạy: python tools/make-filled-icons.py   (cần Pillow)
"""
import json
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, 'public', 'img', 'itemicon')
OUT = os.path.join(ICONS, 'filled')
SIZE = 64

items = {i['id']: i for i in json.load(open(os.path.join(ROOT, 'data', 'items.json'), encoding='utf-8'))['items']}
recipes = json.load(open(os.path.join(ROOT, 'data', 'recipes.json'), encoding='utf-8'))['recipes']


def icon(item_id):
    it = items.get(item_id)
    path = os.path.join(ICONS, f"{(it or {}).get('icon', item_id)}.png")
    return Image.open(path).convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS) if os.path.exists(path) else None


os.makedirs(OUT, exist_ok=True)
done = 0
for r in recipes:
    if r['machineId'] != 'filling_powder_mc_1':
        continue
    solid = [s['itemId'] for s in r['ingredients'] if items.get(s['itemId'], {}).get('phase') == 'solid']
    fluid = [s['itemId'] for s in r['ingredients'] if items.get(s['itemId'], {}).get('phase') in ('liquid', 'gas')]
    outs = [o['itemId'] for o in r['outcomes']]
    if len(solid) != 1 or len(fluid) != 1 or len(outs) != 1:
        continue
    product = outs[0]
    # nền: icon của chính bình đã nạp (nếu có file), không thì icon bình rỗng
    base = icon(product) or icon(solid[0])
    liquid = icon(fluid[0])
    if base is None or liquid is None:
        print('missing icon:', product)
        continue
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    canvas.alpha_composite(base)
    s = 34  # icon khí/lỏng thu nhỏ, góc phải dưới
    x0, y0 = SIZE - s, SIZE - s
    dot = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(dot).ellipse((x0 - 1, y0 - 1, SIZE - 1, SIZE - 1), fill=(14, 18, 24, 215), outline=(255, 255, 255, 150), width=2)
    canvas.alpha_composite(dot)
    small = liquid.resize((s - 6, s - 6), Image.LANCZOS)
    canvas.alpha_composite(small, (x0 + 2, y0 + 2))
    canvas.save(os.path.join(OUT, f'{product}.png'), optimize=True)
    done += 1
print('filled icons:', done)
