"use strict";

const VALID_NETWORK_MODES = new Set(["server", "p2p", "relay"]);

function normalizeNetworkMode(value) {
  const clean = String(value || "").trim().toLowerCase();
  return VALID_NETWORK_MODES.has(clean) ? clean : "";
}

const argMode = normalizeNetworkMode(process.argv[2]);
const envMode = normalizeNetworkMode(process.env.NETWORK_MODE);
const selectedMode = argMode || envMode || "server";

if (!VALID_NETWORK_MODES.has(selectedMode)) {
  console.error(
    `[start:web] Invalid NETWORK_MODE "${process.argv[2]}". Allowed: ${Array.from(VALID_NETWORK_MODES).join(", ")}`
  );
  process.exit(1);
}

process.env.NETWORK_MODE = selectedMode;

const { startServer, stopServer } = require("../server");

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

startServer()
  .then(({ protocol, host, port }) => {
    const displayHost = host === "0.0.0.0" ? "localhost" : host;
    console.log(
      `[start:web] backend ready (${selectedMode}) at ${protocol}://${displayHost}:${port}`
    );
  })
  .catch((error) => {
    console.error(
      `[start:web] failed to start backend: ${error && error.message ? error.message : String(error)}`
    );
    process.exit(1);
  });
