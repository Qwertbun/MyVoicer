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

    let receiverSawRejectedMessage = false;
    receiver.on("chat-message", (payload) => {
      if (payload?.envelope?.messageId === messageId) {
        receiverSawRejectedMessage = true;
      }
    });
    const senderChatErrorPromise = waitForEvent(sender, "chat-error", {
      timeoutMs: 15000,
      predicate: (payload) =>
        String(payload?.message || "").includes("Legacy relay attachment payloads are no longer supported."),
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

    const senderErrorPayload = await senderChatErrorPromise;
    assert.ok(senderErrorPayload, "sender should receive chat-error for legacy payloads");
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal(
      receiverSawRejectedMessage,
      false,
      "receiver should not get relay message when legacy payload is rejected"
    );

    assert.equal(
      senderChatErrors.some((item) =>
        String(item || "").includes("Legacy relay attachment payloads are no longer supported.")
      ),
      true,
      "sender should receive explicit legacy payload rejection"
    );

    console.log("PASS: relay large legacy attachment payload is rejected");
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
  console.error("FAIL: relay large legacy attachment payload is rejected");
  console.error(error);
  process.exit(1);
});
