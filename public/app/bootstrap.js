// App bootstrap layer: binds UI interactions, subscribes to socket events, and initializes runtime state.
joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void promptJoinServerAndConnect();
});

roomInput.addEventListener("input", () => {
  if (!joined) {
    updateRoomLabels(roomInput.value);
    renderSavedRooms();
  }
});

if (homeServerBtn) {
  homeServerBtn.addEventListener("click", async () => {
    notificationPreviewRoomId = "";
    if (roomInput) {
      roomInput.value = "";
    }
    updateRoomLabels(MAIN_PAGE_LABEL);
    renderSavedRooms();

    if (!joined) {
      setStatus(t("disconnected"));
      return;
    }

    if (localScreenTrack) {
      await stopScreenShare(false);
    }

    socket.emit("leave-room");
    resetSessionState();
  });
}

if (addRoomBtn) {
  addRoomBtn.addEventListener("click", () => {
    void promptCreateServerAndJoin();
  });
}

if (addVoiceChannelBtn) {
  addVoiceChannelBtn.addEventListener("click", () => {
    void requestCreateVoiceRoom();
  });
}

if (profileToggleBtn) {
  profileToggleBtn.addEventListener("click", () => {
    const nextOpen = !isProfilePanelOpen;
    setProfilePanelOpen(nextOpen);
    if (nextOpen) {
      void refreshProfileDeviceSelectors();
    }
  });
}

if (topbarProfileBtn) {
  topbarProfileBtn.addEventListener("click", () => {
    const nextOpen = !isProfilePanelOpen;
    setProfilePanelOpen(nextOpen);
    if (nextOpen) {
      void refreshProfileDeviceSelectors();
    }
  });
}

if (profileCloseBtn) {
  profileCloseBtn.addEventListener("click", () => {
    setProfilePanelOpen(false);
  });
}

if (profileTabGeneralBtn) {
  profileTabGeneralBtn.addEventListener("click", () => {
    setActiveSettingsTab(SETTINGS_TAB_GENERAL_ID);
  });
}

if (profileTabNotificationsBtn) {
  profileTabNotificationsBtn.addEventListener("click", () => {
    setActiveSettingsTab(SETTINGS_TAB_NOTIFICATIONS_ID);
  });
}

if (nameInput) {
  nameInput.addEventListener("input", () => {
    persistProfileName();
  });

  nameInput.addEventListener("blur", () => {
    persistProfileName();
  });
}

if (profileMicSelect) {
  profileMicSelect.addEventListener("change", () => {
    void handlePreferredMicDeviceChange(profileMicSelect.value);
  });
}

if (profileSpeakerSelect) {
  profileSpeakerSelect.addEventListener("change", () => {
    void handlePreferredSpeakerDeviceChange(profileSpeakerSelect.value);
  });
}

if (profileThemeSelect) {
  profileThemeSelect.addEventListener("change", () => {
    applyTheme(profileThemeSelect.value);
  });
}

if (profileLanguageSelect) {
  profileLanguageSelect.addEventListener("change", () => {
    applyLanguage(profileLanguageSelect.value);
  });
}

if (profileMotionSelect) {
  profileMotionSelect.addEventListener("change", () => {
    applyMotionProfile(profileMotionSelect.value);
  });
}

if (profileBackgroundSelect) {
  profileBackgroundSelect.addEventListener("change", () => {
    applyBackgroundAnimation(profileBackgroundSelect.value);
  });
}

if (profileNetworkSelect) {
  profileNetworkSelect.addEventListener("change", async () => {
    const nextNetworkModeId = normalizeNetworkModeId(profileNetworkSelect.value);
    if (nextNetworkModeId === preferredNetworkModeId) {
      syncNetworkModeSelector();
      return;
    }

    const approved = await confirmInput(
      t("networkModeRestartPrompt", {
        mode: getNetworkModeLabel(nextNetworkModeId),
      })
    );
    if (!approved) {
      syncNetworkModeSelector();
      return;
    }

    if (!window.desktopApp?.setNetworkMode) {
      syncNetworkModeSelector();
      setStatus(t("networkModeChangeUnavailable"));
      return;
    }

    try {
      const result = await window.desktopApp.setNetworkMode(nextNetworkModeId);
      if (!result?.ok) {
        syncNetworkModeSelector();
        setStatus(t("networkModeChangeUnavailable"));
        return;
      }

      preferredNetworkModeId = normalizeNetworkModeId(result.mode || nextNetworkModeId);
      networkModeRemoteBackendConfigured = Boolean(result.remoteBackendConfigured);
      networkModeEnvironmentLocked = Boolean(result.environmentLocked);
      syncNetworkModeSelector();
    } catch {
      syncNetworkModeSelector();
      setStatus(t("networkModeChangeUnavailable"));
    }
  });
}

if (notificationsEnabledToggle) {
  notificationsEnabledToggle.addEventListener("change", () => {
    notificationsEnabled = Boolean(notificationsEnabledToggle.checked);
    persistNotificationsEnabledPreference();
    refreshNotificationAutomation({ sync: true });
  });
}

if (notificationsSavedToggle) {
  notificationsSavedToggle.addEventListener("change", () => {
    notificationsSavedRoomsEnabled = Boolean(notificationsSavedToggle.checked);
    persistNotificationsSavedRoomsPreference();
    refreshNotificationAutomation({ sync: true });
  });
}

if (notificationsMentionsToggle) {
  notificationsMentionsToggle.addEventListener("change", () => {
    notificationsMentionsEnabled = Boolean(notificationsMentionsToggle.checked);
    persistNotificationsMentionsPreference();
    refreshNotificationAutomation({ sync: true });
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isMicSensitivityPopoverOpen) {
    setMicSensitivityPopoverOpen(false);
  }

  if (event.key === "Escape" && isProfilePanelOpen) {
    setProfilePanelOpen(false);
  }
});

document.addEventListener("pointerdown", (event) => {
  if (!isProfilePanelOpen) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (profilePanel?.contains(target) || profileToggleBtn?.contains(target)) {
    return;
  }

  setProfilePanelOpen(false);
});

document.addEventListener("pointerdown", (event) => {
  if (!isMicSensitivityPopoverOpen) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (micSensitivityPopover?.contains(target) || micSensitivityToggleBtn?.contains(target)) {
    return;
  }

  setMicSensitivityPopoverOpen(false);
});

if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === "function") {
  navigator.mediaDevices.addEventListener("devicechange", () => {
    void refreshProfileDeviceSelectors();
  });
}

if (chatAttachBtn && chatFileInput) {
  chatAttachBtn.addEventListener("click", () => {
    if (!joined || chatSubmitInProgress) {
      return;
    }
    chatFileInput.click();
  });

  chatFileInput.addEventListener("change", () => {
    const files = Array.from(chatFileInput.files || []);
    appendPendingChatAttachments(files);
    chatFileInput.value = "";
  });
}

if (chatColumnEl) {
  chatColumnEl.addEventListener("dragenter", (event) => {
    if (!eventHasFilePayload(event)) {
      return;
    }

    event.preventDefault();
    if (!joined || chatSubmitInProgress) {
      resetChatDropTargetState();
      return;
    }

    chatDropTargetDepth += 1;
    setChatDropTargetActive(true);
  });

  chatColumnEl.addEventListener("dragover", (event) => {
    if (!eventHasFilePayload(event)) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = joined && !chatSubmitInProgress ? "copy" : "none";
    }

    if (!joined || chatSubmitInProgress) {
      resetChatDropTargetState();
      return;
    }

    setChatDropTargetActive(true);
  });

  chatColumnEl.addEventListener("dragleave", (event) => {
    if (!eventHasFilePayload(event)) {
      return;
    }

    event.preventDefault();
    if (!joined || chatSubmitInProgress) {
      resetChatDropTargetState();
      return;
    }

    chatDropTargetDepth = Math.max(0, chatDropTargetDepth - 1);
    if (chatDropTargetDepth === 0) {
      setChatDropTargetActive(false);
    }
  });

  chatColumnEl.addEventListener("drop", (event) => {
    if (!eventHasFilePayload(event)) {
      return;
    }

    event.preventDefault();
    const files = extractDroppedFiles(event);
    resetChatDropTargetState();

    if (!joined || chatSubmitInProgress || files.length === 0) {
      return;
    }

    appendPendingChatAttachments(files);
  });
}

if (chatForm) {
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!joined || !chatInput) {
      return;
    }

    const text = chatInput.value.trim();
    const hasAttachments = pendingChatAttachments.length > 0;
    if (!text && !hasAttachments) {
      return;
    }

    if (!hasAttachments && await handleRnChatCommand(text)) {
      chatInput.value = "";
      chatInput.focus();
      return;
    }

    if (!hasAttachments && handleDlolmusChatCommand(text)) {
      chatInput.value = "";
      chatInput.focus();
      return;
    }

    try {
      chatSubmitInProgress = true;
      updateChatAvailability();

      if (isRelayModeActive()) {
        if (!roomState?.id) {
          setStatus(t("joinServerFirst"));
          return;
        }

        const relayPacket = await buildRelayEncryptedChatPacket(roomState.id, text);
        socket.emit("chat-message", relayPacket);
      } else {
        let attachments = [];
        if (hasAttachments) {
          attachments = await buildOutgoingChatAttachmentPayloads();
        }
        socket.emit("chat-message", { text, attachments });
      }

      chatInput.value = "";
      clearPendingChatAttachments();
      chatInput.focus();
    } catch (error) {
      const normalizedError = String(error?.message || "").trim().toLowerCase();
      if (normalizedError.includes("room_key_required")) {
        setStatus(t("roomKeyRequired"));
      } else if (normalizedError.includes("attachment_too_large")) {
        setStatus(t("attachmentTooLarge", { name: "file", max: formatFileSize(getRelayUploadLimits().maxFileBytes) }));
      } else if (normalizedError.includes("attachment_total_too_large")) {
        setStatus(t("attachmentTotalTooLarge", { max: formatFileSize(getRelayUploadLimits().maxTotalMessageBytes) }));
      } else {
        setStatus(error?.message || t("chatSendFailed"));
      }
    } finally {
      chatSubmitInProgress = false;
      updateChatAvailability();
    }
  });
}

if (micSensitivityRange) {
  micSensitivityRange.addEventListener("input", () => {
    const next = Number(micSensitivityRange.value) / 100;
    setMicSensitivity(next);
  });
}

if (micSensitivityToggleBtn) {
  micSensitivityToggleBtn.addEventListener("click", () => {
    if (!joined || !isInVoiceChannel(roomState) || micSensitivityToggleBtn.disabled) {
      setStatus(t("notInVoiceChannel"));
      setMicSensitivityPopoverOpen(false);
      return;
    }

    setMicSensitivityPopoverOpen(!isMicSensitivityPopoverOpen);
  });
}

muteBtn.addEventListener("click", () => {
  if (!joined || !isInVoiceChannel(roomState)) {
    setStatus(t("notInVoiceChannel"));
    return;
  }

  if (!localMicTrack && !localOutboundMicTrack) {
    return;
  }

  if (isMuted) {
    isMuted = false;
    clearMicMuteTimer();
    syncLocalMicMuteState();
    updateMuteButtonLabel();
    return;
  }

  isMuted = true;
  scheduleMicMuteShutdown();
  syncLocalMicMuteState();
  updateMuteButtonLabel();
});

screenBtn.addEventListener("click", async () => {
  if (!joined || !isInVoiceChannel(roomState)) {
    setStatus(t("notInVoiceChannel"));
    return;
  }

  if (localScreenTrack) {
    await stopScreenShare(false);
    return;
  }

  await startScreenShare();
});

if (leaveVoiceBtn) {
  leaveVoiceBtn.addEventListener("click", async () => {
    if (!joined || !roomState) {
      setStatus(t("joinServerFirst"));
      return;
    }

    if (!isInVoiceChannel(roomState)) {
      setStatus(t("notInVoiceChannel"));
      return;
    }

    if (localScreenTrack) {
      await stopScreenShare(false);
    }

    socket.emit("leave-voice-channel", (response) => {
      if (!response?.ok) {
        setStatus(String(response?.error || t("notInVoiceChannel")));
        return;
      }

      setStatus(t("connectedToServer"));
    });
  });
}

if (screenHubToggleBtn) {
  screenHubToggleBtn.addEventListener("click", () => {
    setScreenHubCollapsed(!isScreenHubCollapsed);
  });
}

if (screenStagePinBtn) {
  screenStagePinBtn.addEventListener("click", () => {
    if (!activeScreenStageItem) {
      return;
    }
    pinnedScreenUserId =
      pinnedScreenUserId === activeScreenStageItem.userId ? null : activeScreenStageItem.userId;
    renderScreens();
  });
}

if (screenStageFullscreenBtn) {
  screenStageFullscreenBtn.addEventListener("click", () => {
    void enterScreenFullscreen(screenStageVideoEl);
  });
}

if (screenStageMuteBtn) {
  screenStageMuteBtn.addEventListener("click", () => {
    if (!activeScreenStageItem || activeScreenStageItem.isLocal) {
      return;
    }
    const muted = isScreenAudioMuted(activeScreenStageItem.userId);
    setScreenAudioMuted(activeScreenStageItem.userId, !muted);
    renderScreens();
  });
}

if (screenStageVolumeRangeEl) {
  screenStageVolumeRangeEl.min = String(VOLUME_SLIDER_MIN);
  screenStageVolumeRangeEl.max = String(VOLUME_SLIDER_MAX);
  screenStageVolumeRangeEl.step = "1";
  screenStageVolumeRangeEl.addEventListener("input", () => {
    if (!activeScreenStageItem || activeScreenStageItem.isLocal) {
      return;
    }
    setScreenAudioVolume(
      activeScreenStageItem.userId,
      sliderPercentToVolumeGain(screenStageVolumeRangeEl.value)
    );
    if (screenStageVolumeValueEl) {
      screenStageVolumeValueEl.textContent = formatVolumePercentLabel(screenStageVolumeRangeEl.value);
    }
  });
}

if (screenStageEmptyTriggerBtn) {
  screenStageEmptyTriggerBtn.addEventListener("click", async () => {
    if (localScreenTrack) {
      await stopScreenShare(false);
      return;
    }
    await startScreenShare();
  });
}

if (relayRoomKeyBtn) {
  relayRoomKeyBtn.addEventListener("click", async () => {
    const roomId = normalizeRoomIdValue(roomState?.id);
    if (!joined || !roomId) {
      setStatus(t("joinServerFirst"));
      return;
    }

    if (!isRelayModeActive()) {
      setStatus(t("roomKeyChangeRelayOnly"));
      return;
    }

    try {
      const nextKey = await ensureRelayRoomKey(roomId, { forcePrompt: true });
      if (!nextKey) {
        return;
      }

      await loadRelayRoomHistory(roomId);
      setStatus(t("roomKeyUpdated"));
    } catch {
      setStatus(t("roomKeyUpdateFailed"));
    }
  });
}

leaveBtn.addEventListener("click", async () => {
  if (localScreenTrack) {
    await stopScreenShare(false);
  }

  if (joined) {
    socket.emit("leave-room");
  }

  resetSessionState();
});

if (windowMinimizeBtn) {
  windowMinimizeBtn.addEventListener("click", async () => {
    if (!IS_ELECTRON_RUNTIME || !window.desktopApp?.minimizeWindow) {
      return;
    }
    try {
      await window.desktopApp.minimizeWindow();
    } catch {
      // no-op
    }
  });
}

if (windowCloseBtn) {
  windowCloseBtn.addEventListener("click", async () => {
    if (!IS_ELECTRON_RUNTIME || !window.desktopApp?.closeWindow) {
      return;
    }
    try {
      await window.desktopApp.closeWindow();
    } catch {
      // no-op
    }
  });
}

socket.on("joined-room", async ({ room, selfId: incomingSelfId }) => {
  selfId = incomingSelfId;
  roomState = room;
  activeBackendNetworkMode = normalizeNetworkModeId(room?.networkMode || activeBackendNetworkMode);
  joined = true;
  notificationPreviewRoomId = "";
  setVoiceCueBaselineFromRoom(room);

  joinForm.classList.add("hidden");
  controls.classList.remove("hidden");
  updateChatAvailability();
  updateRoomLabels(room.id);
  renderVoiceChannels();
  if (isRelayModeActive()) {
    await loadRelayRoomHistory(room.id);
    void requestRelayHistoryReplay(room.id);
  } else {
    replaceChatMessages(room.messages);
    seedNotificationCheckpointFromMessages(room.id, room.messages);
  }
  ensureSavedRoom(room.id);
  renderSavedRooms();

  updateScreenButton();

  if (isInVoiceChannel(room)) {
    if (room.hostId === selfId) {
      await becomeHost();
    } else {
      becomeMember(room.hostId);
    }
  } else {
    becomeServerOnly();
  }

  renderParticipants();
  renderScreens();
  updateVoiceControlsAvailability();
});

socket.on("connect", async () => {
  await fetchBackendNetworkMode();
  refreshNotificationAutomation({ sync: true });
});

socket.on("connect_error", (error) => {
  const details = String(error?.message || t("backendUnavailable"));
  setStatus(t("connectionError", { details }));
});

socket.on("room-state", async (room) => {
  const previousHostId = roomState?.hostId || null;
  if (joined && selfId) {
    processVoiceRoomCueDiff(room);
  }

  roomState = room;
  activeBackendNetworkMode = normalizeNetworkModeId(room?.networkMode || activeBackendNetworkMode);
  updateRoomLabels(room.id);
  renderVoiceChannels();
  renderSavedRooms();
  updateTopbarMeta();

  if (!joined || !selfId) {
    renderParticipants();
    renderScreens();
    updateVoiceControlsAvailability();
    return;
  }

  const currentVoiceChannelId = getCurrentVoiceChannelId(room);
  if (!currentVoiceChannelId) {
    if (localScreenTrack) {
      await stopScreenShare(false);
    }

    becomeServerOnly();
    renderParticipants();
    renderScreens();
    updateVoiceControlsAvailability();
    return;
  }

  const shouldBeHost = room.hostId === selfId;

  if (shouldBeHost && !isHost) {
    await becomeHost();
  }

  if (!shouldBeHost) {
    const expectedHostId = room.hostId || null;
    const connectedPeerIds = Array.from(peers.keys());
    const hasExpectedPeer = expectedHostId
      ? connectedPeerIds.includes(expectedHostId)
      : connectedPeerIds.length === 0;
    const hasUnexpectedPeers = expectedHostId
      ? connectedPeerIds.some((peerId) => peerId !== expectedHostId)
      : connectedPeerIds.length > 0;

    if (isHost || previousHostId !== expectedHostId || !hasExpectedPeer || hasUnexpectedPeers) {
      becomeMember(expectedHostId);
    }
  }

  renderParticipants();
  renderScreens();
  updateVoiceControlsAvailability();

  if (isHost) {
    const voiceMembers = getVoiceMembersFromRoom(room);
    const memberIds = new Set(voiceMembers.map((member) => member.id));

    for (const member of voiceMembers) {
      if (member.id !== selfId && !peers.has(member.id)) {
        offerPeer(member.id);
      }
    }

    for (const peerId of Array.from(peers.keys())) {
      if (!memberIds.has(peerId)) {
        clearPeerReconnectState(peerId);
        closePeer(peerId);
      }
    }
  }
});

socket.on("host-changed", async ({ hostId, channelId }) => {
  if (!joined || !selfId) {
    return;
  }

  const activeChannelId = getCurrentVoiceChannelId(roomState);
  if (!activeChannelId) {
    return;
  }

  if (channelId && String(channelId) !== activeChannelId) {
    return;
  }

  if (hostId === selfId) {
    await becomeHost();
  } else {
    becomeMember(hostId);
  }

  renderParticipants();
  renderScreens();
  renderVoiceChannels();
  renderSavedRooms();
  updateVoiceControlsAvailability();
});

socket.on("peer-join-request", ({ peerId }) => {
  if (!isHost || peerId === selfId) {
    return;
  }

  const voiceMemberIds = new Set(getVoiceMembersFromRoom(roomState).map((member) => member.id));
  if (!voiceMemberIds.has(peerId)) {
    return;
  }

  offerPeer(peerId);
});

socket.on("peer-left", ({ peerId }) => {
  clearPeerReconnectState(peerId);
  closePeer(peerId);
  clearTrackMappingsForSource(peerId);
  removeVoiceTrack(peerId);
  removeScreenTrack(peerId);
  renderParticipants();
});

socket.on("chat-message", (message) => {
  if (message?.envelope) {
    void handleRelayChatPacket(message, { fromReplay: false });
    return;
  }

  upsertChatMessage(message);
  renderChat();
  void handleRealtimeNotificationMessage(message, roomState?.id || "");
});

socket.on("saved-room-chat-message", ({ roomId, message } = {}) => {
  if (isRelayModeActive()) {
    return;
  }
  void handleRealtimeNotificationMessage(message, roomId);
});

socket.on("saved-room-relay-envelope", (payload = {}) => {
  if (!isRelayModeActive()) {
    return;
  }
  void handleSavedRoomRelayEnvelopeNotification(payload);
});

socket.on("chat-message-updated", (message) => {
  if (message?.envelope) {
    void handleRelayChatPacket(
      {
        roomId: message.roomId || roomState?.id,
        sourceId: message.sourceId || "",
        envelope: message.envelope,
        attachmentPayloads: [],
      },
      { fromReplay: true }
    );
    return;
  }

  upsertChatMessage(message);
  renderChat();
});

socket.on("chat-message-deleted", ({ messageId, roomId } = {}) => {
  const cleanMessageId = String(messageId || "").trim();
  if (isRelayModeActive()) {
    const cleanRoomId = normalizeRoomIdValue(roomId || roomState?.id);
    relayMessageEnvelopeCache.delete(cleanMessageId);
    if (cleanRoomId && cleanMessageId) {
      void deleteRelayMessageRecord(cleanRoomId, cleanMessageId).catch(() => {
        // no-op
      });
    }
  }
  removeChatMessageById(cleanMessageId);
  renderChat();
});

socket.on("relay-history-request", ({ roomId, requestId, requesterId } = {}) => {
  if (!isRelayModeActive() || !joined || normalizeRoomIdValue(roomState?.id) !== normalizeRoomIdValue(roomId)) {
    return;
  }
  if (!requesterId || requesterId === selfId) {
    return;
  }
  void sendRelayHistoryChunkToRequester({ roomId, requestId, requesterId });
});

socket.on("relay-history-chunk", ({ roomId, requestId, targetId, sourceId, envelopes } = {}) => {
  if (!isRelayModeActive() || !joined) {
    return;
  }
  if (targetId && selfId && targetId !== selfId) {
    return;
  }
  if (normalizeRoomIdValue(roomState?.id) !== normalizeRoomIdValue(roomId)) {
    return;
  }

  const items = Array.isArray(envelopes) ? envelopes : [];
  (async () => {
    for (const envelope of items) {
      await handleRelayChatPacket(
        {
          roomId,
          sourceId: sourceId || "",
          envelope,
        },
        { fromReplay: true }
      );
    }
    if (items.length > 0) {
      setStatus(t("relayHistorySynced"));
    }
  })();
});

socket.on("relay-attachment-request", ({ roomId, requestId, requesterId, attachmentRef } = {}) => {
  if (!isRelayModeActive() || !joined) {
    return;
  }
  if (normalizeRoomIdValue(roomState?.id) !== normalizeRoomIdValue(roomId)) {
    return;
  }
  console.warn("legacy_relay_attachment_request_ignored", {
    roomId: normalizeRoomIdValue(roomId),
    requestId: String(requestId || "").trim(),
    requesterId: String(requesterId || "").trim(),
    attachmentId: String(attachmentRef?.attachmentId || "").trim(),
  });
});

socket.on("relay-attachment-response", (payload = {}) => {
  if (!isRelayModeActive() || !joined) {
    return;
  }
  if (normalizeRoomIdValue(roomState?.id) !== normalizeRoomIdValue(payload.roomId)) {
    return;
  }
  console.warn("legacy_relay_attachment_response_ignored", {
    roomId: normalizeRoomIdValue(payload.roomId),
    requestId: String(payload?.requestId || "").trim(),
    sourceId: String(payload?.sourceId || "").trim(),
    error: String(payload?.error || "").trim(),
  });
});

socket.on("chat-error", ({ message } = {}) => {
  setStatus(mapChatActionError(message));
});

socket.on("signal", async ({ from, payload }) => {
  try {
    if (!payload || typeof payload.type !== "string") {
      return;
    }

    if (payload.type === "sdp-offer") {
      await handleOffer(from, payload);
      return;
    }

    if (payload.type === "sdp-answer") {
      await handleAnswer(from, payload.sdp);
      return;
    }

    if (payload.type === "ice-candidate") {
      await handleIce(from, payload.candidate);
      return;
    }

    if (payload.type === "forward-track-meta") {
      handleForwardTrackMeta(payload);
      return;
    }

    if (payload.type === "remove-forwarded-track") {
      handleRemoveForwardedTrack(payload);
      return;
    }

    if (payload.type === "voice-peer-reconnect-request" && isHost) {
      if (shouldReconnectPeer(from)) {
        offerPeer(from, {
          forceIceRestart: true,
        });
      }
      return;
    }

    if (payload.type === "member-screen-state" && isHost) {
      const screenAudioTrackId = payload.screenAudioTrackId
        ? String(payload.screenAudioTrackId)
        : null;

      if (payload.enabled) {
        setSourceScreenAudioTrackId(from, screenAudioTrackId);
      } else {
        setSourceScreenAudioTrackId(from, null);
        setSourceScreenTrack(from, null);
        if (screenAudioTrackId) {
          removeSourceVoiceTrack(from, screenAudioTrackId);
        }
      }
    }
  } catch (error) {
    const details = error?.message || error?.name || "unknown";
    console.error("Signal handling error", { from, payloadType: payload?.type, error });
    setStatus(t("connectionError", { details }));
  }
});

socket.on("disconnect", () => {
  resetSessionState();
});

savedRooms = loadSavedRooms();
preferredMicDeviceId = loadPreferredMicDeviceId();
preferredSpeakerDeviceId = loadPreferredSpeakerDeviceId();
preferredThemeId = loadPreferredThemeId();
preferredLanguageId = loadPreferredLanguageId();
preferredMotionProfileId = loadPreferredMotionProfileId();
preferredBackgroundAnimationId = loadPreferredBackgroundAnimationId();
notificationsEnabled = loadNotificationsEnabledPreference();
notificationsSavedRoomsEnabled = loadNotificationsSavedRoomsPreference();
notificationsMentionsEnabled = loadNotificationsMentionsPreference();
applyTheme(preferredThemeId, { persist: false });
applyLanguage(preferredLanguageId, { persist: false, rerender: false });
applyMotionProfile(preferredMotionProfileId, { persist: false });
applyBackgroundAnimation(preferredBackgroundAnimationId, { persist: false });
configureSelfCaptureHandle();
void initializeMaterialIcons();
if (nameInput) {
  nameInput.value = loadStoredProfileName();
  persistProfileName();
}
setActiveSettingsTab(SETTINGS_TAB_GENERAL_ID);
setProfilePanelOpen(false);
micSensitivity = loadMicSensitivity();
syncMicSensitivityUi();
void refreshProfileDeviceSelectors();
void initializeNetworkModeSetting();
void initializeWindowChrome();
void initializeDesktopNotifications();
syncMobileViewportHeightVar();
window.addEventListener("resize", syncMobileViewportHeightVar, { passive: true });
window.addEventListener("orientationchange", syncMobileViewportHeightVar, { passive: true });
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncMobileViewportHeightVar, { passive: true });
}

if (hasOpusCodec && hasRedCodec) {
  console.info("Audio codec preference active: Opus + RED");
} else if (hasOpusCodec) {
  console.info("Audio codec preference active: Opus (RED is not available in this browser)");
} else {
  console.warn("Audio codec preference fallback: Opus codec is not exposed in capabilities");
}
console.info(`Client build: ${APP_BUILD_ID}`);
console.info(`Experimental command available: ${DLOLMUS_COMMAND_PREFIX} on|off`);
console.info(`RNNoise command available: ${RN_COMMAND_PREFIX} on|off`);

setScreenHubCollapsed(isScreenHubCollapsed, { persist: false });
updateMuteButtonLabel();
updateScreenButton();
renderScreens();
updateRoomLabels();
renderVoiceChannels();
updateChatAvailability();
renderChat();
renderSavedRooms();
setStatus(t("disconnected"));

if (!isTrustedOriginForMic()) {
  setStatus(t("warningHttps"));
}

