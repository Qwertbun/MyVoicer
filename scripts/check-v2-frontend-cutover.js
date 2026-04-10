"use strict";

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const v2Root = path.join(projectRoot, "public", "v2");
const v2AppRoot = path.join(v2Root, "app");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function walkFiles(dirPath) {
  const output = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      output.push(...walkFiles(nextPath));
      continue;
    }
    output.push(nextPath);
  }
  return output;
}

function checkEntryPoint() {
  const indexPath = path.join(v2Root, "index.html");
  const indexText = readText(indexPath);

  assert(
    /src=["']\/v2\/app\/main\.mjs\?v=[^"']+["']/i.test(indexText),
    "public/v2/index.html must load /v2/app/main.mjs."
  );
  assert(!indexText.includes("v1-parity"), "public/v2/index.html must not reference v1-parity.");
  assert(
    !/["']\/app\/main\.mjs(?:[?"'])/i.test(indexText),
    "public/v2/index.html must not reference /app/main.mjs."
  );
}

function checkRequiredFiles() {
  const required = [
    "main.mjs",
    "build-info.mjs",
    "legacy-runtime.mjs",
    "i18n-loader.mjs",
    "foundation-loader.mjs",
    "relay-loader.mjs",
    "rooms-loader.mjs",
    "chat-loader.mjs",
    "media-loader.mjs",
    "realtime-loader.mjs",
    "bootstrap-loader.mjs",
    "runtime-socket.js",
    "i18n.js",
    "foundation.js",
    "relay.js",
    "rooms.js",
    "chat.js",
    "media.js",
    "realtime.js",
    "bootstrap.js",
  ];

  for (const fileName of required) {
    const absolutePath = path.join(v2AppRoot, fileName);
    assert(fs.existsSync(absolutePath), `Missing v2 runtime file: public/v2/app/${fileName}`);
  }
}

function checkForbiddenReferences() {
  const textFiles = walkFiles(v2Root).filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return ext === ".html" || ext === ".js" || ext === ".mjs" || ext === ".css" || ext === ".json";
  });

  const forbidden = [
    { label: "v1-parity", test: (text) => text.includes("v1-parity") },
    { label: "v1-compat", test: (text) => text.includes("v1-compat") },
    { label: "/app/main.mjs", test: (text) => /["']\/app\/main\.mjs(?:[?"'])/i.test(text) },
    { label: "/api/network-mode", test: (text) => text.includes("/api/network-mode") },
    { label: "/api/relay/", test: (text) => text.includes("/api/relay/") },
    { label: "/api/notifications/check", test: (text) => text.includes("/api/notifications/check") },
    { label: "installV1Compat", test: (text) => text.includes("installV1Compat") },
    { label: "window.io =", test: (text) => text.includes("window.io =") },
    { label: "window.fetch =", test: (text) => text.includes("window.fetch =") },
  ];

  for (const filePath of textFiles) {
    const text = readText(filePath);
    for (const token of forbidden) {
      assert(
        !token.test(text),
        `Forbidden reference "${token.label}" found in ${path.relative(projectRoot, filePath)}`
      );
    }
  }
}

function main() {
  checkEntryPoint();
  checkRequiredFiles();
  checkForbiddenReferences();
  console.log("v2_frontend_cutover_ok");
}

main();
