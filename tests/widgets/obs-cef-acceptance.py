"""Opt-in real OBS acceptance. Run only against a disposable profile with IPC enabled."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

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

def capture(label):
    images = []
    for index, source in enumerate(sources):
        packet = command('obs', 'sources', 'capture', source['id'], '--name', source['name'], live=True)
        image = base64.b64decode(packet['imageData'].split(',', 1)[1])
        (output/f'{label}-{index}.png').write_bytes(image)
        images.append(hashlib.sha256(image).hexdigest())
    return images

time.sleep(3)
before = capture('before')
assert len(set(before)) > 1, 'Sources appear blank/identical; inspect screenshots'
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
        if changed == wanted:
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
