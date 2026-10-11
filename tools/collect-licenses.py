"""Collect declared package licenses and available notices from pinned Cargo metadata."""
import json, pathlib, shutil, subprocess
root=pathlib.Path(__file__).resolve().parents[1]
metadata=json.loads(subprocess.check_output(['cargo','metadata','--locked','--format-version','1','--manifest-path',str(root/'vendor/tiktok-signer/Cargo.toml')]))
output=root/'data/licenses';output.mkdir(parents=True,exist_ok=True)
inventory=[]
for package in metadata['packages']:
    source=pathlib.Path(package['manifest_path']).parent
    files=[]
    for pattern in ['LICENSE*','LICENCE*','COPYING*','NOTICE*']:
        for file in source.glob(pattern):
            if file.is_file():
                dest=output/(package['name']+'-'+package['version'])/file.name
                dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(file,dest)
                files.append(str(dest.relative_to(root/'data')))
    inventory.append({'name':package['name'],'version':package['version'],'license':package.get('license'),'repository':package.get('repository'),'noticeFiles':sorted(set(files))})
(root/'data/RUST-DEPENDENCY-LICENSES.json').write_text(json.dumps(inventory,indent=2)+'\n')
print(f'Collected declared licenses for {len(inventory)} packages; review missing notice files before release.')
