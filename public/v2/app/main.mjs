import { createBootstrap } from "./bootstrap.mjs";

let dispose = null;

if (window.desktopApp) {
  document.body.classList.add("is-electron-runtime");

  const minimizeBtn = document.getElementById("window-minimize-btn");
  const closeBtn = document.getElementById("window-close-btn");

  minimizeBtn?.addEventListener("click", () => {
    const pending = window.desktopApp.minimizeWindow?.();
    if (pending && typeof pending.catch === "function") {
      pending.catch(() => {});
    }
  });

  closeBtn?.addEventListener("click", () => {
    const pending = window.desktopApp.closeWindow?.();
    if (pending && typeof pending.catch === "function") {
      pending.catch(() => {});
    }
  });
}

try {
  const bootstrap = createBootstrap();
  dispose = bootstrap.start();
  console.info("[v2] frontend bootstrap started");
} catch (error) {
  console.error("[v2] bootstrap failed", error);
}

window.addEventListener("beforeunload", () => {
  if (typeof dispose === "function") {
    try {
      dispose();
    } catch {
      // no-op
    }
  }
});
