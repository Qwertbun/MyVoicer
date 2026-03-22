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
const BUILD_DIR = path.join(ROOT_DIR, "build");
const SOURCE_ICON_PATH = path.join(ROOT_DIR, "ico", "icons.png");

const INSTALLER_ICON_PATH = path.join(BUILD_DIR, "installerIcon.ico");
const UNINSTALLER_ICON_PATH = path.join(BUILD_DIR, "uninstallerIcon.ico");
const INSTALLER_SIDEBAR_PATH = path.join(BUILD_DIR, "installerSidebar.bmp");
const UNINSTALLER_SIDEBAR_PATH = path.join(BUILD_DIR, "uninstallerSidebar.bmp");
const INSTALLER_HEADER_PATH = path.join(BUILD_DIR, "installerHeader.bmp");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const SIDEBAR_WIDTH = 164;
const SIDEBAR_HEIGHT = 314;
const HEADER_WIDTH = 150;
const HEADER_HEIGHT = 57;
const TRANSPARENT_BG = { r: 0, g: 0, b: 0, alpha: 0 };

async function ensureSourceIcon() {
  try {
    await fs.access(SOURCE_ICON_PATH);
  } catch {
    throw new Error(`Source icon not found: ${SOURCE_ICON_PATH}`);
  }
}

async function createSizedIconBuffer(size) {
  return sharp(SOURCE_ICON_PATH)
    .resize(size, size, { fit: "contain", background: TRANSPARENT_BG })
    .png({ compressionLevel: 9, quality: 100 })
    .toBuffer();
}

async function writeIcoFile(targetPath) {
  const buffers = await Promise.all(ICO_SIZES.map((size) => createSizedIconBuffer(size)));
  const icoBuffer = await pngToIco(buffers);
  await fs.writeFile(targetPath, icoBuffer);
}

function encodeBmp24(width, height, pixels, channels = 4) {
  if (channels < 3) {
    throw new Error(`encodeBmp24 requires at least 3 channels, got ${channels}`);
  }

  const bytesPerPixel = 3;
  const rowSize = width * bytesPerPixel;
  const paddedRowSize = (rowSize + 3) & ~3;
  const pixelDataSize = paddedRowSize * height;
  const headerSize = 54;
  const fileSize = headerSize + pixelDataSize;

  const output = Buffer.alloc(fileSize);

  output.write("BM", 0, "ascii");
  output.writeUInt32LE(fileSize, 2);
  output.writeUInt32LE(0, 6);
  output.writeUInt32LE(headerSize, 10);

  output.writeUInt32LE(40, 14);
  output.writeInt32LE(width, 18);
  output.writeInt32LE(height, 22);
  output.writeUInt16LE(1, 26);
  output.writeUInt16LE(24, 28);
  output.writeUInt32LE(0, 30);
  output.writeUInt32LE(pixelDataSize, 34);
  output.writeInt32LE(2835, 38);
  output.writeInt32LE(2835, 42);
  output.writeUInt32LE(0, 46);
  output.writeUInt32LE(0, 50);

  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    const sourceRowOffset = sourceY * width * channels;
    const targetRowOffset = headerSize + y * paddedRowSize;

    for (let x = 0; x < width; x += 1) {
      const sourceOffset = sourceRowOffset + x * channels;
      const targetOffset = targetRowOffset + x * 3;
      output[targetOffset] = pixels[sourceOffset + 2];
      output[targetOffset + 1] = pixels[sourceOffset + 1];
      output[targetOffset + 2] = pixels[sourceOffset];
    }
  }

  return output;
}

function installerSidebarSvg(variant) {
  const isInstall = variant === "install";
  const accentPrimary = isInstall ? "#58ecff" : "#ff5f9f";
  const accentSecondary = isInstall ? "#5d8aff" : "#ff9e4f";
  const title = isInstall ? "SYNTO" : "SYNTO";
  const subtitle = isInstall ? "Voice messenger setup" : "Uninstall wizard";

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIDEBAR_WIDTH}" height="${SIDEBAR_HEIGHT}" viewBox="0 0 ${SIDEBAR_WIDTH} ${SIDEBAR_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#030711"/>
      <stop offset="52%" stop-color="#081426"/>
      <stop offset="100%" stop-color="#050912"/>
    </linearGradient>
    <radialGradient id="glowA" cx="50%" cy="24%" r="55%">
      <stop offset="0%" stop-color="${accentPrimary}" stop-opacity="0.44"/>
      <stop offset="100%" stop-color="${accentPrimary}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="76%" cy="88%" r="56%">
      <stop offset="0%" stop-color="${accentSecondary}" stop-opacity="0.36"/>
      <stop offset="100%" stop-color="${accentSecondary}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M20 0H0V20" fill="none" stroke="rgba(140, 183, 255, 0.14)" stroke-width="1"/>
    </pattern>
    <linearGradient id="line" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${accentPrimary}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${accentPrimary}" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="${accentSecondary}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="164" height="314" fill="url(#bg)"/>
  <rect width="164" height="314" fill="url(#grid)" opacity="0.58"/>
  <circle cx="84" cy="86" r="86" fill="url(#glowA)"/>
  <circle cx="130" cy="286" r="120" fill="url(#glowB)"/>

  <rect x="14" y="16" width="136" height="64" rx="12" fill="rgba(6, 16, 30, 0.74)" stroke="rgba(125, 200, 255, 0.35)"/>
  <text x="24" y="41" fill="#e3f7ff" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="700">${title}</text>
  <text x="24" y="60" fill="rgba(187, 228, 255, 0.9)" font-family="Segoe UI, Arial, sans-serif" font-size="11">${subtitle}</text>

  <rect x="24" y="86" width="116" height="116" rx="22" fill="rgba(7, 15, 27, 0.84)" stroke="rgba(120, 180, 255, 0.32)"/>
  <path d="M18 222 H146" stroke="url(#line)" stroke-width="1.4"/>
  <path d="M26 244 H138" stroke="url(#line)" stroke-width="1.1" opacity="0.82"/>
  <path d="M34 264 H130" stroke="url(#line)" stroke-width="1" opacity="0.72"/>

  <text x="24" y="292" fill="rgba(188, 216, 245, 0.82)" font-family="Segoe UI, Arial, sans-serif" font-size="10">secure voice rooms and calls</text>
</svg>
`.trim();
}

function installerHeaderSvg() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${HEADER_WIDTH}" height="${HEADER_HEIGHT}" viewBox="0 0 ${HEADER_WIDTH} ${HEADER_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#040811"/>
      <stop offset="64%" stop-color="#0a1830"/>
      <stop offset="100%" stop-color="#0a1e3e"/>
    </linearGradient>
    <radialGradient id="shine" cx="76%" cy="38%" r="55%">
      <stop offset="0%" stop-color="#58ecff" stop-opacity="0.56"/>
      <stop offset="100%" stop-color="#58ecff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="line" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#56e7ff" stop-opacity="0.16"/>
      <stop offset="56%" stop-color="#56e7ff" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#5c82ff" stop-opacity="0.16"/>
    </linearGradient>
  </defs>

  <rect width="150" height="57" fill="url(#bg)"/>
  <circle cx="118" cy="12" r="36" fill="url(#shine)"/>
  <text x="12" y="27" fill="#def5ff" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700">SYNTO SETUP</text>
  <text x="12" y="43" fill="rgba(188, 227, 255, 0.88)" font-family="Segoe UI, Arial, sans-serif" font-size="9">desktop voice messenger</text>
  <path d="M10 48 H140" stroke="url(#line)" stroke-width="1"/>
</svg>
`.trim();
}

async function writeSidebarBitmap(variant, targetPath) {
  const iconSize = 78;
  const iconTop = 105;
  const iconLeft = Math.round((SIDEBAR_WIDTH - iconSize) / 2);

  const backgroundPng = await sharp(Buffer.from(installerSidebarSvg(variant))).png().toBuffer();
  const overlayIcon = await sharp(SOURCE_ICON_PATH)
    .resize(iconSize, iconSize, { fit: "contain", background: TRANSPARENT_BG })
    .png()
    .toBuffer();

  const composedPng = await sharp(backgroundPng)
    .composite([{ input: overlayIcon, left: iconLeft, top: iconTop }])
    .png()
    .toBuffer();

  const { data, info } = await sharp(composedPng)
    .flatten({ background: "#040812" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bitmap = encodeBmp24(info.width, info.height, data, info.channels);
  await fs.writeFile(targetPath, bitmap);
}

async function writeHeaderBitmap(targetPath) {
  const iconSize = 24;
  const iconLeft = 116;
  const iconTop = 16;

  const backgroundPng = await sharp(Buffer.from(installerHeaderSvg())).png().toBuffer();
  const overlayIcon = await sharp(SOURCE_ICON_PATH)
    .resize(iconSize, iconSize, { fit: "contain", background: TRANSPARENT_BG })
    .png()
    .toBuffer();

  const composedPng = await sharp(backgroundPng)
    .composite([{ input: overlayIcon, left: iconLeft, top: iconTop }])
    .png()
    .toBuffer();

  const { data, info } = await sharp(composedPng)
    .flatten({ background: "#040812" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bitmap = encodeBmp24(info.width, info.height, data, info.channels);
  await fs.writeFile(targetPath, bitmap);
}

async function run() {
  await ensureSourceIcon();
  await fs.mkdir(BUILD_DIR, { recursive: true });

  await writeIcoFile(INSTALLER_ICON_PATH);
  await writeIcoFile(UNINSTALLER_ICON_PATH);
  await writeSidebarBitmap("install", INSTALLER_SIDEBAR_PATH);
  await writeSidebarBitmap("uninstall", UNINSTALLER_SIDEBAR_PATH);
  await writeHeaderBitmap(INSTALLER_HEADER_PATH);

  console.log("[installer-assets] generated:");
  console.log(`- ${path.relative(ROOT_DIR, INSTALLER_ICON_PATH)}`);
  console.log(`- ${path.relative(ROOT_DIR, UNINSTALLER_ICON_PATH)}`);
  console.log(`- ${path.relative(ROOT_DIR, INSTALLER_HEADER_PATH)}`);
  console.log(`- ${path.relative(ROOT_DIR, INSTALLER_SIDEBAR_PATH)}`);
  console.log(`- ${path.relative(ROOT_DIR, UNINSTALLER_SIDEBAR_PATH)}`);
}

run().catch((error) => {
  console.error(
    `[installer-assets] failed: ${error && error.message ? error.message : String(error)}`
  );
  process.exitCode = 1;
});
