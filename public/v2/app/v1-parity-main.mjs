import { installV1CompatFetchBridge } from "./v1-compat/fetch-bridge.mjs";
import { installV1CompatSocketBridge } from "./v1-compat/socket-bridge.mjs";

const BOUND_EVENT_TYPES = new Set(["click", "submit", "change", "input", "pointerdown", "keydown"]);
const IGNORE_UNBOUND_IDS = new Set([
  "join-selected-btn",
  "chat-input",
  "chat-send-btn",
  "window-chrome-title",
  "window-chrome-badge",
  "window-chrome-subtitle",
  "window-chrome-meta",
  "window-chrome-network",
  "window-chrome-security",
  "app-title",
  "app-subtitle",
  "status-label",
  "text-channels-title",
  "voice-rooms-title",
  "chat-room-title",
  "topbar-meta",
  "topbar-members-count",
  "topbar-network-mode",
  "topbar-crypto-state",
  "participants-title",
  "screen-hub-title",
  "screen-hub-meta",
  "screen-stage-title",
  "screen-stage-live-badge",
  "screen-stage-quality-badge",
  "screen-stage-volume-label",
  "screen-stage-volume-value",
  "screen-stage-empty-text",
  "profile-title",
  "profile-nickname-label",
  "profile-mic-label",
  "profile-speaker-label",
  "profile-theme-label",
  "profile-language-label",
  "profile-motion-label",
  "profile-background-label",
  "profile-network-label",
  "notifications-enabled-label",
  "notifications-saved-label",
  "notifications-mentions-label",
  "notifications-support-note",
  "profile-network-note",
]);

function installBindingAudit() {
  const boundIds = new Set();
  const originalAddEventListener = EventTarget.prototype.addEventListener;

  EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
    if (
      this instanceof Element
      && this.id
      && BOUND_EVENT_TYPES.has(String(type || "").toLowerCase())
    ) {
      boundIds.add(this.id);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  return () => {
    EventTarget.prototype.addEventListener = originalAddEventListener;

    const interactiveIds = Array.from(
      document.querySelectorAll(
        "button[id], input[id], select[id], textarea[id], form[id], [role='button'][id]"
      )
    )
      .map((node) => String(node.id || "").trim())
      .filter(Boolean);

    const unresolved = interactiveIds.filter(
      (id) => !boundIds.has(id) && !IGNORE_UNBOUND_IDS.has(id)
    );

    if (unresolved.length > 0) {
      console.warn("[v2-parity] unbound interactive ids detected", unresolved);
    } else {
      console.info("[v2-parity] interactive binding audit passed");
    }
  };
}

function installFoundationPreloadShims() {
  if (typeof window.loadOrCreateChatAuthorId === "function") {
    return;
  }

  window.loadOrCreateChatAuthorId = function loadOrCreateChatAuthorIdShim() {
    const storageKey = "voice_chat_author_id_v1";
    const normalize = (value) => String(value || "")
      .trim()
      .toLowerCase()
      .slice(0, 64);

    try {
      const stored = normalize(localStorage.getItem(storageKey));
      if (/^[a-z0-9][a-z0-9_-]{7,63}$/.test(stored)) {
        return stored;
      }
    } catch {
      // no-op
    }

    const generated = normalize(
      `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`
    );

    try {
      if (generated) {
        localStorage.setItem(storageKey, generated);
      }
    } catch {
      // no-op
    }

    return generated || `u${Math.random().toString(36).slice(2, 12)}`;
  };
}

const finishAudit = installBindingAudit();
installFoundationPreloadShims();
installV1CompatFetchBridge();
installV1CompatSocketBridge();

try {
  await import("/app/main.mjs");
  console.info("[v2-parity] v1 frontend bootstrapped over v2 backend");
} catch (error) {
  console.error("[v2-parity] bootstrap failed", error);
  throw error;
} finally {
  setTimeout(() => {
    try {
      finishAudit();
    } catch (error) {
      console.warn("[v2-parity] binding audit failed", error);
    }
  }, 1500);
}
