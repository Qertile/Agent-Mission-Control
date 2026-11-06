"""Makes the city's lit windows (web/relax/med-*-lit.png) from its pictures, once.

    python3 relax_lit.py

relax_art.html lights a metropolis's windows from their blue glass as it renders them; the
Medieval Village MegaKit's glass is dark instead, so this finds it in the finished pictures:
dark, grey-brown pixels, away from the roofs (whose blue is above their green), in patches
about a pane's size, seven in ten of them on. The same every time. Needs Pillow.
"""
import glob
import math
import os

from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
PICS = os.path.join(os.path.dirname(HERE), 'web', 'relax')
WARM = (255, 214, 130, 255)


def lit(path):
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    px = im.load()
    roof = Image.new('L', (w, h))
    ro = roof.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 200 and b >= g + 8:
                ro[x, y] = 255
    near = roof.filter(ImageFilter.BoxBlur(3)).load()
    name = os.path.basename(path)
    on = lambda x, y: (math.sin((x >> 3) * 12.9898 + (y >> 3) * 78.233 + len(name)) * 43758.5453) % 1 < 0.7
    out = Image.new('RGBA', (w, h))
    o = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 200 or near[x, y] > 40 or not on(x, y):
                continue
            lum = r * 0.3 + g * 0.59 + b * 0.11
            if lum < 78 and b <= r + 4 and r - b < 34 and max(r, g, b) - min(r, g, b) < 38:
                o[x, y] = WARM
    return out


def main():
    for path in sorted(glob.glob(os.path.join(PICS, 'med-*.png'))):
        if path.endswith('-lit.png') or path.endswith('med-farm.png'):
            continue
        out = path[:-4] + '-lit.png'
        lit(path).save(out, optimize=True)
        print('saved', os.path.basename(out))


if __name__ == '__main__':
    main()
