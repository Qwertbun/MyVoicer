export const WS_PROTOCOL_VERSION = 2;
const ACK_TYPE = "ack";

export function normalizeString(value, maxLength = 256) {
  return String(value || "").trim().slice(0, maxLength);
}

export function makeEnvelope(type, requestId, payload = {}) {
  return {
    v: WS_PROTOCOL_VERSION,
    type: normalizeString(type, 96),
    requestId: normalizeString(requestId, 96),
    payload,
  };
}

export function makeAck(requestId, payload = {}) {
  return makeEnvelope(ACK_TYPE, requestId, {
    ok: Boolean(payload.ok),
    requestId: normalizeString(requestId, 96),
    data: payload.data,
    errorCode: payload.errorCode ? normalizeString(payload.errorCode, 96) : "",
    message: payload.message ? normalizeString(payload.message, 240) : "",
  });
}

export function parseIncomingEnvelope(rawText) {
  let parsed = null;
  try {
    parsed = JSON.parse(String(rawText || ""));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const v = Number(parsed.v);
  const type = normalizeString(parsed.type, 96);
  const requestId = normalizeString(parsed.requestId, 96);
  const payload = parsed.payload;

  if (v !== WS_PROTOCOL_VERSION || !type || !requestId) {
    return null;
  }

  return {
    v,
    type,
    requestId,
    payload: payload && typeof payload === "object" ? payload : {},
  };
}

export function estimateMessageBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    return 0;
  }
}

export function normalizeRoomId(value) {
  return normalizeString(value, 32);
}

export function normalizeUserName(value) {
  return normalizeString(value, 32) || "Guest";
}

export function normalizeMessageId(value) {
  return normalizeString(value, 96);
}

export function normalizeRelayCiphertext(value, maxBytes = 2 * 1024 * 1024) {
  const text = normalizeString(value, Number.MAX_SAFE_INTEGER);
  if (!text) {
    return "";
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return "";
  }
  return text;
}

export function sanitizeRelayEnvelope(envelope = {}) {
  if (!envelope || typeof envelope !== "object") {
    return null;
  }

  const roomId = normalizeRoomId(envelope.roomId);
  const messageId = normalizeMessageId(envelope.messageId);
  const senderId = normalizeString(envelope.senderId, 96);
  const createdAt = Number(envelope.createdAt);
  const v = Number(envelope.v);
  const alg = normalizeString(envelope.alg, 24);
  const iv = normalizeString(envelope.iv, 128);
  const ciphertext = normalizeRelayCiphertext(envelope.ciphertext);

  if (!roomId || !messageId || !senderId || !Number.isFinite(createdAt) || createdAt <= 0) {
    return null;
  }
  if (v !== 1 || alg !== "AES-GCM-256" || !iv || !ciphertext) {
    return null;
  }

  const attachmentRefs = Array.isArray(envelope.attachmentRefs)
    ? envelope.attachmentRefs
      .map((item) => sanitizeAttachmentRef(item))
      .filter(Boolean)
      .slice(0, 4)
    : [];

  return {
    v,
    alg,
    transportVersion: Number(envelope.transportVersion) === 2 ? 2 : 1,
    roomId,
    messageId,
    senderId,
    createdAt: Math.round(createdAt),
    iv,
    ciphertext,
    attachmentRefs,
  };
}

export function sanitizeAttachmentRef(value = {}) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const messageId = normalizeMessageId(value.messageId);
  const attachmentId = normalizeString(value.attachmentId, 96);
  if (!messageId || !attachmentId) {
    return null;
  }

  return {
    messageId,
    attachmentId,
    name: normalizeString(value.name, 120) || "file",
    mimeType: normalizeString(value.mimeType, 120) || "application/octet-stream",
    size: Math.max(0, Math.round(Number(value.size) || 0)),
    transport: normalizeString(value.transport, 24),
    objectKey: normalizeString(value.objectKey, 512),
  };
}
