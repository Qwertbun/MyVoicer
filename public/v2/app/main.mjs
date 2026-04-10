import { APP_BUILD_ID, FRONTEND_MODULE_MANIFEST } from "./build-info.mjs";
import { showFrontendBootstrapError } from "./legacy-runtime.mjs";
import { bootstrapReady } from "./bootstrap-loader.mjs";

globalThis.__SYNTO_FRONTEND_BUILD__ = APP_BUILD_ID;
globalThis.__SYNTO_FRONTEND_MODULES__ = FRONTEND_MODULE_MANIFEST.map((item) => ({ ...item }));

try {
  await bootstrapReady;
  console.info(
    `[v2-loader:esm] loaded ${FRONTEND_MODULE_MANIFEST.length} modules (${APP_BUILD_ID})`
  );
} catch (error) {
  showFrontendBootstrapError("Failed to initialize frontend modules.", error);
  throw error;
}
