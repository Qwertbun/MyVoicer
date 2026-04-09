async function refreshProfileDeviceSelectors() {
  if (!profileMicSelect || !profileSpeakerSelect) {
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== "function") {
    profileMicSelect.innerHTML = "";
    profileSpeakerSelect.innerHTML = "";

    const micOption = document.createElement("option");
    micOption.value = "";
    micOption.textContent = t("mediaDevicesApiUnavailable");
    profileMicSelect.appendChild(micOption);
    profileMicSelect.disabled = true;

    const speakerOption = document.createElement("option");
    speakerOption.value = "";
    speakerOption.textContent = t("mediaDevicesApiUnavailable");
    profileSpeakerSelect.appendChild(speakerOption);
    profileSpeakerSelect.disabled = true;
    return;
  }

  let devices = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    devices = [];
  }

  const microphones = devices.filter((device) => device.kind === "audioinput");
  const speakers = devices.filter((device) => device.kind === "audiooutput");

  syncDeviceSelectOptions(
    profileMicSelect,
    microphones,
    preferredMicDeviceId,
    t("defaultMicrophone"),
    t("microphoneGeneric")
  );

  const supportsOutput = browserSupportsAudioOutputSelection();
  if (supportsOutput) {
    syncDeviceSelectOptions(
      profileSpeakerSelect,
      speakers,
      preferredSpeakerDeviceId,
      t("defaultSpeakers"),
      t("speakersGeneric")
    );
    profileSpeakerSelect.disabled = false;
  } else {
    profileSpeakerSelect.innerHTML = "";
    const fallbackOption = document.createElement("option");
    fallbackOption.value = "";
    fallbackOption.textContent = t("speakerSwitchNotSupported");
    profileSpeakerSelect.appendChild(fallbackOption);
    profileSpeakerSelect.disabled = true;
  }
}

function getCurrentRoomLabel() {
  if (!joined) {
    return MAIN_PAGE_LABEL;
  }
  return String(roomState?.id || "").trim() || MAIN_PAGE_LABEL;
}

function updateRoomLabels(roomId = null) {
  const label = String(roomId || getCurrentRoomLabel() || MAIN_PAGE_LABEL);
  const hudTitle = joined ? `${getProjectName()} · #${label}` : getProjectName();

  if (appTitleEl) {
    appTitleEl.textContent = joined ? label : getProjectName();
  }

  if (chatRoomTitleEl) {
    chatRoomTitleEl.textContent = hudTitle;
  }

  if (channelRoomLabelEl) {
    channelRoomLabelEl.textContent = label;
  }

  if (chatInput) {
    chatInput.placeholder = t("chatPlaceholder", { room: label });
  }
}

function getVoiceMembersFromRoom(room) {
  if (Array.isArray(room?.voiceMembers)) {
    return room.voiceMembers;
  }
  return Array.isArray(room?.members) ? room.members : [];
}

function getCurrentVoiceChannelId(room = roomState) {
  const value = String(room?.currentVoiceChannelId || "").trim();
  return value || null;
}

function isInVoiceChannel(room = roomState) {
  return Boolean(getCurrentVoiceChannelId(room));
}

function getVoiceMemberIdsWithoutSelf(room, currentSelfId = selfId) {
  const ids = new Set();
  for (const member of getVoiceMembersFromRoom(room)) {
    const memberId = String(member?.id || "").trim();
    if (!memberId || (currentSelfId && memberId === currentSelfId)) {
      continue;
    }
    ids.add(memberId);
  }
  return ids;
}

function setVoiceCueBaselineFromRoom(room) {
  const nextVoiceChannelId = getCurrentVoiceChannelId(room);
  lastVoiceChannelId = nextVoiceChannelId;
  lastVoiceMemberIds = nextVoiceChannelId ? getVoiceMemberIdsWithoutSelf(room, selfId) : new Set();
  voiceCueBaselineReady = true;
}

function processVoiceRoomCueDiff(nextRoom) {
  if (!joined || !selfId) {
    return;
  }

  if (!voiceCueBaselineReady) {
    setVoiceCueBaselineFromRoom(nextRoom);
    return;
  }

  const previousVoiceChannelId = lastVoiceChannelId;
  const nextVoiceChannelId = getCurrentVoiceChannelId(nextRoom);
  const nextVoiceMemberIds = nextVoiceChannelId
    ? getVoiceMemberIdsWithoutSelf(nextRoom, selfId)
    : new Set();

  let shouldPlayConnectCue = false;
  let shouldPlayDisconnectCue = false;

  // Self transitions: join, leave, and cross-channel switch.
  if (!previousVoiceChannelId && nextVoiceChannelId) {
    shouldPlayConnectCue = true;
  } else if (previousVoiceChannelId && !nextVoiceChannelId) {
    shouldPlayDisconnectCue = true;
  } else if (
    previousVoiceChannelId &&
    nextVoiceChannelId &&
    previousVoiceChannelId !== nextVoiceChannelId
  ) {
    shouldPlayDisconnectCue = true;
    shouldPlayConnectCue = true;
  } else if (
    previousVoiceChannelId &&
    nextVoiceChannelId &&
    previousVoiceChannelId === nextVoiceChannelId
  ) {
    // Participant transitions in the same active room (aggregated per room-state).
    for (const memberId of nextVoiceMemberIds) {
      if (!lastVoiceMemberIds.has(memberId)) {
        shouldPlayConnectCue = true;
        break;
      }
    }

    for (const memberId of lastVoiceMemberIds) {
      if (!nextVoiceMemberIds.has(memberId)) {
        shouldPlayDisconnectCue = true;
        break;
      }
    }
  }

  if (shouldPlayDisconnectCue) {
    VoiceRoomSfx.playDisconnectCue();
  }

  if (shouldPlayConnectCue) {
    VoiceRoomSfx.playConnectCue();
  }

  lastVoiceChannelId = nextVoiceChannelId;
  lastVoiceMemberIds = nextVoiceMemberIds;
  voiceCueBaselineReady = true;
}

function getVoiceChannelsFromRoom(room) {
  if (Array.isArray(room?.voiceChannels) && room.voiceChannels.length > 0) {
    return room.voiceChannels;
  }

  return DEFAULT_VOICE_CHANNEL_IDS.map((id) => ({
    id,
    name: id,
    hostId: null,
    count: 0,
    members: [],
  }));
}

function getVoiceRoomName(channel) {
  const fallback = String(channel?.id || DEFAULT_VOICE_CHANNEL_IDS[0]);
  const text = String(channel?.name || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_VOICE_ROOM_NAME_LENGTH);
  return text || fallback;
}

function getVoiceRoomMembers(channel) {
  if (!Array.isArray(channel?.members)) {
    return [];
  }
  return channel.members;
}

function getUserInitial(name) {
  const normalized = String(name || "G").trim();
  return (normalized.charAt(0) || "G").toUpperCase();
}

function hashStableColorSeed(value) {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function getVoiceWaveColorParams(userId) {
  const baseSeed = hashStableColorSeed(userId);
  const primaryHue = baseSeed % 360;
  const secondaryHue = (primaryHue + 56) % 360;
  return {
    wave1Color: `hsl(${primaryHue} 93% 66% / 0.96)`,
    wave2Color: `hsl(${secondaryHue} 95% 60% / 0.92)`,
  };
}

async function requestCreateVoiceRoom() {
  if (!joined || !roomState) {
    setStatus(t("joinServerFirst"));
    return;
  }

  const suggested = t("roomSuggested", { index: getVoiceChannelsFromRoom(roomState).length + 1 });
  const proposedName = await promptInput(t("promptVoiceRoomName"), suggested);
  if (proposedName === null) {
    return;
  }

  socket.emit("create-voice-channel", { name: proposedName }, (response) => {
    if (!response?.ok) {
      setStatus(response?.error || t("unableCreateVoiceRoom"));
      return;
    }

    setStatus(t("voiceRoomCreated", { name: response.channelName || response.channelId }));
  });
}

async function requestRenameVoiceRoom(channelId, currentName) {
  if (!joined || !roomState) {
    setStatus(t("joinServerFirst"));
    return;
  }

  const proposedName = await promptInput(t("promptRenameVoiceRoom"), currentName);
  if (proposedName === null) {
    return;
  }

  socket.emit("rename-voice-channel", { channelId, name: proposedName }, (response) => {
    if (!response?.ok) {
      setStatus(response?.error || t("unableRenameVoiceRoom"));
      return;
    }

    setStatus(t("voiceRoomRenamed", { name: response.channelName || currentName }));
  });
}

async function requestDeleteVoiceRoom(channelId, channelName) {
  if (!joined || !roomState) {
    setStatus(t("joinServerFirst"));
    return;
  }

  const approved = await confirmInput(t("confirmDeleteVoiceRoom", { name: channelName }));
  if (!approved) {
    return;
  }

  socket.emit("delete-voice-channel", { channelId }, (response) => {
    if (!response?.ok) {
      setStatus(response?.error || t("unableDeleteVoiceRoom"));
      return;
    }

    setStatus(t("voiceRoomDeleted", { name: channelName }));
  });
}

async function requestJoinVoiceChannel(channelId, channelName) {
  if (!joined || !roomState) {
    setStatus(t("joinServerFirst"));
    return;
  }

  const targetChannelId = String(channelId || "").trim();
  if (!targetChannelId) {
    return;
  }

  if (getCurrentVoiceChannelId(roomState) === targetChannelId) {
    return;
  }

  try {
    await ensureLocalStream();
    resumePlaybackContext();
  } catch (error) {
    setStatus(getMicErrorMessage(error));
    return;
  }

  setStatus(t("switchingToVoiceRoom", { name: channelName }));
  socket.emit("join-voice-channel", { channelId: targetChannelId });
}

function renderVoiceChannels() {
  if (!voiceChannelsListEl) {
    return;
  }

  if (addVoiceChannelBtn) {
    addVoiceChannelBtn.disabled = !joined;
  }

  const channels = getVoiceChannelsFromRoom(roomState);
  const activeChannelId = getCurrentVoiceChannelId(roomState);
  const voiceMembersCount = getVoiceMembersFromRoom(roomState).length;
  voiceChannelsListEl.innerHTML = "";

  for (const channel of channels) {
    const channelId = String(channel.id || DEFAULT_VOICE_CHANNEL_IDS[0]);
    const channelName = getVoiceRoomName(channel);
    const channelMembers = getVoiceRoomMembers(channel);
    const parsedCount = Number(channel.count);
    const count = Number.isFinite(parsedCount)
      ? Math.max(0, parsedCount)
      : activeChannelId && channelId === activeChannelId
        ? voiceMembersCount
        : 0;

    const roomBlock = document.createElement("section");
    roomBlock.className = "voice-room-block";
    if (joined && activeChannelId && channelId === activeChannelId) {
      roomBlock.classList.add("active");
    }

    const row = document.createElement("div");
    row.className = "voice-room-row";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "voice-channel-item";
    if (joined && activeChannelId && channelId === activeChannelId) {
      button.classList.add("active");
    }
    button.disabled = !joined;
    button.setAttribute(
      "aria-label",
      joined
        ? t("ariaJoinVoiceRoom", { name: channelName })
        : t("ariaVoiceRoomJoinFirst", { name: channelName })
    );
    button.setAttribute(
      "aria-current",
      joined && activeChannelId && channelId === activeChannelId ? "true" : "false"
    );
    button.setAttribute(
      "aria-pressed",
      joined && activeChannelId && channelId === activeChannelId ? "true" : "false"
    );

    const icon = createMaterialIcon("chevron_right", "voice-channel-icon");

    const label = document.createElement("span");
    label.textContent = channelName;

    const countEl = document.createElement("span");
    countEl.className = "voice-channel-count";
    countEl.textContent = count > 0 ? String(count) : "";

    button.appendChild(icon);
    button.appendChild(label);
    button.appendChild(countEl);

    button.addEventListener("click", () => {
      if (!joined || !roomState) {
        return;
      }

      void requestJoinVoiceChannel(channelId, channelName);
    });

    const actions = document.createElement("div");
    actions.className = "voice-room-actions";

    const renameBtn = document.createElement("button");
    renameBtn.type = "button";
    renameBtn.className = "voice-room-action";
    renameBtn.appendChild(createMaterialIcon("edit"));
    renameBtn.title = t("renameVoiceRoom");
    renameBtn.setAttribute("aria-label", `${t("renameVoiceRoom")}: ${channelName}`);
    renameBtn.disabled = !joined;
    renameBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void requestRenameVoiceRoom(channelId, channelName);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "voice-room-action danger";
    deleteBtn.appendChild(createMaterialIcon("delete"));
    deleteBtn.title = t("deleteVoiceRoom");
    deleteBtn.setAttribute("aria-label", `${t("deleteVoiceRoom")}: ${channelName}`);
    deleteBtn.disabled = !joined || channels.length <= 1;
    deleteBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void requestDeleteVoiceRoom(channelId, channelName);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    row.appendChild(button);
    row.appendChild(actions);
    roomBlock.appendChild(row);

    const membersList = document.createElement("ul");
    membersList.className = "voice-room-members";

    const sortedMembers = [...channelMembers].sort((left, right) => {
      const leftHost = left.id === channel.hostId;
      const rightHost = right.id === channel.hostId;
      if (leftHost !== rightHost) {
        return leftHost ? -1 : 1;
      }

      const leftSelf = left.id === selfId;
      const rightSelf = right.id === selfId;
      if (leftSelf !== rightSelf) {
        return leftSelf ? -1 : 1;
      }

      return String(left.name || "").localeCompare(String(right.name || ""), undefined, {
        sensitivity: "base",
      });
    });

    for (const member of sortedMembers) {
      const memberRow = document.createElement("li");
      memberRow.className = "voice-room-member";
      if (member.id === selfId) {
        memberRow.classList.add("is-self");
      }

      const avatar = document.createElement("span");
      avatar.className = "voice-room-avatar";
      const waveColors = getVoiceWaveColorParams(member.id || member.name);
      avatar.style.setProperty("--voice-wave-1-color", waveColors.wave1Color);
      avatar.style.setProperty("--voice-wave-2-color", waveColors.wave2Color);
      if (isUserSpeaking(member.id)) {
        avatar.classList.add("is-speaking");
      }
      avatar.textContent = getUserInitial(member.name);

      const name = document.createElement("span");
      name.className = "voice-room-member-name";
      name.textContent =
        member.id === selfId ? t("youSuffix", { name: member.name }) : member.name;

      memberRow.appendChild(avatar);
      memberRow.appendChild(name);

      if (member.id === channel.hostId) {
        const hostTag = document.createElement("span");
        hostTag.className = "voice-room-member-tag";
        hostTag.textContent = t("hostTag");
        memberRow.appendChild(hostTag);
      }

      membersList.appendChild(memberRow);
    }

    if (sortedMembers.length > 0) {
      roomBlock.appendChild(membersList);
    }
    voiceChannelsListEl.appendChild(roomBlock);
  }
}

function normalizeRoomIdValue(value) {
  return String(value || "").trim().slice(0, 32);
}

function loadSavedRooms() {
  try {
    const raw = localStorage.getItem(SAVED_ROOMS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const unique = [];
    const known = new Set();
    for (const item of parsed) {
      const roomId = normalizeRoomIdValue(item);
      if (!roomId || roomId.toLowerCase() === MAIN_PAGE_LABEL || known.has(roomId)) {
        continue;
      }

      known.add(roomId);
      unique.push(roomId);
      if (unique.length >= MAX_SAVED_ROOMS) {
        break;
      }
    }

    return unique;
  } catch {
    return [];
  }
}

function persistSavedRooms() {
  try {
    localStorage.setItem(SAVED_ROOMS_STORAGE_KEY, JSON.stringify(savedRooms));
  } catch {
    // no-op
  }
}

function ensureSavedRoom(roomId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId || cleanRoomId.toLowerCase() === MAIN_PAGE_LABEL) {
    return;
  }

  const index = savedRooms.indexOf(cleanRoomId);
  if (index >= 0) {
    savedRooms.splice(index, 1);
  }

  savedRooms.unshift(cleanRoomId);
  if (savedRooms.length > MAX_SAVED_ROOMS) {
    savedRooms.length = MAX_SAVED_ROOMS;
  }

  persistSavedRooms();
  refreshNotificationAutomation({ sync: true });
}

function removeSavedRoom(roomId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId) {
    return false;
  }

  const index = savedRooms.indexOf(cleanRoomId);
  if (index < 0) {
    return false;
  }

  savedRooms.splice(index, 1);

  if (notificationPreviewRoomId === cleanRoomId) {
    notificationPreviewRoomId = "";
  }

  const currentInputRoomId = normalizeRoomIdValue(roomInput?.value);
  if (!joined && currentInputRoomId === cleanRoomId) {
    const fallbackRoomId = normalizeRoomIdValue(savedRooms[0] || "");
    roomInput.value = fallbackRoomId;
    updateRoomLabels(fallbackRoomId || MAIN_PAGE_LABEL);
  }

  persistSavedRooms();
  refreshNotificationAutomation({ sync: true });
  return true;
}

function roomBadgeLabel(roomId) {
  const clean = String(roomId || "").trim();
  if (!clean) {
    return "?";
  }

  const parts = clean.split(/[\s\-_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return clean.slice(0, 2).toUpperCase();
}

function renderSavedRooms() {
  if (!savedRoomsListEl) {
    return;
  }

  const selectedRoomId = joined
    ? normalizeRoomIdValue(roomState?.id)
    : normalizeRoomIdValue(roomInput?.value);
  const previewRoomId = joined ? normalizeRoomIdValue(notificationPreviewRoomId) : "";

  if (homeServerBtn) {
    homeServerBtn.classList.toggle("active", !joined);
  }

  savedRoomsListEl.innerHTML = "";
  for (const roomId of savedRooms) {
    const item = document.createElement("div");
    item.className = "saved-room-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "server-icon room-shortcut";
    button.textContent = roomBadgeLabel(roomId);
    button.title = roomId;
    button.setAttribute("aria-label", t("openServer", { room: roomId }));

    if (roomId === selectedRoomId) {
      button.classList.add("active");
    } else if (roomId === previewRoomId) {
      button.classList.add("notification-selected");
    }

    button.addEventListener("click", () => {
      notificationPreviewRoomId = "";
      roomInput.value = roomId;
      updateRoomLabels(roomId);
      renderSavedRooms();
      void requestJoinRoom(roomId);
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "saved-room-remove-btn";
    removeBtn.textContent = "×";
    removeBtn.title = t("removeServer", { room: roomId });
    removeBtn.setAttribute("aria-label", t("removeServer", { room: roomId }));
    removeBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const approved = await confirmInput(t("confirmRemoveServer", { room: roomId }));
      if (!approved) {
        return;
      }

      if (removeSavedRoom(roomId)) {
        renderSavedRooms();
        setStatus(t("serverRemoved", { room: roomId }));
      }
    });

    item.appendChild(button);
    item.appendChild(removeBtn);
    savedRoomsListEl.appendChild(item);
  }
}

function updateChatAvailability() {
  const enabled = joined && !chatSubmitInProgress;
  document.body.classList.toggle("is-lobby-mode", !joined);
  updateTopbarMeta();
  if (!enabled) {
    chatDropTargetDepth = 0;
    if (chatColumnEl) {
      chatColumnEl.classList.remove("chat-drop-active");
    }
  }
  if (chatInput) {
    chatInput.disabled = !enabled;
  }
  if (chatSendBtn) {
    chatSendBtn.disabled = !enabled;
  }
  if (chatAttachBtn) {
    chatAttachBtn.disabled = !enabled;
  }
  if (chatFileInput) {
    chatFileInput.disabled = !enabled;
  }
  updateVoiceControlsAvailability();
}

function formatChatTime(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  return date.toLocaleTimeString(getCurrentTimeLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFileSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let normalized = size;

  while (normalized >= 1024 && unitIndex < units.length - 1) {
    normalized /= 1024;
    unitIndex += 1;
  }

  const rounded = normalized >= 100
    ? Math.round(normalized)
    : normalized >= 10
      ? normalized.toFixed(1)
      : normalized.toFixed(2);

  return `${rounded} ${units[unitIndex]}`;
}

function normalizeChatAttachmentMimeType(value) {
  const mime = String(value || "").trim().toLowerCase();
  if (/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime)) {
    return mime;
  }
  return "application/octet-stream";
}

function getChatAttachmentPreviewKind(mimeType) {
  const normalizedMime = normalizeChatAttachmentMimeType(mimeType);
  if (normalizedMime.startsWith("image/")) {
    return "image";
  }
  if (normalizedMime.startsWith("video/")) {
    return "video";
  }
  return "file";
}

function normalizeIncomingChatAttachment(attachment, index) {
  if (!attachment || typeof attachment !== "object") {
    return null;
  }

  const name = String(attachment.name || "").trim().slice(0, 120) || `file-${index + 1}`;
  const mimeType = normalizeChatAttachmentMimeType(attachment.mimeType);
  const size = Number(attachment.size);
  const normalizedSize = Number.isFinite(size) && size > 0 ? Math.round(size) : 0;
  const url = String(attachment.url || "").trim();
  const encrypted = Boolean(attachment.encrypted);
  const transportRaw = String(attachment.transport || "").trim().toLowerCase();
  const chunkSize = Number(attachment.chunkSize);
  const totalChunks = Number(attachment.totalChunks);
  const normalizedChunkSize = Number.isFinite(chunkSize) && chunkSize > 0 ? Math.round(chunkSize) : 0;
  const normalizedTotalChunks = Number.isFinite(totalChunks) && totalChunks > 0
    ? Math.round(totalChunks)
    : 0;
  const transport = (
    encrypted
    && transportRaw === RELAY_ATTACHMENT_TRANSPORT_S3_V2
    && String(attachment.objectKey || "").trim()
    && String(attachment.fileKey || "").trim()
    && String(attachment.noncePrefix || "").trim()
    && normalizedChunkSize > 0
    && normalizedTotalChunks > 0
  )
    ? RELAY_ATTACHMENT_TRANSPORT_S3_V2
    : "";
  if (!encrypted && (!url || !(url.startsWith("/") || /^https?:\/\//i.test(url)))) {
    return null;
  }

  return {
    id: String(attachment.id || `${Date.now()}-${index}`),
    messageId: String(attachment.messageId || "").trim().slice(0, 96),
    roomId: normalizeRoomIdValue(attachment.roomId),
    name,
    mimeType,
    size: normalizedSize,
    url,
    previewKind: getChatAttachmentPreviewKind(mimeType),
    encrypted,
    transport,
    objectKey: transport === RELAY_ATTACHMENT_TRANSPORT_S3_V2
      ? String(attachment.objectKey || "").trim().slice(0, 512)
      : "",
    fileKey: transport === RELAY_ATTACHMENT_TRANSPORT_S3_V2
      ? String(attachment.fileKey || "").trim().slice(0, 256)
      : "",
    noncePrefix: transport === RELAY_ATTACHMENT_TRANSPORT_S3_V2
      ? String(attachment.noncePrefix || "").trim().slice(0, 64)
      : "",
    chunkSize: transport === RELAY_ATTACHMENT_TRANSPORT_S3_V2 ? normalizedChunkSize : 0,
    totalChunks: transport === RELAY_ATTACHMENT_TRANSPORT_S3_V2 ? normalizedTotalChunks : 0,
  };
}

function normalizeIncomingChatAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const normalized = [];
  for (let index = 0; index < attachments.length; index += 1) {
    if (normalized.length >= MAX_CHAT_ATTACHMENTS) {
      break;
    }
    const item = normalizeIncomingChatAttachment(attachments[index], index);
    if (item) {
      normalized.push(item);
    }
  }
  return normalized;
}

function normalizeIncomingChatMessage(message) {
  if (!message || !message.id) {
    return null;
  }

  const normalizedText = String(message.text || "");
  const normalizedAttachments = normalizeIncomingChatAttachments(message.attachments);
  if (!normalizedText && normalizedAttachments.length === 0) {
    return null;
  }

  const createdAt = Number(message.createdAt);
  const editedAt = Number(message.editedAt);

  return {
    id: String(message.id),
    roomId: normalizeRoomIdValue(message.roomId || roomState?.id),
    userId: String(message.userId || ""),
    userName: String(message.userName || t("guest")),
    text: normalizedText,
    attachments: normalizedAttachments,
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? Math.round(createdAt) : Date.now(),
    editedAt: Number.isFinite(editedAt) && editedAt > 0 ? Math.round(editedAt) : null,
  };
}

function normalizeRelayV2AttachmentMeta(value = {}, fallbackMessageId = "") {
  if (!value || typeof value !== "object") {
    return null;
  }
  const attachmentId = String(value.attachmentId || "").trim().slice(0, 96);
  const objectKey = String(value.objectKey || "").trim().slice(0, 512);
  const fileKey = String(value.fileKey || "").trim().slice(0, 256);
  const noncePrefix = String(value.noncePrefix || "").trim().slice(0, 64);
  const chunkSize = Number(value.chunkSize);
  const totalChunks = Number(value.totalChunks);
  const size = Number(value.size);
  const messageId = String(value.messageId || fallbackMessageId || "").trim().slice(0, 96);
  if (!attachmentId || !objectKey || !fileKey || !noncePrefix || !messageId) {
    return null;
  }
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    return null;
  }
  if (!Number.isFinite(totalChunks) || totalChunks <= 0) {
    return null;
  }
  if (!Number.isFinite(size) || size <= 0) {
    return null;
  }

  return {
    attachmentId,
    messageId,
    transport: RELAY_ATTACHMENT_TRANSPORT_S3_V2,
    objectKey,
    fileKey,
    noncePrefix,
    chunkSize: Math.round(chunkSize),
    totalChunks: Math.round(totalChunks),
    name: String(value.name || "file").trim().slice(0, 120) || "file",
    mimeType: normalizeChatAttachmentMimeType(value.mimeType),
    size: Math.round(size),
  };
}

function createRelayAttachmentViewModel(roomId, messageId, attachmentMeta, decryptedMetaById = new Map()) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const cleanMessageId = String(messageId || "").trim();
  const cleanAttachmentId = String(attachmentMeta?.attachmentId || "").trim();
  const attachmentIdForLookup = cleanAttachmentId || `${cleanMessageId}-attachment`;
  const localPreview = getRelayLocalAttachmentPreview(
    cleanRoomId,
    cleanMessageId,
    attachmentIdForLookup
  );
  const decryptedMeta = decryptedMetaById instanceof Map
    ? decryptedMetaById.get(attachmentIdForLookup) || null
    : null;
  const isV2 = decryptedMeta?.transport === RELAY_ATTACHMENT_TRANSPORT_S3_V2
    || attachmentMeta?.transport === RELAY_ATTACHMENT_TRANSPORT_S3_V2;
  const mimeType = normalizeChatAttachmentMimeType(
    decryptedMeta?.mimeType || attachmentMeta?.mimeType || localPreview?.mimeType
  );
  const previewKind = localPreview?.previewKind || getChatAttachmentPreviewKind(mimeType);

  return {
    id: attachmentIdForLookup,
    messageId: cleanMessageId,
    roomId: cleanRoomId,
    name: String(
      decryptedMeta?.name
      || attachmentMeta?.name
      || localPreview?.name
      || t("encryptedAttachment")
    ).trim().slice(0, 120) || t("encryptedAttachment"),
    mimeType,
    size: Number.isFinite(Number(decryptedMeta?.size || attachmentMeta?.size))
      ? Math.max(0, Math.round(Number(decryptedMeta?.size || attachmentMeta?.size)))
      : Number.isFinite(Number(localPreview?.size))
        ? Math.max(0, Math.round(Number(localPreview.size)))
        : 0,
    url: String(localPreview?.url || "").trim(),
    previewKind,
    encrypted: true,
    transport: isV2 ? RELAY_ATTACHMENT_TRANSPORT_S3_V2 : "",
    objectKey: isV2
      ? String(decryptedMeta?.objectKey || attachmentMeta?.objectKey || "").trim()
      : "",
    fileKey: isV2 ? String(decryptedMeta?.fileKey || "").trim() : "",
    noncePrefix: isV2 ? String(decryptedMeta?.noncePrefix || "").trim() : "",
    chunkSize: isV2 ? Number(decryptedMeta?.chunkSize) || 0 : 0,
    totalChunks: isV2 ? Number(decryptedMeta?.totalChunks) || 0 : 0,
  };
}

async function hydrateRelayAttachmentUrl(roomId, messageId, attachmentId) {
  const message = getChatMessageById(messageId);
  if (!message || !Array.isArray(message.attachments)) {
    return false;
  }

  const attachment = message.attachments.find((item) => String(item?.id || "") === String(attachmentId || "").trim());
  if (!attachment) {
    return false;
  }

  if (attachment.url) {
    return true;
  }

  const cipherRecord = await loadRelayAttachmentCipher(roomId, attachment.id);
  if (!cipherRecord) {
    return false;
  }

  try {
    const blob = await decryptRelayAttachmentToBlob(roomId, cipherRecord);
    attachment.url = URL.createObjectURL(blob);
    attachment.previewKind = getChatAttachmentPreviewKind(cipherRecord.mimeType);
    attachment.encrypted = true;
    return true;
  } catch {
    setStatus(t("decryptFailed"));
    return false;
  }
}

async function storeRelayAttachmentPayloads(roomId, payloads = [], sourceId = "") {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId) {
    return;
  }

  for (const payload of payloads) {
    const normalized = normalizeRelayAttachmentPayloadShape(payload);
    if (!normalized) {
      continue;
    }

    await storeRelayAttachmentCipher(cleanRoomId, normalized);
    registerRelayAttachmentSource(
      cleanRoomId,
      normalized.messageId,
      normalized.attachmentId,
      sourceId
    );
  }
}

async function decryptRelayEnvelopeToMessage(envelope, sourceId = "") {
  const normalizedEnvelope = normalizeRelayEnvelopeShape(envelope);
  if (!normalizedEnvelope) {
    return null;
  }

  let decrypted = null;
  try {
    decrypted = await decryptRelayPayload(
      normalizedEnvelope.roomId,
      normalizedEnvelope.iv,
      normalizedEnvelope.ciphertext
    );
  } catch {
    setStatus(t("decryptFailed"));
    return null;
  }

  const payload = decrypted && typeof decrypted === "object" ? decrypted : {};
  const messageUserId = String(payload.userId || normalizedEnvelope.senderId || "").trim();
  const decryptedAttachmentsV2 = Array.isArray(payload.attachmentsV2)
    ? payload.attachmentsV2
        .map((item) => normalizeRelayV2AttachmentMeta(item, normalizedEnvelope.messageId))
        .filter(Boolean)
    : [];
  const decryptedMetaById = new Map(
    decryptedAttachmentsV2.map((item) => [item.attachmentId, item])
  );
  const attachments = Array.isArray(normalizedEnvelope.attachmentRefs)
    ? normalizedEnvelope.attachmentRefs.map((item) => createRelayAttachmentViewModel(
      normalizedEnvelope.roomId,
      normalizedEnvelope.messageId,
      item,
      decryptedMetaById
    ))
    : [];

  for (const attachment of attachments) {
    registerRelayAttachmentSource(
      normalizedEnvelope.roomId,
      normalizedEnvelope.messageId,
      attachment.id,
      sourceId || normalizedEnvelope.senderId
    );
    if (selfId && messageUserId && messageUserId === CHAT_AUTHOR_ID) {
      registerRelayAttachmentSource(
        normalizedEnvelope.roomId,
        normalizedEnvelope.messageId,
        attachment.id,
        selfId
      );
    }
  }

  return {
    id: normalizedEnvelope.messageId,
    roomId: normalizedEnvelope.roomId,
    userId: messageUserId,
    userName: String(payload.userName || t("guest")).trim() || t("guest"),
    text: String(payload.text || ""),
    attachments,
    createdAt: normalizedEnvelope.createdAt,
    editedAt: Number(payload.editedAt) > 0 ? Math.round(Number(payload.editedAt)) : null,
    relayEnvelope: normalizedEnvelope,
  };
}

async function handleRelayChatPacket(packet, { fromReplay = false } = {}) {
  const roomId = normalizeRoomIdValue(packet?.roomId || roomState?.id);
  const normalizedEnvelope = normalizeRelayEnvelopeShape(packet?.envelope, roomId);
  if (!normalizedEnvelope) {
    return;
  }

  if (Array.isArray(normalizedEnvelope.attachmentRefs) && normalizedEnvelope.attachmentRefs.length > 0) {
    const refs = normalizedEnvelope.attachmentRefs.map((item) => ({
      attachmentId: item.attachmentId,
      transport: item.transport || "",
      hasObjectKey: Boolean(String(item.objectKey || "").trim()),
    }));
    console.info("relay_chat_attachment_refs_incoming", {
      roomId: normalizedEnvelope.roomId,
      messageId: normalizedEnvelope.messageId,
      sourceId: String(packet?.sourceId || "").trim(),
      fromReplay: Boolean(fromReplay),
      transportVersion: Number(normalizedEnvelope.transportVersion) || 1,
      refs,
      refsSummary: refs.map((item) => `${item.attachmentId}:${item.transport || "legacy"}:${item.hasObjectKey ? "ok" : "no-key"}`),
    });
  }

  if (roomState?.id && normalizeRoomIdValue(roomState.id) !== normalizedEnvelope.roomId) {
    return;
  }

  const sourceId = String(packet?.sourceId || "").trim();
  const attachmentPayloads = Array.isArray(packet?.attachmentPayloads)
    ? packet.attachmentPayloads
        .map((item) => normalizeRelayAttachmentPayloadShape(item, normalizedEnvelope.messageId))
        .filter(Boolean)
    : [];

  await storeRelayEnvelopeRecord(normalizedEnvelope.roomId, normalizedEnvelope, sourceId);
  relayMessageEnvelopeCache.set(normalizedEnvelope.messageId, normalizedEnvelope);

  if (attachmentPayloads.length > 0) {
    await storeRelayAttachmentPayloads(normalizedEnvelope.roomId, attachmentPayloads, sourceId);
  }

  const decryptedMessage = await decryptRelayEnvelopeToMessage(normalizedEnvelope, sourceId);
  if (!decryptedMessage) {
    return;
  }

  upsertChatMessage(decryptedMessage);
  renderChat();

  const notificationMessage = {
    id: decryptedMessage.id,
    roomId: normalizedEnvelope.roomId,
    userId: decryptedMessage.userId,
    userName: decryptedMessage.userName,
    text: decryptedMessage.text,
    createdAt: decryptedMessage.createdAt,
  };

  if (fromReplay) {
    setNotificationCheckpoint(normalizedEnvelope.roomId, notificationMessage);
    rememberProcessedNotificationMessageId(decryptedMessage.id);
    return;
  }

  await handleRealtimeNotificationMessage(notificationMessage, normalizedEnvelope.roomId);
}

async function loadRelayRoomHistory(roomId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId) {
    return;
  }

  const roomKey = await ensureRelayRoomKey(cleanRoomId);
  if (!roomKey) {
    setStatus(t("roomKeyRequired"));
    return;
  }

  const records = await loadRelayEnvelopeRecords(cleanRoomId, RELAY_HISTORY_REPLAY_LIMIT);
  const restored = [];

  for (const record of records) {
    const normalizedEnvelope = normalizeRelayEnvelopeShape(record?.envelope, cleanRoomId);
    if (!normalizedEnvelope) {
      continue;
    }

    relayMessageEnvelopeCache.set(normalizedEnvelope.messageId, normalizedEnvelope);
    const decrypted = await decryptRelayEnvelopeToMessage(normalizedEnvelope, record?.sourceId || "");
    if (decrypted) {
      restored.push(decrypted);
    }
  }

  seedNotificationCheckpointFromMessages(cleanRoomId, restored);
  for (const message of restored) {
    rememberProcessedNotificationMessageId(message.id);
  }
  replaceChatMessages(restored);
}

async function requestRelayHistoryReplay(roomId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId || !selfId) {
    return;
  }

  setStatus(t("relayHistorySyncing"));
  const requestId = createRelayRequestId("history");
  socket.emit("relay-history-request", {
    roomId: cleanRoomId,
    requestId,
    requesterId: selfId,
  });
}

async function sendRelayHistoryChunkToRequester({ roomId, requestId, requesterId }) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const cleanRequesterId = String(requesterId || "").trim();
  const cleanRequestId = String(requestId || "").trim().slice(0, 96);
  if (!cleanRoomId || !cleanRequesterId || !cleanRequestId) {
    return;
  }

  const records = await loadRelayEnvelopeRecords(cleanRoomId, RELAY_HISTORY_REPLAY_LIMIT);
  const envelopes = [];
  let byteSize = 0;

  for (const record of records) {
    const normalizedEnvelope = normalizeRelayEnvelopeShape(record?.envelope, cleanRoomId);
    if (!normalizedEnvelope) {
      continue;
    }

    const estimated = estimatePayloadSize(normalizedEnvelope);
    if (byteSize + estimated > RELAY_HISTORY_REPLAY_MAX_BYTES) {
      break;
    }

    byteSize += estimated;
    envelopes.push(normalizedEnvelope);
  }

  if (envelopes.length === 0) {
    return;
  }

  socket.emit("relay-history-chunk", {
    roomId: cleanRoomId,
    requestId: cleanRequestId,
    targetId: cleanRequesterId,
    envelopes,
  });
}

function buildRelayV2ChunkIv(noncePrefixBase64, chunkIndex) {
  const prefix = base64ToUint8Array(noncePrefixBase64);
  if (prefix.length !== 8) {
    throw new Error("invalid_nonce_prefix");
  }
  const normalizedChunkIndex = Number(chunkIndex);
  if (!Number.isFinite(normalizedChunkIndex) || normalizedChunkIndex < 0) {
    throw new Error("invalid_chunk_index");
  }
  const iv = new Uint8Array(12);
  iv.set(prefix, 0);
  const view = new DataView(iv.buffer);
  view.setUint32(8, Math.round(normalizedChunkIndex), false);
  return iv;
}

async function importRelayV2FileKey(fileKeyBase64, usage = ["encrypt", "decrypt"]) {
  const bytes = base64ToUint8Array(fileKeyBase64);
  if (bytes.length !== 32) {
    throw new Error("invalid_file_key");
  }
  return crypto.subtle.importKey(
    "raw",
    bytes,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    usage
  );
}

async function encryptRelayV2AttachmentChunk(fileKeyBase64, noncePrefixBase64, chunkIndex, plainBuffer) {
  const key = await importRelayV2FileKey(fileKeyBase64, ["encrypt"]);
  const iv = buildRelayV2ChunkIv(noncePrefixBase64, chunkIndex);
  return crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    plainBuffer
  );
}

async function decryptRelayV2AttachmentChunk(fileKeyBase64, noncePrefixBase64, chunkIndex, cipherBuffer) {
  const key = await importRelayV2FileKey(fileKeyBase64, ["decrypt"]);
  const iv = buildRelayV2ChunkIv(noncePrefixBase64, chunkIndex);
  return crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    cipherBuffer
  );
}

async function relayV2InitUpload(roomId, sessionDraft) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  return relayApiRequest("/api/relay/uploads/init", {
    method: "POST",
    roomId: cleanRoomId,
    body: {
      roomId: cleanRoomId,
      messageId: sessionDraft.messageId,
      attachmentId: sessionDraft.attachmentId,
      size: sessionDraft.size,
      mimeType: sessionDraft.mimeType,
      chunkSize: sessionDraft.chunkSize,
      fileFingerprint: sessionDraft.fileFingerprint,
    },
  });
}

async function relayV2GetPartUploadUrl(roomId, sessionId, partNumber) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  return relayApiRequest("/api/relay/uploads/part-url", {
    method: "POST",
    roomId: cleanRoomId,
    body: {
      roomId: cleanRoomId,
      sessionId,
      partNumber,
    },
  });
}

async function relayV2GetUploadStatus(roomId, sessionId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const token = await ensureRelayCapabilityToken(cleanRoomId);
  let statusUrl = `/api/relay/uploads/status?roomId=${encodeURIComponent(cleanRoomId)}&sessionId=${encodeURIComponent(sessionId)}&capability=${encodeURIComponent(token)}`;
  let response = await fetch(
    statusUrl,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  if (response.status === 401) {
    const refreshed = await ensureRelayCapabilityToken(cleanRoomId, { forceRefresh: true });
    statusUrl = `/api/relay/uploads/status?roomId=${encodeURIComponent(cleanRoomId)}&sessionId=${encodeURIComponent(sessionId)}&capability=${encodeURIComponent(refreshed)}`;
    response = await fetch(
      statusUrl,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${refreshed}`,
        },
      }
    );
  }

  const payload = await response.json();
  if (!response.ok || payload?.ok === false) {
    throw new Error(String(payload?.error || `status_${response.status}`));
  }
  return payload;
}

async function relayV2CompleteUpload(roomId, sessionId, parts) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  return relayApiRequest("/api/relay/uploads/complete", {
    method: "POST",
    roomId: cleanRoomId,
    body: {
      roomId: cleanRoomId,
      sessionId,
      parts,
    },
  });
}

async function relayV2AbortUpload(roomId, sessionId) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  return relayApiRequest("/api/relay/uploads/abort", {
    method: "POST",
    roomId: cleanRoomId,
    body: {
      roomId: cleanRoomId,
      sessionId,
    },
  });
}

function getRelayUploadLimits() {
  return {
    maxFileBytes: Number(relayUploadLimits?.maxFileBytes) > 0
      ? Math.round(Number(relayUploadLimits.maxFileBytes))
      : RELAY_V2_MAX_FILE_BYTES,
    maxTotalMessageBytes: Number(relayUploadLimits?.maxTotalMessageBytes) > 0
      ? Math.round(Number(relayUploadLimits.maxTotalMessageBytes))
      : RELAY_V2_MAX_TOTAL_MESSAGE_BYTES,
    chunkSizeBytes: Number(relayUploadLimits?.chunkSizeBytes) > 0
      ? Math.round(Number(relayUploadLimits.chunkSizeBytes))
      : RELAY_V2_UPLOAD_CHUNK_SIZE_BYTES,
  };
}

async function uploadRelayV2Attachment(roomId, attachment, messageId, { allowMessageIdAdopt = false } = {}) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  if (!cleanRoomId) {
    throw new Error("relay_room_required");
  }
  if (!attachment?.file || !(attachment.file instanceof File)) {
    throw new Error("attachment_file_required");
  }

  const limits = getRelayUploadLimits();
  if (attachment.size > limits.maxFileBytes) {
    throw new Error("attachment_too_large");
  }

  const fileFingerprint = buildRelayUploadFileFingerprint(attachment);
  const chunkSize = limits.chunkSizeBytes;
  const totalChunks = Math.max(1, Math.ceil(attachment.size / chunkSize));
  let uploadSession = await loadRelayUploadSessionEntry(cleanRoomId, fileFingerprint);
  const isResumable = uploadSession
    && uploadSession.size === attachment.size
    && uploadSession.chunkSize === chunkSize
    && (
      uploadSession.messageId === messageId
      || (allowMessageIdAdopt && uploadSession.messageId)
    );

  if (!isResumable) {
    if (uploadSession?.sessionId) {
      await relayV2AbortUpload(cleanRoomId, uploadSession.sessionId).catch(() => {
        // no-op
      });
      await deleteRelayUploadSessionEntry(cleanRoomId, fileFingerprint).catch(() => {
        // no-op
      });
    }
    uploadSession = null;
  }

  if (!uploadSession) {
    const draft = {
      roomId: cleanRoomId,
      messageId,
      attachmentId: createRelayRequestId("att"),
      size: attachment.size,
      mimeType: attachment.mimeType,
      chunkSize,
      fileFingerprint,
      fileKey: arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(32))),
      noncePrefix: arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(8))),
      totalChunks,
      name: attachment.name,
    };
    const init = await relayV2InitUpload(cleanRoomId, draft);
    uploadSession = {
      ...draft,
      sessionId: String(init.sessionId || ""),
      uploadId: String(init.uploadId || ""),
      objectKey: String(init.objectKey || ""),
      updatedAt: Date.now(),
    };
    await storeRelayUploadSessionEntry(uploadSession);
  }

  let statusPayload = await relayV2GetUploadStatus(cleanRoomId, uploadSession.sessionId);
  const uploadedPartSet = new Set(
    Array.isArray(statusPayload?.uploadedParts)
      ? statusPayload.uploadedParts.map((item) => Number(item?.partNumber)).filter((item) => Number.isFinite(item))
      : []
  );

  for (let partNumber = 1; partNumber <= uploadSession.totalChunks; partNumber += 1) {
    if (uploadedPartSet.has(partNumber)) {
      continue;
    }

    const start = (partNumber - 1) * uploadSession.chunkSize;
    const end = Math.min(attachment.size, start + uploadSession.chunkSize);
    const plainBuffer = await attachment.file.slice(start, end).arrayBuffer();
    const encryptedBuffer = await encryptRelayV2AttachmentChunk(
      uploadSession.fileKey,
      uploadSession.noncePrefix,
      partNumber - 1,
      plainBuffer
    );
    const maxPartUploadAttempts = 3;
    let uploaded = false;
    let uploadError = null;
    for (let attempt = 1; attempt <= maxPartUploadAttempts; attempt += 1) {
      try {
        const partUrlPayload = await relayV2GetPartUploadUrl(cleanRoomId, uploadSession.sessionId, partNumber);
        const uploadHeaders = {
          "Content-Type": "application/octet-stream",
        };
        let uploadUrl = partUrlPayload.url;
        if (String(partUrlPayload?.url || "").startsWith("/api/")) {
          const partToken = await ensureRelayCapabilityToken(cleanRoomId);
          uploadHeaders.Authorization = `Bearer ${partToken}`;
          uploadUrl = `${partUrlPayload.url}${partUrlPayload.url.includes("?") ? "&" : "?"}capability=${encodeURIComponent(partToken)}`;
        }
        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          body: encryptedBuffer,
          headers: uploadHeaders,
        });
        if (!uploadResponse.ok) {
          throw new Error(`relay_upload_part_failed_${uploadResponse.status}`);
        }
        uploaded = true;
        uploadError = null;
        break;
      } catch (error) {
        uploadError = error;
        if (attempt >= maxPartUploadAttempts) {
          break;
        }
        console.warn("relay_v2_part_upload_retry", {
          roomId: cleanRoomId,
          messageId: uploadSession.messageId,
          attachmentId: uploadSession.attachmentId,
          sessionId: uploadSession.sessionId,
          partNumber,
          attempt,
          maxAttempts: maxPartUploadAttempts,
          error: String(error?.message || "unknown"),
        });
        await delayMs(250 * attempt);
      }
    }
    if (!uploaded) {
      throw uploadError || new Error("relay_upload_part_failed");
    }

    uploadSession.updatedAt = Date.now();
    await storeRelayUploadSessionEntry(uploadSession);

    const progress = Math.round((partNumber / uploadSession.totalChunks) * 100);
    setStatus(`Uploading ${attachment.name}: ${progress}%`);
  }

  statusPayload = await relayV2GetUploadStatus(cleanRoomId, uploadSession.sessionId);
  const completeParts = Array.isArray(statusPayload?.uploadedParts)
    ? statusPayload.uploadedParts
        .map((item) => ({
          partNumber: Number(item?.partNumber),
          etag: String(item?.etag || "").trim(),
        }))
        .filter((item) => Number.isFinite(item.partNumber) && item.partNumber > 0 && item.etag)
        .sort((left, right) => left.partNumber - right.partNumber)
    : [];
  if (completeParts.length < uploadSession.totalChunks) {
    throw new Error("relay_upload_incomplete");
  }

  await relayV2CompleteUpload(cleanRoomId, uploadSession.sessionId, completeParts);
  await deleteRelayUploadSessionEntry(cleanRoomId, fileFingerprint);

  return {
    messageId: uploadSession.messageId,
    attachmentId: uploadSession.attachmentId,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
    transport: RELAY_ATTACHMENT_TRANSPORT_S3_V2,
    objectKey: uploadSession.objectKey,
    fileKey: uploadSession.fileKey,
    noncePrefix: uploadSession.noncePrefix,
    chunkSize: uploadSession.chunkSize,
    totalChunks: uploadSession.totalChunks,
  };
}

async function relayV2GetDownloadUrl(roomId, objectKey) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  return relayApiRequest("/api/relay/attachments/download-url", {
    method: "POST",
    roomId: cleanRoomId,
    body: {
      roomId: cleanRoomId,
      objectKey,
    },
  });
}

function concatUint8Arrays(parts) {
  const list = Array.isArray(parts) ? parts : [];
  const total = list.reduce((acc, item) => acc + (item?.length || 0), 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of list) {
    if (!(part instanceof Uint8Array) || part.length === 0) {
      continue;
    }
    combined.set(part, offset);
    offset += part.length;
  }
  return combined;
}

async function decryptRelayV2AttachmentResponse(response, attachment, onChunk, onProgress) {
  const totalChunks = Number(attachment?.totalChunks);
  const chunkSize = Number(attachment?.chunkSize);
  const totalSize = Number(attachment?.size);
  const fileKey = String(attachment?.fileKey || "");
  const noncePrefix = String(attachment?.noncePrefix || "");
  if (
    !Number.isFinite(totalChunks)
    || totalChunks <= 0
    || !Number.isFinite(chunkSize)
    || chunkSize <= 0
    || !Number.isFinite(totalSize)
    || totalSize <= 0
    || !fileKey
    || !noncePrefix
  ) {
    throw new Error("relay_v2_attachment_meta_invalid");
  }
  if (!response?.body) {
    throw new Error("relay_v2_attachment_stream_unavailable");
  }

  const reader = response.body.getReader();
  let pending = new Uint8Array(0);
  let decryptedBytes = 0;

  try {
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const plainSize = chunkIndex === totalChunks - 1
        ? totalSize - chunkSize * (totalChunks - 1)
        : chunkSize;
      const encryptedSize = plainSize + 16;
      while (pending.length < encryptedSize) {
        const { done, value } = await reader.read();
        if (done) {
          throw new Error("relay_v2_attachment_truncated");
        }
        const incoming = value instanceof Uint8Array ? value : new Uint8Array(value);
        pending = concatUint8Arrays([pending, incoming]);
      }

      const encryptedChunk = pending.slice(0, encryptedSize);
      pending = pending.slice(encryptedSize);
      const decryptedChunk = await decryptRelayV2AttachmentChunk(
        fileKey,
        noncePrefix,
        chunkIndex,
        encryptedChunk
      );
      const decryptedView = decryptedChunk instanceof Uint8Array
        ? decryptedChunk
        : new Uint8Array(decryptedChunk);
      decryptedBytes += decryptedView.length;
      if (typeof onChunk === "function") {
        await onChunk(decryptedView);
      }
      if (typeof onProgress === "function") {
        onProgress(decryptedBytes, totalSize);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // no-op
    }
  }
}

async function saveRelayV2AttachmentViaFileSystemApi(response, attachment) {
  const picker = window.showSaveFilePicker;
  if (typeof picker !== "function") {
    return false;
  }
  const suggestedName = String(attachment?.name || "file").trim() || "file";
  const handle = await picker({
    suggestedName,
  });
  const writable = await handle.createWritable();
  try {
    await decryptRelayV2AttachmentResponse(
      response,
      attachment,
      async (chunk) => {
        await writable.write(chunk);
      },
      (loaded, total) => {
        const progress = Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
        setStatus(`Downloading ${suggestedName}: ${progress}%`);
      }
    );
    await writable.close();
    return true;
  } catch (error) {
    try {
      await writable.abort();
    } catch {
      // no-op
    }
    throw error;
  }
}

async function saveRelayV2AttachmentViaBlob(response, attachment) {
  const chunks = [];
  await decryptRelayV2AttachmentResponse(
    response,
    attachment,
    async (chunk) => {
      chunks.push(chunk);
    },
    (loaded, total) => {
      const progress = Math.min(100, Math.max(0, Math.round((loaded / total) * 100)));
      setStatus(`Downloading ${attachment.name}: ${progress}%`);
    }
  );
  const blob = new Blob(chunks, {
    type: normalizeChatAttachmentMimeType(attachment?.mimeType),
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = String(attachment?.name || "file").trim() || "file";
  link.rel = "noopener noreferrer";
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30000);
}

function reportAttachmentSourceUnavailable(reason, context = {}, error = null) {
  const details = {
    reason: String(reason || "unknown").trim() || "unknown",
    ...(context && typeof context === "object" ? context : {}),
  };
  setStatus(t("attachmentSourceUnavailable"));
  if (error) {
    console.error("attachment_source_unavailable", details, error);
    return;
  }
  console.error("attachment_source_unavailable", details);
}

function reportLegacyRelayAttachmentUnsupported(attachment, roomId = "") {
  setStatus(t("legacyRelayAttachmentUnsupported"));
  console.warn("legacy_relay_attachment_unsupported", {
    roomId: normalizeRoomIdValue(roomId || attachment?.roomId || roomState?.id),
    messageId: String(attachment?.messageId || "").trim(),
    attachmentId: String(attachment?.id || "").trim(),
    transport: String(attachment?.transport || "").trim(),
  });
}

async function downloadRelayV2Attachment(attachment, roomId) {
  const candidateRoomIds = Array.from(
    new Set(
      [attachment?.roomId, roomId, roomState?.id]
        .map((value) => normalizeRoomIdValue(value))
        .filter(Boolean)
    )
  );
  if (candidateRoomIds.length === 0) {
    reportAttachmentSourceUnavailable("missing_room_id", {
      attachmentId: String(attachment?.id || "").trim(),
      messageId: String(attachment?.messageId || "").trim(),
    });
    return;
  }
  const objectKey = String(attachment?.objectKey || "").trim();
  if (!objectKey) {
    reportAttachmentSourceUnavailable("missing_object_key", {
      attachmentId: String(attachment?.id || "").trim(),
      messageId: String(attachment?.messageId || "").trim(),
      roomIdCandidates: candidateRoomIds,
    });
    return;
  }

  let lastError = null;
  for (const candidateRoomId of candidateRoomIds) {
    try {
      const payload = await relayV2GetDownloadUrl(candidateRoomId, objectKey);
      const response = await fetch(payload.url, {
        method: "GET",
      });
      if (!response.ok) {
        throw new Error(`relay_v2_download_${response.status}`);
      }

      try {
        const savedByFsApi = await saveRelayV2AttachmentViaFileSystemApi(response.clone(), attachment);
        if (!savedByFsApi) {
          await saveRelayV2AttachmentViaBlob(response, attachment);
        }
      } catch (error) {
        await saveRelayV2AttachmentViaBlob(response, attachment);
      }
      setStatus(`${attachment.name} downloaded`);
      return;
    } catch (error) {
      console.error("relay_v2_download_attempt_failed", {
        roomId: candidateRoomId,
        objectKey,
        attachmentId: String(attachment?.id || "").trim(),
        messageId: String(attachment?.messageId || "").trim(),
        error: String(error?.message || error || ""),
        status: Number(error?.status) || 0,
        payload: error?.payload || null,
      });
      lastError = error;
    }
  }

  reportAttachmentSourceUnavailable(
    "download_failed",
    {
      objectKey,
      attachmentId: String(attachment?.id || "").trim(),
      messageId: String(attachment?.messageId || "").trim(),
      roomIdCandidates: candidateRoomIds,
    },
    lastError
  );
}

function canAttemptRelayInlinePreview(attachment) {
  const previewKind = String(attachment?.previewKind || "").trim().toLowerCase();
  if (previewKind !== "image" && previewKind !== "video") {
    return false;
  }
  const size = Number(attachment?.size);
  if (Number.isFinite(size) && size > RELAY_INLINE_PREVIEW_MAX_BYTES) {
    return false;
  }
  return true;
}

async function hydrateRelayV2AttachmentInlinePreview(attachment, messageId = "", roomId = "") {
  if (!attachment || attachment.url || !canAttemptRelayInlinePreview(attachment)) {
    return false;
  }

  const attachmentId = String(attachment.id || "").trim();
  const cleanMessageId = String(messageId || attachment.messageId || "").trim();
  const candidateRoomIds = Array.from(
    new Set(
      [attachment.roomId, roomId, roomState?.id]
        .map((value) => normalizeRoomIdValue(value))
        .filter(Boolean)
    )
  );
  const cleanRoomId = candidateRoomIds[0] || "";
  const previewKey = buildRelayLocalAttachmentPreviewKey(cleanRoomId, cleanMessageId, attachmentId);
  if (!previewKey || !attachmentId || !cleanMessageId) {
    return false;
  }

  const failedAt = Number(relayV2InlinePreviewFailedAt.get(previewKey));
  if (Number.isFinite(failedAt)) {
    if (Date.now() - failedAt < RELAY_INLINE_PREVIEW_RETRY_COOLDOWN_MS) {
      return false;
    }
    relayV2InlinePreviewFailedAt.delete(previewKey);
  }

  if (relayV2InlinePreviewInFlight.has(previewKey)) {
    return relayV2InlinePreviewInFlight.get(previewKey);
  }

  const task = (async () => {
    const transport = String(attachment.transport || "").trim().toLowerCase();
    const objectKey = String(attachment.objectKey || "").trim();
    const hasChunkCryptoMeta = (
      String(attachment.fileKey || "").trim()
      && String(attachment.noncePrefix || "").trim()
      && Number(attachment.chunkSize) > 0
      && Number(attachment.totalChunks) > 0
    );
    if (transport !== RELAY_ATTACHMENT_TRANSPORT_S3_V2 || !objectKey || !hasChunkCryptoMeta || candidateRoomIds.length === 0) {
      return false;
    }

    let lastError = null;
    for (const candidateRoomId of candidateRoomIds) {
      try {
        const payload = await relayV2GetDownloadUrl(candidateRoomId, objectKey);
        const response = await fetch(payload.url, {
          method: "GET",
        });
        if (!response.ok) {
          throw new Error(`relay_v2_inline_preview_download_${response.status}`);
        }

        const chunks = [];
        await decryptRelayV2AttachmentResponse(
          response,
          attachment,
          async (chunk) => {
            chunks.push(chunk);
          },
          null
        );

        const blob = new Blob(chunks, {
          type: normalizeChatAttachmentMimeType(attachment?.mimeType),
        });
        const previewEntry = rememberRelayLocalAttachmentPreview(
          candidateRoomId,
          cleanMessageId,
          attachmentId,
          blob,
          {
            name: attachment.name,
            mimeType: attachment.mimeType,
            size: attachment.size,
          }
        );
        if (!previewEntry?.url) {
          throw new Error("relay_v2_inline_preview_cache_failed");
        }

        attachment.url = previewEntry.url;
        attachment.roomId = candidateRoomId;
        attachment.previewKind = previewEntry.previewKind || getChatAttachmentPreviewKind(previewEntry.mimeType);
        relayV2InlinePreviewFailedAt.delete(previewKey);

        const normalizedMessage = getChatMessageById(cleanMessageId);
        if (normalizedMessage && Array.isArray(normalizedMessage.attachments)) {
          const target = normalizedMessage.attachments.find((item) => String(item?.id || "").trim() === attachmentId);
          if (target && target !== attachment) {
            target.url = attachment.url;
            target.roomId = attachment.roomId;
            target.previewKind = attachment.previewKind;
          }
        }

        renderChat();
        return true;
      } catch (error) {
        lastError = error;
      }
    }

    relayV2InlinePreviewFailedAt.set(previewKey, Date.now());
    console.warn("relay_v2_inline_preview_failed", {
      roomId: cleanRoomId,
      messageId: cleanMessageId,
      attachmentId,
      transport: String(attachment.transport || "").trim(),
      hasObjectKey: Boolean(objectKey),
      hasFileKey: Boolean(String(attachment.fileKey || "").trim()),
      hasNoncePrefix: Boolean(String(attachment.noncePrefix || "").trim()),
      chunkSize: Number(attachment.chunkSize) || 0,
      totalChunks: Number(attachment.totalChunks) || 0,
      previewKind: String(attachment.previewKind || ""),
      error: String(lastError?.message || lastError || ""),
    });
    return false;
  })();

  relayV2InlinePreviewInFlight.set(previewKey, task);
  try {
    return await task;
  } finally {
    relayV2InlinePreviewInFlight.delete(previewKey);
  }
}

function splitRelayCiphertextToChunks(ciphertext, chunkSize = RELAY_ATTACHMENT_CHUNK_SIZE) {
  const cleanCiphertext = String(ciphertext || "");
  if (!cleanCiphertext) {
    return [];
  }

  const result = [];
  for (let offset = 0; offset < cleanCiphertext.length; offset += chunkSize) {
    result.push(cleanCiphertext.slice(offset, offset + chunkSize));
  }
  return result;
}

function clearRelayAttachmentRequestTimeout(entry) {
  if (entry?.timeoutId) {
    clearTimeout(entry.timeoutId);
    entry.timeoutId = null;
  }
}

function markRelayAttachmentRequestFailed(requestId, extra = {}) {
  const cleanRequestId = String(requestId || "").trim();
  if (!cleanRequestId) {
    return;
  }

  const entry = relayAttachmentRequestMap.get(cleanRequestId);
  if (entry) {
    clearRelayAttachmentRequestTimeout(entry);
    relayAttachmentRequestMap.delete(cleanRequestId);
  }
  reportAttachmentSourceUnavailable("peer_request_failed", {
    requestId: cleanRequestId,
    roomId: String(entry?.roomId || "").trim(),
    messageId: String(entry?.messageId || "").trim(),
    attachmentId: String(entry?.attachmentId || "").trim(),
    activeSourceId: String(entry?.activeSourceId || "").trim(),
    pendingSources: Array.isArray(entry?.pendingSources) ? entry.pendingSources : [],
    ...(extra && typeof extra === "object" ? extra : {}),
  });
}

function scheduleRelayAttachmentRequestTimeout(requestId) {
  const cleanRequestId = String(requestId || "").trim();
  const entry = relayAttachmentRequestMap.get(cleanRequestId);
  if (!entry) {
    return;
  }

  clearRelayAttachmentRequestTimeout(entry);
  entry.timeoutId = setTimeout(() => {
    const current = relayAttachmentRequestMap.get(cleanRequestId);
    if (!current) {
      return;
    }

    const nextSourceId = Array.isArray(current.pendingSources) ? current.pendingSources.shift() : "";
    if (nextSourceId) {
      void emitRelayAttachmentRequestForSource(cleanRequestId, nextSourceId);
      return;
    }
    markRelayAttachmentRequestFailed(cleanRequestId, {
      reasonCode: "peer_request_timeout",
    });
  }, RELAY_ATTACHMENT_REQUEST_TIMEOUT_MS);
}

async function emitRelayAttachmentRequestForSource(requestId, sourceId) {
  const cleanRequestId = String(requestId || "").trim();
  const cleanSourceId = String(sourceId || "").trim();
  const entry = relayAttachmentRequestMap.get(cleanRequestId);
  if (!entry || !cleanSourceId) {
    markRelayAttachmentRequestFailed(cleanRequestId, {
      reasonCode: "peer_request_emit_invalid",
      sourceId: cleanSourceId,
    });
    return false;
  }

  entry.activeSourceId = cleanSourceId;
  entry.chunks = [];
  entry.iv = "";

  socket.emit("relay-attachment-request", {
    roomId: entry.roomId,
    requestId: cleanRequestId,
    targetId: cleanSourceId,
    attachmentRef: {
      messageId: entry.messageId,
      attachmentId: entry.attachmentId,
    },
  });

  scheduleRelayAttachmentRequestTimeout(cleanRequestId);
  return true;
}

async function requestRelayAttachmentFromPeers(roomId, messageId, attachment) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const cleanMessageId = String(messageId || "").trim();
  if (!cleanRoomId || !cleanMessageId || !attachment?.id || !selfId) {
    return false;
  }

  const hydratedLocally = await hydrateRelayAttachmentUrl(cleanRoomId, cleanMessageId, attachment.id);
  if (hydratedLocally) {
    renderChat();
    return true;
  }

  const message = getChatMessageById(cleanMessageId);
  const isOwnMessage = String(message?.userId || "").trim() === CHAT_AUTHOR_ID;
  const knownSources = getRelayAttachmentSources(cleanRoomId, cleanMessageId, attachment.id)
    .filter(Boolean);
  if (selfId && isOwnMessage) {
    knownSources.unshift(selfId);
  }

  const dedupedSources = Array.from(new Set(knownSources));
  let sources = dedupedSources.filter((sourceId) => sourceId !== selfId);
  if (selfId && dedupedSources.includes(selfId)) {
    sources.push(selfId);
  }
  if (selfId && isOwnMessage) {
    sources = [selfId, ...sources.filter((sourceId) => sourceId !== selfId)];
  }
  const activeRoomMemberIds = Array.isArray(roomState?.members)
    ? roomState.members
        .map((member) => String(member?.id || "").trim())
        .filter(Boolean)
    : [];
  for (const memberId of activeRoomMemberIds) {
    if (memberId === selfId) {
      continue;
    }
    if (!sources.includes(memberId)) {
      sources.push(memberId);
    }
  }

  if (sources.length === 0) {
    reportAttachmentSourceUnavailable("peer_sources_empty", {
      roomId: cleanRoomId,
      messageId: cleanMessageId,
      attachmentId: String(attachment?.id || "").trim(),
    });
    return false;
  }

  const firstSourceId = sources.shift() || "";
  if (!firstSourceId) {
    reportAttachmentSourceUnavailable("peer_source_missing", {
      roomId: cleanRoomId,
      messageId: cleanMessageId,
      attachmentId: String(attachment?.id || "").trim(),
    });
    return false;
  }

  const requestId = createRelayRequestId("attachment");
  relayAttachmentRequestMap.set(requestId, {
    roomId: cleanRoomId,
    messageId: cleanMessageId,
    attachmentId: String(attachment.id || "").trim(),
    chunks: [],
    iv: "",
    name: attachment.name || "file",
    mimeType: attachment.mimeType,
    size: Number(attachment.size) || 0,
    activeSourceId: firstSourceId,
    pendingSources: sources,
    timeoutId: null,
  });

  return emitRelayAttachmentRequestForSource(requestId, firstSourceId);
}

async function respondRelayAttachmentRequest({ roomId, requestId, requesterId, attachmentRef }) {
  const cleanRoomId = normalizeRoomIdValue(roomId);
  const cleanRequestId = String(requestId || "").trim();
  const cleanRequesterId = String(requesterId || "").trim();
  const cleanMessageId = String(attachmentRef?.messageId || "").trim();
  const cleanAttachmentId = String(attachmentRef?.attachmentId || "").trim();

  if (!cleanRoomId || !cleanRequestId || !cleanRequesterId || !cleanMessageId || !cleanAttachmentId) {
    return;
  }

  const stored = await loadRelayAttachmentCipher(cleanRoomId, cleanAttachmentId);
  if (!stored || String(stored.messageId || "").trim() !== cleanMessageId) {
    socket.emit("relay-attachment-response", {
      roomId: cleanRoomId,
      requestId: cleanRequestId,
      targetId: cleanRequesterId,
      attachmentRef: {
        messageId: cleanMessageId,
        attachmentId: cleanAttachmentId,
      },
      error: "attachment_source_unavailable",
    });
    return;
  }

  const chunks = splitRelayCiphertextToChunks(stored.ciphertext);
  if (chunks.length === 0) {
    socket.emit("relay-attachment-response", {
      roomId: cleanRoomId,
      requestId: cleanRequestId,
      targetId: cleanRequesterId,
      attachmentRef: {
        messageId: cleanMessageId,
        attachmentId: cleanAttachmentId,
      },
      error: "attachment_source_unavailable",
    });
    return;
  }

  const totalChunks = chunks.length;
  for (let index = 0; index < chunks.length; index += 1) {
    socket.emit("relay-attachment-response", {
      roomId: cleanRoomId,
      requestId: cleanRequestId,
      targetId: cleanRequesterId,
      attachmentRef: {
        messageId: cleanMessageId,
        attachmentId: cleanAttachmentId,
      },
      chunk: {
        chunk: chunks[index],
        chunkIndex: index,
        totalChunks,
        eof: index === chunks.length - 1,
        iv: String(stored.iv || ""),
        name: String(stored.name || "file"),
        mimeType: normalizeChatAttachmentMimeType(stored.mimeType),
        size: Number(stored.size) || 0,
      },
    });
  }
}
