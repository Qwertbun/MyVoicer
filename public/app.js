const socket = io();

const joinForm = document.getElementById("join-form");
const serversRailEl = document.getElementById("servers-rail");
const appTitleEl = document.getElementById("app-title");
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
const leaveVoiceBtn = document.getElementById("leave-voice-btn");
const previewBtn = document.getElementById("preview-btn");
const leaveBtn = document.getElementById("leave-btn");
const remoteAudios = document.getElementById("remote-audios");
const screensContainer = document.getElementById("screens");
const screensCarouselNav = document.getElementById("screens-carousel-nav");
const screensPrevBtn = document.getElementById("screens-prev-btn");
const screensNextBtn = document.getElementById("screens-next-btn");
const screensCarouselIndicator = document.getElementById("screens-carousel-indicator");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSendBtn = document.getElementById("chat-send-btn");
const chatAttachBtn = document.getElementById("chat-attach-btn");
const chatFileInput = document.getElementById("chat-file-input");
const chatAttachmentsPreviewEl = document.getElementById("chat-attachments-preview");
const chatMessagesEl = document.getElementById("chat-messages");
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
const participantsTitleEl = document.getElementById("participants-title");
const screenStreamsTitleEl = document.getElementById("screen-streams-title");
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
const profileMicSelect = document.getElementById("profile-mic-select");
const profileSpeakerSelect = document.getElementById("profile-speaker-select");
const profileThemeSelect = document.getElementById("profile-theme-select");
const profileLanguageSelect = document.getElementById("profile-language-select");
const profileMotionSelect = document.getElementById("profile-motion-select");
const profileBackgroundSelect = document.getElementById("profile-background-select");

const DEFAULT_RTC_CONFIG = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  iceTransportPolicy: "all",
};
const PROJECT_NAME = String(document.documentElement?.dataset?.projectName || "VM")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 40) || "VM";
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
const AUDIO_SENDER_MAX_BITRATE = 64000;
const PEER_DISCONNECT_GRACE_MS = 8000;
const MIC_CAPTURE_MUTE_GRACE_MS = 320;
const DLOLMUS_COMMAND_PREFIX = "/dlolmus";
const RN_COMMAND_PREFIX = "/rn";
const MAX_CHAT_ATTACHMENTS = 4;
const MAX_CHAT_MESSAGE_LENGTH = 1200;
const MAX_CHAT_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_CHAT_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const CHAT_EDIT_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
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
const CHAT_AUTHOR_ID = loadOrCreateChatAuthorId();
const DEFAULT_THEME_ID = "dark";
const DEFAULT_LANGUAGE_ID = "en";
const DEFAULT_MOTION_PROFILE_ID = "balanced";
const DEFAULT_BACKGROUND_ANIMATION_ID = "aurora";
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
const I18N = {
  en: {
    pageTitle: "Voice Servers",
    ariaServersRail: "Servers",
    ariaSavedServers: "Saved servers",
    homeServerTitle: "Voice Messenger",
    addServerTitle: "Add server",
    appTitle: "Voice Messenger",
    appSubtitle: "First entrant in each voice room becomes host and relays voice + screen.",
    joinHint: "Connect to the selected server from the left rail.",
    joinSelectedServer: "Join Selected Server",
    createServer: "Create Server",
    micSensitivity: "Mic sensitivity",
    leaveServer: "Leave server",
    statusLabel: "Status:",
    disconnected: "Disconnected",
    textChannels: "Text channels",
    voiceRooms: "Voice rooms",
    addVoiceRoom: "Add voice room",
    topbarMeta: "Server chat + voice + screens",
    topbarMetaLobby: "Select a server on the left, then connect to unlock chat, voice rooms, and screen sharing.",
    send: "Send",
    participants: "Participants",
    screenStreams: "Screen Streams",
    prev: "Prev",
    next: "Next",
    prevScreenStream: "Previous screen stream",
    nextScreenStream: "Next screen stream",
    profile: "Profile",
    closeProfile: "Close profile",
    nickname: "Nickname",
    yourName: "Your name",
    microphone: "Microphone",
    speakers: "Speakers",
    theme: "Theme",
    language: "Language",
    motion: "Motion",
    backgroundAnimation: "Background animation",
    motionOff: "Off",
    motionCalm: "Calm",
    motionBalanced: "Balanced",
    motionExpressive: "Expressive",
    backgroundOff: "Off",
    backgroundAurora: "Aurora",
    backgroundNebula: "Nebula",
    meBadge: "ME",
    themeMidnight: "Midnight",
    themeGraphite: "Graphite",
    themeAbyss: "Abyss Blue",
    themeEmber: "Ember",
    themeForest: "Forest",
    themeDaylight: "Daylight",
    themeTurquoiseBlack: "Turquoise / Black",
    themeGreenBlack: "Green / Black",
    themeGreenTurquoise: "Green / Turquoise",
    themePurpleRaspberry: "Purple / Raspberry",
    themeBrownOrange: "Brown / Orange",
    themeBlackOutline: "Black / White Outline",
    themeScarlet: "Scarlet / Red",
    themeCrimsonOrange: "Crimson / Orange",
    mediaDevicesApiUnavailable: "Media devices API unavailable",
    deviceSavedUnavailable: "{device} (saved, unavailable)",
    speakerSwitchNotSupported: "Speaker switch is not supported in this browser",
    defaultMicrophone: "Default microphone",
    microphoneGeneric: "Microphone",
    defaultSpeakers: "Default speakers",
    speakersGeneric: "Speakers",
    chatPlaceholder: "Write to #{room}",
    attachFiles: "Attach files",
    removeAttachment: "Remove attachment {name}",
    attachmentImageLabel: "Image {name}",
    attachmentVideoLabel: "Video {name}",
    attachmentFileLabel: "File {name}",
    attachmentLimitExceeded: "You can attach up to {count} files.",
    attachmentTooLarge: "File \"{name}\" is too large. Max {max}.",
    attachmentTotalTooLarge: "Total attachment size is too large. Max {max}.",
    attachmentReadFailed: "Failed to read file \"{name}\".",
    attachmentUploading: "Uploading attachments...",
    chatSendFailed: "Message was not sent.",
    editMessage: "Edit message",
    deleteMessage: "Delete message",
    confirmDeleteMessage: "Delete this message?",
    saveEdit: "Save",
    cancelEdit: "Cancel",
    editedLabel: "edited",
    editWindowExpired: "Edit window has expired.",
    notMessageAuthor: "You can edit only your own messages.",
    messageNotFound: "Message not found.",
    welcomeTitle: "Welcome to {projectName}",
    welcomeSubtitle:
      "A unified space for voice rooms, text chat, media previews, and file sharing with persistent history.",
    welcomeStepsTitle: "Quick start guide",
    welcomeStepJoin: "Pick or create a server on the left rail, then press Join Selected Server.",
    welcomeStepProfile: "Open Profile and set your nickname, microphone, speakers, and theme.",
    welcomeStepVoice: "Join any voice room. The first entrant becomes host for audio and screen relay.",
    welcomeStepChat: "Send text, files, photos, and videos. Media is previewed directly in chat.",
    welcomeNotesTitle: "Project capabilities",
    welcomeNoteHistory: "Chat history and attachments are persisted on the server.",
    welcomeNoteFiles: "Files are accepted regardless of extension.",
    welcomeNoteSecurity: "Use HTTPS in LAN/public access for stable microphone permissions.",
    enterApp: "Open Workspace",
    joinServerFirst: "Join server first.",
    roomSuggested: "Room {index}",
    promptVoiceRoomName: "Voice room name",
    unableCreateVoiceRoom: "Unable to create voice room.",
    voiceRoomCreated: "Voice room \"{name}\" created.",
    promptRenameVoiceRoom: "Rename voice room",
    unableRenameVoiceRoom: "Unable to rename voice room.",
    voiceRoomRenamed: "Voice room renamed to \"{name}\".",
    confirmDeleteVoiceRoom: "Delete voice room \"{name}\"?",
    unableDeleteVoiceRoom: "Unable to delete voice room.",
    voiceRoomDeleted: "Voice room \"{name}\" deleted.",
    ariaJoinVoiceRoom: "Join voice room {name}",
    ariaVoiceRoomJoinFirst: "Voice room {name} (join server first)",
    switchingToVoiceRoom: "Switching to voice room {name}...",
    renameVoiceRoom: "Rename voice room",
    deleteVoiceRoom: "Delete voice room",
    youSuffix: "{name} (you)",
    hostTag: "HOST",
    screenTag: "SCREEN",
    openServer: "Open server {room}",
    chatEmptyJoin: "Join a server to start chatting.",
    chatEmptyNoMessages: "No messages yet. Start the conversation.",
    guest: "Guest",
    mute: "Mute",
    muting: "Muting...",
    unmute: "Unmute",
    usageDlolmus: "Usage: /dlolmus on | /dlolmus off",
    dlolmusOn: "Experimental mode dlolmus: ON (Opus stereo + maxaveragebitrate in answer SDP)",
    dlolmusOff: "Experimental mode dlolmus: OFF",
    usageRn: "Usage: /rn on | /rn off",
    rnOn: "RNNoise mode: ON (browser noiseSuppression/echoCancellation disabled)",
    rnOff: "RNNoise mode: OFF (browser noiseSuppression/echoCancellation restored to defaults)",
    rnOnDeferred:
      "RNNoise mode: ON (live constraint switch rejected by browser; will apply on next mic capture)",
    rnOffDeferred:
      "RNNoise mode: OFF (live constraint switch rejected by browser; defaults return on next mic capture)",
    volume: "Volume",
    hideMyPreview: "Hide My Preview",
    showMyPreview: "Show My Preview",
    youAreSharing: "You are sharing",
    userIsSharing: "{name} is sharing",
    pin: "Pin",
    unpin: "Unpin",
    pinScreenStream: "Pin screen stream",
    unpinScreenStream: "Unpin screen stream",
    fullscreen: "Fullscreen",
    openFullscreen: "Open stream in fullscreen",
    muteAudio: "Mute Audio",
    unmuteAudio: "Unmute Audio",
    muteThisScreenAudio: "Mute this screen stream audio",
    unmuteThisScreenAudio: "Unmute this screen stream audio",
    musicVolume: "Music Volume",
    noAudio: "No audio",
    stopScreenShare: "Stop Screen Share",
    shareScreen: "Share Screen",
    leaveVoiceChannel: "Leave Voice",
    connectedToServer: "Connected to server",
    notInVoiceChannel: "Not in a voice channel.",
    inVoiceChannelWithName: "In voice #{name}",
    micErrorHttps: "Microphone works only on HTTPS (or localhost).",
    micErrorDenied: "Microphone access denied in browser permissions.",
    micErrorNoDevice: "No microphone device found on this PC.",
    micErrorBusy: "Microphone is busy in another application.",
    micErrorGeneric: "Microphone error: {name}",
    negotiationError: "Negotiation error",
    connectedToHost: "Connected to host",
    screenShareNotSupported: "Screen sharing is not supported in this browser.",
    screenSharingStartedNoAudio: "Screen sharing started (video only; browser did not provide screen audio)",
    screenSharingStartedMicKept: "Screen sharing started (video only; microphone kept active).",
    screenSharingStartedWithAudio: "Screen sharing started (with screen audio)",
    screenShareError: "Screen share error: {details}",
    screenSharingStopped: "Screen sharing stopped",
    hostMode: "Host mode: you relay voice and screens",
    waitingForHost: "Waiting for host to connect...",
    inVoiceRoom: "In voice room",
    switchingServer: "Switching server...",
    joiningServer: "Joining server...",
    microphoneSwitched: "Microphone switched",
    defaultMicrophoneSelected: "Default microphone selected",
    microphoneSwitchFailed: "Microphone switch failed: {details}",
    speakersSwitched: "Speakers switched",
    defaultSpeakersSelected: "Default speakers selected",
    promptEnterServerId: "Enter server ID",
    connectionError: "Connection error: {details}",
    warningHttps: "Warning: open via HTTPS on other PCs, otherwise microphone request may be blocked.",
  },
  ru: {
    pageTitle: "Голосовые серверы",
    ariaServersRail: "Серверы",
    ariaSavedServers: "Сохраненные серверы",
    homeServerTitle: "Голосовой мессенджер",
    addServerTitle: "Добавить сервер",
    appTitle: "Голосовой мессенджер",
    appSubtitle: "Первый вошедший в голосовую комнату становится хостом и ретранслирует голос и экран.",
    joinHint: "Подключитесь к выбранному серверу из левой панели.",
    joinSelectedServer: "Подключиться к выбранному серверу",
    createServer: "Создать сервер",
    micSensitivity: "Чувствительность микрофона",
    leaveServer: "Покинуть сервер",
    statusLabel: "Статус:",
    disconnected: "Отключено",
    textChannels: "Текстовые каналы",
    voiceRooms: "Голосовые комнаты",
    addVoiceRoom: "Добавить голосовую комнату",
    topbarMeta: "Чат сервера + голос + экраны",
    topbarMetaLobby: "Выберите сервер слева и подключитесь, чтобы открыть чат, голосовые комнаты и трансляции.",
    send: "Отправить",
    participants: "Участники",
    screenStreams: "Трансляции экрана",
    prev: "Назад",
    next: "Далее",
    prevScreenStream: "Предыдущая трансляция экрана",
    nextScreenStream: "Следующая трансляция экрана",
    profile: "Профиль",
    closeProfile: "Закрыть профиль",
    nickname: "Никнейм",
    yourName: "Ваше имя",
    microphone: "Микрофон",
    speakers: "Динамики",
    theme: "Тема",
    language: "Язык",
    motion: "Анимации",
    backgroundAnimation: "Анимация фона",
    motionOff: "Выключено",
    motionCalm: "Спокойно",
    motionBalanced: "Сбалансировано",
    motionExpressive: "Выразительно",
    backgroundOff: "Выключено",
    backgroundAurora: "Полярное сияние",
    backgroundNebula: "Туманность",
    meBadge: "Я",
    themeMidnight: "Полночь",
    themeGraphite: "Графит",
    themeAbyss: "Синяя бездна",
    themeEmber: "Тлеющий уголь",
    themeForest: "Лес",
    themeDaylight: "Дневной свет",
    themeTurquoiseBlack: "Бирюза / Черный",
    themeGreenBlack: "Зеленый / Черный",
    themeGreenTurquoise: "Зеленый / Бирюза",
    themePurpleRaspberry: "Пурпурный / Малина",
    themeBrownOrange: "Коричневый / Оранжевый",
    themeBlackOutline: "Черный / Белый контур",
    themeScarlet: "Алый / Красный",
    themeCrimsonOrange: "Багровый / Оранжевый",
    mediaDevicesApiUnavailable: "API медиа-устройств недоступен",
    deviceSavedUnavailable: "{device} (сохранено, недоступно)",
    speakerSwitchNotSupported: "Переключение динамиков не поддерживается в этом браузере",
    defaultMicrophone: "Микрофон по умолчанию",
    microphoneGeneric: "Микрофон",
    defaultSpeakers: "Динамики по умолчанию",
    speakersGeneric: "Динамики",
    chatPlaceholder: "Написать в #{room}",
    attachFiles: "Прикрепить файлы",
    removeAttachment: "Удалить вложение {name}",
    attachmentImageLabel: "Изображение {name}",
    attachmentVideoLabel: "Видео {name}",
    attachmentFileLabel: "Файл {name}",
    attachmentLimitExceeded: "Можно прикрепить не более {count} файлов.",
    attachmentTooLarge: "Файл \"{name}\" слишком большой. Максимум {max}.",
    attachmentTotalTooLarge: "Суммарный размер вложений слишком большой. Максимум {max}.",
    attachmentReadFailed: "Не удалось прочитать файл \"{name}\".",
    attachmentUploading: "Загружаем вложения...",
    chatSendFailed: "Сообщение не отправлено.",
    editMessage: "Редактировать сообщение",
    deleteMessage: "Удалить сообщение",
    confirmDeleteMessage: "Удалить это сообщение?",
    saveEdit: "Сохранить",
    cancelEdit: "Отмена",
    editedLabel: "изменено",
    editWindowExpired: "Время редактирования истекло.",
    notMessageAuthor: "Можно редактировать только свои сообщения.",
    messageNotFound: "Сообщение не найдено.",
    welcomeTitle: "Добро пожаловать в {projectName}",
    welcomeSubtitle:
      "Единое пространство для голосовых комнат, текстового чата, предпросмотра медиа и отправки файлов с сохранением истории.",
    welcomeStepsTitle: "Быстрый старт",
    welcomeStepJoin: "Выберите или создайте сервер слева и нажмите «Подключиться к выбранному серверу».",
    welcomeStepProfile: "Откройте профиль и настройте ник, микрофон, динамики и тему.",
    welcomeStepVoice: "Зайдите в любую голосовую комнату. Первый участник становится хостом ретрансляции.",
    welcomeStepChat: "Отправляйте текст, файлы, фото и видео. Медиа показывается прямо в чате.",
    welcomeNotesTitle: "Возможности проекта",
    welcomeNoteHistory: "История чата и вложения сохраняются на сервере.",
    welcomeNoteFiles: "Разрешена отправка файлов независимо от расширения.",
    welcomeNoteSecurity: "Для доступа по LAN/интернету используйте HTTPS, чтобы микрофон работал стабильно.",
    enterApp: "Открыть рабочее пространство",
    joinServerFirst: "Сначала подключитесь к серверу.",
    roomSuggested: "Комната {index}",
    promptVoiceRoomName: "Название голосовой комнаты",
    unableCreateVoiceRoom: "Не удалось создать голосовую комнату.",
    voiceRoomCreated: "Голосовая комната \"{name}\" создана.",
    promptRenameVoiceRoom: "Переименовать голосовую комнату",
    unableRenameVoiceRoom: "Не удалось переименовать голосовую комнату.",
    voiceRoomRenamed: "Голосовая комната переименована в \"{name}\".",
    confirmDeleteVoiceRoom: "Удалить голосовую комнату \"{name}\"?",
    unableDeleteVoiceRoom: "Не удалось удалить голосовую комнату.",
    voiceRoomDeleted: "Голосовая комната \"{name}\" удалена.",
    ariaJoinVoiceRoom: "Войти в голосовую комнату {name}",
    ariaVoiceRoomJoinFirst: "Голосовая комната {name} (сначала подключитесь к серверу)",
    switchingToVoiceRoom: "Переключение в голосовую комнату {name}...",
    renameVoiceRoom: "Переименовать голосовую комнату",
    deleteVoiceRoom: "Удалить голосовую комнату",
    youSuffix: "{name} (вы)",
    hostTag: "ХОСТ",
    screenTag: "ЭКРАН",
    openServer: "Открыть сервер {room}",
    chatEmptyJoin: "Подключитесь к серверу, чтобы начать чат.",
    chatEmptyNoMessages: "Пока нет сообщений. Начните разговор.",
    guest: "Гость",
    mute: "Выключить микрофон",
    muting: "Выключаем...",
    unmute: "Включить микрофон",
    usageDlolmus: "Использование: /dlolmus on | /dlolmus off",
    dlolmusOn: "Экспериментальный режим dlolmus: ВКЛ (Opus stereo + maxaveragebitrate в answer SDP)",
    dlolmusOff: "Экспериментальный режим dlolmus: ВЫКЛ",
    usageRn: "Использование: /rn on | /rn off",
    rnOn: "Режим RNNoise: ВКЛ (noiseSuppression/echoCancellation браузера отключены)",
    rnOff: "Режим RNNoise: ВЫКЛ (noiseSuppression/echoCancellation браузера возвращены по умолчанию)",
    rnOnDeferred:
      "Режим RNNoise: ВКЛ (браузер отклонил переключение на лету; применится при следующем захвате микрофона)",
    rnOffDeferred:
      "Режим RNNoise: ВЫКЛ (браузер отклонил переключение на лету; настройки по умолчанию вернутся при следующем захвате микрофона)",
    volume: "Громкость",
    hideMyPreview: "Скрыть мой превью",
    showMyPreview: "Показать мой превью",
    youAreSharing: "Вы делитесь экраном",
    userIsSharing: "{name} делится экраном",
    pin: "Закрепить",
    unpin: "Открепить",
    pinScreenStream: "Закрепить трансляцию экрана",
    unpinScreenStream: "Открепить трансляцию экрана",
    fullscreen: "На весь экран",
    openFullscreen: "Открыть трансляцию на весь экран",
    muteAudio: "Выключить звук",
    unmuteAudio: "Включить звук",
    muteThisScreenAudio: "Выключить звук этой трансляции экрана",
    unmuteThisScreenAudio: "Включить звук этой трансляции экрана",
    musicVolume: "Громкость медиа",
    noAudio: "Без звука",
    stopScreenShare: "Остановить показ экрана",
    shareScreen: "Поделиться экраном",
    leaveVoiceChannel: "Покинуть голос",
    connectedToServer: "Подключено к серверу",
    notInVoiceChannel: "Вы не в голосовом канале.",
    inVoiceChannelWithName: "В голосе #{name}",
    micErrorHttps: "Микрофон работает только по HTTPS (или на localhost).",
    micErrorDenied: "Доступ к микрофону запрещен в разрешениях браузера.",
    micErrorNoDevice: "На этом ПК не найден микрофон.",
    micErrorBusy: "Микрофон занят другим приложением.",
    micErrorGeneric: "Ошибка микрофона: {name}",
    negotiationError: "Ошибка согласования соединения",
    connectedToHost: "Подключено к хосту",
    screenShareNotSupported: "Показ экрана не поддерживается в этом браузере.",
    screenSharingStartedNoAudio: "Показ экрана запущен (только видео; браузер не дал звук экрана)",
    screenSharingStartedMicKept: "Показ экрана запущен (только видео; микрофон оставлен активным).",
    screenSharingStartedWithAudio: "Показ экрана запущен (со звуком экрана)",
    screenShareError: "Ошибка показа экрана: {details}",
    screenSharingStopped: "Показ экрана остановлен",
    hostMode: "Режим хоста: вы ретранслируете голос и экраны",
    waitingForHost: "Ожидание подключения хоста...",
    inVoiceRoom: "В голосовой комнате",
    switchingServer: "Переключение сервера...",
    joiningServer: "Подключение к серверу...",
    microphoneSwitched: "Микрофон переключен",
    defaultMicrophoneSelected: "Выбран микрофон по умолчанию",
    microphoneSwitchFailed: "Не удалось переключить микрофон: {details}",
    speakersSwitched: "Динамики переключены",
    defaultSpeakersSelected: "Выбраны динамики по умолчанию",
    promptEnterServerId: "Введите ID сервера",
    connectionError: "Ошибка соединения: {details}",
    warningHttps:
      "Предупреждение: на других ПК открывайте по HTTPS, иначе запрос микрофона может быть заблокирован.",
  },
  sl: {
    pageTitle: "Гласовыя серверы",
    ariaServersRail: "Серверы",
    ariaSavedServers: "Сбережены серверы",
    homeServerTitle: "Гласовъ вестник",
    addServerTitle: "Приложити сервер",
    appTitle: "Гласовъ вестник",
    appSubtitle: "Первый вшедый в гласову палату бываеть хостом и передаеть глас и екран.",
    joinHint: "Присоединися к избраному серверу от левой стезе.",
    joinSelectedServer: "Внити в избраны сервер",
    createServer: "Створити сервер",
    micSensitivity: "Чутье микрофона",
    leaveServer: "Оставити сервер",
    statusLabel: "Состояние:",
    disconnected: "Разъединено",
    textChannels: "Писмени каналы",
    voiceRooms: "Гласовыя палаты",
    addVoiceRoom: "Приложити гласову палату",
    topbarMeta: "Серверный чат + глас + екраны",
    topbarMetaLobby: "Избери сервер от левой стезе и вниди, да отверзеши чат, гласовыя палаты и екраны.",
    send: "Послати",
    participants: "Участници",
    screenStreams: "Екранны потоци",
    prev: "Назад",
    next: "Вперед",
    prevScreenStream: "Предыдущий екранный поток",
    nextScreenStream: "Следующий екранный поток",
    profile: "Образ",
    closeProfile: "Затворити образ",
    nickname: "Прозвище",
    yourName: "Твое имя",
    microphone: "Микрофон",
    speakers: "Говорители",
    theme: "Облик",
    language: "Язык",
    motion: "Движение",
    backgroundAnimation: "Движение фона",
    motionOff: "Выключено",
    motionCalm: "Тихо",
    motionBalanced: "Равно",
    motionExpressive: "Живо",
    backgroundOff: "Выключено",
    backgroundAurora: "Сияние",
    backgroundNebula: "Мгла",
    meBadge: "АЗ",
    themeMidnight: "Полунощь",
    themeGraphite: "Графит",
    themeAbyss: "Синя бездна",
    themeEmber: "Жар",
    themeForest: "Лес",
    themeDaylight: "День",
    themeTurquoiseBlack: "Бируза / Чрьнъ",
    themeGreenBlack: "Зеленъ / Чрьнъ",
    themeGreenTurquoise: "Зеленъ / Бируза",
    themePurpleRaspberry: "Пурпуръ / Малина",
    themeBrownOrange: "Коричневъ / Оранжевъ",
    themeBlackOutline: "Чрьнъ / Белъ обводъ",
    themeScarlet: "Алый / Красенъ",
    themeCrimsonOrange: "Багровъ / Оранжевъ",
    mediaDevicesApiUnavailable: "API медиа-устройств недоступен",
    deviceSavedUnavailable: "{device} (сбережено, недоступно)",
    speakerSwitchNotSupported: "Преставление говорителей не поддержано в сем браузере",
    defaultMicrophone: "Микрофон по умолчанию",
    microphoneGeneric: "Микрофон",
    defaultSpeakers: "Говорители по умолчанию",
    speakersGeneric: "Говорители",
    chatPlaceholder: "Писати в #{room}",
    editMessage: "Преобразити весть",
    deleteMessage: "Удалити весть",
    confirmDeleteMessage: "Удалити сию весть?",
    saveEdit: "Сохранити",
    cancelEdit: "Отмена",
    editedLabel: "преобразена",
    editWindowExpired: "Время преобразования истекло.",
    notMessageAuthor: "Можеши преобразовати токмо своя вести.",
    messageNotFound: "Весть не обретеся.",
    joinServerFirst: "Прежде вниди в сервер.",
    roomSuggested: "Палата {index}",
    promptVoiceRoomName: "Имя гласовыя палаты",
    unableCreateVoiceRoom: "Невозможно створити гласову палату.",
    voiceRoomCreated: "Гласова палата \"{name}\" створена.",
    promptRenameVoiceRoom: "Переименовати гласову палату",
    unableRenameVoiceRoom: "Невозможно переименовати гласову палату.",
    voiceRoomRenamed: "Гласова палата наречена \"{name}\".",
    confirmDeleteVoiceRoom: "Удалити гласову палату \"{name}\"?",
    unableDeleteVoiceRoom: "Невозможно удалити гласову палату.",
    voiceRoomDeleted: "Гласова палата \"{name}\" удалена.",
    ariaJoinVoiceRoom: "Внити в гласову палату {name}",
    ariaVoiceRoomJoinFirst: "Гласова палата {name} (прежде вниди в сервер)",
    switchingToVoiceRoom: "Переход в гласову палату {name}...",
    renameVoiceRoom: "Переименовати гласову палату",
    deleteVoiceRoom: "Удалити гласову палату",
    youSuffix: "{name} (ты)",
    hostTag: "ХОСТ",
    screenTag: "ЕКРАН",
    openServer: "Отворити сервер {room}",
    chatEmptyJoin: "Вниди в сервер, да начати беседу.",
    chatEmptyNoMessages: "Пока несть вестей. Начни беседу.",
    guest: "Гость",
    mute: "Умолчати микрофон",
    muting: "Умолчание...",
    unmute: "Размолчати микрофон",
    usageDlolmus: "Употреба: /dlolmus on | /dlolmus off",
    dlolmusOn: "Опытный режим dlolmus: ВКЛ (Opus stereo + maxaveragebitrate в answer SDP)",
    dlolmusOff: "Опытный режим dlolmus: ВЫКЛ",
    usageRn: "Употреба: /rn on | /rn off",
    rnOn: "Режим RNNoise: ВКЛ (noiseSuppression/echoCancellation браузера отключены)",
    rnOff: "Режим RNNoise: ВЫКЛ (noiseSuppression/echoCancellation браузера возвращены)",
    rnOnDeferred:
      "Режим RNNoise: ВКЛ (браузер отверг живо переключение; приложится при следущем взятии микрофона)",
    rnOffDeferred:
      "Режим RNNoise: ВЫКЛ (браузер отверг живо переключение; по умолчанию возвратится при следущем взятии микрофона)",
    volume: "Громкость",
    hideMyPreview: "Скрыти мой преглед",
    showMyPreview: "Показати мой преглед",
    youAreSharing: "Ты делишися екраном",
    userIsSharing: "{name} делится екраном",
    pin: "Прикрепити",
    unpin: "Открепити",
    pinScreenStream: "Прикрепити екранный поток",
    unpinScreenStream: "Открепити екранный поток",
    fullscreen: "Полный екран",
    openFullscreen: "Отворити поток во весь екран",
    muteAudio: "Умолчати звук",
    unmuteAudio: "Размолчати звук",
    muteThisScreenAudio: "Умолчати звук сего екрана",
    unmuteThisScreenAudio: "Размолчати звук сего екрана",
    musicVolume: "Громкость звука",
    noAudio: "Несть звука",
    stopScreenShare: "Остановити деление екрана",
    shareScreen: "Делитися екраном",
    leaveVoiceChannel: "Оставити глас",
    connectedToServer: "Соединено с сервером",
    notInVoiceChannel: "Ты не в гласовей палате.",
    inVoiceChannelWithName: "В гласе #{name}",
    micErrorHttps: "Микрофон действует токмо по HTTPS (или localhost).",
    micErrorDenied: "Доступ к микрофону отвергнут в разрешениях браузера.",
    micErrorNoDevice: "На сем ПК не найден микрофон.",
    micErrorBusy: "Микрофон занят иным приложением.",
    micErrorGeneric: "Погрешность микрофона: {name}",
    negotiationError: "Погрешность согласования",
    connectedToHost: "Соединено с хостом",
    screenShareNotSupported: "Деление екрана не поддержано в сем браузере.",
    screenSharingStartedNoAudio: "Деление екрана начато (токмо видео; браузер не дал звук екрана)",
    screenSharingStartedMicKept: "Деление екрана начато (токмо видео; микрофон оставлен действен)",
    screenSharingStartedWithAudio: "Деление екрана начато (со звуком екрана)",
    screenShareError: "Погрешность деления екрана: {details}",
    screenSharingStopped: "Деление екрана остановлено",
    hostMode: "Режим хоста: ты передаеши глас и екраны",
    waitingForHost: "Ожидание соединения хоста...",
    inVoiceRoom: "В гласовей палате",
    switchingServer: "Переход сервера...",
    joiningServer: "Соединение с сервером...",
    microphoneSwitched: "Микрофон переставлен",
    defaultMicrophoneSelected: "Избран микрофон по умолчанию",
    microphoneSwitchFailed: "Не удалось переставити микрофон: {details}",
    speakersSwitched: "Говорители переставлены",
    defaultSpeakersSelected: "Избраны говорители по умолчанию",
    promptEnterServerId: "Введи ID сервера",
    connectionError: "Погрешность соединения: {details}",
    warningHttps: "Предупреждение: на иных ПК отверзай по HTTPS, иначе доступ к микрофону можеть быти блокирован.",
  },
  la: {
    pageTitle: "Servitoria Vocis",
    ariaServersRail: "Servitoria",
    ariaSavedServers: "Servitoria servata",
    homeServerTitle: "Nuntius Vocis",
    addServerTitle: "Adde servitorium",
    appTitle: "Nuntius Vocis",
    appSubtitle: "Primus qui intrat cubiculum vocis fit moderator et vocem cum velo transmittit.",
    joinHint: "Coniunge ad servitorium electum e columna sinistra.",
    joinSelectedServer: "Coniunge ad servitorium electum",
    createServer: "Crea servitorium",
    micSensitivity: "Sensibilitas microphoni",
    leaveServer: "Exi e servitorio",
    statusLabel: "Status:",
    disconnected: "Disiunctus",
    textChannels: "Canales textus",
    voiceRooms: "Cubicula vocis",
    addVoiceRoom: "Adde cubiculum vocis",
    topbarMeta: "Colloquium servitorii + vox + vela",
    topbarMetaLobby:
      "Elige servitorium in columna sinistra et coniunge ut colloquium, cubicula vocis, et transmissiones veli aperias.",
    send: "Mitte",
    participants: "Participes",
    screenStreams: "Flumina veli",
    prev: "Prior",
    next: "Proximus",
    prevScreenStream: "Flumen veli prius",
    nextScreenStream: "Flumen veli proximum",
    profile: "Profilum",
    closeProfile: "Claude profilum",
    nickname: "Cognomen",
    yourName: "Nomen tuum",
    microphone: "Microphonum",
    speakers: "Oratores",
    theme: "Thema",
    language: "Lingua",
    motion: "Motus",
    backgroundAnimation: "Motus fundi",
    motionOff: "Nullus",
    motionCalm: "Lenis",
    motionBalanced: "Aequatus",
    motionExpressive: "Vividus",
    backgroundOff: "Nullus",
    backgroundAurora: "Aurora",
    backgroundNebula: "Nebula",
    meBadge: "EGO",
    themeMidnight: "Media nox",
    themeGraphite: "Graphites",
    themeAbyss: "Abyssus caerulea",
    themeEmber: "Carbo ardens",
    themeForest: "Silva",
    themeDaylight: "Lux diurna",
    themeTurquoiseBlack: "Turcicus / Niger",
    themeGreenBlack: "Viridis / Niger",
    themeGreenTurquoise: "Viridis / Turcicus",
    themePurpleRaspberry: "Purpureus / Rubus",
    themeBrownOrange: "Fuscus / Aureus",
    themeBlackOutline: "Niger / Limbus albus",
    themeScarlet: "Coccineus / Ruber",
    themeCrimsonOrange: "Puniceus / Aureus",
    mediaDevicesApiUnavailable: "API instrumentorum mediorum non praesto est",
    deviceSavedUnavailable: "{device} (servatum, non praesto)",
    speakerSwitchNotSupported: "Mutatio oratorum in hoc navigatore non sustinetur",
    defaultMicrophone: "Microphonum praedefinitum",
    microphoneGeneric: "Microphonum",
    defaultSpeakers: "Oratores praedefiniti",
    speakersGeneric: "Oratores",
    chatPlaceholder: "Scribe in #{room}",
    editMessage: "Emenda nuntium",
    deleteMessage: "Dele nuntium",
    confirmDeleteMessage: "Delere hunc nuntium?",
    saveEdit: "Serva",
    cancelEdit: "Cassa",
    editedLabel: "emendatum",
    editWindowExpired: "Tempus emendandi expiravit.",
    notMessageAuthor: "Solum nuntios tuos emendare potes.",
    messageNotFound: "Nuntius non inventus est.",
    joinServerFirst: "Primum coniunge ad servitorium.",
    roomSuggested: "Cubiculum {index}",
    promptVoiceRoomName: "Nomen cubiculi vocis",
    unableCreateVoiceRoom: "Cubiculum vocis creari non potest.",
    voiceRoomCreated: "Cubiculum vocis \"{name}\" creatum est.",
    promptRenameVoiceRoom: "Renomina cubiculum vocis",
    unableRenameVoiceRoom: "Cubiculum vocis renominari non potest.",
    voiceRoomRenamed: "Cubiculum vocis in \"{name}\" renominatum est.",
    confirmDeleteVoiceRoom: "Delere cubiculum vocis \"{name}\"?",
    unableDeleteVoiceRoom: "Cubiculum vocis deleri non potest.",
    voiceRoomDeleted: "Cubiculum vocis \"{name}\" deletum est.",
    ariaJoinVoiceRoom: "Coniunge ad cubiculum vocis {name}",
    ariaVoiceRoomJoinFirst: "Cubiculum vocis {name} (primum coniunge ad servitorium)",
    switchingToVoiceRoom: "Mutatur ad cubiculum vocis {name}...",
    renameVoiceRoom: "Renomina cubiculum vocis",
    deleteVoiceRoom: "Dele cubiculum vocis",
    youSuffix: "{name} (tu)",
    hostTag: "MODERATOR",
    screenTag: "VELUM",
    openServer: "Aperi servitorium {room}",
    chatEmptyJoin: "Coniunge ad servitorium ut colloqui incipias.",
    chatEmptyNoMessages: "Nondum sunt nuntii. Incipe colloquium.",
    guest: "Hospes",
    mute: "Obmutesce",
    muting: "Obmutescens...",
    unmute: "Vox redde",
    usageDlolmus: "Usus: /dlolmus on | /dlolmus off",
    dlolmusOn: "Modus experimentalis dlolmus: ON (Opus stereo + maxaveragebitrate in answer SDP)",
    dlolmusOff: "Modus experimentalis dlolmus: OFF",
    usageRn: "Usus: /rn on | /rn off",
    rnOn: "Modus RNNoise: ON (noiseSuppression/echoCancellation navigatoris deactivata)",
    rnOff: "Modus RNNoise: OFF (noiseSuppression/echoCancellation navigatoris ad normas reddita)",
    rnOnDeferred:
      "Modus RNNoise: ON (mutatio viva a navigatore reiecta; ad proximam capturam microphoni adhibebitur)",
    rnOffDeferred:
      "Modus RNNoise: OFF (mutatio viva a navigatore reiecta; norma ad proximam capturam revertetur)",
    volume: "Volumen",
    hideMyPreview: "Occulta praevisum meum",
    showMyPreview: "Ostende praevisum meum",
    youAreSharing: "Tu velum transmittis",
    userIsSharing: "{name} velum transmittit",
    pin: "Fige",
    unpin: "Solve",
    pinScreenStream: "Fige flumen veli",
    unpinScreenStream: "Solve flumen veli",
    fullscreen: "Plenum velum",
    openFullscreen: "Aperi flumen in pleno velo",
    muteAudio: "Sile sonum",
    unmuteAudio: "Redde sonum",
    muteThisScreenAudio: "Sile sonum huius veli",
    unmuteThisScreenAudio: "Redde sonum huius veli",
    musicVolume: "Volumen soni",
    noAudio: "Nullus sonus",
    stopScreenShare: "Siste communicationem veli",
    shareScreen: "Communica velum",
    leaveVoiceChannel: "Exi e voce",
    connectedToServer: "Coniunctus ad servitorium",
    notInVoiceChannel: "Nunc in cubiculo vocis non es.",
    inVoiceChannelWithName: "In voce #{name}",
    micErrorHttps: "Microphonum tantum in HTTPS (aut localhost) operatur.",
    micErrorDenied: "Accessus ad microphonum in permissionibus navigatoris negatus est.",
    micErrorNoDevice: "Nullum microphonum in hoc PC inventum est.",
    micErrorBusy: "Microphonum in alia applicatione occupatum est.",
    micErrorGeneric: "Error microphoni: {name}",
    negotiationError: "Error negotiationis",
    connectedToHost: "Coniunctus ad moderatorem",
    screenShareNotSupported: "Communicatio veli in hoc navigatore non sustinetur.",
    screenSharingStartedNoAudio: "Communicatio veli incepta est (video tantum; navigator sonum veli non dedit)",
    screenSharingStartedMicKept: "Communicatio veli incepta est (video tantum; microphonum activum mansit).",
    screenSharingStartedWithAudio: "Communicatio veli incepta est (cum sono veli)",
    screenShareError: "Error communicationis veli: {details}",
    screenSharingStopped: "Communicatio veli intermissa est",
    hostMode: "Modus moderatoris: tu vocem et vela retransmittis",
    waitingForHost: "Exspectatur connexio moderatoris...",
    inVoiceRoom: "In cubiculo vocis",
    switchingServer: "Mutatio servitorii...",
    joiningServer: "Coniungitur ad servitorium...",
    microphoneSwitched: "Microphonum mutatum est",
    defaultMicrophoneSelected: "Microphonum praedefinitum electum est",
    microphoneSwitchFailed: "Mutatio microphoni defecit: {details}",
    speakersSwitched: "Oratores mutati sunt",
    defaultSpeakersSelected: "Oratores praedefiniti electi sunt",
    promptEnterServerId: "Inser ID servitorii",
    connectionError: "Error connexionis: {details}",
    warningHttps: "Monitio: in aliis PC aperi per HTTPS, aliter petitio microphoni impediri potest.",
  },
};
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

let rtcConfig = { ...DEFAULT_RTC_CONFIG };

const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const mobileScreensQuery = window.matchMedia("(max-width: 760px)");
const SAVED_ROOMS_STORAGE_KEY = "voice_messenger_saved_rooms_v1";
const MAX_SAVED_ROOMS = 24;

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
let hiddenLocalPreview = false;
let mobileCarouselIndex = 0;
let screenSwipeStartX = null;
const chatMessages = [];
const chatMessageIds = new Set();
const pendingChatAttachments = [];
let pendingChatAttachmentSeq = 0;
let chatSubmitInProgress = false;
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

const peers = new Map();
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
const speakingStateByUserId = new Map();
const speakingUserIds = new Set();
let speakingDetectionTimer = null;
let playbackContext = null;
let micProcessingContext = null;
let micProcessingInputNode = null;
let micProcessingGainNode = null;
let micProcessingDestinationNode = null;
let lastVoiceChannelId = null;
let lastVoiceMemberIds = new Set();
let voiceCueBaselineReady = false;

function setStatus(text) {
  statusEl.textContent = text;
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

const IS_ELECTRON_RUNTIME = Boolean(window && window.desktopApp);
let activeInlineDialogClose = null;

function closeInlineDialogWithResult(result) {
  if (typeof activeInlineDialogClose === "function") {
    const closer = activeInlineDialogClose;
    activeInlineDialogClose = null;
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
  mic: "◉",
  mic_off: "⊘",
  hourglass_top: "⌛",
  present_to_all: "▣",
  stop_screen_share: "◪",
  tune: "≡",
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
  if (screenStreamsTitleEl) {
    screenStreamsTitleEl.textContent = t("screenStreams");
  }
  if (screensPrevBtn) {
    screensPrevBtn.textContent = t("prev");
    screensPrevBtn.setAttribute("aria-label", t("prevScreenStream"));
  }
  if (screensNextBtn) {
    screensNextBtn.textContent = t("next");
    screensNextBtn.setAttribute("aria-label", t("nextScreenStream"));
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
  renderPendingChatAttachments();
}

function updateTopbarMeta() {
  if (!topbarMetaEl) {
    return;
  }
  topbarMetaEl.textContent = joined ? t("topbarMeta") : t("topbarMetaLobby");
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

  if (appTitleEl) {
    appTitleEl.textContent = joined ? label : getProjectName();
  }

  if (chatRoomTitleEl) {
    chatRoomTitleEl.textContent = label;
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

  if (homeServerBtn) {
    homeServerBtn.classList.toggle("active", !joined);
  }

  savedRoomsListEl.innerHTML = "";
  for (const roomId of savedRooms) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "server-icon room-shortcut";
    button.textContent = roomBadgeLabel(roomId);
    button.title = roomId;
    button.setAttribute("aria-label", t("openServer", { room: roomId }));

    if (roomId === selectedRoomId) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => {
      roomInput.value = roomId;
      updateRoomLabels(roomId);
      renderSavedRooms();
      void requestJoinRoom(roomId);
    });

    savedRoomsListEl.appendChild(button);
  }
}

function updateChatAvailability() {
  const enabled = joined && !chatSubmitInProgress;
  document.body.classList.toggle("is-lobby-mode", !joined);
  updateTopbarMeta();
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
  if (!url || !(url.startsWith("/") || /^https?:\/\//i.test(url))) {
    return null;
  }

  return {
    id: String(attachment.id || `${Date.now()}-${index}`),
    name,
    mimeType,
    size: normalizedSize,
    url,
    previewKind: getChatAttachmentPreviewKind(mimeType),
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
    userId: String(message.userId || ""),
    userName: String(message.userName || t("guest")),
    text: normalizedText,
    attachments: normalizedAttachments,
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? Math.round(createdAt) : Date.now(),
    editedAt: Number.isFinite(editedAt) && editedAt > 0 ? Math.round(editedAt) : null,
  };
}

function buildChatAttachmentCaption(attachment) {
  const sizeLabel = attachment.size > 0 ? formatFileSize(attachment.size) : "";
  return sizeLabel ? `${attachment.name} (${sizeLabel})` : attachment.name;
}

function createChatAttachmentElement(attachment) {
  const wrapper = document.createElement("div");
  wrapper.className = "chat-attachment";

  if (attachment.previewKind === "image") {
    const link = document.createElement("a");
    link.href = attachment.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    const image = document.createElement("img");
    image.src = attachment.url;
    image.loading = "lazy";
    image.alt = t("attachmentImageLabel", { name: attachment.name });
    link.appendChild(image);
    wrapper.appendChild(link);
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
    fileLink.target = "_blank";
    fileLink.rel = "noopener noreferrer";
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

function createChatAttachmentsElement(attachments) {
  const container = document.createElement("div");
  container.className = "chat-attachments";

  for (const attachment of attachments) {
    container.appendChild(createChatAttachmentElement(attachment));
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

function getPendingChatAttachmentBytes() {
  return pendingChatAttachments.reduce((acc, item) => acc + item.size, 0);
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

  let totalBytes = getPendingChatAttachmentBytes();
  let warnedByCount = false;

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

    if (size > MAX_CHAT_ATTACHMENT_BYTES) {
      setStatus(
        t("attachmentTooLarge", {
          name,
          max: formatFileSize(MAX_CHAT_ATTACHMENT_BYTES),
        })
      );
      continue;
    }

    if (totalBytes + size > MAX_CHAT_TOTAL_ATTACHMENT_BYTES) {
      setStatus(
        t("attachmentTotalTooLarge", {
          max: formatFileSize(MAX_CHAT_TOTAL_ATTACHMENT_BYTES),
        })
      );
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
    totalBytes += size;
  }

  if (warnedByCount) {
    setStatus(t("attachmentLimitExceeded", { count: MAX_CHAT_ATTACHMENTS }));
  }

  renderPendingChatAttachments();
}

async function buildOutgoingChatAttachmentPayloads() {
  if (pendingChatAttachments.length === 0) {
    return [];
  }

  const payload = [];
  let totalBytes = 0;

  for (const attachment of pendingChatAttachments) {
    totalBytes += attachment.size;
    if (totalBytes > MAX_CHAT_TOTAL_ATTACHMENT_BYTES) {
      throw new Error(
        t("attachmentTotalTooLarge", {
          max: formatFileSize(MAX_CHAT_TOTAL_ATTACHMENT_BYTES),
        })
      );
    }

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

function canEditChatMessage(message) {
  if (!isOwnChatMessage(message)) {
    return false;
  }

  const createdAt = Number(message.createdAt);
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    return false;
  }

  return Date.now() - createdAt <= CHAT_EDIT_WINDOW_MS;
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
  const canEdit = canEditChatMessage(message);

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
      content.appendChild(createChatAttachmentsElement(message.attachments));
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

  if (!joined) {
    chatMessagesEl.appendChild(createChatWelcomeElement());
    return;
  }

  if (chatMessages.length === 0) {
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
  }

  if (activeChatEditMessageId === cleanMessageId) {
    resetChatEditState();
  }

  return true;
}

function replaceChatMessages(messages) {
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
      void optimizeAudioSender(entry.micSender);
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

async function optimizeAudioSender(sender) {
  if (
    !sender ||
    !sender.track ||
    sender.track.kind !== "audio" ||
    typeof sender.getParameters !== "function" ||
    typeof sender.setParameters !== "function"
  ) {
    return;
  }

  try {
    const params = sender.getParameters() || {};
    const encodings =
      Array.isArray(params.encodings) && params.encodings.length > 0 ? params.encodings : [{}];
    const primaryEncoding = { ...encodings[0] };

    if (
      typeof primaryEncoding.maxBitrate !== "number" ||
      primaryEncoding.maxBitrate < AUDIO_SENDER_MAX_BITRATE
    ) {
      primaryEncoding.maxBitrate = AUDIO_SENDER_MAX_BITRATE;
    }

    primaryEncoding.dtx = false;
    params.encodings = [primaryEncoding, ...encodings.slice(1)];

    await sender.setParameters(params);
  } catch {
    // Browser may not support all RTP sender tuning knobs.
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
  return userVolumes.get(userId) ?? 1;
}

function getScreenAudioVolume(userId) {
  return screenAudioVolumes.get(userId) ?? 1;
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
  const volume = clamp(value, 0, 2);
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
}

function isMobileScreensMode() {
  return mobileScreensQuery.matches;
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
  stopSpeakingDetectionLoop();
  speakingStateByUserId.clear();
  speakingUserIds.clear();
}

function cleanupSpeakingDetectionForUser(userId) {
  speakingStateByUserId.delete(userId);
  const hadSpeaking = speakingUserIds.delete(userId);
  if (hadSpeaking) {
    renderParticipants();
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
    const gate = item.isScreenAudio ? (screenMuted ? 0 : targetScreenAudioVolume) : 1;
    item.audio.volume = clamp(targetVolume * gate, 0, 1);
  }
}

function setUserVolume(userId, value) {
  const volume = clamp(value, 0, 2);
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
      input.min = "0";
      input.max = "200";
      input.step = "1";
      input.value = String(Math.round(getUserVolume(member.id) * 100));

      const value = document.createElement("span");
      value.textContent = `${input.value}%`;

      input.addEventListener("input", () => {
        value.textContent = `${input.value}%`;
        setUserVolume(member.id, Number(input.value) / 100);
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

function updatePreviewButton() {
  if (!previewBtn) {
    return;
  }

  if (!localScreenTrack) {
    previewBtn.classList.add("hidden");
    previewBtn.textContent = t("hideMyPreview");
    return;
  }

  previewBtn.classList.remove("hidden");
  previewBtn.textContent = hiddenLocalPreview ? t("showMyPreview") : t("hideMyPreview");
}

function getOrderedScreenItems() {
  const items = [];

  if (localScreenPreview && !hiddenLocalPreview && selfId) {
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

function updateScreensCarouselNav(enabled, total) {
  if (!screensCarouselNav || !screensPrevBtn || !screensNextBtn || !screensCarouselIndicator) {
    return;
  }

  if (!enabled || total <= 1) {
    screensCarouselNav.classList.add("hidden");
    screensCarouselIndicator.textContent = "";
    screensPrevBtn.disabled = true;
    screensNextBtn.disabled = true;
    return;
  }

  screensCarouselNav.classList.remove("hidden");
  screensCarouselIndicator.textContent = `${mobileCarouselIndex + 1} / ${total}`;
  screensPrevBtn.disabled = false;
  screensNextBtn.disabled = false;
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

function createScreenCard(item) {
  const wrapper = document.createElement("article");
  wrapper.className = "screen-card";
  if (item.userId === pinnedScreenUserId) {
    wrapper.classList.add("is-pinned");
  }

  const header = document.createElement("header");

  const title = document.createElement("span");
  title.className = "screen-card-title";
  title.textContent = item.title;

  const actions = document.createElement("div");
  actions.className = "screen-card-actions";
  let screenAudioControls = null;

  const pinBtn = document.createElement("button");
  pinBtn.type = "button";
  pinBtn.className = "screen-action";
  pinBtn.textContent = item.userId === pinnedScreenUserId ? t("unpin") : t("pin");
  pinBtn.setAttribute(
    "aria-label",
    item.userId === pinnedScreenUserId ? t("unpinScreenStream") : t("pinScreenStream")
  );
  pinBtn.addEventListener("click", () => {
    pinnedScreenUserId = pinnedScreenUserId === item.userId ? null : item.userId;
    mobileCarouselIndex = 0;
    renderScreens();
  });

  const fullscreenBtn = document.createElement("button");
  fullscreenBtn.type = "button";
  fullscreenBtn.className = "screen-action";
  fullscreenBtn.textContent = t("fullscreen");
  fullscreenBtn.setAttribute("aria-label", t("openFullscreen"));

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.srcObject = new MediaStream([item.track]);

  fullscreenBtn.addEventListener("click", () => {
    void enterScreenFullscreen(video);
  });

  actions.appendChild(pinBtn);
  actions.appendChild(fullscreenBtn);

  if (!item.isLocal) {
    const hasScreenAudio = hasScreenAudioTrack(item.userId);
    const muteBtnEl = document.createElement("button");
    muteBtnEl.type = "button";
    muteBtnEl.className = "screen-action";
    const muted = isScreenAudioMuted(item.userId);
    muteBtnEl.textContent = muted ? t("unmuteAudio") : t("muteAudio");
    muteBtnEl.setAttribute(
      "aria-label",
      muted ? t("unmuteThisScreenAudio") : t("muteThisScreenAudio")
    );
    muteBtnEl.addEventListener("click", () => {
      setScreenAudioMuted(item.userId, !muted);
      renderScreens();
    });
    muteBtnEl.disabled = !hasScreenAudio;
    actions.appendChild(muteBtnEl);

    screenAudioControls = document.createElement("label");
    screenAudioControls.className = "screen-audio-controls";

    const volumeLabel = document.createElement("span");
    volumeLabel.className = "screen-audio-label";
    volumeLabel.textContent = t("musicVolume");

    const volumeRange = document.createElement("input");
    volumeRange.type = "range";
    volumeRange.min = "0";
    volumeRange.max = "200";
    volumeRange.step = "1";
    volumeRange.value = String(Math.round(getScreenAudioVolume(item.userId) * 100));
    volumeRange.disabled = !hasScreenAudio;

    const volumeValue = document.createElement("strong");
    volumeValue.className = "screen-audio-value";
    volumeValue.textContent = hasScreenAudio ? `${volumeRange.value}%` : t("noAudio");

    volumeRange.addEventListener("input", () => {
      volumeValue.textContent = `${volumeRange.value}%`;
      setScreenAudioVolume(item.userId, Number(volumeRange.value) / 100);
    });

    screenAudioControls.appendChild(volumeLabel);
    screenAudioControls.appendChild(volumeRange);
    screenAudioControls.appendChild(volumeValue);
  }

  header.appendChild(title);
  header.appendChild(actions);
  wrapper.appendChild(header);
  wrapper.appendChild(video);
  if (screenAudioControls) {
    wrapper.appendChild(screenAudioControls);
  }

  video.play().catch(() => {
    // Browser may delay playback until user gesture.
  });

  return wrapper;
}

function renderScreens() {
  const items = getOrderedScreenItems();

  if (pinnedScreenUserId && !items.some((item) => item.userId === pinnedScreenUserId)) {
    pinnedScreenUserId = null;
  }

  const useCarousel = isMobileScreensMode() && items.length > 1;

  if (items.length === 0) {
    screensContainer.classList.remove("is-carousel");
    screensContainer.innerHTML = "";
    mobileCarouselIndex = 0;
    updateScreensCarouselNav(false, 0);
    return;
  }

  if (!useCarousel) {
    mobileCarouselIndex = 0;
  }

  mobileCarouselIndex = clamp(mobileCarouselIndex, 0, Math.max(0, items.length - 1));
  const visibleItems = useCarousel ? [items[mobileCarouselIndex]] : items;

  screensContainer.classList.toggle("is-carousel", useCarousel);
  screensContainer.innerHTML = "";

  for (const item of visibleItems) {
    screensContainer.appendChild(createScreenCard(item));
  }

  updateScreensCarouselNav(useCarousel, items.length);
}

function stepMobileCarousel(step) {
  const items = getOrderedScreenItems();
  if (!isMobileScreensMode() || items.length <= 1) {
    return;
  }

  mobileCarouselIndex = (mobileCarouselIndex + step + items.length) % items.length;
  renderScreens();
}

function toggleLocalScreenPreviewVisibility() {
  if (!localScreenTrack) {
    return;
  }

  hiddenLocalPreview = !hiddenLocalPreview;
  if (hiddenLocalPreview && pinnedScreenUserId === selfId) {
    pinnedScreenUserId = null;
  }

  updatePreviewButton();
  renderScreens();
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

  hiddenLocalPreview = false;
  if (selfId) {
    markScreenStarted(selfId);
  }
  localScreenPreview = { track };
  renderScreens();
  updatePreviewButton();
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
  updatePreviewButton();
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
  updatePreviewButton();
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

    if (!current) {
      const transceiver = entry.pc.addTransceiver(info.track, {
        direction: "sendonly",
      });
      const sender = transceiver.sender;
      if (info.track.kind === "audio") {
        applyPreferredAudioCodecsToTransceiver(transceiver, true);
        void optimizeAudioSender(sender);
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

function createPeerConnection(peerId) {
  const pc = new RTCPeerConnection(rtcConfig);

  const entry = {
    pc,
    makingOffer: false,
    offerQueued: false,
    needsOffer: false,
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
      if (entry.disconnectTimer) {
        clearTimeout(entry.disconnectTimer);
        entry.disconnectTimer = null;
      }
      return;
    }

    if (state === "disconnected") {
      if (!entry.disconnectTimer) {
        entry.disconnectTimer = setTimeout(() => {
          entry.disconnectTimer = null;
          const current = peers.get(peerId);
          if (!current || current.pc.connectionState !== "disconnected") {
            return;
          }
          closePeer(peerId);
        }, PEER_DISCONNECT_GRACE_MS);
      }
      return;
    }

    if (entry.disconnectTimer) {
      clearTimeout(entry.disconnectTimer);
      entry.disconnectTimer = null;
    }

    if (state === "failed" || state === "closed") {
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
      void optimizeAudioSender(micSender);
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
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);

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

function offerPeer(peerId) {
  if (!joined || !isHost || peerId === selfId) {
    return;
  }

  if (!peers.has(peerId)) {
    createPeerConnection(peerId);
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

  if (localScreenTrack && entry.screenSender) {
    entry.screenSender.replaceTrack(localScreenTrack).catch(() => {
      // no-op
    });
  }

  if (localScreenAudioTrack && entry.screenAudioSender) {
    applyVoiceTrackHints(localScreenAudioTrack);
    entry.screenAudioSender.replaceTrack(localScreenAudioTrack).catch(() => {
      // no-op
    });
    void optimizeAudioSender(entry.screenAudioSender);
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

async function startScreenShare() {
  if (!joined) {
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

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0] || null;
    let startedVideoOnlyToKeepMic = false;

    if (!videoTrack) {
      throw new Error("No video track from display");
    }

    localScreenStream = stream;
    localScreenTrack = videoTrack;
    localScreenAudioTrack = audioTrack;
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
      const hostId = roomState?.hostId;
      const entry = hostId ? peers.get(hostId) : null;

      if (!entry || !entry.screenSender) {
        throw new Error("Screen sender is not ready yet. Rejoin server and try again.");
      }

      await entry.screenSender.replaceTrack(videoTrack);
      const canSendScreenAudio =
        Boolean(entry.screenAudioSender) &&
        (!entry.micSender || entry.screenAudioSender !== entry.micSender);

      if (canSendScreenAudio && entry.screenAudioSender) {
        if (audioTrack) {
          applyVoiceTrackHints(audioTrack);
        }
        await entry.screenAudioSender.replaceTrack(audioTrack || null);
        if (audioTrack) {
          void optimizeAudioSender(entry.screenAudioSender);
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

      if (audioTrack && !sentScreenAudioTrackId) {
        startedVideoOnlyToKeepMic = true;
      }
    }

    updateScreenButton();
    if (!audioTrack) {
      setStatus(t("screenSharingStartedNoAudio"));
    } else if (startedVideoOnlyToKeepMic) {
      setStatus(t("screenSharingStartedMicKept"));
    } else {
      setStatus(t("screenSharingStartedWithAudio"));
    }
  } catch (error) {
    setStatus(t("screenShareError", { details: error?.message || error?.name || "UnknownError" }));

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
    removeLocalScreenPreview();
    updateScreenButton();
  }
}

async function stopScreenShare(fromEnded = false) {
  const activeVideoTrack = localScreenTrack;
  const activeAudioTrack = localScreenAudioTrack;
  const activeStream = localScreenStream;

  if (!activeVideoTrack && !activeAudioTrack && !activeStream) {
    updateScreenButton();
    return;
  }

  localScreenTrack = null;
  localScreenAudioTrack = null;
  localScreenStream = null;
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
    const removedScreenAudioTrackId = canSendScreenAudio ? activeAudioTrack?.id || null : null;

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
  }

  updateScreenButton();
  setStatus(t("screenSharingStopped"));
}

async function becomeHost() {
  if (!joined || !selfId) {
    return;
  }

  if (isHost) {
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
  sourceMedia.clear();
  screenAudioTrackIdsBySource.clear();

  for (const peerId of Array.from(peers.keys())) {
    closePeer(peerId, true);
  }

  clearAllRemoteMedia();
  clearForwardTrackMaps();

  isHost = false;

  if (nextHostId) {
    setStatus(t("waitingForHost"));
  } else {
    setStatus(t("inVoiceRoom"));
  }
}

function becomeServerOnly() {
  sourceMedia.clear();
  screenAudioTrackIdsBySource.clear();

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

  for (const peerId of Array.from(peers.keys())) {
    closePeer(peerId, true);
  }

  sourceMedia.clear();
  screenAudioTrackIdsBySource.clear();
  screenAudioVolumes.clear();
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
  pinnedScreenUserId = null;
  hiddenLocalPreview = false;
  mobileCarouselIndex = 0;
  screenSwipeStartX = null;
  mutedScreenUserIds.clear();
  screenStartedAtByUserId.clear();

  isMuted = false;
  updateMuteButtonLabel();
  updateScreenButton();
  if (roomInput) {
    roomInput.value = "";
  }

  controls.classList.add("hidden");
  joinForm.classList.remove("hidden");
  participantsList.innerHTML = "";
  screensContainer.innerHTML = "";
  screensContainer.classList.remove("is-carousel");
  updateScreensCarouselNav(false, 0);
  replaceChatMessages([]);
  chatSubmitInProgress = false;
  clearPendingChatAttachments();
  updateChatAvailability();
  updateRoomLabels(MAIN_PAGE_LABEL);
  renderVoiceChannels();
  renderSavedRooms();

  setStatus(t("disconnected"));
}

async function requestJoinRoom(targetRoomId = null) {
  const roomId = normalizeRoomIdValue(targetRoomId ?? roomInput.value);
  if (!roomId || roomId.toLowerCase() === MAIN_PAGE_LABEL) {
    setStatus(t("joinServerFirst"));
    return;
  }
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

if (profileCloseBtn) {
  profileCloseBtn.addEventListener("click", () => {
    setProfilePanelOpen(false);
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

    let attachments = [];
    if (hasAttachments) {
      try {
        chatSubmitInProgress = true;
        updateChatAvailability();
        attachments = await buildOutgoingChatAttachmentPayloads();
      } catch (error) {
        setStatus(error?.message || t("chatSendFailed"));
        return;
      } finally {
        chatSubmitInProgress = false;
        updateChatAvailability();
      }
    }

    socket.emit("chat-message", { text, attachments });
    chatInput.value = "";
    clearPendingChatAttachments();
    chatInput.focus();
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

if (previewBtn) {
  previewBtn.addEventListener("click", () => {
    toggleLocalScreenPreviewVisibility();
  });
}

if (screensPrevBtn) {
  screensPrevBtn.addEventListener("click", () => {
    stepMobileCarousel(-1);
  });
}

if (screensNextBtn) {
  screensNextBtn.addEventListener("click", () => {
    stepMobileCarousel(1);
  });
}

const handleScreensViewportChange = () => {
  mobileCarouselIndex = 0;
  renderScreens();
};

if (typeof mobileScreensQuery.addEventListener === "function") {
  mobileScreensQuery.addEventListener("change", handleScreensViewportChange);
} else if (typeof mobileScreensQuery.addListener === "function") {
  mobileScreensQuery.addListener(handleScreensViewportChange);
}

screensContainer.addEventListener(
  "touchstart",
  (event) => {
    if (!isMobileScreensMode() || getOrderedScreenItems().length <= 1) {
      screenSwipeStartX = null;
      return;
    }

    const point = event.changedTouches?.[0];
    screenSwipeStartX = point ? point.clientX : null;
  },
  { passive: true }
);

screensContainer.addEventListener(
  "touchend",
  (event) => {
    if (screenSwipeStartX === null) {
      return;
    }

    const point = event.changedTouches?.[0];
    const endX = point ? point.clientX : null;
    if (endX === null) {
      screenSwipeStartX = null;
      return;
    }

    const delta = endX - screenSwipeStartX;
    screenSwipeStartX = null;

    if (Math.abs(delta) < 40) {
      return;
    }

    stepMobileCarousel(delta < 0 ? 1 : -1);
  },
  { passive: true }
);

leaveBtn.addEventListener("click", async () => {
  if (localScreenTrack) {
    await stopScreenShare(false);
  }

  if (joined) {
    socket.emit("leave-room");
  }

  resetSessionState();
});

socket.on("joined-room", async ({ room, selfId: incomingSelfId }) => {
  selfId = incomingSelfId;
  roomState = room;
  joined = true;
  setVoiceCueBaselineFromRoom(room);

  joinForm.classList.add("hidden");
  controls.classList.remove("hidden");
  updateChatAvailability();
  updateRoomLabels(room.id);
  renderVoiceChannels();
  replaceChatMessages(room.messages);
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

socket.on("room-state", async (room) => {
  const previousHostId = roomState?.hostId || null;
  if (joined && selfId) {
    processVoiceRoomCueDiff(room);
  }

  roomState = room;
  updateRoomLabels(room.id);
  renderVoiceChannels();
  renderSavedRooms();

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
  closePeer(peerId);
  clearTrackMappingsForSource(peerId);
  removeVoiceTrack(peerId);
  removeScreenTrack(peerId);
  renderParticipants();
});

socket.on("chat-message", (message) => {
  upsertChatMessage(message);
  renderChat();
});

socket.on("chat-message-updated", (message) => {
  upsertChatMessage(message);
  renderChat();
});

socket.on("chat-message-deleted", ({ messageId } = {}) => {
  removeChatMessageById(messageId);
  renderChat();
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
applyTheme(preferredThemeId, { persist: false });
applyLanguage(preferredLanguageId, { persist: false, rerender: false });
applyMotionProfile(preferredMotionProfileId, { persist: false });
applyBackgroundAnimation(preferredBackgroundAnimationId, { persist: false });
void initializeMaterialIcons();
if (nameInput) {
  nameInput.value = loadStoredProfileName();
  persistProfileName();
}
setProfilePanelOpen(false);
micSensitivity = loadMicSensitivity();
syncMicSensitivityUi();
void refreshProfileDeviceSelectors();

if (hasOpusCodec && hasRedCodec) {
  console.info("Audio codec preference active: Opus + RED");
} else if (hasOpusCodec) {
  console.info("Audio codec preference active: Opus (RED is not available in this browser)");
} else {
  console.warn("Audio codec preference fallback: Opus codec is not exposed in capabilities");
}
console.info(`Experimental command available: ${DLOLMUS_COMMAND_PREFIX} on|off`);
console.info(`RNNoise command available: ${RN_COMMAND_PREFIX} on|off`);

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
