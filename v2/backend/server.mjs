import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import websocketPlugin from "@fastify/websocket";
import staticPlugin from "@fastify/static";

import {
  estimateMessageBytes,
  makeAck,
  makeEnvelope,
  normalizeRoomId,
  normalizeString,
  parseIncomingEnvelope,
  sanitizeRelayEnvelope,
} from "./protocol/runtime.mjs";
import { RoomService } from "./services/room-service.mjs";
import { PresenceService } from "./services/presence-service.mjs";
import { SignalService } from "./services/signal-service.mjs";
import { RelayService } from "./services/relay-service.mjs";
import { AttachmentService } from "./services/attachment-service.mjs";
import { PostgresStore } from "./storage/postgres-store.mjs";
import { RedisPresenceBus } from "./storage/redis-presence-bus.mjs";
import { P2PAdapter } from "./adapters/p2p-adapter.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC_ROOT = path.join(PROJECT_ROOT, "public");

const DEFAULT_PORT = Number(process.env.PORT || 3000);
const DEFAULT_HOST = String(process.env.HOST || "0.0.0.0");
const MAX_WS_QUEUE_MESSAGES = 512;
const MAX_WS_QUEUE_BYTES = 16 * 1024 * 1024;
const RELAY_HISTORY_LIMIT = 500;
const NETWORK_MODE_SERVER = "server";
const NETWORK_MODE_P2P = "p2p";
const NETWORK_MODE_RELAY = "relay";
const RAW_NETWORK_MODE = String(process.env.NETWORK_MODE || NETWORK_MODE_SERVER).trim().toLowerCase();
const NETWORK_MODE = [NETWORK_MODE_SERVER, NETWORK_MODE_P2P, NETWORK_MODE_RELAY].includes(
  RAW_NETWORK_MODE
)
  ? RAW_NETWORK_MODE
  : NETWORK_MODE_SERVER;

const DEFAULT_STUN_URLS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun2.l.google.com:19302",
  "stun:stun3.l.google.com:19302",
  "stun:stun4.l.google.com:19302",
  "stun:stun.nextcloud.com:443",
  "stun:stun.ekiga.net:3478",
  "stun:stun.voip.blackberry.com:3478",
  "stun:stun.linphone.org:3478",
];

const DEFAULT_TURN_URLS = [
  "turn:213.108.170.61:3478?transport=udp",
  "turn:213.108.170.61:3478?transport=tcp",
  "turns:213.108.170.61:5349?transport=tcp",
];

let app = null;
let serverStartPromise = null;
let runtime = null;

function resolveMaybeRelative(filePath) {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(PROJECT_ROOT, filePath);
}

function loadHttpsOptionsFromEnv() {
  const sslKeyPath = process.env.SSL_KEY_PATH;
  const sslCertPath = process.env.SSL_CERT_PATH;
  const sslCaPath = process.env.SSL_CA_PATH;

  if (!sslKeyPath || !sslCertPath) {
    return null;
  }

  const options = {
    key: fs.readFileSync(resolveMaybeRelative(sslKeyPath)),
    cert: fs.readFileSync(resolveMaybeRelative(sslCertPath)),
  };

  if (sslCaPath) {
    options.ca = fs.readFileSync(resolveMaybeRelative(sslCaPath));
  }

  return options;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeIceUrl(value, defaultScheme) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (text.startsWith("stun:") || text.startsWith("turn:") || text.startsWith("turns:")) {
    return text;
  }

  return `${defaultScheme}:${text}`;
}

function buildIceConfig() {
  const envStunUrls = parseCsv(process.env.STUN_URLS)
    .map((item) => normalizeIceUrl(item, "stun"))
    .filter(Boolean);
  const envTurnUrls = parseCsv(process.env.TURN_URLS)
    .map((item) => normalizeIceUrl(item, "turn"))
    .filter(Boolean);

  const stunUrls = envStunUrls.length > 0 ? envStunUrls : DEFAULT_STUN_URLS;
  const turnUrls = envTurnUrls.length > 0 ? envTurnUrls : DEFAULT_TURN_URLS;
  const turnUsername = process.env.TURN_USERNAME || "lan";
  const turnCredential = process.env.TURN_PASSWORD || process.env.TURN_CREDENTIAL || "258741963";

  const iceServers = [];
  if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls });
  }
  if (turnUrls.length > 0 && turnUsername && turnCredential) {
    iceServers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return {
    iceServers,
    iceTransportPolicy: process.env.ICE_TRANSPORT_POLICY === "relay" ? "relay" : "all",
  };
}

function buildRequestBaseUrl(request) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || request.protocol || "http";
  const forwardedHost = String(request.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || String(request.headers.host || "").trim() || "127.0.0.1";
  return `${protocol}://${host}`;
}

function createConnectionState(socket) {
  return {
    id: crypto.randomUUID(),
    socket,
    queue: [],
    queueBytes: 0,
    flushing: false,
    closed: false,
    roomId: "",
    userName: "Guest",
    authorId: "",
    watchedRoomIds: new Set(),
  };
}

function enqueueConnectionMessage(connection, payload) {
  if (!connection || connection.closed) {
    return;
  }

  const serialized = JSON.stringify(payload || {});
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes <= 0) {
    return;
  }

  connection.queue.push(serialized);
  connection.queueBytes += bytes;

  if (
    connection.queue.length > MAX_WS_QUEUE_MESSAGES
    || connection.queueBytes > MAX_WS_QUEUE_BYTES
  ) {
    connection.closed = true;
    try {
      connection.socket.close(1009, "backpressure_limit_exceeded");
    } catch {
      // no-op
    }
    return;
  }

  if (!connection.flushing) {
    connection.flushing = true;
    setImmediate(() => {
      flushConnectionQueue(connection);
    });
  }
}

function flushConnectionQueue(connection) {
  if (!connection || connection.closed) {
    return;
  }

  const next = connection.queue.shift();
  if (!next) {
    connection.flushing = false;
    connection.queueBytes = 0;
    return;
  }

  connection.queueBytes = Math.max(0, connection.queueBytes - Buffer.byteLength(next, "utf8"));
  connection.socket.send(next, (error) => {
    if (error) {
      connection.closed = true;
      try {
        connection.socket.close(1011, "send_failed");
      } catch {
        // no-op
      }
      return;
    }

    setImmediate(() => {
      flushConnectionQueue(connection);
    });
  });
}

function findConnection(runtimeState, connectionId) {
  return runtimeState.connections.get(normalizeString(connectionId, 96)) || null;
}

function pushEvent(connection, type, payload = {}, requestId = "") {
  enqueueConnectionMessage(connection, makeEnvelope(type, requestId || crypto.randomUUID(), payload));
}

function pushAck(connection, requestId, payload = {}) {
  enqueueConnectionMessage(connection, makeAck(requestId, payload));
}

function broadcastRoomState(runtimeState, roomId) {
  const members = runtimeState.roomService.getRoomMembers(roomId);
  for (const memberId of members) {
    const connection = runtimeState.connections.get(memberId);
    if (!connection || connection.closed) {
      continue;
    }

    const roomState = runtimeState.roomService.serializeRoomForMember(roomId, memberId);
    if (!roomState) {
      continue;
    }

    pushEvent(connection, "room.state", {
      room: roomState,
      roomId,
      source: "server",
    });
  }
}

function emitSavedRoomEnvelope(runtimeState, roomId, sourceId, envelope) {
  const cleanRoomId = normalizeRoomId(roomId);
  const cleanSourceId = normalizeString(sourceId, 96);
  const sanitizedEnvelope = sanitizeRelayEnvelope(envelope);
  if (!cleanRoomId || !sanitizedEnvelope) {
    return;
  }

  for (const entry of runtimeState.presenceService.listConnections()) {
    if (entry.roomId === cleanRoomId) {
      continue;
    }
    if (!(entry.watchedRoomIds instanceof Set) || !entry.watchedRoomIds.has(cleanRoomId)) {
      continue;
    }

    const connection = runtimeState.connections.get(entry.id);
    if (!connection || connection.closed) {
      continue;
    }

    pushEvent(connection, "saved-room-relay-envelope", {
      roomId: cleanRoomId,
      sourceId: cleanSourceId,
      envelope: sanitizedEnvelope,
    });
  }
}

async function persistEnvelope(runtimeState, roomId, envelope) {
  try {
    await runtimeState.postgresStore.saveRoomMessage(
      roomId,
      envelope.messageId,
      envelope.senderId,
      envelope.createdAt,
      envelope
    );
  } catch (error) {
    runtimeState.fastify.log.warn({ error }, "Failed to persist envelope to Postgres");
  }
}

async function deletePersistedEnvelope(runtimeState, roomId, messageId) {
  try {
    await runtimeState.postgresStore.deleteRoomMessage(roomId, messageId);
  } catch (error) {
    runtimeState.fastify.log.warn({ error }, "Failed to delete envelope in Postgres");
  }
}

function setupRoutes(runtimeState) {
  const { fastify, attachmentService } = runtimeState;
  const iceConfig = buildIceConfig();

  fastify.get("/api/ice-config", async () => iceConfig);
  fastify.get("/api/v2/ice-config", async () => iceConfig);
  fastify.get("/api/v2/health", async () => ({ ok: true, runtimeVersion: "v2" }));
  fastify.get("/api/v2/network-mode", async () => ({
    runtimeVersion: "v2",
    mode: NETWORK_MODE,
    relayUploads: {
      provider: attachmentService.provider,
      limits: attachmentService.limits,
    },
  }));
  fastify.get("/api/v2/runtime-info", async () => ({
    runtimeVersion: "v2",
    networkMode: NETWORK_MODE,
  }));

  fastify.get("/v2", async (_request, reply) => {
    return reply.sendFile("v2/index.html");
  });

  fastify.get("/", async (_request, reply) => {
    reply.redirect("/v2", 302);
  });

  fastify.post("/api/v2/relay/uploads/init", async (request, reply) => {
    const roomId = normalizeRoomId(request.body?.roomId);
    const authorId = normalizeString(request.body?.authorId, 96);
    const capability = attachmentService.assertCapability(request, roomId, authorId);
    if (!capability) {
      reply.code(403);
      return { ok: false, errorCode: "invalid_capability" };
    }

    const response = await attachmentService.initUpload({
      ...request.body,
      roomId,
      authorId: capability.authorId,
    });
    return response;
  });

  fastify.post("/api/v2/relay/uploads/part-url", async (request, reply) => {
    const roomId = normalizeRoomId(request.body?.roomId);
    const capability = attachmentService.assertCapability(request, roomId);
    if (!capability) {
      reply.code(403);
      return { ok: false, errorCode: "invalid_capability" };
    }

    return attachmentService.getPartUrl(request.body, buildRequestBaseUrl(request));
  });

  fastify.get("/api/v2/relay/uploads/status", async (request, reply) => {
    const roomId = normalizeRoomId(request.query?.roomId);
    const capability = attachmentService.assertCapability(request, roomId);
    if (!capability) {
      reply.code(403);
      return { ok: false, errorCode: "invalid_capability" };
    }

    return attachmentService.getUploadStatus(request.query);
  });

  fastify.post("/api/v2/relay/uploads/complete", async (request, reply) => {
    const roomId = normalizeRoomId(request.body?.roomId);
    const capability = attachmentService.assertCapability(request, roomId);
    if (!capability) {
      reply.code(403);
      return { ok: false, errorCode: "invalid_capability" };
    }

    return attachmentService.completeUpload(request.body);
  });

  fastify.post("/api/v2/relay/uploads/abort", async (request, reply) => {
    const roomId = normalizeRoomId(request.body?.roomId);
    const capability = attachmentService.assertCapability(request, roomId);
    if (!capability) {
      reply.code(403);
      return { ok: false, errorCode: "invalid_capability" };
    }

    return attachmentService.abortUpload(request.body);
  });

  fastify.post("/api/v2/relay/attachments/download-url", async (request, reply) => {
    const roomId = normalizeRoomId(request.body?.roomId);
    const capability = attachmentService.assertCapability(request, roomId);
    if (!capability) {
      reply.code(403);
      return { ok: false, errorCode: "invalid_capability" };
    }

    return attachmentService.getDownloadUrl(request.body, buildRequestBaseUrl(request));
  });

  fastify.get("/api/v2/relay/attachments/object/:objectKey", async (request, reply) => {
    const result = await attachmentService.getDownloadObjectByToken(
      request.params.objectKey,
      request.query?.token
    );
    if (!result?.ok) {
      reply.code(result?.errorCode === "invalid_download_token" ? 401 : 404);
      return {
        ok: false,
        errorCode: String(result?.errorCode || "object_not_found"),
      };
    }

    if (result.mimeType) {
      reply.header("Content-Type", String(result.mimeType));
    }
    if (Number(result.size) > 0) {
      reply.header("Content-Length", String(Math.round(Number(result.size))));
    }
    reply.header("Cache-Control", "private, no-store");

    const body = result.body;
    if (Buffer.isBuffer(body) || typeof body?.pipe === "function") {
      return reply.send(body);
    }
    if (typeof body?.transformToByteArray === "function") {
      const bytes = await body.transformToByteArray();
      return reply.send(Buffer.from(bytes));
    }
    if (typeof body?.arrayBuffer === "function") {
      const bytes = await body.arrayBuffer();
      return reply.send(Buffer.from(bytes));
    }

    reply.code(500);
    return {
      ok: false,
      errorCode: "download_body_unsupported",
    };
  });

  fastify.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  fastify.put("/api/v2/relay/uploads/memory/:sessionId/:partNumber", async (request, reply) => {
    const sessionId = request.params.sessionId;
    const partNumber = request.params.partNumber;

    const result = await attachmentService.storeMemoryPart(sessionId, partNumber, request.body);
    if (!result.ok) {
      reply.code(400);
    }
    return result;
  });

  fastify.get("/api/v2/relay/uploads/memory/object/:objectKey", async (request, reply) => {
    const objectKey = decodeURIComponent(String(request.params.objectKey || ""));
    const objectEntry = attachmentService.getMemoryObject(objectKey);
    if (!objectEntry) {
      reply.code(404);
      return { ok: false, errorCode: "object_not_found" };
    }

    reply.header("Content-Type", objectEntry.mimeType || "application/octet-stream");
    reply.header("Content-Length", String(objectEntry.size || objectEntry.payload.byteLength));
    return reply.send(objectEntry.payload);
  });
}

function setupWs(runtimeState) {
  const { fastify } = runtimeState;

  fastify.get("/v2/ws", { websocket: true }, (socket) => {
    const connection = createConnectionState(socket);
    runtimeState.connections.set(connection.id, connection);
    runtimeState.presenceService.registerConnection(connection.id);

    pushEvent(connection, "connection.ready", {
      connectionId: connection.id,
      runtimeVersion: "v2",
      mode: NETWORK_MODE,
    });

    socket.on("message", async (raw) => {
      const envelope = parseIncomingEnvelope(raw);
      if (!envelope) {
        pushAck(connection, crypto.randomUUID(), {
          ok: false,
          errorCode: "invalid_envelope",
          message: "Malformed protocol envelope.",
        });
        return;
      }

      const { type, requestId, payload } = envelope;

      if (type === "room.join") {
        const roomId = normalizeRoomId(payload.roomId);
        const joinResult = runtimeState.roomService.joinRoom({
          roomId,
          connectionId: connection.id,
          userName: payload.name,
          authorId: payload.authorId,
        });
        if (!joinResult.ok) {
          pushAck(connection, requestId, {
            ok: false,
            errorCode: joinResult.errorCode || "join_failed",
          });
          return;
        }

        runtimeState.presenceService.setRoomConnection(
          connection.id,
          joinResult.roomId,
          payload.name,
          joinResult.authorId
        );
        connection.roomId = joinResult.roomId;
        connection.userName = normalizeString(payload.name, 32) || "Guest";
        connection.authorId = joinResult.authorId;

        if (runtimeState.postgresStore.enabled) {
          const persisted = await runtimeState.postgresStore.loadRecentMessages(
            joinResult.roomId,
            RELAY_HISTORY_LIMIT
          );
          if (persisted.length > 0) {
            for (const item of persisted) {
              runtimeState.roomService.appendRelayEnvelope(joinResult.roomId, item);
            }
          }
        }

        pushAck(connection, requestId, {
          ok: true,
          data: {
            selfId: connection.id,
            room: runtimeState.roomService.serializeRoomForMember(joinResult.roomId, connection.id),
          },
        });
        broadcastRoomState(runtimeState, joinResult.roomId);
        return;
      }

      if (type === "room.leave") {
        if (!connection.roomId) {
          pushAck(connection, requestId, {
            ok: false,
            errorCode: "not_joined",
          });
          return;
        }

        const leaveResult = runtimeState.roomService.leaveRoom(connection.roomId, connection.id);
        runtimeState.presenceService.clearRoomConnection(connection.id);
        connection.roomId = "";
        pushAck(connection, requestId, {
          ok: Boolean(leaveResult.ok),
          errorCode: leaveResult.ok ? "" : leaveResult.errorCode,
        });
        if (leaveResult.ok) {
          broadcastRoomState(runtimeState, leaveResult.roomId);
        }
        return;
      }

      if (type === "watch.savedRooms") {
        const watchedRooms = runtimeState.presenceService.setWatchedRooms(connection.id, payload.roomIds);
        connection.watchedRoomIds = new Set(watchedRooms);
        pushAck(connection, requestId, {
          ok: true,
          data: { watchedRooms },
        });
        return;
      }

      if (type === "voice.joinChannel") {
        const roomId = connection.roomId;
        const result = runtimeState.roomService.moveMemberToVoiceChannel(
          roomId,
          connection.id,
          payload.channelId
        );
        pushAck(connection, requestId, {
          ok: Boolean(result.ok),
          errorCode: result.ok ? "" : result.errorCode,
          data: result.ok ? { roomId: result.roomId, channelId: result.channelId } : undefined,
        });
        if (result.ok) {
          broadcastRoomState(runtimeState, roomId);
        }
        return;
      }

      if (type === "voice.leaveChannel") {
        const roomId = connection.roomId;
        const result = runtimeState.roomService.leaveVoiceChannel(roomId, connection.id);
        pushAck(connection, requestId, {
          ok: Boolean(result.ok),
          errorCode: result.ok ? "" : result.errorCode,
        });
        if (result.ok) {
          broadcastRoomState(runtimeState, roomId);
        }
        return;
      }

      if (type === "voice.createChannel") {
        const result = runtimeState.roomService.createVoiceChannel(connection.roomId, payload.name);
        pushAck(connection, requestId, {
          ok: Boolean(result.ok),
          errorCode: result.ok ? "" : result.errorCode,
          data: result.ok ? { channelId: result.channelId } : undefined,
        });
        if (result.ok) {
          broadcastRoomState(runtimeState, connection.roomId);
        }
        return;
      }

      if (type === "voice.renameChannel") {
        const result = runtimeState.roomService.renameVoiceChannel(
          connection.roomId,
          payload.channelId,
          payload.name
        );
        pushAck(connection, requestId, {
          ok: Boolean(result.ok),
          errorCode: result.ok ? "" : result.errorCode,
        });
        if (result.ok) {
          broadcastRoomState(runtimeState, connection.roomId);
        }
        return;
      }

      if (type === "voice.deleteChannel") {
        const result = runtimeState.roomService.deleteVoiceChannel(connection.roomId, payload.channelId);
        pushAck(connection, requestId, {
          ok: Boolean(result.ok),
          errorCode: result.ok ? "" : result.errorCode,
        });
        if (result.ok) {
          broadcastRoomState(runtimeState, connection.roomId);
        }
        return;
      }

      if (type === "signal.forward") {
        const signalState = runtimeState.signalService.validateSignal({
          fromId: connection.id,
          toId: payload.to,
          roomId: connection.roomId,
        });

        if (!signalState.ok) {
          pushAck(connection, requestId, {
            ok: false,
            errorCode: signalState.errorCode,
          });
          return;
        }

        const targetConnection = findConnection(runtimeState, signalState.toId);
        if (!targetConnection) {
          pushAck(connection, requestId, {
            ok: false,
            errorCode: "peer_not_connected",
          });
          return;
        }

        pushEvent(targetConnection, "signal.forward", {
          roomId: signalState.roomId,
          from: signalState.fromId,
          payload: payload.payload && typeof payload.payload === "object" ? payload.payload : {},
        });
        pushAck(connection, requestId, { ok: true });
        return;
      }

      if (type === "relay.capability.request") {
        const roomId = normalizeRoomId(payload.roomId || connection.roomId);
        if (!roomId || roomId !== connection.roomId) {
          pushAck(connection, requestId, {
            ok: false,
            errorCode: "join_room_first",
          });
          return;
        }

        const issued = runtimeState.relayService.issueCapabilityToken({
          roomId,
          connectionId: connection.id,
          authorId: connection.authorId || connection.id,
        });
        if (!issued) {
          pushAck(connection, requestId, {
            ok: false,
            errorCode: "capability_issue_failed",
          });
          return;
        }

        pushAck(connection, requestId, {
          ok: true,
          data: issued,
        });
        pushEvent(connection, "relay.capability.response", issued);
        return;
      }

      if (type === "chat.send") {
        const sanitizedEnvelope = runtimeState.relayService.sanitizeChatEnvelope(payload.envelope);
        if (!sanitizedEnvelope || sanitizedEnvelope.roomId !== connection.roomId) {
          pushAck(connection, requestId, {
            ok: false,
            errorCode: "invalid_encrypted_payload",
          });
          return;
        }

        const appendResult = runtimeState.roomService.appendRelayEnvelope(connection.roomId, sanitizedEnvelope);
        if (!appendResult.ok) {
          pushAck(connection, requestId, {
            ok: false,
            errorCode: appendResult.errorCode,
          });
          return;
        }

        await persistEnvelope(runtimeState, connection.roomId, sanitizedEnvelope);

        const roomMembers = runtimeState.roomService.getRoomMembers(connection.roomId);
        for (const memberId of roomMembers) {
          const targetConnection = runtimeState.connections.get(memberId);
          if (!targetConnection) {
            continue;
          }
          pushEvent(targetConnection, "chat.message", {
            roomId: connection.roomId,
            sourceId: connection.id,
            envelope: sanitizedEnvelope,
          });
        }

        emitSavedRoomEnvelope(runtimeState, connection.roomId, connection.id, sanitizedEnvelope);

        pushAck(connection, requestId, {
          ok: true,
          data: {
            roomId: connection.roomId,
            messageId: sanitizedEnvelope.messageId,
          },
        });
        return;
      }

      if (type === "chat.edit") {
        const cleanMessageId = normalizeString(payload.messageId, 96);
        const sanitizedEnvelope = runtimeState.relayService.sanitizeChatEnvelope(payload.envelope);
        const updateResult = runtimeState.roomService.updateRelayEnvelope(
          connection.roomId,
          cleanMessageId,
          sanitizedEnvelope
        );

        if (!updateResult.ok) {
          pushAck(connection, requestId, {
            ok: false,
            errorCode: updateResult.errorCode,
          });
          return;
        }

        await persistEnvelope(runtimeState, connection.roomId, sanitizedEnvelope);

        for (const memberId of runtimeState.roomService.getRoomMembers(connection.roomId)) {
          const targetConnection = runtimeState.connections.get(memberId);
          if (!targetConnection) {
            continue;
          }
          pushEvent(targetConnection, "chat.updated", {
            roomId: connection.roomId,
            sourceId: connection.id,
            messageId: cleanMessageId,
            envelope: sanitizedEnvelope,
          });
        }

        pushAck(connection, requestId, {
          ok: true,
          data: {
            messageId: cleanMessageId,
          },
        });
        return;
      }

      if (type === "chat.delete") {
        const cleanMessageId = normalizeString(payload.messageId, 96);
        const deleteResult = runtimeState.roomService.deleteRelayEnvelope(connection.roomId, cleanMessageId);
        if (!deleteResult.ok) {
          pushAck(connection, requestId, {
            ok: false,
            errorCode: deleteResult.errorCode,
          });
          return;
        }

        await deletePersistedEnvelope(runtimeState, connection.roomId, cleanMessageId);

        for (const memberId of runtimeState.roomService.getRoomMembers(connection.roomId)) {
          const targetConnection = runtimeState.connections.get(memberId);
          if (!targetConnection) {
            continue;
          }
          pushEvent(targetConnection, "chat.deleted", {
            roomId: connection.roomId,
            sourceId: connection.id,
            messageId: cleanMessageId,
          });
        }

        pushAck(connection, requestId, {
          ok: true,
          data: {
            messageId: cleanMessageId,
          },
        });
        return;
      }

      if (type === "chat.history.request") {
        const limit = Math.max(1, Math.min(RELAY_HISTORY_LIMIT, Math.round(Number(payload.limit) || RELAY_HISTORY_LIMIT)));
        const envelopes = runtimeState.roomService.listRecentRelayEnvelopes(connection.roomId, limit);
        const bytes = estimateMessageBytes(envelopes);
        if (bytes > 64 * 1024 * 1024) {
          pushAck(connection, requestId, {
            ok: false,
            errorCode: "history_payload_too_large",
          });
          return;
        }

        pushAck(connection, requestId, {
          ok: true,
          data: {
            roomId: connection.roomId,
            count: envelopes.length,
          },
        });
        pushEvent(connection, "chat.history.chunk", {
          roomId: connection.roomId,
          sourceId: "server",
          envelopes,
        });
        return;
      }

      pushAck(connection, requestId, {
        ok: false,
        errorCode: "unknown_event_type",
        message: `Unknown event: ${type}`,
      });
    });

    socket.on("close", () => {
      connection.closed = true;
      runtimeState.connections.delete(connection.id);
      runtimeState.presenceService.removeConnection(connection.id);
      const roomUpdates = runtimeState.roomService.removeConnection(connection.id);
      for (const update of roomUpdates) {
        broadcastRoomState(runtimeState, update.roomId);
        for (const memberId of runtimeState.roomService.getRoomMembers(update.roomId)) {
          const targetConnection = runtimeState.connections.get(memberId);
          if (!targetConnection) {
            continue;
          }
          pushEvent(targetConnection, "peer.left", {
            roomId: update.roomId,
            peerId: connection.id,
          });
        }
      }
    });
  });
}

async function createRuntime(fastify) {
  const postgresStore = new PostgresStore(process.env.V2_POSTGRES_URL || process.env.POSTGRES_URL || "");
  const redisBus = new RedisPresenceBus(process.env.V2_REDIS_URL || process.env.REDIS_URL || "");
  const p2pAdapter = new P2PAdapter({ enabled: NETWORK_MODE === NETWORK_MODE_P2P });
  const roomService = new RoomService({
    maxChatMessages: Number(process.env.V2_MAX_CHAT_MESSAGES || 500),
  });
  const presenceService = new PresenceService();
  const signalService = new SignalService({ roomService, presenceService });
  const relayService = new RelayService();
  const attachmentService = new AttachmentService({ relayService });

  await postgresStore.init();
  await redisBus.init();
  await p2pAdapter.init();
  await attachmentService.init();

  return {
    fastify,
    connections: new Map(),
    postgresStore,
    redisBus,
    p2pAdapter,
    roomService,
    presenceService,
    signalService,
    relayService,
    attachmentService,
  };
}

async function disposeRuntime(runtimeState) {
  if (!runtimeState) {
    return;
  }

  await Promise.all([
    runtimeState.postgresStore.close().catch(() => {}),
    runtimeState.redisBus.close().catch(() => {}),
    runtimeState.p2pAdapter.close().catch(() => {}),
  ]);

  runtimeState.attachmentService.close();
  runtimeState.connections.clear();
}

export async function startServer(options = {}) {
  if (serverStartPromise) {
    return serverStartPromise;
  }

  const httpsOptions = loadHttpsOptionsFromEnv();
  const useTls = Boolean(httpsOptions);

  app = Fastify({
    logger: false,
    bodyLimit: 64 * 1024 * 1024,
    ...(httpsOptions ? { https: httpsOptions } : {}),
  });

  await app.register(websocketPlugin);
  await app.register(staticPlugin, {
    root: PUBLIC_ROOT,
    prefix: "/",
  });

  runtime = await createRuntime(app);
  setupRoutes(runtime);
  setupWs(runtime);

  const host = normalizeString(options.host || process.env.HOST || DEFAULT_HOST, 64) || DEFAULT_HOST;
  const port = Number(options.port || process.env.PORT || DEFAULT_PORT) || DEFAULT_PORT;

  serverStartPromise = app
    .listen({ host, port })
    .then((address) => {
      const url = new URL(address);
      return {
        protocol: useTls ? "https" : url.protocol.replace(/:$/, ""),
        host: url.hostname,
        port: Number(url.port),
        runtimeVersion: "v2",
      };
    })
    .catch(async (error) => {
      serverStartPromise = null;
      await disposeRuntime(runtime);
      runtime = null;
      throw error;
    });

  return serverStartPromise;
}

export async function stopServer() {
  if (!app) {
    serverStartPromise = null;
    return;
  }

  try {
    await app.close();
  } catch {
    // no-op
  }

  await disposeRuntime(runtime);
  runtime = null;
  app = null;
  serverStartPromise = null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    console.error("Failed to start V2 server:", error);
    process.exitCode = 1;
  });
}
