import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { normalizeRoomId, normalizeString } from "../protocol/runtime.mjs";

const MAX_FILE_BYTES = 10 * 1024 * 1024 * 1024;
const MAX_TOTAL_MESSAGE_BYTES = 10 * 1024 * 1024 * 1024;
const MAX_PARTS = 10000;
const MIN_PART_NUMBER = 1;
const MAX_PART_NUMBER = 10000;
const MEMORY_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function normalizePositiveNumber(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.round(numeric);
  }
  return fallback;
}

function normalizeMimeType(value) {
  const mimeType = String(value || "").trim().toLowerCase();
  if (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mimeType)) {
    return mimeType;
  }
  return "application/octet-stream";
}

function normalizeFileName(value) {
  const base = String(value || "file")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return base || "file";
}

function buildMemoryPartKey(sessionId, partNumber) {
  return `${sessionId}:${partNumber}`;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildObjectKey(roomId, messageId, attachmentId) {
  const cleanRoomId = normalizeRoomId(roomId) || "room";
  const cleanMessageId = normalizeString(messageId, 96) || randomUUID();
  const cleanAttachmentId = normalizeString(attachmentId, 96) || randomUUID();
  return `relay-v2/${cleanRoomId}/${cleanMessageId}/${cleanAttachmentId}`;
}

export class AttachmentService {
  constructor({ relayService } = {}) {
    this.relayService = relayService;
    this.sessions = new Map();
    this.memoryParts = new Map();
    this.memoryObjects = new Map();

    this.s3Bucket = String(process.env.RELAY_S3_BUCKET || "").trim();
    this.s3Region = String(process.env.RELAY_S3_REGION || "").trim();
    this.s3Endpoint = String(process.env.RELAY_S3_ENDPOINT || "").trim();
    this.s3ForcePathStyle = ["1", "true", "yes"].includes(
      String(process.env.RELAY_S3_FORCE_PATH_STYLE || "").trim().toLowerCase()
    );
    this.s3Client = null;

    this.maxFileBytes = normalizePositiveNumber(process.env.RELAY_V2_MAX_FILE_BYTES, MAX_FILE_BYTES);
    this.maxTotalMessageBytes = normalizePositiveNumber(
      process.env.RELAY_V2_MAX_TOTAL_MESSAGE_BYTES,
      MAX_TOTAL_MESSAGE_BYTES
    );
  }

  get provider() {
    return this.s3Bucket && this.s3Region ? "s3-v2" : "memory-v2";
  }

  get limits() {
    return {
      maxFileBytes: this.maxFileBytes,
      maxTotalMessageBytes: this.maxTotalMessageBytes,
      maxParts: MAX_PARTS,
    };
  }

  async init() {
    if (this.provider !== "s3-v2") {
      return;
    }

    this.s3Client = new S3Client({
      region: this.s3Region,
      ...(this.s3Endpoint ? { endpoint: this.s3Endpoint } : {}),
      forcePathStyle: this.s3ForcePathStyle,
    });
  }

  close() {
    this.sessions.clear();
    this.memoryParts.clear();
    this.memoryObjects.clear();
  }

  extractCapabilityToken(request) {
    const headerToken = String(request.headers["x-relay-capability-token"] || "").trim();
    if (headerToken) {
      return headerToken;
    }

    const bodyToken = String(request.body?.token || "").trim();
    if (bodyToken) {
      return bodyToken;
    }

    const queryToken = String(request.query?.token || "").trim();
    return queryToken;
  }

  assertCapability(request, roomId, authorId = "") {
    const token = this.extractCapabilityToken(request);
    return this.relayService.validateCapabilityToken({
      token,
      roomId,
      authorId,
    });
  }

  pruneExpired() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (!session || !Number.isFinite(session.createdAt) || now - session.createdAt > MEMORY_SESSION_TTL_MS) {
        this.sessions.delete(sessionId);
      }
    }
  }

  async initUpload(payload = {}) {
    this.pruneExpired();

    const roomId = normalizeRoomId(payload.roomId);
    const authorId = normalizeString(payload.authorId, 96);
    const messageId = normalizeString(payload.messageId, 96);
    const attachmentId = normalizeString(payload.attachmentId, 96);
    const fileName = normalizeFileName(payload.fileName || payload.name);
    const mimeType = normalizeMimeType(payload.mimeType);
    const totalBytes = Math.max(0, Math.round(Number(payload.totalBytes) || 0));
    const objectKey = normalizeString(payload.objectKey, 512) || buildObjectKey(roomId, messageId, attachmentId);

    if (!roomId || !authorId || !messageId || !attachmentId || !totalBytes) {
      return { ok: false, errorCode: "invalid_upload_init" };
    }
    if (totalBytes > this.maxFileBytes || totalBytes > this.maxTotalMessageBytes) {
      return { ok: false, errorCode: "payload_too_large" };
    }

    const sessionId = randomUUID();
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      roomId,
      authorId,
      messageId,
      attachmentId,
      fileName,
      mimeType,
      totalBytes,
      objectKey,
      provider: this.provider,
      uploadId: "",
      parts: new Map(),
      completed: false,
    };

    if (this.provider === "s3-v2") {
      const command = new CreateMultipartUploadCommand({
        Bucket: this.s3Bucket,
        Key: objectKey,
        ContentType: mimeType,
      });
      const response = await this.s3Client.send(command);
      session.uploadId = String(response.UploadId || "");
      if (!session.uploadId) {
        return { ok: false, errorCode: "s3_upload_init_failed" };
      }
    }

    this.sessions.set(sessionId, session);

    return {
      ok: true,
      sessionId,
      uploadId: session.uploadId,
      provider: session.provider,
      objectKey: session.objectKey,
      limits: this.limits,
    };
  }

  async getPartUrl(payload = {}, requestBaseUrl = "") {
    const roomId = normalizeRoomId(payload.roomId);
    const sessionId = normalizeString(payload.sessionId, 96);
    const partNumber = Math.round(Number(payload.partNumber) || 0);
    if (!roomId || !sessionId || !Number.isFinite(partNumber)) {
      return { ok: false, errorCode: "invalid_part_url_request" };
    }
    if (partNumber < MIN_PART_NUMBER || partNumber > MAX_PART_NUMBER) {
      return { ok: false, errorCode: "invalid_part_number" };
    }

    const session = this.sessions.get(sessionId);
    if (!session || session.roomId !== roomId || session.completed) {
      return { ok: false, errorCode: "upload_session_not_found" };
    }

    if (this.provider === "s3-v2") {
      const command = new UploadPartCommand({
        Bucket: this.s3Bucket,
        Key: session.objectKey,
        UploadId: session.uploadId,
        PartNumber: partNumber,
      });
      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 15 * 60 });
      return {
        ok: true,
        provider: "s3-v2",
        sessionId,
        partNumber,
        uploadUrl,
      };
    }

    const cleanBaseUrl = String(requestBaseUrl || "").replace(/\/+$/, "");
    const uploadUrl = `${cleanBaseUrl}/api/v2/relay/uploads/memory/${encodeURIComponent(sessionId)}/${partNumber}`;

    return {
      ok: true,
      provider: "memory-v2",
      sessionId,
      partNumber,
      uploadUrl,
    };
  }

  async completeUpload(payload = {}) {
    const roomId = normalizeRoomId(payload.roomId);
    const sessionId = normalizeString(payload.sessionId, 96);
    if (!roomId || !sessionId) {
      return { ok: false, errorCode: "invalid_upload_complete" };
    }

    const session = this.sessions.get(sessionId);
    if (!session || session.roomId !== roomId || session.completed) {
      return { ok: false, errorCode: "upload_session_not_found" };
    }

    if (this.provider === "s3-v2") {
      const parts = ensureArray(payload.parts)
        .map((part) => ({
          PartNumber: Math.round(Number(part?.partNumber) || 0),
          ETag: normalizeString(part?.eTag, 200),
        }))
        .filter((part) => part.PartNumber >= 1 && part.PartNumber <= 10000 && part.ETag)
        .sort((left, right) => left.PartNumber - right.PartNumber);

      if (parts.length === 0) {
        return { ok: false, errorCode: "missing_part_etags" };
      }

      await this.s3Client.send(new CompleteMultipartUploadCommand({
        Bucket: this.s3Bucket,
        Key: session.objectKey,
        UploadId: session.uploadId,
        MultipartUpload: {
          Parts: parts,
        },
      }));

      session.completed = true;
      return {
        ok: true,
        provider: "s3-v2",
        sessionId,
        objectKey: session.objectKey,
        size: session.totalBytes,
      };
    }

    const partNumbers = Array.from(session.parts.keys()).sort((left, right) => left - right);
    if (partNumbers.length === 0) {
      return { ok: false, errorCode: "no_uploaded_parts" };
    }

    const chunks = [];
    for (const partNumber of partNumbers) {
      const key = buildMemoryPartKey(session.id, partNumber);
      const chunk = this.memoryParts.get(key);
      if (!chunk) {
        return { ok: false, errorCode: "missing_memory_part" };
      }
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    this.memoryObjects.set(session.objectKey, {
      roomId: session.roomId,
      objectKey: session.objectKey,
      mimeType: session.mimeType,
      fileName: session.fileName,
      payload: buffer,
      size: buffer.byteLength,
      createdAt: Date.now(),
    });

    session.completed = true;

    return {
      ok: true,
      provider: "memory-v2",
      sessionId,
      objectKey: session.objectKey,
      size: buffer.byteLength,
    };
  }

  async abortUpload(payload = {}) {
    const roomId = normalizeRoomId(payload.roomId);
    const sessionId = normalizeString(payload.sessionId, 96);
    if (!roomId || !sessionId) {
      return { ok: false, errorCode: "invalid_upload_abort" };
    }

    const session = this.sessions.get(sessionId);
    if (!session || session.roomId !== roomId) {
      return { ok: false, errorCode: "upload_session_not_found" };
    }

    if (this.provider === "s3-v2" && session.uploadId) {
      await this.s3Client.send(new AbortMultipartUploadCommand({
        Bucket: this.s3Bucket,
        Key: session.objectKey,
        UploadId: session.uploadId,
      }));
    }

    for (const partNumber of session.parts.keys()) {
      this.memoryParts.delete(buildMemoryPartKey(session.id, partNumber));
    }

    this.sessions.delete(sessionId);
    return {
      ok: true,
      sessionId,
      roomId,
    };
  }

  getUploadStatus(payload = {}) {
    const roomId = normalizeRoomId(payload.roomId);
    const sessionId = normalizeString(payload.sessionId, 96);
    if (!roomId || !sessionId) {
      return { ok: false, errorCode: "invalid_upload_status" };
    }

    const session = this.sessions.get(sessionId);
    if (!session || session.roomId !== roomId) {
      return { ok: false, errorCode: "upload_session_not_found" };
    }

    return {
      ok: true,
      sessionId,
      roomId,
      provider: session.provider,
      objectKey: session.objectKey,
      completed: Boolean(session.completed),
      uploadedParts: Array.from(session.parts.keys()).sort((left, right) => left - right),
      totalBytes: session.totalBytes,
    };
  }

  async getDownloadUrl(payload = {}, requestBaseUrl = "") {
    const roomId = normalizeRoomId(payload.roomId);
    const objectKey = normalizeString(payload.objectKey, 512);
    if (!roomId || !objectKey) {
      return { ok: false, errorCode: "invalid_download_request" };
    }

    if (this.provider === "s3-v2") {
      const command = new GetObjectCommand({
        Bucket: this.s3Bucket,
        Key: objectKey,
      });
      const downloadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 15 * 60 });
      return {
        ok: true,
        provider: "s3-v2",
        objectKey,
        downloadUrl,
      };
    }

    const objectEntry = this.memoryObjects.get(objectKey);
    if (!objectEntry || objectEntry.roomId !== roomId) {
      return { ok: false, errorCode: "object_not_found" };
    }

    const cleanBaseUrl = String(requestBaseUrl || "").replace(/\/+$/, "");
    const downloadUrl = `${cleanBaseUrl}/api/v2/relay/uploads/memory/object/${encodeURIComponent(objectKey)}`;
    return {
      ok: true,
      provider: "memory-v2",
      objectKey,
      downloadUrl,
    };
  }

  async storeMemoryPart(sessionId, partNumber, requestBody) {
    const cleanSessionId = normalizeString(sessionId, 96);
    const cleanPartNumber = Math.round(Number(partNumber) || 0);
    if (!cleanSessionId || cleanPartNumber < 1 || cleanPartNumber > 10000) {
      return { ok: false, errorCode: "invalid_memory_part" };
    }

    const session = this.sessions.get(cleanSessionId);
    if (!session || session.completed || session.provider !== "memory-v2") {
      return { ok: false, errorCode: "upload_session_not_found" };
    }

    const buffer = Buffer.isBuffer(requestBody)
      ? requestBody
      : Buffer.from(requestBody || "");
    if (buffer.length === 0) {
      return { ok: false, errorCode: "empty_part" };
    }

    this.memoryParts.set(buildMemoryPartKey(session.id, cleanPartNumber), buffer);
    session.parts.set(cleanPartNumber, {
      size: buffer.byteLength,
      etag: crypto.createHash("sha1").update(buffer).digest("hex"),
    });

    return {
      ok: true,
      sessionId: session.id,
      partNumber: cleanPartNumber,
      etag: session.parts.get(cleanPartNumber).etag,
    };
  }

  getMemoryObject(objectKey) {
    const cleanObjectKey = normalizeString(objectKey, 512);
    if (!cleanObjectKey) {
      return null;
    }
    return this.memoryObjects.get(cleanObjectKey) || null;
  }
}
