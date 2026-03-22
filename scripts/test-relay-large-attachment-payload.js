"use strict";

const assert = require("node:assert/strict");
const { io } = require("socket.io-client");

function waitForEvent(socket, eventName, { timeoutMs = 5000, predicate = null } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timeout waiting for "${eventName}"`));
    }, timeoutMs);

    const onEvent = (payload) => {
      if (typeof predicate === "function" && !predicate(payload)) {
        return;
      }
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      resolve(payload);
    };

    socket.on(eventName, onEvent);
  });
}

function waitForConnect(socket, label, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} connect timeout`));
    }, timeoutMs);

    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onConnectError = (error) => {
      cleanup();
      reject(new Error(`${label} connect failed: ${error?.message || "unknown"}`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
    };

    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
  });
}

function joinRoom(socket, { roomId, name, authorId }, label, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("joined-room", onJoined);
      reject(new Error(`${label} join timeout`));
    }, timeoutMs);

    const onJoined = () => {
      clearTimeout(timer);
      socket.off("joined-room", onJoined);
      resolve();
    };

    socket.on("joined-room", onJoined);
    socket.emit("join-room", { roomId, name, authorId });
  });
}

async function main() {
  const previousNetworkMode = process.env.NETWORK_MODE;
  process.env.NETWORK_MODE = "relay";

  const { startServer, stopServer } = require("../server");
  const sockets = [];
  let serverStarted = false;

  try {
    const started = await startServer({ host: "127.0.0.1", port: 0 });
    serverStarted = true;

    const baseUrl = `${started.protocol}://127.0.0.1:${started.port}`;
    const roomId = `relay-large-att-${Date.now().toString(36)}`;
    const messageId = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const attachmentId = `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const senderAuthorId = `sender-${Math.random().toString(36).slice(2, 10)}`;
    const largeCiphertext = "A".repeat(13 * 1024 * 1024 + 97);

    const sender = io(baseUrl, { transports: ["websocket"] });
    const receiver = io(baseUrl, { transports: ["websocket"] });
    sockets.push(sender, receiver);

    const senderChatErrors = [];
    sender.on("chat-error", (payload) => {
      senderChatErrors.push(String(payload?.message || "unknown"));
    });

    await Promise.all([
      waitForConnect(sender, "sender"),
      waitForConnect(receiver, "receiver"),
    ]);

    await Promise.all([
      joinRoom(
        sender,
        {
          roomId,
          name: "Sender",
          authorId: senderAuthorId,
        },
        "sender"
      ),
      joinRoom(
        receiver,
        {
          roomId,
          name: "Receiver",
          authorId: `receiver-${Math.random().toString(36).slice(2, 10)}`,
        },
        "receiver"
      ),
    ]);

    const receiverChatPromise = waitForEvent(receiver, "chat-message", {
      timeoutMs: 15000,
      predicate: (payload) => payload?.envelope?.messageId === messageId,
    });

    sender.emit("chat-message", {
      envelope: {
        v: 1,
        alg: "AES-GCM-256",
        roomId,
        messageId,
        senderId: senderAuthorId,
        createdAt: Date.now(),
        iv: "iv-relay-large-payload",
        ciphertext: "ciphertext-relay-large-payload",
        attachmentRefs: [
          {
            messageId,
            attachmentId,
            name: "large.bin",
            mimeType: "application/octet-stream",
            size: 100 * 1024 * 1024,
          },
        ],
      },
      attachmentPayloads: [
        {
          messageId,
          attachmentId,
          name: "large.bin",
          mimeType: "application/octet-stream",
          size: 100 * 1024 * 1024,
          iv: "iv-relay-large-attachment",
          ciphertext: largeCiphertext,
        },
      ],
    });

    const receiverPayload = await receiverChatPromise;
    assert.ok(receiverPayload?.envelope, "receiver should get relay envelope");
    assert.equal(receiverPayload.envelope.messageId, messageId);
    assert.ok(Array.isArray(receiverPayload.attachmentPayloads));
    assert.equal(receiverPayload.attachmentPayloads.length, 1);

    const receivedAttachmentPayload = receiverPayload.attachmentPayloads[0];
    assert.equal(receivedAttachmentPayload.attachmentId, attachmentId);
    assert.equal(receivedAttachmentPayload.messageId, messageId);
    assert.equal(
      String(receivedAttachmentPayload.ciphertext || "").length,
      largeCiphertext.length,
      "relay attachment ciphertext should not be truncated by server sanitize layer"
    );

    assert.equal(
      senderChatErrors.length,
      0,
      `sender should not receive chat-error, got: ${senderChatErrors.join(", ")}`
    );

    console.log("PASS: relay large attachment payload is not truncated");
  } finally {
    for (const socket of sockets) {
      try {
        socket.close();
      } catch {
        // no-op
      }
    }

    if (serverStarted) {
      await stopServer().catch(() => {
        // no-op
      });
    }

    if (previousNetworkMode === undefined) {
      delete process.env.NETWORK_MODE;
    } else {
      process.env.NETWORK_MODE = previousNetworkMode;
    }
  }
}

main().catch((error) => {
  console.error("FAIL: relay large attachment payload is not truncated");
  console.error(error);
  process.exit(1);
});

