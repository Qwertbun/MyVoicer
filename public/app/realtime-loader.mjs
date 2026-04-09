import { APP_BUILD_ID, FRONTEND_MODULE_MANIFEST } from "./build-info.mjs";
import { loadLegacyScript } from "./legacy-runtime.mjs";
import { mediaReady } from "./media-loader.mjs";

const moduleInfo = FRONTEND_MODULE_MANIFEST.find((item) => item.id === "realtime");

export const realtimeReady = mediaReady.then(() =>
  loadLegacyScript({
    src: moduleInfo?.legacySrc || "app/realtime.js",
    version: APP_BUILD_ID,
    moduleId: "realtime",
  })
);
