import { APP_BUILD_ID, FRONTEND_MODULE_MANIFEST } from "./build-info.mjs";
import { loadLegacyScript } from "./legacy-runtime.mjs";
import { i18nReady } from "./i18n-loader.mjs";

const moduleInfo = FRONTEND_MODULE_MANIFEST.find((item) => item.id === "foundation");

export const foundationReady = i18nReady.then(() =>
  loadLegacyScript({
    src: moduleInfo?.legacySrc || "app/foundation.js",
    version: APP_BUILD_ID,
    moduleId: "foundation",
  })
);
