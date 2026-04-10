function unregisterScreenSenderAbrByPrefix(prefix) {
  const cleanPrefix = String(prefix || "");
  if (!cleanPrefix) {
    return;
  }
  for (const key of Array.from(screenSenderAbrStateByKey.keys())) {
    if (key.startsWith(cleanPrefix)) {
      screenSenderAbrStateByKey.delete(key);
    }
  }
  if (screenSenderAbrStateByKey.size === 0) {
    stopScreenAbrLoop();
  }
  syncLocalScreenQualityProfileFromAbr();
}

function registerScreenSenderAbr(key, sender, options = {}) {
  const cleanKey = String(key || "").trim();
  if (!cleanKey) {
    return;
  }

  if (!sender || sender.track?.kind !== "video") {
    screenSenderAbrStateByKey.delete(cleanKey);
    if (screenSenderAbrStateByKey.size === 0) {
      stopScreenAbrLoop();
    }
    syncLocalScreenQualityProfileFromAbr();
    return;
  }

  const previous = screenSenderAbrStateByKey.get(cleanKey);
  screenSenderAbrStateByKey.set(cleanKey, {
    key: cleanKey,
    sender,
    profileId: previous?.profileId || "high",
    stableTicks: previous?.stableTicks || 0,
    lastPacketsLost: previous?.lastPacketsLost || 0,
    lastPacketsReceived: previous?.lastPacketsReceived || 0,
    sourcePeerId: options.sourcePeerId || previous?.sourcePeerId || null,
    targetPeerId: options.targetPeerId || previous?.targetPeerId || null,
    isLocalPublisher:
      typeof options.isLocalPublisher === "boolean"
        ? options.isLocalPublisher
        : Boolean(previous?.isLocalPublisher),
  });
  const state = screenSenderAbrStateByKey.get(cleanKey);
  if (state) {
    void applyScreenProfileToSender(state, state.profileId);
  }
  ensureScreenAbrLoop();
  syncLocalScreenQualityProfileFromAbr();
}

function unregisterScreenSenderAbr(key) {
  const cleanKey = String(key || "").trim();
  if (!cleanKey) {
    return;
  }

  screenSenderAbrStateByKey.delete(cleanKey);
  if (screenSenderAbrStateByKey.size === 0) {
    stopScreenAbrLoop();
  }
  syncLocalScreenQualityProfileFromAbr();
}

async function collectScreenSenderStats(sender) {
  if (!sender || typeof sender.getStats !== "function") {
    return null;
  }

  const report = await sender.getStats();
  let outbound = null;
  let remoteInbound = null;
  let candidatePair = null;

  report.forEach((stat) => {
    if (stat.type === "outbound-rtp" && !stat.isRemote && stat.kind === "video") {
      outbound = stat;
    }
    if (stat.type === "remote-inbound-rtp" && stat.kind === "video") {
      remoteInbound = stat;
    }
    if (stat.type === "candidate-pair" && stat.state === "succeeded" && typeof stat.currentRoundTripTime === "number") {
      candidatePair = stat;
    }
  });

  if (!outbound) {
    return null;
  }

  return {
    packetsLost: Number(remoteInbound?.packetsLost || 0),
    packetsReceived: Number(remoteInbound?.packetsReceived || 0),
    framesPerSecond: Number(outbound?.framesPerSecond || 0),
    frameWidth: Number(outbound?.frameWidth || 0),
    frameHeight: Number(outbound?.frameHeight || 0),
    qualityLimitationReason: String(outbound?.qualityLimitationReason || "none"),
    rtt:
      typeof remoteInbound?.roundTripTime === "number"
        ? Number(remoteInbound.roundTripTime)
        : Number(candidatePair?.currentRoundTripTime || 0),
  };
}

function deriveNextScreenProfileId(state, stats) {
  const lossDelta = Math.max(0, stats.packetsLost - state.lastPacketsLost);
  const recvDelta = Math.max(0, stats.packetsReceived - state.lastPacketsReceived);
  const totalDelta = lossDelta + recvDelta;
  const lossRatio = totalDelta > 0 ? lossDelta / totalDelta : 0;
  const rtt = Number.isFinite(stats.rtt) ? Math.max(0, stats.rtt) : 0;
  const fps = Number.isFinite(stats.framesPerSecond) ? Math.max(0, stats.framesPerSecond) : 0;
  const reason = String(stats.qualityLimitationReason || "none").toLowerCase();

  let nextIndex = getScreenProfileIndex(state.profileId);

  const severe = lossRatio >= 0.15 || rtt >= 0.55 || reason === "bandwidth";
  const degraded = lossRatio >= 0.07 || rtt >= 0.34 || reason === "cpu" || (fps > 0 && fps < 15);
  const healthy = lossRatio <= 0.02 && rtt > 0 && rtt <= 0.22 && reason === "none" && fps >= 20;

  if (severe) {
    nextIndex = Math.min(SCREEN_QUALITY_PROFILE_ORDER.length - 1, nextIndex + 2);
    state.stableTicks = 0;
  } else if (degraded) {
    nextIndex = Math.min(SCREEN_QUALITY_PROFILE_ORDER.length - 1, nextIndex + 1);
    state.stableTicks = 0;
  } else if (healthy) {
    state.stableTicks += 1;
    if (state.stableTicks >= 3) {
      nextIndex = Math.max(0, nextIndex - 1);
      state.stableTicks = 0;
    }
  } else {
    state.stableTicks = 0;
  }

  state.lastPacketsLost = stats.packetsLost;
  state.lastPacketsReceived = stats.packetsReceived;

  return getProfileIdByIndex(nextIndex);
}

async function applyScreenProfileToSender(state, profileId) {
  const profile = SCREEN_QUALITY_PROFILE_PRESETS[profileId];
  if (!profile || !state?.sender) {
    return false;
  }

  const sender = state.sender;
  if (typeof sender.getParameters !== "function" || typeof sender.setParameters !== "function") {
    state.profileId = profileId;
    return false;
  }

  try {
    const params = sender.getParameters() || {};
    const encodings =
      Array.isArray(params.encodings) && params.encodings.length > 0 ? params.encodings : [{}];
    const primary = { ...encodings[0] };
    primary.maxBitrate = profile.maxBitrate;
    primary.maxFramerate = profile.maxFramerate;
    primary.scaleResolutionDownBy = profile.scaleResolutionDownBy;
    params.encodings = [primary, ...encodings.slice(1)];
    await sender.setParameters(params);
  } catch {
    // Some browsers expose a subset of sender parameters.
  }

  if (state.profileId !== profileId) {
    state.profileId = profileId;

    if (state.isLocalPublisher) {
      const now = Date.now();
      const canNotify = now - localScreenQualityUpdatedAt > 3500;
      localScreenQualityUpdatedAt = now;
      syncLocalScreenQualityProfileFromAbr();
      if (canNotify) {
        setStatus(t("screenQualityChanged", { profile: getScreenQualityLabel(profileId) }));
      }
    }
  }

  return true;
}

async function tickScreenAbrLoop() {
  if (screenAbrTickInFlight) {
    return;
  }

  if (screenSenderAbrStateByKey.size === 0) {
    stopScreenAbrLoop();
    return;
  }

  screenAbrTickInFlight = true;
  try {
    for (const [key, state] of Array.from(screenSenderAbrStateByKey.entries())) {
      if (!state?.sender || state.sender.track?.kind !== "video") {
        screenSenderAbrStateByKey.delete(key);
        continue;
      }

      try {
        const stats = await collectScreenSenderStats(state.sender);
        if (!stats) {
          continue;
        }

        const nextProfileId = deriveNextScreenProfileId(state, stats);
        if (nextProfileId !== state.profileId) {
          await applyScreenProfileToSender(state, nextProfileId);
        }
      } catch {
        // Ignore per-sender stats errors.
      }
    }
  } finally {
    screenAbrTickInFlight = false;
    if (screenSenderAbrStateByKey.size === 0) {
      stopScreenAbrLoop();
    }
    syncLocalScreenQualityProfileFromAbr();
  }
}

function codecMime(codec) {
  return String(codec?.mimeType || "").toLowerCase();
}

function getAudioCodecCapabilities() {
  const senderCaps =
    typeof RTCRtpSender !== "undefined" &&
    typeof RTCRtpSender.getCapabilities === "function"
      ? RTCRtpSender.getCapabilities("audio")
      : null;
  const receiverCaps =
    typeof RTCRtpReceiver !== "undefined" &&
    typeof RTCRtpReceiver.getCapabilities === "function"
      ? RTCRtpReceiver.getCapabilities("audio")
      : null;

  const codecs = senderCaps?.codecs || receiverCaps?.codecs || [];
  return Array.isArray(codecs) ? codecs.filter((item) => item && item.mimeType) : [];
}

function buildPreferredAudioCodecs() {
  const codecs = getAudioCodecCapabilities();
  if (codecs.length === 0) {
    return [];
  }

  const redCodecs = [];
  const opusCodecs = [];
  const otherCodecs = [];

  for (const codec of codecs) {
    const mimeType = codecMime(codec);
    if (mimeType === "audio/red") {
      redCodecs.push(codec);
      continue;
    }
    if (mimeType === "audio/opus") {
      opusCodecs.push(codec);
      continue;
    }
    otherCodecs.push(codec);
  }

  if (opusCodecs.length === 0) {
    return codecs;
  }

  if (redCodecs.length === 0) {
    return [...opusCodecs, ...otherCodecs];
  }

  return [...redCodecs, ...opusCodecs, ...otherCodecs];
}

const preferredAudioCodecs = buildPreferredAudioCodecs();
const hasOpusCodec = preferredAudioCodecs.some((codec) => codecMime(codec) === "audio/opus");
const hasRedCodec = preferredAudioCodecs.some((codec) => codecMime(codec) === "audio/red");

function applyPreferredAudioCodecsToTransceiver(transceiver, force = false) {
  if (
    !transceiver ||
    preferredAudioCodecs.length === 0 ||
    typeof transceiver.setCodecPreferences !== "function"
  ) {
    return;
  }

  const senderKind = transceiver.sender?.track?.kind || null;
  const receiverKind = transceiver.receiver?.track?.kind || null;
  const isAudio = senderKind === "audio" || receiverKind === "audio";
  if (!force && !isAudio) {
    return;
  }

  try {
    transceiver.setCodecPreferences(preferredAudioCodecs);
  } catch {
    // no-op
  }
}

function applyPreferredAudioCodecsToPeerConnection(pc) {
  if (!pc || preferredAudioCodecs.length === 0) {
    return;
  }

  for (const transceiver of pc.getTransceivers()) {
    applyPreferredAudioCodecsToTransceiver(transceiver);
  }
}

function toUrlArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return [value];
  }
  return [];
}

function normalizeIceServer(server) {
  if (!server || typeof server !== "object") {
    return null;
  }

  const urls = toUrlArray(server.urls).map((url) => String(url).trim()).filter(Boolean);
  if (urls.length === 0) {
    return null;
  }

  const normalized = { urls: urls.length === 1 ? urls[0] : urls };

  if (typeof server.username === "string" && server.username.trim()) {
    normalized.username = server.username;
  }

  if (typeof server.credential === "string" && server.credential.trim()) {
    normalized.credential = server.credential;
  }

  return normalized;
}

function normalizeRtcConfig(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.iceServers)) {
    return null;
  }

  const iceServers = raw.iceServers.map(normalizeIceServer).filter(Boolean);
  if (iceServers.length === 0) {
    return null;
  }

  return {
    iceServers,
    iceTransportPolicy: raw.iceTransportPolicy === "relay" ? "relay" : "all",
  };
}

async function loadRtcConfigFromServer() {
  try {
    const response = await fetch("/api/ice-config", {
      cache: "no-store",
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    const normalized = normalizeRtcConfig(payload);

    if (normalized) {
      rtcConfig = normalized;
    }
  } catch {
    // Keep default STUN config.
  }
}

const iceConfigReady = loadRtcConfigFromServer();

function getDisplayName(userId) {
  if (!roomState) {
    return t("guest");
  }

  const members = Array.isArray(roomState.members) ? roomState.members : [];
  const member = members.find((item) => item.id === userId);
  return member ? member.name : t("guest");
}

function isTrustedOriginForMic() {
  return window.isSecureContext || localHosts.has(window.location.hostname);
}

function getMicErrorMessage(error) {
  const name = error?.name || "UnknownError";

  if (name === "InsecureContextError" || name === "MediaDevicesUnavailable") {
    return t("micErrorHttps");
  }

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return t("micErrorDenied");
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return t("micErrorNoDevice");
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return t("micErrorBusy");
  }

  return t("micErrorGeneric", { name });
}

function getUserVolume(userId) {
  return clamp(userVolumes.get(userId) ?? 1, 0, VOLUME_GAIN_MAX);
}

function getScreenAudioVolume(userId) {
  return clamp(screenAudioVolumes.get(userId) ?? 1, 0, VOLUME_GAIN_MAX);
}

function sliderPercentToVolumeGain(percentValue) {
  const percent = clamp(Number(percentValue) || 0, VOLUME_SLIDER_MIN, VOLUME_SLIDER_MAX);
  if (percent <= VOLUME_SLIDER_MIN) {
    return 0;
  }

  if (percent <= VOLUME_SLIDER_BASE) {
    const normalized = percent / VOLUME_SLIDER_BASE;
    return clamp(Math.pow(normalized, VOLUME_CURVE_BELOW_BASE_EXP), 0, 1);
  }

  const boostNormalized =
    (percent - VOLUME_SLIDER_BASE) / (VOLUME_SLIDER_MAX - VOLUME_SLIDER_BASE);
  const boostedGain = 1 + Math.pow(boostNormalized, VOLUME_CURVE_ABOVE_BASE_EXP);
  return clamp(boostedGain, 0, VOLUME_GAIN_MAX);
}

function volumeGainToSliderPercent(gainValue) {
  const gain = clamp(Number(gainValue) || 0, 0, VOLUME_GAIN_MAX);
  if (gain <= 0) {
    return VOLUME_SLIDER_MIN;
  }

  if (gain <= 1) {
    const normalized = Math.pow(gain, 1 / VOLUME_CURVE_BELOW_BASE_EXP);
    return clamp(
      normalized * VOLUME_SLIDER_BASE,
      VOLUME_SLIDER_MIN,
      VOLUME_SLIDER_BASE
    );
  }

  const boostedPart = clamp(gain - 1, 0, 1);
  const boostNormalized = Math.pow(boostedPart, 1 / VOLUME_CURVE_ABOVE_BASE_EXP);
  return clamp(
    VOLUME_SLIDER_BASE + boostNormalized * (VOLUME_SLIDER_MAX - VOLUME_SLIDER_BASE),
    VOLUME_SLIDER_BASE,
    VOLUME_SLIDER_MAX
  );
}

function formatVolumePercentLabel(percentValue) {
  const percent = Math.round(clamp(Number(percentValue) || 0, VOLUME_SLIDER_MIN, VOLUME_SLIDER_MAX));
  return `${percent}%`;
}

function hasScreenAudioTrack(userId) {
  const entry = remoteVoice.get(userId);
  if (!entry) {
    return false;
  }

  for (const item of entry.tracks.values()) {
    if (item.isScreenAudio) {
      return true;
    }
  }

  return false;
}

function isScreenAudioMuted(userId) {
  return mutedScreenUserIds.has(userId);
}

function setScreenAudioMuted(userId, muted) {
  if (muted) {
    mutedScreenUserIds.add(userId);
  } else {
    mutedScreenUserIds.delete(userId);
  }
  applyUserVolume(userId);
}

function setScreenAudioVolume(userId, value) {
  const volume = clamp(value, 0, VOLUME_GAIN_MAX);
  screenAudioVolumes.set(userId, volume);
  applyUserVolume(userId);
}

function markScreenStarted(userId) {
  screenStartedAtByUserId.set(userId, Date.now());
}

function clearScreenDisplayStateForUser(userId) {
  screenStartedAtByUserId.delete(userId);
  mutedScreenUserIds.delete(userId);
  screenAudioVolumes.delete(userId);
  if (pinnedScreenUserId === userId) {
    pinnedScreenUserId = null;
  }
  if (activeScreenUserId === userId) {
    activeScreenUserId = null;
    activeScreenSourceTrackId = null;
    activeScreenStageItem = null;
  }
}

function isUserSpeaking(userId) {
  return speakingUserIds.has(userId);
}

function readTrackAudioLevel(item) {
  if (!item?.analyserNode || !item?.analysisBuffer) {
    return 0;
  }

  const buffer = item.analysisBuffer;
  if (!buffer.length) {
    return 0;
  }

  try {
    item.analyserNode.getByteTimeDomainData(buffer);
  } catch {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const normalized = (buffer[index] - 128) / 128;
    sum += normalized * normalized;
  }

  return Math.sqrt(sum / buffer.length);
}

function ensureSpeakingDetectionLoop() {
  if (speakingDetectionTimer) {
    return;
  }

  speakingDetectionTimer = window.setInterval(() => {
    const now = Date.now();
    const activeUserIds = new Set();
    let speakingChanged = false;

    for (const [userId, entry] of remoteVoice.entries()) {
      activeUserIds.add(userId);

      let peakLevel = 0;
      for (const item of entry.tracks.values()) {
        if (item.isScreenAudio) {
          continue;
        }
        if (item.isFadingOut) {
          continue;
        }
        const level = readTrackAudioLevel(item);
        if (level > peakLevel) {
          peakLevel = level;
        }
      }

      const state = speakingStateByUserId.get(userId) || {
        smoothedLevel: 0,
        holdUntil: 0,
        speaking: false,
      };

      state.smoothedLevel += (peakLevel - state.smoothedLevel) * SPEAKING_LEVEL_SMOOTHING;

      if (state.smoothedLevel >= SPEAKING_LEVEL_ON_THRESHOLD) {
        state.holdUntil = now + SPEAKING_HOLD_MS;
        if (!state.speaking) {
          state.speaking = true;
          speakingUserIds.add(userId);
          speakingChanged = true;
        }
      } else if (
        state.speaking &&
        state.smoothedLevel <= SPEAKING_LEVEL_OFF_THRESHOLD &&
        now >= state.holdUntil
      ) {
        state.speaking = false;
        speakingUserIds.delete(userId);
        speakingChanged = true;
      }

      speakingStateByUserId.set(userId, state);
    }

    for (const userId of Array.from(speakingStateByUserId.keys())) {
      if (!activeUserIds.has(userId)) {
        speakingStateByUserId.delete(userId);
      }
    }

    for (const userId of Array.from(speakingUserIds)) {
      if (!activeUserIds.has(userId)) {
        speakingUserIds.delete(userId);
        speakingChanged = true;
      }
    }

    if (speakingChanged) {
      renderParticipants();
      renderVoiceChannels();
    }
  }, SPEAKING_DETECTION_INTERVAL_MS);
}

function stopSpeakingDetectionLoop() {
  if (speakingDetectionTimer) {
    clearInterval(speakingDetectionTimer);
    speakingDetectionTimer = null;
  }
}

function clearSpeakingDetectionState() {
  const hadSpeaking = speakingUserIds.size > 0;
  stopSpeakingDetectionLoop();
  speakingStateByUserId.clear();
  speakingUserIds.clear();
  if (hadSpeaking) {
    renderParticipants();
    renderVoiceChannels();
  }
}

function cleanupSpeakingDetectionForUser(userId) {
  speakingStateByUserId.delete(userId);
  const hadSpeaking = speakingUserIds.delete(userId);
  if (hadSpeaking) {
    renderParticipants();
    renderVoiceChannels();
  }

  if (remoteVoice.size === 0) {
    stopSpeakingDetectionLoop();
  }
}

function getOrCreateRemoteVoiceEntry(userId) {
  const existing = remoteVoice.get(userId);
  if (existing) {
    return existing;
  }

  const context = resumePlaybackContext();
  const gainNode = context ? context.createGain() : null;

  if (gainNode && context) {
    gainNode.gain.value = getUserVolume(userId);
    gainNode.connect(context.destination);
  }

  const entry = {
    gainNode,
    tracks: new Map(),
  };

  remoteVoice.set(userId, entry);
  ensureSpeakingDetectionLoop();
  return entry;
}

function ensurePlaybackContext() {
  const ContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!ContextCtor) {
    return null;
  }

  if (!playbackContext) {
    playbackContext = new ContextCtor();
  }

  return playbackContext;
}

function resumePlaybackContext() {
  const context = ensurePlaybackContext();
  if (!context) {
    return null;
  }

  if (context.state === "suspended") {
    context.resume().catch(() => {
      // no-op
    });
  }

  return context;
}

const VoiceRoomSfx = (() => {
  const lastCuePlayedAt = {
    connect: 0,
    disconnect: 0,
  };

  async function getReadyPlaybackContext() {
    const context = resumePlaybackContext();
    if (!context) {
      return null;
    }

    if (context.state === "running") {
      return context;
    }

    try {
      await context.resume();
    } catch {
      return null;
    }

    return context.state === "running" ? context : null;
  }

  function canPlayCue(type) {
    const now = Date.now();
    const lastPlayedAt = Number(lastCuePlayedAt[type] || 0);
    // Guard against rapid bursts when room-state events arrive in quick succession.
    if (now - lastPlayedAt < VOICE_ROOM_CUE_MIN_INTERVAL_MS) {
      return false;
    }
    lastCuePlayedAt[type] = now;
    return true;
  }

  async function playToneSequence(sequence, options = {}) {
    if (!Array.isArray(sequence) || sequence.length === 0) {
      return;
    }

    try {
      const context = await getReadyPlaybackContext();
      if (!context) {
        return;
      }

      const startedAt = context.currentTime + 0.005;
      const attackSeconds = clamp(
        Number(options.attackSeconds ?? VOICE_ROOM_CUE_ATTACK_SECONDS),
        0.001,
        0.08
      );
      const releaseSeconds = clamp(
        Number(options.releaseSeconds ?? VOICE_ROOM_CUE_RELEASE_SECONDS),
        0.005,
        0.18
      );
      const outputGainValue = clamp(
        Number(options.outputGain ?? VOICE_ROOM_CUE_OUTPUT_GAIN),
        0,
        1
      );
      const defaultWaveType = String(options.waveType || "triangle");

      const outputGain = context.createGain();
      outputGain.gain.setValueAtTime(outputGainValue, startedAt);
      outputGain.connect(context.destination);

      let activeOscillators = 0;

      for (const tone of sequence) {
        const frequency = Number(tone?.frequency);
        if (!Number.isFinite(frequency) || frequency <= 0) {
          continue;
        }

        const durationSeconds = Math.max(
          0.03,
          Number(tone?.durationSeconds ?? tone?.duration ?? 0.12)
        );
        const offsetSeconds = Math.max(0, Number(tone?.offsetSeconds ?? tone?.offset ?? 0));
        const toneGainValue = clamp(Number(tone?.gain ?? 1), 0, 1);
        const toneStart = startedAt + offsetSeconds;
        const toneEnd = toneStart + durationSeconds;
        const attack = Math.min(durationSeconds * 0.45, attackSeconds);
        const release = Math.min(durationSeconds * 0.9, releaseSeconds);
        const sustainStart = toneStart + attack;
        const sustainEnd = Math.max(sustainStart, toneEnd - release);

        const oscillator = context.createOscillator();
        oscillator.type = String(tone?.waveType || tone?.type || defaultWaveType);
        oscillator.frequency.setValueAtTime(frequency, toneStart);

        const slideToFrequency = Number(tone?.slideToFrequency);
        if (Number.isFinite(slideToFrequency) && slideToFrequency > 0) {
          oscillator.frequency.linearRampToValueAtTime(slideToFrequency, toneEnd);
        }

        const toneGain = context.createGain();
        toneGain.gain.cancelScheduledValues(toneStart);
        toneGain.gain.setValueAtTime(0.0001, toneStart);
        toneGain.gain.linearRampToValueAtTime(toneGainValue, sustainStart);
        toneGain.gain.setValueAtTime(toneGainValue, sustainEnd);
        toneGain.gain.linearRampToValueAtTime(0.0001, toneEnd);

        oscillator.connect(toneGain);
        toneGain.connect(outputGain);

        activeOscillators += 1;
        oscillator.onended = () => {
          oscillator.disconnect();
          toneGain.disconnect();
          activeOscillators -= 1;
          if (activeOscillators <= 0) {
            outputGain.disconnect();
          }
        };

        oscillator.start(toneStart);
        oscillator.stop(toneEnd + 0.01);
      }

      if (activeOscillators <= 0) {
        outputGain.disconnect();
      }
    } catch {
      // Quietly skip cues when playback cannot be scheduled.
    }
  }

  function playConnectCue() {
    if (!canPlayCue("connect")) {
      return;
    }

    void playToneSequence(
      [
        { frequency: 410, slideToFrequency: 520, duration: 0.09, offset: 0, gain: 0.78 },
        { frequency: 620, slideToFrequency: 730, duration: 0.1, offset: 0.06, gain: 0.88 },
        { frequency: 860, duration: 0.13, offset: 0.14, gain: 0.95, waveType: "sine" },
      ],
      {
        outputGain: 0.11,
        waveType: "triangle",
      }
    );
  }

  function playDisconnectCue() {
    if (!canPlayCue("disconnect")) {
      return;
    }

    void playToneSequence(
      [
        { frequency: 760, slideToFrequency: 680, duration: 0.1, offset: 0, gain: 0.92 },
        { frequency: 560, slideToFrequency: 470, duration: 0.1, offset: 0.07, gain: 0.8 },
        { frequency: 390, duration: 0.14, offset: 0.14, gain: 0.68, waveType: "sine" },
      ],
      {
        outputGain: 0.1,
        waveType: "triangle",
      }
    );
  }

  return {
    playConnectCue,
    playDisconnectCue,
    playToneSequence,
  };
})();

function applyUserVolume(userId) {
  const entry = remoteVoice.get(userId);
  if (!entry) {
    return;
  }

  const targetVolume = getUserVolume(userId);
  const targetScreenAudioVolume = getScreenAudioVolume(userId);
  const screenMuted = isScreenAudioMuted(userId);

  if (entry.gainNode && entry.tracks.size > 0) {
    entry.gainNode.gain.value = targetVolume;

    for (const item of entry.tracks.values()) {
      if (item.trackGainNode) {
        if (item.isFadingOut) {
          continue;
        }

        const nextGate = item.isScreenAudio
          ? (screenMuted ? 0 : targetScreenAudioVolume)
          : 1;
        if (item.justAttached) {
          const now = entry.gainNode.context.currentTime;
          item.trackGainNode.gain.cancelScheduledValues(now);
          item.trackGainNode.gain.setValueAtTime(0, now);
          item.trackGainNode.gain.linearRampToValueAtTime(nextGate, now + VOICE_FADE_IN_SECONDS);
          item.justAttached = false;
        } else {
          item.trackGainNode.gain.value = nextGate;
        }
      }
    }
    return;
  }

  for (const item of entry.tracks.values()) {
    const gate = item.isScreenAudio
      ? (screenMuted ? 0 : targetScreenAudioVolume)
      : 1;
    item.audio.volume = clamp(targetVolume * gate, 0, 1);
  }
}

function setUserVolume(userId, value) {
  const volume = clamp(value, 0, VOLUME_GAIN_MAX);
  userVolumes.set(userId, volume);
  applyUserVolume(userId);
}

function setRemoteVoiceTrackScreenAudio(userId, sourceTrackId, isScreenAudio) {
  const entry = remoteVoice.get(userId);
  if (!entry) {
    return;
  }

  let changed = false;
  for (const item of entry.tracks.values()) {
    if (item.sourceTrackId !== sourceTrackId) {
      continue;
    }

    if (item.isScreenAudio !== isScreenAudio) {
      item.isScreenAudio = isScreenAudio;
      changed = true;
    }
  }

  if (changed) {
    applyUserVolume(userId);
    renderScreens();
  }
}

function sourceTrackKey(sourcePeerId, mediaType, sourceTrackId) {
  return `${sourcePeerId}|${mediaType}|${sourceTrackId}`;
}

function matchesMediaTypeKind(mediaType, trackKind) {
  if (mediaType === "screen") {
    return trackKind === "video";
  }
  return trackKind === "audio";
}

function clearForwardTrackMaps() {
  trackMetaById.clear();
  pendingTracksById.clear();
  unresolvedMetaBySourceTrackId.clear();
  resolvedActualTrackIdBySourceKey.clear();
}

function bindForwardedPendingTrack(track, meta) {
  pendingTracksById.delete(track.id);
  unresolvedMetaBySourceTrackId.delete(meta.sourceTrackId);
  trackMetaById.set(track.id, meta);
  resolvedActualTrackIdBySourceKey.set(
    sourceTrackKey(meta.sourcePeerId, meta.mediaType, meta.sourceTrackId),
    track.id
  );
  attachForwardedTrack(meta, track);
}

function clearTrackMappingsForSource(sourcePeerId) {
  for (const [trackId, meta] of Array.from(trackMetaById.entries())) {
    if (meta.sourcePeerId === sourcePeerId) {
      trackMetaById.delete(trackId);
      pendingTracksById.delete(trackId);
    }
  }

  for (const [sourceTrackId, meta] of Array.from(unresolvedMetaBySourceTrackId.entries())) {
    if (meta.sourcePeerId === sourcePeerId) {
      unresolvedMetaBySourceTrackId.delete(sourceTrackId);
    }
  }

  for (const [key, actualTrackId] of Array.from(resolvedActualTrackIdBySourceKey.entries())) {
    if (key.startsWith(`${sourcePeerId}|`)) {
      resolvedActualTrackIdBySourceKey.delete(key);
      pendingTracksById.delete(actualTrackId);
      trackMetaById.delete(actualTrackId);
    }
  }
}

function renderParticipants() {
  participantsList.innerHTML = "";

  if (!roomState) {
    return;
  }

  const members = Array.isArray(roomState.members) ? [...roomState.members] : [];
  const activeVoiceChannelId = getCurrentVoiceChannelId(roomState);
  const voiceChannelByMemberId = new Map();
  const voiceChannelIdByMemberId = new Map();

  for (const channel of getVoiceChannelsFromRoom(roomState)) {
    const channelId = String(channel.id || "").trim();
    const channelName = getVoiceRoomName(channel);
    for (const member of getVoiceRoomMembers(channel)) {
      if (!member?.id) {
        continue;
      }

      voiceChannelByMemberId.set(member.id, channelName);
      voiceChannelIdByMemberId.set(member.id, channelId);
    }
  }

  members.sort((left, right) => {
    const leftSelf = left.id === selfId;
    const rightSelf = right.id === selfId;
    if (leftSelf !== rightSelf) {
      return leftSelf ? -1 : 1;
    }

    return String(left.name || "").localeCompare(String(right.name || ""), undefined, {
      sensitivity: "base",
    });
  });

  for (const member of members) {
    const li = document.createElement("li");

    const top = document.createElement("div");
    top.className = "participant-top";

    const nameWrap = document.createElement("span");
    nameWrap.className = "participant-name";

    const speakingDot = document.createElement("span");
    speakingDot.className = "participant-speaking-dot";
    if (isUserSpeaking(member.id)) {
      speakingDot.classList.add("is-active");
    }
    speakingDot.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "participant-name-text";
    name.textContent = member.id === selfId ? t("youSuffix", { name: member.name }) : member.name;
    nameWrap.appendChild(speakingDot);
    nameWrap.appendChild(name);

    const tools = document.createElement("div");
    tools.className = "participant-tools";

    if (member.id === roomState.hostId) {
      const hostTag = document.createElement("span");
      hostTag.className = "tag";
      hostTag.textContent = t("hostTag");
      tools.appendChild(hostTag);
    }

    if (remoteScreens.has(member.id) || (member.id === selfId && localScreenTrack)) {
      const screenTag = document.createElement("span");
      screenTag.className = "tag tag-screen";
      screenTag.textContent = t("screenTag");
      tools.appendChild(screenTag);
    }

    top.appendChild(nameWrap);
    top.appendChild(tools);
    li.appendChild(top);

    const voiceChannelName = voiceChannelByMemberId.get(member.id) || "";
    const voiceChannelId = voiceChannelIdByMemberId.get(member.id) || null;

    const state = document.createElement("span");
    state.className = voiceChannelName ? "participant-state participant-state-voice" : "participant-state";
    state.textContent = voiceChannelName
      ? t("inVoiceChannelWithName", { name: voiceChannelName })
      : t("notInVoiceChannel");
    li.appendChild(state);

    if (
      member.id !== selfId &&
      activeVoiceChannelId &&
      voiceChannelId &&
      voiceChannelId === activeVoiceChannelId
    ) {
      const volumeWrap = document.createElement("div");
      volumeWrap.className = "volume-wrap";

      const label = document.createElement("span");
      label.textContent = t("volume");

      const input = document.createElement("input");
      input.type = "range";
      input.min = String(VOLUME_SLIDER_MIN);
      input.max = String(VOLUME_SLIDER_MAX);
      input.step = "1";
      input.value = String(Math.round(volumeGainToSliderPercent(getUserVolume(member.id))));

      const value = document.createElement("span");
      value.textContent = formatVolumePercentLabel(input.value);

      input.addEventListener("input", () => {
        value.textContent = formatVolumePercentLabel(input.value);
        setUserVolume(member.id, sliderPercentToVolumeGain(input.value));
      });

      volumeWrap.appendChild(label);
      volumeWrap.appendChild(input);
      volumeWrap.appendChild(value);
      li.appendChild(volumeWrap);
    }

    participantsList.appendChild(li);
  }
}

function attachVoiceTrack(userId, track, options = {}) {
  if (userId === selfId) {
    return;
  }

  const entry = getOrCreateRemoteVoiceEntry(userId);
  const sourceTrackId = String(options.sourceTrackId || track.id);
  const isScreenAudio = Boolean(options.isScreenAudio);

  const existingTrack = entry.tracks.get(track.id);
  if (existingTrack) {
    if (existingTrack.isScreenAudio !== isScreenAudio) {
      existingTrack.isScreenAudio = isScreenAudio;
      applyUserVolume(userId);
      renderScreens();
    }
    return;
  }

  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.playsInline = true;
  audio.muted = true;

  const stream = new MediaStream([track]);
  audio.srcObject = stream;

  remoteAudios.appendChild(audio);
  void applyPreferredSpeakerToAudioElement(audio);
  const context = resumePlaybackContext();

  let sourceNode = null;
  let trackGainNode = null;

  if (context && entry.gainNode) {
    sourceNode = context.createMediaStreamSource(stream);
    trackGainNode = context.createGain();
    const analyserNode = context.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.2;
    const analysisBuffer = new Uint8Array(analyserNode.frequencyBinCount);
    trackGainNode.gain.value = 0;
    sourceNode.connect(trackGainNode);
    sourceNode.connect(analyserNode);
    trackGainNode.connect(entry.gainNode);
    entry.tracks.set(track.id, {
      track,
      audio,
      sourceNode,
      trackGainNode,
      analyserNode,
      analysisBuffer,
      sourceTrackId,
      isScreenAudio,
      justAttached: true,
      isFadingOut: false,
      disconnectTimer: null,
    });
  } else {
    audio.muted = false;
    entry.tracks.set(track.id, {
      track,
      audio,
      sourceNode,
      trackGainNode,
      analyserNode: null,
      analysisBuffer: null,
      sourceTrackId,
      isScreenAudio,
      justAttached: false,
      isFadingOut: false,
      disconnectTimer: null,
    });
  }

  applyUserVolume(userId);
  if (isScreenAudio) {
    renderScreens();
  }

  audio.play().catch(() => {
    // Browser may delay playback until user gesture.
  });

  track.onended = () => {
    const userEntry = remoteVoice.get(userId);
    if (userEntry && userEntry.tracks.has(track.id)) {
      removeVoiceTrack(userId, track.id);
    }
  };

  renderParticipants();
}

function removeVoiceTrack(userId, trackId = null) {
  const entry = remoteVoice.get(userId);
  if (!entry) {
    return;
  }

  const items = trackId
    ? (entry.tracks.has(trackId) ? [[trackId, entry.tracks.get(trackId)]] : [])
    : Array.from(entry.tracks.entries());
  let affectsScreenAudio = false;

  const finalizeTrackRemoval = (id, item) => {
    if (!entry.tracks.has(id)) {
      return;
    }

    if (item.disconnectTimer) {
      clearTimeout(item.disconnectTimer);
      item.disconnectTimer = null;
    }

    if (item.sourceNode) {
      try {
        item.sourceNode.disconnect();
      } catch {
        // no-op
      }
    }

    if (item.analyserNode) {
      try {
        item.analyserNode.disconnect();
      } catch {
        // no-op
      }
    }

    if (item.trackGainNode) {
      try {
        item.trackGainNode.disconnect();
      } catch {
        // no-op
      }
    }

    item.audio.srcObject = null;
    item.audio.remove();
    entry.tracks.delete(id);
    if (item.isScreenAudio) {
      affectsScreenAudio = true;
    }
  };

  for (const [id, item] of items) {
    if (item.disconnectTimer) {
      continue;
    }

    if (item.trackGainNode && entry.gainNode && !item.isFadingOut) {
      item.isFadingOut = true;
      item.justAttached = false;

      const now = entry.gainNode.context.currentTime;
      const currentGain = clamp(item.trackGainNode.gain.value, 0, 1);
      item.trackGainNode.gain.cancelScheduledValues(now);
      item.trackGainNode.gain.setValueAtTime(currentGain, now);
      item.trackGainNode.gain.linearRampToValueAtTime(0, now + VOICE_FADE_OUT_SECONDS);

      item.disconnectTimer = setTimeout(() => {
        finalizeTrackRemoval(id, item);

        if (entry.tracks.size === 0) {
          if (entry.gainNode) {
            try {
              entry.gainNode.disconnect();
            } catch {
              // no-op
            }
          }

          remoteVoice.delete(userId);
          cleanupSpeakingDetectionForUser(userId);
        }

        renderParticipants();
        if (affectsScreenAudio) {
          renderScreens();
        }
      }, VOICE_FADE_OUT_MS);
      continue;
    }

    finalizeTrackRemoval(id, item);
  }

  if (entry.tracks.size === 0) {
    if (entry.gainNode) {
      try {
        entry.gainNode.disconnect();
      } catch {
        // no-op
      }
    }

    remoteVoice.delete(userId);
    cleanupSpeakingDetectionForUser(userId);
  }

  renderParticipants();
  if (affectsScreenAudio) {
    renderScreens();
  }
}

function getOrderedScreenItems() {
  const items = [];

  if (localScreenPreview && selfId) {
    items.push({
      userId: selfId,
      track: localScreenPreview.track,
      isLocal: true,
      title: t("youAreSharing"),
    });
  }

  for (const [userId, entry] of remoteScreens.entries()) {
    items.push({
      userId,
      track: entry.track,
      isLocal: false,
      title: t("userIsSharing", { name: getDisplayName(userId) }),
    });
  }

  items.sort((left, right) => {
    const leftPinned = left.userId === pinnedScreenUserId;
    const rightPinned = right.userId === pinnedScreenUserId;

    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }

    const leftStartedAt = screenStartedAtByUserId.get(left.userId) || 0;
    const rightStartedAt = screenStartedAtByUserId.get(right.userId) || 0;
    if (leftStartedAt !== rightStartedAt) {
      return leftStartedAt - rightStartedAt;
    }

    return left.title.localeCompare(right.title);
  });

  return items;
}

function getScreenQualityLabel(profileId = "auto") {
  if (profileId === "high") {
    return t("screenQualityHigh");
  }
  if (profileId === "mid") {
    return t("screenQualityMid");
  }
  if (profileId === "low") {
    return t("screenQualityLow");
  }
  if (profileId === "safe") {
    return t("screenQualitySafe");
  }
  return t("screenQualityAuto");
}

function getScreenStageQualityProfile(item) {
  if (!item) {
    return "auto";
  }
  if (item.isLocal) {
    return localScreenQualityProfileId || "auto";
  }
  return "auto";
}

function selectActiveScreenItem(items) {
  if (!Array.isArray(items) || items.length === 0) {
    activeScreenUserId = null;
    activeScreenSourceTrackId = null;
    activeScreenStageItem = null;
    return null;
  }

  const nonLocalItems = items.filter((item) => !item.isLocal);

  if (pinnedScreenUserId) {
    const pinned = items.find((item) => item.userId === pinnedScreenUserId) || null;
    if (pinned) {
      activeScreenUserId = pinned.userId;
      activeScreenSourceTrackId = pinned.track?.id || null;
      activeScreenStageItem = pinned;
      return pinned;
    }
    pinnedScreenUserId = null;
  }

  if (activeScreenUserId) {
    const current = items.find((item) => item.userId === activeScreenUserId) || null;
    if (current) {
      if (current.isLocal && localScreenLikelySelfCapture && nonLocalItems.length > 0) {
        const saferRemote = nonLocalItems[0];
        activeScreenUserId = saferRemote.userId;
        activeScreenSourceTrackId = saferRemote.track?.id || null;
        activeScreenStageItem = saferRemote;
        return saferRemote;
      }
      activeScreenSourceTrackId = current.track?.id || null;
      activeScreenStageItem = current;
      return current;
    }
  }

  if (localScreenLikelySelfCapture && nonLocalItems.length > 0) {
    const saferRemote = nonLocalItems[0];
    activeScreenUserId = saferRemote.userId;
    activeScreenSourceTrackId = saferRemote.track?.id || null;
    activeScreenStageItem = saferRemote;
    return saferRemote;
  }

  const fallback = items[0];
  activeScreenUserId = fallback.userId;
  activeScreenSourceTrackId = fallback.track?.id || null;
  activeScreenStageItem = fallback;
  return fallback;
}

function bindScreenStageTrack(track) {
  if (!screenStageVideoEl) {
    return;
  }

  const currentTrack = screenStageVideoEl.srcObject?.getVideoTracks?.()[0] || null;
  const nextTrackId = track?.id || null;
  if (currentTrack && nextTrackId && currentTrack.id === nextTrackId) {
    return;
  }

  if (!track) {
    screenStageVideoEl.srcObject = null;
    return;
  }

  screenStageVideoEl.srcObject = new MediaStream([track]);
  screenStageVideoEl.play().catch(() => {
    // Playback can be delayed by browser gesture policies.
  });
}

function renderScreenFilmstrip(items, activeItem) {
  if (!screenFilmstripEl) {
    return;
  }

  screenFilmstripEl.innerHTML = "";

  for (const item of items) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "screen-film-card";
    card.setAttribute("role", "listitem");
    card.setAttribute("aria-label", item.title);
    if (activeItem && activeItem.userId === item.userId) {
      card.classList.add("is-active");
    }
    if (pinnedScreenUserId && pinnedScreenUserId === item.userId) {
      card.classList.add("is-pinned");
    }

    card.addEventListener("click", () => {
      activeScreenUserId = item.userId;
      activeScreenSourceTrackId = item.track?.id || null;
      activeScreenStageItem = item;
      renderScreens();
    });

    const preview = document.createElement("video");
    preview.autoplay = true;
    preview.playsInline = true;
    preview.muted = true;
    preview.srcObject = new MediaStream([item.track]);
    preview.play().catch(() => {
      // no-op
    });

    const label = document.createElement("div");
    label.className = "screen-film-label";
    label.textContent = item.title;

    const badgeRow = document.createElement("div");
    badgeRow.className = "screen-film-badges";

    const liveBadge = document.createElement("span");
    liveBadge.className = "screen-film-badge live";
    liveBadge.textContent = t("liveBadge");
    badgeRow.appendChild(liveBadge);

    if (item.userId === pinnedScreenUserId) {
      const pinBadge = document.createElement("span");
      pinBadge.className = "screen-film-badge pin";
      pinBadge.textContent = t("pin");
      badgeRow.appendChild(pinBadge);
    }

    card.appendChild(preview);
    card.appendChild(label);
    card.appendChild(badgeRow);
    screenFilmstripEl.appendChild(card);
  }
}

function renderScreenStage(activeItem, totalStreams) {
  const isLocalSoloPreview = Boolean(activeItem && activeItem.isLocal && totalStreams === 1);
  if (screenHubEl) {
    screenHubEl.classList.toggle("is-empty", !activeItem);
    screenHubEl.classList.toggle("is-local-preview", isLocalSoloPreview);
  }

  if (screenStageLocalHintEl) {
    const shouldShowLocalHint = Boolean(
      activeItem &&
      activeItem.isLocal &&
      (isLocalSoloPreview || localScreenLikelySelfCapture)
    );
    screenStageLocalHintEl.classList.toggle("hidden", !shouldShowLocalHint);
  }

  if (screenHubMetaEl) {
    screenHubMetaEl.textContent =
      totalStreams > 0 ? t("screenHubStreamCount", { count: totalStreams }) : t("screenHubNoStreams");
  }

  if (!activeItem) {
    if (screenStageWrapEl) {
      screenStageWrapEl.classList.remove("is-live");
    }
    if (screenStageEmptyEl) {
      screenStageEmptyEl.classList.remove("hidden");
    }
    if (screenStageOverlayEl) {
      screenStageOverlayEl.classList.add("hidden");
    }
    if (screenStageAudioControlsEl) {
      screenStageAudioControlsEl.classList.add("hidden");
    }
    bindScreenStageTrack(null);
    if (screenStageTitleEl) {
      screenStageTitleEl.textContent = "-";
    }
    if (screenStageQualityBadgeEl) {
      screenStageQualityBadgeEl.textContent = getScreenQualityLabel("auto");
    }
    return;
  }

  bindScreenStageTrack(activeItem.track);

  if (screenStageWrapEl) {
    screenStageWrapEl.classList.add("is-live");
  }
  if (screenStageEmptyEl) {
    screenStageEmptyEl.classList.add("hidden");
  }
  if (screenStageOverlayEl) {
    screenStageOverlayEl.classList.remove("hidden");
  }

  if (screenStageTitleEl) {
    screenStageTitleEl.textContent = activeItem.title;
  }

  const qualityProfile = getScreenStageQualityProfile(activeItem);
  if (screenStageQualityBadgeEl) {
    screenStageQualityBadgeEl.textContent = getScreenQualityLabel(qualityProfile);
  }

  if (screenStagePinBtn) {
    const pinned = activeItem.userId === pinnedScreenUserId;
    screenStagePinBtn.textContent = pinned ? t("unpin") : t("pin");
    screenStagePinBtn.setAttribute("aria-label", pinned ? t("unpinScreenStream") : t("pinScreenStream"));
  }

  const canControlAudio = !activeItem.isLocal;
  const hasScreenAudio = canControlAudio && hasScreenAudioTrack(activeItem.userId);
  const isMuted = canControlAudio ? isScreenAudioMuted(activeItem.userId) : true;
  if (screenStageMuteBtn) {
    if (!canControlAudio) {
      screenStageMuteBtn.classList.add("hidden");
    } else {
      screenStageMuteBtn.classList.remove("hidden");
      screenStageMuteBtn.disabled = !hasScreenAudio;
      screenStageMuteBtn.textContent = isMuted ? t("unmuteAudio") : t("muteAudio");
      screenStageMuteBtn.setAttribute(
        "aria-label",
        isMuted ? t("unmuteThisScreenAudio") : t("muteThisScreenAudio")
      );
    }
  }

  if (screenStageAudioControlsEl && screenStageVolumeRangeEl && screenStageVolumeValueEl) {
    if (!canControlAudio) {
      screenStageAudioControlsEl.classList.add("hidden");
    } else {
      screenStageAudioControlsEl.classList.remove("hidden");
      screenStageVolumeRangeEl.disabled = !hasScreenAudio;
      screenStageVolumeRangeEl.value = String(
        Math.round(volumeGainToSliderPercent(getScreenAudioVolume(activeItem.userId)))
      );
      screenStageVolumeValueEl.textContent = hasScreenAudio
        ? formatVolumePercentLabel(screenStageVolumeRangeEl.value)
        : t("noAudio");
    }
  }
}

async function enterScreenFullscreen(element) {
  if (!element) {
    return;
  }

  if (document.fullscreenElement === element) {
    await document.exitFullscreen().catch(() => {
      // no-op
    });
    return;
  }

  if (typeof element.requestFullscreen === "function") {
    await element.requestFullscreen().catch(() => {
      // no-op
    });
  }
}

function renderScreens() {
  const items = getOrderedScreenItems();
  if (screenHubEl) {
    screenHubEl.classList.toggle("has-single-stream", items.length === 1);
  }

  if (items.length === 0) {
    if (screenFilmstripEl) {
      screenFilmstripEl.innerHTML = "";
    }
    renderScreenStage(null, 0);
    return;
  }

  const activeItem = selectActiveScreenItem(items);
  renderScreenStage(activeItem, items.length);
  renderScreenFilmstrip(items, activeItem);
}

function attachScreenTrack(userId, track) {
  if (userId === selfId) {
    return;
  }

  if (!remoteScreens.has(userId)) {
    markScreenStarted(userId);
  }
  remoteScreens.set(userId, { track });
  renderScreens();

  track.onended = () => {
    const current = remoteScreens.get(userId)?.track;
    if (current === track) {
      removeScreenTrack(userId);
    }
  };

  renderParticipants();
}

function attachLocalScreenPreview(track) {
  if (!track) {
    return;
  }

  removeLocalScreenPreview();
  if (selfId) {
    markScreenStarted(selfId);
  }
  localScreenPreview = { track };
  renderScreens();
}

function removeLocalScreenPreview() {
  if (!localScreenPreview) {
    return;
  }

  localScreenPreview = null;
  if (selfId) {
    clearScreenDisplayStateForUser(selfId);
  }
  renderScreens();
}

function removeScreenTrack(userId) {
  const entry = remoteScreens.get(userId);
  if (!entry) {
    clearScreenDisplayStateForUser(userId);
    renderScreens();
    return;
  }

  remoteScreens.delete(userId);
  clearScreenDisplayStateForUser(userId);

  const sourceScreenAudioTrackId = screenAudioTrackIdsBySource.get(userId);
  if (sourceScreenAudioTrackId) {
    screenAudioTrackIdsBySource.delete(userId);
    setRemoteVoiceTrackScreenAudio(userId, sourceScreenAudioTrackId, false);
  }

  renderScreens();
  renderParticipants();
}

function clearAllRemoteMedia() {
  for (const userId of Array.from(remoteVoice.keys())) {
    removeVoiceTrack(userId);
  }

  for (const userId of Array.from(remoteScreens.keys())) {
    removeScreenTrack(userId);
  }

  if (remoteVoice.size === 0) {
    clearSpeakingDetectionState();
  }
}

function updateScreenButton() {
  const sharing = Boolean(localScreenTrack);
  screenBtn.classList.toggle("active", sharing);
  setControlButtonIcon(screenBtn, sharing ? "stop_screen_share" : "present_to_all", sharing ? t("stopScreenShare") : t("shareScreen"));
  updateVoiceControlsAvailability();
}

function updateVoiceControlsAvailability() {
  const inVoice = joined && isInVoiceChannel(roomState);

  if (muteBtn) {
    muteBtn.disabled = !inVoice;
  }

  if (micSensitivityToggleBtn) {
    micSensitivityToggleBtn.disabled = !inVoice;
  }

  if (screenBtn) {
    screenBtn.disabled = !inVoice;
  }

  if (leaveVoiceBtn) {
    leaveVoiceBtn.disabled = !inVoice;
  }

  if (relayRoomKeyBtn) {
    relayRoomKeyBtn.disabled = !joined || !isRelayModeActive() || !normalizeRoomIdValue(roomState?.id);
  }

  if (!inVoice) {
    setMicSensitivityPopoverOpen(false);
  }
}

async function ensureLocalStream() {
  if (localStream) {
    if (localMicTrack && !localOutboundMicTrack) {
      setupMicProcessing();
    }
    syncLocalMicMuteState();
    void refreshProfileDeviceSelectors();
    return localStream;
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    const error = new Error("MediaDevices API unavailable");
    error.name = "MediaDevicesUnavailable";
    throw error;
  }

  if (!isTrustedOriginForMic()) {
    const error = new Error("Insecure origin");
    error.name = "InsecureContextError";
    throw error;
  }

  const capturedStream = await captureMicrophoneStream();
  const capturedMicTrack = capturedStream.getAudioTracks()[0] || null;

  if (!capturedMicTrack) {
    const error = new Error("No microphone track");
    error.name = "NotFoundError";
    throw error;
  }

  localStream = capturedStream;
  await applyNewLocalMicTrack(capturedMicTrack, capturedStream);
  void refreshProfileDeviceSelectors();
  return localStream;
}

function mediaKey(sourcePeerId, mediaType, trackId = "") {
  return `${sourcePeerId}|${mediaType}|${trackId}`;
}

function getOrCreateSourceMedia(sourcePeerId) {
  const existing = sourceMedia.get(sourcePeerId);
  if (existing) {
    return existing;
  }

  const next = {
    voiceTracks: new Map(),
    screenTrack: null,
  };

  sourceMedia.set(sourcePeerId, next);
  return next;
}

function cleanupSourceMedia(sourcePeerId) {
  const media = sourceMedia.get(sourcePeerId);
  if (!media) {
    return;
  }

  if (media.voiceTracks.size === 0 && !media.screenTrack) {
    sourceMedia.delete(sourcePeerId);
  }
}

function setSourceScreenAudioTrackId(sourcePeerId, trackId = null) {
  const normalizedTrackId = trackId ? String(trackId) : null;

  if (normalizedTrackId) {
    screenAudioTrackIdsBySource.set(sourcePeerId, normalizedTrackId);
  } else {
    screenAudioTrackIdsBySource.delete(sourcePeerId);
  }

  const media = sourceMedia.get(sourcePeerId);
  if (media) {
    for (const [voiceTrackId, voiceEntry] of media.voiceTracks.entries()) {
      voiceEntry.isScreenAudio = normalizedTrackId ? voiceTrackId === normalizedTrackId : false;
    }
  }

  const voiceEntry = remoteVoice.get(sourcePeerId);
  if (voiceEntry) {
    for (const item of voiceEntry.tracks.values()) {
      item.isScreenAudio = normalizedTrackId ? item.sourceTrackId === normalizedTrackId : false;
    }
    applyUserVolume(sourcePeerId);
  }

  if (isHost) {
    syncForwardingToAll();
  }
}

function addSourceVoiceTrack(sourcePeerId, track, options = {}) {
  if (!track) {
    return;
  }

  const knownScreenAudioTrackId = screenAudioTrackIdsBySource.get(sourcePeerId);
  const isScreenAudio =
    typeof options.isScreenAudio === "boolean"
      ? options.isScreenAudio
      : Boolean(knownScreenAudioTrackId && knownScreenAudioTrackId === track.id);

  const media = getOrCreateSourceMedia(sourcePeerId);
  if (media.voiceTracks.has(track.id)) {
    const existing = media.voiceTracks.get(track.id);
    if (existing.isScreenAudio !== isScreenAudio) {
      existing.isScreenAudio = isScreenAudio;
      if (sourcePeerId !== selfId) {
        setRemoteVoiceTrackScreenAudio(sourcePeerId, track.id, isScreenAudio);
      }

      if (isHost) {
        syncForwardingToAll();
      }
    }
    return;
  }

  media.voiceTracks.set(track.id, {
    track,
    isScreenAudio,
  });

  if (sourcePeerId !== selfId) {
    attachVoiceTrack(sourcePeerId, track, {
      sourceTrackId: track.id,
      isScreenAudio,
    });
  }

  if (isHost) {
    syncForwardingToAll();
  }
}

function removeSourceVoiceTrack(sourcePeerId, trackId = null) {
  const media = sourceMedia.get(sourcePeerId);
  if (!media) {
    return;
  }

  if (trackId) {
    if (!media.voiceTracks.has(trackId)) {
      return;
    }

    if (screenAudioTrackIdsBySource.get(sourcePeerId) === trackId) {
      screenAudioTrackIdsBySource.delete(sourcePeerId);
    }

    media.voiceTracks.delete(trackId);

    if (sourcePeerId !== selfId) {
      removeVoiceTrack(sourcePeerId, trackId);
    }
  } else {
    const ids = Array.from(media.voiceTracks.keys());
    screenAudioTrackIdsBySource.delete(sourcePeerId);
    media.voiceTracks.clear();

    if (sourcePeerId !== selfId) {
      for (const id of ids) {
        removeVoiceTrack(sourcePeerId, id);
      }
    }
  }

  cleanupSourceMedia(sourcePeerId);

  if (isHost) {
    syncForwardingToAll();
  }
}

function setSourceScreenTrack(sourcePeerId, track) {
  if (track && sourcePeerId === selfId) {
    applyScreenTrackHints(track);
  }
  const media = getOrCreateSourceMedia(sourcePeerId);
  media.screenTrack = track || null;

  if (!track) {
    setSourceScreenAudioTrackId(sourcePeerId, null);
  }

  cleanupSourceMedia(sourcePeerId);

  if (sourcePeerId !== selfId) {
    if (track) {
      attachScreenTrack(sourcePeerId, track);
    } else {
      removeScreenTrack(sourcePeerId);
    }
  }

  if (isHost) {
    syncForwardingToAll();
  }
}

function removeSourcePeer(sourcePeerId) {
  sourceMedia.delete(sourcePeerId);
  screenAudioTrackIdsBySource.delete(sourcePeerId);
  removeVoiceTrack(sourcePeerId);
  removeScreenTrack(sourcePeerId);
  if (isHost) {
    syncForwardingToAll();
  }
}

function syncForwardingToAll() {
  if (!isHost) {
    return;
  }

  for (const peerId of peers.keys()) {
    syncForwardingForPeer(peerId);
  }
}

function syncForwardingForPeer(targetPeerId) {
  if (!isHost) {
    return;
  }

  const entry = peers.get(targetPeerId);
  if (!entry) {
    return;
  }

  let changed = false;

  const desired = new Map();
  for (const [sourcePeerId, media] of sourceMedia.entries()) {
    if (sourcePeerId === targetPeerId) {
      continue;
    }

    for (const voiceEntry of media.voiceTracks.values()) {
      const voiceTrack = voiceEntry.track;

      desired.set(mediaKey(sourcePeerId, "voice", voiceTrack.id), {
        sourcePeerId,
        mediaType: "voice",
        sourceTrackId: voiceTrack.id,
        track: voiceTrack,
        voiceType: voiceEntry.isScreenAudio ? "screen" : "mic",
      });
    }

    if (media.screenTrack) {
      desired.set(mediaKey(sourcePeerId, "screen", media.screenTrack.id), {
        sourcePeerId,
        mediaType: "screen",
        sourceTrackId: media.screenTrack.id,
        track: media.screenTrack,
      });
    }
  }

  for (const [key, info] of desired.entries()) {
    const current = entry.forwardedSenders.get(key);
    let activeSender = current?.sender || null;

    if (!current) {
      const transceiver = entry.pc.addTransceiver(info.track, {
        direction: "sendonly",
      });
      const sender = transceiver.sender;
       activeSender = sender;
      if (info.track.kind === "audio") {
        applyPreferredAudioCodecsToTransceiver(transceiver, true);
        void optimizeAudioSender(sender, {
          profile: info.voiceType === "screen" ? "screen" : "mic",
        });
      }
      entry.forwardedSenders.set(key, {
        sender,
        sourcePeerId: info.sourcePeerId,
        mediaType: info.mediaType,
        sourceTrackId: info.sourceTrackId,
      });
      changed = true;
    } else if (current.sender.track !== info.track) {
      current.sender.replaceTrack(info.track).catch(() => {
        // no-op
      });
      activeSender = current.sender;
    }

    const abrKey = `host-forward:${targetPeerId}:${key}`;
    if (info.mediaType === "screen" && info.track.kind === "video" && activeSender) {
      registerScreenSenderAbr(abrKey, activeSender, {
        sourcePeerId: info.sourcePeerId,
        targetPeerId,
        isLocalPublisher: info.sourcePeerId === selfId,
      });
    } else {
      unregisterScreenSenderAbr(abrKey);
    }

    socket.emit("signal", {
      to: targetPeerId,
      payload: {
        type: "forward-track-meta",
        trackId: info.sourceTrackId,
        sourcePeerId: info.sourcePeerId,
        mediaType: info.mediaType,
        voiceType: info.mediaType === "voice" ? info.voiceType : undefined,
      },
    });
  }

  for (const [key, current] of Array.from(entry.forwardedSenders.entries())) {
    if (desired.has(key)) {
      continue;
    }

    try {
      entry.pc.removeTrack(current.sender);
    } catch {
      // no-op
    }

    entry.forwardedSenders.delete(key);
    unregisterScreenSenderAbr(`host-forward:${targetPeerId}:${key}`);
    changed = true;

    socket.emit("signal", {
      to: targetPeerId,
      payload: {
        type: "remove-forwarded-track",
        trackId: current.sourceTrackId,
        sourcePeerId: current.sourcePeerId,
        mediaType: current.mediaType,
      },
    });
  }

  if (changed) {
    requestOffer(targetPeerId);
  }
}

function clearPeerReconnectTimer(peerId) {
  const timerId = peerReconnectTimerByPeerId.get(peerId);
  if (timerId) {
    clearTimeout(timerId);
    peerReconnectTimerByPeerId.delete(peerId);
  }
}

function clearPeerReconnectStatusTimer(peerId) {
  const timerId = peerReconnectStatusTimerByPeerId.get(peerId);
  if (timerId) {
    clearTimeout(timerId);
    peerReconnectStatusTimerByPeerId.delete(peerId);
  }
}

function clearPeerReconnectState(peerId) {
  if (!peerId) {
    return;
  }

  clearPeerReconnectTimer(peerId);
  clearPeerReconnectStatusTimer(peerId);
  peerReconnectAttemptByPeerId.delete(peerId);
  peerReconnectStatusShownPeerIds.delete(peerId);
}

