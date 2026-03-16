const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const https = require("https");
const { Server } = require("socket.io");

const app = express();
const rooms = new Map();
const MAX_CHAT_MESSAGES = 150;
const MAX_CHAT_MESSAGE_LENGTH = 1200;
const MAX_CHAT_ATTACHMENTS = 4;
const MAX_CHAT_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_CHAT_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const CHAT_EDIT_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
const SOCKET_MAX_HTTP_BUFFER_SIZE = 40 * 1024 * 1024;
const PUBLIC_ROOT = path.join(__dirname, "public");
const CHAT_UPLOADS_ROOT = process.env.CHAT_UPLOADS_ROOT
  ? path.resolve(String(process.env.CHAT_UPLOADS_ROOT))
  : path.join(PUBLIC_ROOT, "chat-uploads");
const CHAT_STATE_ROOT = process.env.CHAT_STATE_ROOT
  ? path.resolve(String(process.env.CHAT_STATE_ROOT))
  : path.join(__dirname, "data");
const CHAT_STATE_FILE = path.join(CHAT_STATE_ROOT, "chat-history.json");
const CHAT_STATE_VERSION = 1;
const CHAT_STATE_SAVE_DEBOUNCE_MS = 180;
const CHAT_MIME_EXTENSION_FALLBACKS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/zip": "zip",
});

let chatStateSaveTimer = null;
let chatStateSaveChain = Promise.resolve();

app.use(express.static(PUBLIC_ROOT));
app.use("/chat-uploads", express.static(CHAT_UPLOADS_ROOT));

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
  "turn:owa.mine-souls.ru:3478?transport=udp",
  "turn:owa.mine-souls.ru:3478?transport=tcp",
  "turns:owa.mine-souls.ru:5349?transport=tcp",
];
const DEFAULT_TURN_USERNAME = "lan";
const DEFAULT_TURN_CREDENTIAL = "258741963";

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeIceUrl(value, defaultScheme) {
  const text = String(value || "").trim();
  if (!text) {
    return null;
  }

  if (text.startsWith("stun:") || text.startsWith("turn:") || text.startsWith("turns:")) {
    return text;
  }

  return `${defaultScheme}:${text}`;
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

function countUrls(iceServers) {
  return iceServers.reduce((acc, server) => acc + toArray(server.urls).length, 0);
}

function hasTurnServer(iceServers) {
  return iceServers.some((server) =>
    toArray(server.urls).some((url) => String(url).startsWith("turn:") || String(url).startsWith("turns:"))
  );
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
  const turnUsername = process.env.TURN_USERNAME || DEFAULT_TURN_USERNAME;
  const turnCredential =
    process.env.TURN_PASSWORD || process.env.TURN_CREDENTIAL || DEFAULT_TURN_CREDENTIAL;

  const iceServers = [];

  if (stunUrls.length > 0) {
    iceServers.push({ urls: stunUrls });
  }

  if (turnUrls.length > 0) {
    if (!turnUsername || !turnCredential) {
      console.warn(
        "TURN_URLS are set but TURN_USERNAME / TURN_PASSWORD are missing. TURN servers were skipped."
      );
    } else {
      iceServers.push({
        urls: turnUrls,
        username: turnUsername,
        credential: turnCredential,
      });
    }
  }

  return {
    iceServers,
    iceTransportPolicy: process.env.ICE_TRANSPORT_POLICY === "relay" ? "relay" : "all",
  };
}

const iceConfig = buildIceConfig();

app.get("/api/ice-config", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(iceConfig);
});

function resolveMaybeRelative(filePath) {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(__dirname, filePath);
}

function createTransportServer() {
  const sslKeyPath = process.env.SSL_KEY_PATH;
  const sslCertPath = process.env.SSL_CERT_PATH;
  const sslCaPath = process.env.SSL_CA_PATH;

  if (!sslKeyPath || !sslCertPath) {
    return {
      server: http.createServer(app),
      protocol: "http",
      hasTls: false,
    };
  }

  const options = {
    key: fs.readFileSync(resolveMaybeRelative(sslKeyPath)),
    cert: fs.readFileSync(resolveMaybeRelative(sslCertPath)),
  };

  if (sslCaPath) {
    options.ca = fs.readFileSync(resolveMaybeRelative(sslCaPath));
  }

  return {
    server: https.createServer(options, app),
    protocol: "https",
    hasTls: true,
  };
}

const { server, protocol, hasTls } = createTransportServer();
const io = new Server(server, {
  maxHttpBufferSize: SOCKET_MAX_HTTP_BUFFER_SIZE,
});

const DEFAULT_VOICE_CHANNEL_IDS = ["1", "2", "3"];
const MAX_VOICE_CHANNELS = 25;
const MAX_VOICE_CHANNEL_NAME_LENGTH = 40;

function normalizeVoiceChannelId(value) {
  const text = String(value || "").trim().slice(0, 32);
  return text || DEFAULT_VOICE_CHANNEL_IDS[0];
}

function normalizeVoiceChannelName(value, fallbackName = DEFAULT_VOICE_CHANNEL_IDS[0]) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_VOICE_CHANNEL_NAME_LENGTH);
  return text || String(fallbackName || DEFAULT_VOICE_CHANNEL_IDS[0]);
}

function createVoiceChannel(id, name = id) {
  return {
    id,
    name: normalizeVoiceChannelName(name, id),
    members: new Set(),
    hostId: null,
  };
}

function sortVoiceChannelId(left, right) {
  const leftNum = Number(left.id);
  const rightNum = Number(right.id);

  const leftIsNumber = Number.isFinite(leftNum);
  const rightIsNumber = Number.isFinite(rightNum);

  if (leftIsNumber && rightIsNumber) {
    return leftNum - rightNum;
  }

  return String(left.id).localeCompare(String(right.id), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function ensureDefaultVoiceChannels(room) {
  if (room.voiceChannels.size === 0) {
    for (const channelId of DEFAULT_VOICE_CHANNEL_IDS) {
      room.voiceChannels.set(channelId, createVoiceChannel(channelId));
    }
    return;
  }

  for (const channel of room.voiceChannels.values()) {
    if (!channel.name) {
      channel.name = normalizeVoiceChannelName(channel.id, channel.id);
    }
  }
}

function getOrCreateVoiceChannel(room, channelId, preferredName = null) {
  const cleanChannelId = normalizeVoiceChannelId(channelId);
  if (!room.voiceChannels.has(cleanChannelId)) {
    room.voiceChannels.set(
      cleanChannelId,
      createVoiceChannel(cleanChannelId, preferredName || cleanChannelId)
    );
  } else if (!room.voiceChannels.get(cleanChannelId).name) {
    room.voiceChannels.get(cleanChannelId).name = normalizeVoiceChannelName(
      preferredName || cleanChannelId,
      cleanChannelId
    );
  }
  return room.voiceChannels.get(cleanChannelId);
}

function getPreferredVoiceChannel(room, preferredChannelId) {
  const cleanPreferredId = normalizeVoiceChannelId(preferredChannelId);
  const preferred = room.voiceChannels.get(cleanPreferredId);
  if (preferred) {
    return preferred;
  }

  const defaultChannel = room.voiceChannels.get(DEFAULT_VOICE_CHANNEL_IDS[0]);
  if (defaultChannel) {
    return defaultChannel;
  }

  const fallback = Array.from(room.voiceChannels.values()).sort(sortVoiceChannelId)[0];
  if (fallback) {
    return fallback;
  }

  return getOrCreateVoiceChannel(room, DEFAULT_VOICE_CHANNEL_IDS[0], DEFAULT_VOICE_CHANNEL_IDS[0]);
}

function getNextVoiceChannelId(room) {
  let nextId = 1;
  while (room.voiceChannels.has(String(nextId))) {
    nextId += 1;
  }
  return String(nextId);
}

function createVoiceChannelInRoom(room, preferredName) {
  ensureDefaultVoiceChannels(room);

  if (room.voiceChannels.size >= MAX_VOICE_CHANNELS) {
    return {
      ok: false,
      error: `Voice rooms limit reached (${MAX_VOICE_CHANNELS}).`,
    };
  }

  const channelId = getNextVoiceChannelId(room);
  const channelName = normalizeVoiceChannelName(preferredName, channelId);
  room.voiceChannels.set(channelId, createVoiceChannel(channelId, channelName));

  return {
    ok: true,
    channelId,
    channelName,
  };
}

function renameVoiceChannelInRoom(room, channelId, nextName) {
  const cleanChannelId = normalizeVoiceChannelId(channelId);
  const channel = room.voiceChannels.get(cleanChannelId);
  if (!channel) {
    return {
      ok: false,
      error: "Voice room not found.",
    };
  }

  channel.name = normalizeVoiceChannelName(nextName, channel.name || channel.id);
  return {
    ok: true,
    channelId: cleanChannelId,
    channelName: channel.name,
  };
}

function deleteVoiceChannelFromRoom(room, channelId) {
  ensureDefaultVoiceChannels(room);

  const cleanChannelId = normalizeVoiceChannelId(channelId);
  if (!room.voiceChannels.has(cleanChannelId)) {
    return {
      ok: false,
      error: "Voice room not found.",
    };
  }

  if (room.voiceChannels.size <= 1) {
    return {
      ok: false,
      error: "At least one voice room must remain.",
    };
  }

  const fallbackChannel = Array.from(room.voiceChannels.values())
    .sort(sortVoiceChannelId)
    .find((item) => item.id !== cleanChannelId);
  if (!fallbackChannel) {
    return {
      ok: false,
      error: "Cannot delete the last voice room.",
    };
  }

  const channelToDelete = room.voiceChannels.get(cleanChannelId);
  const membersToMove = Array.from(channelToDelete.members);

  for (const memberId of membersToMove) {
    const movedChannelId = moveMemberToVoiceChannel(room, memberId, fallbackChannel.id);
    const memberSocket = io.sockets.sockets.get(memberId);
    if (memberSocket) {
      memberSocket.data.voiceChannelId = movedChannelId;
    }
  }

  room.voiceChannels.delete(cleanChannelId);
  return {
    ok: true,
    channelId: cleanChannelId,
    fallbackChannelId: fallbackChannel.id,
    movedCount: membersToMove.length,
  };
}

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    const room = {
      id: roomId,
      members: new Set(),
      names: new Map(),
      messages: [],
      voiceChannels: new Map(),
      memberVoiceChannel: new Map(),
    };

    ensureDefaultVoiceChannels(room);
    rooms.set(roomId, room);
  }
  return rooms.get(roomId);
}

function promoteVoiceChannelHost(room, channelId) {
  const channel = room.voiceChannels.get(channelId);
  if (!channel) {
    return;
  }

  const previousHost = channel.hostId;
  const nextHost = channel.members.values().next().value || null;
  channel.hostId = nextHost;

  if (previousHost === nextHost) {
    return;
  }

  for (const memberId of channel.members) {
    io.to(memberId).emit("host-changed", {
      roomId: room.id,
      channelId,
      hostId: nextHost,
    });
  }
}

function removeMemberFromVoiceChannel(room, memberId, notifyLeavingMember) {
  const previousChannelId = room.memberVoiceChannel.get(memberId);
  if (!previousChannelId) {
    return;
  }

  const previousChannel = room.voiceChannels.get(previousChannelId);
  room.memberVoiceChannel.delete(memberId);

  if (!previousChannel || !previousChannel.members.has(memberId)) {
    return;
  }

  const previousPeers = Array.from(previousChannel.members).filter((id) => id !== memberId);
  previousChannel.members.delete(memberId);

  for (const peerId of previousPeers) {
    io.to(peerId).emit("peer-left", { peerId: memberId });
    if (notifyLeavingMember) {
      io.to(memberId).emit("peer-left", { peerId });
    }
  }

  if (!previousChannel.hostId || previousChannel.hostId === memberId) {
    promoteVoiceChannelHost(room, previousChannelId);
  } else if (!previousChannel.members.has(previousChannel.hostId)) {
    promoteVoiceChannelHost(room, previousChannelId);
  }
}

function moveMemberToVoiceChannel(room, memberId, nextChannelId) {
  const targetChannel = getPreferredVoiceChannel(room, nextChannelId);
  const targetChannelId = targetChannel.id;
  const currentChannelId = room.memberVoiceChannel.get(memberId) || null;
  const currentChannel = currentChannelId ? room.voiceChannels.get(currentChannelId) : null;

  if (currentChannelId === targetChannelId && currentChannel?.members.has(memberId)) {
    return targetChannelId;
  }

  removeMemberFromVoiceChannel(room, memberId, true);
  targetChannel.members.add(memberId);
  room.memberVoiceChannel.set(memberId, targetChannelId);

  if (!targetChannel.hostId || !targetChannel.members.has(targetChannel.hostId)) {
    promoteVoiceChannelHost(room, targetChannelId);
  }

  if (targetChannel.hostId && targetChannel.hostId !== memberId) {
    io.to(targetChannel.hostId).emit("peer-join-request", {
      peerId: memberId,
      name: room.names.get(memberId) || "Guest",
      channelId: targetChannelId,
    });
  }

  return targetChannelId;
}

function normalizeChatAttachmentMimeType(value) {
  const mimeType = String(value || "").trim().toLowerCase();
  if (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mimeType)) {
    return mimeType;
  }
  return "application/octet-stream";
}

function normalizeChatAttachmentFileName(value) {
  const base = path.basename(String(value || "file"));
  const sanitized = base
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return sanitized || "file";
}

function normalizeChatStorageRoomId(roomId) {
  const normalized = String(roomId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .slice(0, 48);
  return normalized || "room";
}

function parseChatAttachmentDataUrl(value) {
  const raw = String(value || "").trim();
  const match = /^data:([^;,]*);base64,([a-zA-Z0-9+/=\s]+)$/.exec(raw);
  if (!match) {
    return null;
  }

  const mimeType = normalizeChatAttachmentMimeType(match[1] || "application/octet-stream");
  const base64Payload = String(match[2] || "").replace(/\s+/g, "");
  if (!base64Payload || /[^a-zA-Z0-9+/=]/.test(base64Payload)) {
    return null;
  }

  return {
    mimeType,
    base64Payload,
  };
}

function getChatAttachmentExtension(fileName, mimeType) {
  const rawExtension = path.extname(String(fileName || ""))
    .replace(/^\./, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 10);

  if (rawExtension) {
    return rawExtension;
  }

  return CHAT_MIME_EXTENSION_FALLBACKS[mimeType] || "bin";
}

function serializeChatAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return null;
  }

  const url = String(attachment.url || "").trim();
  if (!url) {
    return null;
  }

  return {
    id: String(attachment.id || ""),
    name: normalizeChatAttachmentFileName(attachment.name),
    mimeType: normalizeChatAttachmentMimeType(attachment.mimeType),
    size: Number(attachment.size) > 0 ? Math.round(Number(attachment.size)) : 0,
    url,
  };
}

function serializeChatMessage(message) {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
        .map((attachment) => serializeChatAttachment(attachment))
        .filter(Boolean)
        .slice(0, MAX_CHAT_ATTACHMENTS)
    : [];
  const editedAt = Number(message?.editedAt);

  const serialized = {
    id: String(message?.id || ""),
    roomId: String(message?.roomId || ""),
    userId: String(message?.userId || ""),
    userName: String(message?.userName || "Guest"),
    text: normalizeChatText(message?.text),
    attachments,
    createdAt: Number(message?.createdAt) || Date.now(),
  };

  if (Number.isFinite(editedAt) && editedAt > 0) {
    serialized.editedAt = Math.round(editedAt);
  }

  return serialized;
}

function isPathInside(parentPath, targetPath) {
  const parent = path.resolve(parentPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveChatAttachmentStoredPath(attachment) {
  const explicitPath = String(attachment?.storedPath || "").trim();
  if (explicitPath) {
    const resolvedExplicitPath = path.resolve(explicitPath);
    if (isPathInside(CHAT_UPLOADS_ROOT, resolvedExplicitPath)) {
      return resolvedExplicitPath;
    }
  }

  const rawUrl = String(attachment?.url || "").trim();
  if (!rawUrl || !rawUrl.startsWith("/chat-uploads/")) {
    return "";
  }

  const relativeUrlPath = rawUrl.slice("/chat-uploads/".length);
  if (!relativeUrlPath) {
    return "";
  }

  const decodedRelativePath = relativeUrlPath
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join(path.sep);

  const candidatePath = path.resolve(path.join(CHAT_UPLOADS_ROOT, decodedRelativePath));
  if (!isPathInside(CHAT_UPLOADS_ROOT, candidatePath)) {
    return "";
  }

  return candidatePath;
}

function cleanupChatAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    return;
  }

  for (const attachment of attachments) {
    const storedPath = resolveChatAttachmentStoredPath(attachment);
    if (!storedPath) {
      continue;
    }

    fs.unlink(storedPath, () => {
      // no-op
    });
  }
}

function cleanupChatMessages(messages) {
  if (!Array.isArray(messages)) {
    return;
  }

  for (const message of messages) {
    cleanupChatAttachments(message?.attachments);
  }
}

function cleanupRoomUploads(roomId) {
  const roomStorageId = normalizeChatStorageRoomId(roomId);
  const roomUploadsPath = path.join(CHAT_UPLOADS_ROOT, roomStorageId);
  fs.rm(roomUploadsPath, { recursive: true, force: true }, () => {
    // no-op
  });
}

async function normalizeChatAttachments(attachments, roomId) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const limited = attachments.slice(0, MAX_CHAT_ATTACHMENTS);
  const roomStorageId = normalizeChatStorageRoomId(roomId);
  const roomUploadsPath = path.join(CHAT_UPLOADS_ROOT, roomStorageId);
  await fs.promises.mkdir(roomUploadsPath, { recursive: true });

  const normalized = [];
  const createdPaths = [];
  let totalBytes = 0;

  try {
    for (let index = 0; index < limited.length; index += 1) {
      const item = limited[index];
      if (!item || typeof item !== "object") {
        continue;
      }

      const parsed = parseChatAttachmentDataUrl(item.dataUrl);
      if (!parsed) {
        continue;
      }

      const mimeType = normalizeChatAttachmentMimeType(item.mimeType || parsed.mimeType);
      const fileName = normalizeChatAttachmentFileName(item.name);
      const estimatedBytes = Math.floor((parsed.base64Payload.length * 3) / 4);
      if (estimatedBytes > MAX_CHAT_ATTACHMENT_BYTES) {
        throw new Error("Attachment is too large.");
      }

      const buffer = Buffer.from(parsed.base64Payload, "base64");
      if (!buffer.length) {
        continue;
      }

      if (buffer.length > MAX_CHAT_ATTACHMENT_BYTES) {
        throw new Error("Attachment is too large.");
      }

      totalBytes += buffer.length;
      if (totalBytes > MAX_CHAT_TOTAL_ATTACHMENT_BYTES) {
        throw new Error("Total attachment size is too large.");
      }

      const extension = getChatAttachmentExtension(fileName, mimeType);
      const attachmentId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${index}`;
      const storageFileName = `${attachmentId}.${extension}`;
      const storedPath = path.join(roomUploadsPath, storageFileName);
      await fs.promises.writeFile(storedPath, buffer);
      createdPaths.push(storedPath);

      normalized.push({
        id: attachmentId,
        name: fileName,
        mimeType,
        size: buffer.length,
        url: `/chat-uploads/${encodeURIComponent(roomStorageId)}/${encodeURIComponent(storageFileName)}`,
        storedPath,
      });
    }
  } catch (error) {
    await Promise.all(
      createdPaths.map((filePath) =>
        fs.promises.unlink(filePath).catch(() => {
          // no-op
        })
      )
    );
    throw error;
  }

  return normalized;
}

function serializeRoomForMember(room, memberId) {
  ensureDefaultVoiceChannels(room);

  const rawCurrentVoiceChannelId = room.memberVoiceChannel.get(memberId) || null;
  const currentVoiceChannel = rawCurrentVoiceChannelId
    ? room.voiceChannels.get(rawCurrentVoiceChannelId) || null
    : null;
  if (rawCurrentVoiceChannelId && !currentVoiceChannel) {
    room.memberVoiceChannel.delete(memberId);
  }

  return {
    id: room.id,
    hostId: currentVoiceChannel ? currentVoiceChannel.hostId : null,
    members: Array.from(room.members).map((id) => ({
      id,
      name: room.names.get(id) || "Guest",
    })),
    voiceMembers: currentVoiceChannel
      ? Array.from(currentVoiceChannel.members).map((id) => ({
          id,
          name: room.names.get(id) || "Guest",
        }))
      : [],
    currentVoiceChannelId: currentVoiceChannel ? currentVoiceChannel.id : null,
    voiceChannels: Array.from(room.voiceChannels.values())
      .sort(sortVoiceChannelId)
      .map((channel) => ({
        id: channel.id,
        name: normalizeVoiceChannelName(channel.name, channel.id),
        hostId: channel.hostId,
        count: channel.members.size,
        members: Array.from(channel.members).map((id) => ({
          id,
          name: room.names.get(id) || "Guest",
        })),
      })),
    messages: room.messages
      .slice(-MAX_CHAT_MESSAGES)
      .map((message) => serializeChatMessage(message)),
  };
}

function normalizeChatText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  return text.slice(0, MAX_CHAT_MESSAGE_LENGTH);
}

function normalizeChatMessageId(value) {
  return String(value || "").trim().slice(0, 64);
}

function normalizeChatAuthorId(value) {
  const id = String(value || "")
    .trim()
    .toLowerCase()
    .slice(0, 64);
  if (/^[a-z0-9][a-z0-9_-]{7,63}$/.test(id)) {
    return id;
  }
  return "";
}

function isChatMessageOwnedBySocket(message, socket) {
  const messageUserId = String(message?.userId || "").trim();
  if (!messageUserId) {
    return false;
  }

  const socketId = String(socket?.id || "").trim();
  const authorId = String(socket?.data?.chatAuthorId || "").trim();

  return Boolean(
    (authorId && messageUserId === authorId) ||
      (socketId && messageUserId === socketId)
  );
}

function findChatMessageIndex(room, messageId) {
  if (!room || !Array.isArray(room.messages)) {
    return -1;
  }

  const cleanMessageId = normalizeChatMessageId(messageId);
  if (!cleanMessageId) {
    return -1;
  }

  return room.messages.findIndex((message) => String(message?.id || "") === cleanMessageId);
}

function canEditChatMessage(message) {
  const createdAt = Number(message?.createdAt);
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    return false;
  }

  return Date.now() - createdAt <= CHAT_EDIT_WINDOW_MS;
}

function normalizePersistedChatMessages(messages, roomId) {
  const list = Array.isArray(messages) ? messages : [];
  const normalized = [];
  const knownIds = new Set();

  for (const rawMessage of list) {
    const normalizedMessage = serializeChatMessage({
      id: rawMessage?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      roomId,
      userId: rawMessage?.userId,
      userName: rawMessage?.userName,
      text: rawMessage?.text,
      attachments: rawMessage?.attachments,
      createdAt: rawMessage?.createdAt,
      editedAt: rawMessage?.editedAt,
    });

    if (!normalizedMessage.id || knownIds.has(normalizedMessage.id)) {
      continue;
    }

    if (!normalizedMessage.text && normalizedMessage.attachments.length === 0) {
      continue;
    }

    knownIds.add(normalizedMessage.id);
    normalized.push(normalizedMessage);
  }

  normalized.sort((left, right) => left.createdAt - right.createdAt);
  return normalized.slice(-MAX_CHAT_MESSAGES);
}

function buildChatStateSnapshot() {
  const persistedRooms = [];

  for (const room of rooms.values()) {
    const serializedMessages = room.messages
      .slice(-MAX_CHAT_MESSAGES)
      .map((message) => serializeChatMessage(message))
      .filter((message) => message.text || message.attachments.length > 0);

    if (serializedMessages.length === 0) {
      continue;
    }

    persistedRooms.push({
      id: room.id,
      messages: serializedMessages,
    });
  }

  persistedRooms.sort((left, right) => String(left.id).localeCompare(String(right.id)));

  return {
    version: CHAT_STATE_VERSION,
    savedAt: Date.now(),
    rooms: persistedRooms,
  };
}

async function persistChatStateToDisk() {
  const snapshot = buildChatStateSnapshot();
  await fs.promises.mkdir(CHAT_STATE_ROOT, { recursive: true });

  const temporaryFile = `${CHAT_STATE_FILE}.tmp`;
  await fs.promises.writeFile(temporaryFile, JSON.stringify(snapshot, null, 2), "utf8");
  await fs.promises.rename(temporaryFile, CHAT_STATE_FILE);
}

function queueChatStateSave() {
  if (chatStateSaveTimer) {
    clearTimeout(chatStateSaveTimer);
  }

  chatStateSaveTimer = setTimeout(() => {
    chatStateSaveTimer = null;
    chatStateSaveChain = chatStateSaveChain
      .catch(() => {
        // no-op
      })
      .then(() => persistChatStateToDisk())
      .catch((error) => {
        console.error("Failed to persist chat history:", error);
      });
  }, CHAT_STATE_SAVE_DEBOUNCE_MS);
}

function loadChatStateFromDisk() {
  try {
    if (!fs.existsSync(CHAT_STATE_FILE)) {
      return;
    }

    const raw = fs.readFileSync(CHAT_STATE_FILE, "utf8");
    if (!raw.trim()) {
      return;
    }

    const parsed = JSON.parse(raw);
    const roomEntries = Array.isArray(parsed?.rooms) ? parsed.rooms : [];
    let restoredRooms = 0;

    for (const roomEntry of roomEntries) {
      const roomId = String(roomEntry?.id || "").trim();
      if (!roomId || roomId.toLowerCase() === "main") {
        continue;
      }

      const room = getOrCreateRoom(roomId);
      room.messages = normalizePersistedChatMessages(roomEntry.messages, roomId);
      if (room.messages.length > 0) {
        restoredRooms += 1;
      }
    }

    if (restoredRooms > 0) {
      console.log(`Chat history restored for ${restoredRooms} room(s).`);
    }
  } catch (error) {
    console.error("Failed to load chat history:", error);
  }
}

function broadcastRoomState(room) {
  for (const memberId of room.members) {
    io.to(memberId).emit("room-state", serializeRoomForMember(room, memberId));
  }
}

function getMemberVoiceChannelId(room, memberId) {
  const channelId = room.memberVoiceChannel.get(memberId) || null;
  if (!channelId || !room.voiceChannels.has(channelId)) {
    return null;
  }
  return channelId;
}

function areMembersInSameVoiceChannel(room, leftMemberId, rightMemberId) {
  const leftChannelId = getMemberVoiceChannelId(room, leftMemberId);
  const rightChannelId = getMemberVoiceChannelId(room, rightMemberId);
  return Boolean(leftChannelId && rightChannelId && leftChannelId === rightChannelId);
}

function sendAck(callback, payload) {
  if (typeof callback === "function") {
    callback(payload);
  }
}

fs.mkdirSync(CHAT_UPLOADS_ROOT, { recursive: true });
fs.mkdirSync(CHAT_STATE_ROOT, { recursive: true });
loadChatStateFromDisk();

io.on("connection", (socket) => {
  socket.data.roomId = null;
  socket.data.userName = "Guest";
  socket.data.voiceChannelId = null;
  socket.data.chatAuthorId = socket.id;

  socket.on("join-room", ({ roomId, name, authorId } = {}) => {
    const cleanRoomId = String(roomId || "").trim();
    if (!cleanRoomId || cleanRoomId.toLowerCase() === "main") {
      return;
    }

    const cleanName = String(name || "Guest").trim() || "Guest";
    const cleanAuthorId = normalizeChatAuthorId(authorId) || socket.id;

    const room = getOrCreateRoom(cleanRoomId);

    socket.join(cleanRoomId);
    socket.data.roomId = cleanRoomId;
    socket.data.userName = cleanName;
    socket.data.chatAuthorId = cleanAuthorId;

    room.members.add(socket.id);
    room.names.set(socket.id, cleanName);
    ensureDefaultVoiceChannels(room);
    socket.data.voiceChannelId = null;

    socket.emit("joined-room", {
      room: serializeRoomForMember(room, socket.id),
      selfId: socket.id,
    });

    broadcastRoomState(room);
  });

  socket.on("signal", ({ to, payload }) => {
    if (!to || !payload) {
      return;
    }

    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const room = rooms.get(roomId);
    const targetId = String(to);
    if (!room.members.has(socket.id) || !room.members.has(targetId)) {
      return;
    }

    if (!areMembersInSameVoiceChannel(room, socket.id, targetId)) {
      return;
    }

    io.to(to).emit("signal", {
      from: socket.id,
      payload,
    });
  });

  socket.on("chat-message", async ({ text, attachments } = {}) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room.members.has(socket.id)) {
      return;
    }

    const normalizedText = normalizeChatText(text);
    let normalizedAttachments = [];
    try {
      normalizedAttachments = await normalizeChatAttachments(attachments, roomId);
    } catch (error) {
      socket.emit("chat-error", {
        message: error?.message || "Unable to upload attachment.",
      });
      return;
    }

    if (!normalizedText && normalizedAttachments.length === 0) {
      return;
    }

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      roomId,
      userId: socket.data.chatAuthorId || socket.id,
      userName: room.names.get(socket.id) || socket.data.userName || "Guest",
      text: normalizedText,
      attachments: normalizedAttachments,
      createdAt: Date.now(),
    };

    room.messages.push(message);
    if (room.messages.length > MAX_CHAT_MESSAGES) {
      const removedMessages = room.messages.splice(0, room.messages.length - MAX_CHAT_MESSAGES);
      cleanupChatMessages(removedMessages);
    }
    queueChatStateSave();

    io.to(roomId).emit("chat-message", serializeChatMessage(message));
  });

  socket.on("edit-chat-message", ({ messageId, text, removeAttachmentIds } = {}, callback) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      sendAck(callback, {
        ok: false,
        error: "Join server first.",
      });
      return;
    }

    const room = rooms.get(roomId);
    if (!room.members.has(socket.id)) {
      sendAck(callback, {
        ok: false,
        error: "Join server first.",
      });
      return;
    }

    const cleanMessageId = normalizeChatMessageId(messageId);
    const messageIndex = findChatMessageIndex(room, cleanMessageId);
    if (messageIndex === -1) {
      sendAck(callback, {
        ok: false,
        error: "Message not found.",
      });
      return;
    }

    const message = room.messages[messageIndex];
    if (!isChatMessageOwnedBySocket(message, socket)) {
      sendAck(callback, {
        ok: false,
        error: "You can edit only your messages.",
      });
      return;
    }

    if (!canEditChatMessage(message)) {
      sendAck(callback, {
        ok: false,
        error: "Edit window expired.",
      });
      return;
    }

    const normalizedText = normalizeChatText(text);
    const idsToRemove = new Set(
      Array.isArray(removeAttachmentIds)
        ? removeAttachmentIds
            .map((value) => String(value || "").trim())
            .filter(Boolean)
            .slice(0, MAX_CHAT_ATTACHMENTS)
        : []
    );

    if (idsToRemove.size > 0 && Array.isArray(message.attachments) && message.attachments.length > 0) {
      const attachmentsToDelete = [];
      const keptAttachments = [];

      for (const attachment of message.attachments) {
        const attachmentId = String(attachment?.id || "").trim();
        if (attachmentId && idsToRemove.has(attachmentId)) {
          attachmentsToDelete.push(attachment);
        } else {
          keptAttachments.push(attachment);
        }
      }

      if (attachmentsToDelete.length > 0) {
        cleanupChatAttachments(attachmentsToDelete);
      }

      message.attachments = keptAttachments;
    }

    if (!normalizedText && (!Array.isArray(message.attachments) || message.attachments.length === 0)) {
      const [removedMessage] = room.messages.splice(messageIndex, 1);
      cleanupChatMessages([removedMessage]);
      queueChatStateSave();

      io.to(roomId).emit("chat-message-deleted", {
        messageId: cleanMessageId,
      });

      sendAck(callback, {
        ok: true,
      });
      return;
    }

    message.text = normalizedText;
    message.editedAt = Date.now();
    queueChatStateSave();

    const serializedMessage = serializeChatMessage(message);
    io.to(roomId).emit("chat-message-updated", serializedMessage);
    sendAck(callback, {
      ok: true,
      message: serializedMessage,
    });
  });

  socket.on("delete-chat-message", ({ messageId } = {}, callback) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      sendAck(callback, {
        ok: false,
        error: "Join server first.",
      });
      return;
    }

    const room = rooms.get(roomId);
    if (!room.members.has(socket.id)) {
      sendAck(callback, {
        ok: false,
        error: "Join server first.",
      });
      return;
    }

    const cleanMessageId = normalizeChatMessageId(messageId);
    const messageIndex = findChatMessageIndex(room, cleanMessageId);
    if (messageIndex === -1) {
      sendAck(callback, {
        ok: false,
        error: "Message not found.",
      });
      return;
    }

    const message = room.messages[messageIndex];
    if (!isChatMessageOwnedBySocket(message, socket)) {
      sendAck(callback, {
        ok: false,
        error: "You can edit only your messages.",
      });
      return;
    }

    const [removedMessage] = room.messages.splice(messageIndex, 1);
    cleanupChatMessages([removedMessage]);
    queueChatStateSave();

    io.to(roomId).emit("chat-message-deleted", {
      messageId: cleanMessageId,
    });

    sendAck(callback, {
      ok: true,
    });
  });

  socket.on("join-voice-channel", ({ channelId }) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const room = rooms.get(roomId);
    if (!room.members.has(socket.id)) {
      return;
    }

    const nextChannelId = moveMemberToVoiceChannel(room, socket.id, channelId);
    socket.data.voiceChannelId = nextChannelId;
    broadcastRoomState(room);
  });

  socket.on("leave-voice-channel", (callback) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      sendAck(callback, {
        ok: false,
        error: "Join server first.",
      });
      return;
    }

    const room = rooms.get(roomId);
    if (!room.members.has(socket.id)) {
      sendAck(callback, {
        ok: false,
        error: "Join server first.",
      });
      return;
    }

    if (!room.memberVoiceChannel.has(socket.id)) {
      sendAck(callback, {
        ok: true,
      });
      return;
    }

    removeMemberFromVoiceChannel(room, socket.id, true);
    socket.data.voiceChannelId = null;
    broadcastRoomState(room);
    sendAck(callback, {
      ok: true,
    });
  });

  socket.on("create-voice-channel", ({ name } = {}, callback) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      sendAck(callback, {
        ok: false,
        error: "Join server first.",
      });
      return;
    }

    const room = rooms.get(roomId);
    if (!room.members.has(socket.id)) {
      sendAck(callback, {
        ok: false,
        error: "Join server first.",
      });
      return;
    }

    const result = createVoiceChannelInRoom(room, name);
    if (!result.ok) {
      sendAck(callback, result);
      return;
    }

    broadcastRoomState(room);
    sendAck(callback, result);
  });

  socket.on("rename-voice-channel", ({ channelId, name } = {}, callback) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      sendAck(callback, {
        ok: false,
        error: "Join server first.",
      });
      return;
    }

    const room = rooms.get(roomId);
    if (!room.members.has(socket.id)) {
      sendAck(callback, {
        ok: false,
        error: "Join server first.",
      });
      return;
    }

    const result = renameVoiceChannelInRoom(room, channelId, name);
    if (!result.ok) {
      sendAck(callback, result);
      return;
    }

    broadcastRoomState(room);
    sendAck(callback, result);
  });

  socket.on("delete-voice-channel", ({ channelId } = {}, callback) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      sendAck(callback, {
        ok: false,
        error: "Join server first.",
      });
      return;
    }

    const room = rooms.get(roomId);
    if (!room.members.has(socket.id)) {
      sendAck(callback, {
        ok: false,
        error: "Join server first.",
      });
      return;
    }

    const result = deleteVoiceChannelFromRoom(room, channelId);
    if (!result.ok) {
      sendAck(callback, result);
      return;
    }

    broadcastRoomState(room);
    sendAck(callback, result);
  });

  socket.on("leave-room", () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const room = rooms.get(roomId);
    removeMemberFromVoiceChannel(room, socket.id, false);
    room.members.delete(socket.id);
    room.names.delete(socket.id);
    socket.leave(roomId);
    socket.data.roomId = null;
    socket.data.voiceChannelId = null;

    if (room.members.size === 0) {
      if (room.messages.length === 0) {
        cleanupChatMessages(room.messages);
        cleanupRoomUploads(roomId);
        rooms.delete(roomId);
        queueChatStateSave();
      } else {
        queueChatStateSave();
      }
    } else {
      broadcastRoomState(room);
    }
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) {
      return;
    }

    const room = rooms.get(roomId);
    removeMemberFromVoiceChannel(room, socket.id, false);
    room.members.delete(socket.id);
    room.names.delete(socket.id);
    socket.data.voiceChannelId = null;

    if (room.members.size === 0) {
      if (room.messages.length === 0) {
        cleanupChatMessages(room.messages);
        cleanupRoomUploads(roomId);
        rooms.delete(roomId);
        queueChatStateSave();
      } else {
        queueChatStateSave();
      }
    } else {
      broadcastRoomState(room);
    }
  });
});

let serverStartPromise = null;

function startServer(options = {}) {
  if (serverStartPromise) {
    return serverStartPromise;
  }

  const requestedPort = Number.isFinite(Number(options.port))
    ? Number(options.port)
    : Number(process.env.PORT || 3000);
  const requestedHost = options.host || process.env.HOST || "0.0.0.0";

  serverStartPromise = new Promise((resolve, reject) => {
    const handleError = (error) => {
      server.off("listening", handleListening);
      serverStartPromise = null;
      reject(error);
    };

    const handleListening = () => {
      server.off("error", handleError);
      const address = server.address();
      const actualPort =
        address && typeof address === "object" && Number.isFinite(address.port)
          ? address.port
          : requestedPort;
      const displayHost = requestedHost === "0.0.0.0" ? "localhost" : requestedHost;

      console.log(`Voice messenger started on ${protocol}://${displayHost}:${actualPort}`);
      console.log(
        `ICE config: ${countUrls(iceConfig.iceServers)} url(s), TURN ${
          hasTurnServer(iceConfig.iceServers) ? "enabled" : "disabled"
        }, policy=${iceConfig.iceTransportPolicy}`
      );
      if (!hasTls) {
        console.log(
          "Remote microphone access may fail on HTTP. For LAN clients use HTTPS via SSL_KEY_PATH and SSL_CERT_PATH."
        );
      }

      resolve({
        server,
        io,
        protocol,
        hasTls,
        host: requestedHost,
        port: actualPort,
        stop: stopServer,
      });
    };

    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(requestedPort, requestedHost);
  });

  return serverStartPromise;
}

function stopServer() {
  if (!server.listening) {
    serverStartPromise = null;
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    io.close(() => {
      server.close((error) => {
        serverStartPromise = null;
        if (error && error.code !== "ERR_SERVER_NOT_RUNNING") {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start voice messenger server:", error);
    process.exitCode = 1;
  });
}

module.exports = {
  app,
  server,
  io,
  startServer,
  stopServer,
};
