export const APP_BUILD_ID = "20260409-frontend-esm1";

export const FRONTEND_MODULE_MANIFEST = Object.freeze([
  {
    id: "i18n",
    legacySrc: "app/i18n.js",
    role: "Translation dictionary packs",
  },
  {
    id: "foundation",
    legacySrc: "app/foundation.js",
    role: "DOM bindings, constants, and shared runtime state",
  },
  {
    id: "relay",
    legacySrc: "app/relay.js",
    role: "Relay encryption, IndexedDB, upload sessions, and network mode sync",
  },
  {
    id: "rooms",
    legacySrc: "app/rooms.js",
    role: "Saved rooms, voice channels, and relay history replay",
  },
  {
    id: "chat",
    legacySrc: "app/chat.js",
    role: "Chat rendering, attachment flow, and microphone processing",
  },
  {
    id: "media",
    legacySrc: "app/media.js",
    role: "Audio/screen rendering, participant UI, and ABR media control",
  },
  {
    id: "realtime",
    legacySrc: "app/realtime.js",
    role: "WebRTC signaling and peer/session lifecycle primitives",
  },
  {
    id: "bootstrap",
    legacySrc: "app/bootstrap.js",
    role: "Socket listeners, UI event wiring, and startup initialization",
  },
]);
