# Frontend Module Architecture

## Overview
The frontend runtime starts from module entry `public/app/main.mjs`.

`main.mjs` imports ESM loader chain files (`*-loader.mjs`) and each loader imports the previous stage plus loads one legacy runtime file (`*.js`) via `loadLegacyScript(...)`.
Legacy `public/app.js` is kept as a compatibility bridge and forwards boot to `main.mjs`.

Load order (must stay stable):
1. `i18n-loader.mjs` -> `i18n.js`
2. `foundation-loader.mjs` -> `foundation.js`
3. `relay-loader.mjs` -> `relay.js`
4. `rooms-loader.mjs` -> `rooms.js`
5. `chat-loader.mjs` -> `chat.js`
6. `media-loader.mjs` -> `media.js`
7. `realtime-loader.mjs` -> `realtime.js`
8. `bootstrap-loader.mjs` -> `bootstrap.js`

The runtime code is still in plain scripts (`*.js`) and relies on symbols from earlier stages.
The dependency orchestration is now explicit in ESM (`import/export`).

## Responsibilities
- `main.mjs`: module entrypoint, global manifest exposure, and startup completion/error logging.
- `build-info.mjs`: build id and ordered module manifest.
- `legacy-runtime.mjs`: versioned legacy-script loader and bootstrap error UI.
- `i18n.js`: translation dictionaries (`window.__SYNTO_I18N__`).
- `foundation.js`: DOM references, shared constants, settings defaults, and base app state.
- `relay.js`: relay encryption/decryption, IndexedDB persistence, relay capability flow, and relay upload helpers.
- `rooms.js`: saved room list management, room UI sync, voice channel list operations, and relay history replay helpers.
- `chat.js`: chat rendering/editing, attachment previews, drag-and-drop, and microphone processing pipeline.
- `media.js`: participant rendering, audio/screen track routing, ABR loop, screen stage, and media UI updates.
- `realtime.js`: WebRTC peer lifecycle and signaling helpers.
- `bootstrap.js`: UI event binding, Socket.IO subscriptions, and startup sequence.

## Refactor Rules
- Keep loader dependencies one-directional: each `*-loader.mjs` may depend only on earlier stages.
- Put new shared constants/state into `foundation.js`.
- Put socket event handlers and UI listeners into `bootstrap.js`.
- Keep transport-level peer/session helpers in `realtime.js`.
- Keep `build-info.mjs` manifest aligned with any module rename/reorder.
- If a module grows too much, split it by feature and append new files to the manifest after its parent.

## Suggested Next Step
Finish migration by moving runtime logic from legacy scripts (`*.js`) into real ESM files with direct `import/export` instead of global symbol sharing.
