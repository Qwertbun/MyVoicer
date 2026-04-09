"use strict";

const { spawn } = require("node:child_process");
const electronBinary = require("electron");

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;
const forwardedArgs = process.argv.slice(2);

const child = spawn(electronBinary, [".", ...forwardedArgs], {
  stdio: "inherit",
  env: childEnv,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
