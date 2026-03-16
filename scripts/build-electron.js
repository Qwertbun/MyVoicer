"use strict";

const path = require("path");
const { spawn } = require("node:child_process");

function getTimestampFolderName(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

const passthroughArgs = process.argv.slice(2);
const hasOutputArg = passthroughArgs.some(
  (arg) =>
    arg.startsWith("--config.directories.output=") ||
    arg.startsWith("-c.directories.output=") ||
    arg === "--config" ||
    arg === "-c"
);

const generatedOutputPath = path.join("release", getTimestampFolderName(new Date()));
const finalArgs = hasOutputArg
  ? passthroughArgs
  : [...passthroughArgs, `--config.directories.output=${generatedOutputPath}`];

const cliEntrypoint = require.resolve("electron-builder/out/cli/cli.js");
const child = spawn(process.execPath, [cliEntrypoint, ...finalArgs], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
