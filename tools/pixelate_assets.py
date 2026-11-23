#!/usr/bin/env python3
"""把生图得到的大图转成真正的像素素材：裁边 → 缩到统一网格（32/64px）→ 映射到共享美术色板 → 硬边透明。
输出到 web/public/img/，页面里按整数倍放大显示（image-rendering: pixelated）。
用法: python3 tools/pixelate_assets.py
"""
import glob, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'design', 'assets_raw')
OUT = os.path.join(ROOT, 'web', 'public', 'img')

# 名称 -> (输出名, 网格边长, 是否保持宽高比)
LARGE = {'knight': 64, 'ranger': 64, 'monk': 64, 'sage': 64, 'chest': 64, 'skull': 48}
SCENES = {'sleep': 64, 'stage': 64}

def crop(im):
    bb = im.getchannel('A').point(lambda a: 255 if a > 40 else 0).getbbox()
    return im.crop(bb) if bb else im

# 共享美术色板（与 design/STYLE_GUIDE.md §1「美术色板」一致）：所有素材只能用这些颜色
ART_PALETTE = [
    # UI token
    '1B1F3B', '2B2F5A', '3A3F73', '0E1028', 'F4EBD0', '9A9CC4', 'E8505B', '5BD16B', '2F8A3C',
    '4FA3E0', '5B3FBF', 'F5C542', '9B6CFF', 'FF8A3D', 'B85A1F', 'F1DDB0', 'D9BF8A', '5A3A1E',
    # 美术扩展色阶
    'FFFFFF', 'C8CAD8', '7A7C99', '4A4C66',          # 白 / 钢灰
    'A12F3C', 'A8E8A0', '1F5C3A',                    # 暗红 / 亮绿 / 暗绿
    '9FD3F5', '2A5E9E',                              # 亮蓝 / 暗蓝
    'FFE79A', 'C98A1E',                              # 亮金 / 暗金
    'C7AEFF', 'FFC08A',                              # 亮紫 / 亮橙
    'F2C7A0', 'C98E6A', '8A5A34',                    # 肤色 / 肤色暗部 / 木头
]

def _palette_image():
    flat = []
    for h in ART_PALETTE:
        flat += [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    flat += flat[:3] * (256 - len(ART_PALETTE))
    p = Image.new('P', (1, 1)); p.putpalette(flat)
    return p

PAL = _palette_image()

def pixelate(im, w, h, colors=None):
    small = im.resize((w, h), Image.LANCZOS)
    alpha = small.getchannel('A').point(lambda a: 255 if a > 100 else 0)
    rgb = Image.new('RGB', small.size, (0, 0, 0))
    rgb.paste(small.convert('RGB'), mask=alpha)
    q = rgb.quantize(palette=PAL, dither=Image.Dither.NONE).convert('RGB')
    out = q.convert('RGBA'); out.putalpha(alpha)
    return out

def square(im):
    w, h = im.size; s = max(w, h)
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.paste(im, ((s - w) // 2, (s - h) // 2))
    return sq

for f in sorted(glob.glob(os.path.join(RAW, '*.png'))):
    n = os.path.splitext(os.path.basename(f))[0]
    im = crop(Image.open(f).convert('RGBA'))
    if n in SCENES:
        g = SCENES[n]; w, h = im.size
        pixelate(im, g, max(1, round(g * h / w))).save(os.path.join(OUT, n + '.png'))
        continue
    sq = square(im)
    pixelate(sq, 32, 32).save(os.path.join(OUT, n + '.png'))
    if n in LARGE:
        g = LARGE[n]
        pixelate(sq, g, g).save(os.path.join(OUT, n + '_lg.png'))

# 应用图标（512/192）：深色底 + 64 格骑士按整数倍放大
k = Image.open(os.path.join(OUT, 'knight_lg.png'))
for size in (512, 192):
    bg = Image.new('RGBA', (size, size), (27, 31, 59, 255))
    scale = int(size * 0.8) // 64
    kk = k.resize((64 * scale, 64 * scale), Image.NEAREST)
    bg.paste(kk, ((size - kk.width) // 2, (size - kk.height) // 2), kk)
    bg.save(os.path.join(OUT, f'icon-{size}.png'))
print('done')
