const legacyScriptPromiseBySrc = new Map();

function toVersionedSrc(src, version) {
  const cleanSrc = String(src || "").trim();
  if (!cleanSrc) {
    return "";
  }

  const cleanVersion = String(version || "").trim();
  if (!cleanVersion) {
    return cleanSrc;
  }

  const separator = cleanSrc.includes("?") ? "&" : "?";
  return `${cleanSrc}${separator}v=${encodeURIComponent(cleanVersion)}`;
}

function getScriptHostElement() {
  if (document.head) {
    return document.head;
  }
  if (document.body) {
    return document.body;
  }
  return document.documentElement || null;
}

export function loadLegacyScript({ src, version = "", moduleId = "" } = {}) {
  const cleanSrc = String(src || "").trim();
  if (!cleanSrc) {
    return Promise.reject(new Error("Legacy script source is required."));
  }

  const versionedSrc = toVersionedSrc(cleanSrc, version);
  if (legacyScriptPromiseBySrc.has(versionedSrc)) {
    return legacyScriptPromiseBySrc.get(versionedSrc);
  }

  const loadPromise = new Promise((resolve, reject) => {
    const host = getScriptHostElement();
    if (!host) {
      reject(new Error(`Unable to resolve script host for ${cleanSrc}`));
      return;
    }

    const script = document.createElement("script");
    script.src = versionedSrc;
    script.async = false;
    script.defer = false;
    script.dataset.legacyModule = String(moduleId || cleanSrc);
    script.onload = () => {
      resolve();
    };
    script.onerror = () => {
      reject(new Error(`Failed to load legacy module: ${cleanSrc}`));
    };
    host.appendChild(script);
  });

  legacyScriptPromiseBySrc.set(versionedSrc, loadPromise);
  return loadPromise;
}

export function showFrontendBootstrapError(message, error = null) {
  const cleanMessage = String(message || "Failed to initialize frontend modules.");
  console.error(cleanMessage, error);

  if (!document.body) {
    return;
  }

  const existing = document.getElementById("app-loader-error");
  if (existing) {
    existing.textContent = cleanMessage;
    return;
  }

  const alert = document.createElement("div");
  alert.id = "app-loader-error";
  alert.setAttribute("role", "alert");
  alert.style.position = "fixed";
  alert.style.left = "16px";
  alert.style.right = "16px";
  alert.style.bottom = "16px";
  alert.style.zIndex = "99999";
  alert.style.padding = "12px 14px";
  alert.style.borderRadius = "10px";
  alert.style.fontFamily = "monospace";
  alert.style.fontSize = "12px";
  alert.style.lineHeight = "1.45";
  alert.style.color = "#f8f9fb";
  alert.style.background = "rgba(174, 36, 36, 0.95)";
  alert.style.boxShadow = "0 10px 24px rgba(0, 0, 0, 0.25)";
  alert.textContent = cleanMessage;
  document.body.appendChild(alert);
}
