# CLI and lifecycle

The canonical command reference is [docs/WIDGETCTL.md](../../../docs/WIDGETCTL.md). API output is `{apiVersion:1,ok:true,data,warnings:[]}`; failure is `{apiVersion:1,ok:false,error:{code,message,details}}`. Read success before acting on data. Exit 0 succeeds, 2 is usage, 3 is revision conflict, 4 is domain/offline failure, 5 is unexpected internal failure.

A revision token combines monotonic metadata counter with content hash, so external editor changes invalidate previously read tokens. Cross-process writers use registry.lock. Use --if-revision for settings/files/publish/rollback/duplicate. Builds never format source. Formatting requires an explicitly installed Prettier and works only under src.

Create → read/edit → validate → build → preview → publish → inspect OBS placement. Preview uses last published output; publish saved edits before previewing a change. Source saves trigger auto-publish only if enabled and OBS's watcher is running. Offline edits require explicit publish. History snapshots are created before explicit edits and rollback; external edits remain the current authoritative source.
