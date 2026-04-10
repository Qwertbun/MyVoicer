import { APP_BUILD_ID, FRONTEND_MODULE_MANIFEST } from "./build-info.mjs";
import { loadLegacyScript } from "./legacy-runtime.mjs";
import { foundationReady } from "./foundation-loader.mjs";

const moduleInfo = FRONTEND_MODULE_MANIFEST.find((item) => item.id === "relay");

export const relayReady = foundationReady.then(() =>
  loadLegacyScript({
    src: moduleInfo?.legacySrc || "v2/app/relay.js",
    version: APP_BUILD_ID,
    moduleId: "relay",
  })
);
