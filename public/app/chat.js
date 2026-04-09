
async function completeRelayAttachmentRequest(requestId) {
  const entry = relayAttachmentRequestMap.get(requestId);
  if (!entry) {
    return;
  }

  clearRelayAttachmentRequestTimeout(entry);
  relayAttachmentRequestMap.delete(requestId);
  const ordered = entry.chunks
    .filter((item) => typeof item === "string")
    .join("");
  if (!ordered || !entry.iv) {
    reportAttachmentSourceUnavailable("peer_payload_invalid", {
      requestId: String(requestId || "").trim(),
      roomId: String(entry?.roomId || "").trim(),
      messageId: String(entry?.messageId || "").trim(),
      attachmentId: String(entry?.attachmentId || "").trim(),
      hasCiphertext: Boolean(ordered),
      hasIv: Boolean(entry?.iv),
    });
    return;
  }

  await storeRelayAttachmentCipher(entry.roomId, {
    messageId: entry.messageId,
    attachmentId: entry.attachmentId,
    iv: entry.iv,
    ciphertext: ordered,
    name: entry.name || "file",
    mimeType: normalizeChatAttachmentMimeType(entry.mimeType),
    size: Number(entry.size) || 0,
  });

  const hydrated = await hydrateRelayAttachmentUrl(
    entry.roomId,
    entry.messageId,
    entry.attachmentId
  );
  if (hydrated) {
    renderChat();
  }
}

async function handleRelayAttachmentResponse(payload) {
  const cleanRequestId = String(payload?.requestId || "").trim();
  if (!cleanRequestId || !relayAttachmentRequestMap.has(cleanRequestId)) {
    return;
  }

  const entry = relayAttachmentRequestMap.get(cleanRequestId);
  const cleanTargetId = String(payload?.targetId || "").trim();
  if (cleanTargetId && selfId && cleanTargetId !== selfId) {
    return;
  }
  const cleanSourceId = String(payload?.sourceId || "").trim();
  if (cleanSourceId && entry.activeSourceId && cleanSourceId !== entry.activeSourceId) {
    return;
  }

  if (payload?.error) {
    console.error("relay_attachment_response_error", {
      requestId: cleanRequestId,
      sourceId: cleanSourceId,
      targetId: cleanTargetId,
      error: String(payload.error || ""),
    });
    clearRelayAttachmentRequestTimeout(entry);
    const nextSourceId = Array.isArray(entry.pendingSources) ? entry.pendingSources.shift() : "";
    if (nextSourceId) {
      await emitRelayAttachmentRequestForSource(cleanRequestId, nextSourceId);
      return;
    }
    markRelayAttachmentRequestFailed(cleanRequestId, {
      reasonCode: "peer_response_error",
      peerError: String(payload.error || ""),
      sourceId: cleanSourceId,
    });
    return;
  }

  const chunk = payload?.chunk;
  if (!chunk || typeof chunk !== "object") {
    return;
  }

  const chunkIndex = Number(chunk.chunkIndex);
  const totalChunks = Number(chunk.totalChunks);
  if (!Number.isFinite(chunkIndex) || chunkIndex < 0 || !Number.isFinite(totalChunks) || totalChunks <= 0) {
    return;
  }

  scheduleRelayAttachmentRequestTimeout(cleanRequestId);
  entry.chunks[chunkIndex] = String(chunk.chunk || "");
  if (!entry.iv && chunk.iv) {
    entry.iv = String(chunk.iv || "");
  }
  if (chunk.name) {
    entry.name = String(chunk.name || "file");
  }
  if (chunk.mimeType) {
    entry.mimeType = normalizeChatAttachmentMimeType(chunk.mimeType);
  }
  if (Number.isFinite(Number(chunk.size)) && Number(chunk.size) >= 0) {
    entry.size = Math.round(Number(chunk.size));
  }

  const haveAllChunks = entry.chunks.filter((item) => typeof item === "string").length >= totalChunks;
  if (Boolean(chunk.eof) && haveAllChunks) {
    await completeRelayAttachmentRequest(cleanRequestId);
  }
}

function buildChatAttachmentCaption(attachment) {
  const sizeLabel = attachment.size > 0 ? formatFileSize(attachment.size) : "";
  return sizeLabel ? `${attachment.name} (${sizeLabel})` : attachment.name;
}

function hasRelayV2AttachmentEnvelopeRef(attachment, messageId = "", roomId = "") {
  const cleanAttachmentId = String(attachment?.id || "").trim();
  const cleanMessageId = String(messageId || attachment?.messageId || "").trim();
  if (!cleanAttachmentId || !cleanMessageId) {
    return false;
  }
  const envelope = relayMessageEnvelopeCache.get(cleanMessageId);
  if (!envelope || typeof envelope !== "object") {
    return false;
  }
  const envelopeRoomId = normalizeRoomIdValue(envelope.roomId);
  const expectedRoomId = normalizeRoomIdValue(roomId || attachment?.roomId || roomState?.id);
  if (expectedRoomId && envelopeRoomId && envelopeRoomId !== expectedRoomId) {
    return false;
  }
  if (!Array.isArray(envelope.attachmentRefs)) {
    return false;
  }
  return envelope.attachmentRefs.some(
    (item) =>
      String(item?.attachmentId || "").trim() === cleanAttachmentId
      && String(item?.transport || "").trim() === RELAY_ATTACHMENT_TRANSPORT_S3_V2
      && Boolean(String(item?.objectKey || "").trim())
  );
}

function canTreatAttachmentAsRelayV2(attachment, messageId = "", roomId = "") {
  if (String(attachment?.transport || "").trim() === RELAY_ATTACHMENT_TRANSPORT_S3_V2) {
    return true;
  }
  return hasRelayV2AttachmentEnvelopeRef(attachment, messageId, roomId);
}

async function tryHydrateRelayV2AttachmentMetaFromEnvelope(attachment, messageId = "", roomId = "") {
  if (!attachment || typeof attachment !== "object") {
    return false;
  }
  const cleanAttachmentId = String(attachment.id || "").trim();
  const cleanMessageId = String(messageId || attachment.messageId || "").trim();
  if (!cleanAttachmentId || !cleanMessageId) {
    return false;
  }

  const envelope = relayMessageEnvelopeCache.get(cleanMessageId);
  if (!envelope || typeof envelope !== "object") {
    return false;
  }
  const envelopeRoomId = normalizeRoomIdValue(envelope.roomId);
  const expectedRoomId = normalizeRoomIdValue(roomId || attachment.roomId || roomState?.id || envelopeRoomId);
  if (!expectedRoomId || !envelopeRoomId || envelopeRoomId !== expectedRoomId) {
    return false;
  }
  if (!Array.isArray(envelope.attachmentRefs) || envelope.attachmentRefs.length === 0) {
    return false;
  }
  const ref = envelope.attachmentRefs.find(
    (item) =>
      String(item?.attachmentId || "").trim() === cleanAttachmentId
      && String(item?.transport || "").trim() === RELAY_ATTACHMENT_TRANSPORT_S3_V2
      && Boolean(String(item?.objectKey || "").trim())
  );
  if (!ref) {
    return false;
  }

  attachment.transport = RELAY_ATTACHMENT_TRANSPORT_S3_V2;
  attachment.objectKey = String(ref.objectKey || "").trim();
  attachment.messageId = cleanMessageId;
  attachment.roomId = expectedRoomId;
  attachment.encrypted = true;
  attachment.name = String(attachment.name || ref.name || "file").trim().slice(0, 120) || "file";
  attachment.mimeType = normalizeChatAttachmentMimeType(attachment.mimeType || ref.mimeType);
  const refSize = Number(ref.size);
  if ((!Number.isFinite(Number(attachment.size)) || Number(attachment.size) <= 0) && Number.isFinite(refSize) && refSize > 0) {
    attachment.size = Math.round(refSize);
  }

  const hasChunkCryptoMeta = (
    String(attachment.fileKey || "").trim()
    && String(attachment.noncePrefix || "").trim()
    && Number(attachment.chunkSize) > 0
    && Number(attachment.totalChunks) > 0
  );
  if (!hasChunkCryptoMeta) {
    try {
      const payload = await decryptRelayPayload(
        envelopeRoomId,
        String(envelope.iv || ""),
        String(envelope.ciphertext || "")
      );
      const attachmentMeta = Array.isArray(payload?.attachmentsV2)
        ? payload.attachmentsV2
            .map((item) => normalizeRelayV2AttachmentMeta(item, cleanMessageId))
            .find((item) => item && item.attachmentId === cleanAttachmentId)
        : null;
      if (attachmentMeta) {
        attachment.fileKey = String(attachmentMeta.fileKey || "").trim();
        attachment.noncePrefix = String(attachmentMeta.noncePrefix || "").trim();
        attachment.chunkSize = Number(attachmentMeta.chunkSize) || 0;
        attachment.totalChunks = Number(attachmentMeta.totalChunks) || 0;
        attachment.objectKey = String(attachmentMeta.objectKey || attachment.objectKey || "").trim();
        if (Number(attachmentMeta.size) > 0) {
          attachment.size = Math.round(Number(attachmentMeta.size));
        }
        if (String(attachmentMeta.name || "").trim()) {
          attachment.name = String(attachmentMeta.name || "").trim().slice(0, 120);
        }
        if (String(attachmentMeta.mimeType || "").trim()) {
          attachment.mimeType = normalizeChatAttachmentMimeType(attachmentMeta.mimeType);
        }
      }
    } catch {
      // no-op: keep ref-based metadata, download path will report missing crypto fields if needed
    }
  }

  const normalizedMessage = getChatMessageById(cleanMessageId);
  if (normalizedMessage && Array.isArray(normalizedMessage.attachments)) {
    const target = normalizedMessage.attachments.find((item) => String(item?.id || "").trim() === cleanAttachmentId);
    if (target && target !== attachment) {
      Object.assign(target, {
        transport: attachment.transport,
        objectKey: attachment.objectKey,
        fileKey: attachment.fileKey,
        noncePrefix: attachment.noncePrefix,
        chunkSize: attachment.chunkSize,
        totalChunks: attachment.totalChunks,
        roomId: attachment.roomId,
        messageId: attachment.messageId,
        encrypted: true,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
      });
    }
  }

  return attachment.transport === RELAY_ATTACHMENT_TRANSPORT_S3_V2 && Boolean(String(attachment.objectKey || "").trim());
}

function isInlineBlobLikeUrl(url) {
  const cleanUrl = String(url || "").trim().toLowerCase();
  return cleanUrl.startsWith("blob:") || cleanUrl.startsWith("data:");
}

function createChatAttachmentElement(attachment, messageId = "", roomId = "") {
  const wrapper = document.createElement("div");
  wrapper.className = "chat-attachment";

  if (attachment.encrypted && !attachment.url) {
    const isRelayV2Attachment = canTreatAttachmentAsRelayV2(attachment, messageId, roomId);
    const canInlinePreview = isRelayV2Attachment && canAttemptRelayInlinePreview(attachment);
    if (canInlinePreview) {
      const attachmentRoomId = normalizeRoomIdValue(attachment.roomId || roomId || roomState?.id);
      const attachmentMessageId = String(messageId || attachment.messageId || "").trim();
      void hydrateRelayV2AttachmentInlinePreview(
        attachment,
        attachmentMessageId,
        attachmentRoomId
      );
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-attachment-file-link";
    button.textContent = isRelayV2Attachment
      ? t("downloadEncryptedAttachment")
      : t("legacyRelayAttachmentButton");
    button.setAttribute(
      "aria-label",
      isRelayV2Attachment ? t("downloadEncryptedAttachment") : t("legacyRelayAttachmentButton")
    );
    button.dataset.transport = isRelayV2Attachment ? RELAY_ATTACHMENT_TRANSPORT_S3_V2 : "legacy";
    button.dataset.attachmentId = String(attachment?.id || "").trim();
    button.dataset.messageId = String(messageId || attachment?.messageId || "").trim();
    if (!isRelayV2Attachment) {
      button.classList.add("chat-attachment-legacy-btn");
      button.title = t("legacyRelayAttachmentUnsupported");
    }
    button.addEventListener("click", async () => {
      const attachmentRoomId = normalizeRoomIdValue(attachment.roomId || roomId || roomState?.id);
      const attachmentMessageId = String(messageId || attachment.messageId || "").trim();
      const hydratedV2 = await tryHydrateRelayV2AttachmentMetaFromEnvelope(
        attachment,
        attachmentMessageId,
        attachmentRoomId
      );
      const isRelayV2Now = hydratedV2 || canTreatAttachmentAsRelayV2(attachment, attachmentMessageId, attachmentRoomId);
      if (!isRelayV2Now) {
        reportLegacyRelayAttachmentUnsupported(attachment, roomId);
        return;
      }
      console.info("attachment_download_click", {
        roomId: attachmentRoomId,
        messageId: attachmentMessageId,
        attachmentId: String(attachment?.id || "").trim(),
        transport: String(attachment?.transport || "").trim(),
        hasObjectKey: Boolean(String(attachment?.objectKey || "").trim()),
        hasFileKey: Boolean(String(attachment?.fileKey || "").trim()),
        hasNoncePrefix: Boolean(String(attachment?.noncePrefix || "").trim()),
      });
      void downloadRelayV2Attachment(
        attachment,
        attachmentRoomId
      );
    });
    wrapper.appendChild(button);

    const caption = document.createElement("p");
    caption.className = "chat-attachment-caption";
    caption.textContent = buildChatAttachmentCaption(attachment);
    wrapper.appendChild(caption);
    return wrapper;
  }

  if (attachment.previewKind === "image") {
    const image = document.createElement("img");
    image.src = attachment.url;
    image.loading = "lazy";
    image.alt = t("attachmentImageLabel", { name: attachment.name });

    if (isInlineBlobLikeUrl(attachment.url)) {
      wrapper.appendChild(image);
    } else {
      const link = document.createElement("a");
      link.href = attachment.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.appendChild(image);
      wrapper.appendChild(link);
    }
  } else if (attachment.previewKind === "video") {
    const video = document.createElement("video");
    video.src = attachment.url;
    video.controls = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.setAttribute("aria-label", t("attachmentVideoLabel", { name: attachment.name }));
    wrapper.appendChild(video);
  } else {
    const fileLink = document.createElement("a");
    fileLink.className = "chat-attachment-file-link";
    fileLink.href = attachment.url;
    if (!isInlineBlobLikeUrl(attachment.url)) {
      fileLink.target = "_blank";
      fileLink.rel = "noopener noreferrer";
    }
    fileLink.download = attachment.name;
    fileLink.textContent = buildChatAttachmentCaption(attachment);
    fileLink.setAttribute("aria-label", t("attachmentFileLabel", { name: attachment.name }));
    wrapper.appendChild(fileLink);
    return wrapper;
  }

  const caption = document.createElement("p");
  caption.className = "chat-attachment-caption";
  caption.textContent = buildChatAttachmentCaption(attachment);
  wrapper.appendChild(caption);

  return wrapper;
}

function createChatAttachmentsElement(attachments, messageId = "", roomId = "") {
  const container = document.createElement("div");
  container.className = "chat-attachments";

  for (const attachment of attachments) {
    container.appendChild(createChatAttachmentElement(attachment, messageId, roomId));
  }

  return container;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("FileReadError"));
    reader.onabort = () => reject(new Error("FileReadAborted"));
    reader.readAsDataURL(file);
  });
}

function renderPendingChatAttachments() {
  if (!chatAttachmentsPreviewEl) {
    return;
  }

  chatAttachmentsPreviewEl.innerHTML = "";
  if (pendingChatAttachments.length === 0) {
    chatAttachmentsPreviewEl.classList.add("hidden");
    return;
  }

  chatAttachmentsPreviewEl.classList.remove("hidden");
  const fragment = document.createDocumentFragment();

  for (const attachment of pendingChatAttachments) {
    const card = document.createElement("article");
    card.className = "chat-pending-attachment";

    const preview = document.createElement("div");
    preview.className = "chat-pending-attachment-preview";

    if (attachment.previewKind === "image") {
      const image = document.createElement("img");
      image.src = attachment.objectUrl;
      image.alt = t("attachmentImageLabel", { name: attachment.name });
      preview.appendChild(image);
    } else if (attachment.previewKind === "video") {
      const video = document.createElement("video");
      video.src = attachment.objectUrl;
      video.muted = true;
      video.preload = "metadata";
      video.playsInline = true;
      preview.appendChild(video);
    } else {
      const label = document.createElement("div");
      label.className = "chat-pending-file-badge";
      const extension = attachment.name.includes(".")
        ? attachment.name.split(".").pop()
        : "";
      label.textContent = extension ? extension.slice(0, 8).toUpperCase() : "FILE";
      preview.appendChild(label);
    }

    const meta = document.createElement("div");
    meta.className = "chat-pending-attachment-meta";

    const name = document.createElement("strong");
    name.className = "chat-pending-attachment-name";
    name.textContent = attachment.name;

    const size = document.createElement("span");
    size.className = "chat-pending-attachment-size";
    size.textContent = formatFileSize(attachment.size);

    meta.appendChild(name);
    meta.appendChild(size);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "chat-pending-attachment-remove";
    removeBtn.title = t("removeAttachment", { name: attachment.name });
    removeBtn.setAttribute("aria-label", t("removeAttachment", { name: attachment.name }));
    removeBtn.appendChild(createMaterialIcon("close"));
    removeBtn.addEventListener("click", () => {
      const index = pendingChatAttachments.findIndex((item) => item.id === attachment.id);
      if (index === -1) {
        return;
      }
      const [removed] = pendingChatAttachments.splice(index, 1);
      if (removed?.objectUrl) {
        URL.revokeObjectURL(removed.objectUrl);
      }
      renderPendingChatAttachments();
    });

    card.appendChild(preview);
    card.appendChild(meta);
    card.appendChild(removeBtn);
    fragment.appendChild(card);
  }

  chatAttachmentsPreviewEl.appendChild(fragment);
}

function clearPendingChatAttachments() {
  for (const attachment of pendingChatAttachments) {
    if (attachment?.objectUrl) {
      URL.revokeObjectURL(attachment.objectUrl);
    }
  }
  pendingChatAttachments.length = 0;
  if (chatFileInput) {
    chatFileInput.value = "";
  }
  renderPendingChatAttachments();
}

function appendPendingChatAttachments(files) {
  const list = Array.isArray(files) ? files : [];
  if (list.length === 0) {
    return;
  }

  let warnedByCount = false;
  const limits = getRelayUploadLimits();
  let currentTotalSize = pendingChatAttachments.reduce((acc, item) => acc + (Number(item?.size) || 0), 0);

  for (const file of list) {
    if (!(file instanceof File)) {
      continue;
    }

    if (pendingChatAttachments.length >= MAX_CHAT_ATTACHMENTS) {
      warnedByCount = true;
      break;
    }

    const name = String(file.name || "").trim().slice(0, 120) || "file";
    const size = Number(file.size);
    if (!Number.isFinite(size) || size <= 0) {
      continue;
    }
    if (isRelayModeActive() && size > limits.maxFileBytes) {
      setStatus(t("attachmentTooLarge", { name, max: formatFileSize(limits.maxFileBytes) }));
      continue;
    }
    if (isRelayModeActive() && currentTotalSize + size > limits.maxTotalMessageBytes) {
      setStatus(t("attachmentTotalTooLarge", { max: formatFileSize(limits.maxTotalMessageBytes) }));
      continue;
    }

    const duplicate = pendingChatAttachments.some((item) =>
      item.name === name && item.size === size && item.file.lastModified === file.lastModified
    );
    if (duplicate) {
      continue;
    }

    const mimeType = normalizeChatAttachmentMimeType(file.type);
    const previewKind = getChatAttachmentPreviewKind(mimeType);
    const objectUrl = URL.createObjectURL(file);

    pendingChatAttachments.push({
      id: `pending-${Date.now()}-${pendingChatAttachmentSeq}`,
      file,
      name,
      size,
      mimeType,
      previewKind,
      objectUrl,
    });
    pendingChatAttachmentSeq += 1;
    currentTotalSize += size;
  }

  if (warnedByCount) {
    setStatus(t("attachmentLimitExceeded", { count: MAX_CHAT_ATTACHMENTS }));
  }

  renderPendingChatAttachments();
}

function eventHasFilePayload(event) {
  const types = event?.dataTransfer?.types;
  if (!types) {
    return false;
  }

  if (typeof types.includes === "function") {
    return types.includes("Files");
  }

  return Array.from(types).includes("Files");
}

function setChatDropTargetActive(active) {
  if (!chatColumnEl) {
    return;
  }
  chatColumnEl.classList.toggle("chat-drop-active", Boolean(active));
}

function resetChatDropTargetState() {
  chatDropTargetDepth = 0;
  setChatDropTargetActive(false);
}

function extractDroppedFiles(event) {
  const files = event?.dataTransfer?.files;
  if (!files) {
    return [];
  }
  return Array.from(files).filter((file) => file instanceof File);
}

async function buildOutgoingChatAttachmentPayloads() {
  if (pendingChatAttachments.length === 0) {
    return [];
  }

  const payload = [];

  for (const attachment of pendingChatAttachments) {
    let dataUrl = "";
    try {
      dataUrl = await readFileAsDataUrl(attachment.file);
    } catch {
      throw new Error(t("attachmentReadFailed", { name: attachment.name }));
    }

    if (!dataUrl) {
      throw new Error(t("attachmentReadFailed", { name: attachment.name }));
    }

    payload.push({
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      dataUrl,
    });
  }

  return payload;
}

async function buildRelayEncryptedChatPacket(roomId, text) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId) {
    throw new Error("room_key_required");
  }

  let messageId = createRelayRequestId("msg");
  const attachmentRefs = [];
  const attachmentsV2 = [];
  const limits = getRelayUploadLimits();
  const totalSize = pendingChatAttachments.reduce((acc, item) => acc + (Number(item?.size) || 0), 0);
  if (totalSize > limits.maxTotalMessageBytes) {
    throw new Error("attachment_total_too_large");
  }

  for (const attachment of pendingChatAttachments) {
    const uploaded = await uploadRelayV2Attachment(
      cleanRoomId,
      attachment,
      messageId,
      {
        allowMessageIdAdopt: attachmentRefs.length === 0,
      }
    );
    if (attachmentRefs.length === 0 && uploaded.messageId && uploaded.messageId !== messageId) {
      messageId = uploaded.messageId;
    }
    if (uploaded.messageId !== messageId) {
      throw new Error("relay_message_id_mismatch");
    }
    attachmentsV2.push(uploaded);
    attachmentRefs.push({
      messageId: uploaded.messageId,
      attachmentId: uploaded.attachmentId,
      transport: RELAY_ATTACHMENT_TRANSPORT_S3_V2,
      objectKey: uploaded.objectKey,
      size: uploaded.size,
      name: uploaded.name,
      mimeType: uploaded.mimeType,
    });
    rememberRelayLocalAttachmentPreview(
      cleanRoomId,
      uploaded.messageId,
      uploaded.attachmentId,
      attachment.file,
      {
        name: uploaded.name,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
      }
    );
  }

  const encryptedPayload = await encryptRelayPayload(cleanRoomId, {
    text: String(text || ""),
    userId: CHAT_AUTHOR_ID,
    userName: getProfileName(),
    attachments: attachmentRefs.map((item) => ({
      attachmentId: item.attachmentId,
      messageId: item.messageId,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
    })),
    attachmentsV2: attachmentsV2.map((item) => ({
      messageId: item.messageId,
      attachmentId: item.attachmentId,
      transport: RELAY_ATTACHMENT_TRANSPORT_S3_V2,
      objectKey: item.objectKey,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      fileKey: item.fileKey,
      noncePrefix: item.noncePrefix,
      chunkSize: item.chunkSize,
      totalChunks: item.totalChunks,
    })),
  });

  if (attachmentRefs.length > 0) {
    const refs = attachmentRefs.map((item) => ({
      attachmentId: item.attachmentId,
      transport: item.transport,
      hasObjectKey: Boolean(String(item.objectKey || "").trim()),
    }));
    console.info("relay_chat_attachment_refs_outgoing", {
      roomId: cleanRoomId,
      messageId,
      transportVersion: 2,
      refs,
      refsSummary: refs.map((item) => `${item.attachmentId}:${item.transport || "legacy"}:${item.hasObjectKey ? "ok" : "no-key"}`),
    });
  }

  return {
    envelope: {
      v: RELAY_CIPHER_VERSION,
      alg: RELAY_CRYPTO_ALGORITHM,
      transportVersion: 2,
      roomId: cleanRoomId,
      messageId,
      senderId: CHAT_AUTHOR_ID,
      createdAt: Date.now(),
      iv: encryptedPayload.iv,
      ciphertext: encryptedPayload.ciphertext,
      attachmentRefs,
    },
    attachmentPayloads: [],
  };
}

function getChatMessageById(messageId) {
  const cleanMessageId = String(messageId || "").trim();
  if (!cleanMessageId) {
    return null;
  }
  return chatMessages.find((message) => message.id === cleanMessageId) || null;
}

function isOwnChatMessage(message) {
  if (!message) {
    return false;
  }

  const messageUserId = String(message.userId || "").trim();
  if (!messageUserId) {
    return false;
  }

  const stableAuthorId = String(CHAT_AUTHOR_ID || "").trim();
  const currentSocketId = String(selfId || "").trim();

  return (
    (stableAuthorId && messageUserId === stableAuthorId) ||
    (currentSocketId && messageUserId === currentSocketId)
  );
}

function resetChatEditState({ render = false } = {}) {
  activeChatEditMessageId = null;
  chatEditDraftText = "";
  chatEditRemovedAttachmentIds = new Set();

  if (render) {
    renderChat();
  }
}

function startChatMessageEdit(messageId) {
  const message = getChatMessageById(messageId);
  if (!message) {
    setStatus(t("messageNotFound"));
    return;
  }

  if (!isOwnChatMessage(message)) {
    setStatus(t("notMessageAuthor"));
    return;
  }

  activeChatEditMessageId = message.id;
  chatEditDraftText = String(message.text || "").slice(0, MAX_CHAT_MESSAGE_LENGTH);
  chatEditRemovedAttachmentIds = new Set();
  renderChat();
}

function toggleChatEditAttachmentRemoval(attachmentId) {
  const cleanAttachmentId = String(attachmentId || "").trim();
  if (!cleanAttachmentId) {
    return;
  }

  if (chatEditRemovedAttachmentIds.has(cleanAttachmentId)) {
    chatEditRemovedAttachmentIds.delete(cleanAttachmentId);
  } else {
    chatEditRemovedAttachmentIds.add(cleanAttachmentId);
  }

  renderChat();
}

function mapChatActionError(errorText) {
  const text = String(errorText || "").trim();
  const normalized = text.toLowerCase();

  if (!normalized) {
    return t("chatSendFailed");
  }
  if (normalized.includes("edit window expired")) {
    return t("editWindowExpired");
  }
  if (normalized.includes("only your messages")) {
    return t("notMessageAuthor");
  }
  if (normalized.includes("message not found")) {
    return t("messageNotFound");
  }
  if (normalized.includes("join server first")) {
    return t("joinServerFirst");
  }

  return text;
}

async function requestDeleteChatMessage(messageId) {
  const message = getChatMessageById(messageId);
  if (!message) {
    setStatus(t("messageNotFound"));
    return;
  }

  if (!isOwnChatMessage(message)) {
    setStatus(t("notMessageAuthor"));
    return;
  }

  const approved = await confirmInput(t("confirmDeleteMessage"));
  if (!approved) {
    return;
  }

  socket.emit("delete-chat-message", { messageId: message.id }, (response) => {
    if (!response?.ok) {
      setStatus(mapChatActionError(response?.error));
      return;
    }
  });
}

function requestSaveChatMessageEdit(messageId) {
  const message = getChatMessageById(messageId);
  if (!message) {
    setStatus(t("messageNotFound"));
    return;
  }

  if (!isOwnChatMessage(message)) {
    setStatus(t("notMessageAuthor"));
    return;
  }

  const nextText = String(chatEditDraftText || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHAT_MESSAGE_LENGTH);

  if (isRelayModeActive()) {
    if (!roomState?.id) {
      setStatus(t("joinServerFirst"));
      return;
    }

    const keptAttachments = Array.isArray(message.attachments)
      ? message.attachments.filter((item) => !chatEditRemovedAttachmentIds.has(String(item?.id || "")))
      : [];
    const attachmentRefs = keptAttachments.map((item) => ({
      messageId: message.id,
      attachmentId: String(item.id || "").trim(),
      transport: item.transport === RELAY_ATTACHMENT_TRANSPORT_S3_V2
        ? RELAY_ATTACHMENT_TRANSPORT_S3_V2
        : "",
      objectKey: item.transport === RELAY_ATTACHMENT_TRANSPORT_S3_V2
        ? String(item.objectKey || "").trim()
        : "",
      name: String(item.name || "file"),
      mimeType: normalizeChatAttachmentMimeType(item.mimeType),
      size: Number(item.size) || 0,
    }));
    const attachmentsV2 = keptAttachments
      .filter((item) => item.transport === RELAY_ATTACHMENT_TRANSPORT_S3_V2)
      .map((item) => ({
        messageId: message.id,
        attachmentId: String(item.id || "").trim(),
        transport: RELAY_ATTACHMENT_TRANSPORT_S3_V2,
        objectKey: String(item.objectKey || "").trim(),
        name: String(item.name || "file"),
        mimeType: normalizeChatAttachmentMimeType(item.mimeType),
        size: Number(item.size) || 0,
        fileKey: String(item.fileKey || "").trim(),
        noncePrefix: String(item.noncePrefix || "").trim(),
        chunkSize: Number(item.chunkSize) || 0,
        totalChunks: Number(item.totalChunks) || 0,
      }))
      .filter((item) => item.attachmentId && item.objectKey && item.fileKey && item.noncePrefix);

    (async () => {
      try {
        const encryptedPayload = await encryptRelayPayload(roomState.id, {
          text: nextText,
          userId: message.userId || CHAT_AUTHOR_ID,
          userName: message.userName || getProfileName(),
          editedAt: Date.now(),
          attachments: attachmentRefs,
          attachmentsV2,
        });

        socket.emit(
          "edit-chat-message",
          {
            messageId: message.id,
            envelope: {
              v: RELAY_CIPHER_VERSION,
              alg: RELAY_CRYPTO_ALGORITHM,
              roomId: normalizeRoomIdValue(roomState.id),
              messageId: message.id,
              senderId: message.userId || CHAT_AUTHOR_ID,
              createdAt: Number(message.createdAt) || Date.now(),
              transportVersion: 2,
              iv: encryptedPayload.iv,
              ciphertext: encryptedPayload.ciphertext,
              attachmentRefs,
            },
          },
          (response) => {
            if (!response?.ok) {
              setStatus(mapChatActionError(response?.error));
              return;
            }
            resetChatEditState({ render: true });
          }
        );
      } catch (error) {
        const normalizedError = String(error?.message || "").trim().toLowerCase();
        if (normalizedError.includes("room_key_required")) {
          setStatus(t("roomKeyRequired"));
        } else {
          setStatus(t("decryptFailed"));
        }
      }
    })();

    return;
  }

  socket.emit(
    "edit-chat-message",
    {
      messageId: message.id,
      text: nextText,
      removeAttachmentIds: Array.from(chatEditRemovedAttachmentIds),
    },
    (response) => {
      if (!response?.ok) {
        setStatus(mapChatActionError(response?.error));
        return;
      }

      resetChatEditState({ render: true });
    }
  );
}

function createChatMessageElement(message) {
  const item = document.createElement("article");
  item.className = "chat-message";
  item.dataset.messageId = message.id;

  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";
  const initial = (String(message.userName || "G").trim().charAt(0) || "G").toUpperCase();
  avatar.textContent = initial;

  const content = document.createElement("div");
  content.className = "chat-content";

  const meta = document.createElement("div");
  meta.className = "chat-meta";

  const metaPrimary = document.createElement("div");
  metaPrimary.className = "chat-meta-primary";

  const author = document.createElement("span");
  author.className = "chat-author";
  author.textContent = message.userName || t("guest");

  const time = document.createElement("time");
  time.className = "chat-time";
  time.textContent = formatChatTime(message.createdAt);
  time.dateTime = new Date(Number(message.createdAt) || Date.now()).toISOString();

  metaPrimary.appendChild(author);
  metaPrimary.appendChild(time);

  if (Number(message.editedAt) > 0) {
    const edited = document.createElement("span");
    edited.className = "chat-edited-badge";
    edited.textContent = t("editedLabel");
    metaPrimary.appendChild(edited);
  }

  meta.appendChild(metaPrimary);

  const isOwnMessage = isOwnChatMessage(message);

  if (isOwnMessage) {
    const actions = document.createElement("div");
    actions.className = "chat-message-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "chat-message-action";
    editBtn.title = t("editMessage");
    editBtn.setAttribute("aria-label", editBtn.title);
    editBtn.appendChild(createMaterialIcon("edit"));
    editBtn.addEventListener("click", () => {
      startChatMessageEdit(message.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "chat-message-action danger";
    deleteBtn.title = t("deleteMessage");
    deleteBtn.setAttribute("aria-label", t("deleteMessage"));
    deleteBtn.appendChild(createMaterialIcon("delete"));
    deleteBtn.addEventListener("click", () => {
      void requestDeleteChatMessage(message.id);
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    meta.appendChild(actions);
  }

  content.appendChild(meta);

  const isEditing = activeChatEditMessageId === message.id;
  if (isEditing && isOwnMessage) {
    const form = document.createElement("div");
    form.className = "chat-edit-form";

    const textarea = document.createElement("textarea");
    textarea.className = "chat-edit-textarea";
    textarea.maxLength = MAX_CHAT_MESSAGE_LENGTH;
    textarea.value = chatEditDraftText;
    textarea.placeholder = t("chatPlaceholder", { room: getCurrentRoomLabel() });
    textarea.addEventListener("input", () => {
      chatEditDraftText = String(textarea.value || "").slice(0, MAX_CHAT_MESSAGE_LENGTH);
    });
    form.appendChild(textarea);

    if (Array.isArray(message.attachments) && message.attachments.length > 0) {
      const attachmentsEditor = document.createElement("div");
      attachmentsEditor.className = "chat-edit-attachments";

      for (const attachment of message.attachments) {
        const attachmentId = String(attachment.id || "").trim();
        const removeMarked = attachmentId && chatEditRemovedAttachmentIds.has(attachmentId);

        const row = document.createElement("div");
        row.className = "chat-edit-attachment";
        if (removeMarked) {
          row.classList.add("is-removed");
        }

        const name = document.createElement("span");
        name.className = "chat-edit-attachment-name";
        name.textContent = buildChatAttachmentCaption(attachment);
        row.appendChild(name);

        if (attachmentId) {
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "chat-edit-attachment-toggle";
          removeBtn.title = t("removeAttachment", { name: attachment.name });
          removeBtn.setAttribute("aria-label", t("removeAttachment", { name: attachment.name }));
          removeBtn.appendChild(createMaterialIcon(removeMarked ? "close" : "delete"));
          removeBtn.addEventListener("click", () => {
            toggleChatEditAttachmentRemoval(attachmentId);
          });
          row.appendChild(removeBtn);
        }

        attachmentsEditor.appendChild(row);
      }

      form.appendChild(attachmentsEditor);
    }

    const actions = document.createElement("div");
    actions.className = "chat-edit-actions";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "chat-edit-save";
    saveBtn.textContent = t("saveEdit");
    saveBtn.addEventListener("click", () => {
      requestSaveChatMessageEdit(message.id);
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "chat-edit-cancel";
    cancelBtn.textContent = t("cancelEdit");
    cancelBtn.addEventListener("click", () => {
      resetChatEditState({ render: true });
    });

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    content.appendChild(form);
  } else {
    const textValue = String(message.text || "");
    if (textValue) {
      const text = document.createElement("p");
      text.className = "chat-text";
      text.textContent = textValue;
      content.appendChild(text);
    }

    if (Array.isArray(message.attachments) && message.attachments.length > 0) {
      content.appendChild(
        createChatAttachmentsElement(
          message.attachments,
          message.id,
          normalizeRoomIdValue(message.roomId || roomState?.id)
        )
      );
    }
  }

  item.appendChild(avatar);
  item.appendChild(content);
  return item;
}

function createChatWelcomeElement() {
  const container = document.createElement("section");
  container.className = "chat-welcome";

  const brandRow = document.createElement("div");
  brandRow.className = "chat-welcome-brand-row";

  const badge = document.createElement("div");
  badge.className = "chat-welcome-badge";
  badge.textContent = getProjectBadgeLabel();

  const titleWrap = document.createElement("div");
  titleWrap.className = "chat-welcome-title-wrap";

  const title = document.createElement("h3");
  title.className = "chat-welcome-title";
  title.textContent = t("welcomeTitle", { projectName: getProjectName() });

  const subtitle = document.createElement("p");
  subtitle.className = "chat-welcome-subtitle";
  subtitle.textContent = t("welcomeSubtitle");

  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);
  brandRow.appendChild(badge);
  brandRow.appendChild(titleWrap);

  const stepsPanel = document.createElement("article");
  stepsPanel.className = "chat-welcome-panel chat-welcome-steps";

  const stepsTitle = document.createElement("h4");
  stepsTitle.textContent = t("welcomeStepsTitle");

  const stepsList = document.createElement("ol");
  stepsList.className = "chat-welcome-list";
  for (const itemText of [
    t("welcomeStepJoin"),
    t("welcomeStepProfile"),
    t("welcomeStepVoice"),
    t("welcomeStepChat"),
  ]) {
    const item = document.createElement("li");
    item.textContent = itemText;
    stepsList.appendChild(item);
  }
  stepsPanel.appendChild(stepsTitle);
  stepsPanel.appendChild(stepsList);

  const actions = document.createElement("div");
  actions.className = "chat-welcome-actions";

  const joinButton = document.createElement("button");
  joinButton.type = "button";
  joinButton.className = "chat-welcome-join-btn";
  joinButton.textContent = t("joinSelectedServer");
  joinButton.addEventListener("click", () => {
    void promptJoinServerAndConnect();
  });

  const createButton = document.createElement("button");
  createButton.type = "button";
  createButton.className = "chat-welcome-create-btn";
  createButton.textContent = t("createServer");
  createButton.addEventListener("click", () => {
    void promptCreateServerAndJoin();
  });

  actions.appendChild(joinButton);
  actions.appendChild(createButton);

  container.appendChild(brandRow);
  container.appendChild(stepsPanel);
  container.appendChild(actions);

  return container;
}

function renderChat() {
  if (!chatMessagesEl) {
    return;
  }

  chatMessagesEl.innerHTML = "";
  chatMessagesEl.classList.remove("is-empty-state", "is-welcome-state");

  if (!joined) {
    chatMessagesEl.classList.add("is-welcome-state");
    chatMessagesEl.appendChild(createChatWelcomeElement());
    return;
  }

  if (chatMessages.length === 0) {
    chatMessagesEl.classList.add("is-empty-state");
    const empty = document.createElement("p");
    empty.className = "chat-empty";
    empty.textContent = t("chatEmptyNoMessages");
    chatMessagesEl.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const message of chatMessages) {
    fragment.appendChild(createChatMessageElement(message));
  }
  chatMessagesEl.appendChild(fragment);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function upsertChatMessage(message) {
  const normalizedMessage = normalizeIncomingChatMessage(message);
  if (!normalizedMessage) {
    return;
  }

  const existingIndex = chatMessages.findIndex((item) => item.id === normalizedMessage.id);
  if (existingIndex >= 0) {
    const previous = chatMessages[existingIndex];
    const keepAttachmentIds = new Set(
      Array.isArray(normalizedMessage.attachments)
        ? normalizedMessage.attachments
            .map((item) => String(item?.id || "").trim())
            .filter(Boolean)
        : []
    );
    clearRelayLocalAttachmentPreviewsForMessage(
      normalizeRoomIdValue(normalizedMessage.roomId || previous?.roomId || roomState?.id),
      normalizedMessage.id,
      keepAttachmentIds
    );
    chatMessages[existingIndex] = normalizedMessage;
  } else {
    chatMessages.push(normalizedMessage);
    chatMessageIds.add(normalizedMessage.id);
  }

  chatMessages.sort((left, right) => left.createdAt - right.createdAt);

  if (chatMessages.length > 150) {
    const removed = chatMessages.splice(0, chatMessages.length - 150);
    for (const item of removed) {
      chatMessageIds.delete(item.id);
    }
  }
}

function removeChatMessageById(messageId) {
  const cleanMessageId = String(messageId || "").trim();
  if (!cleanMessageId) {
    return false;
  }

  const index = chatMessages.findIndex((message) => message.id === cleanMessageId);
  if (index === -1) {
    return false;
  }

  const [removed] = chatMessages.splice(index, 1);
  if (removed?.id) {
    chatMessageIds.delete(removed.id);
    clearRelayLocalAttachmentPreviewsForMessage(
      normalizeRoomIdValue(removed.roomId || roomState?.id),
      removed.id,
      []
    );
  }

  if (activeChatEditMessageId === cleanMessageId) {
    resetChatEditState();
  }

  return true;
}

function replaceChatMessages(messages) {
  clearAllRelayLocalAttachmentPreviews();
  relayV2InlinePreviewInFlight.clear();
  relayV2InlinePreviewFailedAt.clear();
  resetChatEditState();
  chatMessages.length = 0;
  chatMessageIds.clear();

  const list = Array.isArray(messages) ? messages : [];
  for (const message of list) {
    upsertChatMessage(message);
  }

  renderChat();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeDeviceId(value) {
  return String(value || "").trim();
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

function loadOrCreateChatAuthorId() {
  try {
    const stored = normalizeChatAuthorId(localStorage.getItem(CHAT_AUTHOR_ID_STORAGE_KEY));
    if (stored) {
      return stored;
    }
  } catch {
    // no-op
  }

  const generated = normalizeChatAuthorId(
    `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`
  );

  try {
    if (generated) {
      localStorage.setItem(CHAT_AUTHOR_ID_STORAGE_KEY, generated);
    }
  } catch {
    // no-op
  }

  return generated || `u${Math.random().toString(36).slice(2, 12)}`;
}

function loadStoredProfileName() {
  try {
    const stored = localStorage.getItem(PROFILE_NAME_STORAGE_KEY);
    const name = String(stored || "").trim().slice(0, 32);
    return name || t("guest");
  } catch {
    return t("guest");
  }
}

function persistProfileName() {
  if (!nameInput) {
    return;
  }

  const normalizedLength = String(nameInput.value || "").slice(0, 32);
  if (nameInput.value !== normalizedLength) {
    nameInput.value = normalizedLength;
  }

  const name = normalizedLength.trim();

  try {
    if (name) {
      localStorage.setItem(PROFILE_NAME_STORAGE_KEY, name);
    } else {
      localStorage.removeItem(PROFILE_NAME_STORAGE_KEY);
    }
  } catch {
    // no-op
  }
}

function loadPreferredMicDeviceId() {
  try {
    return normalizeDeviceId(localStorage.getItem(PROFILE_MIC_DEVICE_STORAGE_KEY));
  } catch {
    return "";
  }
}

function persistPreferredMicDeviceId() {
  try {
    if (preferredMicDeviceId) {
      localStorage.setItem(PROFILE_MIC_DEVICE_STORAGE_KEY, preferredMicDeviceId);
    } else {
      localStorage.removeItem(PROFILE_MIC_DEVICE_STORAGE_KEY);
    }
  } catch {
    // no-op
  }
}

function loadPreferredSpeakerDeviceId() {
  try {
    return normalizeDeviceId(localStorage.getItem(PROFILE_SPEAKER_DEVICE_STORAGE_KEY));
  } catch {
    return "";
  }
}

function persistPreferredSpeakerDeviceId() {
  try {
    if (preferredSpeakerDeviceId) {
      localStorage.setItem(PROFILE_SPEAKER_DEVICE_STORAGE_KEY, preferredSpeakerDeviceId);
    } else {
      localStorage.removeItem(PROFILE_SPEAKER_DEVICE_STORAGE_KEY);
    }
  } catch {
    // no-op
  }
}

function getProfileName() {
  const name = String(nameInput?.value || "")
    .trim()
    .slice(0, 32);
  return name || t("guest");
}

function normalizeMicSensitivity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return MIC_SENSITIVITY_DEFAULT;
  }
  return clamp(numeric, MIC_SENSITIVITY_MIN, MIC_SENSITIVITY_MAX);
}

function loadMicSensitivity() {
  try {
    const stored = window.localStorage.getItem(MIC_SENSITIVITY_STORAGE_KEY);
    if (stored === null) {
      return MIC_SENSITIVITY_DEFAULT;
    }
    return normalizeMicSensitivity(Number(stored));
  } catch {
    return MIC_SENSITIVITY_DEFAULT;
  }
}

function saveMicSensitivity(value) {
  try {
    window.localStorage.setItem(MIC_SENSITIVITY_STORAGE_KEY, String(value));
  } catch {
    // no-op
  }
}

function sensitivityToPercent(value) {
  return Math.round(normalizeMicSensitivity(value) * 100);
}

function setControlButtonIcon(button, iconName, label) {
  if (!button) {
    return;
  }

  const icon = String(iconName || "").trim() || "radio_button_checked";
  button.innerHTML =
    `<span class="material-symbols-rounded control-icon" data-icon-name="${icon}" aria-hidden="true">${resolveMaterialIconText(icon)}</span>`;
  const title = String(label || "").trim();
  if (title) {
    button.title = title;
    button.setAttribute("aria-label", title);
  }
}

function setMicSensitivityPopoverOpen(nextOpen) {
  const canOpen = joined && isInVoiceChannel(roomState) && !micSensitivityToggleBtn?.disabled;
  const open = Boolean(nextOpen) && canOpen;
  isMicSensitivityPopoverOpen = open;

  if (micSensitivityPopover) {
    micSensitivityPopover.classList.toggle("hidden", !open);
  }

  if (micSensitivityToggleBtn) {
    micSensitivityToggleBtn.setAttribute("aria-expanded", String(open));
    micSensitivityToggleBtn.classList.toggle("active", open);
  }
}

function syncMicSensitivityUi() {
  const percent = sensitivityToPercent(micSensitivity);

  if (micSensitivityRange) {
    micSensitivityRange.value = String(percent);
  }

  if (micSensitivityValue) {
    micSensitivityValue.textContent = `${percent}%`;
  }

  if (micSensitivityChipEl) {
    micSensitivityChipEl.textContent = `${percent}%`;
  }
}

function applyMicSensitivityGain(immediate = false) {
  if (!micProcessingGainNode || !micProcessingContext) {
    return;
  }

  const targetGain = normalizeMicSensitivity(micSensitivity);
  const now = micProcessingContext.currentTime;
  micProcessingGainNode.gain.cancelScheduledValues(now);

  if (immediate) {
    micProcessingGainNode.gain.setValueAtTime(targetGain, now);
    return;
  }

  const currentGain = clamp(micProcessingGainNode.gain.value, MIC_SENSITIVITY_MIN, MIC_SENSITIVITY_MAX);
  micProcessingGainNode.gain.setValueAtTime(currentGain, now);
  micProcessingGainNode.gain.setTargetAtTime(targetGain, now, 0.035);
}

function setMicSensitivity(value, { persist = true } = {}) {
  const next = normalizeMicSensitivity(value);
  micSensitivity = next;
  applyMicSensitivityGain();
  syncMicSensitivityUi();

  if (persist) {
    saveMicSensitivity(next);
  }
}

function hasPendingMicMute() {
  return micMuteTimer !== null;
}

function clearMicMuteTimer() {
  if (!micMuteTimer) {
    return;
  }
  clearTimeout(micMuteTimer);
  micMuteTimer = null;
}

function updateMuteButtonLabel() {
  if (!muteBtn) {
    return;
  }

  if (!isMuted) {
    muteBtn.classList.remove("active");
    setControlButtonIcon(muteBtn, "mic", t("mute"));
    return;
  }

  muteBtn.classList.add("active");
  if (hasPendingMicMute()) {
    setControlButtonIcon(muteBtn, "hourglass_top", t("muting"));
    return;
  }

  setControlButtonIcon(muteBtn, "mic_off", t("unmute"));
}

function getActiveMicAudioProcessingConstraints() {
  if (isRnNoiseMode) {
    return {
      echoCancellation: false,
      noiseSuppression: false,
    };
  }

  return { ...DEFAULT_MIC_AUDIO_PROCESSING_CONSTRAINTS };
}

function buildAudioCaptureConstraints(baseConstraints, { includePreferredDevice = true } = {}) {
  const constraints = {
    ...baseConstraints,
    ...getActiveMicAudioProcessingConstraints(),
    autoGainControl: false,
  };

  if (includePreferredDevice && preferredMicDeviceId) {
    constraints.deviceId = { exact: preferredMicDeviceId };
  }

  return constraints;
}

function isRecoverableMicConstraintError(error) {
  return (
    error?.name === "OverconstrainedError" ||
    error?.name === "ConstraintNotSatisfiedError" ||
    error?.name === "NotFoundError"
  );
}

async function applyActiveMicProcessingConstraintsOnTrack(track) {
  if (!track || typeof track.applyConstraints !== "function") {
    return true;
  }

  const target = {
    autoGainControl: false,
    ...getActiveMicAudioProcessingConstraints(),
  };

  try {
    await track.applyConstraints(target);
    return true;
  } catch {
    try {
      await track.applyConstraints({
        ...getActiveMicAudioProcessingConstraints(),
      });
      return true;
    } catch {
      // Some browsers/devices may ignore or reject runtime constraint updates.
      return false;
    }
  }
}

function applyDlolmusOpusParamsToSdp(sdp) {
  if (!sdp || typeof sdp !== "string") {
    return sdp;
  }

  return sdp.replace(/a=fmtp:(\d+)\s([^\r\n]*\buseinbandfec=1\b[^\r\n]*)/g, (line, payloadType, params) => {
    let nextParams = params;

    if (!/\bstereo=1\b/.test(nextParams)) {
      nextParams += "; stereo=1";
    }

    if (!/\bmaxaveragebitrate=510000\b/.test(nextParams)) {
      nextParams += "; maxaveragebitrate=510000";
    }

    return `a=fmtp:${payloadType} ${nextParams}`;
  });
}

function maybeApplyDlolmusToAnswerSdp(answer) {
  if (!isDlolmusExperimentalMode || !answer || typeof answer.sdp !== "string") {
    return answer;
  }

  answer.sdp = applyDlolmusOpusParamsToSdp(answer.sdp);
  return answer;
}

function handleDlolmusChatCommand(text) {
  const trimmed = String(text || "").trim();
  const match = /^\/dlolmus\s+(on|off)$/i.exec(trimmed);
  if (!match) {
    if (/^\/dlolmus\b/i.test(trimmed)) {
      setStatus(t("usageDlolmus"));
      return true;
    }
    return false;
  }

  const nextEnabled = match[1].toLowerCase() === "on";
  isDlolmusExperimentalMode = nextEnabled;
  setStatus(nextEnabled ? t("dlolmusOn") : t("dlolmusOff"));
  return true;
}

async function handleRnChatCommand(text) {
  const trimmed = String(text || "").trim();
  const match = /^\/rn\s+(on|off)$/i.exec(trimmed);
  if (!match) {
    if (/^\/rn\b/i.test(trimmed)) {
      setStatus(t("usageRn"));
      return true;
    }
    return false;
  }

  const nextEnabled = match[1].toLowerCase() === "on";
  isRnNoiseMode = nextEnabled;

  const runtimeApplied = await applyActiveMicProcessingConstraintsOnTrack(localMicTrack);
  if (runtimeApplied) {
    setStatus(nextEnabled ? t("rnOn") : t("rnOff"));
    return true;
  }

  setStatus(nextEnabled ? t("rnOnDeferred") : t("rnOffDeferred"));
  return true;
}

function scheduleMicMuteShutdown() {
  clearMicMuteTimer();

  micMuteTimer = setTimeout(() => {
    micMuteTimer = null;
    if (!isMuted) {
      return;
    }
    syncLocalMicMuteState();
    updateMuteButtonLabel();
  }, MIC_CAPTURE_MUTE_GRACE_MS);
}

function syncLocalMicMuteState() {
  const enabled = isMuted && hasPendingMicMute() ? true : !isMuted;

  if (localMicTrack) {
    localMicTrack.enabled = enabled;
  }

  if (localOutboundMicTrack && localOutboundMicTrack !== localMicTrack) {
    localOutboundMicTrack.enabled = enabled;
  }
}

function disposeMicProcessing() {
  if (micProcessingInputNode) {
    try {
      micProcessingInputNode.disconnect();
    } catch {
      // no-op
    }
    micProcessingInputNode = null;
  }

  if (micProcessingGainNode) {
    try {
      micProcessingGainNode.disconnect();
    } catch {
      // no-op
    }
    micProcessingGainNode = null;
  }

  micProcessingDestinationNode = null;

  if (micProcessingContext) {
    micProcessingContext.close().catch(() => {
      // no-op
    });
    micProcessingContext = null;
  }
}

function getOutboundMicTrack() {
  return localOutboundMicTrack || localMicTrack || null;
}

function getStreamForTrack(track) {
  if (!track) {
    return null;
  }

  if (localStream) {
    const localTracks = localStream.getAudioTracks();
    if (localTracks.includes(track)) {
      return localStream;
    }
  }

  return new MediaStream([track]);
}

function setupMicProcessing() {
  localOutboundMicTrack = localMicTrack;

  if (!localMicTrack) {
    disposeMicProcessing();
    return;
  }

  disposeMicProcessing();

  const ContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!ContextCtor) {
    syncLocalMicMuteState();
    return;
  }

  try {
    micProcessingContext = new ContextCtor({
      latencyHint: "interactive",
      sampleRate: 48000,
    });
  } catch {
    try {
      micProcessingContext = new ContextCtor();
    } catch {
      micProcessingContext = null;
      syncLocalMicMuteState();
      return;
    }
  }

  try {
    // Keep outbound processing strictly mic-only; remote room audio must stay local-playback only.
    const inputStream = new MediaStream([localMicTrack]);
    micProcessingInputNode = micProcessingContext.createMediaStreamSource(inputStream);
    micProcessingGainNode = micProcessingContext.createGain();
    micProcessingDestinationNode = micProcessingContext.createMediaStreamDestination();
    micProcessingInputNode.connect(micProcessingGainNode);
    micProcessingGainNode.connect(micProcessingDestinationNode);

    const processedTrack = micProcessingDestinationNode.stream.getAudioTracks()[0] || null;
    if (processedTrack) {
      applyVoiceTrackHints(processedTrack);
      localOutboundMicTrack = processedTrack;
    }

    applyMicSensitivityGain(true);

    if (micProcessingContext.state === "suspended") {
      micProcessingContext.resume().catch(() => {
        // no-op
      });
    }
  } catch {
    disposeMicProcessing();
    localOutboundMicTrack = localMicTrack;
  }

  syncLocalMicMuteState();
}

async function replaceOutboundMicTrackForPeers(nextOutboundTrack) {
  for (const entry of peers.values()) {
    if (!entry?.micSender) {
      continue;
    }

    await entry.micSender.replaceTrack(nextOutboundTrack || null).catch(() => {
      // no-op
    });

    if (nextOutboundTrack) {
      applyVoiceTrackHints(nextOutboundTrack);
      void optimizeAudioSender(entry.micSender, { profile: "mic" });
    }
  }
}

async function applyNewLocalMicTrack(nextMicTrack, replacementStream = null) {
  if (!nextMicTrack) {
    return;
  }

  const previousMicTrack = localMicTrack;
  const previousOutboundTrack = getOutboundMicTrack();
  const previousTrackIds = new Set();
  if (previousMicTrack?.id) {
    previousTrackIds.add(previousMicTrack.id);
  }
  if (previousOutboundTrack?.id) {
    previousTrackIds.add(previousOutboundTrack.id);
  }

  if (!localStream) {
    localStream = replacementStream || new MediaStream([nextMicTrack]);
  } else {
    for (const audioTrack of localStream.getAudioTracks()) {
      localStream.removeTrack(audioTrack);
    }
    localStream.addTrack(nextMicTrack);
  }

  localMicTrack = nextMicTrack;
  await applyActiveMicProcessingConstraintsOnTrack(localMicTrack);
  applyVoiceTrackHints(localMicTrack);
  setupMicProcessing();
  syncLocalMicMuteState();

  const nextOutboundTrack = getOutboundMicTrack();

  if (isHost && selfId) {
    for (const trackId of previousTrackIds) {
      removeSourceVoiceTrack(selfId, trackId);
    }

    if (nextOutboundTrack) {
      addSourceVoiceTrack(selfId, nextOutboundTrack);
    }
  } else {
    await replaceOutboundMicTrackForPeers(nextOutboundTrack);
  }

  if (
    previousOutboundTrack &&
    previousOutboundTrack !== previousMicTrack &&
    previousOutboundTrack !== nextOutboundTrack
  ) {
    try {
      previousOutboundTrack.stop();
    } catch {
      // no-op
    }
  }

  if (previousMicTrack && previousMicTrack !== nextMicTrack) {
    try {
      previousMicTrack.stop();
    } catch {
      // no-op
    }
  }
}

async function captureMicrophoneStream() {
  const hadPreferredMicDevice = Boolean(preferredMicDeviceId);
  const attempts = [
    { base: AUDIO_CAPTURE_CONSTRAINTS, includePreferredDevice: true },
    { base: AUDIO_CAPTURE_FALLBACK_CONSTRAINTS, includePreferredDevice: true },
    { base: AUDIO_CAPTURE_CONSTRAINTS, includePreferredDevice: false },
    { base: AUDIO_CAPTURE_FALLBACK_CONSTRAINTS, includePreferredDevice: false },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    if (!attempt.includePreferredDevice && !hadPreferredMicDevice) {
      continue;
    }

    const audioConstraints = buildAudioCaptureConstraints(attempt.base, {
      includePreferredDevice: attempt.includePreferredDevice,
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      return stream;
    } catch (error) {
      lastError = error;
      if (!isRecoverableMicConstraintError(error)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Failed to capture microphone stream");
}

function applyVoiceTrackHints(track) {
  if (!track) {
    return;
  }

  if ("contentHint" in track) {
    try {
      track.contentHint = "speech";
    } catch {
      // no-op
    }
  }
}

function applyScreenAudioTrackHints(track) {
  if (!track) {
    return;
  }

  if ("contentHint" in track) {
    try {
      track.contentHint = "music";
    } catch {
      // no-op
    }
  }
}

function applyScreenTrackHints(track) {
  if (!track) {
    return;
  }

  if ("contentHint" in track) {
    try {
      track.contentHint = "detail";
    } catch {
      // no-op
    }
  }
}

function isContentDisplayAudioTrack(videoTrack, audioTrack) {
  if (!videoTrack || !audioTrack || audioTrack.kind !== "audio") {
    return false;
  }

  if (isLikelySelfScreenCaptureTrack(videoTrack)) {
    return false;
  }

  const settings =
    typeof videoTrack.getSettings === "function" ? videoTrack.getSettings() || {} : {};
  const displaySurface = String(settings.displaySurface || "").toLowerCase();

  if (
    displaySurface === "browser" ||
    displaySurface === "window" ||
    displaySurface === "application"
  ) {
    return true;
  }

  if (displaySurface === "monitor" || displaySurface === "screen") {
    return false;
  }

  const label = String(videoTrack.label || "").toLowerCase();
  if (!label) {
    return false;
  }

  return label.includes("tab") || label.includes("window");
}

function isLikelySelfScreenCaptureTrack(track) {
  if (!track || track.kind !== "video") {
    return false;
  }

  if (typeof track.getCaptureHandle === "function") {
    try {
      const captureHandle = track.getCaptureHandle();
      const handleValue = String(captureHandle?.handle || "").toLowerCase();
      const originValue = String(captureHandle?.origin || "").toLowerCase();
      const currentOrigin = String(globalThis?.location?.origin || "").toLowerCase();
      if (handleValue === CAPTURE_HANDLE_TOKEN) {
        return true;
      }
      if (handleValue && handleValue.includes(CAPTURE_HANDLE_TOKEN)) {
        return true;
      }
      if (originValue && currentOrigin && originValue === currentOrigin && handleValue) {
        return true;
      }
    } catch {
      // no-op
    }
  }

  const settings =
    typeof track.getSettings === "function" ? track.getSettings() || {} : {};
  const displaySurface = String(settings.displaySurface || "").toLowerCase();
  const isBrowserSurface = displaySurface === "browser";

  const label = String(track.label || "").toLowerCase();
  if (!label) {
    return false;
  }

  const host = String(globalThis?.location?.host || "").toLowerCase();
  const documentTitle = String(globalThis?.document?.title || "").toLowerCase();
  const projectName = String(getProjectName() || "").toLowerCase();
  const markers = [projectName, host].filter(Boolean);
  if (markers.some((marker) => label.includes(marker))) {
    return true;
  }

  if (isBrowserSurface && documentTitle && label.includes(documentTitle)) {
    return true;
  }

  return false;
}

function configureSelfCaptureHandle() {
  const mediaDevices = globalThis?.navigator?.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.setCaptureHandleConfig !== "function") {
    return;
  }

  try {
    mediaDevices.setCaptureHandleConfig({
      handle: CAPTURE_HANDLE_TOKEN,
      exposeOrigin: true,
      permittedOrigins: ["*"],
    });
  } catch {
    // no-op
  }
}

async function optimizeAudioSender(sender, options = {}) {
  if (
    !sender ||
    !sender.track ||
    sender.track.kind !== "audio" ||
    typeof sender.getParameters !== "function" ||
    typeof sender.setParameters !== "function"
  ) {
    return;
  }

  const profile = options.profile === "screen" ? "screen" : "mic";
  const targetMaxBitrate =
    profile === "screen" ? SCREEN_AUDIO_SENDER_MAX_BITRATE : MIC_AUDIO_SENDER_MAX_BITRATE;

  try {
    const params = sender.getParameters() || {};
    const encodings =
      Array.isArray(params.encodings) && params.encodings.length > 0 ? params.encodings : [{}];
    const primaryEncoding = { ...encodings[0] };

    if (
      typeof primaryEncoding.maxBitrate !== "number" ||
      primaryEncoding.maxBitrate < targetMaxBitrate
    ) {
      primaryEncoding.maxBitrate = targetMaxBitrate;
    }

    primaryEncoding.dtx = false;
    params.encodings = [primaryEncoding, ...encodings.slice(1)];

    await sender.setParameters(params);
  } catch {
    // Browser may not support all RTP sender tuning knobs.
  }
}

function getScreenProfileIndex(profileId) {
  const index = SCREEN_QUALITY_PROFILE_ORDER.indexOf(profileId);
  return index === -1 ? 0 : index;
}

function getProfileIdByIndex(index) {
  const clamped = clamp(index, 0, SCREEN_QUALITY_PROFILE_ORDER.length - 1);
  return SCREEN_QUALITY_PROFILE_ORDER[clamped] || "high";
}

function computeLocalScreenQualityProfileId() {
  if (!localScreenTrack) {
    return "high";
  }

  let worstIndex = 0;
  for (const state of screenSenderAbrStateByKey.values()) {
    if (!state || !state.isLocalPublisher) {
      continue;
    }
    worstIndex = Math.max(worstIndex, getScreenProfileIndex(state.profileId));
  }

  return getProfileIdByIndex(worstIndex);
}

function syncLocalScreenQualityProfileFromAbr() {
  const nextProfileId = computeLocalScreenQualityProfileId();
  if (localScreenQualityProfileId === nextProfileId) {
    return;
  }

  localScreenQualityProfileId = nextProfileId;
  renderScreens();
}

function ensureScreenAbrLoop() {
  if (screenAbrTimer || screenSenderAbrStateByKey.size === 0) {
    return;
  }

  screenAbrTimer = setInterval(() => {
    void tickScreenAbrLoop();
  }, SCREEN_ABR_INTERVAL_MS);
}

function stopScreenAbrLoop() {
  if (screenAbrTimer) {
    clearInterval(screenAbrTimer);
    screenAbrTimer = null;
  }
  screenAbrTickInFlight = false;
}
