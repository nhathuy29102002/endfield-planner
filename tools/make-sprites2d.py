"""
8 hình 2D (bộ tách / bộ gộp / van kiểm soát / cầu nối của ống và băng chuyền) = **cắt đúng từ ảnh chụp trong game** của
người dùng (2026-10-06: "dùng đúng hình ảnh 8 loại van tôi chụp" — bản trong game là 3D, chụp từ trên xuống thành 2D).
Ảnh gốc: `tools/ground-src/game-valves.webp` (1759×1050; hàng trên: ống, hàng dưới: băng chuyền; từ trái sang: bộ
tách, bộ gộp, [đoạn ống / băng nối — bỏ qua], van kiểm soát, cầu nối). Một ô lưới ≈ 195 px trong ảnh.

Mỗi thiết bị:
1. cắt vuông `CROP` px quanh tâm của nó (rộng hơn một ô vì vòng nắp / van thò ra ngoài ô);
2. **tách nền cỏ bằng đường viền hình học đo trên ảnh** (tách theo màu bị lẫn bóng / cỏ / dải băng phát sáng): ống =
   chữ thập (nhánh rộng 125 px, dài 195 px, vát góc), van ống = thân 232×133 + hai vòng nắp cao hơn ở hai đầu, băng chuyền = đế vuông 180 px
   vát góc; vẽ mặt nạ ở 4× rồi thu nhỏ ⇒ mép mềm, nền trong suốt (dùng được trên nền đơn giản);
3. **xoay về hướng 0 của ứng dụng** (bộ tách vào từ dưới, bộ gộp ra phía trên, van đi dưới ⇒ trên). Trong ảnh: bộ tách
   có thanh / cần gạt chỉ phía **vào** ở bên phải, bộ gộp có vạch cam / cần gạt trắng chỉ phía **ra** ở bên trái, van
   kiểm soát cho hàng chảy sang trái (mũi tên « trên ống / băng) ⇒ cả sáu xoay 90° theo chiều kim đồng hồ; cầu nối giữ.
Ra: `public/img/sprites2d/<machineId>.png` (`CROP`×`CROP`, nền trong suốt). Ứng dụng vẽ hình to hơn đế đúng tỉ lệ
`CROP / CELL` (`icons.ts` `SPRITE_2D_SCALE`). Chạy: `python tools/make-sprites2d.py`.
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'tools', 'ground-src', 'game-valves.webp')
OUT = os.path.join(ROOT, 'public', 'img', 'sprites2d')
CELL = 195  # px ảnh mỗi ô lưới
CROP = 240  # cạnh vùng cắt (≈ 1,23 ô)
SS = 4  # siêu lấy mẫu mặt nạ

# tâm (x, y) trong ảnh, hình viền, số lần xoay 90° theo chiều kim đồng hồ
DEVICES = {
    'log_pipe_splitter': ((315.5, 346.5), 'cross', 1),
    'log_pipe_converger': ((703.5, 346.5), 'cross', 1),
    'log_pipe_conditioner': ((1093.5, 345.5), 'valve', 1),
    'log_pipe_connector': ((1473.5, 346.5), 'cross', 0),
    'log_splitter': ((330, 730.5), 'plate', 1),
    'log_converger': ((708, 730.5), 'plate', 1),
    'log_conditioner': ((1087, 731), 'plate-in', 1),
    'log_connector': ((1465, 731), 'plate', 0),
}


def chamfer_rect(x0: float, y0: float, x1: float, y1: float, c: float) -> list[tuple[float, float]]:
    return [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)]


def mask(shape: str) -> Image.Image:
    """Mặt nạ (L) cỡ CROP, tâm thiết bị ở giữa."""
    n = CROP * SS
    m = Image.new('L', (n, n), 0)
    d = ImageDraw.Draw(m)
    h = CROP / 2

    def poly(pts: list[tuple[float, float]]) -> None:
        d.polygon([((h + x) * SS, (h + y) * SS) for x, y in pts], fill=255)

    if shape == 'cross':
        poly(chamfer_rect(-62.5, -97.5, 62.5, 97.5, 7))
        poly(chamfer_rect(-98, -62.5, 98, 62.5, 7))
    elif shape == 'valve':
        # thân (cao 133) + hai vòng nắp ở hai đầu (cao hơn, rộng ~35)
        poly(chamfer_rect(-116, -66, 116, 66, 4))
        poly(chamfer_rect(-116, -76, -82, 74, 6))
        poly(chamfer_rect(82, -76, 116, 74, 6))
    elif shape == 'plate-in':  # đế có băng phát sáng sát hai bên (van kiểm soát) ⇒ thu vào thêm
        poly(chamfer_rect(-86.5, -89, 86.5, 89, 4))
    else:  # đế vuông băng chuyền
        poly(chamfer_rect(-89, -89, 89, 89, 4))
    return m.resize((CROP, CROP), Image.LANCZOS)


def cut(img: Image.Image, cx: float, cy: float, shape: str) -> Image.Image:
    h = CROP / 2
    box = img.crop((round(cx - h), round(cy - h), round(cx - h) + CROP, round(cy - h) + CROP)).convert('RGBA')
    box.putalpha(mask(shape))
    return box


if __name__ == '__main__':
    img = Image.open(SRC).convert('RGB')
    os.makedirs(OUT, exist_ok=True)
    for name, ((cx, cy), shape, turns) in DEVICES.items():
        s = cut(img, cx, cy, shape)
        for _ in range(turns):
            s = s.transpose(Image.Transpose.ROTATE_270)  # 90° theo chiều kim đồng hồ
        s.save(os.path.join(OUT, f'{name}.png'), optimize=True)
        print(name, s.size)
