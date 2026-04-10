import { APP_BUILD_ID, FRONTEND_MODULE_MANIFEST } from "./build-info.mjs";
import { loadLegacyScript } from "./legacy-runtime.mjs";
import { relayReady } from "./relay-loader.mjs";

const moduleInfo = FRONTEND_MODULE_MANIFEST.find((item) => item.id === "rooms");

export const roomsReady = relayReady.then(() =>
  loadLegacyScript({
    src: moduleInfo?.legacySrc || "v2/app/rooms.js",
    version: APP_BUILD_ID,
    moduleId: "rooms",
  })
);
