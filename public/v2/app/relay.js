function syncNetworkModeSelector() {
  if (!profileNetworkSelect) {
    return;
  }

  const selectedNetworkMode = normalizeNetworkModeId(preferredNetworkModeId);
  profileNetworkSelect.innerHTML = "";

  for (const item of NETWORK_MODES) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = t(item.labelKey);
    profileNetworkSelect.appendChild(option);
  }

  profileNetworkSelect.value = selectedNetworkMode;
  profileNetworkSelect.disabled = !IS_ELECTRON_RUNTIME
    || networkModeRemoteBackendConfigured
    || networkModeEnvironmentLocked;

  if (profileNetworkNoteEl) {
    profileNetworkNoteEl.textContent = getNetworkModeNoteText();
  }
}

async function initializeNetworkModeSetting() {
  preferredNetworkModeId = DEFAULT_NETWORK_MODE_ID;
  networkModeRemoteBackendConfigured = false;
  networkModeEnvironmentLocked = false;

  if (!IS_ELECTRON_RUNTIME || !window.desktopApp?.getNetworkMode) {
    syncNetworkModeSelector();
    return;
  }

  try {
    const state = await window.desktopApp.getNetworkMode();
    preferredNetworkModeId = normalizeNetworkModeId(state?.mode);
    networkModeRemoteBackendConfigured = Boolean(state?.remoteBackendConfigured);
    networkModeEnvironmentLocked = Boolean(state?.environmentLocked);
  } catch {
    preferredNetworkModeId = DEFAULT_NETWORK_MODE_ID;
    networkModeRemoteBackendConfigured = false;
    networkModeEnvironmentLocked = false;
  }

  syncNetworkModeSelector();
}

function isRelayModeActive() {
  // V2 runtime always uses encrypted chat/attachment pipeline.
  return true;
}

function createRelayRequestId(prefix = "relay") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function delayMs(durationMs) {
  const timeout = Number(durationMs);
  return new Promise((resolve) => {
    setTimeout(resolve, Number.isFinite(timeout) && timeout > 0 ? Math.round(timeout) : 0);
  });
}

function buildRelayLocalAttachmentPreviewKey(roomId, messageId, attachmentId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const cleanMessageId = String(messageId || "").trim();
  const cleanAttachmentId = String(attachmentId || "").trim();
  if (!cleanRoomId || !cleanMessageId || !cleanAttachmentId) {
    return "";
  }
  return `${cleanRoomId}::${cleanMessageId}::${cleanAttachmentId}`;
}

function releaseRelayLocalAttachmentPreviewEntry(key) {
  const cleanKey = String(key || "").trim();
  if (!cleanKey) {
    return;
  }
  relayV2InlinePreviewFailedAt.delete(cleanKey);
  const entry = relayLocalAttachmentPreviewCache.get(cleanKey);
  if (!entry) {
    return;
  }
  const previewUrl = String(entry.url || "").trim();
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
  relayLocalAttachmentPreviewCache.delete(cleanKey);
}

function pruneRelayLocalAttachmentPreviewCache() {
  if (relayLocalAttachmentPreviewCache.size === 0) {
    return;
  }

  const now = Date.now();
  for (const [key, entry] of relayLocalAttachmentPreviewCache.entries()) {
    if (!entry || !Number.isFinite(entry.savedAt) || now - entry.savedAt > RELAY_LOCAL_PREVIEW_CACHE_TTL_MS) {
      releaseRelayLocalAttachmentPreviewEntry(key);
    }
  }

  if (relayLocalAttachmentPreviewCache.size <= RELAY_LOCAL_PREVIEW_CACHE_MAX_ENTRIES) {
    return;
  }

  const entriesByAge = Array.from(relayLocalAttachmentPreviewCache.entries())
    .sort((left, right) => {
      const leftSavedAt = Number(left?.[1]?.savedAt) || 0;
      const rightSavedAt = Number(right?.[1]?.savedAt) || 0;
      return leftSavedAt - rightSavedAt;
    });
  const overflow = relayLocalAttachmentPreviewCache.size - RELAY_LOCAL_PREVIEW_CACHE_MAX_ENTRIES;
  for (let index = 0; index < overflow; index += 1) {
    releaseRelayLocalAttachmentPreviewEntry(entriesByAge[index]?.[0] || "");
  }
}

function rememberRelayLocalAttachmentPreview(roomId, messageId, attachmentId, file, fallbackMeta = {}) {
  const cacheKey = buildRelayLocalAttachmentPreviewKey(roomId, messageId, attachmentId);
  if (!cacheKey || !(file instanceof Blob)) {
    return null;
  }

  const mimeType = normalizeChatAttachmentMimeType(
    file.type || fallbackMeta.mimeType
  );
  const name = String(file.name || fallbackMeta.name || "file").trim().slice(0, 120) || "file";
  const sizeValue = Number(file.size || fallbackMeta.size);
  const size = Number.isFinite(sizeValue) && sizeValue > 0 ? Math.round(sizeValue) : 0;
  const previewUrl = URL.createObjectURL(file);

  releaseRelayLocalAttachmentPreviewEntry(cacheKey);
  const entry = {
    url: previewUrl,
    name,
    mimeType,
    size,
    previewKind: getChatAttachmentPreviewKind(mimeType),
    savedAt: Date.now(),
  };
  relayLocalAttachmentPreviewCache.set(cacheKey, entry);
  pruneRelayLocalAttachmentPreviewCache();
  return entry;
}

function getRelayLocalAttachmentPreview(roomId, messageId, attachmentId) {
  const cacheKey = buildRelayLocalAttachmentPreviewKey(roomId, messageId, attachmentId);
  if (!cacheKey) {
    return null;
  }
  const entry = relayLocalAttachmentPreviewCache.get(cacheKey) || null;
  if (!entry) {
    return null;
  }
  if (!Number.isFinite(entry.savedAt) || Date.now() - entry.savedAt > RELAY_LOCAL_PREVIEW_CACHE_TTL_MS) {
    releaseRelayLocalAttachmentPreviewEntry(cacheKey);
    return null;
  }
  return entry;
}

function clearRelayLocalAttachmentPreviewsForMessage(roomId, messageId, keepAttachmentIds = null) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const cleanMessageId = String(messageId || "").trim();
  if (!cleanRoomId || !cleanMessageId || relayLocalAttachmentPreviewCache.size === 0) {
    return;
  }

  const keepSet = keepAttachmentIds instanceof Set
    ? keepAttachmentIds
    : Array.isArray(keepAttachmentIds)
      ? new Set(
        keepAttachmentIds
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      )
      : null;

  const prefix = `${cleanRoomId}::${cleanMessageId}::`;
  for (const key of Array.from(relayLocalAttachmentPreviewCache.keys())) {
    if (!key.startsWith(prefix)) {
      continue;
    }
    if (keepSet) {
      const attachmentId = key.slice(prefix.length);
      if (attachmentId && keepSet.has(attachmentId)) {
        continue;
      }
    }
    releaseRelayLocalAttachmentPreviewEntry(key);
  }
}

function clearAllRelayLocalAttachmentPreviews() {
  for (const key of Array.from(relayLocalAttachmentPreviewCache.keys())) {
    releaseRelayLocalAttachmentPreviewEntry(key);
  }
}

function estimatePayloadSize(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  } catch {
    return 0;
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64Value) {
  const text = String(base64Value || "").trim();
  if (!text) {
    return new Uint8Array(0);
  }
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeRelayEnvelopeShape(envelope, fallbackRoomId = "") {
  if (!envelope || typeof envelope !== "object") {
    return null;
  }

  const roomId = normalizeRoomIdValue(envelope.roomId || fallbackRoomId);
  const messageId = String(envelope.messageId || "").trim().slice(0, 96);
  const senderId = String(envelope.senderId || "").trim().slice(0, 96);
  const iv = String(envelope.iv || "").trim().slice(0, 128);
  const ciphertext = String(envelope.ciphertext || "").trim();
  const createdAt = Number(envelope.createdAt);
  const alg = String(envelope.alg || "").trim();
  const v = Number(envelope.v);
  const transportVersionRaw = Number(envelope.transportVersion);
  const transportVersion = transportVersionRaw === 2 ? 2 : 1;

  if (!roomId || !messageId || !senderId || !iv || !ciphertext) {
    return null;
  }
  if (alg !== RELAY_CRYPTO_ALGORITHM || v !== RELAY_CIPHER_VERSION) {
    return null;
  }
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    return null;
  }

  const attachmentRefs = Array.isArray(envelope.attachmentRefs)
    ? envelope.attachmentRefs
        .map((item) => ({
          messageId: String(item?.messageId || "").trim().slice(0, 96),
          attachmentId: String(item?.attachmentId || "").trim().slice(0, 96),
          transport: String(item?.transport || "").trim().toLowerCase() === RELAY_ATTACHMENT_TRANSPORT_S3_V2
            ? RELAY_ATTACHMENT_TRANSPORT_S3_V2
            : "",
          objectKey: String(item?.objectKey || "").trim().slice(0, 512),
          name: String(item?.name || "").trim().slice(0, 120),
          mimeType: normalizeChatAttachmentMimeType(item?.mimeType),
          size: Number.isFinite(Number(item?.size)) ? Math.max(0, Math.round(Number(item.size))) : 0,
        }))
        .filter((item) => {
          if (!item.messageId || !item.attachmentId) {
            return false;
          }
          if (item.transport === RELAY_ATTACHMENT_TRANSPORT_S3_V2 && !item.objectKey) {
            return false;
          }
          return true;
        })
        .slice(0, MAX_CHAT_ATTACHMENTS)
    : [];

  return {
    v: RELAY_CIPHER_VERSION,
    alg: RELAY_CRYPTO_ALGORITHM,
    roomId,
    messageId,
    senderId,
    transportVersion,
    createdAt: Math.round(createdAt),
    iv,
    ciphertext,
    attachmentRefs,
  };
}

function normalizeRelayAttachmentPayloadShape(payload, fallbackMessageId = "") {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const messageId = String(payload.messageId || fallbackMessageId || "").trim().slice(0, 96);
  const attachmentId = String(payload.attachmentId || "").trim().slice(0, 96);
  const iv = String(payload.iv || "").trim().slice(0, 128);
  const ciphertext = String(payload.ciphertext || "").trim();
  const name = String(payload.name || "file").trim().slice(0, 120) || "file";
  const mimeType = normalizeChatAttachmentMimeType(payload.mimeType);
  const size = Number.isFinite(Number(payload.size)) ? Math.max(0, Math.round(Number(payload.size))) : 0;

  if (!messageId || !attachmentId || !iv || !ciphertext) {
    return null;
  }

  return {
    messageId,
    attachmentId,
    iv,
    ciphertext,
    name,
    mimeType,
    size,
  };
}

function getRelayAttachmentSourceKey(roomId, messageId, attachmentId) {
  return `${roomId}::${messageId}::${attachmentId}`;
}

function registerRelayAttachmentSource(roomId, messageId, attachmentId, sourceId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const cleanMessageId = String(messageId || "").trim();
  const cleanAttachmentId = String(attachmentId || "").trim();
  const cleanSourceId = String(sourceId || "").trim();
  if (!cleanRoomId || !cleanMessageId || !cleanAttachmentId || !cleanSourceId) {
    return;
  }

  const key = getRelayAttachmentSourceKey(cleanRoomId, cleanMessageId, cleanAttachmentId);
  const existing = relayAttachmentSourceMap.get(key);
  if (existing instanceof Set) {
    existing.add(cleanSourceId);
    return;
  }
  relayAttachmentSourceMap.set(key, new Set([cleanSourceId]));
}

function getRelayAttachmentSources(roomId, messageId, attachmentId) {
  const key = getRelayAttachmentSourceKey(roomId, messageId, attachmentId);
  const known = relayAttachmentSourceMap.get(key);
  if (!(known instanceof Set)) {
    return [];
  }
  return Array.from(known).filter(Boolean);
}

function openRelayDatabase() {
  if (relayDatabasePromise) {
    return relayDatabasePromise;
  }

  relayDatabasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDBUnavailable"));
      return;
    }

    const request = indexedDB.open(RELAY_IDB_NAME, RELAY_IDB_VERSION);
    request.onerror = () => {
      reject(request.error || new Error("IndexedDBOpenFailed"));
    };
    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(RELAY_STORE_MESSAGES)) {
        const store = db.createObjectStore(RELAY_STORE_MESSAGES, { keyPath: "pk" });
        store.createIndex("roomId", "roomId", { unique: false });
        store.createIndex("roomCreatedAt", ["roomId", "createdAt"], { unique: false });
      }

      if (!db.objectStoreNames.contains(RELAY_STORE_ATTACHMENTS)) {
        const store = db.createObjectStore(RELAY_STORE_ATTACHMENTS, { keyPath: "pk" });
        store.createIndex("roomAttachment", ["roomId", "attachmentId"], { unique: true });
        store.createIndex("roomMessage", ["roomId", "messageId"], { unique: false });
      }

      if (!db.objectStoreNames.contains(RELAY_STORE_KEYS)) {
        db.createObjectStore(RELAY_STORE_KEYS, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(RELAY_STORE_UPLOADS)) {
        const store = db.createObjectStore(RELAY_STORE_UPLOADS, { keyPath: "pk" });
        store.createIndex("roomId", "roomId", { unique: false });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
  });

  return relayDatabasePromise;
}

async function relayDbPut(storeName, value) {
  const db = await openRelayDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(value);
    request.onerror = () => reject(request.error || new Error("IndexedDBPutFailed"));
    request.onsuccess = () => resolve(request.result);
  });
}

async function relayDbGet(storeName, key) {
  const db = await openRelayDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onerror = () => reject(request.error || new Error("IndexedDBGetFailed"));
    request.onsuccess = () => resolve(request.result || null);
  });
}

async function relayDbDelete(storeName, key) {
  const db = await openRelayDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);
    request.onerror = () => reject(request.error || new Error("IndexedDBDeleteFailed"));
    request.onsuccess = () => resolve();
  });
}

function relayMessagePk(roomId, messageId) {
  return `${roomId}::${messageId}`;
}

function relayAttachmentPk(roomId, attachmentId) {
  return `${roomId}::${attachmentId}`;
}

function relayUploadSessionPk(roomId, fileFingerprint) {
  return `${roomId}::${fileFingerprint}`;
}

function buildRelayUploadFileFingerprint(attachment) {
  const name = String(attachment?.name || "").trim().slice(0, 180);
  const size = Number(attachment?.size) || 0;
  const lastModified = Number(attachment?.file?.lastModified || attachment?.lastModified || 0);
  return `${name}::${size}::${Math.round(lastModified)}`;
}

function normalizeRelayUploadSessionEntry(entry = {}) {
  const roomId = normalizeRoomIdValue(entry.roomId);
  const fileFingerprint = String(entry.fileFingerprint || "").trim().slice(0, 512);
  const sessionId = String(entry.sessionId || "").trim().slice(0, 96);
  const uploadId = String(entry.uploadId || "").trim().slice(0, 256);
  const objectKey = String(entry.objectKey || "").trim().slice(0, 512);
  const fileKey = String(entry.fileKey || "").trim().slice(0, 256);
  const noncePrefix = String(entry.noncePrefix || "").trim().slice(0, 64);
  const messageId = String(entry.messageId || "").trim().slice(0, 96);
  const attachmentId = String(entry.attachmentId || "").trim().slice(0, 96);
  const chunkSize = Number(entry.chunkSize);
  const size = Number(entry.size);
  const totalChunks = Number(entry.totalChunks);
  const updatedAt = Number(entry.updatedAt);
  if (
    !roomId
    || !fileFingerprint
    || !sessionId
    || !uploadId
    || !objectKey
    || !fileKey
    || !noncePrefix
    || !messageId
    || !attachmentId
  ) {
    return null;
  }
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    return null;
  }
  if (!Number.isFinite(size) || size <= 0) {
    return null;
  }
  if (!Number.isFinite(totalChunks) || totalChunks <= 0) {
    return null;
  }

  return {
    pk: relayUploadSessionPk(roomId, fileFingerprint),
    roomId,
    fileFingerprint,
    sessionId,
    uploadId,
    objectKey,
    fileKey,
    noncePrefix,
    messageId,
    attachmentId,
    size: Math.round(size),
    chunkSize: Math.round(chunkSize),
    totalChunks: Math.round(totalChunks),
    mimeType: normalizeChatAttachmentMimeType(entry.mimeType),
    name: String(entry.name || "file").trim().slice(0, 120) || "file",
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? Math.round(updatedAt) : Date.now(),
  };
}

async function storeRelayUploadSessionEntry(entry) {
  const normalized = normalizeRelayUploadSessionEntry(entry);
  if (!normalized) {
    return;
  }
  await relayDbPut(RELAY_STORE_UPLOADS, normalized);
}

async function loadRelayUploadSessionEntry(roomId, fileFingerprint) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const cleanFingerprint = String(fileFingerprint || "").trim().slice(0, 512);
  if (!cleanRoomId || !cleanFingerprint) {
    return null;
  }
  return relayDbGet(RELAY_STORE_UPLOADS, relayUploadSessionPk(cleanRoomId, cleanFingerprint));
}

async function deleteRelayUploadSessionEntry(roomId, fileFingerprint) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const cleanFingerprint = String(fileFingerprint || "").trim().slice(0, 512);
  if (!cleanRoomId || !cleanFingerprint) {
    return;
  }
  await relayDbDelete(RELAY_STORE_UPLOADS, relayUploadSessionPk(cleanRoomId, cleanFingerprint));
}

async function loadRelayEnvelopeRecords(roomId, limit = RELAY_HISTORY_REPLAY_LIMIT) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId) {
    return [];
  }

  const db = await openRelayDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RELAY_STORE_MESSAGES, "readonly");
    const store = transaction.objectStore(RELAY_STORE_MESSAGES);
    const index = store.index("roomCreatedAt");
    const range = IDBKeyRange.bound([cleanRoomId, 0], [cleanRoomId, Number.MAX_SAFE_INTEGER]);
    const request = index.openCursor(range, "prev");
    const result = [];

    request.onerror = () => reject(request.error || new Error("IndexedDBCursorFailed"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || result.length >= limit) {
        resolve(result.reverse());
        return;
      }

      result.push(cursor.value);
      cursor.continue();
    };
  });
}

async function storeRelayEnvelopeRecord(roomId, envelope, sourceId = "") {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const normalizedEnvelope = normalizeRelayEnvelopeShape(envelope, cleanRoomId);
  if (!cleanRoomId || !normalizedEnvelope) {
    return;
  }

  await relayDbPut(RELAY_STORE_MESSAGES, {
    pk: relayMessagePk(cleanRoomId, normalizedEnvelope.messageId),
    roomId: cleanRoomId,
    messageId: normalizedEnvelope.messageId,
    createdAt: normalizedEnvelope.createdAt,
    sourceId: String(sourceId || "").trim(),
    envelope: normalizedEnvelope,
    savedAt: Date.now(),
  });
}

async function storeRelayAttachmentCipher(roomId, payload) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const normalized = normalizeRelayAttachmentPayloadShape(payload);
  if (!cleanRoomId || !normalized) {
    return;
  }

  await relayDbPut(RELAY_STORE_ATTACHMENTS, {
    pk: relayAttachmentPk(cleanRoomId, normalized.attachmentId),
    roomId: cleanRoomId,
    messageId: normalized.messageId,
    attachmentId: normalized.attachmentId,
    iv: normalized.iv,
    ciphertext: normalized.ciphertext,
    name: normalized.name,
    mimeType: normalized.mimeType,
    size: normalized.size,
    savedAt: Date.now(),
  });
}

async function loadRelayAttachmentCipher(roomId, attachmentId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const cleanAttachmentId = String(attachmentId || "").trim();
  if (!cleanRoomId || !cleanAttachmentId) {
    return null;
  }
  return relayDbGet(RELAY_STORE_ATTACHMENTS, relayAttachmentPk(cleanRoomId, cleanAttachmentId));
}

async function deleteRelayMessageRecord(roomId, messageId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const cleanMessageId = String(messageId || "").trim();
  if (!cleanRoomId || !cleanMessageId) {
    return;
  }

  await relayDbDelete(RELAY_STORE_MESSAGES, relayMessagePk(cleanRoomId, cleanMessageId));
  const db = await openRelayDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(RELAY_STORE_ATTACHMENTS, "readwrite");
    const store = transaction.objectStore(RELAY_STORE_ATTACHMENTS);
    const index = store.index("roomMessage");
    const range = IDBKeyRange.only([cleanRoomId, cleanMessageId]);
    const request = index.openCursor(range);

    request.onerror = () => reject(request.error || new Error("IndexedDBCursorFailed"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
  });

  const sourcePrefix = `${cleanRoomId}::${cleanMessageId}::`;
  for (const key of Array.from(relayAttachmentSourceMap.keys())) {
    if (key.startsWith(sourcePrefix)) {
      relayAttachmentSourceMap.delete(key);
    }
  }
}

async function getRelayWrappingKey() {
  const existing = await relayDbGet(RELAY_STORE_KEYS, RELAY_WRAPPING_KEY_META_ID);
  if (
    typeof CryptoKey !== "undefined"
    && existing?.cryptoKey instanceof CryptoKey
  ) {
    return existing.cryptoKey;
  }

  const cryptoKey = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["wrapKey", "unwrapKey"]
  );

  await relayDbPut(RELAY_STORE_KEYS, {
    key: RELAY_WRAPPING_KEY_META_ID,
    cryptoKey,
    createdAt: Date.now(),
  });

  return cryptoKey;
}

function relayRoomWrappedKeyMetaId(roomId) {
  return `room-wrap:${roomId}`;
}

async function persistWrappedRelayRoomKey(roomId, roomKey) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (
    !cleanRoomId
    || typeof CryptoKey === "undefined"
    || !(roomKey instanceof CryptoKey)
  ) {
    return;
  }

  const wrappingKey = await getRelayWrappingKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey(
    "raw",
    roomKey,
    wrappingKey,
    {
      name: "AES-GCM",
      iv,
    }
  );

  await relayDbPut(RELAY_STORE_KEYS, {
    key: relayRoomWrappedKeyMetaId(cleanRoomId),
    roomId: cleanRoomId,
    iv: arrayBufferToBase64(iv),
    wrappedKey: arrayBufferToBase64(wrapped),
    updatedAt: Date.now(),
  });
}

async function loadWrappedRelayRoomKey(roomId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId) {
    return null;
  }

  const wrapped = await relayDbGet(RELAY_STORE_KEYS, relayRoomWrappedKeyMetaId(cleanRoomId));
  if (!wrapped?.wrappedKey || !wrapped?.iv) {
    return null;
  }

  const wrappingKey = await getRelayWrappingKey();
  try {
    return await crypto.subtle.unwrapKey(
      "raw",
      base64ToUint8Array(wrapped.wrappedKey),
      wrappingKey,
      {
        name: "AES-GCM",
        iv: base64ToUint8Array(wrapped.iv),
      },
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );
  } catch {
    await relayDbDelete(RELAY_STORE_KEYS, relayRoomWrappedKeyMetaId(cleanRoomId));
    return null;
  }
}

async function deriveRelayRoomKey(roomId, accessCode) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const cleanAccessCode = String(accessCode || "").trim();
  if (!cleanRoomId || !cleanAccessCode) {
    return null;
  }

  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(cleanAccessCode),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: RELAY_KDF_HASH,
      iterations: RELAY_KDF_ITERATIONS,
      salt: encoder.encode(`qwerbentum-relay-v1:${cleanRoomId}`),
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

async function requestRelayRoomAccessCode(roomId) {
  const accessCode = await promptInput(
    t("relayAccessCodePrompt", {
      room: roomId,
    }),
    ""
  );
  if (accessCode === null) {
    return "";
  }
  return String(accessCode || "").trim();
}

async function ensureRelayRoomKey(roomId, { forcePrompt = false } = {}) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId) {
    return null;
  }

  if (!forcePrompt && relayRoomKeyCache.has(cleanRoomId)) {
    return relayRoomKeyCache.get(cleanRoomId);
  }

  if (!forcePrompt && relayKeyReadyPromiseByRoom.has(cleanRoomId)) {
    return relayKeyReadyPromiseByRoom.get(cleanRoomId);
  }

  const task = (async () => {
    if (!forcePrompt) {
      const cachedKey = await loadWrappedRelayRoomKey(cleanRoomId).catch(() => null);
      if (cachedKey) {
        relayRoomKeyCache.set(cleanRoomId, cachedKey);
        return cachedKey;
      }
    }

    const accessCode = await requestRelayRoomAccessCode(cleanRoomId);
    if (!accessCode) {
      setStatus(t("relayAccessCodeRequired"));
      return null;
    }

    const derivedKey = await deriveRelayRoomKey(cleanRoomId, accessCode);
    if (!derivedKey) {
      setStatus(t("roomKeyRequired"));
      return null;
    }

    relayRoomKeyCache.set(cleanRoomId, derivedKey);
    await persistWrappedRelayRoomKey(cleanRoomId, derivedKey).catch(() => {
      // no-op
    });
    return derivedKey;
  })();

  relayKeyReadyPromiseByRoom.set(cleanRoomId, task);
  try {
    return await task;
  } finally {
    relayKeyReadyPromiseByRoom.delete(cleanRoomId);
  }
}

async function getRelayRoomKeySilently(roomId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId) {
    return null;
  }

  if (relayRoomKeyCache.has(cleanRoomId)) {
    return relayRoomKeyCache.get(cleanRoomId);
  }

  const cachedKey = await loadWrappedRelayRoomKey(cleanRoomId).catch(() => null);
  if (!cachedKey) {
    return null;
  }

  relayRoomKeyCache.set(cleanRoomId, cachedKey);
  return cachedKey;
}

async function decryptRelayPayloadWithRoomKey(roomKey, ivBase64, ciphertextBase64) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToUint8Array(ivBase64),
    },
    roomKey,
    base64ToUint8Array(ciphertextBase64)
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(plaintext));
}

async function encryptRelayPayload(roomId, payload) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const roomKey = await ensureRelayRoomKey(cleanRoomId);
  if (!roomKey) {
    throw new Error("room_key_required");
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    roomKey,
    encoder.encode(JSON.stringify(payload ?? null))
  );

  return {
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(ciphertext),
  };
}

async function decryptRelayPayload(roomId, ivBase64, ciphertextBase64) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const roomKey = await ensureRelayRoomKey(cleanRoomId);
  if (!roomKey) {
    throw new Error("room_key_required");
  }

  return decryptRelayPayloadWithRoomKey(roomKey, ivBase64, ciphertextBase64);
}

async function encryptRelayAttachmentPayload(roomId, attachment) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const roomKey = await ensureRelayRoomKey(cleanRoomId);
  if (!roomKey) {
    throw new Error("room_key_required");
  }

  const buffer = await attachment.file.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    roomKey,
    buffer
  );

  return {
    iv: arrayBufferToBase64(iv),
    ciphertext: arrayBufferToBase64(ciphertext),
  };
}

async function decryptRelayAttachmentToBlob(roomId, attachmentCipher) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const roomKey = await ensureRelayRoomKey(cleanRoomId);
  if (!roomKey) {
    throw new Error("room_key_required");
  }

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToUint8Array(attachmentCipher.iv),
    },
    roomKey,
    base64ToUint8Array(attachmentCipher.ciphertext)
  );

  return new Blob([plaintext], {
    type: normalizeChatAttachmentMimeType(attachmentCipher.mimeType),
  });
}

function normalizeRelayCapabilityPayload(payload = {}) {
  const token = String(payload?.token || "").trim();
  const roomId = normalizeRoomIdValue(payload?.roomId);
  const expiresAt = Number(payload?.expiresAt);
  if (!token || !roomId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }
  return {
    token,
    roomId,
    expiresAt: Math.round(expiresAt),
  };
}

async function requestRelayCapabilityToken(roomId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId) {
    return null;
  }
  return new Promise((resolve) => {
    socket.emit("relay-capability-request", { roomId: cleanRoomId }, (response = {}) => {
      if (!response?.ok) {
        resolve(null);
        return;
      }
      resolve(normalizeRelayCapabilityPayload(response));
    });
  });
}

async function ensureRelayCapabilityToken(roomId, { forceRefresh = false } = {}) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId) {
    throw new Error("relay_room_required");
  }

  const now = Date.now();
  if (
    !forceRefresh
    && relayCapabilityToken
    && relayCapabilityRoomId === cleanRoomId
    && relayCapabilityTokenExpiresAt - 30 * 1000 > now
  ) {
    return relayCapabilityToken;
  }

  const issued = await requestRelayCapabilityToken(cleanRoomId);
  if (!issued?.token) {
    throw new Error("relay_capability_required");
  }

  relayCapabilityToken = issued.token;
  relayCapabilityTokenExpiresAt = issued.expiresAt;
  relayCapabilityRoomId = cleanRoomId;
  return relayCapabilityToken;
}

async function relayApiRequest(path, { method = "POST", body = null, roomId = "", retry = true } = {}) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const token = await ensureRelayCapabilityToken(cleanRoomId);
  const headers = {
    Authorization: `Bearer ${token}`,
    "x-relay-capability-token": token,
  };
  let requestBody = null;
  let payloadBody = body;
  if (body && typeof body === "object") {
    payloadBody = {
      ...body,
      token,
      capability: token,
    };
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(payloadBody);
  } else if (typeof body === "string") {
    requestBody = body;
  }

  let response = await fetch(path, {
    method,
    headers,
    body: requestBody,
  });
  if (response.status === 401 && retry) {
    const refreshed = await ensureRelayCapabilityToken(cleanRoomId, { forceRefresh: true });
    response = await fetch(path, {
      method,
      headers: {
        ...headers,
        Authorization: `Bearer ${refreshed}`,
        "x-relay-capability-token": refreshed,
      },
      body: payloadBody && typeof payloadBody === "object"
        ? JSON.stringify({
            ...payloadBody,
            token: refreshed,
            capability: refreshed,
          })
        : requestBody,
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.ok === false) {
    const errorMessage = String(payload?.error || payload?.message || `http_${response.status}`);
    const error = new Error(errorMessage);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function fetchBackendNetworkMode() {
  try {
    const response = await fetch("/api/v2/network-mode", {
      cache: "no-store",
    });
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    activeBackendNetworkMode = normalizeNetworkModeId(payload?.mode);
    const relayUploads = payload?.relayUploads;
    if (relayUploads && typeof relayUploads === "object") {
      relayUploadProvider = String(relayUploads.provider || "").trim() || relayUploadProvider;
      relayUploadLimits = {
        maxFileBytes: Number(relayUploads?.limits?.maxFileBytes) > 0
          ? Math.round(Number(relayUploads.limits.maxFileBytes))
          : relayUploadLimits.maxFileBytes,
        maxTotalMessageBytes: Number(relayUploads?.limits?.maxTotalMessageBytes) > 0
          ? Math.round(Number(relayUploads.limits.maxTotalMessageBytes))
          : relayUploadLimits.maxTotalMessageBytes,
        chunkSizeBytes: Number(relayUploads?.limits?.chunkSizeBytes) > 0
          ? Math.round(Number(relayUploads.limits.chunkSizeBytes))
          : relayUploadLimits.chunkSizeBytes,
      };
    }
  } catch {
    activeBackendNetworkMode = normalizeNetworkModeId(preferredNetworkModeId);
  }

  updateTopbarMeta();
  return activeBackendNetworkMode;
}

function normalizeSettingsTabId(value) {
  return String(value || "").trim().toLowerCase() === SETTINGS_TAB_NOTIFICATIONS_ID
    ? SETTINGS_TAB_NOTIFICATIONS_ID
    : SETTINGS_TAB_GENERAL_ID;
}

function setActiveSettingsTab(nextTabId) {
  activeSettingsTabId = normalizeSettingsTabId(nextTabId);

  const tabBindings = [
    [profileTabGeneralBtn, profileGeneralPanel, SETTINGS_TAB_GENERAL_ID],
    [profileTabNotificationsBtn, profileNotificationsPanel, SETTINGS_TAB_NOTIFICATIONS_ID],
  ];

  for (const [button, panel, tabId] of tabBindings) {
    const active = activeSettingsTabId === tabId;
    if (button) {
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    if (panel) {
      panel.classList.toggle("hidden", !active);
    }
  }
}

function loadStoredBooleanPreference(storageKey, defaultValue) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) {
      return defaultValue;
    }
    return raw === "1";
  } catch {
    return defaultValue;
  }
}

function persistStoredBooleanPreference(storageKey, value) {
  try {
    localStorage.setItem(storageKey, value ? "1" : "0");
  } catch {
    // no-op
  }
}

function loadNotificationsEnabledPreference() {
  return loadStoredBooleanPreference(PROFILE_NOTIFICATIONS_ENABLED_STORAGE_KEY, true);
}

function persistNotificationsEnabledPreference() {
  persistStoredBooleanPreference(PROFILE_NOTIFICATIONS_ENABLED_STORAGE_KEY, notificationsEnabled);
}

function loadNotificationsSavedRoomsPreference() {
  return loadStoredBooleanPreference(PROFILE_NOTIFICATIONS_SAVED_STORAGE_KEY, true);
}

function persistNotificationsSavedRoomsPreference() {
  persistStoredBooleanPreference(PROFILE_NOTIFICATIONS_SAVED_STORAGE_KEY, notificationsSavedRoomsEnabled);
}

function loadNotificationsMentionsPreference() {
  return loadStoredBooleanPreference(PROFILE_NOTIFICATIONS_MENTIONS_STORAGE_KEY, true);
}

function persistNotificationsMentionsPreference() {
  persistStoredBooleanPreference(PROFILE_NOTIFICATIONS_MENTIONS_STORAGE_KEY, notificationsMentionsEnabled);
}

function getExplicitProfileName() {
  return String(nameInput?.value || "")
    .trim()
    .slice(0, 32);
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatNotificationTextPreview(text) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return t("notificationMessageFallback");
  }
  if (normalized.length <= 140) {
    return normalized;
  }
  return `${normalized.slice(0, 137)}...`;
}

function messageMentionsCurrentProfile(message) {
  if (!notificationsMentionsEnabled) {
    return false;
  }

  const nickname = getExplicitProfileName();
  if (!nickname) {
    return false;
  }

  const text = String(message?.text || "").trim();
  if (!text) {
    return false;
  }

  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}_-])@${escapeRegExp(nickname)}(?=$|[^\\p{L}\\p{N}_-])`,
    "iu"
  );
  return pattern.test(text);
}

function hasNotificationChannelEnabled() {
  return notificationsEnabled && (notificationsSavedRoomsEnabled || notificationsMentionsEnabled);
}

function canUseDesktopNotifications() {
  return Boolean(IS_ELECTRON_RUNTIME && desktopNotificationsSupported && hasNotificationChannelEnabled());
}

function shouldAttemptDesktopNotificationNow() {
  return canUseDesktopNotifications() && (document.hidden || !document.hasFocus());
}

function syncNotificationControls() {
  if (profileTabGeneralBtn) {
    profileTabGeneralBtn.textContent = t("generalSettings");
  }
  if (profileTabNotificationsBtn) {
    profileTabNotificationsBtn.textContent = t("notificationsSettings");
  }
  if (notificationsEnabledLabelEl) {
    notificationsEnabledLabelEl.textContent = t("enableDesktopNotifications");
  }
  if (notificationsSavedLabelEl) {
    notificationsSavedLabelEl.textContent = t("notifySavedServerMessages");
  }
  if (notificationsMentionsLabelEl) {
    notificationsMentionsLabelEl.textContent = t("notifyMentions");
  }
  if (notificationsSupportNoteEl) {
    notificationsSupportNoteEl.textContent = t("notificationElectronOnly");
    notificationsSupportNoteEl.classList.toggle(
      "hidden",
      Boolean(IS_ELECTRON_RUNTIME && desktopNotificationsSupported)
    );
  }

  const notificationsUnavailable = !IS_ELECTRON_RUNTIME || !desktopNotificationsSupported;
  if (notificationsEnabledToggle) {
    notificationsEnabledToggle.checked = notificationsEnabled;
    notificationsEnabledToggle.disabled = notificationsUnavailable;
  }
  if (notificationsSavedToggle) {
    notificationsSavedToggle.checked = notificationsSavedRoomsEnabled;
    notificationsSavedToggle.disabled = notificationsUnavailable || !notificationsEnabled;
  }
  if (notificationsMentionsToggle) {
    notificationsMentionsToggle.checked = notificationsMentionsEnabled;
    notificationsMentionsToggle.disabled = notificationsUnavailable || !notificationsEnabled;
  }
}

function trimNotificationStateToSavedRooms() {
  const knownSavedRooms = new Set(savedRooms);
  for (const roomId of Array.from(notificationCheckpoints.keys())) {
    if (!knownSavedRooms.has(roomId)) {
      notificationCheckpoints.delete(roomId);
    }
  }

  if (notificationPreviewRoomId && !knownSavedRooms.has(notificationPreviewRoomId)) {
    notificationPreviewRoomId = "";
  }
}

function getNotificationCheckpoint(roomId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId) {
    return {
      roomId: "",
      lastSeenMessageId: "",
      lastSeenCreatedAt: 0,
    };
  }

  const stored = notificationCheckpoints.get(cleanRoomId);
  if (stored) {
    return {
      roomId: cleanRoomId,
      lastSeenMessageId: String(stored.lastSeenMessageId || ""),
      lastSeenCreatedAt: Number(stored.lastSeenCreatedAt) || 0,
    };
  }

  return {
    roomId: cleanRoomId,
    lastSeenMessageId: "",
    lastSeenCreatedAt: 0,
  };
}

function setNotificationCheckpoint(roomId, marker) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId || !marker) {
    return;
  }

  const nextMessageId = String(marker.id || marker.lastSeenMessageId || marker.latestMessageId || "").trim();
  const nextCreatedAt = Number(
    marker.createdAt || marker.lastSeenCreatedAt || marker.latestCreatedAt || 0
  );

  if (!nextMessageId && (!Number.isFinite(nextCreatedAt) || nextCreatedAt <= 0)) {
    return;
  }

  notificationCheckpoints.set(cleanRoomId, {
    lastSeenMessageId: nextMessageId,
    lastSeenCreatedAt: Number.isFinite(nextCreatedAt) && nextCreatedAt > 0
      ? Math.round(nextCreatedAt)
      : 0,
  });
}

function seedNotificationCheckpointFromMessages(roomId, messages) {
  const list = Array.isArray(messages) ? messages : [];
  let latestMessage = null;

  for (const message of list) {
    const normalizedMessage = normalizeNotificationMessagePayload(message, roomId);
    if (normalizedMessage) {
      latestMessage = normalizedMessage;
    }
  }

  if (latestMessage) {
    setNotificationCheckpoint(roomId, latestMessage);
  }
}

function normalizeNotificationMessagePayload(message, fallbackRoomId = "") {
  if (!message || typeof message !== "object") {
    return null;
  }

  const roomId = normalizeRoomIdValue(message.roomId || fallbackRoomId);
  const messageId = String(message.id || "").trim();
  if (!roomId || !messageId) {
    return null;
  }

  const createdAt = Number(message.createdAt);
  return {
    roomId,
    id: messageId,
    userId: String(message.userId || "").trim(),
    userName: String(message.userName || t("guest")).trim() || t("guest"),
    text: String(message.text || "").replace(/\s+/g, " ").trim(),
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? Math.round(createdAt) : Date.now(),
  };
}

function rememberProcessedNotificationMessageId(messageId) {
  const cleanMessageId = String(messageId || "").trim();
  if (!cleanMessageId) {
    return false;
  }
  if (processedNotificationMessageIdSet.has(cleanMessageId)) {
    return false;
  }

  processedNotificationMessageIdSet.add(cleanMessageId);
  processedNotificationMessageIds.push(cleanMessageId);

  while (processedNotificationMessageIds.length > MAX_PROCESSED_NOTIFICATION_IDS) {
    const removedId = processedNotificationMessageIds.shift();
    if (removedId) {
      processedNotificationMessageIdSet.delete(removedId);
    }
  }

  return true;
}

function isOwnNotificationMessage(message) {
  return Boolean(message?.userId && message.userId === CHAT_AUTHOR_ID);
}

function buildRealtimeNotificationPayload(message) {
  const preview = formatNotificationTextPreview(message?.text);
  const author = String(message?.userName || t("guest"));

  if (messageMentionsCurrentProfile(message)) {
    return {
      title: t("notificationMentionTitle", { room: message.roomId }),
      body: t("notificationMentionBody", {
        author,
        text: preview,
      }),
      kind: "mention",
    };
  }

  if (!notificationsSavedRoomsEnabled) {
    return null;
  }

  return {
    title: t("notificationMessageTitle", {
      room: message.roomId,
      author,
    }),
    body: preview,
    kind: "message",
  };
}

function buildPollingNotificationPayload(roomId, messages) {
  const visibleMessages = messages.filter((message) => !isOwnNotificationMessage(message));
  if (visibleMessages.length === 0) {
    return null;
  }

  const latestMention = notificationsMentionsEnabled
    ? [...visibleMessages].reverse().find((message) => messageMentionsCurrentProfile(message))
    : null;

  if (latestMention) {
    return {
      title: t("notificationMentionTitle", { room: roomId }),
      body: t("notificationMentionBody", {
        author: latestMention.userName || t("guest"),
        text: formatNotificationTextPreview(latestMention.text),
      }),
      kind: "mention",
      messageId: latestMention.id,
    };
  }

  if (!notificationsSavedRoomsEnabled) {
    return null;
  }

  const lastMessage = visibleMessages[visibleMessages.length - 1];
  return {
    title: t("notificationSummaryTitle", { room: roomId }),
    body: t("notificationSummaryBody", {
      count: visibleMessages.length,
      author: lastMessage.userName || t("guest"),
      text: formatNotificationTextPreview(lastMessage.text),
    }),
    kind: "summary",
    messageId: lastMessage.id,
  };
}

async function dispatchDesktopNotification(payload) {
  if (!shouldAttemptDesktopNotificationNow() || !window.desktopApp?.showDesktopNotification) {
    return false;
  }

  try {
    const result = await window.desktopApp.showDesktopNotification(payload);
    return Boolean(result?.shown);
  } catch {
    return false;
  }
}

function selectRoomFromNotification(roomId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId) {
    return;
  }

  notificationPreviewRoomId = cleanRoomId;
  if (roomInput) {
    roomInput.value = cleanRoomId;
  }
  if (!joined) {
    updateRoomLabels(cleanRoomId);
  }
  renderSavedRooms();
  setStatus(t("notificationSelectedServer", { room: cleanRoomId }));
}

async function handleRealtimeNotificationMessage(message, fallbackRoomId = "") {
  const normalizedMessage = normalizeNotificationMessagePayload(message, fallbackRoomId);
  if (!normalizedMessage) {
    return;
  }

  setNotificationCheckpoint(normalizedMessage.roomId, normalizedMessage);
  const isNewMessage = rememberProcessedNotificationMessageId(normalizedMessage.id);
  if (!isNewMessage || isOwnNotificationMessage(normalizedMessage)) {
    return;
  }

  const notificationPayload = buildRealtimeNotificationPayload(normalizedMessage);
  if (!notificationPayload) {
    return;
  }

  await dispatchDesktopNotification({
    roomId: normalizedMessage.roomId,
    messageId: normalizedMessage.id,
    kind: notificationPayload.kind,
    title: notificationPayload.title,
    body: notificationPayload.body,
  });
}

async function handleSavedRoomRelayEnvelopeNotification(payload = {}) {
  if (!isRelayModeActive()) {
    return;
  }

  const payloadRoomId = normalizeRoomIdValue(payload?.roomId);
  const normalizedEnvelope = normalizeRelayEnvelopeShape(payload?.envelope, payloadRoomId);
  if (!normalizedEnvelope) {
    return;
  }

  const roomId = normalizedEnvelope.roomId;
  if (joined && normalizeRoomIdValue(roomState?.id) === roomId) {
    return;
  }

  const sourceId = String(payload?.sourceId || "").trim();
  await storeRelayEnvelopeRecord(roomId, normalizedEnvelope, sourceId).catch(() => {
    // no-op
  });
  relayMessageEnvelopeCache.set(normalizedEnvelope.messageId, normalizedEnvelope);

  if (processedNotificationMessageIdSet.has(normalizedEnvelope.messageId)) {
    return;
  }

  const silentKey = await getRelayRoomKeySilently(roomId).catch(() => null);
  if (silentKey) {
    try {
      const decryptedPayload = await decryptRelayPayloadWithRoomKey(
        silentKey,
        normalizedEnvelope.iv,
        normalizedEnvelope.ciphertext
      );
      const relayMessage = decryptedPayload && typeof decryptedPayload === "object"
        ? decryptedPayload
        : {};
      await handleRealtimeNotificationMessage(
        {
          id: normalizedEnvelope.messageId,
          roomId,
          userId: String(relayMessage.userId || normalizedEnvelope.senderId || ""),
          userName: String(relayMessage.userName || t("guest")).trim() || t("guest"),
          text: String(relayMessage.text || ""),
          createdAt: normalizedEnvelope.createdAt,
        },
        roomId
      );
      return;
    } catch {
      // fallback to generic relay notification
    }
  }

  setNotificationCheckpoint(roomId, {
    id: normalizedEnvelope.messageId,
    createdAt: normalizedEnvelope.createdAt,
  });
  if (!rememberProcessedNotificationMessageId(normalizedEnvelope.messageId)) {
    return;
  }
  if (!notificationsEnabled || !notificationsSavedRoomsEnabled) {
    return;
  }

  await dispatchDesktopNotification({
    roomId,
    messageId: normalizedEnvelope.messageId,
    kind: "relay-fallback",
    title: t("notificationRelayFallbackTitle", { room: roomId }),
    body: t("notificationRelayFallbackBody"),
  });
}

async function processNotificationPollRoomSnapshot(roomSnapshot) {
  const roomId = normalizeRoomIdValue(roomSnapshot?.roomId);
  if (!roomId) {
    return;
  }

  const normalizedMessages = Array.isArray(roomSnapshot?.messages)
    ? roomSnapshot.messages
        .map((message) => normalizeNotificationMessagePayload(message, roomId))
        .filter(Boolean)
    : [];

  if (normalizedMessages.length === 0) {
    setNotificationCheckpoint(roomId, {
      latestMessageId: roomSnapshot?.latestMessageId,
      latestCreatedAt: roomSnapshot?.latestCreatedAt,
    });
    return;
  }

  const unseenMessages = [];
  for (const message of normalizedMessages) {
    if (rememberProcessedNotificationMessageId(message.id)) {
      unseenMessages.push(message);
    }
  }

  const latestMessage = normalizedMessages[normalizedMessages.length - 1];
  setNotificationCheckpoint(roomId, latestMessage);

  if (unseenMessages.length === 0) {
    return;
  }

  const notificationPayload = buildPollingNotificationPayload(roomId, unseenMessages);
  if (!notificationPayload) {
    return;
  }

  await dispatchDesktopNotification({
    roomId,
    messageId: notificationPayload.messageId || latestMessage.id,
    kind: notificationPayload.kind,
    title: notificationPayload.title,
    body: notificationPayload.body,
  });
}

function getWatchedNotificationRoomIds() {
  trimNotificationStateToSavedRooms();
  if (!canUseDesktopNotifications()) {
    return [];
  }
  return savedRooms
    .map((roomId) => normalizeRoomIdValue(roomId))
    .filter(Boolean)
    .slice(0, MAX_SAVED_ROOMS);
}

function syncSavedRoomNotificationWatchList() {
  socket.emit("watch-saved-rooms", {
    roomIds: getWatchedNotificationRoomIds(),
  });
}

function restartNotificationPolling() {
  if (notificationPollTimerId) {
    clearInterval(notificationPollTimerId);
    notificationPollTimerId = null;
  }

  if (!canUseDesktopNotifications() || isRelayModeActive() || savedRooms.length === 0) {
    return;
  }

  notificationPollTimerId = setInterval(() => {
    void performNotificationSync();
  }, NOTIFICATION_POLL_INTERVAL_MS);
}

async function performNotificationSync() {
  // V2 runtime relies on realtime saved-room events and does not use polling API.
  return;
}

function refreshNotificationAutomation({ sync = false } = {}) {
  syncNotificationControls();
  syncSavedRoomNotificationWatchList();
  restartNotificationPolling();

  if (sync && !isRelayModeActive()) {
    void performNotificationSync();
  }
}

async function initializeDesktopNotifications() {
  await fetchBackendNetworkMode();

  if (!IS_ELECTRON_RUNTIME || !window.desktopApp?.notificationsSupported) {
    desktopNotificationsSupported = false;
    syncNotificationControls();
    return;
  }

  try {
    desktopNotificationsSupported = Boolean(await window.desktopApp.notificationsSupported());
  } catch {
    desktopNotificationsSupported = false;
  }

  if (desktopNotificationActivationCleanup) {
    desktopNotificationActivationCleanup();
  }

  desktopNotificationActivationCleanup = window.desktopApp.onNotificationActivated((payload) => {
    selectRoomFromNotification(payload?.roomId);
  });

  syncNotificationControls();
  refreshNotificationAutomation({ sync: true });
}

async function initializeWindowChrome() {
  if (document?.body) {
    document.body.classList.toggle("is-electron-runtime", IS_ELECTRON_RUNTIME);
    document.body.classList.toggle("is-web-runtime", !IS_ELECTRON_RUNTIME);
  }

  const controlsEnabled = Boolean(window.desktopApp?.minimizeWindow && window.desktopApp?.closeWindow);
  if (windowMinimizeBtn) {
    windowMinimizeBtn.disabled = !controlsEnabled;
  }
  if (windowCloseBtn) {
    windowCloseBtn.disabled = !controlsEnabled;
  }

  if (!IS_ELECTRON_RUNTIME) {
    return;
  }
}

function applyStaticTranslations() {
  document.title = `${getProjectName()} · ${t("pageTitle")}`;
  document.documentElement.setAttribute(
    "lang",
    LANGUAGE_HTML_TAGS[normalizeLanguageId(preferredLanguageId)] || LANGUAGE_HTML_TAGS.en
  );

  if (serversRailEl) {
    serversRailEl.setAttribute("aria-label", t("ariaServersRail"));
  }
  if (savedRoomsListEl) {
    savedRoomsListEl.setAttribute("aria-label", t("ariaSavedServers"));
  }
  if (homeServerBtn) {
    homeServerBtn.title = getProjectName();
    homeServerBtn.setAttribute("aria-label", getProjectName());
    homeServerBtn.textContent = getProjectBadgeLabel();
  }
  if (addRoomBtn) {
    addRoomBtn.title = t("addServerTitle");
    addRoomBtn.setAttribute("aria-label", t("addServerTitle"));
  }
  if (windowChromeControlsEl) {
    windowChromeControlsEl.setAttribute("aria-label", t("windowControlsAria"));
  }
  if (windowMinimizeBtn) {
    const label = t("windowMinimize");
    windowMinimizeBtn.title = label;
    windowMinimizeBtn.setAttribute("aria-label", label);
  }
  if (windowCloseBtn) {
    const label = t("windowClose");
    windowCloseBtn.title = label;
    windowCloseBtn.setAttribute("aria-label", label);
  }
  if (topbarProfileBtn) {
    topbarProfileBtn.textContent = t("meBadge");
    topbarProfileBtn.title = t("profile");
    topbarProfileBtn.setAttribute("aria-label", t("profile"));
  }
  if (appTitleEl) {
    appTitleEl.textContent = getProjectName();
  }
  if (appSubtitleEl) {
    appSubtitleEl.textContent = t("appSubtitle");
  }
  if (joinHintEl) {
    joinHintEl.textContent = t("joinHint");
  }
  if (joinSelectedBtn) {
    joinSelectedBtn.textContent = t("joinSelectedServer");
  }
  if (micSensitivityLabelEl) {
    micSensitivityLabelEl.textContent = t("micSensitivity");
  }
  if (micSensitivityToggleBtn) {
    micSensitivityToggleBtn.title = t("micSensitivity");
    micSensitivityToggleBtn.setAttribute("aria-label", t("micSensitivity"));
  }
  if (leaveBtn) {
    setControlButtonIcon(leaveBtn, "logout", t("leaveServer"));
  }
  if (relayRoomKeyBtn) {
    setControlButtonIcon(relayRoomKeyBtn, "key", t("changeRoomKey"));
  }
  if (leaveVoiceBtn) {
    setControlButtonIcon(leaveVoiceBtn, "call_end", t("leaveVoiceChannel"));
  }
  if (statusLabelEl) {
    statusLabelEl.textContent = t("statusLabel");
  }
  if (textChannelsTitleEl) {
    textChannelsTitleEl.textContent = t("textChannels");
  }
  if (voiceRoomsTitleEl) {
    voiceRoomsTitleEl.textContent = t("voiceRooms");
  }
  if (addVoiceChannelBtn) {
    addVoiceChannelBtn.title = t("addVoiceRoom");
    addVoiceChannelBtn.setAttribute("aria-label", t("addVoiceRoom"));
  }
  updateTopbarMeta();
  if (chatSendBtn) {
    chatSendBtn.textContent = t("send");
  }
  if (chatAttachBtn) {
    chatAttachBtn.title = t("attachFiles");
    chatAttachBtn.setAttribute("aria-label", t("attachFiles"));
  }
  if (participantsTitleEl) {
    participantsTitleEl.textContent = t("participants");
  }
  if (screenHubTitleEl) {
    screenHubTitleEl.textContent = t("screenStage");
  }
  if (screenHubToggleBtn) {
    updateScreenHubToggleButton();
  }
  if (screenStageEmptyTextEl) {
    screenStageEmptyTextEl.textContent = t("screenStageEmpty");
  } else if (screenStageEmptyEl) {
    screenStageEmptyEl.textContent = t("screenStageEmpty");
  }
  if (screenStageEmptyTriggerBtn) {
    screenStageEmptyTriggerBtn.textContent = t("screenStageTriggerShare");
    screenStageEmptyTriggerBtn.setAttribute("aria-label", t("screenStageTriggerShareAria"));
  }
  if (screenStageLocalHintEl) {
    screenStageLocalHintEl.textContent = t("screenLocalPreviewHint");
  }
  if (screenStageLiveBadgeEl) {
    screenStageLiveBadgeEl.textContent = t("liveBadge");
  }
  if (screenStagePinBtn) {
    screenStagePinBtn.textContent = t("pin");
    screenStagePinBtn.setAttribute("aria-label", t("pinScreenStream"));
  }
  if (screenStageFullscreenBtn) {
    screenStageFullscreenBtn.textContent = t("fullscreen");
    screenStageFullscreenBtn.setAttribute("aria-label", t("openFullscreen"));
  }
  if (screenStageMuteBtn) {
    screenStageMuteBtn.textContent = t("muteAudio");
    screenStageMuteBtn.setAttribute("aria-label", t("muteThisScreenAudio"));
  }
  if (screenStageVolumeLabelEl) {
    screenStageVolumeLabelEl.textContent = t("musicVolume");
  }
  if (profileToggleBtn) {
    profileToggleBtn.title = t("profile");
    profileToggleBtn.textContent = t("meBadge");
  }
  if (profileTitleEl) {
    profileTitleEl.textContent = t("profile");
  }
  if (profileCloseBtn) {
    profileCloseBtn.setAttribute("aria-label", t("closeProfile"));
  }
  if (profileNicknameLabelEl) {
    profileNicknameLabelEl.textContent = t("nickname");
  }
  if (nameInput) {
    nameInput.placeholder = t("yourName");
  }
  if (profileMicLabelEl) {
    profileMicLabelEl.textContent = t("microphone");
  }
  if (profileSpeakerLabelEl) {
    profileSpeakerLabelEl.textContent = t("speakers");
  }
  if (profileThemeLabelEl) {
    profileThemeLabelEl.textContent = t("theme");
  }
  if (profileLanguageLabelEl) {
    profileLanguageLabelEl.textContent = t("language");
  }
  if (profileMotionLabelEl) {
    profileMotionLabelEl.textContent = t("motion");
  }
  if (profileBackgroundLabelEl) {
    profileBackgroundLabelEl.textContent = t("backgroundAnimation");
  }
  if (profileNetworkLabelEl) {
    profileNetworkLabelEl.textContent = t("networkMode");
  }
  if (profileNetworkNoteEl) {
    profileNetworkNoteEl.textContent = getNetworkModeNoteText();
  }
  updateWindowChromeMeta();
  syncNetworkModeSelector();
  syncNotificationControls();
  renderPendingChatAttachments();
}

function updateTopbarMeta() {
  if (topbarMetaEl) {
    topbarMetaEl.textContent = joined ? t("topbarMeta") : t("topbarMetaLobby");
  }

  const effectiveModeId = normalizeNetworkModeId(
    roomState?.networkMode || activeBackendNetworkMode || preferredNetworkModeId
  );
  const inVoiceChannel = Boolean(getCurrentVoiceChannelId(roomState));
  const currentVoiceChannel = inVoiceChannel
    ? getVoiceChannelsFromRoom(roomState).find(
      (channel) => String(channel?.id || "").trim() === getCurrentVoiceChannelId(roomState)
    ) || null
    : null;
  const membersCount = Array.isArray(roomState?.members) ? roomState.members.length : 0;

  if (topbarVoiceStateEl) {
    topbarVoiceStateEl.textContent = inVoiceChannel ? getVoiceRoomName(currentVoiceChannel) : "--";
  }
  if (topbarMembersCountEl) {
    topbarMembersCountEl.textContent = String(membersCount);
  }
  if (topbarNetworkModeEl) {
    topbarNetworkModeEl.textContent = getNetworkModeShortLabel(effectiveModeId);
  }
  if (topbarCryptoStateEl) {
    topbarCryptoStateEl.textContent = effectiveModeId === NETWORK_MODE_RELAY_ID ? "AES-GCM" : "PLAIN";
  }
  if (topbarVoiceStateWrapEl) {
    topbarVoiceStateWrapEl.classList.toggle("active", inVoiceChannel);
  }
  if (topbarNetworkChipEl) {
    topbarNetworkChipEl.dataset.mode = effectiveModeId;
  }
  if (topbarCryptoChipEl) {
    topbarCryptoChipEl.classList.toggle("secure", effectiveModeId === NETWORK_MODE_RELAY_ID);
  }
  updateWindowChromeMeta();
}

function applyLanguage(languageId, { persist = true, rerender = true } = {}) {
  preferredLanguageId = normalizeLanguageId(languageId);
  syncLanguageSelector();
  applyStaticTranslations();
  syncThemeSelector();
  syncMotionProfileSelector();
  syncBackgroundAnimationSelector();

  if (persist) {
    persistPreferredLanguageId();
  }

  if (!rerender) {
    return;
  }

  updateRoomLabels();
  updateMuteButtonLabel();
  updateScreenButton();
  renderVoiceChannels();
  renderSavedRooms();
  renderParticipants();
  renderScreens();
  renderChat();
  void refreshProfileDeviceSelectors();
}

function setProfilePanelOpen(nextOpen) {
  isProfilePanelOpen = Boolean(nextOpen);

  if (profilePanel) {
    profilePanel.classList.toggle("hidden", !isProfilePanelOpen);
    profilePanel.setAttribute("aria-hidden", String(!isProfilePanelOpen));
  }

  if (profileToggleBtn) {
    profileToggleBtn.setAttribute("aria-expanded", String(isProfilePanelOpen));
    profileToggleBtn.classList.toggle("active", isProfilePanelOpen);
  }
}

function normalizeThemeId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return DEFAULT_THEME_ID;
  }

  const found = PROFILE_THEMES.find((item) => item.id === raw);
  return found ? found.id : DEFAULT_THEME_ID;
}

function loadPreferredThemeId() {
  try {
    return normalizeThemeId(localStorage.getItem(PROFILE_THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function persistPreferredThemeId() {
  try {
    localStorage.setItem(PROFILE_THEME_STORAGE_KEY, preferredThemeId);
  } catch {
    // no-op
  }
}

function syncThemeSelector() {
  if (!profileThemeSelect) {
    return;
  }

  profileThemeSelect.innerHTML = "";
  for (const item of PROFILE_THEMES) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = t(item.labelKey);
    profileThemeSelect.appendChild(option);
  }

  profileThemeSelect.value = normalizeThemeId(preferredThemeId);
}

function applyTheme(themeId, { persist = true } = {}) {
  preferredThemeId = normalizeThemeId(themeId);
  document.documentElement.setAttribute("data-theme", preferredThemeId);
  syncThemeSelector();

  if (persist) {
    persistPreferredThemeId();
  }
}

function getDeviceLabel(device, index, fallbackPrefix) {
  const label = String(device?.label || "").trim();
  if (label) {
    return label;
  }
  return `${fallbackPrefix} ${index + 1}`;
}

function syncDeviceSelectOptions(selectEl, devices, selectedDeviceId, defaultLabel, fallbackPrefix) {
  if (!selectEl) {
    return;
  }

  const currentSelected = normalizeDeviceId(selectedDeviceId);
  selectEl.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = defaultLabel;
  selectEl.appendChild(defaultOption);

  for (let index = 0; index < devices.length; index += 1) {
    const device = devices[index];
    const option = document.createElement("option");
    option.value = normalizeDeviceId(device.deviceId);
    option.textContent = getDeviceLabel(device, index, fallbackPrefix);
    selectEl.appendChild(option);
  }

  const hasSelected =
    Boolean(currentSelected) &&
    devices.some((device) => normalizeDeviceId(device.deviceId) === currentSelected);

  if (hasSelected) {
    selectEl.value = currentSelected;
    return;
  }

  if (currentSelected) {
    const savedOption = document.createElement("option");
    savedOption.value = currentSelected;
    savedOption.textContent = t("deviceSavedUnavailable", { device: fallbackPrefix });
    selectEl.appendChild(savedOption);
    selectEl.value = currentSelected;
    return;
  }

  selectEl.value = "";
}

function browserSupportsAudioOutputSelection() {
  return (
    typeof HTMLMediaElement !== "undefined" &&
    "setSinkId" in HTMLMediaElement.prototype
  );
}

async function applyPreferredSpeakerToAudioElement(audioEl) {
  if (
    !audioEl ||
    !browserSupportsAudioOutputSelection() ||
    typeof audioEl.setSinkId !== "function"
  ) {
    return;
  }

  const sinkId = preferredSpeakerDeviceId || "default";

  try {
    await audioEl.setSinkId(sinkId);
  } catch {
    // Browser may deny output switch without explicit permission.
  }
}

async function applyPreferredSpeakerToAllOutputs() {
  if (!remoteAudios) {
    return;
  }

  const audios = Array.from(remoteAudios.querySelectorAll("audio"));
  for (const audio of audios) {
    await applyPreferredSpeakerToAudioElement(audio);
  }
}
