import crypto from "node:crypto";
import {
  normalizeRoomId,
  normalizeString,
  sanitizeAttachmentRef,
  sanitizeRelayEnvelope,
} from "../protocol/runtime.mjs";

const CAPABILITY_TTL_MS = 10 * 60 * 1000;

export class RelayService {
  constructor() {
    this.capabilityTokens = new Map();
  }

  issueCapabilityToken({ roomId, connectionId, authorId }) {
    const cleanRoomId = normalizeRoomId(roomId);
    const cleanConnectionId = normalizeString(connectionId, 96);
    const cleanAuthorId = normalizeString(authorId, 96) || cleanConnectionId;

    if (!cleanRoomId || !cleanConnectionId || !cleanAuthorId) {
      return null;
    }

    const token = crypto.randomBytes(24).toString("base64url");
    const expiresAt = Date.now() + CAPABILITY_TTL_MS;

    this.capabilityTokens.set(token, {
      roomId: cleanRoomId,
      connectionId: cleanConnectionId,
      authorId: cleanAuthorId,
      expiresAt,
    });

    this.pruneExpiredTokens();
    return {
      token,
      expiresAt,
      roomId: cleanRoomId,
    };
  }

  validateCapabilityToken({ token, roomId, authorId = "" }) {
    const cleanToken = normalizeString(token, 256);
    const cleanRoomId = normalizeRoomId(roomId);
    const cleanAuthorId = normalizeString(authorId, 96);
    if (!cleanToken || !cleanRoomId) {
      return null;
    }

    const entry = this.capabilityTokens.get(cleanToken);
    if (!entry) {
      return null;
    }

    if (!Number.isFinite(entry.expiresAt) || Date.now() > entry.expiresAt) {
      this.capabilityTokens.delete(cleanToken);
      return null;
    }

    if (entry.roomId !== cleanRoomId) {
      return null;
    }

    if (cleanAuthorId && entry.authorId !== cleanAuthorId) {
      return null;
    }

    return {
      ...entry,
      token: cleanToken,
    };
  }

  sanitizeChatEnvelope(envelope) {
    return sanitizeRelayEnvelope(envelope);
  }

  sanitizeAttachmentReference(attachmentRef) {
    return sanitizeAttachmentRef(attachmentRef);
  }

  pruneExpiredTokens() {
    const now = Date.now();
    for (const [token, entry] of this.capabilityTokens.entries()) {
      if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
        this.capabilityTokens.delete(token);
      }
    }
  }
}
