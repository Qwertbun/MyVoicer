function getInitials(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "?";
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
}

function formatChatTimestamp(value) {
  const date = new Date(Number(value) || Date.now());
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function createUiRenderer({ store, elements }) {
  function render(state) {
    const roomName = state.roomId || "main";
    const hasActiveRoom = Boolean(String(state.roomId || "").trim());
    const statusText = state.connected
      ? state.status || "Connected"
      : state.status || "Disconnected";

    if (elements.statusChip) {
      elements.statusChip.textContent = statusText;
    }

    if (elements.runtimeChip) {
      const runtimeLabel = String(state.runtimeVersion || "v2").toUpperCase();
      elements.runtimeChip.textContent = elements.runtimeChip.id === "topbar-network-mode"
        ? runtimeLabel
        : `runtime: ${runtimeLabel.toLowerCase()}`;
    }

    if (elements.topbarVoiceState) {
      const muteState = state.localMicMuted ? " • muted" : "";
      elements.topbarVoiceState.textContent = hasActiveRoom
        ? `Connected${muteState}`
        : "Disconnected";
    }

    if (elements.roomLabel) {
      elements.roomLabel.textContent = roomName;
    }
    if (elements.roomTitle) {
      elements.roomTitle.textContent = roomName;
    }
    if (elements.chatInput) {
      elements.chatInput.placeholder = `Write to #${roomName}`;
      elements.chatInput.disabled = !hasActiveRoom;
    }
    if (elements.controlsWrap) {
      elements.controlsWrap.classList.toggle("hidden", !hasActiveRoom);
    }
    if (elements.joinFormHint) {
      elements.joinFormHint.textContent = hasActiveRoom
        ? `Connected to #${roomName}.`
        : "Connect to room to enable chat and voice controls.";
    }

    if (elements.voiceChannelList) {
      elements.voiceChannelList.innerHTML = "";

      const memberNameById = new Map();
      for (const participant of state.participants) {
        memberNameById.set(String(participant.id || ""), String(participant.name || "Guest"));
      }

      for (const channel of state.voiceChannels) {
        const block = document.createElement("div");
        block.className = "voice-room-block";
        if (state.activeVoiceChannelId === channel.id) {
          block.classList.add("active");
        }

        const row = document.createElement("div");
        row.className = "voice-room-row";

        const channelButton = document.createElement("button");
        channelButton.type = "button";
        channelButton.className = "voice-channel-item";
        if (state.activeVoiceChannelId === channel.id) {
          channelButton.classList.add("active");
        }

        const icon = document.createElement("span");
        icon.className = "voice-channel-icon";
        icon.textContent = "🔊";

        const name = document.createElement("span");
        name.className = "voice-channel-name";
        name.textContent = `${channel.name} #${channel.id}`;

        const count = document.createElement("span");
        count.className = "voice-channel-count";
        count.textContent = String(Array.isArray(channel.members) ? channel.members.length : 0);

        channelButton.appendChild(icon);
        channelButton.appendChild(name);
        channelButton.appendChild(count);
        row.appendChild(channelButton);
        block.appendChild(row);

        const membersList = document.createElement("ul");
        membersList.className = "voice-room-members";

        const memberIds = Array.isArray(channel.members) ? channel.members : [];
        if (memberIds.length === 0) {
          const empty = document.createElement("li");
          empty.className = "voice-room-member";
          empty.textContent = "No one connected";
          membersList.appendChild(empty);
        } else {
          for (const memberId of memberIds) {
            const item = document.createElement("li");
            item.className = "voice-room-member";
            if (String(memberId) === String(state.selfId || "")) {
              item.classList.add("is-self");
            }

            const avatar = document.createElement("span");
            avatar.className = "voice-room-avatar";
            avatar.textContent = getInitials(memberNameById.get(String(memberId)) || "Guest");

            const title = document.createElement("div");
            title.className = "voice-room-member-name";
            title.textContent = memberNameById.get(String(memberId)) || "Guest";
            title.title = String(memberId || "");

            item.appendChild(avatar);
            item.appendChild(title);

            if (String(memberId) === String(state.selfId || "")) {
              const tag = document.createElement("span");
              tag.className = "voice-room-member-tag";
              tag.textContent = "YOU";
              item.appendChild(tag);
            }
            membersList.appendChild(item);
          }
        }

        block.appendChild(membersList);
        elements.voiceChannelList.appendChild(block);
      }

      if (state.voiceChannels.length === 0) {
        const placeholder = document.createElement("div");
        placeholder.className = "voice-room-member";
        placeholder.textContent = "No voice rooms yet";
        elements.voiceChannelList.appendChild(placeholder);
      }
    }

    if (elements.participantList) {
      elements.participantList.innerHTML = "";
      for (const participant of state.participants) {
        const item = document.createElement("li");
        const channelSuffix = participant.channelId ? ` • #${participant.channelId}` : "";
        const selfSuffix = String(participant.id || "") === String(state.selfId || "") ? " (you)" : "";
        item.textContent = `${participant.name}${channelSuffix}${selfSuffix}`;
        elements.participantList.appendChild(item);
      }
      if (state.participants.length === 0) {
        const empty = document.createElement("li");
        empty.textContent = "No participants";
        elements.participantList.appendChild(empty);
      }
    }

    if (elements.chatList) {
      elements.chatList.innerHTML = "";
      if (state.chatMessages.length === 0) {
        const empty = document.createElement("li");
        empty.className = "chat-empty";
        empty.textContent = "No messages yet. Join room and send encrypted message.";
        elements.chatList.appendChild(empty);
      }

      for (const message of state.chatMessages) {
        const row = document.createElement("div");
        row.className = "chat-message";

        const when = formatChatTimestamp(message.createdAt);

        const avatar = document.createElement("div");
        avatar.className = "chat-avatar";
        avatar.textContent = getInitials(message.sourceId);

        const content = document.createElement("div");
        content.className = "chat-content";

        const meta = document.createElement("div");
        meta.className = "chat-meta";

        const metaPrimary = document.createElement("div");
        metaPrimary.className = "chat-meta-primary";

        const author = document.createElement("span");
        author.className = "chat-author";
        author.textContent = String(message.sourceId || "unknown");

        const time = document.createElement("span");
        time.className = "chat-time";
        time.textContent = when;

        const text = document.createElement("p");
        text.className = "chat-text";
        text.textContent = String(message.text || "");

        metaPrimary.appendChild(author);
        metaPrimary.appendChild(time);
        meta.appendChild(metaPrimary);
        content.appendChild(meta);
        content.appendChild(text);
        row.appendChild(avatar);
        row.appendChild(content);
        elements.chatList.appendChild(row);
      }
      elements.chatList.scrollTop = elements.chatList.scrollHeight;
    }
  }

  return {
    mount() {
      render(store.getState());
      return store.subscribe((state) => {
        render(state);
      });
    },
  };
}
