"""Opt-in real OBS acceptance. Run only against a disposable profile with IPC enabled."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import struct
import zlib

parser = argparse.ArgumentParser()
parser.add_argument('--config', required=True)
parser.add_argument('--assets', required=True)
parser.add_argument('--widgetctl', default='build/widgetctl')
parser.add_argument('--flatpak-instance')
parser.add_argument('--live-widgetctl')
parser.add_argument('--existing-ids')
parser.add_argument('--output', required=True)
args = parser.parse_args()
config = Path(args.config)
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)

def command(*words, live=False):
    executable = args.live_widgetctl if live and args.live_widgetctl else args.widgetctl
    prefix = ['flatpak', 'enter', args.flatpak_instance, 'env', 'LD_LIBRARY_PATH=/app/lib', 'LANG=C.UTF-8'] if live and args.flatpak_instance else []
    result = subprocess.run(prefix + [executable, '--config', str(config), '--assets', args.assets, *words, '--json'], capture_output=True, text=True, timeout=15)
    packet = json.loads(result.stdout)
    assert result.returncode == 0 and packet['ok'], packet
    return packet['data']

if args.existing_ids:
    ids = json.loads(Path(args.existing_ids).read_text())
else:
    ids = {key: command('widgets', 'create', '--template', 'builtin.custom', '--name', 'Acceptance'+key)['id'] for key in ['editable', 'unrelated']}
for key, ident in ids.items():
    src = config/'projects'/ident/'src'
    (src/'index.html').write_text('<!doctype html><html><head><link rel="stylesheet" href="style.css"><script src="main.js" defer></script></head><body><h1 id="text">HTML initial</h1></body></html>')
    (src/'style.css').write_text('#text {background:'+('red' if key == 'editable' else 'green')+';color:white;margin:0} h1 {font:40px sans-serif}')
    (src/'main.js').write_text('const key="load-'+ident+'";const count=Number(localStorage.getItem(key)||0)+1;localStorage.setItem(key,count);document.getElementById("text").textContent+=" JS initial "+document.compatMode+" loads:"+count;window.addEventListener("tiktok:event",e=>{if(e.detail.synthetic)document.getElementById("text").textContent="Preview gift "+e.detail.data.repeat_count;});')
    command('widgets','project','set',ident,'--set','events=[\"gift\"]')
    command('widgets', 'publish', ident)
if not args.existing_ids:
    for ident in [ids['editable'], ids['editable'], ids['unrelated']]:
        command('obs', 'sources', 'add', ident, '--scene', 'Scene', live=True)
sources = [s for s in command('obs', 'sources', 'list', live=True) if s['id'] in ids.values()]
assert len(sources) == 3, sources

def visible_fixture(png):
    # Our fixture has visible text on a colored background. Transparent/solid
    # transitional frames cannot prove publication. This is not a production
    # blank-widget heuristic (idle overlays are intentionally transparent).
    offset, compressed, width, height, color = 8, bytearray(), 0, 0, 0
    while offset + 12 <= len(png):
        length = struct.unpack('>I', png[offset:offset + 4])[0]
        kind, data = png[offset + 4:offset + 8], png[offset + 8:offset + 8 + length]
        if kind == b'IHDR':
            width, height, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', data)
            assert depth == 8 and color in (2, 6) and interlace == 0, 'Unsupported capture PNG'
        elif kind == b'IDAT':
            compressed.extend(data)
        offset += length + 12
    channels = 4 if color == 6 else 3
    stride, raw = width * channels, zlib.decompress(compressed)
    previous, colors = bytearray(stride), set()
    for y in range(height):
        start = y * (stride + 1)
        mode, row = raw[start], bytearray(raw[start + 1:start + 1 + stride])
        for x in range(stride):
            left, above = (row[x - channels] if x >= channels else 0), previous[x]
            upper_left = previous[x - channels] if x >= channels else 0
            if mode == 1:
                predictor = left
            elif mode == 2:
                predictor = above
            elif mode == 3:
                predictor = (left + above) // 2
            elif mode == 4:
                prediction = left + above - upper_left
                distances = [abs(prediction - value) for value in (left, above, upper_left)]
                predictor = (left, above, upper_left)[distances.index(min(distances))]
            else:
                assert mode == 0, 'Invalid PNG filter'
                predictor = 0
            row[x] = (row[x] + predictor) & 255
        for x in range(0, stride, channels):
            if channels == 3 or row[x + 3]:
                colors.add(bytes(row[x:x + 3]))
                if len(colors) > 1:
                    return True
        previous = row
    return False

def capture(label):
    images = []
    for index, source in enumerate(sources):
        packet = command('obs', 'sources', 'capture', source['id'], '--name', source['name'], live=True)
        image = base64.b64decode(packet['imageData'].split(',', 1)[1])
        (output/f'{label}-{index}.png').write_bytes(image)
        images.append(hashlib.sha256(image).hexdigest() if visible_fixture(image) else None)
    return images

time.sleep(3)
before = capture('before')
assert all(before) and len(set(before)) > 1, 'Sources appear blank/identical; inspect screenshots'
results = []
for filename, previous, updated in [('index.html', 'HTML initial', 'HTML authored Ω'), ('style.css', 'background:red', 'background:blue'), ('main.js', 'JS initial', 'JS authored')]:
    path = config/'projects'/ids['editable']/'src'/filename
    temporary = path.with_name(path.name+'.atomic-save')
    temporary.write_text(path.read_text().replace(previous, updated), newline='\r\n')
    os.replace(temporary, path)
    deadline = time.monotonic()+15
    while True:
        after = capture(filename)
        changed = [a != b for a, b in zip(after, before)]
        wanted = [source['id'] == ids['editable'] for source in sources]
        if all(after) and changed == wanted:
            # A second stable, visible capture avoids acknowledging a teardown
            # frame as a completed refresh.
            time.sleep(.3)
            stable = capture(filename)
            if stable == after:
                break
        assert time.monotonic() < deadline, (filename, changed, wanted)
        time.sleep(.3)
    results.append({'edit': filename, 'matchingSourcesChanged': 2, 'unrelatedUnchanged': True})
    before = after
# Invalid saved CSS must preserve active release, then recover on another save.
style = config/'projects'/ids['editable']/'src/style.css'
good = style.read_bytes()
style.write_text('body {')
time.sleep(2)
assert capture('invalid-css') == before, 'Failed build replaced CEF output'
style.write_bytes(good)
time.sleep(2)
# The same immutable serving paths must remain after all refreshes.
assert command('obs', 'sources', 'list', live=True) == sources
preview = command('widgets', 'preview', ids['editable'], '--event', 'gift', '--user', 'Viewer123', '--gift', 'Rose', '--count', '23')
report = {'ok': True, 'ids': ids, 'sources': sources, 'edits': results, 'failedBuildRetainedCEF': True, 'preview': preview}
(output/'result.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
