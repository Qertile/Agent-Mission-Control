"""Makes Relax mode's pictures (web/relax/*.png) from Kenney's 3D kits, once.

    python3 relax_art.py <kenney_survival-kit.zip> <kenney_fantasy-town-kit_2.0.zip> <kenney_mini-characters.zip> [picture ...]

The metro-* pictures need RELAX_CITY_KIT and RELAX_CAR_KIT, the kits' zip files; the med-*
ones need RELAX_MEDIEVAL, the folder of the Medieval Village MegaKit's glTF files.
The animals need RELAX_ANIMALS, the folder of Quaternius' Ultimate Animated Animal Pack's
glTF files, and the name 'animals'. Name pictures to make only those; with none it makes them all. It opens a window that puts the kits' models together (relax_art.html, three.js) and
saves one transparent PNG per picture, plus people.png: the walking people, one row per
tool. Agent Mission Control itself only reads the PNGs:
no 3D, no WebGL at run time. Run it again only to change the pictures.
"""
import base64
import functools
import http.server
import os
import sys
import threading
import zipfile

import webview

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'web', 'relax')


MEDIEVAL_PORT = 42044


class Files(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, *args):
        pass


class Api:
    def __init__(self, kits):
        self._kits = kits

    def only(self):
        """The pictures named on the command line (none: all of them)."""
        return sys.argv[4:]

    def model(self, kit, name):
        """The model's GLB, base64."""
        z = self._kits[kit]
        return base64.b64encode(z.read(f'Models/GLB format/{name}.glb')).decode()

    def texture(self, kit):
        """The kit's colour map as a data URL (every model of a kit shares it)."""
        z = self._kits[kit]
        return 'data:image/png;base64,' + base64.b64encode(z.read('Models/GLB format/Textures/colormap.png')).decode()

    def animal(self, name):
        """An animal's glTF file, as text."""
        with open(os.path.join(os.environ['RELAX_ANIMALS'], f'{name}.gltf'), encoding='utf-8') as f:
            return f.read()

    def medieval(self):
        """Where the Medieval Village kit's glTF files are served from."""
        return f'http://127.0.0.1:{MEDIEVAL_PORT}/'

    def variation(self, kit, name):
        """Another of a kit's colour maps as a data URL."""
        return 'data:image/png;base64,' + base64.b64encode(self._kits[kit].read(f'Models/Textures/{name}.png')).decode()

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
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    kits = {'sk': zipfile.ZipFile(sys.argv[1]), 'ftk': zipfile.ZipFile(sys.argv[2]), 'mc': zipfile.ZipFile(sys.argv[3])}
    for kit, var in (('ck', 'RELAX_CITY_KIT'), ('car', 'RELAX_CAR_KIT')):
        if os.environ.get(var):
            kits[kit] = zipfile.ZipFile(os.environ[var])
    if os.environ.get('RELAX_MEDIEVAL'):
        files = functools.partial(Files, directory=os.environ['RELAX_MEDIEVAL'])
        server = http.server.ThreadingHTTPServer(('127.0.0.1', MEDIEVAL_PORT), files)
        threading.Thread(target=server.serve_forever, daemon=True).start()
    webview.create_window('Relax art', os.path.join(HERE, 'relax_art.html'), js_api=Api(kits),
                          width=600, height=600)
    # Not pywebview's usual port (42001): a running Agent Mission Control has it, and this
    # window would load that page instead.
    webview.start(http_port=42041)


if __name__ == '__main__':
    main()
