import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const binary = process.env.WIDGETCTL || "build/widgetctl";
test(
  "controlled ZIP rejects traversal, links, corrupt checksums and missing checksums without installation",
  {
    skip:
      !fs.existsSync(binary) ||
      spawnSync("python3", ["--version"]).status !== 0,
  },
  () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "widget-package-safety-"),
    );
    try {
      const script = `import json,hashlib,zipfile,sys,pathlib\nroot=pathlib.Path(sys.argv[1])\nfor kind in ['traversal','symlink','checksum','missing']:\n name='../escaped.txt' if kind=='traversal' else 'src/link' if kind=='symlink' else 'manifest.json'\n data=b'contents'\n checks={name:hashlib.sha256(name.encode()+b'\\0'+data).hexdigest()}\n if kind=='checksum':checks[name]='0'*64\n with zipfile.ZipFile(root/(kind+'.tiktokwidget'),'w') as z:\n  entry=zipfile.ZipInfo(name)\n  if kind=='symlink':entry.create_system=3;entry.external_attr=0o120777<<16\n  z.writestr(entry,data)\n  if kind!='missing':z.writestr('checksums.json',json.dumps(checks))\n`;
      const generated = spawnSync("python3", ["-c", script, root], {
        encoding: "utf8",
      });
      assert.equal(generated.status, 0, generated.stderr);
      for (const [kind, code] of [
        ["traversal", "UNSAFE_PATH"],
        ["symlink", "INVALID_ARCHIVE"],
        ["checksum", "CHECKSUM_MISMATCH"],
        ["missing", "CHECKSUM_MISMATCH"],
      ]) {
        const r = spawnSync(
          binary,
          [
            "--config",
            root,
            "--assets",
            path.resolve("data/web"),
            "templates",
            "install",
            path.join(root, kind + ".tiktokwidget"),
            "--json",
          ],
          { encoding: "utf8" },
        );
        assert.equal(r.status, 4, r.stdout + r.stderr);
        assert.equal(JSON.parse(r.stdout).error.code, code);
      }
      assert.equal(fs.existsSync(path.join(root, "templates")), false);
      assert.equal(fs.existsSync(path.join(root, "escaped.txt")), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
