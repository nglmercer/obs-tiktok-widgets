# Build and install

Requirements: CMake 3.28+, C++20 compiler, Ninja (Linux), Qt6 Core/Widgets/Network, libobs and obs-frontend-api development packages, Rust stable with Cargo, Git. Node 22 is a development-only requirement for rebuilding/testing the SDK; packaged JavaScript runs in OBS Browser without Node.

The official OBS plugin template bootstrap and platform build scripts are retained. ENABLE_QT and ENABLE_FRONTEND_API are required and enabled. Dependency revisions are in dependencies.lock.json. CMake fetches tiktok-signer at `886157c10350c7def971f782451462db72bc0007` into its dependency build area when a local pinned checkout is absent. Existing TIKTOK_SOURCE_DIR must have that exact HEAD. No changes are made to the original sibling repository. Rust dependencies use its Cargo.lock; the runtime ABI version is checked against the compiled header before creation.

```sh
npm ci
npm run build
npm test
cmake --preset linux-system
cmake --build --preset linux-system
ctest --preset linux-system
cmake --install build_system --prefix "$PWD/stage"
cpack --config build_system/CPackConfig.cmake -G ZIP
```

Set CMAKE_PREFIX_PATH to a matching OBS SDK prefix when necessary. `TTL_TARGET_DIR` can reuse a Cargo build directory. The template's Ubuntu presets/scripts install platform prerequisites; `windows-x64` uses Visual Studio 2022 and `macos` uses Xcode. On macOS first run `rustup target add aarch64-apple-darwin x86_64-apple-darwin`; both Rust targets are combined with lipo and use an @rpath install name. macOS archives contain the native dylib under Contents/Frameworks. Signing/notarization requires the template's release credentials and an actual macOS verification run. Windows puts ttl_live.dll beside the plugin DLL. Linux installs libttl_live.so beside the plugin and uses $ORIGIN runtime lookup.

Install layout:

- Linux system prefix: `lib/obs-plugins/obs-tiktok-widgets.so` and `libttl_live.so`; `share/obs/obs-plugins/obs-tiktok-widgets/` contains assets. Prefer your distribution's supported plugin installation method.
- Linux user layout: place both shared libraries in `~/.config/obs-studio/plugins/obs-tiktok-widgets/bin/64bit/` and copy installed resource contents into `~/.config/obs-studio/plugins/obs-tiktok-widgets/data/`.
- Windows: copy the archive's `obs-tiktok-widgets` directory into `%APPDATA%/obs-studio/plugins/`, preserving `bin/64bit` and `data`.
- macOS: place `obs-tiktok-widgets.plugin` in `~/Library/Application Support/obs-studio/plugins/`.

Always install assets and the native library, then restart OBS. OBS Browser and obs-websocket must already be installed and compatible; neither is bundled. No WebSocket network server setting is needed.

## Signing bundle provenance

Pinned version: **webmssdk 1.0.0.388**. Trusted origin:

`https://sf16-website-login.neutral.ttwstatic.com/obj/tiktok_web_login_static/webmssdk/1.0.0.388/webmssdk.js`

SHA-256: `dee22566273d398e074df6db40f39cfd827f6b8efd6fc382de03c44c501299ac`.

The implementation uses this fixed HTTPS origin, rejects redirects, limits download bytes, enforces a timeout, verifies the full checksum, and only then atomically caches it. Local copies must match the same pinned digest. Missing/mismatching files produce visible errors. The bundle is never fetched during builds, shipped in assets, or sent to widgets. A digest change requires an audited code change, not runtime trust-on-first-use. The source digest was checked during development against both the trusted origin download and an existing local copy; the download was not executed to establish its hash.

Read third-party license notices before release. Release archives ship schema license text, dependency notices, and the generated Rust license inventory with available crate license files. `python tools/collect-licenses.py` regenerates that inventory from pinned Cargo metadata (a workspace-wide superset of runtime dependencies). Auditing all Rust transitive dependency license texts remains a release responsibility.
