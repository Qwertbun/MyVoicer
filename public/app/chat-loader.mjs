import { APP_BUILD_ID, FRONTEND_MODULE_MANIFEST } from "./build-info.mjs";
import { loadLegacyScript } from "./legacy-runtime.mjs";
import { roomsReady } from "./rooms-loader.mjs";

const moduleInfo = FRONTEND_MODULE_MANIFEST.find((item) => item.id === "chat");

export const chatReady = roomsReady.then(() =>
  loadLegacyScript({
    src: moduleInfo?.legacySrc || "app/chat.js",
    version: APP_BUILD_ID,
    moduleId: "chat",
  })
);
