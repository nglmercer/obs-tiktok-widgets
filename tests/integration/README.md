# Real OBS acceptance procedure

These checks require an installed OBS desktop application with real obs-browser and obs-websocket. The automated bridge suite uses a mock vendor and cannot substitute for them.

1. Install the built archive and start OBS. Check its log and the TikTok LIVE Widgets dock for missing integration errors.
2. Leave OBS WebSocket's **network server disabled**. Add two local Browser Sources using `browser-harness.html`, plus Chat and Gift widgets from the dock.
3. Generate test events. Both harnesses must show the same ordered fixture IDs, generic/chat/gift counts above zero, invalid=0, and state snapshots every two seconds. Chat and gift widgets must render independently. This verifies parsed DOM object detail and global broadcasting.
4. Reload a harness, switch scenes, duplicate a source, and generate again. No native connection is needed for this fixture check. Reloaded pages have no historical chat replay and synchronize at the next state snapshot.
5. Connect once to a known LIVE creator using a checksum-verified bundle. Confirm every browser page receives events. Add further widgets and switch scenes; native state must remain connected without a new client.
6. Change creators, disconnect during startup, and reconnect repeatedly. Inspect memory/thread counts and compare event rates. Verify shutdown exits cleanly.
7. Configure/duplicate/delete widgets, confirm independent UUIDs, restart OBS, and check restored settings. Confirm deleted sources are removed only after the dock confirmation.
8. Repeat without obs-browser, then without obs-websocket: the dock must show an explicit integration error.

Record OBS/browser versions, native revision, room/time, operating system, source-loading state, latency distribution, and diagnostic counts with results. No successful live or real CEF results have been recorded by this development session.
