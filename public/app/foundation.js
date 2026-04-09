const socket = io();

const joinForm = document.getElementById("join-form");
const serversRailEl = document.getElementById("servers-rail");
const appTitleEl = document.getElementById("app-title");
const windowChromeEl = document.getElementById("window-chrome");
const windowChromeBadgeEl = document.getElementById("window-chrome-badge");
const windowChromeTitleEl = document.getElementById("window-chrome-title");
const windowChromeSubtitleEl = document.getElementById("window-chrome-subtitle");
const windowChromeMetaEl = document.getElementById("window-chrome-meta");
const windowChromeControlsEl = document.getElementById("window-chrome-controls");
const windowChromeNetworkEl = document.getElementById("window-chrome-network");
const windowChromeSecurityEl = document.getElementById("window-chrome-security");
const windowMinimizeBtn = document.getElementById("window-minimize-btn");
const windowCloseBtn = document.getElementById("window-close-btn");
const appSubtitleEl = document.getElementById("app-subtitle");
const joinHintEl = document.getElementById("join-form-hint");
const joinSelectedBtn = document.getElementById("join-selected-btn");
const nameInput = document.getElementById("name-input");
const roomInput = document.getElementById("room-input");
const participantsList = document.getElementById("participants");
const statusEl = document.getElementById("status");
const statusLabelEl = document.getElementById("status-label");
const controls = document.getElementById("controls");
const muteBtn = document.getElementById("mute-btn");
const micSensitivityToggleBtn = document.getElementById("mic-sensitivity-toggle-btn");
const micSensitivityPopover = document.getElementById("mic-sensitivity-popover");
const micSensitivityChipEl = document.getElementById("mic-sensitivity-chip");
const micSensitivityLabelEl = document.getElementById("mic-sensitivity-label");
const micSensitivityRange = document.getElementById("mic-sensitivity-range");
const micSensitivityValue = document.getElementById("mic-sensitivity-value");
const screenBtn = document.getElementById("screen-btn");
const relayRoomKeyBtn = document.getElementById("relay-room-key-btn");
const leaveVoiceBtn = document.getElementById("leave-voice-btn");
const leaveBtn = document.getElementById("leave-btn");
const remoteAudios = document.getElementById("remote-audios");
const screenHubEl = document.getElementById("screen-hub");
const screenHubTitleEl = document.getElementById("screen-hub-title");
const screenHubMetaEl = document.getElementById("screen-hub-meta");
const screenHubToggleBtn = document.getElementById("screen-hub-toggle-btn");
const screenStageWrapEl = document.getElementById("screen-stage-wrap");
const screenStageVideoEl = document.getElementById("screen-stage-video");
const screenStageEmptyEl = document.getElementById("screen-stage-empty");
const screenStageEmptyTextEl = document.getElementById("screen-stage-empty-text");
const screenStageEmptyTriggerBtn = document.getElementById("screen-stage-empty-trigger-btn");
const screenStageLocalHintEl = document.getElementById("screen-stage-local-hint");
const screenStageOverlayEl = document.getElementById("screen-stage-overlay");
const screenStageLiveBadgeEl = document.getElementById("screen-stage-live-badge");
const screenStageQualityBadgeEl = document.getElementById("screen-stage-quality-badge");
const screenStageTitleEl = document.getElementById("screen-stage-title");
const screenStagePinBtn = document.getElementById("screen-stage-pin-btn");
const screenStageFullscreenBtn = document.getElementById("screen-stage-fullscreen-btn");
const screenStageMuteBtn = document.getElementById("screen-stage-mute-btn");
const screenStageAudioControlsEl = document.getElementById("screen-stage-audio-controls");
const screenStageVolumeLabelEl = document.getElementById("screen-stage-volume-label");
const screenStageVolumeRangeEl = document.getElementById("screen-stage-volume-range");
const screenStageVolumeValueEl = document.getElementById("screen-stage-volume-value");
const screenFilmstripEl = document.getElementById("screen-filmstrip");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatAttachBtn = document.getElementById("chat-attach-btn");
const chatFileInput = document.getElementById("chat-file-input");
const chatAttachmentsPreviewEl = document.getElementById("chat-attachments-preview");
const chatMessagesEl = document.getElementById("chat-messages");
const chatColumnEl = document.querySelector(".chat-column");
const chatRoomTitleEl = document.getElementById("chat-room-title");
const channelRoomLabelEl = document.getElementById("channel-room-label");
const textChannelsTitleEl = document.getElementById("text-channels-title");
const voiceRoomsTitleEl = document.getElementById("voice-rooms-title");
const voiceChannelsListEl = document.getElementById("voice-channels-list");
const addVoiceChannelBtn = document.getElementById("add-voice-channel-btn");
const homeServerBtn = document.getElementById("home-server-btn");
const addRoomBtn = document.getElementById("add-room-btn");
const savedRoomsListEl = document.getElementById("saved-rooms-list");
const topbarMetaEl = document.getElementById("topbar-meta");
const topbarVoiceStateWrapEl = document.querySelector(".topbar-voice-state");
const topbarVoiceStateEl = document.getElementById("topbar-voice-state");
const topbarMembersCountEl = document.getElementById("topbar-members-count");
const topbarNetworkChipEl = document.getElementById("topbar-network-chip");
const topbarNetworkModeEl = document.getElementById("topbar-network-mode");
const topbarCryptoChipEl = document.getElementById("topbar-crypto-chip");
const topbarCryptoStateEl = document.getElementById("topbar-crypto-state");
const topbarProfileBtn = document.getElementById("topbar-profile-btn");
const participantsTitleEl = document.getElementById("participants-title");
const profileToggleBtn = document.getElementById("profile-toggle-btn");
const profilePanel = document.getElementById("profile-panel");
const profileTitleEl = document.getElementById("profile-title");
const profileCloseBtn = document.getElementById("profile-close-btn");
const profileNicknameLabelEl = document.getElementById("profile-nickname-label");
const profileMicLabelEl = document.getElementById("profile-mic-label");
const profileSpeakerLabelEl = document.getElementById("profile-speaker-label");
const profileThemeLabelEl = document.getElementById("profile-theme-label");
const profileLanguageLabelEl = document.getElementById("profile-language-label");
const profileMotionLabelEl = document.getElementById("profile-motion-label");
const profileBackgroundLabelEl = document.getElementById("profile-background-label");
const profileNetworkLabelEl = document.getElementById("profile-network-label");
const profileNetworkNoteEl = document.getElementById("profile-network-note");
const profileMicSelect = document.getElementById("profile-mic-select");
const profileSpeakerSelect = document.getElementById("profile-speaker-select");
const profileThemeSelect = document.getElementById("profile-theme-select");
const profileLanguageSelect = document.getElementById("profile-language-select");
const profileMotionSelect = document.getElementById("profile-motion-select");
const profileBackgroundSelect = document.getElementById("profile-background-select");
const profileNetworkSelect = document.getElementById("profile-network-select");
const profileTabGeneralBtn = document.getElementById("profile-tab-general");
const profileTabNotificationsBtn = document.getElementById("profile-tab-notifications");
const profileGeneralPanel = document.getElementById("profile-general-panel");
const profileNotificationsPanel = document.getElementById("profile-notifications-panel");
const notificationsEnabledLabelEl = document.getElementById("notifications-enabled-label");
const notificationsSavedLabelEl = document.getElementById("notifications-saved-label");
const notificationsMentionsLabelEl = document.getElementById("notifications-mentions-label");
const notificationsSupportNoteEl = document.getElementById("notifications-support-note");
const notificationsEnabledToggle = document.getElementById("notifications-enabled-toggle");
const notificationsSavedToggle = document.getElementById("notifications-saved-toggle");
const notificationsMentionsToggle = document.getElementById("notifications-mentions-toggle");

const DEFAULT_RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  iceTransportPolicy: "all",
};
const PROJECT_NAME = "synto";
const APP_BUILD_ID = "20260404-ui-cleanup1";
const DEFAULT_MIC_AUDIO_PROCESSING_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
};
const AUDIO_CAPTURE_CONSTRAINTS = {
  ...DEFAULT_MIC_AUDIO_PROCESSING_CONSTRAINTS,
  autoGainControl: false,
  channelCount: 1,
  sampleRate: 48000,
  sampleSize: 16,
  latency: 0.02,
};
const AUDIO_CAPTURE_FALLBACK_CONSTRAINTS = {
  ...DEFAULT_MIC_AUDIO_PROCESSING_CONSTRAINTS,
  autoGainControl: false,
};
const MIC_AUDIO_SENDER_MAX_BITRATE = 64000;
const SCREEN_AUDIO_SENDER_MAX_BITRATE = 160000;
const VOLUME_SLIDER_MIN = 0;
const VOLUME_SLIDER_BASE = 100;
const VOLUME_SLIDER_MAX = 200;
const VOLUME_GAIN_MAX = 2;
const VOLUME_CURVE_BELOW_BASE_EXP = 1.6;
const VOLUME_CURVE_ABOVE_BASE_EXP = 1.2;
const PEER_DISCONNECT_GRACE_MS = 8000;
const VOICE_RECONNECT_INITIAL_DELAY_MS = 1000;
const VOICE_RECONNECT_MAX_DELAY_MS = 8000;
const VOICE_RECONNECT_STATUS_DELAY_MS = 2500;
const MIC_CAPTURE_MUTE_GRACE_MS = 320;
const DLOLMUS_COMMAND_PREFIX = "/dlolmus";
const RN_COMMAND_PREFIX = "/rn";
const MAX_CHAT_ATTACHMENTS = 4;
const MAX_CHAT_MESSAGE_LENGTH = 1200;
const MAIN_PAGE_LABEL = "main";
const MIC_SENSITIVITY_STORAGE_KEY = "voice_mic_sensitivity_v1";
const PROFILE_NAME_STORAGE_KEY = "voice_profile_name_v1";
const CHAT_AUTHOR_ID_STORAGE_KEY = "voice_chat_author_id_v1";
const PROFILE_MIC_DEVICE_STORAGE_KEY = "voice_profile_mic_device_v1";
const PROFILE_SPEAKER_DEVICE_STORAGE_KEY = "voice_profile_speaker_device_v1";
const PROFILE_THEME_STORAGE_KEY = "voice_profile_theme_v1";
const PROFILE_LANGUAGE_STORAGE_KEY = "voice_profile_language_v1";
const PROFILE_MOTION_STORAGE_KEY = "voice_profile_motion_v1";
const PROFILE_BACKGROUND_STORAGE_KEY = "voice_profile_background_v1";
const PROFILE_NOTIFICATIONS_ENABLED_STORAGE_KEY = "voice_profile_notifications_enabled_v1";
const PROFILE_NOTIFICATIONS_SAVED_STORAGE_KEY = "voice_profile_notifications_saved_v1";
const PROFILE_NOTIFICATIONS_MENTIONS_STORAGE_KEY = "voice_profile_notifications_mentions_v1";
const SCREEN_HUB_COLLAPSED_STORAGE_KEY = "voice_screen_hub_collapsed_v1";
const CHAT_AUTHOR_ID = loadOrCreateChatAuthorId();
const DEFAULT_THEME_ID = "dark";
const DEFAULT_LANGUAGE_ID = "en";
const DEFAULT_MOTION_PROFILE_ID = "balanced";
const DEFAULT_BACKGROUND_ANIMATION_ID = "aurora";
const DEFAULT_NETWORK_MODE_ID = "server";
const SUPPORTED_LANGUAGE_IDS = ["en", "ru", "sl", "la"];
const MOTION_PROFILES = [
  { id: "off", labelKey: "motionOff" },
  { id: "calm", labelKey: "motionCalm" },
  { id: "balanced", labelKey: "motionBalanced" },
  { id: "expressive", labelKey: "motionExpressive" },
];
const BACKGROUND_ANIMATION_MODES = [
  { id: "off", labelKey: "backgroundOff" },
  { id: "aurora", labelKey: "backgroundAurora" },
  { id: "nebula", labelKey: "backgroundNebula" },
];
const NETWORK_MODES = [
  { id: "server", labelKey: "networkModeServer" },
  { id: "p2p", labelKey: "networkModeP2P" },
  { id: "relay", labelKey: "networkModeRelay" },
];
const NETWORK_MODE_RELAY_ID = "relay";
const NETWORK_MODE_SERVER_ID = "server";
const RELAY_CRYPTO_ALGORITHM = "AES-GCM-256";
const RELAY_CIPHER_VERSION = 1;
const RELAY_KDF_ITERATIONS = 250000;
const RELAY_KDF_HASH = "SHA-256";
const RELAY_ATTACHMENT_TRANSPORT_S3_V2 = "s3-v2";
const RELAY_HISTORY_REPLAY_LIMIT = 500;
const RELAY_HISTORY_REPLAY_MAX_BYTES = 64 * 1024 * 1024;
const RELAY_ATTACHMENT_CHUNK_SIZE = 256 * 1024;
const RELAY_ATTACHMENT_REQUEST_TIMEOUT_MS = 30000;
const RELAY_INLINE_PREVIEW_MAX_BYTES = 32 * 1024 * 1024;
const RELAY_INLINE_PREVIEW_RETRY_COOLDOWN_MS = 30 * 1000;
const RELAY_V2_UPLOAD_CHUNK_SIZE_BYTES = 16 * 1024 * 1024;
const RELAY_V2_MAX_FILE_BYTES = 10 * 1024 * 1024 * 1024;
const RELAY_V2_MAX_TOTAL_MESSAGE_BYTES = 10 * 1024 * 1024 * 1024;
const RELAY_LOCAL_PREVIEW_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const RELAY_LOCAL_PREVIEW_CACHE_MAX_ENTRIES = 300;
const RELAY_IDB_NAME = "qwerbentum_relay_v1";
const RELAY_IDB_VERSION = 2;
const RELAY_STORE_MESSAGES = "cipher_messages";
const RELAY_STORE_ATTACHMENTS = "cipher_attachments";
const RELAY_STORE_KEYS = "room_keys_meta";
const RELAY_STORE_UPLOADS = "upload_sessions";
const RELAY_WRAPPING_KEY_META_ID = "wrapping-key";
const SUPPORTED_SLAVIC_LANGUAGE_PREFIXES = [
  "sl",
  "sr",
  "uk",
  "be",
  "bg",
  "mk",
  "hr",
  "cs",
  "sk",
  "pl",
  "cu",
];
const LANGUAGE_HTML_TAGS = {
  en: "en",
  ru: "ru",
  sl: "cu",
  la: "la",
};
const LANGUAGE_TIME_LOCALES = {
  en: "en-US",
  ru: "ru-RU",
  sl: "sr-RS",
  la: "la",
};
const LANGUAGE_OPTION_LABELS = {
  en: "English",
  ru: "Русский",
  sl: "Славянский",
  la: "Latina",
};
const I18N = window.__SYNTO_I18N__;
if (!I18N || typeof I18N !== "object") {
  throw new Error("Missing i18n dictionary: load app/i18n.js before foundation.js.");
}
const PROFILE_THEMES = [
  { id: "dark", labelKey: "themeMidnight" },
  { id: "graphite", labelKey: "themeGraphite" },
  { id: "abyss", labelKey: "themeAbyss" },
  { id: "ember", labelKey: "themeEmber" },
  { id: "forest", labelKey: "themeForest" },
  { id: "daylight", labelKey: "themeDaylight" },
  { id: "turquoise-black", labelKey: "themeTurquoiseBlack" },
  { id: "green-black", labelKey: "themeGreenBlack" },
  { id: "green-turquoise", labelKey: "themeGreenTurquoise" },
  { id: "purple-raspberry", labelKey: "themePurpleRaspberry" },
  { id: "brown-orange", labelKey: "themeBrownOrange" },
  { id: "black-outline", labelKey: "themeBlackOutline" },
  { id: "scarlet-red", labelKey: "themeScarlet" },
  { id: "crimson-orange", labelKey: "themeCrimsonOrange" },
];
const MIC_SENSITIVITY_MIN = 0.5;
const MIC_SENSITIVITY_MAX = 3;
const MIC_SENSITIVITY_DEFAULT = 1;
const DEFAULT_VOICE_CHANNEL_IDS = ["1", "2", "3"];
const MAX_VOICE_ROOM_NAME_LENGTH = 40;
const VOICE_FADE_IN_SECONDS = 0.06;
const VOICE_FADE_OUT_SECONDS = 0.12;
const VOICE_FADE_OUT_MS = Math.round(VOICE_FADE_OUT_SECONDS * 1000) + 30;
const VOICE_ROOM_CUE_MIN_INTERVAL_MS = 100;
const VOICE_ROOM_CUE_ATTACK_SECONDS = 0.012;
const VOICE_ROOM_CUE_RELEASE_SECONDS = 0.08;
const VOICE_ROOM_CUE_OUTPUT_GAIN = 0.1;
const SPEAKING_DETECTION_INTERVAL_MS = 120;
const SPEAKING_LEVEL_SMOOTHING = 0.34;
const SPEAKING_LEVEL_ON_THRESHOLD = 0.028;
const SPEAKING_LEVEL_OFF_THRESHOLD = 0.016;
const SPEAKING_HOLD_MS = 340;
const CAPTURE_HANDLE_TOKEN = "synto-screen-share-handle";

let rtcConfig = { ...DEFAULT_RTC_CONFIG };

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SCREEN_ABR_INTERVAL_MS = 2000;
const SCREEN_QUALITY_PROFILE_PRESETS = Object.freeze({
  high: { id: "high", maxBitrate: 2500000, maxFramerate: 30, scaleResolutionDownBy: 1 },
  mid: { id: "mid", maxBitrate: 1600000, maxFramerate: 24, scaleResolutionDownBy: 1.25 },
  low: { id: "low", maxBitrate: 900000, maxFramerate: 20, scaleResolutionDownBy: 1.8 },
  safe: { id: "safe", maxBitrate: 450000, maxFramerate: 15, scaleResolutionDownBy: 2.6 },
});
const SCREEN_QUALITY_PROFILE_ORDER = ["high", "mid", "low", "safe"];
const SAVED_ROOMS_STORAGE_KEY = "voice_messenger_saved_rooms_v1";
const MAX_SAVED_ROOMS = 24;
const SETTINGS_TAB_GENERAL_ID = "general";
const SETTINGS_TAB_NOTIFICATIONS_ID = "notifications";
const NOTIFICATION_POLL_INTERVAL_MS = 120000;
const MAX_PROCESSED_NOTIFICATION_IDS = 400;
const JOIN_SOCKET_CONNECT_TIMEOUT_MS = 7000;

let selfId = null;
let roomState = null;
let joined = false;
let isHost = false;

let localStream = null;
let localMicTrack = null;
let localOutboundMicTrack = null;
let localScreenTrack = null;
let localScreenAudioTrack = null;
let localScreenStream = null;
let localScreenPreview = null;
let isMuted = false;
let micMuteTimer = null;
let micSensitivity = MIC_SENSITIVITY_DEFAULT;
let isMicSensitivityPopoverOpen = false;
let isDlolmusExperimentalMode = false;
let isRnNoiseMode = false;
let pinnedScreenUserId = null;
let activeScreenUserId = null;
let activeScreenSourceTrackId = null;
let activeScreenStageItem = null;
let localScreenPublishPending = false;
let localScreenLastPublishHostId = null;
let localScreenLastPublishedAudioTrackId = null;
let localScreenQualityProfileId = "high";
let localScreenQualityUpdatedAt = 0;
let localScreenLikelySelfCapture = false;
let screenPickerOpen = false;
let isScreenHubCollapsed = loadScreenHubCollapsedPreference();
const chatMessages = [];
const chatMessageIds = new Set();
const pendingChatAttachments = [];
let pendingChatAttachmentSeq = 0;
let chatSubmitInProgress = false;
let chatDropTargetDepth = 0;
let activeChatEditMessageId = null;
let chatEditDraftText = "";
let chatEditRemovedAttachmentIds = new Set();
let savedRooms = [];
let joinInProgress = false;
let isProfilePanelOpen = false;
let preferredMicDeviceId = "";
let preferredSpeakerDeviceId = "";
let preferredThemeId = DEFAULT_THEME_ID;
let preferredLanguageId = DEFAULT_LANGUAGE_ID;
let preferredMotionProfileId = DEFAULT_MOTION_PROFILE_ID;
let preferredBackgroundAnimationId = DEFAULT_BACKGROUND_ANIMATION_ID;
let preferredNetworkModeId = DEFAULT_NETWORK_MODE_ID;
let activeBackendNetworkMode = NETWORK_MODE_SERVER_ID;
let activeSettingsTabId = SETTINGS_TAB_GENERAL_ID;
let notificationPreviewRoomId = "";
let desktopNotificationsSupported = false;
let networkModeRemoteBackendConfigured = false;
let networkModeEnvironmentLocked = false;
let notificationsEnabled = true;
let notificationsSavedRoomsEnabled = true;
let notificationsMentionsEnabled = true;
let notificationPollTimerId = null;
let notificationSyncInProgress = false;
let desktopNotificationActivationCleanup = null;
let relayDatabasePromise = null;
let relayKeyReadyPromiseByRoom = new Map();
const relayRoomKeyCache = new Map();
const relayMessageEnvelopeCache = new Map();
const relayAttachmentSourceMap = new Map();
const relayAttachmentRequestMap = new Map();
const relayLocalAttachmentPreviewCache = new Map();
const relayV2InlinePreviewInFlight = new Map();
const relayV2InlinePreviewFailedAt = new Map();
let relayCapabilityToken = "";
let relayCapabilityTokenExpiresAt = 0;
let relayCapabilityRoomId = "";
let relayUploadProvider = "memory";
let relayUploadLimits = {
  maxFileBytes: RELAY_V2_MAX_FILE_BYTES,
  maxTotalMessageBytes: RELAY_V2_MAX_TOTAL_MESSAGE_BYTES,
  chunkSizeBytes: RELAY_V2_UPLOAD_CHUNK_SIZE_BYTES,
};

const peers = new Map();
const peerReconnectTimerByPeerId = new Map();
const peerReconnectStatusTimerByPeerId = new Map();
const peerReconnectAttemptByPeerId = new Map();
const peerReconnectStatusShownPeerIds = new Set();
const sourceMedia = new Map();
const trackMetaById = new Map();
const pendingTracksById = new Map();
const unresolvedMetaBySourceTrackId = new Map();
const resolvedActualTrackIdBySourceKey = new Map();
const remoteVoice = new Map();
const remoteScreens = new Map();
const userVolumes = new Map();
const screenAudioVolumes = new Map();
const mutedScreenUserIds = new Set();
const screenStartedAtByUserId = new Map();
const screenAudioTrackIdsBySource = new Map();
const screenSenderAbrStateByKey = new Map();
const speakingStateByUserId = new Map();
const speakingUserIds = new Set();
const notificationCheckpoints = new Map();
const processedNotificationMessageIds = [];
const processedNotificationMessageIdSet = new Set();
let speakingDetectionTimer = null;
let screenAbrTimer = null;
let screenAbrTickInFlight = false;
let playbackContext = null;
let micProcessingContext = null;
let micProcessingInputNode = null;
let micProcessingGainNode = null;
let micProcessingDestinationNode = null;
let lastVoiceChannelId = null;
let lastVoiceMemberIds = new Set();
let voiceCueBaselineReady = false;

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
  }
  try {
    const normalizedText = String(text || "").trim();
    const attachmentUnavailableText = String(t("attachmentSourceUnavailable") || "").trim();
    if (normalizedText && attachmentUnavailableText && normalizedText === attachmentUnavailableText) {
      console.error("status_attachment_source_unavailable", {
        roomId: normalizeRoomIdValue(roomState?.id),
        networkMode: activeBackendNetworkMode || NETWORK_MODE_ID,
        relayUploadProvider,
        socketConnected: Boolean(socket?.connected),
        timestamp: new Date().toISOString(),
      });
    }
  } catch {
    // no-op
  }
  updateWindowChromeMeta(text);
}

function syncMobileViewportHeightVar() {
  if (typeof window === "undefined" || !document?.documentElement) {
    return;
  }

  const visualViewportHeight = Number(window.visualViewport?.height);
  const fallbackHeight = Number(window.innerHeight);
  const measuredHeight = Number.isFinite(visualViewportHeight) && visualViewportHeight > 0
    ? visualViewportHeight
    : fallbackHeight;

  if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) {
    return;
  }

  const clampedHeight = Math.max(320, Math.round(measuredHeight));
  document.documentElement.style.setProperty("--app-mobile-vh", `${clampedHeight}px`);
}

function loadScreenHubCollapsedPreference() {
  try {
    const raw = localStorage.getItem(SCREEN_HUB_COLLAPSED_STORAGE_KEY);
    if (raw === null) {
      return true;
    }
    return raw === "1";
  } catch {
    return true;
  }
}

function persistScreenHubCollapsedPreference() {
  try {
    localStorage.setItem(SCREEN_HUB_COLLAPSED_STORAGE_KEY, isScreenHubCollapsed ? "1" : "0");
  } catch {
    // no-op
  }
}

function updateScreenHubToggleButton() {
  if (!screenHubToggleBtn) {
    return;
  }
  screenHubToggleBtn.textContent = isScreenHubCollapsed ? t("screenHubExpand") : t("screenHubCollapse");
  screenHubToggleBtn.setAttribute("aria-label", t("screenHubToggleAria"));
  screenHubToggleBtn.setAttribute("aria-expanded", String(!isScreenHubCollapsed));
}

function setScreenHubCollapsed(nextCollapsed, { persist = true } = {}) {
  isScreenHubCollapsed = Boolean(nextCollapsed);
  if (screenHubEl) {
    screenHubEl.classList.toggle("is-collapsed", isScreenHubCollapsed);
  }
  updateScreenHubToggleButton();
  if (persist) {
    persistScreenHubCollapsedPreference();
  }
}

function getNetworkModeShortLabel(modeId) {
  const normalizedMode = normalizeNetworkModeId(modeId);
  if (normalizedMode === NETWORK_MODE_RELAY_ID) {
    return "RLY";
  }
  if (normalizedMode === "p2p") {
    return "P2P";
  }
  return "SRV";
}

function updateWindowChromeMeta(statusOverride = null) {
  if (!windowChromeEl) {
    return;
  }

  const effectiveModeId = normalizeNetworkModeId(
    roomState?.networkMode || activeBackendNetworkMode || preferredNetworkModeId
  );
  const isRelayMode = effectiveModeId === NETWORK_MODE_RELAY_ID;
  const activeRoomId = normalizeRoomIdValue(roomState?.id);
  const baseTitle = getProjectName();

  if (windowChromeBadgeEl) {
    windowChromeBadgeEl.textContent = getProjectBadgeLabel();
  }
  if (windowChromeTitleEl) {
    windowChromeTitleEl.textContent = joined && activeRoomId ? `${baseTitle} · #${activeRoomId}` : baseTitle;
  }
  if (windowChromeMetaEl) {
    windowChromeMetaEl.textContent = joined ? t("topbarMeta") : t("topbarMetaLobby");
  }
  if (windowChromeNetworkEl) {
    windowChromeNetworkEl.textContent = getNetworkModeShortLabel(effectiveModeId);
  }
  if (windowChromeSecurityEl) {
    windowChromeSecurityEl.textContent = isRelayMode ? "AES-GCM" : "PLAIN";
    windowChromeSecurityEl.classList.toggle("secure", isRelayMode);
  }
  if (windowChromeSubtitleEl) {
    const fallbackStatus = joined ? t("connectedToServer") : t("disconnected");
    const rawStatus = statusOverride ?? statusEl?.textContent ?? fallbackStatus;
    const normalizedStatus = String(rawStatus || "").trim() || fallbackStatus;
    windowChromeSubtitleEl.textContent = normalizedStatus;
  }
}

function fillTemplate(template, params = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => {
    if (!(key in params)) {
      return "";
    }
    return String(params[key]);
  });
}

function t(key, params = {}) {
  const normalizedLanguage = normalizeLanguageId(preferredLanguageId);
  const languagePack = I18N[normalizedLanguage] || I18N[DEFAULT_LANGUAGE_ID];
  const fallbackPack = I18N[DEFAULT_LANGUAGE_ID];
  const template = languagePack[key] ?? fallbackPack[key] ?? key;
  return fillTemplate(template, params);
}

const IS_ELECTRON_UA = /\bElectron\/\d+/i.test(String(window?.navigator?.userAgent || ""));
const IS_ELECTRON_RUNTIME = Boolean(window && (window.desktopApp || IS_ELECTRON_UA));
let activeInlineDialogClose = null;
let activeScreenPickerClose = null;

function closeInlineDialogWithResult(result) {
  if (typeof activeInlineDialogClose === "function") {
    const closer = activeInlineDialogClose;
    activeInlineDialogClose = null;
    closer(result);
  }
}

function closeScreenPickerDialogWithResult(result = null) {
  if (typeof activeScreenPickerClose === "function") {
    const closer = activeScreenPickerClose;
    activeScreenPickerClose = null;
    closer(result);
  }
}

function showInlineDialog({ mode, message, defaultValue = "" }) {
  return new Promise((resolve) => {
    closeInlineDialogWithResult(mode === "confirm" ? false : null);

    const overlay = document.createElement("div");
    overlay.className = "inline-dialog-overlay";
    overlay.setAttribute("role", "presentation");

    const panel = document.createElement("div");
    panel.className = "inline-dialog";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", String(message || ""));

    const messageEl = document.createElement("p");
    messageEl.className = "inline-dialog-message";
    messageEl.textContent = String(message || "");
    panel.appendChild(messageEl);

    let input = null;
    if (mode === "prompt") {
      input = document.createElement("input");
      input.className = "inline-dialog-input";
      input.type = "text";
      input.value = String(defaultValue || "");
      panel.appendChild(input);
    }

    const actions = document.createElement("div");
    actions.className = "inline-dialog-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "inline-dialog-btn cancel";
    cancelBtn.textContent = "Cancel";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "inline-dialog-btn confirm";
    confirmBtn.textContent = "OK";

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    panel.appendChild(actions);
    overlay.appendChild(panel);

    const finish = (result) => {
      if (!overlay.isConnected) {
        resolve(result);
        return;
      }

      document.removeEventListener("keydown", onKeydown, true);
      overlay.remove();
      if (activeInlineDialogClose === finish) {
        activeInlineDialogClose = null;
      }
      resolve(result);
    };

    const onKeydown = (event) => {
      if (!overlay.isConnected) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        finish(mode === "confirm" ? false : null);
        return;
      }

      if (event.key === "Enter") {
        if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }
        event.preventDefault();
        finish(mode === "confirm" ? true : input ? input.value : "");
      }
    };

    cancelBtn.addEventListener("click", () => {
      finish(mode === "confirm" ? false : null);
    });
    confirmBtn.addEventListener("click", () => {
      finish(mode === "confirm" ? true : input ? input.value : "");
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        finish(mode === "confirm" ? false : null);
      }
    });

    activeInlineDialogClose = finish;
    document.addEventListener("keydown", onKeydown, true);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        input.select();
      } else {
        confirmBtn.focus();
      }
    });
  });
}

async function promptInput(message, defaultValue = "") {
  if (!IS_ELECTRON_RUNTIME && typeof window.prompt === "function") {
    return window.prompt(message, defaultValue);
  }
  return showInlineDialog({
    mode: "prompt",
    message,
    defaultValue,
  });
}

async function confirmInput(message) {
  if (!IS_ELECTRON_RUNTIME && typeof window.confirm === "function") {
    return window.confirm(message);
  }
  return showInlineDialog({
    mode: "confirm",
    message,
  });
}

function canUseElectronScreenPicker() {
  return Boolean(
    IS_ELECTRON_RUNTIME &&
      window.desktopApp?.listDisplaySources &&
      window.desktopApp?.prepareDisplayCapture
  );
}

function normalizeDisplaySourceType(source) {
  const type = String(source?.type || "").toLowerCase();
  if (type === "window") {
    return "window";
  }
  return "screen";
}

function createScreenPickerDialog(sources) {
  return new Promise((resolve) => {
    closeScreenPickerDialogWithResult(null);

    if (!Array.isArray(sources) || sources.length === 0) {
      resolve(null);
      return;
    }

    const grouped = {
      screen: sources.filter((source) => normalizeDisplaySourceType(source) === "screen"),
      window: sources.filter((source) => normalizeDisplaySourceType(source) === "window"),
    };

    let activeTab = grouped.screen.length > 0 ? "screen" : "window";
    let selectedSourceId =
      grouped[activeTab][0]?.id || grouped.screen[0]?.id || grouped.window[0]?.id || "";
    let withAudio = true;

    const overlay = document.createElement("div");
    overlay.className = "screen-picker-overlay";
    overlay.setAttribute("role", "presentation");

    const dialog = document.createElement("section");
    dialog.className = "screen-picker-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", t("screenPickerTitle"));

    const title = document.createElement("h3");
    title.className = "screen-picker-title";
    title.textContent = t("screenPickerTitle");

    const subtitle = document.createElement("p");
    subtitle.className = "screen-picker-subtitle";
    subtitle.textContent = t("screenPickerSubtitle");

    const tabs = document.createElement("div");
    tabs.className = "screen-picker-tabs";

    const screensTabBtn = document.createElement("button");
    screensTabBtn.type = "button";
    screensTabBtn.className = "screen-picker-tab";
    screensTabBtn.textContent = t("screenPickerScreens");

    const windowsTabBtn = document.createElement("button");
    windowsTabBtn.type = "button";
    windowsTabBtn.className = "screen-picker-tab";
    windowsTabBtn.textContent = t("screenPickerWindows");

    tabs.appendChild(screensTabBtn);
    tabs.appendChild(windowsTabBtn);

    const grid = document.createElement("div");
    grid.className = "screen-picker-grid";

    const audioRow = document.createElement("label");
    audioRow.className = "screen-picker-audio";
    const audioToggle = document.createElement("input");
    audioToggle.type = "checkbox";
    audioToggle.checked = true;
    const audioText = document.createElement("span");
    audioText.textContent = t("screenPickerIncludeAudio");
    audioRow.appendChild(audioToggle);
    audioRow.appendChild(audioText);

    const actions = document.createElement("div");
    actions.className = "screen-picker-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "screen-picker-btn cancel";
    cancelBtn.textContent = t("screenPickerCancel");

    const chooseBtn = document.createElement("button");
    chooseBtn.type = "button";
    chooseBtn.className = "screen-picker-btn confirm";
    chooseBtn.textContent = t("screenPickerChoose");

    actions.appendChild(cancelBtn);
    actions.appendChild(chooseBtn);

    dialog.appendChild(title);
    dialog.appendChild(subtitle);
    dialog.appendChild(tabs);
    dialog.appendChild(grid);
    dialog.appendChild(audioRow);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);

    const currentList = () => grouped[activeTab] || [];

    const syncTabs = () => {
      screensTabBtn.classList.toggle("active", activeTab === "screen");
      windowsTabBtn.classList.toggle("active", activeTab === "window");
      screensTabBtn.disabled = grouped.screen.length === 0;
      windowsTabBtn.disabled = grouped.window.length === 0;
    };

    const syncGrid = () => {
      const list = currentList();
      if (!list.some((item) => String(item.id) === String(selectedSourceId))) {
        selectedSourceId = list[0]?.id || "";
      }

      grid.innerHTML = "";
      if (list.length === 0) {
        const empty = document.createElement("p");
        empty.className = "screen-picker-empty";
        empty.textContent = t("screenPickerNoSources");
        grid.appendChild(empty);
        chooseBtn.disabled = true;
        return;
      }

      for (const source of list) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "screen-picker-source";
        if (String(source.id) === String(selectedSourceId)) {
          card.classList.add("is-selected");
        }

        const image = document.createElement("img");
        image.className = "screen-picker-thumb";
        image.alt = String(source.name || "Source");
        image.src =
          source.thumbnailDataUrl ||
          "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";
        image.loading = "eager";

        const name = document.createElement("span");
        name.className = "screen-picker-name";
        name.textContent = String(source.name || "Display source");

        card.appendChild(image);
        card.appendChild(name);
        card.addEventListener("click", () => {
          selectedSourceId = String(source.id);
          syncGrid();
        });
        grid.appendChild(card);
      }

      chooseBtn.disabled = !selectedSourceId;
    };

    const finish = (result) => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (overlay.isConnected) {
        overlay.remove();
      }
      activeScreenPickerClose = null;
      screenPickerOpen = false;
      resolve(result);
    };

    const onKeyDown = (event) => {
      if (!overlay.isConnected) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        if (selectedSourceId) {
          finish({
            sourceId: selectedSourceId,
            withAudio,
          });
        }
      }
    };

    screensTabBtn.addEventListener("click", () => {
      if (grouped.screen.length === 0) {
        return;
      }
      activeTab = "screen";
      syncTabs();
      syncGrid();
    });
    windowsTabBtn.addEventListener("click", () => {
      if (grouped.window.length === 0) {
        return;
      }
      activeTab = "window";
      syncTabs();
      syncGrid();
    });
    audioToggle.addEventListener("change", () => {
      withAudio = Boolean(audioToggle.checked);
    });
    cancelBtn.addEventListener("click", () => {
      finish(null);
    });
    chooseBtn.addEventListener("click", () => {
      if (!selectedSourceId) {
        return;
      }
      finish({
        sourceId: selectedSourceId,
        withAudio,
      });
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        finish(null);
      }
    });

    screenPickerOpen = true;
    activeScreenPickerClose = finish;
    document.addEventListener("keydown", onKeyDown, true);
    document.body.appendChild(overlay);
    syncTabs();
    syncGrid();
    requestAnimationFrame(() => {
      chooseBtn.focus();
    });
  });
}

async function pickDisplaySourceForElectron() {
  if (!canUseElectronScreenPicker()) {
    return null;
  }

  let rawSources = [];
  try {
    rawSources = await window.desktopApp.listDisplaySources();
  } catch (error) {
    setStatus(t("screenPickerFailed", { details: error?.message || error?.name || "UnknownError" }));
    return null;
  }

  const sources = Array.isArray(rawSources)
    ? rawSources
        .map((item) => ({
          id: String(item?.id || ""),
          name: String(item?.name || "").trim() || "Display source",
          type: normalizeDisplaySourceType(item),
          thumbnailDataUrl: String(item?.thumbnailDataUrl || ""),
        }))
        .filter((item) => item.id)
    : [];

  if (sources.length === 0) {
    setStatus(t("screenPickerNoSources"));
    return null;
  }

  return createScreenPickerDialog(sources);
}

function getProjectName() {
  return PROJECT_NAME;
}

function getProjectBadgeLabel() {
  const parts = PROJECT_NAME.split(/[\s\-_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return PROJECT_NAME.slice(0, 2).toUpperCase();
}

const MATERIAL_ICON_TEXT_FALLBACKS = Object.freeze({
  add: "+",
  close: "×",
  chevron_right: ">",
  edit: "✎",
  delete: "×",
  mic: "🎤",
  mic_off: "⊘",
  hourglass_top: "⌛",
  present_to_all: "▣",
  stop_screen_share: "◪",
  tune: "≡",
  key: "K",
  call_end: "⨯",
  logout: "↩",
});

let supportsMaterialSymbolLigatures = false;

function getMaterialIconFallbackText(name) {
  const normalized = String(name || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  return MATERIAL_ICON_TEXT_FALLBACKS[normalized] || "•";
}

function resolveMaterialIconText(name) {
  const normalized = String(name || "").trim();
  if (!normalized) {
    return "";
  }
  return supportsMaterialSymbolLigatures
    ? normalized
    : getMaterialIconFallbackText(normalized);
}

function createMaterialIcon(name, extraClass = "") {
  const iconName = String(name || "").trim();
  const icon = document.createElement("span");
  icon.className = `material-symbols-rounded${extraClass ? ` ${extraClass}` : ""}`;
  icon.setAttribute("aria-hidden", "true");
  icon.dataset.iconName = iconName;
  icon.textContent = resolveMaterialIconText(iconName);
  return icon;
}

function refreshMaterialIcons(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return;
  }

  const icons = root.querySelectorAll(".material-symbols-rounded");
  for (const icon of icons) {
    const iconName = String(icon.dataset.iconName || icon.textContent || "").trim();
    if (!iconName) {
      continue;
    }
    icon.dataset.iconName = iconName;
    icon.textContent = resolveMaterialIconText(iconName);
  }
}

function detectMaterialSymbolLigatures() {
  if (!document?.body) {
    return false;
  }

  const ligatureProbe = document.createElement("span");
  ligatureProbe.className = "material-symbols-rounded";
  ligatureProbe.setAttribute("aria-hidden", "true");
  ligatureProbe.style.position = "fixed";
  ligatureProbe.style.left = "-9999px";
  ligatureProbe.style.top = "0";
  ligatureProbe.style.visibility = "hidden";
  ligatureProbe.style.pointerEvents = "none";
  ligatureProbe.textContent = "present_to_all";

  const fallbackProbe = document.createElement("span");
  fallbackProbe.setAttribute("aria-hidden", "true");
  fallbackProbe.style.position = "fixed";
  fallbackProbe.style.left = "-9999px";
  fallbackProbe.style.top = "0";
  fallbackProbe.style.visibility = "hidden";
  fallbackProbe.style.pointerEvents = "none";
  fallbackProbe.style.fontFamily = "Arial, sans-serif";
  fallbackProbe.style.fontSize = "20px";
  fallbackProbe.textContent = "present_to_all";

  document.body.appendChild(ligatureProbe);
  document.body.appendChild(fallbackProbe);
  const ligatureWidth = ligatureProbe.getBoundingClientRect().width;
  const fallbackWidth = fallbackProbe.getBoundingClientRect().width;
  ligatureProbe.remove();
  fallbackProbe.remove();

  return Number.isFinite(ligatureWidth)
    && Number.isFinite(fallbackWidth)
    && fallbackWidth > 0
    && ligatureWidth > 0
    && ligatureWidth < fallbackWidth * 0.72;
}

async function initializeMaterialIcons() {
  if (!document?.body) {
    refreshMaterialIcons();
    return;
  }

  if (document?.fonts && typeof document.fonts.load === "function") {
    try {
      await Promise.race([
        document.fonts.load('20px "Material Symbols Rounded"'),
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    } catch {
      // no-op
    }
  }

  supportsMaterialSymbolLigatures = detectMaterialSymbolLigatures();
  refreshMaterialIcons();
}

function normalizeLanguageId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return DEFAULT_LANGUAGE_ID;
  }

  if (SUPPORTED_LANGUAGE_IDS.includes(raw)) {
    return raw;
  }

  if (raw.startsWith("ru")) {
    return "ru";
  }

  if (raw.startsWith("en")) {
    return "en";
  }

  if (raw.startsWith("la")) {
    return "la";
  }

  if (SUPPORTED_SLAVIC_LANGUAGE_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
    return "sl";
  }

  return DEFAULT_LANGUAGE_ID;
}

function detectLanguageId() {
  if (typeof navigator === "undefined") {
    return DEFAULT_LANGUAGE_ID;
  }
  const browserLanguage = navigator.language || navigator.userLanguage || DEFAULT_LANGUAGE_ID;
  return normalizeLanguageId(browserLanguage);
}

function loadPreferredLanguageId() {
  try {
    const stored = localStorage.getItem(PROFILE_LANGUAGE_STORAGE_KEY);
    if (!stored) {
      return detectLanguageId();
    }
    return normalizeLanguageId(stored);
  } catch {
    return detectLanguageId();
  }
}

function persistPreferredLanguageId() {
  try {
    localStorage.setItem(PROFILE_LANGUAGE_STORAGE_KEY, preferredLanguageId);
  } catch {
    // no-op
  }
}

function getCurrentTimeLocale() {
  return LANGUAGE_TIME_LOCALES[normalizeLanguageId(preferredLanguageId)] || LANGUAGE_TIME_LOCALES.en;
}

function syncLanguageSelector() {
  if (!profileLanguageSelect) {
    return;
  }

  const selectedLanguage = normalizeLanguageId(preferredLanguageId);
  profileLanguageSelect.innerHTML = "";

  for (const languageId of SUPPORTED_LANGUAGE_IDS) {
    const option = document.createElement("option");
    option.value = languageId;
    option.textContent = LANGUAGE_OPTION_LABELS[languageId] || languageId.toUpperCase();
    profileLanguageSelect.appendChild(option);
  }

  profileLanguageSelect.value = selectedLanguage;
}

function normalizeMotionProfileId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return DEFAULT_MOTION_PROFILE_ID;
  }

  const found = MOTION_PROFILES.find((item) => item.id === raw);
  return found ? found.id : DEFAULT_MOTION_PROFILE_ID;
}

function loadPreferredMotionProfileId() {
  try {
    return normalizeMotionProfileId(localStorage.getItem(PROFILE_MOTION_STORAGE_KEY));
  } catch {
    return DEFAULT_MOTION_PROFILE_ID;
  }
}

function persistPreferredMotionProfileId() {
  try {
    localStorage.setItem(PROFILE_MOTION_STORAGE_KEY, preferredMotionProfileId);
  } catch {
    // no-op
  }
}

function syncMotionProfileSelector() {
  if (!profileMotionSelect) {
    return;
  }

  const selectedMotionProfile = normalizeMotionProfileId(preferredMotionProfileId);
  profileMotionSelect.innerHTML = "";

  for (const item of MOTION_PROFILES) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = t(item.labelKey);
    profileMotionSelect.appendChild(option);
  }

  profileMotionSelect.value = selectedMotionProfile;
}

function applyMotionProfile(motionProfileId, { persist = true } = {}) {
  preferredMotionProfileId = normalizeMotionProfileId(motionProfileId);
  document.documentElement.setAttribute("data-motion-profile", preferredMotionProfileId);
  syncMotionProfileSelector();

  if (persist) {
    persistPreferredMotionProfileId();
  }
}

function normalizeBackgroundAnimationId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return DEFAULT_BACKGROUND_ANIMATION_ID;
  }

  const found = BACKGROUND_ANIMATION_MODES.find((item) => item.id === raw);
  return found ? found.id : DEFAULT_BACKGROUND_ANIMATION_ID;
}

function loadPreferredBackgroundAnimationId() {
  try {
    return normalizeBackgroundAnimationId(localStorage.getItem(PROFILE_BACKGROUND_STORAGE_KEY));
  } catch {
    return DEFAULT_BACKGROUND_ANIMATION_ID;
  }
}

function persistPreferredBackgroundAnimationId() {
  try {
    localStorage.setItem(PROFILE_BACKGROUND_STORAGE_KEY, preferredBackgroundAnimationId);
  } catch {
    // no-op
  }
}

function syncBackgroundAnimationSelector() {
  if (!profileBackgroundSelect) {
    return;
  }

  const selectedBackgroundAnimation = normalizeBackgroundAnimationId(preferredBackgroundAnimationId);
  profileBackgroundSelect.innerHTML = "";

  for (const item of BACKGROUND_ANIMATION_MODES) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = t(item.labelKey);
    profileBackgroundSelect.appendChild(option);
  }

  profileBackgroundSelect.value = selectedBackgroundAnimation;
}

function applyBackgroundAnimation(backgroundAnimationId, { persist = true } = {}) {
  preferredBackgroundAnimationId = normalizeBackgroundAnimationId(backgroundAnimationId);
  document.documentElement.setAttribute("data-bg-animation", preferredBackgroundAnimationId);
  syncBackgroundAnimationSelector();

  if (persist) {
    persistPreferredBackgroundAnimationId();
  }
}

function normalizeNetworkModeId(value) {
  const clean = String(value || "").trim().toLowerCase();
  if (clean === "p2p") {
    return "p2p";
  }
  if (clean === NETWORK_MODE_RELAY_ID) {
    return NETWORK_MODE_RELAY_ID;
  }
  return DEFAULT_NETWORK_MODE_ID;
}

function getNetworkModeLabel(networkModeId) {
  const normalized = normalizeNetworkModeId(networkModeId);
  if (normalized === "p2p") {
    return t("networkModeP2P");
  }
  if (normalized === NETWORK_MODE_RELAY_ID) {
    return t("networkModeRelay");
  }
  return t("networkModeServer");
}

function getNetworkModeNoteText() {
  if (!IS_ELECTRON_RUNTIME) {
    return t("networkModeElectronOnly");
  }
  if (networkModeRemoteBackendConfigured) {
    return t("networkModeRemoteLocked");
  }
  if (networkModeEnvironmentLocked) {
    return t("networkModeEnvLocked");
  }
  return t("networkModeRestartHint");
}

