"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const pngToIcoModule = require("png-to-ico");

const pngToIco =
  typeof pngToIcoModule === "function" ? pngToIcoModule : pngToIcoModule?.default;

if (typeof pngToIco !== "function") {
  throw new Error("png-to-ico export is not a function");
}

const ROOT_DIR = path.resolve(__dirname, "..");
const SOURCE_ICON_PATH = path.join(ROOT_DIR, "ico", "icons.png");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const PUBLIC_ICONS_DIR = path.join(PUBLIC_DIR, "icons");
const WEB_FAVICON_ICO_PATH = path.join(PUBLIC_DIR, "favicon.ico");
const ELECTRON_APP_ICO_PATH = path.join(ROOT_DIR, "ico", "app.ico");

const WEB_PNG_TARGETS = [
  { filename: "favicon-16x16.png", size: 16 },
  { filename: "favicon-32x32.png", size: 32 },
  { filename: "apple-touch-icon.png", size: 180 },
  { filename: "android-chrome-192x192.png", size: 192 },
  { filename: "android-chrome-512x512.png", size: 512 },
];

const WEB_ICO_SIZES = [16, 32, 48];
const ELECTRON_ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const TRANSPARENT_BG = { r: 0, g: 0, b: 0, alpha: 0 };

function createSizedPngBuffer(size) {
  return sharp(SOURCE_ICON_PATH)
    .resize(size, size, { fit: "contain", background: TRANSPARENT_BG })
    .png({ compressionLevel: 9, quality: 100 })
    .toBuffer();
}

async function ensureSourceIcon() {
  try {
    await fs.access(SOURCE_ICON_PATH);
  } catch {
    throw new Error(`Source icon not found: ${SOURCE_ICON_PATH}`);
  }
}

async function writeWebPngTargets() {
  for (const target of WEB_PNG_TARGETS) {
    const targetPath = path.join(PUBLIC_ICONS_DIR, target.filename);
    const buffer = await createSizedPngBuffer(target.size);
    await fs.writeFile(targetPath, buffer);
    console.log(`[icons] web png: ${target.filename}`);
  }
}

async function writeWebFaviconIco() {
  const buffers = await Promise.all(WEB_ICO_SIZES.map((size) => createSizedPngBuffer(size)));
  const icoBuffer = await pngToIco(buffers);
  await fs.writeFile(WEB_FAVICON_ICO_PATH, icoBuffer);
  console.log("[icons] web ico: favicon.ico");
}

async function writeElectronAppIco() {
  const buffers = await Promise.all(ELECTRON_ICO_SIZES.map((size) => createSizedPngBuffer(size)));
  const icoBuffer = await pngToIco(buffers);
  await fs.writeFile(ELECTRON_APP_ICO_PATH, icoBuffer);
  console.log("[icons] electron ico: ico/app.ico");
}

async function run() {
  await ensureSourceIcon();
  await fs.mkdir(PUBLIC_ICONS_DIR, { recursive: true });
  await writeWebPngTargets();
  await writeWebFaviconIco();
  await writeElectronAppIco();
  console.log("[icons] done");
}

run().catch((error) => {
  console.error(`[icons] failed: ${error && error.message ? error.message : String(error)}`);
  process.exitCode = 1;
});
