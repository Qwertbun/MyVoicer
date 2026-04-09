"use strict";

function toPositiveLimit(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.round(numeric);
  }
  return fallback;
}

function toNonNegativeLimit(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.round(numeric);
  }
  return fallback;
}

function createRelayEnvelopeUtils(options = {}) {
  const {
    maxChatAttachments = 4,
    relayAttachmentTransportS3V2 = "s3-v2",
    relayV2MaxFileBytes = 0,
    relayV2MaxTotalMessageBytes = 0,
    relayMaxEnvelopeCiphertextBytes = 0,
    normalizeRoomIdValue,
    normalizeChatAttachmentMimeType,
    normalizeChatStorageRoomId,
  } = options;

  if (typeof normalizeRoomIdValue !== "function") {
    throw new TypeError("createRelayEnvelopeUtils requires normalizeRoomIdValue function");
  }
  if (typeof normalizeChatAttachmentMimeType !== "function") {
    throw new TypeError("createRelayEnvelopeUtils requires normalizeChatAttachmentMimeType function");
  }
  if (typeof normalizeChatStorageRoomId !== "function") {
    throw new TypeError("createRelayEnvelopeUtils requires normalizeChatStorageRoomId function");
  }

  const normalizedMaxChatAttachments = toPositiveLimit(maxChatAttachments, 4);
  const normalizedMaxFileBytes = toNonNegativeLimit(relayV2MaxFileBytes, 0);
  const normalizedMaxTotalMessageBytes = toNonNegativeLimit(relayV2MaxTotalMessageBytes, 0);
  const normalizedEnvelopeCiphertextBytes = toPositiveLimit(relayMaxEnvelopeCiphertextBytes, 0);
  const relayTransportS3V2 = String(relayAttachmentTransportS3V2 || "s3-v2").trim().toLowerCase();

  function normalizeRelayString(value, maxLength = 256) {
    return String(value || "").trim().slice(0, maxLength);
  }

  function normalizeRelayCiphertext(value, maxBytes = 0) {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }

    const normalizedMaxBytes = Number(maxBytes);
    if (Number.isFinite(normalizedMaxBytes) && normalizedMaxBytes > 0) {
      const byteLength = Buffer.byteLength(text, "utf8");
      if (byteLength > normalizedMaxBytes) {
        return "";
      }
    }

    return text;
  }

  function normalizeRelayRoomId(value) {
    const cleanRoomId = normalizeRoomIdValue(value);
    if (!cleanRoomId || cleanRoomId.toLowerCase() === "main") {
      return "";
    }
    return cleanRoomId;
  }

  function estimatePayloadBytes(value) {
    try {
      return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
    } catch {
      return 0;
    }
  }

  function sanitizeRelayAttachmentRef(value = {}) {
    const messageId = normalizeRelayString(value.messageId, 96);
    const attachmentId = normalizeRelayString(value.attachmentId, 96);
    const name = normalizeRelayString(value.name, 120);
    const mimeType = normalizeChatAttachmentMimeType(value.mimeType);
    const size = Number(value.size);
    const transport = normalizeRelayString(value.transport, 24).toLowerCase();
    const objectKey = normalizeRelayString(value.objectKey, 512);
    if (!messageId || !attachmentId) {
      return null;
    }

    const normalizedSize = Number.isFinite(size) && size >= 0 ? Math.round(size) : 0;
    if (normalizedSize > normalizedMaxFileBytes) {
      return null;
    }

    if (transport === relayTransportS3V2 && !objectKey) {
      return null;
    }

    return {
      messageId,
      attachmentId,
      transport: transport === relayTransportS3V2 ? relayTransportS3V2 : "",
      objectKey: transport === relayTransportS3V2 ? objectKey : "",
      name: name || "file",
      mimeType,
      size: normalizedSize,
    };
  }

  function sanitizeRelayEnvelope(value = {}) {
    if (!value || typeof value !== "object") {
      return null;
    }

    const roomId = normalizeRelayRoomId(value.roomId);
    const messageId = normalizeRelayString(value.messageId, 96);
    const senderId = normalizeRelayString(value.senderId, 96);
    const createdAt = Number(value.createdAt);
    const v = Number(value.v);
    const alg = normalizeRelayString(value.alg, 24);
    const iv = normalizeRelayString(value.iv, 128);
    const transportVersionRaw = Number(value.transportVersion);
    const transportVersion = transportVersionRaw === 2 ? 2 : 1;
    const ciphertext = normalizeRelayCiphertext(value.ciphertext, normalizedEnvelopeCiphertextBytes);

    if (!roomId || !messageId || !senderId) {
      return null;
    }
    if (!Number.isFinite(createdAt) || createdAt <= 0) {
      return null;
    }
    if (v !== 1 || alg !== "AES-GCM-256") {
      return null;
    }
    if (!iv || !ciphertext) {
      return null;
    }

    const attachmentRefs = Array.isArray(value.attachmentRefs)
      ? value.attachmentRefs
          .map((item) => sanitizeRelayAttachmentRef(item))
          .filter(Boolean)
          .slice(0, normalizedMaxChatAttachments)
      : [];
    const roomStoragePrefix = `relay-v2/${normalizeChatStorageRoomId(roomId)}/`;
    const hasInvalidV2Ref = attachmentRefs.some(
      (item) =>
        item?.transport === relayTransportS3V2
        && (!item.objectKey || !String(item.objectKey).startsWith(roomStoragePrefix))
    );
    if (hasInvalidV2Ref) {
      return null;
    }

    const totalAttachmentSize = attachmentRefs.reduce(
      (acc, item) => acc + (Number(item?.size) || 0),
      0
    );
    if (totalAttachmentSize > normalizedMaxTotalMessageBytes) {
      return null;
    }

    return {
      v,
      alg,
      transportVersion,
      roomId,
      messageId,
      senderId,
      createdAt: Math.round(createdAt),
      iv,
      ciphertext,
      attachmentRefs,
    };
  }

  return {
    normalizeRelayString,
    normalizeRelayRoomId,
    estimatePayloadBytes,
    sanitizeRelayAttachmentRef,
    sanitizeRelayEnvelope,
  };
}

module.exports = {
  createRelayEnvelopeUtils,
};
