import { APP_BUILD_ID, FRONTEND_MODULE_MANIFEST } from "./build-info.mjs";
import { loadLegacyScript } from "./legacy-runtime.mjs";
import { chatReady } from "./chat-loader.mjs";

const moduleInfo = FRONTEND_MODULE_MANIFEST.find((item) => item.id === "media");

export const mediaReady = chatReady.then(() =>
  loadLegacyScript({
    src: moduleInfo?.legacySrc || "v2/app/media.js",
    version: APP_BUILD_ID,
    moduleId: "media",
  })
);
