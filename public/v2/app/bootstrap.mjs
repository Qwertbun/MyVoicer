import { createStore, createInitialState } from "./state/store.mjs";
import { createProtocolClient } from "./protocol-client/ws-client.mjs";
import { createMediaEngine } from "./media-engine/index.mjs";
import { createChatEngine } from "./chat-engine/index.mjs";
import { createUiRenderer } from "./ui-renderer/index.mjs";
import { createCommands } from "./commands/index.mjs";

function byId(id) {
  return document.getElementById(id);
}

function byIds(...ids) {
  for (const id of ids) {
    if (!id) {
      continue;
    }
    const element = byId(id);
    if (element) {
      return element;
    }
  }
  return null;
}

function normalizeString(value, maxLength = 256) {
  return String(value || "").trim().slice(0, maxLength);
}

export function createBootstrap() {
  const elements = {
    roomInput: byIds("room-input"),
    nameInput: byIds("name-input"),
    roomKeyInput: byIds("room-key-input"),
    joinForm: byIds("join-form"),
    joinBtn: byIds("join-selected-btn", "join-btn"),
    leaveBtn: byIds("leave-btn"),
    voiceChannelList: byIds("voice-channels-list", "voice-channel-list"),
    voiceChannelNameInput: byIds("voice-channel-name-input"),
    createChannelBtn: byIds("add-voice-channel-btn", "create-channel-btn"),
    startMicBtn: byIds("start-mic-btn"),
    muteMicBtn: byIds("mute-btn", "mute-mic-btn"),
    stopMicBtn: byIds("leave-voice-btn"),
    chatList: byIds("chat-list", "chat-messages"),
    chatForm: byIds("chat-form"),
    chatInput: byIds("chat-input"),
    participantList: byIds("participant-list", "participants"),
    statusChip: byIds("status-chip", "status"),
    runtimeChip: byIds("runtime-chip", "topbar-network-mode"),
    topbarVoiceState: byIds("topbar-voice-state"),
    roomLabel: byIds("channel-room-label"),
    roomTitle: byIds("chat-room-title"),
    controlsWrap: byIds("controls"),
    joinFormHint: byIds("join-form-hint"),
    profilePanel: byIds("profile-panel"),
    profileToggleBtn: byIds("profile-toggle-btn"),
    topbarProfileBtn: byIds("topbar-profile-btn"),
    profileCloseBtn: byIds("profile-close-btn"),
    micSensitivityToggleBtn: byIds("mic-sensitivity-toggle-btn"),
    micSensitivityPopover: byIds("mic-sensitivity-popover"),
    profileTabs: Array.from(document.querySelectorAll("[data-settings-tab-target]")),
    settingsPanels: Array.from(document.querySelectorAll("[data-settings-tab-panel]")),
  };

  if (elements.roomInput && !normalizeString(elements.roomInput.value, 32)) {
    elements.roomInput.value = "main";
  }
  if (elements.roomKeyInput && !normalizeString(elements.roomKeyInput.value, 128)) {
    elements.roomKeyInput.value = "synto-v2";
  }

  const store = createStore(createInitialState());

  const protocolClient = createProtocolClient({
    onConnectionChange(connected) {
      store.setState({
        connected,
        status: connected ? "Connected to V2 backend." : "Disconnected",
      });
    },
    onEvent(event) {
      const { type, payload } = event;

      if (type === "connection.ready") {
        store.setState({
          selfId: normalizeString(payload.connectionId, 96),
          runtimeVersion: "v2",
          status: "Connection ready.",
        });
        return;
      }

      if (type === "room.state") {
        const room = payload.room;
        if (!room || typeof room !== "object") {
          return;
        }

        const state = store.getState();
        const selfEntry = Array.isArray(room.members)
          ? room.members.find((member) => normalizeString(member.id, 96) === state.selfId)
          : null;

        store.setState({
          roomId: normalizeString(room.id, 32),
          participants: Array.isArray(room.members) ? room.members : [],
          voiceChannels: Array.isArray(room.voiceChannels) ? room.voiceChannels : [],
          activeVoiceChannelId: normalizeString(selfEntry?.channelId, 40),
        });
        return;
      }

      if (type === "chat.message") {
        void chatEngine.handleIncomingEnvelope(payload);
        return;
      }

      if (type === "chat.history.chunk") {
        const envelopes = Array.isArray(payload.envelopes) ? payload.envelopes : [];
        for (const envelope of envelopes) {
          void chatEngine.handleIncomingEnvelope({
            sourceId: envelope?.senderId,
            envelope,
          });
        }
        return;
      }

      if (type === "chat.updated") {
        store.setState({ status: "Encrypted message updated." });
        return;
      }

      if (type === "chat.deleted") {
        const messageId = normalizeString(payload.messageId, 96);
        if (!messageId) {
          return;
        }

        store.setState((prevState) => ({
          chatMessages: prevState.chatMessages.filter((item) => String(item.id) !== messageId),
          status: "Encrypted message deleted.",
        }));
      }
    },
  });

  const mediaEngine = createMediaEngine({ store });
  const chatEngine = createChatEngine({
    store,
    protocolClient,
  });

  const commands = createCommands({
    store,
    protocolClient,
    chatEngine,
    mediaEngine,
    elements,
  });

  const uiRenderer = createUiRenderer({
    store,
    elements,
  });

  function bindLegacyMenus() {
    const tabs = Array.isArray(elements.profileTabs) ? elements.profileTabs : [];
    const panels = Array.isArray(elements.settingsPanels) ? elements.settingsPanels : [];

    if (tabs.length > 0 && panels.length > 0) {
      const activateTab = (target) => {
        const tabName = normalizeString(target, 24).toLowerCase();
        for (const tab of tabs) {
          const isActive = tab.dataset.settingsTabTarget === tabName;
          tab.classList.toggle("active", isActive);
          tab.setAttribute("aria-selected", isActive ? "true" : "false");
        }

        for (const panel of panels) {
          const isActive = panel.dataset.settingsTabPanel === tabName;
          panel.classList.toggle("hidden", !isActive);
        }
      };

      for (const tab of tabs) {
        tab.addEventListener("click", () => {
          activateTab(tab.dataset.settingsTabTarget || "");
        });
      }
    }

    const profilePanel = elements.profilePanel;
    const profileToggle = elements.profileToggleBtn;
    const topbarProfile = elements.topbarProfileBtn;
    const profileClose = elements.profileCloseBtn;

    if (profilePanel) {
      const setProfileOpen = (nextOpen) => {
        const open = Boolean(nextOpen);
        profilePanel.classList.toggle("hidden", !open);
        profilePanel.setAttribute("aria-hidden", open ? "false" : "true");
        profileToggle?.classList.toggle("active", open);
        profileToggle?.setAttribute("aria-expanded", open ? "true" : "false");
        topbarProfile?.setAttribute("aria-expanded", open ? "true" : "false");
      };

      profileToggle?.addEventListener("click", () => {
        setProfileOpen(profilePanel.classList.contains("hidden"));
      });

      topbarProfile?.addEventListener("click", () => {
        setProfileOpen(profilePanel.classList.contains("hidden"));
      });

      profileClose?.addEventListener("click", () => {
        setProfileOpen(false);
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          setProfileOpen(false);
        }
      });
    }

    const sensitivityToggle = elements.micSensitivityToggleBtn;
    const sensitivityPopover = elements.micSensitivityPopover;
    if (sensitivityToggle && sensitivityPopover) {
      const setPopoverOpen = (nextOpen) => {
        const open = Boolean(nextOpen);
        sensitivityPopover.classList.toggle("hidden", !open);
        sensitivityToggle.setAttribute("aria-expanded", open ? "true" : "false");
      };

      sensitivityToggle.addEventListener("click", (event) => {
        event.preventDefault();
        setPopoverOpen(sensitivityPopover.classList.contains("hidden"));
      });

      document.addEventListener("click", (event) => {
        if (!(event.target instanceof Element)) {
          return;
        }
        if (sensitivityToggle.contains(event.target) || sensitivityPopover.contains(event.target)) {
          return;
        }
        setPopoverOpen(false);
      });
    }
  }

  function bindEvents() {
    bindLegacyMenus();

    elements.joinForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      void commands.joinRoom();
    });

    const joinHandledBySubmit = Boolean(elements.joinForm && elements.joinBtn && elements.joinForm.contains(elements.joinBtn));
    if (!joinHandledBySubmit) {
      elements.joinBtn?.addEventListener("click", () => {
        void commands.joinRoom();
      });
    }

    elements.leaveBtn?.addEventListener("click", () => {
      void commands.leaveRoom();
    });

    elements.createChannelBtn?.addEventListener("click", () => {
      void commands.createVoiceChannel();
    });

    elements.startMicBtn?.addEventListener("click", () => {
      void commands.startMic();
    });

    elements.muteMicBtn?.addEventListener("click", () => {
      void commands.toggleMute();
    });

    elements.stopMicBtn?.addEventListener("click", () => {
      void commands.stopMic();
    });

    elements.chatForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      void commands.sendChatFromInput();
    });
  }

  function start() {
    const baseUrl = window.location.origin;
    protocolClient.connect(baseUrl);
    bindEvents();
    const unsubscribe = uiRenderer.mount();

    return () => {
      unsubscribe();
      protocolClient.close();
      chatEngine.dispose();
      mediaEngine.stopLocalMic().catch(() => {});
    };
  }

  return {
    start,
  };
}
