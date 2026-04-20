# Yaya Message Architecture

## Current Layers

- `main.js`: Electron bootstrap only.
- `src/main/index.js`: app lifecycle and IPC registration entry.
- `src/main/window.js`: BrowserWindow creation and window access.
- `src/main/ipc/*`: IPC channel registration, grouped by domain.
- `src/main/services/media-service.js`: FFmpeg, proxy, recording, download pipeline.
- `src/main/services/pocket-service.js`: Pocket48 API access and request headers.
- `src/main/services/system-service.js`: file export, directory dialog, IP diagnostics.
- `src/main/services/wasm-service.js`: WASM loading and PA token generation.
- `src/main/preload.js`: preload-side runtime adapter that injects the legacy desktop bridge before page scripts run.
- `src/common/storage-paths.js`: split writable paths into a user-visible export directory under Documents and a private internal data directory under the OS app-data location.
- `src/renderer/bootstrap-shared.js`: shared renderer bootstrap state, gift/team constants, and early UI helpers.

## Why This Refactor

- The old `main.js` mixed bootstrapping, transport, business logic, and infrastructure in one file.
- IPC channel definitions are now isolated from implementation details.
- Media and Pocket API capabilities can evolve independently without making Electron startup logic harder to maintain.

## Recommended Next Step

- Split the 12000-line inline script in `index.html` into `src/renderer/` modules.
- Turn on `contextIsolation` once stream-heavy renderer code no longer depends on raw Node objects.
- Move renderer state into a dedicated store so views and data-fetching stop sharing globals.
