function normalizeString(value, maxLength = 128) {
  return String(value || "").trim().slice(0, maxLength);
}

function promptValue(message, fallback = "") {
  if (typeof window?.prompt !== "function") {
    return normalizeString(fallback, 128);
  }

  const raw = window.prompt(message, fallback);
  return normalizeString(raw, 128);
}

export function createCommands({ store, protocolClient, chatEngine, mediaEngine, elements }) {
  async function joinRoom() {
    let roomId = normalizeString(elements.roomInput?.value, 32);
    const name = normalizeString(elements.nameInput?.value, 32) || "Guest";
    const roomKey = normalizeString(elements.roomKeyInput?.value, 128) || "synto-v2";

    if (!roomId) {
      roomId = promptValue("Room ID", "main").slice(0, 32);
    }

    if (!roomId) {
      store.setState({ status: "Room ID required." });
      return;
    }

    if (elements.roomInput) {
      elements.roomInput.value = roomId;
    }

    const response = await protocolClient.send("room.join", {
      roomId,
      name,
      authorId: crypto.randomUUID(),
    });

    if (!response.ok) {
      store.setState({ status: `Join failed: ${response.errorCode || "unknown"}` });
      return;
    }

    const room = response.data?.room;
    store.setState({
      roomId,
      profileName: name,
      roomKey,
      selfId: response.data?.selfId || "",
      status: `Joined room #${roomId}`,
      participants: Array.isArray(room?.members) ? room.members : [],
      voiceChannels: Array.isArray(room?.voiceChannels) ? room.voiceChannels : [],
      chatMessages: Array.isArray(room?.messages)
        ? room.messages.map((item) => ({
            id: item.messageId,
            sourceId: item.senderId,
            text: "[encrypted history item]",
            createdAt: item.createdAt,
          }))
        : [],
    });

    await protocolClient.send("relay.capability.request", { roomId });
    await protocolClient.send("chat.history.request", { roomId, limit: 500 });
  }

  async function leaveRoom() {
    const response = await protocolClient.send("room.leave", {});
    if (!response.ok) {
      store.setState({ status: `Leave failed: ${response.errorCode || "unknown"}` });
      return;
    }

    store.setState({
      roomId: "",
      participants: [],
      voiceChannels: [],
      activeVoiceChannelId: "",
      chatMessages: [],
      status: "Left room.",
    });
  }

  async function sendChatFromInput() {
    const text = normalizeString(elements.chatInput?.value, 1200);
    if (!text) {
      return;
    }

    const ok = await chatEngine.sendEncryptedMessage(text);
    if (ok && elements.chatInput) {
      elements.chatInput.value = "";
    }
  }

  async function createVoiceChannel() {
    let name = normalizeString(elements.voiceChannelNameInput?.value, 40);
    if (!name) {
      name = promptValue("Voice room name", "Room").slice(0, 40);
    }

    if (!name) {
      store.setState({ status: "Voice room name required." });
      return;
    }

    if (elements.voiceChannelNameInput) {
      elements.voiceChannelNameInput.value = "";
    }

    const response = await protocolClient.send("voice.createChannel", {
      name,
    });

    if (!response.ok) {
      store.setState({ status: `Create channel failed: ${response.errorCode || "unknown"}` });
      return;
    }

    store.setState({ status: `Created voice channel ${response.data?.channelId || ""}` });
  }

  async function startMic() {
    await mediaEngine.startLocalMic();
  }

  async function stopMic() {
    await mediaEngine.stopLocalMic();
  }

  async function toggleMute() {
    const currentMuted = Boolean(store.getState().localMicMuted);
    if (!store.getState().localMicActive) {
      const started = await mediaEngine.startLocalMic();
      if (!started) {
        return;
      }
    }
    mediaEngine.setMicMuted(!currentMuted);
  }

  return {
    joinRoom,
    leaveRoom,
    sendChatFromInput,
    createVoiceChannel,
    startMic,
    stopMic,
    toggleMute,
  };
}
