(() => {
  // Legacy compatibility entrypoint.
  // Kept so older HTML builds that still reference app.js can bootstrap new ESM runtime.
  const currentScript = document.currentScript;
  const currentSrc = currentScript ? String(currentScript.getAttribute("src") || "") : "";
  const querySuffix = currentSrc.includes("?") ? currentSrc.slice(currentSrc.indexOf("?")) : "";

  const moduleScript = document.createElement("script");
  moduleScript.type = "module";
  moduleScript.src = `app/main.mjs${querySuffix}`;
  moduleScript.dataset.compatEntry = "app.js";
  (document.head || document.documentElement || document.body).appendChild(moduleScript);
})();
