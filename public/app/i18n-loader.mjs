import { APP_BUILD_ID, FRONTEND_MODULE_MANIFEST } from "./build-info.mjs";
import { loadLegacyScript } from "./legacy-runtime.mjs";

const moduleInfo = FRONTEND_MODULE_MANIFEST.find((item) => item.id === "i18n");

export const i18nReady = loadLegacyScript({
  src: moduleInfo?.legacySrc || "app/i18n.js",
  version: APP_BUILD_ID,
  moduleId: "i18n",
});
