(function initRuntimeSocket(globalScope) {
  "use strict";

  const RECONNECT_DELAY_MS = 800;

  function installFoundationPreloadShims() {
    if (typeof globalScope.loadOrCreateChatAuthorId === "function") {
      return;
    }

    globalScope.loadOrCreateChatAuthorId = function loadOrCreateChatAuthorIdShim() {
      const storageKey = "voice_chat_author_id_v1";
      const normalize = (value) => String(value || "")
        .trim()
        .toLowerCase()
        .slice(0, 64);

      try {
        const stored = normalize(localStorage.getItem(storageKey));
        if (/^[a-z0-9][a-z0-9_-]{7,63}$/.test(stored)) {
          return stored;
        }
      } catch {
        // no-op
      }

      const generated = normalize(
        `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 11)}`
      );

      try {
        if (generated) {
          localStorage.setItem(storageKey, generated);
        }
      } catch {
        // no-op
      }

      return generated || `u${Math.random().toString(36).slice(2, 12)}`;
    };
  }

  function normalizeString(value, maxLength) {
    return String(value || "").trim().slice(0, Number(maxLength) || 256);
  }

  function createRequestId(prefix) {
    return `${String(prefix || "v2")}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function toErrorText(response) {
    return normalizeString(
      response?.errorCode || response?.error || response?.message || "unknown_error",
      240
    );
  }

  function createEventEmitter() {
    const listeners = new Map();

    function on(eventName, handler) {
      const event = normalizeString(eventName, 96);
      if (!event || typeof handler !== "function") {
        return;
      }

      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event).add(handler);
    }

    function off(eventName, handler) {
      const event = normalizeString(eventName, 96);
      if (!event || !listeners.has(event)) {
        return;
      }
      listeners.get(event).delete(handler);
      if (listeners.get(event).size === 0) {
        listeners.delete(event);
      }
    }

    function once(eventName, handler) {
      if (typeof handler !== "function") {
        return;
      }

      const wrapper = (payload) => {
        off(eventName, wrapper);
        handler(payload);
      };
      on(eventName, wrapper);
    }

    function emit(eventName, payload) {
      const event = normalizeString(eventName, 96);
      if (!event || !listeners.has(event)) {
        return;
      }

      const handlers = Array.from(listeners.get(event));
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (error) {
          console.error("[v2/socket] event handler failed", event, error);
        }
      }
    }

    return { on, off, once, emit };
  }

  function createProtocolClient({ onConnectionChange, onEvent, onError } = {}) {
    let ws = null;
    let connected = false;
    const ackResolvers = new Map();

    function emitConnectionChange(nextConnected) {
      connected = Boolean(nextConnected);
      if (typeof onConnectionChange === "function") {
        onConnectionChange(connected);
      }
    }

    function close() {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      ws = null;
      emitConnectionChange(false);
    }

    function connect(baseHttpUrl) {
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const fallback = globalScope.location.origin;
      const targetBase = normalizeString(baseHttpUrl, 1024) || fallback;
      const wsUrl = targetBase
        .replace(/^http:/i, "ws:")
        .replace(/^https:/i, "wss:")
        .replace(/\/+$/, "") + "/v2/ws";

      const nextWs = new WebSocket(wsUrl);
      ws = nextWs;

      nextWs.addEventListener("open", () => {
        emitConnectionChange(true);
      });

      nextWs.addEventListener("close", () => {
        if (ws === nextWs) {
          ws = null;
        }
        emitConnectionChange(false);
        for (const [requestId, resolver] of ackResolvers.entries()) {
          resolver({
            ok: false,
            requestId,
            errorCode: "socket_closed",
            message: "Socket closed",
          });
        }
        ackResolvers.clear();
      });

      nextWs.addEventListener("message", (event) => {
        let envelope = null;
        try {
          envelope = JSON.parse(String(event.data || ""));
        } catch {
          envelope = null;
        }

        if (!envelope || typeof envelope !== "object") {
          return;
        }

        const type = normalizeString(envelope.type, 96);
        const requestId = normalizeString(envelope.requestId, 96);
        const payload = envelope.payload && typeof envelope.payload === "object"
          ? envelope.payload
          : {};

        if (type === "ack" && requestId && ackResolvers.has(requestId)) {
          const resolver = ackResolvers.get(requestId);
          ackResolvers.delete(requestId);
          resolver(payload);
          return;
        }

        if (typeof onEvent === "function") {
          onEvent({ type, requestId, payload });
        }
      });

      nextWs.addEventListener("error", (event) => {
        emitConnectionChange(false);
        if (typeof onError === "function") {
          onError(event);
        }
      });
    }

    function send(type, payload, requestId) {
      const cleanRequestId = normalizeString(requestId, 96) || createRequestId(type || "v2");
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return Promise.resolve({
          ok: false,
          requestId: cleanRequestId,
          errorCode: "socket_not_open",
          message: "Socket is not open.",
        });
      }

      const envelope = {
        v: 2,
        type: normalizeString(type, 96),
        requestId: cleanRequestId,
        payload: payload && typeof payload === "object" ? payload : {},
      };

      return new Promise((resolve) => {
        ackResolvers.set(cleanRequestId, resolve);
        ws.send(JSON.stringify(envelope));
        setTimeout(() => {
          if (!ackResolvers.has(cleanRequestId)) {
            return;
          }

          const timeoutResolver = ackResolvers.get(cleanRequestId);
          ackResolvers.delete(cleanRequestId);
          timeoutResolver({
            ok: false,
            requestId: cleanRequestId,
            errorCode: "ack_timeout",
            message: "Ack timeout",
          });
        }, 20000);
      });
    }

    return {
      connect,
      close,
      send,
      isConnected: () => connected,
    };
  }

  function buildMemberMap(rawRoom) {
    const members = Array.isArray(rawRoom?.members) ? rawRoom.members : [];
    const memberById = new Map();
    for (const member of members) {
      const id = normalizeString(member?.id, 96);
      if (!id) {
        continue;
      }

      memberById.set(id, {
        id,
        name: normalizeString(member?.name, 32) || "Guest",
        channelId: normalizeString(member?.channelId, 40) || "",
      });
    }
    return memberById;
  }

  function transformRoomState(rawRoom, selfId, backendMode) {
    const roomId = normalizeString(rawRoom?.id, 32);
    const memberById = buildMemberMap(rawRoom);
    const selfMember = selfId ? memberById.get(selfId) : null;
    const currentVoiceChannelId = normalizeString(selfMember?.channelId, 40) || null;
    const rawChannels = Array.isArray(rawRoom?.voiceChannels) ? rawRoom.voiceChannels : [];

    const voiceChannels = rawChannels.map((channel) => {
      const channelId = normalizeString(channel?.id, 40);
      const hostId = normalizeString(channel?.hostId, 96) || null;
      const channelMembers = Array.isArray(channel?.members) ? channel.members : [];
      const normalizedMembers = channelMembers
        .map((memberId) => {
          const cleanMemberId = normalizeString(memberId, 96);
          if (!cleanMemberId) {
            return null;
          }

          const fallback = memberById.get(cleanMemberId);
          return {
            id: cleanMemberId,
            name: normalizeString(fallback?.name, 32) || "Guest",
          };
        })
        .filter(Boolean);

      return {
        id: channelId,
        name: normalizeString(channel?.name, 40) || channelId || "room",
        hostId,
        count: normalizedMembers.length,
        members: normalizedMembers,
      };
    });

    const voiceMembers = currentVoiceChannelId
      ? (voiceChannels.find((channel) => channel.id === currentVoiceChannelId)?.members || [])
      : [];
    const members = Array.from(memberById.values()).map((item) => ({
      id: item.id,
      name: item.name,
    }));
    const activeChannelHostId = currentVoiceChannelId
      ? normalizeString(
        rawChannels.find((channel) => normalizeString(channel?.id, 40) === currentVoiceChannelId)?.hostId,
        96
      ) || null
      : null;

    return {
      id: roomId,
      hostId: activeChannelHostId || normalizeString(rawRoom?.hostId, 96) || null,
      members,
      voiceMembers,
      voiceChannels,
      currentVoiceChannelId,
      messages: [],
      networkMode: "relay",
      backendNetworkMode: normalizeString(backendMode, 24) || "relay",
    };
  }

  function memberIdsInActiveChannel(room) {
    const activeId = normalizeString(room?.currentVoiceChannelId, 40);
    if (!activeId) {
      return new Set();
    }

    const channel = (Array.isArray(room?.voiceChannels) ? room.voiceChannels : [])
      .find((item) => normalizeString(item?.id, 40) === activeId);
    if (!channel) {
      return new Set();
    }

    const ids = new Set();
    for (const member of Array.isArray(channel.members) ? channel.members : []) {
      const id = normalizeString(member?.id, 96);
      if (id) {
        ids.add(id);
      }
    }
    return ids;
  }

  function extractAck(args) {
    if (!Array.isArray(args) || args.length === 0) {
      return { payload: {}, ack: null };
    }

    const values = [...args];
    const last = values[values.length - 1];
    const ack = typeof last === "function" ? values.pop() : null;
    const payload = values.length > 0 && values[0] && typeof values[0] === "object"
      ? values[0]
      : {};
    return { payload, ack };
  }

  function createRuntimeSocket() {
    if (globalScope.__SYNTO_V2_RUNTIME_SOCKET__) {
      return globalScope.__SYNTO_V2_RUNTIME_SOCKET__;
    }

    const emitter = createEventEmitter();
    const historyRequestQueue = [];
    let connected = false;
    let selfId = "";
    let activeRoomId = "";
    let activeRoom = null;
    let activeBackendNetworkMode = "relay";
    let manualDisconnect = false;
    let destroyed = false;
    let connectAttemptInFlight = false;
    let reconnectTimer = null;

    function clearReconnectTimer() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function scheduleReconnect() {
      if (destroyed || manualDisconnect || reconnectTimer || connected) {
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    }

    const protocolClient = createProtocolClient({
      onConnectionChange(nextConnected) {
        const wasConnected = connected;
        connected = Boolean(nextConnected);
        if (connected) {
          clearReconnectTimer();
          connectAttemptInFlight = false;
        }

        if (connected && !wasConnected) {
          emitter.emit("connect");
          return;
        }

        if (!connected && wasConnected) {
          emitter.emit("disconnect");
        }
        if (!connected) {
          connectAttemptInFlight = false;
          scheduleReconnect();
        }
      },
      onError(error) {
        emitter.emit("connect_error", {
          message: normalizeString(error?.message || "socket_error", 240),
        });
      },
      onEvent(event) {
        const type = normalizeString(event?.type, 96);
        const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};

        if (type === "connection.ready") {
          const incomingId = normalizeString(payload.connectionId, 96);
          if (incomingId) {
            selfId = incomingId;
          }
          const mode = normalizeString(payload.mode, 24);
          if (mode) {
            activeBackendNetworkMode = mode;
          }
          return;
        }

        if (type === "room.state") {
          const nextRoom = transformRoomState(payload.room, selfId, activeBackendNetworkMode);
          const previousRoom = activeRoom;
          activeRoom = nextRoom;
          activeRoomId = nextRoom.id;

          if (previousRoom) {
            const previousChannelId = normalizeString(previousRoom.currentVoiceChannelId, 40);
            const nextChannelId = normalizeString(nextRoom.currentVoiceChannelId, 40);
            const previousHostId = previousChannelId
              ? normalizeString(
                previousRoom.voiceChannels.find((channel) => channel.id === previousChannelId)?.hostId,
                96
              )
              : "";
            const nextHostId = nextChannelId
              ? normalizeString(
                nextRoom.voiceChannels.find((channel) => channel.id === nextChannelId)?.hostId,
                96
              )
              : "";
            if (nextChannelId && previousHostId !== nextHostId) {
              emitter.emit("host-changed", {
                hostId: nextHostId || null,
                channelId: nextChannelId,
              });
            }

            const previousMembers = memberIdsInActiveChannel(previousRoom);
            const nextMembers = memberIdsInActiveChannel(nextRoom);

            for (const memberId of nextMembers) {
              if (memberId === selfId) {
                continue;
              }
              if (!previousMembers.has(memberId)) {
                emitter.emit("peer-join-request", { peerId: memberId });
              }
            }

            for (const memberId of previousMembers) {
              if (!nextMembers.has(memberId)) {
                emitter.emit("peer-left", { peerId: memberId });
              }
            }
          }

          emitter.emit("room-state", nextRoom);
          return;
        }

        if (type === "peer.left") {
          emitter.emit("peer-left", {
            peerId: normalizeString(payload.peerId, 96),
          });
          return;
        }

        if (type === "chat.message") {
          emitter.emit("chat-message", {
            roomId: normalizeString(payload.roomId, 32) || activeRoomId,
            sourceId: normalizeString(payload.sourceId, 96),
            envelope: payload.envelope,
            attachmentPayloads: [],
          });
          return;
        }

        if (type === "chat.updated") {
          emitter.emit("chat-message-updated", {
            roomId: normalizeString(payload.roomId, 32) || activeRoomId,
            sourceId: normalizeString(payload.sourceId, 96),
            messageId: normalizeString(payload.messageId, 96),
            envelope: payload.envelope,
            attachmentPayloads: [],
          });
          return;
        }

        if (type === "chat.deleted") {
          emitter.emit("chat-message-deleted", {
            roomId: normalizeString(payload.roomId, 32) || activeRoomId,
            sourceId: normalizeString(payload.sourceId, 96),
            messageId: normalizeString(payload.messageId, 96),
          });
          return;
        }

        if (type === "saved-room-relay-envelope") {
          emitter.emit("saved-room-relay-envelope", {
            roomId: normalizeString(payload.roomId, 32),
            sourceId: normalizeString(payload.sourceId, 96),
            envelope: payload.envelope,
          });
          return;
        }

        if (type === "signal.forward") {
          emitter.emit("signal", {
            from: normalizeString(payload.from, 96),
            payload: payload.payload && typeof payload.payload === "object" ? payload.payload : {},
          });
          return;
        }

        if (type === "chat.history.chunk") {
          if (historyRequestQueue.length > 0) {
            const request = historyRequestQueue.shift();
            emitter.emit("relay-history-chunk", {
              roomId: request.roomId,
              requestId: request.requestId,
              targetId: selfId,
              sourceId: normalizeString(payload.sourceId, 96) || "server",
              envelopes: Array.isArray(payload.envelopes) ? payload.envelopes : [],
            });
          } else {
            const request = payload?.requestId
              ? {
                requestId: normalizeString(payload.requestId, 96),
                roomId: normalizeString(payload.roomId, 32) || activeRoomId,
              }
              : {
                requestId: createRequestId("relay-history"),
                roomId: normalizeString(payload.roomId, 32) || activeRoomId,
              };

            emitter.emit("relay-history-chunk", {
              roomId: request.roomId,
              requestId: request.requestId,
              targetId: selfId,
              sourceId: normalizeString(payload.sourceId, 96) || "server",
              envelopes: Array.isArray(payload.envelopes) ? payload.envelopes : [],
            });
          }
          return;
        }

        if (type === "relay.capability.response") {
          emitter.emit("relay-capability-response", {
            token: normalizeString(payload.token, 512),
            expiresAt: Number(payload.expiresAt) || 0,
            roomId: normalizeString(payload.roomId, 32),
          });
        }
      },
    });

    function connect() {
      if (destroyed) {
        return;
      }

      if (connected || connectAttemptInFlight) {
        return;
      }

      clearReconnectTimer();
      manualDisconnect = false;
      connectAttemptInFlight = true;
      protocolClient.connect(globalScope.location.origin);
    }

    function disconnect() {
      manualDisconnect = true;
      clearReconnectTimer();
      connectAttemptInFlight = false;
      protocolClient.close();
    }

    async function call(type, payload) {
      if (!connected) {
        connect();
      }
      return protocolClient.send(type, payload, createRequestId(type.replace(/\./g, "-")));
    }

    function callAck(ack, response, extra) {
      if (typeof ack !== "function") {
        return;
      }

      if (!response?.ok) {
        ack({
          ok: false,
          error: toErrorText(response),
        });
        return;
      }

      ack({
        ok: true,
        ...(extra && typeof extra === "object" ? extra : {}),
      });
    }

    const socket = {
      get connected() {
        return connected;
      },
      get id() {
        return selfId || "";
      },
      on(eventName, handler) {
        emitter.on(eventName, handler);
        return this;
      },
      off(eventName, handler) {
        emitter.off(eventName, handler);
        return this;
      },
      once(eventName, handler) {
        emitter.once(eventName, handler);
        return this;
      },
      connect() {
        connect();
        return this;
      },
      disconnect() {
        disconnect();
        return this;
      },
      emit(eventName) {
        const event = normalizeString(eventName, 96);
        const args = Array.prototype.slice.call(arguments, 1);
        const { payload, ack } = extractAck(args);
        if (!event) {
          return this;
        }

        if (event === "join-room") {
          void call("room.join", {
            roomId: normalizeString(payload?.roomId, 32),
            name: normalizeString(payload?.name, 32) || "Guest",
            authorId: normalizeString(payload?.authorId, 96),
          }).then((response) => {
            if (!response?.ok) {
              callAck(ack, response);
              emitter.emit("chat-error", {
                message: toErrorText(response),
              });
              return;
            }

            const data = response.data && typeof response.data === "object" ? response.data : {};
            const nextSelfId = normalizeString(data.selfId, 96);
            if (nextSelfId) {
              selfId = nextSelfId;
            }

            const transformed = transformRoomState(data.room || {}, selfId, activeBackendNetworkMode);
            activeRoom = transformed;
            activeRoomId = transformed.id;
            emitter.emit("joined-room", {
              room: transformed,
              selfId,
            });
            emitter.emit("room-state", transformed);
            callAck(ack, response);
          });
          return this;
        }

        if (event === "leave-room") {
          void call("room.leave", {}).then((response) => {
            if (response?.ok) {
              activeRoom = null;
              activeRoomId = "";
            }
            callAck(ack, response);
          });
          return this;
        }

        if (event === "join-voice-channel") {
          void call("voice.joinChannel", {
            channelId: normalizeString(payload?.channelId, 40),
          }).then((response) => {
            callAck(ack, response);
          });
          return this;
        }

        if (event === "leave-voice-channel") {
          void call("voice.leaveChannel", {}).then((response) => {
            callAck(ack, response);
          });
          return this;
        }

        if (event === "create-voice-channel") {
          const channelName = normalizeString(payload?.name, 40);
          void call("voice.createChannel", { name: channelName }).then((response) => {
            if (!response?.ok) {
              callAck(ack, response);
              return;
            }
            const channelId = normalizeString(response?.data?.channelId, 40);
            callAck(ack, response, {
              channelId,
              channelName: channelName || channelId,
            });
          });
          return this;
        }

        if (event === "rename-voice-channel") {
          const channelId = normalizeString(payload?.channelId, 40);
          const channelName = normalizeString(payload?.name, 40);
          void call("voice.renameChannel", {
            channelId,
            name: channelName,
          }).then((response) => {
            callAck(ack, response, { channelId, channelName });
          });
          return this;
        }

        if (event === "delete-voice-channel") {
          void call("voice.deleteChannel", {
            channelId: normalizeString(payload?.channelId, 40),
          }).then((response) => {
            callAck(ack, response);
          });
          return this;
        }

        if (event === "signal") {
          void call("signal.forward", {
            to: normalizeString(payload?.to, 96),
            payload: payload?.payload && typeof payload.payload === "object" ? payload.payload : {},
          }).then((response) => {
            callAck(ack, response);
          });
          return this;
        }

        if (event === "chat-message") {
          if (!payload?.envelope || typeof payload.envelope !== "object") {
            callAck(ack, { ok: false, errorCode: "relay_mode_required" });
            emitter.emit("chat-error", { message: "relay_mode_required" });
            return this;
          }
          void call("chat.send", {
            envelope: payload.envelope,
          }).then((response) => {
            callAck(ack, response);
          });
          return this;
        }

        if (event === "edit-chat-message") {
          if (!payload?.envelope || typeof payload.envelope !== "object") {
            callAck(ack, { ok: false, errorCode: "invalid_message_update" });
            return this;
          }
          void call("chat.edit", {
            messageId: normalizeString(payload?.messageId, 96),
            envelope: payload.envelope,
          }).then((response) => {
            callAck(ack, response);
          });
          return this;
        }

        if (event === "delete-chat-message") {
          void call("chat.delete", {
            messageId: normalizeString(payload?.messageId, 96),
          }).then((response) => {
            callAck(ack, response);
          });
          return this;
        }

        if (event === "relay-capability-request") {
          const roomId = normalizeString(payload?.roomId, 32) || activeRoomId;
          void call("relay.capability.request", { roomId }).then((response) => {
            if (!response?.ok) {
              callAck(ack, response);
              return;
            }
            const data = response.data && typeof response.data === "object" ? response.data : {};
            callAck(ack, response, {
              token: normalizeString(data.token, 512),
              roomId: normalizeString(data.roomId, 32) || roomId,
              expiresAt: Number(data.expiresAt) || 0,
            });
          });
          return this;
        }

        if (event === "watch-saved-rooms") {
          const roomIds = Array.isArray(payload?.roomIds) ? payload.roomIds : [];
          void call("watch.savedRooms", {
            roomIds: roomIds.map((item) => normalizeString(item, 32)).filter(Boolean),
          }).then((response) => {
            callAck(ack, response, {
              roomIds: Array.isArray(response?.data?.watchedRooms) ? response.data.watchedRooms : [],
            });
          });
          return this;
        }

        if (event === "relay-history-request") {
          const roomId = normalizeString(payload?.roomId, 32) || activeRoomId;
          const requestId = normalizeString(payload?.requestId, 96) || createRequestId("relay-history");
          historyRequestQueue.push({ requestId, roomId });
          void call("chat.history.request", {
            roomId,
            limit: 500,
          }).then((response) => {
            callAck(ack, response);
            if (!response?.ok) {
              emitter.emit("chat-error", {
                message: toErrorText(response),
              });
            }
          });
          return this;
        }

        if (
          event === "relay-history-chunk"
          || event === "relay-attachment-request"
          || event === "relay-attachment-response"
        ) {
          callAck(ack, { ok: true });
          return this;
        }

        console.warn("[v2/socket] unsupported emit event", event, payload);
        callAck(ack, { ok: false, errorCode: "unsupported_event" });
        return this;
      },
      destroy() {
        destroyed = true;
        clearReconnectTimer();
        disconnect();
      },
    };

    globalScope.__SYNTO_V2_RUNTIME_SOCKET__ = socket;
    connect();
    return socket;
  }

  installFoundationPreloadShims();
  globalScope.createRuntimeSocket = createRuntimeSocket;
})(window);
