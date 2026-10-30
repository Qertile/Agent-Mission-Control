"""Makes Relax mode's pictures (web/relax/*.png) from Kenney's 3D kits, once.

    python3 relax_art.py <kenney_survival-kit.zip> <kenney_fantasy-town-kit_2.0.zip> <kenney_mini-characters.zip>

It opens a window that puts the kits' models together (relax_art.html, three.js) and
saves one transparent PNG per picture, plus people.png: the walking people, one row per
tool. Agent Mission Control itself only reads the PNGs:
no 3D, no WebGL at run time. Run it again only to change the pictures.
"""
import base64
import os
import sys
import zipfile

import webview

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'web', 'relax')


class Api:
    def __init__(self, kits):
        self._kits = kits

    def model(self, kit, name):
        """The model's GLB, base64."""
        z = self._kits[kit]
        return base64.b64encode(z.read(f'Models/GLB format/{name}.glb')).decode()

    def texture(self, kit):
        """The kit's colour map as a data URL (every model of a kit shares it)."""
        z = self._kits[kit]
        return 'data:image/png;base64,' + base64.b64encode(z.read('Models/GLB format/Textures/colormap.png')).decode()

    def save(self, name, data_url):
        os.makedirs(OUT, exist_ok=True)
        with open(os.path.join(OUT, f'{name}.png'), 'wb') as f:
            f.write(base64.b64decode(data_url.split(',', 1)[1]))
        return os.path.join(OUT, f'{name}.png')

    def done(self, report):
        print(report)
        for w in webview.windows:
            w.destroy()


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    kits = {'sk': zipfile.ZipFile(sys.argv[1]), 'ftk': zipfile.ZipFile(sys.argv[2]), 'mc': zipfile.ZipFile(sys.argv[3])}
    webview.create_window('Relax art', os.path.join(HERE, 'relax_art.html'), js_api=Api(kits),
                          width=600, height=600)
    webview.start()


if __name__ == '__main__':
    main()
