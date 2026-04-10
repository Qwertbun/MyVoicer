import { APP_BUILD_ID, FRONTEND_MODULE_MANIFEST } from "./build-info.mjs";
import { loadLegacyScript } from "./legacy-runtime.mjs";
import { i18nReady } from "./i18n-loader.mjs";

const moduleInfo = FRONTEND_MODULE_MANIFEST.find((item) => item.id === "foundation");

export const foundationReady = i18nReady.then(async () => {
  await loadLegacyScript({
    src: "v2/app/runtime-socket.js",
    version: APP_BUILD_ID,
    moduleId: "runtime-socket",
  });

  await loadLegacyScript({
    src: moduleInfo?.legacySrc || "v2/app/foundation.js",
    version: APP_BUILD_ID,
    moduleId: "foundation",
  });
});
