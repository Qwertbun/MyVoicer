"use strict";

const path = require("path");
const { pathToFileURL } = require("url");

const VALID_NETWORK_MODES = new Set(["server", "p2p", "relay"]);
const VALID_RUNTIME_VERSIONS = new Set(["v1", "v2"]);
const RUNTIME_VERSION_ENV_KEY = "RUNTIME_VERSION";

function normalizeNetworkMode(value) {
  const clean = String(value || "").trim().toLowerCase();
  return VALID_NETWORK_MODES.has(clean) ? clean : "";
}

function normalizeRuntimeVersion(value) {
  const clean = String(value || "").trim().toLowerCase();
  return VALID_RUNTIME_VERSIONS.has(clean) ? clean : "";
}

function readRuntimeVersionArg(argv = []) {
  for (const arg of argv) {
    const text = String(arg || "").trim().toLowerCase();
    if (text.startsWith("--runtime-version=")) {
      return text.slice("--runtime-version=".length).trim();
    }
  }
  return "";
}

function readNetworkModeArg(argv = []) {
  for (const arg of argv) {
    const text = String(arg || "").trim().toLowerCase();
    if (!text || text.startsWith("--")) {
      continue;
    }
    return text;
  }
  return "";
}

async function loadBackendModule(runtimeVersion) {
  if (runtimeVersion === "v2") {
    const moduleUrl = pathToFileURL(
      path.resolve(__dirname, "..", "v2", "backend", "server.mjs")
    ).href;
    return import(moduleUrl);
  }
  return require("../server");
}

const cliArgs = process.argv.slice(2);
const rawArgMode = readNetworkModeArg(cliArgs);
const argMode = normalizeNetworkMode(rawArgMode);
const envMode = normalizeNetworkMode(process.env.NETWORK_MODE);
const selectedMode = argMode || envMode || "server";
const argRuntimeVersion = normalizeRuntimeVersion(readRuntimeVersionArg(cliArgs));
const envRuntimeVersion = normalizeRuntimeVersion(process.env[RUNTIME_VERSION_ENV_KEY]);
const runtimeVersion = argRuntimeVersion || envRuntimeVersion || "v1";

if (rawArgMode && !argMode) {
  console.error(
    `[start:web] Invalid NETWORK_MODE "${rawArgMode}". Allowed: ${Array.from(VALID_NETWORK_MODES).join(", ")}`
  );
  process.exit(1);
}

process.env.NETWORK_MODE = selectedMode;
process.env[RUNTIME_VERSION_ENV_KEY] = runtimeVersion;

let startServer = null;
let stopServer = null;

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  try {
    await stopServer();
    console.log(`[start:web] graceful shutdown (${signal})`);
  } catch (error) {
    console.error(
      `[start:web] shutdown failed: ${error && error.message ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT").finally(() => process.exit(process.exitCode || 0));
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM").finally(() => process.exit(process.exitCode || 0));
});

Promise.resolve()
  .then(async () => {
    const backend = await loadBackendModule(runtimeVersion);
    startServer = backend.startServer;
    stopServer = backend.stopServer;
    if (typeof startServer !== "function" || typeof stopServer !== "function") {
      throw new Error("Backend module does not export startServer/stopServer");
    }
    return startServer();
  })
  .then(({ protocol, host, port }) => {
    const displayHost = host === "0.0.0.0" ? "localhost" : host;
    console.log(
      `[start:web] backend ready (${selectedMode}, runtime=${runtimeVersion}) at ${protocol}://${displayHost}:${port}`
    );
  })
  .catch((error) => {
    console.error(
      `[start:web] failed to start backend: ${error && error.message ? error.message : String(error)}`
    );
    process.exit(1);
  });
