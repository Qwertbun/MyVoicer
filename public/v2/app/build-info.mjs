export const APP_BUILD_ID = "20260410-v2-native-cutover4";

export const FRONTEND_MODULE_MANIFEST = Object.freeze([
  {
    id: "i18n",
    legacySrc: "v2/app/i18n.js",
    role: "Translation dictionary packs",
  },
  {
    id: "foundation",
    legacySrc: "v2/app/foundation.js",
    role: "DOM bindings, constants, and shared runtime state",
  },
  {
    id: "relay",
    legacySrc: "v2/app/relay.js",
    role: "Relay encryption, IndexedDB, upload sessions, and network mode sync",
  },
  {
    id: "rooms",
    legacySrc: "v2/app/rooms.js",
    role: "Saved rooms, voice channels, and relay history replay",
  },
  {
    id: "chat",
    legacySrc: "v2/app/chat.js",
    role: "Chat rendering, attachment flow, and microphone processing",
  },
  {
    id: "media",
    legacySrc: "v2/app/media.js",
    role: "Audio/screen rendering, participant UI, and ABR media control",
  },
  {
    id: "realtime",
    legacySrc: "v2/app/realtime.js",
    role: "WebRTC signaling and peer/session lifecycle primitives",
  },
  {
    id: "bootstrap",
    legacySrc: "v2/app/bootstrap.js",
    role: "Socket listeners, UI event wiring, and startup initialization",
  },
]);
