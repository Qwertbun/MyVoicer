"use strict";

const assert = require("node:assert/strict");
const { io } = require("socket.io-client");

function waitForEvent(socket, eventName, { timeoutMs = 7000, predicate = null } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for "${eventName}"`));
    }, timeoutMs);

    const onEvent = (payload) => {
      if (typeof predicate === "function" && !predicate(payload)) {
        return;
      }
      cleanup();
      resolve(payload);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
    };

    socket.on(eventName, onEvent);
  });
}

function waitForConnect(socket, label, timeoutMs = 7000) {
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
    const onError = (error) => {
      cleanup();
      reject(new Error(`${label} connect failed: ${error?.message || "unknown"}`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("connect_error", onError);
    };

    socket.on("connect", onConnect);
    socket.on("connect_error", onError);
  });
}

function joinRoom(socket, { roomId, name, authorId }, label, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${label} join timeout`));
    }, timeoutMs);

    const onJoined = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("joined-room", onJoined);
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
  let started = null;

  try {
    started = await startServer({ host: "127.0.0.1", port: 0 });
    const baseUrl = `${started.protocol}://127.0.0.1:${started.port}`;
    const roomId = `relay-v2-chat-${Date.now().toString(36)}`;
    const messageId = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const attachmentId = `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const senderAuthorId = `sender-${Math.random().toString(36).slice(2, 8)}`;
    const objectKey = `relay-v2/${roomId.toLowerCase()}/${messageId}/${attachmentId}.bin`;

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
          authorId: `receiver-${Math.random().toString(36).slice(2, 8)}`,
        },
        "receiver"
      ),
    ]);

    const receiverPacketPromise = waitForEvent(receiver, "chat-message", {
      timeoutMs: 15000,
      predicate: (payload) => payload?.envelope?.messageId === messageId,
    });

    sender.emit("chat-message", {
      envelope: {
        v: 1,
        alg: "AES-GCM-256",
        transportVersion: 2,
        roomId,
        messageId,
        senderId: senderAuthorId,
        createdAt: Date.now(),
        iv: "iv-test-relay-v2-chat-refs",
        ciphertext: "ciphertext-test-relay-v2-chat-refs",
        attachmentRefs: [
          {
            messageId,
            attachmentId,
            transport: "s3-v2",
            objectKey,
            name: "file.bin",
            mimeType: "application/octet-stream",
            size: 42,
          },
        ],
      },
      attachmentPayloads: [],
    });

    const receiverPacket = await receiverPacketPromise;
    const refs = Array.isArray(receiverPacket?.envelope?.attachmentRefs)
      ? receiverPacket.envelope.attachmentRefs
      : [];
    assert.equal(refs.length, 1, "receiver should get one attachment ref");
    assert.equal(refs[0].transport, "s3-v2", "transport should remain s3-v2");
    assert.equal(refs[0].objectKey, objectKey, "objectKey should remain intact");
    assert.equal(
      senderChatErrors.length,
      0,
      `sender should not receive chat-error, got: ${senderChatErrors.join(", ")}`
    );

    console.log("PASS: relay chat-message preserves v2 attachment refs");
  } finally {
    for (const socket of sockets) {
      try {
        socket.close();
      } catch {
        // no-op
      }
    }
    if (started) {
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
  console.error("FAIL: relay chat-message preserves v2 attachment refs");
  console.error(error);
  process.exit(1);
});

