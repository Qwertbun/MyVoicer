"use strict";

const assert = require("node:assert/strict");
const { io } = require("socket.io-client");

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

function joinRoom(socket, roomId, name, authorId, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${name} join timeout`));
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
    socket.emit("join-room", {
      roomId,
      name,
      authorId,
    });
  });
}

function requestCapabilityToken(socket, roomId, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("capability timeout"));
    }, timeoutMs);

    socket.emit("relay-capability-request", { roomId }, (response = {}) => {
      clearTimeout(timer);
      if (!response?.ok || !response?.token) {
        reject(new Error(`capability failed: ${response?.error || "unknown"}`));
        return;
      }
      resolve(response.token);
    });
  });
}

async function apiJson(baseUrl, path, { method = "GET", token = "", body = null } = {}) {
  const headers = {};
  let requestPath = path;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    requestPath = `${requestPath}${requestPath.includes("?") ? "&" : "?"}capability=${encodeURIComponent(token)}`;
  }
  let payloadBody = body;
  if (body && typeof body === "object") {
    headers["Content-Type"] = "application/json";
    if (token) {
      payloadBody = {
        ...body,
        capability: token,
      };
    }
  }

  const response = await fetch(`${baseUrl}${requestPath}`, {
    method,
    headers,
    body: payloadBody ? JSON.stringify(payloadBody) : undefined,
  });
  const payload = await response.json();
  return {
    status: response.status,
    ok: response.ok,
    payload,
  };
}

async function main() {
  const prevNetworkMode = process.env.NETWORK_MODE;
  delete process.env.RELAY_S3_BUCKET;
  delete process.env.RELAY_S3_REGION;
  process.env.NETWORK_MODE = "relay";

  const { startServer, stopServer } = require("../server");
  const sockets = [];
  let started = null;

  try {
    started = await startServer({ host: "127.0.0.1", port: 0 });
    const baseUrl = `${started.protocol}://127.0.0.1:${started.port}`;
    const roomId = `relay-v2-${Date.now().toString(36)}`;

    const sender = io(baseUrl, { transports: ["websocket"] });
    sockets.push(sender);
    await waitForConnect(sender, "sender");
    await joinRoom(sender, roomId, "sender", `sender-${Date.now().toString(36)}`);
    const senderToken = await requestCapabilityToken(sender, roomId);

    const part1 = Buffer.from("relay-v2-part-1");
    const part2 = Buffer.from("relay-v2-part-2-and-more");
    const totalSize = part1.length + part2.length;

    const initResult = await apiJson(baseUrl, "/api/relay/uploads/init", {
      method: "POST",
      token: senderToken,
      body: {
        roomId,
        messageId: `msg-${Date.now().toString(36)}`,
        attachmentId: `att-${Date.now().toString(36)}`,
        size: totalSize,
        mimeType: "application/octet-stream",
        fileFingerprint: `fp-${Date.now().toString(36)}`,
      },
    });
    assert.equal(initResult.ok, true, `init failed: ${JSON.stringify(initResult.payload)}`);
    const sessionId = initResult.payload.sessionId;

    const part1UrlResult = await apiJson(baseUrl, "/api/relay/uploads/part-url", {
      method: "POST",
      token: senderToken,
      body: {
        roomId,
        sessionId,
        partNumber: 1,
      },
    });
    assert.equal(part1UrlResult.ok, true);
    const part1UploadResponse = await fetch(
      `${baseUrl}${part1UrlResult.payload.url}${part1UrlResult.payload.url.includes("?") ? "&" : "?"}capability=${encodeURIComponent(senderToken)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${senderToken}`,
          "Content-Type": "application/octet-stream",
        },
        body: part1,
      }
    );
    assert.equal(part1UploadResponse.ok, true);

    const statusAfterPart1 = await apiJson(
      baseUrl,
      `/api/relay/uploads/status?roomId=${encodeURIComponent(roomId)}&sessionId=${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
        token: senderToken,
      }
    );
    assert.equal(statusAfterPart1.ok, true);
    assert.equal(statusAfterPart1.payload.uploadedParts.length, 1);
    assert.equal(statusAfterPart1.payload.uploadedParts[0].partNumber, 1);

    const resumed = io(baseUrl, { transports: ["websocket"] });
    sockets.push(resumed);
    await waitForConnect(resumed, "resumed");
    await joinRoom(resumed, roomId, "resumed", `resumed-${Date.now().toString(36)}`);
    const resumedToken = await requestCapabilityToken(resumed, roomId);

    const statusBeforePart2 = await apiJson(
      baseUrl,
      `/api/relay/uploads/status?roomId=${encodeURIComponent(roomId)}&sessionId=${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
        token: resumedToken,
      }
    );
    assert.equal(statusBeforePart2.ok, true);
    assert.equal(statusBeforePart2.payload.uploadedParts.length, 1, "resume should see existing part");

    const part2UrlResult = await apiJson(baseUrl, "/api/relay/uploads/part-url", {
      method: "POST",
      token: resumedToken,
      body: {
        roomId,
        sessionId,
        partNumber: 2,
      },
    });
    assert.equal(part2UrlResult.ok, true);
    const part2UploadResponse = await fetch(
      `${baseUrl}${part2UrlResult.payload.url}${part2UrlResult.payload.url.includes("?") ? "&" : "?"}capability=${encodeURIComponent(resumedToken)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${resumedToken}`,
          "Content-Type": "application/octet-stream",
        },
        body: part2,
      }
    );
    assert.equal(part2UploadResponse.ok, true);

    const statusAfterPart2 = await apiJson(
      baseUrl,
      `/api/relay/uploads/status?roomId=${encodeURIComponent(roomId)}&sessionId=${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
        token: resumedToken,
      }
    );
    assert.equal(statusAfterPart2.ok, true);
    assert.equal(statusAfterPart2.payload.uploadedParts.length, 2);

    const completeResult = await apiJson(baseUrl, "/api/relay/uploads/complete", {
      method: "POST",
      token: resumedToken,
      body: {
        roomId,
        sessionId,
        parts: statusAfterPart2.payload.uploadedParts.map((item) => ({
          partNumber: item.partNumber,
          etag: item.etag,
        })),
      },
    });
    assert.equal(completeResult.ok, true, `complete failed: ${JSON.stringify(completeResult.payload)}`);
    const objectKey = completeResult.payload.objectKey;
    assert.ok(objectKey);

    const downloadUrlResult = await apiJson(baseUrl, "/api/relay/attachments/download-url", {
      method: "POST",
      token: resumedToken,
      body: {
        roomId,
        objectKey,
      },
    });
    assert.equal(downloadUrlResult.ok, true);
    const downloadResponse = await fetch(`${baseUrl}${downloadUrlResult.payload.url}`);
    assert.equal(downloadResponse.ok, true);
    const downloaded = Buffer.from(await downloadResponse.arrayBuffer());
    assert.equal(downloaded.toString("utf8"), Buffer.concat([part1, part2]).toString("utf8"));

    const outsider = io(baseUrl, { transports: ["websocket"] });
    sockets.push(outsider);
    await waitForConnect(outsider, "outsider");
    const outsiderRoomId = `${roomId}-other`;
    await joinRoom(outsider, outsiderRoomId, "outsider", `outsider-${Date.now().toString(36)}`);
    const outsiderToken = await requestCapabilityToken(outsider, outsiderRoomId);
    const outsiderDownload = await apiJson(baseUrl, "/api/relay/attachments/download-url", {
      method: "POST",
      token: outsiderToken,
      body: {
        roomId: outsiderRoomId,
        objectKey,
      },
    });
    assert.equal(outsiderDownload.ok, false);
    assert.ok([400, 403].includes(outsiderDownload.status));

    console.log("PASS: relay v2 upload resume + download flow");
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
    if (prevNetworkMode === undefined) {
      delete process.env.NETWORK_MODE;
    } else {
      process.env.NETWORK_MODE = prevNetworkMode;
    }
  }
}

main().catch((error) => {
  console.error("FAIL: relay v2 upload resume + download flow");
  console.error(error);
  process.exit(1);
});
