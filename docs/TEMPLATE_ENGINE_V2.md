# Template engine v2

Templates are discovered from `<plugin-assets>/templates/<id>/<version>/manifest.json` and `<plugin-config>/templates/...`. Installed versions are immutable; projects pin a version and own a copy of mutable source. Legacy type names are compatibility aliases only. Each built-in bundles an independent entry from `web/templates/{chat,gifts,alerts,likes,viewers,events}.js`, with shared `web/runtime/renderer.js`; the legacy renderer entry maps aliases without a central behavior switch.

```text
registry.json                              versioned instance and migration metadata
widgets.json                               retained legacy records
projects/<uuid>/project.json                immutable ID/template pin, settings, revision
projects/<uuid>/src/*                       authoritative author HTML/CSS/JS
projects/<uuid>/assets/*                    explicit imported resources
projects/<uuid>/schema/*                    template setting schema
projects/<uuid>/.history/<revision>/*       snapshots for explicit rollback
runtime/<uuid>/cache/*                     disposable build staging
runtime/<uuid>/releases/<build-id>/dist/*   immutable published/candidate resources
runtime/<uuid>/build-manifest.json          revision, hashes, diagnostics
runtime/<uuid>/dist/index.html              stable compatibility loader
widgets/<uuid>/index.html                   stable original OBS entry point
playground/<uuid>/*                         isolated generated host/loader
cache/migration-v1/*                       migration backup and report
```

Generation never changes source files. Saving project settings/source is separate from publishing; optional auto-publish defaults on and can be disabled per widget. External editors should open **Open widget project** or the editor's **Open source folder**. Do not customize installed package files or generated output. Reinstalling the plugin changes shipped definitions, not instance sources.

The project service validates paths, rejects symlinks and traversal/case collisions, limits individual resources to 8 MiB and trees to 64 MiB/2048 files, validates settings, and resolves relative HTML src/href/poster/srcset, CSS url/@import, literal ESM imports and source maps. Local resources must remain inside the project; explicit trusted imports copy individual external files. Absolute HTTP/HTTPS references remain normal browser resources. Absolute file references are retained only through recorded legacy trusted references; arbitrary filesystem escape is rejected. Local file base URLs must be imported into project-relative resources before publication. HTTP bases retain ordinary browser policy. TypeScript and bare-module dependencies need precompiled JS; runtime build never invokes install scripts or package managers. Node, when available, checks JS syntax without executing author code. C++ CSS checks balanced blocks/strings/comments; it is not a complete CSS standards validator. Dynamic computed resource URLs cannot be inferred statically.

Builds copy to staging and smoke-check document bootstrap/dependencies, then commit an immutable release. One atomically replaced standards-mode compatibility entry chooses production or preview documents in that same release. A failed precommit validation/build leaves the previously served output. Postcommit notification failures are returned as warnings. Release hashes/build revisions and project snapshots support diagnosis/rollback. Releases/history are retained conservatively; automated garbage collection is not enabled, to preserve rollback and references.

Author HTML must be UTF-8; other encodings produce UNSUPPORTED_ENCODING and retain source and the prior output. HTML is scanned lexically, not rewritten using regex or XML serialization. Comments, declarations, quoted attributes and raw-text script/style/title/textarea are handled separately. Bootstrap goes inside the head; omitted heads are created after the html/prolog. DOCTYPE, original formatting/CRLF and script/style order are preserved, with UTF-8 metadata added only when absent. The reserved generated bootstrap block is idempotent. Authored config.js scripts are preserved; only recognized migrated legacy generated configuration is replaced. Public config excludes nested session/cookie/signing/credential/secret fields. Trusted code can intentionally change its own config; it is not a hostile-code sandbox.

QFileSystemWatcher watches source/assets directories, supplemented by scan/poll for editor rename saves. Stable hashes and debounce suppress duplicate work. Background validation/build transitions clean → dirty → validating → building → published/error; failed saves preserve the served release and recover on the next change. Published UUID notifications refresh every matching Browser Source through refreshnocache on the UI thread, without reconnecting TikTok. A bounded local script-pointer check informs an open Playground of publication, then resets its preview with a new session. Fixtures remain frame-local and never invoke the OBS event dispatcher.

## Manifest

```json
{
  "schemaVersion": 2,
  "id": "builtin.gift-alert",
  "version": "2.0.0",
  "name": "Gift Alert",
  "category": "alerts",
  "description": "Gift alerts",
  "entry": "src/index.html",
  "events": ["gift"],
  "defaultSize": {"width":600,"height":400},
  "configSchema": "schema/settings.schema.json",
  "presets": ["presets/default.json"],
  "assets": ["src/style.css","src/main.js"]
}
```

Packages allow manifest/checksums plus src/assets/schema/presets trees. `.tiktokwidget` is a checksummed ZIP of regular files; encryption, links, traversal, duplicate/case-colliding names, oversized files and mismatched checksums are rejected. No scripts run on installation. Registry validates schema/version/path identity, entry and declared assets; corrupt/missing packages become diagnostics without deleting instances. Settings UI uses JSON Schema types, enum, defaults, numeric limits and x-ui textarea hints. Complex schema features outside this supported subset are not yet a general-purpose JSON Schema implementation.

## Migration and rollback

Before migration, widgets.json, managed legacy files and each imported external dependency are backed up under cache/migration-v1. Legacy UUIDs, settings and Browser Source paths remain stable. Built-ins become pinned projects; existing generated files are treated conservatively as potentially edited and copied when present. Referenced editable/custom HTML resources are imported, not arbitrary external directories. Original author paths are never deleted or rewritten. Unknown/missing templates and unsupported references retain their original operational output and a diagnostic. Migration is idempotent; inspect `migration report --json` before mutation. A failed resource import requires fixing/importing the missing reference explicitly rather than substituting a renderer.

`migration rollback --dry-run` reports the backup; explicit rollback restores legacy state/output copies and retains v2 projects for recovery. Do not delete projects/history to revert. Widget delete tombstones registry metadata and removes generated preview assets while retaining author sources. Duplicate/import forks have independent sources/assets/configuration and UUIDs; OBS copies of a scene source intentionally keep the original UUID.

See [CLI](WIDGETCTL.md), [agent workflows](AGENT_WORKFLOWS.md), and [validation](VALIDATION.md) for commands and actual evidence. Real OBS/CEF, other browsers and each OS require separate acceptance evidence; mocks and system Chromium do not establish it.

OBS Browser serves local files through its `http://absolute/` handler. Stable loaders and generated dependencies therefore use relative URLs; the public asset base is evaluated from the active document's base URI. Trusted legacy absolute audio references are mapped to that handler only inside OBS. An OBS refresh of a redirected page otherwise reloads the previous immutable release. Targeted refresh appends/replaces one inert reload nonce comment in the Browser Source CSS setting, which triggers obs-browser's supported recreation path while retaining its authored CSS and configured local_file. The widget project/settings are unchanged. This behavior is verified separately in real CEF; the source implementation is described in [obs-browser](https://github.com/obsproject/obs-browser/blob/master/obs-browser-source.cpp).
