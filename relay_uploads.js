"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

let S3Client = null;
let CreateMultipartUploadCommand = null;
let UploadPartCommand = null;
let CompleteMultipartUploadCommand = null;
let AbortMultipartUploadCommand = null;
let ListPartsCommand = null;
let GetObjectCommand = null;
let getSignedUrl = null;

try {
  ({
    S3Client,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
    ListPartsCommand,
    GetObjectCommand,
  } = require("@aws-sdk/client-s3"));
  ({ getSignedUrl } = require("@aws-sdk/s3-request-presigner"));
} catch {
  // AWS SDK is optional at runtime when S3 mode is not configured.
}

const RELAY_V2_MAX_FILE_BYTES = 10 * 1024 * 1024 * 1024;
const RELAY_V2_MAX_TOTAL_MESSAGE_BYTES = RELAY_V2_MAX_FILE_BYTES;
const RELAY_V2_DEFAULT_CHUNK_SIZE = 16 * 1024 * 1024;
const RELAY_V2_MAX_PART_BYTES = RELAY_V2_DEFAULT_CHUNK_SIZE + 256 * 1024;
const RELAY_V2_MIN_SIGNED_URL_TTL_SECONDS = 60;
const RELAY_V2_MAX_SIGNED_URL_TTL_SECONDS = 3600;
const RELAY_V2_DEFAULT_SIGNED_URL_TTL_SECONDS = 900;
const RELAY_V2_MIN_CAPABILITY_TTL_MS = 30 * 1000;
const RELAY_V2_DEFAULT_CAPABILITY_TTL_MS = 5 * 60 * 1000;
const RELAY_V2_DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const RELAY_V2_DEFAULT_RATE_WINDOW_MS = 60 * 1000;

function parsePositiveInt(value, fallbackValue, minValue = 1, maxValue = Number.MAX_SAFE_INTEGER) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallbackValue;
  }
  const rounded = Math.round(numeric);
  if (rounded < minValue) {
    return minValue;
  }
  if (rounded > maxValue) {
    return maxValue;
  }
  return rounded;
}

function boolFromEnv(value, fallbackValue = false) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return fallbackValue;
  }
  if (["1", "true", "yes", "on"].includes(text)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(text)) {
    return false;
  }
  return fallbackValue;
}

function base64UrlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ""), "utf8");
  return buffer.toString("base64url");
}

function base64UrlDecodeToBuffer(value) {
  return Buffer.from(String(value || ""), "base64url");
}

function normalizeRelayString(value, maxLength = 256) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeRelayAttachmentContentType(value) {
  const mimeType = String(value || "").trim().toLowerCase();
  if (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mimeType)) {
    return mimeType;
  }
  return "application/octet-stream";
}

function computeP95(values) {
  const numeric = Array.isArray(values)
    ? values
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item >= 0)
    : [];
  if (numeric.length === 0) {
    return 0;
  }
  numeric.sort((left, right) => left - right);
  const index = Math.max(0, Math.min(numeric.length - 1, Math.ceil(numeric.length * 0.95) - 1));
  return Math.round(numeric[index]);
}

function sanitizeUploadedParts(parts = []) {
  if (!Array.isArray(parts)) {
    return [];
  }
  return parts
    .map((item) => ({
      partNumber: Number(item?.partNumber || item?.PartNumber),
      etag: normalizeRelayString(item?.etag || item?.ETag, 256),
      size: Number(item?.size || item?.Size || 0),
      lastModified: Number(item?.lastModified || item?.LastModified || 0),
    }))
    .filter((item) => Number.isFinite(item.partNumber) && item.partNumber > 0 && item.etag)
    .map((item) => ({
      partNumber: Math.round(item.partNumber),
      etag: item.etag,
      size: Number.isFinite(item.size) && item.size >= 0 ? Math.round(item.size) : 0,
      lastModified: Number.isFinite(item.lastModified) && item.lastModified > 0
        ? Math.round(item.lastModified)
        : 0,
    }))
    .sort((left, right) => left.partNumber - right.partNumber);
}

async function readRequestBodyAsBuffer(req, maxBytes) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += nextChunk.length;
    if (total > maxBytes) {
      const error = new Error("payload_too_large");
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(nextChunk);
  }

  return Buffer.concat(chunks);
}

function createRelayUploadsManager({
  app,
  io,
  rooms,
  relayModeEnabled,
  normalizeRoomIdValue,
  normalizeChatStorageRoomId,
}) {
  const capabilitySecret = process.env.RELAY_CAPABILITY_SECRET
    ? Buffer.from(String(process.env.RELAY_CAPABILITY_SECRET), "utf8")
    : crypto.randomBytes(48);
  const capabilityTtlMs = parsePositiveInt(
    process.env.RELAY_CAPABILITY_TTL_MS,
    RELAY_V2_DEFAULT_CAPABILITY_TTL_MS,
    RELAY_V2_MIN_CAPABILITY_TTL_MS
  );
  const sessionTtlMs = parsePositiveInt(
    process.env.RELAY_UPLOAD_SESSION_TTL_MS,
    RELAY_V2_DEFAULT_SESSION_TTL_MS,
    60 * 1000
  );
  const signedUrlTtlSeconds = parsePositiveInt(
    process.env.RELAY_SIGNED_URL_TTL_SECONDS,
    RELAY_V2_DEFAULT_SIGNED_URL_TTL_SECONDS,
    RELAY_V2_MIN_SIGNED_URL_TTL_SECONDS,
    RELAY_V2_MAX_SIGNED_URL_TTL_SECONDS
  );

  const maxFileBytes = parsePositiveInt(
    process.env.RELAY_MAX_FILE_BYTES,
    RELAY_V2_MAX_FILE_BYTES,
    1,
    RELAY_V2_MAX_FILE_BYTES
  );
  const maxTotalMessageBytes = parsePositiveInt(
    process.env.RELAY_MAX_TOTAL_MESSAGE_BYTES,
    RELAY_V2_MAX_TOTAL_MESSAGE_BYTES,
    1,
    RELAY_V2_MAX_TOTAL_MESSAGE_BYTES
  );
  const chunkSizeBytes = parsePositiveInt(
    process.env.RELAY_UPLOAD_CHUNK_SIZE_BYTES,
    RELAY_V2_DEFAULT_CHUNK_SIZE,
    5 * 1024 * 1024,
    RELAY_V2_DEFAULT_CHUNK_SIZE
  );

  const s3Bucket = normalizeRelayString(process.env.RELAY_S3_BUCKET, 128);
  const s3Region = normalizeRelayString(process.env.RELAY_S3_REGION, 64);
  const s3Endpoint = normalizeRelayString(process.env.RELAY_S3_ENDPOINT, 512);
  const s3UsePathStyle = boolFromEnv(process.env.RELAY_S3_FORCE_PATH_STYLE, false);

  const useS3 =
    relayModeEnabled
    && Boolean(s3Bucket)
    && Boolean(s3Region)
    && Boolean(S3Client)
    && Boolean(getSignedUrl);

  const s3Client = useS3
    ? new S3Client({
        region: s3Region,
        endpoint: s3Endpoint || undefined,
        forcePathStyle: s3UsePathStyle,
      })
    : null;
  const relayObjectsRoot = process.env.RELAY_OBJECTS_ROOT
    ? path.resolve(String(process.env.RELAY_OBJECTS_ROOT))
    : path.resolve(path.join(process.cwd(), "data", "relay-objects"));
  if (relayModeEnabled && !useS3) {
    try {
      fs.mkdirSync(relayObjectsRoot, { recursive: true });
    } catch {
      // no-op
    }
  }

  const uploadSessions = new Map();
  const memoryObjects = new Map();
  const rateLimitBuckets = new Map();
  const downloadTokenSecret = crypto.randomBytes(48);

  const metrics = {
    initOk: 0,
    initFail: 0,
    partUrlOk: 0,
    partUrlFail: 0,
    completeOk: 0,
    completeFail: 0,
    abortOk: 0,
    abortFail: 0,
    downloadUrlOk: 0,
    downloadUrlFail: 0,
    uploadedBytes: 0,
    resumeCount: 0,
    tokenFail: 0,
    partLatencyMs: [],
  };

  function emitMetricPartLatency(latencyMs) {
    const numeric = Number(latencyMs);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return;
    }
    metrics.partLatencyMs.push(Math.round(numeric));
    if (metrics.partLatencyMs.length > 2048) {
      metrics.partLatencyMs.splice(0, metrics.partLatencyMs.length - 2048);
    }
  }

  function markMetric(scope, ok) {
    const suffix = ok ? "Ok" : "Fail";
    const key = `${scope}${suffix}`;
    if (Object.prototype.hasOwnProperty.call(metrics, key)) {
      metrics[key] += 1;
    }
  }

  function nowMs() {
    return Date.now();
  }

  function safeTimingEqual(left, right) {
    const leftBuffer = Buffer.isBuffer(left) ? left : Buffer.from(String(left || ""), "utf8");
    const rightBuffer = Buffer.isBuffer(right) ? right : Buffer.from(String(right || ""), "utf8");
    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  }

  function signPayload(encodedPayload) {
    return crypto.createHmac("sha256", capabilitySecret).update(String(encodedPayload || "")).digest();
  }

  function mintCapabilityToken({ roomId, socketId, authorId }) {
    const cleanRoomId = normalizeRoomIdValue(roomId);
    const cleanSocketId = normalizeRelayString(socketId, 128);
    const cleanAuthorId = normalizeRelayString(authorId, 128);
    if (!cleanRoomId || !cleanSocketId) {
      return null;
    }

    const issuedAt = nowMs();
    const payload = {
      v: 1,
      roomId: cleanRoomId,
      socketId: cleanSocketId,
      authorId: cleanAuthorId,
      issuedAt,
      expiresAt: issuedAt + capabilityTtlMs,
      nonce: crypto.randomBytes(12).toString("hex"),
    };

    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = base64UrlEncode(signPayload(encodedPayload));
    return {
      token: `${encodedPayload}.${signature}`,
      expiresAt: payload.expiresAt,
      roomId: cleanRoomId,
    };
  }

  function verifyCapabilityToken(token) {
    const text = String(token || "").trim();
    if (!text) {
      return { ok: false, reason: "missing_token" };
    }

    const [encodedPayload, encodedSignature] = text.split(".");
    if (!encodedPayload || !encodedSignature) {
      return { ok: false, reason: "invalid_token_format" };
    }

    let payload = null;
    try {
      payload = JSON.parse(base64UrlDecodeToBuffer(encodedPayload).toString("utf8"));
    } catch {
      return { ok: false, reason: "invalid_token_payload" };
    }

    const expectedSignature = signPayload(encodedPayload);
    let providedSignature = null;
    try {
      providedSignature = base64UrlDecodeToBuffer(encodedSignature);
    } catch {
      return { ok: false, reason: "invalid_token_signature" };
    }
    if (!safeTimingEqual(expectedSignature, providedSignature)) {
      return { ok: false, reason: "invalid_token_signature" };
    }

    const roomId = normalizeRoomIdValue(payload?.roomId);
    const socketId = normalizeRelayString(payload?.socketId, 128);
    const authorId = normalizeRelayString(payload?.authorId, 128);
    const issuedAt = Number(payload?.issuedAt);
    const expiresAt = Number(payload?.expiresAt);
    const v = Number(payload?.v);
    if (!roomId || !socketId || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || v !== 1) {
      return { ok: false, reason: "invalid_token_claims" };
    }
    if (nowMs() >= Math.round(expiresAt)) {
      return { ok: false, reason: "token_expired" };
    }

    return {
      ok: true,
      payload: {
        roomId,
        socketId,
        authorId,
        issuedAt: Math.round(issuedAt),
        expiresAt: Math.round(expiresAt),
      },
    };
  }

  function cleanupRateLimitBuckets() {
    const now = nowMs();
    for (const [key, item] of rateLimitBuckets.entries()) {
      if (!item || now >= item.resetAt) {
        rateLimitBuckets.delete(key);
      }
    }
  }

  function checkRateLimit(scope, key, maxHits, windowMs) {
    cleanupRateLimitBuckets();
    const now = nowMs();
    const bucketKey = `${scope}:${key}`;
    const existing = rateLimitBuckets.get(bucketKey);
    if (!existing || now >= existing.resetAt) {
      rateLimitBuckets.set(bucketKey, {
        hits: 1,
        resetAt: now + windowMs,
      });
      return true;
    }
    if (existing.hits >= maxHits) {
      return false;
    }
    existing.hits += 1;
    return true;
  }

  function parseCapabilityFromRequest(req) {
    const authHeader = String(req.headers?.authorization || "").trim();
    const bearerMatch = /^bearer\s+(.+)$/i.exec(authHeader);
    const queryToken = normalizeRelayString(req.query?.capability, 4096);
    const bodyToken = normalizeRelayString(req.body?.capability, 4096);
    const token = normalizeRelayString(
      bearerMatch?.[1] || queryToken || bodyToken,
      4096
    );
    if (!token) {
      return { ok: false, reason: "missing_token" };
    }
    return verifyCapabilityToken(token);
  }

  function getRequestRoomId(req) {
    const fromBody = normalizeRoomIdValue(req.body?.roomId);
    const fromQuery = normalizeRoomIdValue(req.query?.roomId);
    return fromBody || fromQuery;
  }

  function withCapability(req, res, next) {
    if (!relayModeEnabled) {
      res.status(404).json({
        ok: false,
        error: "relay_mode_required",
      });
      return;
    }

    const capability = parseCapabilityFromRequest(req);
    if (!capability.ok) {
      metrics.tokenFail += 1;
      res.status(401).json({
        ok: false,
        error: capability.reason || "unauthorized",
      });
      return;
    }

    const roomId = getRequestRoomId(req);
    if (!roomId || roomId !== capability.payload.roomId) {
      metrics.tokenFail += 1;
      res.status(403).json({
        ok: false,
        error: "capability_room_mismatch",
      });
      return;
    }

    req.relayCapability = capability.payload;
    next();
  }

  function enforceRateLimitOrReply(req, res, scope, maxHits, windowMs = RELAY_V2_DEFAULT_RATE_WINDOW_MS) {
    const capability = req.relayCapability || {};
    const limiterKey = capability.socketId || req.ip || "unknown";
    const allowed = checkRateLimit(scope, limiterKey, maxHits, windowMs);
    if (!allowed) {
      res.status(429).json({
        ok: false,
        error: "rate_limited",
      });
      return false;
    }
    return true;
  }

  function createObjectKey(roomId, messageId, attachmentId) {
    const roomStorageId = normalizeChatStorageRoomId(roomId);
    const cleanMessageId = normalizeRelayString(messageId, 96) || "msg";
    const cleanAttachmentId = normalizeRelayString(attachmentId, 96) || "att";
    const randomSuffix = crypto.randomBytes(8).toString("hex");
    return `relay-v2/${roomStorageId}/${cleanMessageId}/${cleanAttachmentId}-${randomSuffix}.bin`;
  }

  function isObjectKeyAllowedForRoom(roomId, objectKey) {
    const cleanRoomId = normalizeRoomIdValue(roomId);
    const cleanObjectKey = normalizeRelayString(objectKey, 512);
    if (!cleanRoomId || !cleanObjectKey) {
      return false;
    }
    const roomStorageId = normalizeChatStorageRoomId(cleanRoomId);
    const expectedPrefix = `relay-v2/${roomStorageId}/`;
    return cleanObjectKey.startsWith(expectedPrefix) && !cleanObjectKey.includes("..");
  }

  function resolveDiskObjectPath(objectKey) {
    const cleanObjectKey = normalizeRelayString(objectKey, 512);
    if (!cleanObjectKey) {
      return "";
    }
    const root = path.resolve(relayObjectsRoot);
    const candidatePath = path.resolve(path.join(root, cleanObjectKey));
    if (candidatePath !== root && !candidatePath.startsWith(`${root}${path.sep}`)) {
      return "";
    }
    return candidatePath;
  }

  function resolveDiskObjectMetaPath(objectPath) {
    const cleanObjectPath = String(objectPath || "").trim();
    if (!cleanObjectPath) {
      return "";
    }
    return `${cleanObjectPath}.meta.json`;
  }

  async function loadDiskObjectEntry(roomId, objectKey) {
    if (useS3) {
      return null;
    }
    const cleanRoomId = normalizeRoomIdValue(roomId);
    const cleanObjectKey = normalizeRelayString(objectKey, 512);
    if (!cleanRoomId || !cleanObjectKey) {
      return null;
    }
    const objectPath = resolveDiskObjectPath(cleanObjectKey);
    if (!objectPath) {
      return null;
    }

    let stat = null;
    try {
      stat = await fs.promises.stat(objectPath);
    } catch {
      return null;
    }
    if (!stat || !stat.isFile()) {
      return null;
    }

    let metadata = {};
    const metadataPath = resolveDiskObjectMetaPath(objectPath);
    if (metadataPath) {
      try {
        const rawMeta = await fs.promises.readFile(metadataPath, "utf8");
        const parsed = JSON.parse(rawMeta);
        if (parsed && typeof parsed === "object") {
          metadata = parsed;
        }
      } catch {
        // no-op
      }
    }

    const metadataRoomId = normalizeRoomIdValue(metadata?.roomId);
    if (metadataRoomId && metadataRoomId !== cleanRoomId) {
      return null;
    }
    return {
      roomId: cleanRoomId,
      messageId: normalizeRelayString(metadata?.messageId, 96),
      attachmentId: normalizeRelayString(metadata?.attachmentId, 96),
      contentType: normalizeRelayAttachmentContentType(metadata?.contentType),
      bodyPath: objectPath,
      size: Number.isFinite(Number(metadata?.size))
        ? Math.max(0, Math.round(Number(metadata.size)))
        : stat.size,
      createdAt: Number.isFinite(Number(metadata?.createdAt))
        ? Math.max(0, Math.round(Number(metadata.createdAt)))
        : nowMs(),
    };
  }

  async function listS3UploadedParts(session) {
    if (!s3Client || !useS3) {
      return [];
    }

    const uploadedParts = [];
    let marker = 0;
    let hasMore = true;
    while (hasMore) {
      const response = await s3Client.send(
        new ListPartsCommand({
          Bucket: s3Bucket,
          Key: session.objectKey,
          UploadId: session.uploadId,
          PartNumberMarker: marker,
          MaxParts: 1000,
        })
      );

      const batch = Array.isArray(response?.Parts) ? response.Parts : [];
      for (const part of batch) {
        uploadedParts.push({
          partNumber: Number(part?.PartNumber || 0),
          etag: String(part?.ETag || ""),
          size: Number(part?.Size || 0),
          lastModified: part?.LastModified ? new Date(part.LastModified).getTime() : 0,
        });
      }

      hasMore = Boolean(response?.IsTruncated);
      marker = Number(response?.NextPartNumberMarker || 0);
      if (!Number.isFinite(marker) || marker < 0) {
        hasMore = false;
      }
    }

    return sanitizeUploadedParts(uploadedParts);
  }

  function listMemoryUploadedParts(session) {
    const parts = Array.from(session.parts.entries()).map(([partNumber, item]) => ({
      partNumber,
      etag: item.etag,
      size: item.size,
      lastModified: item.updatedAt,
    }));
    return sanitizeUploadedParts(parts);
  }

  function getSession(sessionId) {
    const cleanSessionId = normalizeRelayString(sessionId, 96);
    if (!cleanSessionId) {
      return null;
    }
    return uploadSessions.get(cleanSessionId) || null;
  }

  function deleteSession(sessionId) {
    const cleanSessionId = normalizeRelayString(sessionId, 96);
    if (!cleanSessionId) {
      return;
    }
    uploadSessions.delete(cleanSessionId);
  }

  async function cleanupExpiredSessions() {
    if (uploadSessions.size === 0) {
      return;
    }
    const now = nowMs();
    const expired = [];
    for (const session of uploadSessions.values()) {
      if (!session || !session.sessionId) {
        continue;
      }
      if (now - session.updatedAt > sessionTtlMs) {
        expired.push(session);
      }
    }

    for (const session of expired) {
      deleteSession(session.sessionId);
      if (useS3 && s3Client && session.uploadId) {
        try {
          await s3Client.send(
            new AbortMultipartUploadCommand({
              Bucket: s3Bucket,
              Key: session.objectKey,
              UploadId: session.uploadId,
            })
          );
        } catch {
          // no-op
        }
      }
    }
  }

  app.post("/api/relay/uploads/init", withCapability, async (req, res) => {
    if (!enforceRateLimitOrReply(req, res, "upload-init", 40)) {
      return;
    }

    const startedAt = nowMs();
    const roomId = getRequestRoomId(req);
    const messageId = normalizeRelayString(req.body?.messageId, 96);
    const attachmentId = normalizeRelayString(req.body?.attachmentId, 96);
    const size = Number(req.body?.size);
    const contentType = normalizeRelayAttachmentContentType(req.body?.mimeType || req.body?.contentType);
    const requestedChunkSize = parsePositiveInt(
      req.body?.chunkSize,
      chunkSizeBytes,
      chunkSizeBytes,
      chunkSizeBytes
    );
    const fileFingerprint = normalizeRelayString(req.body?.fileFingerprint, 320);

    if (!roomId || !messageId || !attachmentId) {
      markMetric("init", false);
      res.status(400).json({
        ok: false,
        error: "invalid_upload_identity",
      });
      return;
    }
    if (!Number.isFinite(size) || size <= 0 || size > maxFileBytes) {
      markMetric("init", false);
      res.status(400).json({
        ok: false,
        error: "invalid_file_size",
        maxFileBytes,
      });
      return;
    }
    if (size > maxTotalMessageBytes) {
      markMetric("init", false);
      res.status(400).json({
        ok: false,
        error: "message_attachment_budget_exceeded",
        maxTotalMessageBytes,
      });
      return;
    }

    try {
      await cleanupExpiredSessions();

      const sessionId = crypto.randomBytes(16).toString("hex");
      const objectKey = createObjectKey(roomId, messageId, attachmentId);
      let uploadId = "";

      if (useS3 && s3Client) {
        const createResponse = await s3Client.send(
          new CreateMultipartUploadCommand({
            Bucket: s3Bucket,
            Key: objectKey,
            ContentType: contentType,
            Metadata: {
              relay_room_id: roomId,
              relay_message_id: messageId,
              relay_attachment_id: attachmentId,
            },
            Tagging: "relay_ttl=30d",
          })
        );
        uploadId = normalizeRelayString(createResponse?.UploadId, 256);
        if (!uploadId) {
          throw new Error("missing_upload_id");
        }
      } else {
        uploadId = crypto.randomBytes(12).toString("hex");
      }

      uploadSessions.set(sessionId, {
        sessionId,
        uploadId,
        roomId,
        messageId,
        attachmentId,
        objectKey,
        size: Math.round(size),
        contentType,
        chunkSize: requestedChunkSize,
        createdAt: nowMs(),
        updatedAt: nowMs(),
        capabilitySocketId: req.relayCapability.socketId,
        fileFingerprint,
        provider: useS3 ? "s3" : "disk",
        parts: new Map(),
        resumeReported: false,
      });

      markMetric("init", true);
      emitMetricPartLatency(nowMs() - startedAt);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        provider: useS3 ? "s3" : "disk",
        sessionId,
        uploadId,
        objectKey,
        chunkSize: requestedChunkSize,
        signedUrlTtlSeconds,
        maxFileBytes,
      });
    } catch (error) {
      markMetric("init", false);
      res.status(500).json({
        ok: false,
        error: "upload_init_failed",
        details: String(error?.message || "unknown"),
      });
    }
  });

  app.post("/api/relay/uploads/part-url", withCapability, async (req, res) => {
    if (!enforceRateLimitOrReply(req, res, "upload-part-url", 400)) {
      return;
    }

    const startedAt = nowMs();
    const roomId = getRequestRoomId(req);
    const sessionId = normalizeRelayString(req.body?.sessionId, 96);
    const partNumber = Number(req.body?.partNumber);
    const session = getSession(sessionId);
    if (!roomId || !session || session.roomId !== roomId) {
      markMetric("partUrl", false);
      res.status(404).json({
        ok: false,
        error: "upload_session_not_found",
      });
      return;
    }
    if (!Number.isFinite(partNumber) || partNumber <= 0) {
      markMetric("partUrl", false);
      res.status(400).json({
        ok: false,
        error: "invalid_part_number",
      });
      return;
    }

    const roundedPartNumber = Math.round(partNumber);
    session.updatedAt = nowMs();

    try {
      if (useS3 && s3Client) {
        const command = new UploadPartCommand({
          Bucket: s3Bucket,
          Key: session.objectKey,
          UploadId: session.uploadId,
          PartNumber: roundedPartNumber,
          ContentType: "application/octet-stream",
        });
        const signedUrl = await getSignedUrl(s3Client, command, {
          expiresIn: signedUrlTtlSeconds,
        });
        markMetric("partUrl", true);
        emitMetricPartLatency(nowMs() - startedAt);
        res.setHeader("Cache-Control", "no-store");
        res.json({
          ok: true,
          provider: "s3",
          sessionId: session.sessionId,
          partNumber: roundedPartNumber,
          method: "PUT",
          url: signedUrl,
          expiresAt: nowMs() + signedUrlTtlSeconds * 1000,
        });
        return;
      }

      markMetric("partUrl", true);
      emitMetricPartLatency(nowMs() - startedAt);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        provider: "disk",
        sessionId: session.sessionId,
        partNumber: roundedPartNumber,
        method: "PUT",
        url: `/api/relay/uploads/part/${encodeURIComponent(session.sessionId)}/${roundedPartNumber}?roomId=${encodeURIComponent(roomId)}`,
        expiresAt: nowMs() + signedUrlTtlSeconds * 1000,
      });
    } catch (error) {
      markMetric("partUrl", false);
      res.status(500).json({
        ok: false,
        error: "upload_part_url_failed",
        details: String(error?.message || "unknown"),
      });
    }
  });

  app.put("/api/relay/uploads/part/:sessionId/:partNumber", withCapability, async (req, res) => {
    if (!enforceRateLimitOrReply(req, res, "upload-part-direct", 600)) {
      return;
    }

    const startedAt = nowMs();
    const roomId = getRequestRoomId(req);
    const sessionId = normalizeRelayString(req.params?.sessionId, 96);
    const partNumber = Number(req.params?.partNumber);
    const session = getSession(sessionId);
    if (!roomId || !session || session.roomId !== roomId) {
      res.status(404).json({
        ok: false,
        error: "upload_session_not_found",
      });
      return;
    }
    if (session.provider !== "memory" && session.provider !== "disk") {
      res.status(400).json({
        ok: false,
        error: "direct_part_upload_not_supported",
      });
      return;
    }
    if (!Number.isFinite(partNumber) || partNumber <= 0) {
      res.status(400).json({
        ok: false,
        error: "invalid_part_number",
      });
      return;
    }

    try {
      const body = await readRequestBodyAsBuffer(req, RELAY_V2_MAX_PART_BYTES);
      if (!body || body.length <= 0) {
        res.status(400).json({
          ok: false,
          error: "empty_part_payload",
        });
        return;
      }
      const roundedPartNumber = Math.round(partNumber);
      const etag = `"${crypto.createHash("md5").update(body).digest("hex")}"`;
      session.parts.set(roundedPartNumber, {
        buffer: body,
        etag,
        size: body.length,
        updatedAt: nowMs(),
      });
      session.updatedAt = nowMs();
      metrics.uploadedBytes += body.length;
      emitMetricPartLatency(nowMs() - startedAt);
      res.setHeader("ETag", etag);
      res.status(200).end();
    } catch (error) {
      if (error?.code === "PAYLOAD_TOO_LARGE") {
        res.status(413).json({
          ok: false,
          error: "payload_too_large",
        });
        return;
      }
      res.status(500).json({
        ok: false,
        error: "direct_part_upload_failed",
        details: String(error?.message || "unknown"),
      });
    }
  });

  app.get("/api/relay/uploads/status", withCapability, async (req, res) => {
    if (!enforceRateLimitOrReply(req, res, "upload-status", 240)) {
      return;
    }

    const roomId = getRequestRoomId(req);
    const sessionId = normalizeRelayString(req.query?.sessionId, 96);
    const session = getSession(sessionId);
    if (!roomId || !session || session.roomId !== roomId) {
      res.status(404).json({
        ok: false,
        error: "upload_session_not_found",
      });
      return;
    }

    try {
      const uploadedParts = useS3 ? await listS3UploadedParts(session) : listMemoryUploadedParts(session);
      if (uploadedParts.length > 0 && !session.resumeReported) {
        session.resumeReported = true;
        metrics.resumeCount += 1;
      }
      session.updatedAt = nowMs();
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        sessionId: session.sessionId,
        uploadId: session.uploadId,
        objectKey: session.objectKey,
        size: session.size,
        chunkSize: session.chunkSize,
        uploadedParts,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: "upload_status_failed",
        details: String(error?.message || "unknown"),
      });
    }
  });

  app.post("/api/relay/uploads/complete", withCapability, async (req, res) => {
    if (!enforceRateLimitOrReply(req, res, "upload-complete", 120)) {
      return;
    }

    const roomId = getRequestRoomId(req);
    const sessionId = normalizeRelayString(req.body?.sessionId, 96);
    const session = getSession(sessionId);
    if (!roomId || !session || session.roomId !== roomId) {
      markMetric("complete", false);
      res.status(404).json({
        ok: false,
        error: "upload_session_not_found",
      });
      return;
    }

    const parts = sanitizeUploadedParts(
      Array.isArray(req.body?.parts)
        ? req.body.parts.map((item) => ({
            partNumber: item?.partNumber,
            etag: item?.etag,
          }))
        : []
    );
    if (parts.length === 0) {
      markMetric("complete", false);
      res.status(400).json({
        ok: false,
        error: "missing_upload_parts",
      });
      return;
    }

    try {
      if (useS3 && s3Client) {
        await s3Client.send(
          new CompleteMultipartUploadCommand({
            Bucket: s3Bucket,
            Key: session.objectKey,
            UploadId: session.uploadId,
            MultipartUpload: {
              Parts: parts.map((item) => ({
                ETag: item.etag,
                PartNumber: item.partNumber,
              })),
            },
          })
        );
      } else {
        const ordered = [];
        let totalBytes = 0;
        for (const part of parts) {
          const chunk = session.parts.get(part.partNumber);
          if (!chunk || !Buffer.isBuffer(chunk.buffer)) {
            throw new Error("missing_memory_part");
          }
          ordered.push(chunk.buffer);
          totalBytes += chunk.buffer.length;
        }
        const objectBody = Buffer.concat(ordered);
        memoryObjects.set(session.objectKey, {
          roomId: session.roomId,
          messageId: session.messageId,
          attachmentId: session.attachmentId,
          contentType: session.contentType,
          body: objectBody,
          createdAt: nowMs(),
          size: totalBytes,
        });
        const diskObjectPath = resolveDiskObjectPath(session.objectKey);
        if (!diskObjectPath) {
          throw new Error("invalid_object_storage_path");
        }
        await fs.promises.mkdir(path.dirname(diskObjectPath), { recursive: true });
        await fs.promises.writeFile(diskObjectPath, objectBody);
        const diskObjectMetadataPath = resolveDiskObjectMetaPath(diskObjectPath);
        if (diskObjectMetadataPath) {
          await fs.promises.writeFile(
            diskObjectMetadataPath,
            JSON.stringify({
              roomId: session.roomId,
              messageId: session.messageId,
              attachmentId: session.attachmentId,
              contentType: session.contentType,
              size: totalBytes,
              createdAt: nowMs(),
            }),
            "utf8"
          );
        }
      }

      deleteSession(session.sessionId);
      markMetric("complete", true);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        objectKey: session.objectKey,
        size: session.size,
        provider: useS3 ? "s3" : "disk",
      });
    } catch (error) {
      markMetric("complete", false);
      res.status(500).json({
        ok: false,
        error: "upload_complete_failed",
        details: String(error?.message || "unknown"),
      });
    }
  });

  app.post("/api/relay/uploads/abort", withCapability, async (req, res) => {
    if (!enforceRateLimitOrReply(req, res, "upload-abort", 120)) {
      return;
    }

    const roomId = getRequestRoomId(req);
    const sessionId = normalizeRelayString(req.body?.sessionId, 96);
    const session = getSession(sessionId);
    if (!roomId || !session || session.roomId !== roomId) {
      markMetric("abort", false);
      res.status(404).json({
        ok: false,
        error: "upload_session_not_found",
      });
      return;
    }

    try {
      if (useS3 && s3Client) {
        await s3Client.send(
          new AbortMultipartUploadCommand({
            Bucket: s3Bucket,
            Key: session.objectKey,
            UploadId: session.uploadId,
          })
        );
      }
      deleteSession(session.sessionId);
      markMetric("abort", true);
      res.json({
        ok: true,
      });
    } catch (error) {
      markMetric("abort", false);
      res.status(500).json({
        ok: false,
        error: "upload_abort_failed",
        details: String(error?.message || "unknown"),
      });
    }
  });

  function signDownloadToken(payload) {
    const encoded = base64UrlEncode(JSON.stringify(payload));
    const signature = base64UrlEncode(
      crypto.createHmac("sha256", downloadTokenSecret).update(encoded).digest()
    );
    return `${encoded}.${signature}`;
  }

  function verifyDownloadToken(token) {
    const text = String(token || "").trim();
    const [encodedPayload, encodedSignature] = text.split(".");
    if (!encodedPayload || !encodedSignature) {
      return null;
    }
    const expected = crypto.createHmac("sha256", downloadTokenSecret).update(encodedPayload).digest();
    let provided = null;
    try {
      provided = base64UrlDecodeToBuffer(encodedSignature);
    } catch {
      return null;
    }
    if (!safeTimingEqual(expected, provided)) {
      return null;
    }
    try {
      const payload = JSON.parse(base64UrlDecodeToBuffer(encodedPayload).toString("utf8"));
      const expiresAt = Number(payload?.expiresAt);
      if (!Number.isFinite(expiresAt) || nowMs() >= Math.round(expiresAt)) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  app.post("/api/relay/attachments/download-url", withCapability, async (req, res) => {
    if (!enforceRateLimitOrReply(req, res, "attachment-download-url", 240)) {
      return;
    }

    const roomId = getRequestRoomId(req);
    const objectKey = normalizeRelayString(req.body?.objectKey, 512);
    if (!roomId || !objectKey || !isObjectKeyAllowedForRoom(roomId, objectKey)) {
      markMetric("downloadUrl", false);
      res.status(400).json({
        ok: false,
        error: "invalid_object_key",
      });
      return;
    }

    try {
      if (useS3 && s3Client) {
        const signedUrl = await getSignedUrl(
          s3Client,
          new GetObjectCommand({
            Bucket: s3Bucket,
            Key: objectKey,
          }),
          {
            expiresIn: signedUrlTtlSeconds,
          }
        );
        markMetric("downloadUrl", true);
        res.setHeader("Cache-Control", "no-store");
        res.json({
          ok: true,
          provider: "s3",
          url: signedUrl,
          expiresAt: nowMs() + signedUrlTtlSeconds * 1000,
          rangeSupported: true,
        });
        return;
      }

      const cleanObjectKey = normalizeRelayString(objectKey, 512);
      let objectEntry = memoryObjects.get(cleanObjectKey) || null;
      if ((!objectEntry || objectEntry.roomId !== roomId) && !useS3) {
        objectEntry = await loadDiskObjectEntry(roomId, cleanObjectKey);
      }
      if (!objectEntry || objectEntry.roomId !== roomId) {
        markMetric("downloadUrl", false);
        res.status(404).json({
          ok: false,
          error: "attachment_not_found",
        });
        return;
      }

      const expiresAt = nowMs() + signedUrlTtlSeconds * 1000;
      const token = signDownloadToken({
        v: 1,
        roomId,
        objectKey: cleanObjectKey,
        expiresAt,
      });
      markMetric("downloadUrl", true);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        ok: true,
        provider: "disk",
        url: `/api/relay/objects/${encodeURIComponent(base64UrlEncode(cleanObjectKey))}?token=${encodeURIComponent(token)}`,
        expiresAt,
        rangeSupported: true,
      });
    } catch (error) {
      markMetric("downloadUrl", false);
      res.status(500).json({
        ok: false,
        error: "download_url_failed",
        details: String(error?.message || "unknown"),
      });
    }
  });

  app.get("/api/relay/objects/:encodedObjectKey", async (req, res) => {
    if (!relayModeEnabled) {
      res.status(404).end();
      return;
    }
    const tokenPayload = verifyDownloadToken(req.query?.token);
    if (!tokenPayload) {
      res.status(401).json({
        ok: false,
        error: "invalid_download_token",
      });
      return;
    }

    let objectKey = "";
    try {
      objectKey = base64UrlDecodeToBuffer(req.params?.encodedObjectKey).toString("utf8");
    } catch {
      res.status(400).json({
        ok: false,
        error: "invalid_object_key",
      });
      return;
    }
    objectKey = normalizeRelayString(objectKey, 512);
    const roomId = normalizeRoomIdValue(tokenPayload?.roomId);
    if (
      !roomId
      || tokenPayload.objectKey !== objectKey
      || !isObjectKeyAllowedForRoom(roomId, objectKey)
    ) {
      res.status(403).json({
        ok: false,
        error: "download_forbidden",
      });
      return;
    }

    let entry = memoryObjects.get(objectKey) || null;
    if (!entry || entry.roomId !== roomId) {
      entry = await loadDiskObjectEntry(roomId, objectKey);
    }
    if (!entry || entry.roomId !== roomId) {
      res.status(404).json({
        ok: false,
        error: "attachment_not_found",
      });
      return;
    }

    const rangeHeader = String(req.headers?.range || "").trim();
    const contentType = normalizeRelayAttachmentContentType(entry.contentType);

    if (Buffer.isBuffer(entry.body)) {
      const total = entry.body.length;
      if (!rangeHeader) {
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Length", String(total));
        res.setHeader("Accept-Ranges", "bytes");
        res.status(200).end(entry.body);
        return;
      }

      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader);
      if (!match) {
        res.status(416).end();
        return;
      }
      const startText = match[1];
      const endText = match[2];
      const start = startText ? Number(startText) : 0;
      const end = endText ? Number(endText) : total - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= total) {
        res.status(416).end();
        return;
      }
      const body = entry.body.subarray(start, end + 1);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", String(body.length));
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.status(206).end(body);
      return;
    }

    const diskBodyPath = normalizeRelayString(entry.bodyPath, 2048);
    if (!diskBodyPath) {
      res.status(404).json({
        ok: false,
        error: "attachment_not_found",
      });
      return;
    }

    let stat = null;
    try {
      stat = await fs.promises.stat(diskBodyPath);
    } catch {
      stat = null;
    }
    if (!stat || !stat.isFile()) {
      res.status(404).json({
        ok: false,
        error: "attachment_not_found",
      });
      return;
    }

    const total = Math.round(stat.size);
    if (!rangeHeader) {
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", String(total));
      res.setHeader("Accept-Ranges", "bytes");
      const stream = fs.createReadStream(diskBodyPath);
      stream.on("error", () => {
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader);
    if (!match) {
      res.status(416).end();
      return;
    }
    const startText = match[1];
    const endText = match[2];
    const start = startText ? Number(startText) : 0;
    const end = endText ? Number(endText) : total - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= total) {
      res.status(416).end();
      return;
    }
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(end - start + 1));
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
    res.status(206);
    const stream = fs.createReadStream(diskBodyPath, { start, end });
    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  });

  app.get("/api/relay/metrics", (req, res) => {
    if (!relayModeEnabled) {
      res.status(404).json({
        ok: false,
        error: "relay_mode_required",
      });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      provider: useS3 ? "s3" : "disk",
      capabilities: {
        ttlMs: capabilityTtlMs,
        signedUrlTtlSeconds,
      },
      limits: {
        maxFileBytes,
        maxTotalMessageBytes,
        chunkSizeBytes,
      },
      metrics: {
        initOk: metrics.initOk,
        initFail: metrics.initFail,
        partUrlOk: metrics.partUrlOk,
        partUrlFail: metrics.partUrlFail,
        completeOk: metrics.completeOk,
        completeFail: metrics.completeFail,
        abortOk: metrics.abortOk,
        abortFail: metrics.abortFail,
        downloadUrlOk: metrics.downloadUrlOk,
        downloadUrlFail: metrics.downloadUrlFail,
        uploadedBytes: metrics.uploadedBytes,
        resumeCount: metrics.resumeCount,
        tokenFail: metrics.tokenFail,
        partLatencyP95Ms: computeP95(metrics.partLatencyMs),
      },
    });
  });

  return {
    enabled: relayModeEnabled,
    provider: useS3 ? "s3" : "disk",
    limits: {
      maxFileBytes,
      maxTotalMessageBytes,
      chunkSizeBytes,
    },
    issueCapabilityToken: mintCapabilityToken,
  };
}

module.exports = {
  createRelayUploadsManager,
  RELAY_V2_MAX_FILE_BYTES,
  RELAY_V2_MAX_TOTAL_MESSAGE_BYTES,
  RELAY_V2_DEFAULT_CHUNK_SIZE,
};
