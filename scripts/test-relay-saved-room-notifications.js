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
    const roomId = `relay-watch-${Date.now().toString(36)}`;
    const messageId = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const senderAuthorId = `sender-${Math.random().toString(36).slice(2, 10)}`;

    const sender = io(baseUrl, { transports: ["websocket"] });
    const receiver = io(baseUrl, { transports: ["websocket"] });
    const watcher = io(baseUrl, { transports: ["websocket"] });
    sockets.push(sender, receiver, watcher);

    let receiverUnexpectedWatchRelayEvents = 0;
    receiver.on("saved-room-relay-envelope", () => {
      receiverUnexpectedWatchRelayEvents += 1;
    });

    let watcherUnexpectedPlaintextEvents = 0;
    watcher.on("saved-room-chat-message", () => {
      watcherUnexpectedPlaintextEvents += 1;
    });

    await Promise.all([
      waitForConnect(sender, "sender"),
      waitForConnect(receiver, "receiver"),
      waitForConnect(watcher, "watcher"),
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

    watcher.emit("watch-saved-rooms", { roomIds: [roomId] });
    await new Promise((resolve) => setTimeout(resolve, 80));

    const watcherRelayPromise = waitForEvent(watcher, "saved-room-relay-envelope", {
      timeoutMs: 5000,
      predicate: (payload) => payload?.envelope?.messageId === messageId,
    });
    const receiverChatPromise = waitForEvent(receiver, "chat-message", {
      timeoutMs: 5000,
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
        iv: "iv-relay-test",
        ciphertext: "ciphertext-relay-test",
        attachmentRefs: [],
      },
      attachmentPayloads: [],
    });

    const [watcherRelayPayload, receiverChatPayload] = await Promise.all([
      watcherRelayPromise,
      receiverChatPromise,
    ]);

    assert.ok(receiverChatPayload?.envelope, "receiver should receive relay chat envelope");
    assert.equal(receiverChatPayload.envelope.messageId, messageId);

    assert.ok(watcherRelayPayload, "watcher should receive saved-room relay event");
    assert.equal(watcherRelayPayload.roomId, roomId);
    assert.equal(watcherRelayPayload.envelope?.messageId, messageId);
    assert.equal(watcherRelayPayload.envelope?.senderId, senderAuthorId);
    assert.equal(watcherRelayPayload.envelope?.alg, "AES-GCM-256");
    assert.equal(watcherRelayPayload.envelope?.v, 1);

    const envelopeKeys = Object.keys(watcherRelayPayload.envelope || {}).sort();
    assert.deepEqual(envelopeKeys, [
      "alg",
      "ciphertext",
      "createdAt",
      "iv",
      "messageId",
      "roomId",
      "senderId",
      "v",
    ]);

    assert.equal("message" in watcherRelayPayload, false);
    assert.equal("text" in watcherRelayPayload, false);
    assert.equal("attachmentRefs" in watcherRelayPayload.envelope, false);

    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(
      receiverUnexpectedWatchRelayEvents,
      0,
      "room participant should not receive watched relay event"
    );
    assert.equal(
      watcherUnexpectedPlaintextEvents,
      0,
      "watcher should not receive plaintext saved-room event in relay mode"
    );

    const checkResponse = await fetch(`${baseUrl}/api/notifications/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rooms: [
          {
            roomId,
            lastSeenMessageId: "",
            lastSeenCreatedAt: 0,
          },
        ],
      }),
    });
    assert.equal(checkResponse.ok, true);
    const checkPayload = await checkResponse.json();
    assert.equal(checkPayload?.mode, "relay");
    assert.ok(Array.isArray(checkPayload?.rooms));
    assert.equal(checkPayload.rooms.length, 0);

    console.log("PASS: relay saved-room encrypted notifications");
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
  console.error("FAIL: relay saved-room encrypted notifications");
  console.error(error);
  process.exit(1);
});
