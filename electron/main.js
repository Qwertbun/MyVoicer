"use strict";

const path = require("path");
const net = require("net");
const { app, BrowserWindow, ipcMain, shell } = require("electron");

const DEFAULT_PORT = Number(process.env.ELECTRON_INTERNAL_PORT || 3000);
const UPDATE_CHECK_TIMEOUT_MS = Number(process.env.UPDATE_CHECK_TIMEOUT_MS || 12000);
const SPLASH_MIN_VISIBLE_MS = Number(process.env.SPLASH_MIN_VISIBLE_MS || 2200);

let splashWindow = null;
let mainWindow = null;
let backendUrl = "";
let shutdownInProgress = false;
let startServer = null;
let stopServer = null;

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

function ensureBackendLoaded() {
  if (startServer && stopServer) {
    return;
  }

  const runtimeRoot = path.join(app.getPath("userData"), "runtime");
  process.env.CHAT_UPLOADS_ROOT = path.join(runtimeRoot, "chat-uploads");
  process.env.CHAT_STATE_ROOT = path.join(runtimeRoot, "data");

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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
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

async function launchMainFlow() {
  await checkUpdatesFromRepository();

  createSplashWindow();
  const splashShownAt = Date.now();
  ensureBackendLoaded();

  const port = await findOpenPort(DEFAULT_PORT);
  const startedServer = await startServer({
    host: "127.0.0.1",
    port,
  });

  backendUrl = `http://127.0.0.1:${startedServer.port}`;

  createMainWindow();
  await mainWindow.loadURL(`${backendUrl}/index.html`);

  const splashVisibleMs = Date.now() - splashShownAt;
  const waitMoreMs = Math.max(0, SPLASH_MIN_VISIBLE_MS - splashVisibleMs);
  if (waitMoreMs > 0) {
    await wait(waitMoreMs);
  }

  if (mainWindow.webContents.isLoading()) {
    await new Promise((resolve) => {
      mainWindow.webContents.once("did-finish-load", resolve);
    });
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

app.whenReady().then(async () => {
  await launchMainFlow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && backendUrl) {
      createMainWindow();
      mainWindow.loadURL(`${backendUrl}/index.html`).catch((error) => {
        console.error(`[main] failed to re-open window: ${error.message}`);
      });
      mainWindow.webContents.once("did-finish-load", () => {
        revealMainWindow();
      });
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
