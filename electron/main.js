"use strict";

const path = require("path");
const net = require("net");
const fs = require("fs");
const { Notification, app, BrowserWindow, desktopCapturer, ipcMain, shell } = require("electron");

const DEFAULT_PORT = Number(process.env.ELECTRON_INTERNAL_PORT || 3000);
const UPDATE_CHECK_TIMEOUT_MS = Number(process.env.UPDATE_CHECK_TIMEOUT_MS || 12000);
const SPLASH_MIN_VISIBLE_MS = Number(process.env.SPLASH_MIN_VISIBLE_MS || 9000);
const MAIN_PAGE_LOAD_RETRIES = Number(process.env.MAIN_PAGE_LOAD_RETRIES || 3);
const MAIN_PAGE_LOAD_TIMEOUT_MS = Number(process.env.MAIN_PAGE_LOAD_TIMEOUT_MS || 14000);
const MAIN_PAGE_RETRY_DELAY_MS = Number(process.env.MAIN_PAGE_RETRY_DELAY_MS || 700);
const DESKTOP_SETTINGS_FILE_NAME = "desktop-settings.json";
const NETWORK_MODE_ENV_KEY = "NETWORK_MODE";
const NETWORK_MODE_SERVER = "server";
const NETWORK_MODE_P2P = "p2p";
const BOOT_ENV_NETWORK_MODE_RAW = String(process.env[NETWORK_MODE_ENV_KEY] || "").trim();
const P2P_BOOTSTRAP_ENV_KEYS = [
  "P2P_BOOTSTRAP",
  "QWERBENTUM_P2P_BOOTSTRAP",
  "HYPERSWARM_BOOTSTRAP",
];
const REMOTE_BACKEND_ENV_KEYS = [
  "QWERBENTUM_REMOTE_URL",
  "QWERBENTUM_BACKEND_URL",
  "ELECTRON_REMOTE_BACKEND_URL",
];

let splashWindow = null;
let mainWindow = null;
let backendUrl = "";
let shutdownInProgress = false;
let startServer = null;
let stopServer = null;
let pendingNotificationActivationPayload = null;
const SESSION_PERMISSIONS_KEY = "__qwerbentumPermissionsConfigured";

function ensureDirectorySafe(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function configureElectronStoragePaths() {
  const preferredUserData = process.env.ELECTRON_USER_DATA_DIR
    ? path.resolve(process.env.ELECTRON_USER_DATA_DIR)
    : path.join(app.getPath("appData"), "qwerbentum");

  let resolvedUserData = preferredUserData;
  try {
    ensureDirectorySafe(preferredUserData);
    app.setPath("userData", preferredUserData);
  } catch (error) {
    resolvedUserData = path.join(app.getPath("temp"), "qwerbentum-user-data");
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
  return String(value || "").trim().toLowerCase() === NETWORK_MODE_P2P
    ? NETWORK_MODE_P2P
    : NETWORK_MODE_SERVER;
}

function hasExplicitEnvironmentNetworkMode() {
  return BOOT_ENV_NETWORK_MODE_RAW !== "";
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
    };
  } catch {
    return {};
  }
}

function saveDesktopSettings(nextSettings = {}) {
  const filePath = getDesktopSettingsPath();
  const payload = {
    networkMode: normalizeEmbeddedNetworkMode(nextSettings.networkMode),
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

function getEmbeddedNetworkModeState() {
  return {
    mode: resolveEmbeddedNetworkMode(),
    remoteBackendConfigured: Boolean(resolveConfiguredBackendUrl()),
    environmentLocked: hasExplicitEnvironmentNetworkMode(),
  };
}

function buildMainPageUrl(baseUrl) {
  const normalizedBaseUrl = normalizeConfiguredBackendUrl(baseUrl);
  return new URL("./index.html", `${normalizedBaseUrl}/`).toString();
}

function ensureBackendLoaded() {
  if (startServer && stopServer) {
    return;
  }

  const runtimeRoot = path.join(app.getPath("userData"), "runtime");
  process.env.CHAT_UPLOADS_ROOT = path.join(runtimeRoot, "chat-uploads");
  process.env.CHAT_STATE_ROOT = path.join(runtimeRoot, "data");
  process.env[NETWORK_MODE_ENV_KEY] = resolveEmbeddedNetworkMode();
  console.log(`[main] embedded network mode: ${process.env[NETWORK_MODE_ENV_KEY]}`);

  const bootstrapNodes = resolveConfiguredP2PBootstrap();
  if (bootstrapNodes.length > 0) {
    process.env.P2P_BOOTSTRAP = bootstrapNodes.join(",");
    console.log(`[main] p2p bootstrap override: ${process.env.P2P_BOOTSTRAP}`);
  }

  const backend = require("../server");
  startServer = backend.startServer;
  stopServer = backend.stopServer;
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
  splashWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    show: true,
    backgroundColor: "#000000",
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
  mainWindow = new BrowserWindow({
    width: 1540,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: "#090b10",
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
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-finish-load", () => {
    flushPendingNotificationActivation();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
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
          const sources = await desktopCapturer.getSources({
            types: ["screen", "window"],
            fetchWindowIcons: false,
            thumbnailSize: { width: 0, height: 0 },
          });
          const selectedSource = sources.find((source) => String(source.id).startsWith("screen:")) || sources[0];
          if (!selectedSource) {
            callback({});
            return;
          }

          callback({
            video: selectedSource,
            audio: request.audioRequested ? "loopback" : undefined,
          });
        } catch (error) {
          console.warn(
            `[desktop-capture] ${error && error.message ? error.message : String(error)}`
          );
          callback({});
        }
      },
      {
        useSystemPicker: true,
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
    <title>qwerbentum startup error</title>
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

async function launchMainFlow() {
  await checkUpdatesFromRepository();

  createSplashWindow();
  const splashShownAt = Date.now();
  const configuredBackendUrl = resolveConfiguredBackendUrl();

  if (configuredBackendUrl) {
    backendUrl = configuredBackendUrl;
    console.log(`[main] remote backend mode: ${backendUrl}`);
  } else {
    ensureBackendLoaded();

    const port = await findOpenPort(DEFAULT_PORT);
    const startedServer = await startServer({
      host: "127.0.0.1",
      port,
    });

    backendUrl = `http://127.0.0.1:${startedServer.port}`;
  }

  createMainWindow();
  const mainPageUrl = buildMainPageUrl(backendUrl);
  try {
    await loadMainPageWithRetries(mainWindow, mainPageUrl);
  } catch (error) {
    const errorPageHtml = buildLoadErrorPage(error, mainPageUrl);
    await mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(errorPageHtml)}`);
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
}

ipcMain.handle("app:get-version", () => app.getVersion());
ipcMain.handle("app:get-backend-url", () => backendUrl);
ipcMain.handle("app:get-network-mode", () => getEmbeddedNetworkModeState());
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
    title: title || "qwerbentum",
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
      loadMainPageWithRetries(mainWindow, buildMainPageUrl(backendUrl)).catch((error) => {
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
