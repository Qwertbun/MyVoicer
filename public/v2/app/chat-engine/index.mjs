function normalizeString(value, maxLength = 1200) {
  return String(value || "").trim().slice(0, maxLength);
}

function randomRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createWorkerRpc(worker) {
  const pending = new Map();

  worker.addEventListener("message", (event) => {
    const payload = event?.data && typeof event.data === "object" ? event.data : {};
    const requestId = String(payload.requestId || "").trim();
    if (!requestId || !pending.has(requestId)) {
      return;
    }

    const resolver = pending.get(requestId);
    pending.delete(requestId);
    resolver(payload);
  });

  function call(op, payload) {
    const requestId = randomRequestId();
    return new Promise((resolve) => {
      pending.set(requestId, resolve);
      worker.postMessage({ op, requestId, payload });
      setTimeout(() => {
        if (!pending.has(requestId)) {
          return;
        }
        const timeoutResolver = pending.get(requestId);
        pending.delete(requestId);
        timeoutResolver({
          ok: false,
          requestId,
          errorCode: "worker_timeout",
        });
      }, 20000);
    });
  }

  return {
    call,
  };
}

export function createChatEngine({ store, protocolClient }) {
  const relayWorker = new Worker("/v2/app/workers/relay-worker.mjs", {
    type: "module",
  });
  const workerRpc = createWorkerRpc(relayWorker);

  function pushStatus(text) {
    store.setState({
      status: normalizeString(text, 240),
    });
  }

  async function sendEncryptedMessage(rawText) {
    const state = store.getState();
    const roomId = normalizeString(state.roomId, 32);
    const roomKey = normalizeString(state.roomKey, 128);
    const text = normalizeString(rawText, 1200);

    if (!roomId || !roomKey || !text) {
      pushStatus("Unable to send: missing room or room key.");
      return false;
    }

    const encrypted = await workerRpc.call("encrypt", {
      roomId,
      roomKey,
      text,
    });
    if (!encrypted.ok) {
      pushStatus(`Encryption failed (${encrypted.errorCode || "unknown"}).`);
      return false;
    }

    const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const response = await protocolClient.send("chat.send", {
      envelope: {
        v: 1,
        alg: "AES-GCM-256",
        transportVersion: 2,
        roomId,
        messageId,
        senderId: state.selfId || "",
        createdAt: Date.now(),
        iv: encrypted.result.iv,
        ciphertext: encrypted.result.ciphertext,
        attachmentRefs: [],
      },
    });

    if (!response.ok) {
      pushStatus(`Send failed (${response.errorCode || "unknown"}).`);
      return false;
    }

    pushStatus("Encrypted message sent.");
    return true;
  }

  async function decryptIncomingEnvelope(envelope) {
    const state = store.getState();
    const roomKey = normalizeString(state.roomKey, 128);
    if (!roomKey) {
      return "[encrypted message: room key required]";
    }

    const decrypted = await workerRpc.call("decrypt", {
      roomId: envelope.roomId,
      roomKey,
      iv: envelope.iv,
      ciphertext: envelope.ciphertext,
    });

    if (!decrypted.ok) {
      return `[encrypted message: ${decrypted.errorCode || "decrypt_failed"}]`;
    }

    return normalizeString(decrypted.result.text, 1200) || "[empty]";
  }

  async function handleIncomingEnvelope(payload) {
    const envelope = payload?.envelope;
    if (!envelope || typeof envelope !== "object") {
      return;
    }

    const text = await decryptIncomingEnvelope(envelope);
    const sourceId = normalizeString(payload.sourceId || envelope.senderId, 96);

    store.setState((prevState) => {
      const nextMessages = prevState.chatMessages.concat([
        {
          id: envelope.messageId,
          sourceId,
          text,
          createdAt: Number(envelope.createdAt) || Date.now(),
        },
      ]).slice(-300);

      return {
        chatMessages: nextMessages,
      };
    });
  }

  return {
    sendEncryptedMessage,
    handleIncomingEnvelope,
    dispose: () => relayWorker.terminate(),
  };
}
