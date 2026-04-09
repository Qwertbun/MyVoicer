import { APP_BUILD_ID, FRONTEND_MODULE_MANIFEST } from "./build-info.mjs";
import { loadLegacyScript } from "./legacy-runtime.mjs";
import { realtimeReady } from "./realtime-loader.mjs";

const moduleInfo = FRONTEND_MODULE_MANIFEST.find((item) => item.id === "bootstrap");

export const bootstrapReady = realtimeReady.then(() =>
  loadLegacyScript({
    src: moduleInfo?.legacySrc || "app/bootstrap.js",
    version: APP_BUILD_ID,
    moduleId: "bootstrap",
  })
);
