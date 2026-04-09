function clearAllPeerReconnectState() {
  for (const peerId of Array.from(peerReconnectTimerByPeerId.keys())) {
    clearPeerReconnectTimer(peerId);
  }

  for (const peerId of Array.from(peerReconnectStatusTimerByPeerId.keys())) {
    clearPeerReconnectStatusTimer(peerId);
  }

  peerReconnectAttemptByPeerId.clear();
  peerReconnectStatusShownPeerIds.clear();
}

function isPeerConnectionConnected(peerId) {
  return peers.get(peerId)?.pc?.connectionState === "connected";
}

function shouldReconnectPeer(peerId) {
  const cleanPeerId = String(peerId || "").trim();
  if (!cleanPeerId || !joined || !selfId || !roomState || !isInVoiceChannel(roomState)) {
    return false;
  }

  const voiceMembers = getVoiceMembersFromRoom(roomState);
  const voiceMemberIds = new Set(voiceMembers.map((member) => String(member?.id || "").trim()).filter(Boolean));
  if (!voiceMemberIds.has(selfId)) {
    return false;
  }

  if (isHost) {
    return cleanPeerId !== selfId && voiceMemberIds.has(cleanPeerId);
  }

  const hostId = String(roomState?.hostId || "").trim();
  return Boolean(hostId && hostId === cleanPeerId && hostId !== selfId);
}

function queueVoiceReconnectStatus(peerId) {
  if (isHost || !peerId || peerReconnectStatusShownPeerIds.has(peerId)) {
    return;
  }

  if (peerReconnectStatusTimerByPeerId.has(peerId)) {
    return;
  }

  const timerId = setTimeout(() => {
    peerReconnectStatusTimerByPeerId.delete(peerId);
    if (!isHost && shouldReconnectPeer(peerId) && !isPeerConnectionConnected(peerId)) {
      peerReconnectStatusShownPeerIds.add(peerId);
      setStatus(t("voiceReconnecting"));
    }
  }, VOICE_RECONNECT_STATUS_DELAY_MS);

  peerReconnectStatusTimerByPeerId.set(peerId, timerId);
}

function emitVoicePeerReconnectRequest(peerId, reason = "") {
  const cleanPeerId = String(peerId || "").trim();
  if (!cleanPeerId || isHost || !shouldReconnectPeer(cleanPeerId)) {
    return;
  }

  socket.emit("signal", {
    to: cleanPeerId,
    payload: {
      type: "voice-peer-reconnect-request",
      reason: String(reason || "").trim().slice(0, 64),
    },
  });
}

function schedulePeerReconnect(peerId, options = {}) {
  const cleanPeerId = String(peerId || "").trim();
  if (!cleanPeerId) {
    return;
  }

  if (!shouldReconnectPeer(cleanPeerId)) {
    clearPeerReconnectState(cleanPeerId);
    return;
  }

  if (isPeerConnectionConnected(cleanPeerId)) {
    clearPeerReconnectState(cleanPeerId);
    return;
  }

  queueVoiceReconnectStatus(cleanPeerId);
  if (peerReconnectTimerByPeerId.has(cleanPeerId)) {
    return;
  }

  const attempt = peerReconnectAttemptByPeerId.get(cleanPeerId) || 0;
  const delay =
    options.immediate && attempt === 0
      ? 0
      : Math.min(
          VOICE_RECONNECT_INITIAL_DELAY_MS * Math.pow(2, Math.max(0, attempt)),
          VOICE_RECONNECT_MAX_DELAY_MS
        );

  const timerId = setTimeout(() => {
    peerReconnectTimerByPeerId.delete(cleanPeerId);

    if (!shouldReconnectPeer(cleanPeerId) || isPeerConnectionConnected(cleanPeerId)) {
      clearPeerReconnectState(cleanPeerId);
      return;
    }

    peerReconnectAttemptByPeerId.set(cleanPeerId, attempt + 1);
    if (isHost) {
      offerPeer(cleanPeerId, {
        forceIceRestart: true,
      });
    } else {
      emitVoicePeerReconnectRequest(cleanPeerId, options.reason || "recover");
    }

    if (shouldReconnectPeer(cleanPeerId) && !isPeerConnectionConnected(cleanPeerId)) {
      schedulePeerReconnect(cleanPeerId, {
        reason: options.reason || "retry",
      });
    }
  }, delay);

  peerReconnectTimerByPeerId.set(cleanPeerId, timerId);
}

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection(rtcConfig);

  const entry = {
    pc,
    makingOffer: false,
    offerQueued: false,
    needsOffer: false,
    needsIceRestart: false,
    disconnectTimer: null,
    forwardedSenders: new Map(),
    micSender: null,
    screenSender: null,
    screenAudioSender: null,
    upstreamVideoTransceiver: null,
    upstreamAudioTransceiver: null,
    upstreamScreenAudioTransceiver: null,
    upstreamMids: null,
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate) {
      return;
    }

    socket.emit("signal", {
      to: peerId,
      payload: {
        type: "ice-candidate",
        candidate: event.candidate,
      },
    });
  };

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;

    if (state === "connected") {
      clearPeerReconnectState(peerId);
      if (entry.disconnectTimer) {
        clearTimeout(entry.disconnectTimer);
        entry.disconnectTimer = null;
      }
      return;
    }

    if (state === "disconnected") {
      schedulePeerReconnect(peerId, {
        reason: "disconnected",
      });
      if (!entry.disconnectTimer) {
        entry.disconnectTimer = setTimeout(() => {
          entry.disconnectTimer = null;
          const current = peers.get(peerId);
          if (!current || current.pc.connectionState !== "disconnected") {
            return;
          }
          closePeer(peerId);
          schedulePeerReconnect(peerId, {
            reason: "disconnect-timeout",
          });
        }, PEER_DISCONNECT_GRACE_MS);
      }
      return;
    }

    if (entry.disconnectTimer) {
      clearTimeout(entry.disconnectTimer);
      entry.disconnectTimer = null;
    }

    if (state === "failed") {
      schedulePeerReconnect(peerId, {
        reason: "failed",
        immediate: true,
      });
      closePeer(peerId);
      return;
    }

    if (state === "closed") {
      closePeer(peerId);
    }
  };

  pc.onsignalingstatechange = () => {
    if (!isHost) {
      return;
    }

    if (pc.signalingState !== "stable") {
      return;
    }

    const current = peers.get(peerId);
    if (!current || current.makingOffer) {
      return;
    }

    if (current.offerQueued || current.needsOffer) {
      current.offerQueued = false;
      void makeOffer(peerId);
    }
  };

  if (isHost) {
    entry.upstreamVideoTransceiver = pc.addTransceiver("video", { direction: "recvonly" });
    entry.upstreamAudioTransceiver = pc.addTransceiver("audio", { direction: "recvonly" });
    entry.upstreamScreenAudioTransceiver = pc.addTransceiver("audio", { direction: "recvonly" });
    applyPreferredAudioCodecsToTransceiver(entry.upstreamAudioTransceiver, true);
    applyPreferredAudioCodecsToTransceiver(entry.upstreamScreenAudioTransceiver, true);

    pc.ontrack = (event) => {
      handleHostInboundTrack(peerId, event);
    };
  } else {
    const outboundMicTrack = getOutboundMicTrack();
    const outboundMicStream = getStreamForTrack(outboundMicTrack);

    if (outboundMicTrack && outboundMicStream) {
      applyVoiceTrackHints(outboundMicTrack);
      const micSender = pc.addTrack(outboundMicTrack, outboundMicStream);
      entry.micSender = micSender;
      const micTransceiver = pc.getTransceivers().find((item) => item.sender === micSender) || null;
      applyPreferredAudioCodecsToTransceiver(micTransceiver, true);
      void optimizeAudioSender(micSender, { profile: "mic" });
    }

    pc.ontrack = (event) => {
      handleMemberInboundTrack(event.track);
    };
  }

  peers.set(peerId, entry);
  return entry;
}

function closePeer(peerId, skipSourceCleanup = false) {
  const entry = peers.get(peerId);
  if (!entry) {
    return;
  }

  peers.delete(peerId);
  unregisterScreenSenderAbrByPrefix(`host-forward:${peerId}:`);
  unregisterScreenSenderAbrByPrefix(`member-upstream:${peerId}`);

  try {
    if (entry.disconnectTimer) {
      clearTimeout(entry.disconnectTimer);
      entry.disconnectTimer = null;
    }

    entry.pc.onicecandidate = null;
    entry.pc.ontrack = null;
    entry.pc.onconnectionstatechange = null;
    entry.pc.onsignalingstatechange = null;
    entry.pc.close();
  } catch {
    // no-op
  }

  if (isHost && !skipSourceCleanup) {
    removeSourcePeer(peerId);
  }

  if (!isHost && roomState && peerId === roomState.hostId) {
    unregisterScreenSenderAbrByPrefix("member-upstream:");
    localScreenPublishPending = Boolean(localScreenTrack);
    localScreenLastPublishHostId = null;
    localScreenLastPublishedAudioTrackId = null;
    clearAllRemoteMedia();
    clearForwardTrackMaps();
  }
}

function requestOffer(peerId) {
  const entry = peers.get(peerId);
  if (!entry || !isHost) {
    return;
  }

  entry.needsOffer = true;

  if (entry.makingOffer) {
    entry.offerQueued = true;
    return;
  }

  if (entry.pc.signalingState !== "stable") {
    entry.offerQueued = true;
    return;
  }

  void makeOffer(peerId);
}

async function makeOffer(peerId) {
  const entry = peers.get(peerId);
  if (!entry || !isHost) {
    return;
  }

  if (entry.makingOffer) {
    entry.offerQueued = true;
    return;
  }

  if (entry.pc.signalingState !== "stable") {
    entry.offerQueued = true;
    return;
  }

  entry.makingOffer = true;
  entry.needsOffer = false;

  try {
    applyPreferredAudioCodecsToPeerConnection(entry.pc);
    const offer = entry.needsIceRestart
      ? await entry.pc.createOffer({ iceRestart: true })
      : await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    entry.needsIceRestart = false;

    socket.emit("signal", {
      to: peerId,
      payload: {
        type: "sdp-offer",
        sdp: entry.pc.localDescription,
        upstreamMids: isHost
          ? {
              videoMid: entry.upstreamVideoTransceiver?.mid || null,
              audioMid: entry.upstreamAudioTransceiver?.mid || null,
              screenAudioMid: entry.upstreamScreenAudioTransceiver?.mid || null,
            }
          : null,
      },
    });
  } catch {
    setStatus(t("negotiationError"));
  } finally {
    entry.makingOffer = false;

    if ((entry.offerQueued || entry.needsOffer) && entry.pc.signalingState === "stable") {
      entry.offerQueued = false;
      void makeOffer(peerId);
    }
  }
}

function offerPeer(peerId, options = {}) {
  if (!joined || !isHost || peerId === selfId) {
    return;
  }

  let entry = peers.get(peerId) || null;
  if (!entry) {
    createPeerConnection(peerId);
    entry = peers.get(peerId) || null;
  }

  if (entry && options.forceIceRestart) {
    entry.needsIceRestart = true;
  }

  syncForwardingForPeer(peerId);
  requestOffer(peerId);
}

function handleHostInboundTrack(sourcePeerId, event) {
  const track = event.track;
  if (!track) {
    return;
  }

  if (track.kind === "video") {
    setSourceScreenTrack(sourcePeerId, track);

    track.onended = () => {
      const current = sourceMedia.get(sourcePeerId)?.screenTrack || null;
      if (current === track) {
        setSourceScreenTrack(sourcePeerId, null);
      }
    };
    return;
  }

  const screenAudioTrackId = screenAudioTrackIdsBySource.get(sourcePeerId) || null;
  addSourceVoiceTrack(sourcePeerId, track, {
    isScreenAudio: Boolean(screenAudioTrackId && screenAudioTrackId === track.id),
  });

  track.onended = () => {
    removeSourceVoiceTrack(sourcePeerId, track.id);
  };
}

function ensureTransceiverCanSend(transceiver) {
  if (!transceiver) {
    return;
  }

  const direction = transceiver.direction;
  if (direction === "sendonly" || direction === "sendrecv") {
    return;
  }

  try {
    transceiver.direction = "sendonly";
  } catch {
    // no-op
  }
}

function updateMemberScreenSenders(entry) {
  if (isHost) {
    return;
  }

  const all = entry.pc.getTransceivers();

  let videoSender = null;
  let audioSender = null;
  let videoTransceiver = null;
  let audioTransceiver = null;

  if (entry.upstreamMids?.videoMid) {
    videoTransceiver = all.find((item) => item.mid === entry.upstreamMids.videoMid) || null;
    videoSender = videoTransceiver?.sender || null;
  }

  if (entry.upstreamMids?.screenAudioMid) {
    audioTransceiver = all.find((item) => item.mid === entry.upstreamMids.screenAudioMid) || null;
    audioSender = audioTransceiver?.sender || null;
  } else if (entry.upstreamMids?.audioMid) {
    audioTransceiver = all.find((item) => item.mid === entry.upstreamMids.audioMid) || null;
    audioSender = audioTransceiver?.sender || null;
  }

  if (!videoSender) {
    const fallbackVideo = all.find(
      (item) =>
        item.receiver &&
        item.receiver.track &&
        item.receiver.track.kind === "video" &&
        item.sender &&
        (item.direction === "sendrecv" ||
          item.direction === "sendonly" ||
          item.currentDirection === "sendrecv" ||
          item.currentDirection === "sendonly")
    );
    videoTransceiver = fallbackVideo || null;
    videoSender = videoTransceiver?.sender || null;
  }

  if (!audioSender) {
    const fallbackAudio = all.find(
      (item) =>
        item.receiver &&
        item.receiver.track &&
        item.receiver.track.kind === "audio" &&
        item.sender &&
        item.sender !== entry.micSender &&
        (item.direction === "sendrecv" ||
          item.direction === "sendonly" ||
          item.currentDirection === "sendrecv" ||
          item.currentDirection === "sendonly")
    );
    audioTransceiver = fallbackAudio || null;
    audioSender = audioTransceiver?.sender || null;
  }

  if (audioSender && entry.micSender && audioSender === entry.micSender) {
    audioSender = null;
    audioTransceiver = null;
  }

  ensureTransceiverCanSend(videoTransceiver);
  ensureTransceiverCanSend(audioTransceiver);

  entry.screenSender = videoSender;
  entry.screenAudioSender = audioSender;

  if (entry.screenAudioSender) {
    const screenAudioTransceiver =
      entry.pc.getTransceivers().find((item) => item.sender === entry.screenAudioSender) || null;
    applyPreferredAudioCodecsToTransceiver(screenAudioTransceiver, true);
  }

  const hostId = roomState?.hostId || null;
  const abrKey = hostId ? `member-upstream:${hostId}` : null;
  if (abrKey && entry.screenSender && localScreenTrack) {
    registerScreenSenderAbr(abrKey, entry.screenSender, {
      sourcePeerId: selfId,
      targetPeerId: hostId,
      isLocalPublisher: true,
    });
  } else {
    unregisterScreenSenderAbrByPrefix("member-upstream:");
  }

  if (localScreenTrack) {
    void publishLocalScreenToHost();
  }
}

function attachForwardedTrack(meta, track) {
  if (meta.sourcePeerId === selfId) {
    return;
  }

  if (meta.mediaType === "screen") {
    attachScreenTrack(meta.sourcePeerId, track);
  } else {
    attachVoiceTrack(meta.sourcePeerId, track, {
      sourceTrackId: meta.sourceTrackId,
      isScreenAudio: Boolean(meta.isScreenAudio),
    });
  }
}

function handleMemberInboundTrack(track) {
  if (isHost) {
    return;
  }

  const directMeta = trackMetaById.get(track.id);
  if (directMeta) {
    attachForwardedTrack(directMeta, track);
    return;
  }

  const exactSourceMeta = unresolvedMetaBySourceTrackId.get(track.id);
  if (exactSourceMeta) {
    bindForwardedPendingTrack(track, exactSourceMeta);
    return;
  }

  const fallbackMetaEntry = Array.from(unresolvedMetaBySourceTrackId.entries()).find(([, meta]) =>
    matchesMediaTypeKind(meta.mediaType, track.kind)
  );

  if (fallbackMetaEntry) {
    bindForwardedPendingTrack(track, fallbackMetaEntry[1]);
    return;
  }

  pendingTracksById.set(track.id, track);
}

async function handleOffer(from, payload) {
  const sdp = payload.sdp;
  let entry = peers.get(from);
  if (!entry) {
    entry = createPeerConnection(from);
  }

  if (!isHost && payload.upstreamMids) {
    entry.upstreamMids = payload.upstreamMids;
  }

  if (entry.pc.signalingState === "have-local-offer") {
    await entry.pc.setLocalDescription({ type: "rollback" });
  } else if (entry.pc.signalingState === "have-remote-offer") {
    return;
  }

  await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));

  if (!isHost) {
    updateMemberScreenSenders(entry);
  }

  applyPreferredAudioCodecsToPeerConnection(entry.pc);
  const answer = maybeApplyDlolmusToAnswerSdp(await entry.pc.createAnswer());
  await entry.pc.setLocalDescription(answer);

  socket.emit("signal", {
    to: from,
    payload: {
      type: "sdp-answer",
      sdp: entry.pc.localDescription,
    },
  });

  if (!isHost) {
    setStatus(t("connectedToHost"));
  }
}

async function handleAnswer(from, sdp) {
  const entry = peers.get(from);
  if (!entry) {
    return;
  }

  await entry.pc.setRemoteDescription(new RTCSessionDescription(sdp));
}

async function handleIce(from, candidate) {
  const entry = peers.get(from);
  if (!entry) {
    return;
  }

  try {
    await entry.pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch {
    // Candidate can arrive before remote description.
  }
}

function handleForwardTrackMeta(payload) {
  if (isHost) {
    return;
  }

  const sourceTrackId = String(payload.trackId || "");
  if (!sourceTrackId) {
    return;
  }

  const mediaType = payload.mediaType === "screen" ? "screen" : "voice";
  const meta = {
    sourcePeerId: String(payload.sourcePeerId),
    mediaType,
    sourceTrackId,
    isScreenAudio: mediaType === "voice" && payload.voiceType === "screen",
  };

  const resolvedTrackId = resolvedActualTrackIdBySourceKey.get(
    sourceTrackKey(meta.sourcePeerId, meta.mediaType, sourceTrackId)
  );
  if (resolvedTrackId) {
    trackMetaById.set(resolvedTrackId, meta);

    if (meta.mediaType === "voice") {
      setRemoteVoiceTrackScreenAudio(meta.sourcePeerId, sourceTrackId, meta.isScreenAudio);
    }
    return;
  }

  const exactPendingTrack = pendingTracksById.get(sourceTrackId);
  if (exactPendingTrack) {
    bindForwardedPendingTrack(exactPendingTrack, meta);
    return;
  }

  const fallbackPendingEntry = Array.from(pendingTracksById.entries()).find(([, track]) =>
    matchesMediaTypeKind(meta.mediaType, track.kind)
  );

  if (fallbackPendingEntry) {
    bindForwardedPendingTrack(fallbackPendingEntry[1], meta);
    return;
  }

  unresolvedMetaBySourceTrackId.set(sourceTrackId, meta);
}

function handleRemoveForwardedTrack(payload) {
  if (isHost) {
    return;
  }

  const sourcePeerId = String(payload.sourcePeerId);
  const mediaType = payload.mediaType === "screen" ? "screen" : "voice";
  const sourceTrackId = payload.trackId ? String(payload.trackId) : null;

  if (sourceTrackId) {
    unresolvedMetaBySourceTrackId.delete(sourceTrackId);

    const key = sourceTrackKey(sourcePeerId, mediaType, sourceTrackId);
    const actualTrackId = resolvedActualTrackIdBySourceKey.get(key) || sourceTrackId;
    resolvedActualTrackIdBySourceKey.delete(key);

    trackMetaById.delete(actualTrackId);
    pendingTracksById.delete(actualTrackId);

    if (mediaType === "screen") {
      removeScreenTrack(sourcePeerId);
    } else {
      removeVoiceTrack(sourcePeerId, actualTrackId);
    }
    return;
  }

  if (mediaType === "screen") {
    removeScreenTrack(sourcePeerId);
  } else {
    removeVoiceTrack(sourcePeerId);
  }

  for (const [sourceMetaTrackId, meta] of Array.from(unresolvedMetaBySourceTrackId.entries())) {
    if (meta.sourcePeerId === sourcePeerId && meta.mediaType === mediaType) {
      unresolvedMetaBySourceTrackId.delete(sourceMetaTrackId);
    }
  }

  for (const [knownTrackId, meta] of Array.from(trackMetaById.entries())) {
    if (meta.sourcePeerId === sourcePeerId && meta.mediaType === mediaType) {
      trackMetaById.delete(knownTrackId);
      pendingTracksById.delete(knownTrackId);
    }
  }

  for (const [key, actualTrackId] of Array.from(resolvedActualTrackIdBySourceKey.entries())) {
    if (key.startsWith(`${sourcePeerId}|${mediaType}|`)) {
      resolvedActualTrackIdBySourceKey.delete(key);
      pendingTracksById.delete(actualTrackId);
      trackMetaById.delete(actualTrackId);
    }
  }
}

async function publishLocalScreenToHost(options = {}) {
  if (isHost || !localScreenTrack) {
    localScreenPublishPending = false;
    return {
      ok: false,
      waiting: false,
      sentScreenAudioTrackId: null,
      keptMicOnly: false,
    };
  }

  const hostId = roomState?.hostId || null;
  const entry = hostId ? peers.get(hostId) : null;
  if (!hostId || !entry || !entry.screenSender) {
    if (localScreenLastPublishHostId) {
      unregisterScreenSenderAbr(`member-upstream:${localScreenLastPublishHostId}`);
      localScreenLastPublishHostId = null;
      localScreenLastPublishedAudioTrackId = null;
    }
    localScreenPublishPending = true;
    if (options.reportPending) {
      setStatus(t("screenPublishPending"));
    }
    return {
      ok: false,
      waiting: true,
      sentScreenAudioTrackId: null,
      keptMicOnly: false,
    };
  }

  try {
    const wasPending = localScreenPublishPending;
    if (localScreenLastPublishHostId && localScreenLastPublishHostId !== hostId) {
      unregisterScreenSenderAbr(`member-upstream:${localScreenLastPublishHostId}`);
    }
    applyScreenTrackHints(localScreenTrack);
    await entry.screenSender.replaceTrack(localScreenTrack);
    registerScreenSenderAbr(`member-upstream:${hostId}`, entry.screenSender, {
      sourcePeerId: selfId,
      targetPeerId: hostId,
      isLocalPublisher: true,
    });

    const canSendScreenAudio =
      Boolean(entry.screenAudioSender) &&
      (!entry.micSender || entry.screenAudioSender !== entry.micSender);
    const audioTrack = localScreenAudioTrack;

    if (canSendScreenAudio && entry.screenAudioSender) {
      if (audioTrack) {
        applyScreenAudioTrackHints(audioTrack);
      }
      await entry.screenAudioSender.replaceTrack(audioTrack || null);
      if (audioTrack) {
        void optimizeAudioSender(entry.screenAudioSender, { profile: "screen" });
      }
    }

    const sentScreenAudioTrackId = canSendScreenAudio && audioTrack ? audioTrack.id : null;
    socket.emit("signal", {
      to: hostId,
      payload: {
        type: "member-screen-state",
        enabled: true,
        screenAudioTrackId: sentScreenAudioTrackId,
      },
    });

    localScreenPublishPending = false;
    localScreenLastPublishHostId = hostId;
    localScreenLastPublishedAudioTrackId = sentScreenAudioTrackId;

    if (wasPending && options.reportReady !== false) {
      if (!audioTrack) {
        setStatus(t("screenSharingStartedNoAudio"));
      } else if (audioTrack && !sentScreenAudioTrackId) {
        setStatus(t("screenSharingStartedMicKept"));
      } else {
        setStatus(t("screenSharingStartedWithAudio"));
      }
    }

    return {
      ok: true,
      waiting: false,
      sentScreenAudioTrackId,
      keptMicOnly: Boolean(audioTrack && !sentScreenAudioTrackId),
    };
  } catch {
    localScreenPublishPending = true;
    if (options.reportPending) {
      setStatus(t("screenPublishPending"));
    }
    return {
      ok: false,
      waiting: true,
      sentScreenAudioTrackId: null,
      keptMicOnly: false,
    };
  }
}

async function startScreenShare() {
  if (!joined) {
    return;
  }

  if (screenPickerOpen) {
    return;
  }

  if (!isInVoiceChannel(roomState)) {
    setStatus(t("notInVoiceChannel"));
    return;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== "function") {
    setStatus(t("screenShareNotSupported"));
    return;
  }

  let electronCapturePrepared = false;
  let requestScreenAudio = true;
  try {
    if (canUseElectronScreenPicker()) {
      setStatus(t("screenPickerOpening"));
      const picked = await pickDisplaySourceForElectron();
      if (!picked) {
        const currentStatus = String(statusEl?.textContent || "").trim();
        if (!currentStatus || currentStatus === t("screenPickerOpening")) {
          setStatus(t("screenPickerCanceled"));
        }
        return;
      }

      requestScreenAudio = Boolean(picked.withAudio);
      setStatus(t("screenPreparingCapture"));
      const prepared = await window.desktopApp.prepareDisplayCapture({
        sourceId: picked.sourceId,
        withAudio: requestScreenAudio,
      });
      if (!prepared?.ok) {
        throw new Error(prepared?.reason || "Unable to prepare selected source");
      }
      electronCapturePrepared = true;
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: requestScreenAudio,
      selfBrowserSurface: "exclude",
      preferCurrentTab: false,
    });

    const videoTrack = stream.getVideoTracks()[0];
    const capturedAudioTrack = stream.getAudioTracks()[0] || null;
    let audioTrack = capturedAudioTrack;
    let startedVideoOnlyToKeepMic = false;

    if (!videoTrack) {
      throw new Error("No video track from display");
    }

    const likelySelfCapture = isLikelySelfScreenCaptureTrack(videoTrack);
    if (likelySelfCapture) {
      for (const item of stream.getTracks()) {
        item.stop();
      }
      const selfCaptureError = new Error("Self capture source blocked");
      selfCaptureError.name = "SelfCaptureBlocked";
      throw selfCaptureError;
    }

    if (audioTrack && !isContentDisplayAudioTrack(videoTrack, audioTrack)) {
      try {
        audioTrack.stop();
      } catch {
        // no-op
      }
      audioTrack = null;
    }

    applyScreenTrackHints(videoTrack);
    if (audioTrack) {
      applyScreenAudioTrackHints(audioTrack);
    }
    localScreenStream = stream;
    localScreenTrack = videoTrack;
    localScreenAudioTrack = audioTrack;
    localScreenPublishPending = false;
    localScreenLastPublishHostId = null;
    localScreenLastPublishedAudioTrackId = null;
    localScreenLikelySelfCapture = likelySelfCapture;
    attachLocalScreenPreview(videoTrack);

    videoTrack.onended = () => {
      void stopScreenShare(true);
    };

    if (isHost) {
      setSourceScreenTrack(selfId, videoTrack);
      if (audioTrack) {
        setSourceScreenAudioTrackId(selfId, audioTrack.id);
        addSourceVoiceTrack(selfId, audioTrack, {
          isScreenAudio: true,
        });
      } else {
        setSourceScreenAudioTrackId(selfId, null);
      }
    } else {
      localScreenPublishPending = true;
      const publishResult = await publishLocalScreenToHost({
        reportPending: true,
        reportReady: false,
      });
      startedVideoOnlyToKeepMic = Boolean(publishResult.keptMicOnly);
    }

    updateScreenButton();
    if (localScreenPublishPending) {
      setStatus(t("screenPublishPending"));
    } else if (!audioTrack) {
      setStatus(t("screenSharingStartedNoAudio"));
    } else if (startedVideoOnlyToKeepMic) {
      setStatus(t("screenSharingStartedMicKept"));
    } else {
      setStatus(t("screenSharingStartedWithAudio"));
    }
  } catch (error) {
    const errorName = String(error?.name || "");
    if (errorName === "SelfCaptureBlocked") {
      setStatus(t("screenSelfCaptureBlocked"));
    } else if (errorName === "NotAllowedError" || errorName === "AbortError") {
      setStatus(t("screenPickerCanceled"));
    } else {
      setStatus(t("screenShareError", { details: error?.message || error?.name || "UnknownError" }));
    }

    if (localScreenTrack) {
      localScreenTrack.stop();
    }

    if (localScreenStream) {
      for (const item of localScreenStream.getTracks()) {
        item.stop();
      }
    }

    localScreenTrack = null;
    localScreenAudioTrack = null;
    localScreenStream = null;
    localScreenPublishPending = false;
    localScreenLastPublishHostId = null;
    localScreenLastPublishedAudioTrackId = null;
    localScreenLikelySelfCapture = false;
    unregisterScreenSenderAbrByPrefix("member-upstream:");
    removeLocalScreenPreview();
    updateScreenButton();
  } finally {
    if (electronCapturePrepared && window.desktopApp?.clearPreparedDisplayCapture) {
      try {
        await window.desktopApp.clearPreparedDisplayCapture();
      } catch {
        // no-op
      }
    }
  }
}

async function stopScreenShare(fromEnded = false) {
  const activeVideoTrack = localScreenTrack;
  const activeAudioTrack = localScreenAudioTrack;
  const activeStream = localScreenStream;

  if (!activeVideoTrack && !activeAudioTrack && !activeStream) {
    localScreenLikelySelfCapture = false;
    updateScreenButton();
    return;
  }

  localScreenTrack = null;
  localScreenAudioTrack = null;
  localScreenStream = null;
  localScreenPublishPending = false;
  localScreenLikelySelfCapture = false;
  removeLocalScreenPreview();

  if (activeVideoTrack) {
    activeVideoTrack.onended = null;
    if (!fromEnded) {
      try {
        activeVideoTrack.stop();
      } catch {
        // no-op
      }
    }
  }

  if (activeAudioTrack) {
    try {
      activeAudioTrack.stop();
    } catch {
      // no-op
    }
  }

  if (activeStream) {
    for (const item of activeStream.getTracks()) {
      if (item !== activeVideoTrack && item !== activeAudioTrack) {
        item.stop();
      }
    }
  }

  if (isHost) {
    setSourceScreenTrack(selfId, null);
    setSourceScreenAudioTrackId(selfId, null);
    if (activeAudioTrack) {
      removeSourceVoiceTrack(selfId, activeAudioTrack.id);
    }
  } else {
    const hostId = roomState?.hostId;
    const entry = hostId ? peers.get(hostId) : null;
    const canSendScreenAudio =
      Boolean(entry && entry.screenAudioSender) &&
      (!entry?.micSender || entry.screenAudioSender !== entry.micSender);
    const removedScreenAudioTrackId =
      localScreenLastPublishedAudioTrackId || (canSendScreenAudio ? activeAudioTrack?.id || null : null);

    if (entry && entry.screenSender) {
      await entry.screenSender.replaceTrack(null).catch(() => {
        // no-op
      });
    }

    if (entry && canSendScreenAudio && entry.screenAudioSender) {
      await entry.screenAudioSender.replaceTrack(null).catch(() => {
        // no-op
      });
    }

    if (hostId) {
      socket.emit("signal", {
        to: hostId,
        payload: {
          type: "member-screen-state",
          enabled: false,
          screenAudioTrackId: removedScreenAudioTrackId,
        },
      });
    }

    unregisterScreenSenderAbrByPrefix("member-upstream:");
  }

  localScreenLastPublishHostId = null;
  localScreenLastPublishedAudioTrackId = null;
  localScreenQualityProfileId = "high";
  updateScreenButton();
  renderScreens();
  setStatus(t("screenSharingStopped"));
}

async function becomeHost() {
  if (!joined || !selfId) {
    return;
  }

  clearAllPeerReconnectState();
  if (isHost) {
    unregisterScreenSenderAbrByPrefix("member-upstream:");
    const outboundMicTrack = getOutboundMicTrack();
    if (outboundMicTrack) {
      addSourceVoiceTrack(selfId, outboundMicTrack);
    }

    if (localScreenTrack) {
      setSourceScreenTrack(selfId, localScreenTrack);
    }

    if (localScreenAudioTrack) {
      setSourceScreenAudioTrackId(selfId, localScreenAudioTrack.id);
      addSourceVoiceTrack(selfId, localScreenAudioTrack, {
        isScreenAudio: true,
      });
    } else {
      setSourceScreenAudioTrackId(selfId, null);
    }

    return;
  }

  for (const peerId of Array.from(peers.keys())) {
    closePeer(peerId, true);
  }

  clearAllRemoteMedia();
  clearForwardTrackMaps();
  unregisterScreenSenderAbrByPrefix("member-upstream:");
  localScreenPublishPending = false;
  localScreenLastPublishHostId = null;
  localScreenLastPublishedAudioTrackId = null;

  isHost = true;

  await ensureLocalStream();
  addSourceVoiceTrack(selfId, getOutboundMicTrack());

  if (localScreenTrack) {
    setSourceScreenTrack(selfId, localScreenTrack);
  }

  if (localScreenAudioTrack) {
    setSourceScreenAudioTrackId(selfId, localScreenAudioTrack.id);
    addSourceVoiceTrack(selfId, localScreenAudioTrack, {
      isScreenAudio: true,
    });
  } else {
    setSourceScreenAudioTrackId(selfId, null);
  }

  setStatus(t("hostMode"));

  if (!roomState) {
    return;
  }

  for (const member of getVoiceMembersFromRoom(roomState)) {
    if (member.id !== selfId) {
      offerPeer(member.id);
    }
  }
}

function becomeMember(nextHostId) {
  clearAllPeerReconnectState();
  sourceMedia.clear();
  screenAudioTrackIdsBySource.clear();
  unregisterScreenSenderAbrByPrefix("host-forward:");

  for (const peerId of Array.from(peers.keys())) {
    closePeer(peerId, true);
  }

  clearAllRemoteMedia();
  clearForwardTrackMaps();

  isHost = false;
  localScreenPublishPending = Boolean(localScreenTrack);
  localScreenLastPublishHostId = null;
  localScreenLastPublishedAudioTrackId = null;
  unregisterScreenSenderAbrByPrefix("member-upstream:");

  if (nextHostId) {
    setStatus(t("waitingForHost"));
    schedulePeerReconnect(nextHostId, {
      reason: "waiting-for-host",
      immediate: true,
    });
  } else {
    setStatus(t("inVoiceRoom"));
  }
}

function becomeServerOnly() {
  clearAllPeerReconnectState();
  sourceMedia.clear();
  screenAudioTrackIdsBySource.clear();
  unregisterScreenSenderAbrByPrefix("host-forward:");
  unregisterScreenSenderAbrByPrefix("member-upstream:");
  localScreenPublishPending = false;
  localScreenLastPublishHostId = null;
  localScreenLastPublishedAudioTrackId = null;

  for (const peerId of Array.from(peers.keys())) {
    closePeer(peerId, true);
  }

  clearAllRemoteMedia();
  clearForwardTrackMaps();

  isHost = false;
  setStatus(t("connectedToServer"));
}

function resetSessionState() {
  clearMicMuteTimer();
  closeScreenPickerDialogWithResult(null);
  clearAllPeerReconnectState();

  for (const peerId of Array.from(peers.keys())) {
    closePeer(peerId, true);
  }

  sourceMedia.clear();
  screenAudioTrackIdsBySource.clear();
  userVolumes.clear();
  screenAudioVolumes.clear();
  stopScreenAbrLoop();
  screenSenderAbrStateByKey.clear();
  clearSpeakingDetectionState();
  clearForwardTrackMaps();
  clearAllRemoteMedia();
  removeLocalScreenPreview();

  if (localStream) {
    for (const track of localStream.getTracks()) {
      track.stop();
    }
  }

  if (localScreenStream) {
    for (const track of localScreenStream.getTracks()) {
      track.stop();
    }
  }

  if (localOutboundMicTrack && localOutboundMicTrack !== localMicTrack) {
    localOutboundMicTrack.stop();
  }

  disposeMicProcessing();

  if (playbackContext) {
    playbackContext.close().catch(() => {
      // no-op
    });
    playbackContext = null;
  }

  selfId = null;
  roomState = null;
  joined = false;
  isHost = false;
  lastVoiceChannelId = null;
  lastVoiceMemberIds = new Set();
  voiceCueBaselineReady = false;

  localStream = null;
  localMicTrack = null;
  localOutboundMicTrack = null;
  localScreenTrack = null;
  localScreenAudioTrack = null;
  localScreenStream = null;
  localScreenPreview = null;
  localScreenPublishPending = false;
  localScreenLastPublishHostId = null;
  localScreenLastPublishedAudioTrackId = null;
  localScreenQualityProfileId = "high";
  localScreenQualityUpdatedAt = 0;
  localScreenLikelySelfCapture = false;
  pinnedScreenUserId = null;
  activeScreenUserId = null;
  activeScreenSourceTrackId = null;
  activeScreenStageItem = null;
  mutedScreenUserIds.clear();
  screenStartedAtByUserId.clear();

  isMuted = false;
  updateMuteButtonLabel();
  updateScreenButton();
  notificationPreviewRoomId = "";
  if (roomInput) {
    roomInput.value = "";
  }

  controls.classList.add("hidden");
  joinForm.classList.remove("hidden");
  participantsList.innerHTML = "";
  if (screenFilmstripEl) {
    screenFilmstripEl.innerHTML = "";
  }
  replaceChatMessages([]);
  chatSubmitInProgress = false;
  clearPendingChatAttachments();
  relayCapabilityToken = "";
  relayCapabilityTokenExpiresAt = 0;
  relayCapabilityRoomId = "";
  updateChatAvailability();
  updateRoomLabels(MAIN_PAGE_LABEL);
  renderVoiceChannels();
  renderSavedRooms();

  setStatus(t("disconnected"));
}

function waitForSocketConnection(timeoutMs = JOIN_SOCKET_CONNECT_TIMEOUT_MS) {
  if (socket.connected) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;

    const finalize = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      resolve(Boolean(ok));
    };

    const onConnect = () => finalize(true);
    const onConnectError = () => finalize(false);
    const timeoutId = setTimeout(() => finalize(false), Math.max(1000, Number(timeoutMs) || 0));

    socket.once("connect", onConnect);
    socket.once("connect_error", onConnectError);
    socket.connect();
  });
}

async function requestJoinRoom(targetRoomId = null) {
  const roomId = normalizeRoomIdValue(targetRoomId ?? roomInput.value);
  if (!roomId || roomId.toLowerCase() === MAIN_PAGE_LABEL) {
    setStatus(t("joinServerFirst"));
    return;
  }

  await fetchBackendNetworkMode();
  if (isRelayModeActive()) {
    const relayKey = await ensureRelayRoomKey(roomId);
    if (!relayKey) {
      setStatus(t("relayAccessCodeRequired"));
      return;
    }
  }

  notificationPreviewRoomId = "";
  persistProfileName();
  const name = getProfileName();

  if (joinInProgress) {
    return;
  }

  if (joined && normalizeRoomIdValue(roomState?.id).toLowerCase() === roomId.toLowerCase()) {
    updateRoomLabels(roomId);
    renderSavedRooms();
    renderVoiceChannels();
    return;
  }

  joinInProgress = true;

  try {
    if (joined) {
      if (localScreenTrack) {
        await stopScreenShare(false);
      }

      socket.emit("leave-room");
      resetSessionState();
      setStatus(t("switchingServer"));
    }

    roomInput.value = roomId;
    updateRoomLabels(roomId);
    ensureSavedRoom(roomId);
    renderSavedRooms();

    const isConnected = await waitForSocketConnection();
    if (!isConnected) {
      setStatus(
        t("connectionError", {
          details: t("backendUnavailable"),
        })
      );
      return;
    }

    await iceConfigReady;

    socket.emit("join-room", { roomId, name, authorId: CHAT_AUTHOR_ID });
    setStatus(t("joiningServer"));
  } catch (error) {
    setStatus(getMicErrorMessage(error));
  } finally {
    joinInProgress = false;
  }
}

function getSuggestedServerId() {
  const used = new Set();
  for (const roomId of savedRooms) {
    const normalized = normalizeRoomIdValue(roomId).toLowerCase();
    if (normalized) {
      used.add(normalized);
    }
  }
  if (roomState?.id) {
    const current = normalizeRoomIdValue(roomState.id).toLowerCase();
    if (current) {
      used.add(current);
    }
  }

  let index = 1;
  while (used.has(`server-${index}`)) {
    index += 1;
  }
  return `server-${index}`;
}

function getSuggestedJoinServerId() {
  const currentInput = normalizeRoomIdValue(roomInput?.value);
  if (currentInput && currentInput.toLowerCase() !== MAIN_PAGE_LABEL) {
    return currentInput;
  }

  const currentRoom = normalizeRoomIdValue(roomState?.id);
  if (currentRoom && currentRoom.toLowerCase() !== MAIN_PAGE_LABEL) {
    return currentRoom;
  }

  for (const roomId of savedRooms) {
    const normalized = normalizeRoomIdValue(roomId);
    if (normalized && normalized.toLowerCase() !== MAIN_PAGE_LABEL) {
      return normalized;
    }
  }

  return getSuggestedServerId();
}

async function promptJoinServerAndConnect() {
  const proposed = await promptInput(t("promptEnterServerId"), getSuggestedJoinServerId());
  if (proposed === null) {
    return;
  }

  const nextRoomId = normalizeRoomIdValue(proposed);
  if (!nextRoomId || nextRoomId.toLowerCase() === MAIN_PAGE_LABEL) {
    setStatus(t("joinServerFirst"));
    return;
  }

  roomInput.value = nextRoomId;
  updateRoomLabels(nextRoomId);
  renderSavedRooms();
  void requestJoinRoom(nextRoomId);
}

async function promptCreateServerAndJoin() {
  const proposed = await promptInput(t("promptEnterServerId"), getSuggestedServerId());
  if (proposed === null) {
    return;
  }

  const nextRoomId = normalizeRoomIdValue(proposed);
  if (!nextRoomId || nextRoomId.toLowerCase() === MAIN_PAGE_LABEL) {
    setStatus(t("joinServerFirst"));
    return;
  }

  roomInput.value = nextRoomId;
  ensureSavedRoom(nextRoomId);
  updateRoomLabels(nextRoomId);
  renderSavedRooms();
  void requestJoinRoom(nextRoomId);
}

async function handlePreferredMicDeviceChange(nextDeviceId) {
  preferredMicDeviceId = normalizeDeviceId(nextDeviceId);
  persistPreferredMicDeviceId();

  if (!localMicTrack) {
    await refreshProfileDeviceSelectors();
    return;
  }

  try {
    const capturedStream = await captureMicrophoneStream();
    const capturedMicTrack = capturedStream.getAudioTracks()[0] || null;
    if (!capturedMicTrack) {
      const error = new Error("No microphone track");
      error.name = "NotFoundError";
      throw error;
    }

    await applyNewLocalMicTrack(capturedMicTrack, capturedStream);
    await refreshProfileDeviceSelectors();
    setStatus(
      preferredMicDeviceId
        ? t("microphoneSwitched")
        : t("defaultMicrophoneSelected")
    );
  } catch (error) {
    setStatus(
      t("microphoneSwitchFailed", {
        details: error?.message || error?.name || "UnknownError",
      })
    );
    await refreshProfileDeviceSelectors();
  }
}

async function handlePreferredSpeakerDeviceChange(nextDeviceId) {
  preferredSpeakerDeviceId = normalizeDeviceId(nextDeviceId);
  persistPreferredSpeakerDeviceId();

  if (!browserSupportsAudioOutputSelection()) {
    return;
  }

  await applyPreferredSpeakerToAllOutputs();
  setStatus(
    preferredSpeakerDeviceId
      ? t("speakersSwitched")
      : t("defaultSpeakersSelected")
  );
}

