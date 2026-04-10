"use strict";

const path = require("path");
const net = require("net");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { Notification, app, BrowserWindow, desktopCapturer, ipcMain, shell } = require("electron");

const DEFAULT_PORT = Number(process.env.ELECTRON_INTERNAL_PORT || 3000);
const UPDATE_CHECK_TIMEOUT_MS = Number(process.env.UPDATE_CHECK_TIMEOUT_MS || 12000);
// Keep splash visible at least until HEXAGON reaches SYNC 99.8%.
const HEXAGON_SYNC_TARGET_VISIBLE_MS = Number(process.env.HEXAGON_SYNC_TARGET_VISIBLE_MS || 20500);
const SPLASH_MIN_VISIBLE_MS = Math.max(
  HEXAGON_SYNC_TARGET_VISIBLE_MS,
  Number(process.env.SPLASH_MIN_VISIBLE_MS || 0)
);
const MAIN_PAGE_LOAD_RETRIES = Number(process.env.MAIN_PAGE_LOAD_RETRIES || 3);
const MAIN_PAGE_LOAD_TIMEOUT_MS = Number(process.env.MAIN_PAGE_LOAD_TIMEOUT_MS || 14000);
const MAIN_PAGE_RETRY_DELAY_MS = Number(process.env.MAIN_PAGE_RETRY_DELAY_MS || 700);
const DESKTOP_SETTINGS_FILE_NAME = "desktop-settings.json";
const NETWORK_MODE_ENV_KEY = "NETWORK_MODE";
const RUNTIME_VERSION_ENV_KEY = "RUNTIME_VERSION";
const NETWORK_MODE_SERVER = "server";
const NETWORK_MODE_P2P = "p2p";
const NETWORK_MODE_RELAY = "relay";
const RUNTIME_VERSION_V2 = "v2";
const BOOT_ENV_NETWORK_MODE_RAW = String(process.env[NETWORK_MODE_ENV_KEY] || "").trim();
const BOOT_ENV_RUNTIME_VERSION_RAW = String(process.env[RUNTIME_VERSION_ENV_KEY] || "").trim();
const P2P_BOOTSTRAP_ENV_KEYS = [
  "P2P_BOOTSTRAP",
  "SYNTO_P2P_BOOTSTRAP",
  "QWERBENTUM_P2P_BOOTSTRAP",
  "HYPERSWARM_BOOTSTRAP",
];
const REMOTE_BACKEND_ENV_KEYS = [
  "SYNTO_REMOTE_URL",
  "SYNTO_BACKEND_URL",
  "QWERBENTUM_REMOTE_URL",
  "QWERBENTUM_BACKEND_URL",
  "ELECTRON_REMOTE_BACKEND_URL",
];
const DEFAULT_REMOTE_BACKEND_URL = "https://lan.mine-souls.ru:3001";
const REMOTE_HEALTHCHECK_TIMEOUT_MS = Number(process.env.REMOTE_HEALTHCHECK_TIMEOUT_MS || 2600);
const APP_WINDOW_WIDTH = 1540;
const APP_WINDOW_HEIGHT = 940;
const APP_WINDOW_MIN_WIDTH = 1100;
const APP_WINDOW_MIN_HEIGHT = 700;
const APP_ICON_ICO_PATH = path.join(__dirname, "..", "ico", "app.ico");
const APP_ICON_PNG_FALLBACK_PATH = path.join(__dirname, "..", "ico", "icons.png");

let splashWindow = null;
let mainWindow = null;
let backendUrl = "";
let shutdownInProgress = false;
let startServer = null;
let stopServer = null;
let loadedRuntimeVersion = "";
let pendingNotificationActivationPayload = null;
let preparedDisplayCapture = null;
const SESSION_PERMISSIONS_KEY = "__syntoPermissionsConfigured";

function resolveWindowIconPath() {
  if (fs.existsSync(APP_ICON_ICO_PATH)) {
    return APP_ICON_ICO_PATH;
  }
  if (fs.existsSync(APP_ICON_PNG_FALLBACK_PATH)) {
    return APP_ICON_PNG_FALLBACK_PATH;
  }
  return undefined;
}

function ensureDirectorySafe(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function configureElectronStoragePaths() {
  const preferredUserData = process.env.ELECTRON_USER_DATA_DIR
    ? path.resolve(process.env.ELECTRON_USER_DATA_DIR)
    : path.join(app.getPath("appData"), "synto");

  let resolvedUserData = preferredUserData;
  try {
    ensureDirectorySafe(preferredUserData);
    app.setPath("userData", preferredUserData);
  } catch (error) {
    resolvedUserData = path.join(app.getPath("temp"), "synto-user-data");
    ensureDirectorySafe(resolvedUserData);
    app.setPath("userData", resolvedUserData);
    console.warn(
      `[storage] fallback userData path used: ${error && error.message ? error.message : String(error)}`
    );
  }

  const sessionDataPath = path.join(resolvedUserData, "session");
  ensureDirectorySafe(sessionDataPath);
  app.setPath("sessionData", sessionDataPath);
}

configureElectronStoragePaths();

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBootstrapNodes(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return [];
  }

  const items = raw
    .split(/[,\n;\r\t ]+/)
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const unique = new Set();
  const normalized = [];
  for (const item of items) {
    if (!unique.has(item)) {
      unique.add(item);
      normalized.push(item);
    }
  }

  return normalized;
}

function normalizeEmbeddedNetworkMode(value) {
  const clean = String(value || "").trim().toLowerCase();
  if (clean === NETWORK_MODE_P2P) {
    return NETWORK_MODE_P2P;
  }
  if (clean === NETWORK_MODE_RELAY) {
    return NETWORK_MODE_RELAY;
  }
  return NETWORK_MODE_SERVER;
}

function normalizeRuntimeVersion(value) {
  return RUNTIME_VERSION_V2;
}

function hasExplicitEnvironmentNetworkMode() {
  return BOOT_ENV_NETWORK_MODE_RAW !== "";
}

function hasExplicitEnvironmentRuntimeVersion() {
  return BOOT_ENV_RUNTIME_VERSION_RAW !== "";
}

function getDesktopSettingsPath() {
  return path.join(app.getPath("userData"), DESKTOP_SETTINGS_FILE_NAME);
}

function loadDesktopSettings() {
  const filePath = getDesktopSettingsPath();

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return {
      networkMode: normalizeEmbeddedNetworkMode(parsed.networkMode),
      runtimeVersion: normalizeRuntimeVersion(parsed.runtimeVersion),
    };
  } catch {
    return {};
  }
}

function saveDesktopSettings(nextSettings = {}) {
  const filePath = getDesktopSettingsPath();
  const payload = {
    networkMode: normalizeEmbeddedNetworkMode(nextSettings.networkMode),
    runtimeVersion: normalizeRuntimeVersion(nextSettings.runtimeVersion),
  };

  ensureDirectorySafe(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function getCliBackendUrlArgument() {
  const args = Array.isArray(process.argv) ? process.argv : [];
  for (const arg of args) {
    const text = String(arg || "").trim();
    if (!text.toLowerCase().startsWith("--backend-url=")) {
      continue;
    }
    return text.slice("--backend-url=".length).trim();
  }
  return "";
}

function getCliP2PBootstrapArgument() {
  const args = Array.isArray(process.argv) ? process.argv : [];
  for (const arg of args) {
    const text = String(arg || "").trim();
    if (!text.toLowerCase().startsWith("--p2p-bootstrap=")) {
      continue;
    }
    return text.slice("--p2p-bootstrap=".length).trim();
  }
  return "";
}

function getCliRuntimeVersionArgument() {
  const args = Array.isArray(process.argv) ? process.argv : [];
  for (const arg of args) {
    const text = String(arg || "").trim();
    if (!text.toLowerCase().startsWith("--runtime-version=")) {
      continue;
    }
    return text.slice("--runtime-version=".length).trim();
  }
  return "";
}

function normalizeConfiguredBackendUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  let parsedUrl = null;
  try {
    parsedUrl = new URL(candidate);
  } catch {
    throw new Error(`Invalid backend URL: ${raw}`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`Backend URL must use http:// or https:// (${raw})`);
  }

  const normalizedPath = parsedUrl.pathname.replace(/\/+$/, "");
  parsedUrl.pathname = normalizedPath || "/";
  parsedUrl.search = "";
  parsedUrl.hash = "";

  return parsedUrl.toString().replace(/\/$/, "");
}

function resolveConfiguredBackendUrl() {
  const cliValue = getCliBackendUrlArgument();
  if (cliValue) {
    return normalizeConfiguredBackendUrl(cliValue);
  }

  for (const envKey of REMOTE_BACKEND_ENV_KEYS) {
    const envValue = String(process.env[envKey] || "").trim();
    if (envValue) {
      return normalizeConfiguredBackendUrl(envValue);
    }
  }

  return "";
}

function getRemoteBackendSelection() {
  const explicitUrl = resolveConfiguredBackendUrl();
  if (explicitUrl) {
    return {
      url: explicitUrl,
      explicit: true,
    };
  }

  return {
    url: normalizeConfiguredBackendUrl(DEFAULT_REMOTE_BACKEND_URL),
    explicit: false,
  };
}

function resolveConfiguredP2PBootstrap() {
  const cliValue = getCliP2PBootstrapArgument();
  if (cliValue) {
    return parseBootstrapNodes(cliValue);
  }

  for (const envKey of P2P_BOOTSTRAP_ENV_KEYS) {
    const envValue = String(process.env[envKey] || "").trim();
    if (!envValue) {
      continue;
    }

    const nodes = parseBootstrapNodes(envValue);
    if (nodes.length > 0) {
      return nodes;
    }
  }

  return [];
}

function resolveEmbeddedNetworkMode() {
  if (hasExplicitEnvironmentNetworkMode()) {
    return normalizeEmbeddedNetworkMode(BOOT_ENV_NETWORK_MODE_RAW);
  }

  const settings = loadDesktopSettings();
  return normalizeEmbeddedNetworkMode(settings.networkMode);
}

function hasExplicitCliRuntimeVersion() {
  return false;
}

function hasExplicitRuntimeVersionOverride() {
  return true;
}

function resolveEmbeddedRuntimeVersion() {
  return RUNTIME_VERSION_V2;
}

function getEmbeddedNetworkModeState() {
  const backendSelection = getRemoteBackendSelection();
  return {
    mode: resolveEmbeddedNetworkMode(),
    remoteBackendConfigured: Boolean(backendSelection.explicit),
    environmentLocked: hasExplicitEnvironmentNetworkMode(),
  };
}

function getRuntimeInfoState() {
  const backendSelection = getRemoteBackendSelection();
  return {
    runtimeVersion: resolveEmbeddedRuntimeVersion(),
    networkMode: resolveEmbeddedNetworkMode(),
    remoteBackendConfigured: Boolean(backendSelection.explicit),
    environmentLocked: hasExplicitRuntimeVersionOverride(),
  };
}

function buildMainPageUrl(baseUrl) {
  const normalizedBaseUrl = normalizeConfiguredBackendUrl(baseUrl);
  return new URL("./v2", `${normalizedBaseUrl}/`).toString();
}

async function ensureBackendLoaded() {
  if (startServer && stopServer && loadedRuntimeVersion === RUNTIME_VERSION_V2) {
    return;
  }

  const runtimeRoot = path.join(app.getPath("userData"), "runtime");
  process.env.CHAT_UPLOADS_ROOT = path.join(runtimeRoot, "chat-uploads");
  process.env.CHAT_STATE_ROOT = path.join(runtimeRoot, "data");
  process.env[NETWORK_MODE_ENV_KEY] = resolveEmbeddedNetworkMode();
  process.env[RUNTIME_VERSION_ENV_KEY] = RUNTIME_VERSION_V2;
  console.log(`[main] embedded network mode: ${process.env[NETWORK_MODE_ENV_KEY]}`);
  console.log(`[main] runtime version: ${RUNTIME_VERSION_V2} (locked)`);

  const bootstrapNodes = resolveConfiguredP2PBootstrap();
  if (bootstrapNodes.length > 0) {
    process.env.P2P_BOOTSTRAP = bootstrapNodes.join(",");
    console.log(`[main] p2p bootstrap override: ${process.env.P2P_BOOTSTRAP}`);
  }

  const backend = await import(
    pathToFileURL(path.join(__dirname, "..", "v2", "backend", "server.mjs")).href
  );

  startServer = backend.startServer;
  stopServer = backend.stopServer;
  loadedRuntimeVersion = RUNTIME_VERSION_V2;
}

function findOpenPort(startPort) {
  const firstPort = Number.isFinite(startPort) ? startPort : DEFAULT_PORT;
  const maxPort = firstPort + 200;

  function canListen(port) {
    return new Promise((resolve) => {
      const probe = net.createServer();
      probe.once("error", () => resolve(false));
      probe.once("listening", () => {
        probe.close(() => resolve(true));
      });
      probe.listen(port, "127.0.0.1");
    });
  }

  return (async () => {
    for (let port = firstPort; port <= maxPort; port += 1) {
      const available = await canListen(port);
      if (available) {
        return port;
      }
    }
    throw new Error(`No free port found in range ${firstPort}-${maxPort}`);
  })();
}

async function checkUpdatesFromRepository() {
  const { autoUpdater } = require("electron-updater");

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    console.warn(`[updater] ${error && error.message ? error.message : String(error)}`);
  });
  autoUpdater.on("update-available", (info) => {
    const version = info && info.version ? info.version : "unknown";
    console.log(`[updater] update available: ${version}`);
  });
  autoUpdater.on("update-not-available", () => {
    console.log("[updater] update not available");
  });
  autoUpdater.on("update-downloaded", (info) => {
    const version = info && info.version ? info.version : "unknown";
    console.log(`[updater] update downloaded: ${version}`);
  });

  const timeout = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Update check timeout after ${UPDATE_CHECK_TIMEOUT_MS}ms`));
    }, UPDATE_CHECK_TIMEOUT_MS);
  });

  try {
    await Promise.race([autoUpdater.checkForUpdates(), timeout]);
  } catch (error) {
    console.warn(`[updater] check skipped: ${error && error.message ? error.message : String(error)}`);
  }
}

function createSplashWindow() {
  const windowIconPath = resolveWindowIconPath();
  splashWindow = new BrowserWindow({
    width: APP_WINDOW_WIDTH,
    height: APP_WINDOW_HEIGHT,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    show: true,
    backgroundColor: "#000000",
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  splashWindow.setMenuBarVisibility(false);
  splashWindow.loadFile(path.join(__dirname, "..", "public", "hexagon-loading.html"));

  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

function createMainWindow() {
  const windowIconPath = resolveWindowIconPath();
  mainWindow = new BrowserWindow({
    width: APP_WINDOW_WIDTH,
    height: APP_WINDOW_HEIGHT,
    minWidth: APP_WINDOW_MIN_WIDTH,
    minHeight: APP_WINDOW_MIN_HEIGHT,
    frame: false,
    show: false,
    backgroundColor: "#090b10",
    ...(windowIconPath ? { icon: windowIconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  configureMainWindowPermissions(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    let protocol = "";
    try {
      protocol = new URL(String(url || "")).protocol;
    } catch {
      return { action: "deny" };
    }

    if (protocol === "http:" || protocol === "https:") {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-finish-load", () => {
    flushPendingNotificationActivation();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function serializeDisplaySource(source) {
  const thumbnailDataUrl =
    source && source.thumbnail && typeof source.thumbnail.toDataURL === "function"
      ? source.thumbnail.toDataURL()
      : "";

  return {
    id: String(source?.id || ""),
    name: String(source?.name || "Display source"),
    type: String(source?.id || "").startsWith("window:") ? "window" : "screen",
    displayId: String(source?.display_id || ""),
    thumbnailDataUrl,
  };
}

async function listDisplaySources() {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    fetchWindowIcons: false,
    thumbnailSize: { width: 420, height: 236 },
  });

  return sources
    .map(serializeDisplaySource)
    .filter((item) => item.id);
}

async function prepareDisplayCapture(payload = {}) {
  const sourceId = String(payload?.sourceId || "").trim();
  if (!sourceId) {
    return { ok: false, reason: "source-required" };
  }

  const withAudio = payload?.withAudio !== false;
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    fetchWindowIcons: false,
    thumbnailSize: { width: 1, height: 1 },
  });
  const known = sources.some((item) => String(item.id) === sourceId);
  if (!known) {
    return { ok: false, reason: "source-not-found" };
  }

  preparedDisplayCapture = {
    sourceId,
    withAudio,
    preparedAt: Date.now(),
  };

  return { ok: true };
}

function configureMainWindowPermissions(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  const session = targetWindow.webContents.session;
  if (!session || session[SESSION_PERMISSIONS_KEY]) {
    return;
  }

  const allowed = new Set(["media", "display-capture", "fullscreen"]);

  const isMainWindowContents = (webContents) => {
    return Boolean(
      mainWindow
        && !mainWindow.isDestroyed()
        && webContents
        && webContents.id === mainWindow.webContents.id
    );
  };

  session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (!isMainWindowContents(webContents)) {
      callback(false);
      return;
    }
    callback(allowed.has(String(permission || "")));
  });

  if (typeof session.setPermissionCheckHandler === "function") {
    session.setPermissionCheckHandler((webContents, permission) => {
      if (!isMainWindowContents(webContents)) {
        return false;
      }
      return allowed.has(String(permission || ""));
    });
  }

  if (typeof session.setDisplayMediaRequestHandler === "function") {
    session.setDisplayMediaRequestHandler(
      async (request, callback) => {
        try {
          const prepared = preparedDisplayCapture;
          preparedDisplayCapture = null;

          if (!prepared || !prepared.sourceId) {
            callback({});
            return;
          }

          const sources = await desktopCapturer.getSources({
            types: ["screen", "window"],
            fetchWindowIcons: false,
            thumbnailSize: { width: 1, height: 1 },
          });
          const selectedSource =
            sources.find((source) => String(source.id) === String(prepared.sourceId)) || null;
          if (!selectedSource) {
            callback({});
            return;
          }

          callback({
            video: selectedSource,
            audio: request.audioRequested && prepared.withAudio ? "loopback" : undefined,
          });
        } catch (error) {
          console.warn(
            `[desktop-capture] ${error && error.message ? error.message : String(error)}`
          );
          callback({});
        }
      },
      {
        useSystemPicker: false,
      }
    );
  }

  session[SESSION_PERMISSIONS_KEY] = true;
}

function revealMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }
}

function isMainWindowActive() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }

  return Boolean(
    mainWindow.isVisible() &&
    !mainWindow.isMinimized() &&
    mainWindow.isFocused()
  );
}

function flushPendingNotificationActivation() {
  if (
    !pendingNotificationActivationPayload ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    mainWindow.webContents.isLoading()
  ) {
    return;
  }

  mainWindow.webContents.send("notifications:activated", pendingNotificationActivationPayload);
  pendingNotificationActivationPayload = null;
}

function buildLoadErrorPage(error, targetUrl) {
  const safeUrl = String(targetUrl || "").replace(/</g, "&lt;");
  const safeError = String(error && error.message ? error.message : error || "Unknown error").replace(
    /</g,
    "&lt;"
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>synto startup error</title>
    <style>
      body { margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #0a0f1a; color: #d6e6ff; display: grid; place-items: center; min-height: 100vh; }
      .card { max-width: 720px; margin: 24px; padding: 24px; border: 1px solid #24457a; border-radius: 12px; background: #11192a; }
      h1 { margin-top: 0; font-size: 24px; }
      p { line-height: 1.5; }
      code { background: #0b1324; padding: 2px 6px; border-radius: 6px; color: #9fd3ff; }
    </style>
  </head>
  <body>
    <section class="card">
      <h1>Failed to open main page</h1>
      <p>Target URL: <code>${safeUrl}</code></p>
      <p>Error: <code>${safeError}</code></p>
      <p>Restart the app. If it repeats, check firewall/antivirus restrictions for localhost.</p>
    </section>
  </body>
</html>`;
}

function waitForNavigationResult(targetWindow, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Navigation timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const onFinish = () => {
      cleanup();
      resolve();
    };

    const onFail = (_, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      cleanup();
      reject(new Error(`Navigation failed (${errorCode}) ${errorDescription} at ${validatedURL}`));
    };

    const cleanup = () => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      targetWindow.webContents.removeListener("did-finish-load", onFinish);
      targetWindow.webContents.removeListener("did-fail-load", onFail);
    };

    targetWindow.webContents.once("did-finish-load", onFinish);
    targetWindow.webContents.once("did-fail-load", onFail);
  });
}

async function loadMainPageWithRetries(targetWindow, targetUrl) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAIN_PAGE_LOAD_RETRIES; attempt += 1) {
    try {
      const navigation = waitForNavigationResult(targetWindow, MAIN_PAGE_LOAD_TIMEOUT_MS);
      await targetWindow.loadURL(targetUrl);
      await navigation;
      return;
    } catch (error) {
      lastError = error;
      console.warn(
        `[main] load attempt ${attempt}/${MAIN_PAGE_LOAD_RETRIES} failed: ${
          error && error.message ? error.message : String(error)
        }`
      );
      if (attempt < MAIN_PAGE_LOAD_RETRIES) {
        await wait(MAIN_PAGE_RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError || new Error("Main page load failed");
}

async function checkRemoteBackendHealth(baseUrl) {
  const normalizedBaseUrl = normalizeConfiguredBackendUrl(baseUrl);
  const healthUrl = new URL("./api/v2/health", `${normalizedBaseUrl}/`).toString();
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = setTimeout(() => {
    try {
      controller?.abort();
    } catch {
      // no-op
    }
  }, REMOTE_HEALTHCHECK_TIMEOUT_MS);

  try {
    if (typeof fetch !== "function") {
      console.warn("[main] remote health check skipped: fetch unavailable");
      return true;
    }

    const response = await fetch(healthUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller?.signal,
    });
    if (!response.ok) {
      return false;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    return String(payload?.runtimeVersion || "").trim().toLowerCase() === RUNTIME_VERSION_V2;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function startEmbeddedBackend(reason = "") {
  await ensureBackendLoaded();
  const port = await findOpenPort(DEFAULT_PORT);
  const startedServer = await startServer({
    host: "127.0.0.1",
    port,
  });

  const nextUrl = `http://127.0.0.1:${startedServer.port}`;
  console.log(
    `[main] backend source: embedded (${String(reason || "explicit").trim() || "explicit"}) -> ${nextUrl}`
  );
  return nextUrl;
}

async function launchMainFlow() {
  await checkUpdatesFromRepository();

  createSplashWindow();
  const splashShownAt = Date.now();
  const backendSelection = getRemoteBackendSelection();
  const runtimeVersion = resolveEmbeddedRuntimeVersion();
  console.log(`[main] runtime version: ${runtimeVersion} (locked)`);

  createMainWindow();
  let backendSource = "";
  let canFallbackToEmbedded = false;

  if (backendSelection.explicit) {
    backendUrl = backendSelection.url;
    backendSource = "remote-explicit";
    canFallbackToEmbedded = false;
    console.log(`[main] backend source: ${backendSource} -> ${backendUrl}`);
  } else {
    canFallbackToEmbedded = true;
    const remoteHealthy = await checkRemoteBackendHealth(backendSelection.url);
    if (remoteHealthy) {
      backendUrl = backendSelection.url;
      backendSource = "remote-default";
      console.log(`[main] backend source: ${backendSource} -> ${backendUrl}`);
    } else {
      backendUrl = await startEmbeddedBackend("remote_healthcheck_failed");
      backendSource = "embedded";
    }
  }

  let mainPageUrl = buildMainPageUrl(backendUrl);
  try {
    await loadMainPageWithRetries(mainWindow, mainPageUrl);
  } catch (error) {
    if (canFallbackToEmbedded && backendSource.startsWith("remote")) {
      try {
        console.warn(
          `[main] remote navigation failed, fallback to embedded: ${
            error && error.message ? error.message : String(error)
          }`
        );
        backendUrl = await startEmbeddedBackend("remote_navigation_failed");
        mainPageUrl = buildMainPageUrl(backendUrl);
        await loadMainPageWithRetries(mainWindow, mainPageUrl);
      } catch (fallbackError) {
        const errorPageHtml = buildLoadErrorPage(fallbackError, mainPageUrl);
        await mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(errorPageHtml)}`);
      }
    } else {
      const errorPageHtml = buildLoadErrorPage(error, mainPageUrl);
      await mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(errorPageHtml)}`);
    }
  }

  const splashVisibleMs = Date.now() - splashShownAt;
  const waitMoreMs = Math.max(0, SPLASH_MIN_VISIBLE_MS - splashVisibleMs);
  if (waitMoreMs > 0) {
    await wait(waitMoreMs);
  }

  revealMainWindow();
}

async function shutdownBackend() {
  if (!stopServer) {
    return;
  }

  if (shutdownInProgress) {
    return;
  }
  shutdownInProgress = true;
  try {
    await stopServer();
  } catch (error) {
    console.warn(`[server] stop failed: ${error && error.message ? error.message : String(error)}`);
  }

  startServer = null;
  stopServer = null;
  loadedRuntimeVersion = "";
}

function getWindowForEvent(event) {
  const fromSender = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
  if (fromSender && !fromSender.isDestroyed()) {
    return fromSender;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  return null;
}

ipcMain.handle("app:get-network-mode", () => getEmbeddedNetworkModeState());
ipcMain.handle("v2:app:get-runtime-info", () => getRuntimeInfoState());
ipcMain.handle("screen:list-display-sources", async () => {
  try {
    return await listDisplaySources();
  } catch (error) {
    console.warn(`[desktop-capture] list sources failed: ${error && error.message ? error.message : String(error)}`);
    return [];
  }
});
ipcMain.handle("screen:prepare-display-capture", async (_event, payload) => {
  try {
    return await prepareDisplayCapture(payload);
  } catch (error) {
    return {
      ok: false,
      reason: error && error.message ? error.message : "prepare-failed",
    };
  }
});
ipcMain.handle("screen:clear-prepared-display-capture", () => {
  preparedDisplayCapture = null;
  return { ok: true };
});
ipcMain.handle("app:set-network-mode", async (_event, nextMode) => {
  const currentState = getEmbeddedNetworkModeState();
  if (currentState.remoteBackendConfigured) {
    return {
      ok: false,
      reason: "remote-backend",
      ...currentState,
    };
  }

  if (currentState.environmentLocked) {
    return {
      ok: false,
      reason: "environment-locked",
      ...currentState,
    };
  }

  const normalizedMode = normalizeEmbeddedNetworkMode(nextMode);
  if (normalizedMode === currentState.mode) {
    return {
      ok: true,
      changed: false,
      restarting: false,
      ...currentState,
    };
  }

  saveDesktopSettings({
    ...loadDesktopSettings(),
    networkMode: normalizedMode,
  });

  await shutdownBackend();
  app.relaunch();
  setTimeout(() => {
    app.exit(0);
  }, 50);

  return {
    ok: true,
    changed: true,
    restarting: true,
    mode: normalizedMode,
    remoteBackendConfigured: false,
    environmentLocked: false,
  };
});
ipcMain.handle("v2:app:set-runtime-version", async (_event, nextRuntimeVersion) => {
  return {
    ok: false,
    changed: false,
    restarting: false,
    runtimeVersion: RUNTIME_VERSION_V2,
    reason: "runtime_locked_v2",
    requestedRuntimeVersion: normalizeRuntimeVersion(nextRuntimeVersion),
  };
});
ipcMain.handle("window:minimize", (event) => {
  const targetWindow = getWindowForEvent(event);
  if (targetWindow) {
    targetWindow.minimize();
  }
  return { ok: true };
});
ipcMain.handle("window:close", (event) => {
  const targetWindow = getWindowForEvent(event);
  if (targetWindow) {
    targetWindow.close();
  }
  return { ok: true };
});
ipcMain.handle("notifications:supported", () => Notification.isSupported());
ipcMain.handle("notifications:show", (_event, payload = {}) => {
  if (!Notification.isSupported()) {
    return { shown: false, reason: "unsupported" };
  }

  if (isMainWindowActive()) {
    return { shown: false, reason: "window-active" };
  }

  const title = String(payload.title || "").trim().slice(0, 120);
  const body = String(payload.body || "").trim().slice(0, 320);
  if (!title && !body) {
    return { shown: false, reason: "empty" };
  }

  const notificationPayload = {
    roomId: String(payload.roomId || "").trim().slice(0, 32),
    messageId: String(payload.messageId || "").trim().slice(0, 64),
    kind: String(payload.kind || "").trim().slice(0, 24),
  };

  const notification = new Notification({
    title: title || "synto",
    body,
  });

  notification.on("click", () => {
    pendingNotificationActivationPayload = notificationPayload;

    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
    flushPendingNotificationActivation();
  });

  notification.show();
  return { shown: true };
});

app.whenReady().then(async () => {
  try {
    await launchMainFlow();
    flushPendingNotificationActivation();
  } catch (error) {
    console.error(`[main] launch failed: ${error && error.message ? error.message : String(error)}`);
    if (!mainWindow) {
      createMainWindow();
    }
    const fallbackHtml = buildLoadErrorPage(error, backendUrl || "not-initialized");
    await mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(fallbackHtml)}`);
    revealMainWindow();
    flushPendingNotificationActivation();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && backendUrl) {
      createMainWindow();
      loadMainPageWithRetries(
        mainWindow,
        buildMainPageUrl(backendUrl)
      ).catch((error) => {
        console.error(`[main] failed to re-open window: ${error.message}`);
      });
      revealMainWindow();
      flushPendingNotificationActivation();
    }
  });
});

app.on("before-quit", async (event) => {
  if (shutdownInProgress) {
    return;
  }
  event.preventDefault();
  await shutdownBackend();
  app.exit(0);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
