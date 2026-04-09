function normalizeString(value, maxLength = 256) {
  return String(value || "").trim().slice(0, maxLength);
}

function randomRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createProtocolClient({ onEvent, onConnectionChange } = {}) {
  let ws = null;
  let connected = false;
  const ackResolvers = new Map();

  function emitConnectionChange(nextConnected) {
    connected = Boolean(nextConnected);
    if (typeof onConnectionChange === "function") {
      onConnectionChange(connected);
    }
  }

  function close() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
    ws = null;
    emitConnectionChange(false);
  }

  function connect(baseHttpUrl = "") {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const fallback = window.location.origin;
    const targetBase = normalizeString(baseHttpUrl, 1024) || fallback;
    const wsUrl = targetBase
      .replace(/^http:/i, "ws:")
      .replace(/^https:/i, "wss:")
      .replace(/\/+$/, "") + "/v2/ws";

    const nextWs = new WebSocket(wsUrl);
    ws = nextWs;

    nextWs.addEventListener("open", () => {
      emitConnectionChange(true);
    });

    nextWs.addEventListener("close", () => {
      if (ws === nextWs) {
        ws = null;
      }
      emitConnectionChange(false);
      for (const [requestId, resolver] of ackResolvers.entries()) {
        resolver({ ok: false, requestId, errorCode: "socket_closed", message: "Socket closed" });
      }
      ackResolvers.clear();
    });

    nextWs.addEventListener("message", (event) => {
      let envelope = null;
      try {
        envelope = JSON.parse(String(event.data || ""));
      } catch {
        envelope = null;
      }

      if (!envelope || typeof envelope !== "object") {
        return;
      }

      const type = normalizeString(envelope.type, 96);
      const requestId = normalizeString(envelope.requestId, 96);
      const payload = envelope.payload && typeof envelope.payload === "object"
        ? envelope.payload
        : {};

      if (type === "ack" && requestId && ackResolvers.has(requestId)) {
        const resolver = ackResolvers.get(requestId);
        ackResolvers.delete(requestId);
        resolver(payload);
        return;
      }

      if (typeof onEvent === "function") {
        onEvent({
          type,
          requestId,
          payload,
        });
      }
    });

    nextWs.addEventListener("error", () => {
      emitConnectionChange(false);
    });
  }

  function send(type, payload = {}, requestId = randomRequestId()) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve({
        ok: false,
        requestId,
        errorCode: "socket_not_open",
        message: "Socket is not open.",
      });
    }

    const envelope = {
      v: 2,
      type: normalizeString(type, 96),
      requestId,
      payload,
    };

    return new Promise((resolve) => {
      ackResolvers.set(requestId, resolve);
      ws.send(JSON.stringify(envelope));
      setTimeout(() => {
        if (!ackResolvers.has(requestId)) {
          return;
        }

        const timeoutResolver = ackResolvers.get(requestId);
        ackResolvers.delete(requestId);
        timeoutResolver({
          ok: false,
          requestId,
          errorCode: "ack_timeout",
          message: "Ack timeout",
        });
      }, 20000);
    });
  }

  return {
    connect,
    close,
    send,
    isConnected: () => connected,
  };
}
