"use strict";

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const publicRoot = path.join(projectRoot, "public");
const appRoot = path.join(publicRoot, "app");

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function checkIndexEntrypoint() {
  const indexPath = path.join(publicRoot, "index.html");
  const indexText = readText(indexPath);
  assert(
    indexText.includes('type="module" src="app/main.mjs?v=20260409-frontend-esm1"'),
    "public/index.html must load app/main.mjs with type=module."
  );
}

function checkRequiredFiles() {
  const requiredFiles = [
    "app.js",
    "app/main.mjs",
    "app/build-info.mjs",
    "app/legacy-runtime.mjs",
    "app/i18n-loader.mjs",
    "app/foundation-loader.mjs",
    "app/relay-loader.mjs",
    "app/rooms-loader.mjs",
    "app/chat-loader.mjs",
    "app/media-loader.mjs",
    "app/realtime-loader.mjs",
    "app/bootstrap-loader.mjs",
    "app/i18n.js",
    "app/foundation.js",
    "app/relay.js",
    "app/rooms.js",
    "app/chat.js",
    "app/media.js",
    "app/realtime.js",
    "app/bootstrap.js",
  ];

  for (const relativePath of requiredFiles) {
    const absolutePath = path.join(publicRoot, relativePath);
    assert(fs.existsSync(absolutePath), `Missing frontend file: ${relativePath}`);
  }
}

function checkManifestConsistency() {
  const buildInfoPath = path.join(appRoot, "build-info.mjs");
  const buildInfoText = readText(buildInfoPath);
  const expectedLegacyOrder = [
    "app/i18n.js",
    "app/foundation.js",
    "app/relay.js",
    "app/rooms.js",
    "app/chat.js",
    "app/media.js",
    "app/realtime.js",
    "app/bootstrap.js",
  ];

  let lastIndex = -1;
  for (const item of expectedLegacyOrder) {
    const index = buildInfoText.indexOf(`legacySrc: "${item}"`);
    assert(index > lastIndex, `Manifest order mismatch for ${item}`);
    lastIndex = index;
  }
}

function main() {
  checkIndexEntrypoint();
  checkRequiredFiles();
  checkManifestConsistency();
  console.log("frontend_structure_ok");
}

main();
