"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Hyperswarm = require("hyperswarm");
const Corestore = require("corestore");
const Autobase = require("autobase");
const Hyperbee = require("hyperbee");
const Protomux = require("protomux");
const c = require("compact-encoding");
const b4a = require("b4a");

const CONTROL_PROTOCOL = "qwerbentum-room-control-v1";
const TOPIC_NAMESPACE = "qwerbentum-room-topic-v1";
const ROOM_PATH_PREFIX = "room";
const MESSAGE_KEY_PREFIX = "message!";
const VOICE_CHANNEL_KEY_PREFIX = "voice-channel!";
const STORAGE_SAFE_NAME_RE = /[^a-z0-9._-]/gi;
const DEFAULT_P2P_BOOTSTRAP_PORT = 49737;
const P2P_BOOTSTRAP_ENV_KEYS = [
  "P2P_BOOTSTRAP",
  "QWERBENTUM_P2P_BOOTSTRAP",
  "HYPERSWARM_BOOTSTRAP",
];
const P2P_NO_PEER_WARNING_DELAY_MS = 20000;

const JSON_ENCODING = {
  preencode(state, value) {
    c.string.preencode(state, JSON.stringify(value ?? null));
  },
  encode(state, value) {
    c.string.encode(state, JSON.stringify(value ?? null));
  },
  decode(state) {
    return JSON.parse(c.string.decode(state));
  },
};

function noop() {}

function toHex(value) {
  if (!value) {
    return "";
  }
  return b4a.toString(value, "hex");
}

function fromHex(value) {
  const clean = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/i.test(clean)) {
    return null;
  }
  return b4a.from(clean, "hex");
}

function normalizeRoomId(value) {
  return String(value || "").trim().slice(0, 32);
}

function normalizePeerKey(value) {
  return String(value || "").trim().toLowerCase();
}

function buildRoomTopic(roomId) {
  return crypto
    .createHash("sha256")
    .update(TOPIC_NAMESPACE)
    .update(":")
    .update(b4a.from(normalizeRoomId(roomId)))
    .digest();
}

function safeRoomStorageId(roomId) {
  const base = normalizeRoomId(roomId).replace(STORAGE_SAFE_NAME_RE, "_");
  return `${ROOM_PATH_PREFIX}-${base || "default"}`;
}

function sortVoiceChannelDefs(left, right) {
  const leftNum = Number(left?.id);
  const rightNum = Number(right?.id);
  const leftIsNumber = Number.isFinite(leftNum);
  const rightIsNumber = Number.isFinite(rightNum);

  if (leftIsNumber && rightIsNumber) {
    return leftNum - rightNum;
  }

  return String(left?.id || "").localeCompare(String(right?.id || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadOrCreateBinaryFile(filePath, size) {
  try {
    const existing = fs.readFileSync(filePath);
    if (existing.length === size) {
      return existing;
    }
  } catch {
    // no-op
  }

  const next = crypto.randomBytes(size);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, next);
  return next;
}

function parseBootstrapNodes(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return [];
  }

  const items = raw
    .split(/[,\n;\r\t ]+/)
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const unique = new Set();
  const normalized = [];

  for (const item of items) {
    const value = item.includes(":") ? item : `${item}:${DEFAULT_P2P_BOOTSTRAP_PORT}`;
    if (!unique.has(value)) {
      unique.add(value);
      normalized.push(value);
    }
  }

  return normalized;
}

function resolveBootstrapNodesFromEnvironment() {
  for (const envKey of P2P_BOOTSTRAP_ENV_KEYS) {
    const rawValue = String(process.env[envKey] || "").trim();
    if (!rawValue) {
      continue;
    }

    const nodes = parseBootstrapNodes(rawValue);
    if (nodes.length > 0) {
      return {
        envKey,
        nodes,
      };
    }
  }

  return {
    envKey: "",
    nodes: [],
  };
}

function listLocalSocketIds(io, room) {
  if (!room) {
    return [];
  }

  return Array.from(room.members).filter((memberId) => io.sockets.sockets.has(memberId));
}

function hasLocalSockets(io, room) {
  return listLocalSocketIds(io, room).length > 0;
}

async function readRoomHistorySnapshot(view) {
  const messages = [];
  const voiceChannels = [];

  for await (const entry of view.createReadStream({
    gte: MESSAGE_KEY_PREFIX,
    lt: `${MESSAGE_KEY_PREFIX}~`,
  })) {
    if (entry?.value && entry.value.id) {
      messages.push(entry.value);
    }
  }

  for await (const entry of view.createReadStream({
    gte: VOICE_CHANNEL_KEY_PREFIX,
    lt: `${VOICE_CHANNEL_KEY_PREFIX}~`,
  })) {
    if (entry?.value && entry.value.id) {
      voiceChannels.push(entry.value);
    }
  }

  voiceChannels.sort(sortVoiceChannelDefs);
  return {
    messages,
    voiceChannels,
  };
}

function createControlSnapshot(room, io) {
  return {
    members: listLocalSocketIds(io, room).map((memberId) => ({
      id: memberId,
      name: String(room.names.get(memberId) || "Guest"),
      joinedAt: Number(room.memberJoinedAt?.get(memberId)) || Date.now(),
      voiceChannelId: room.memberVoiceChannel.get(memberId) || null,
      voiceJoinedAt: Number(room.memberVoiceJoinedAt?.get(memberId)) || 0,
    })),
    sentAt: Date.now(),
  };
}

function createP2PMesh(options) {
  const {
    io,
    rooms,
    storageRoot,
    maxChatMessages,
    ensureDefaultVoiceChannels,
    createVoiceChannel,
    normalizeVoiceChannelId,
    normalizeVoiceChannelName,
    serializeChatMessage,
    broadcastRoomState,
    emitWatchedRoomChatMessage = noop,
    queueChatStateSave = noop,
    getOrCreateRoom,
    promoteVoiceChannelHost,
  } = options;

  const meshRoot = path.join(storageRoot, "p2p");
  fs.mkdirSync(meshRoot, { recursive: true });

  const swarmSeed = loadOrCreateBinaryFile(path.join(meshRoot, "swarm.seed"), 32);
  const logicalPeerId = toHex(loadOrCreateBinaryFile(path.join(meshRoot, "peer.id"), 32));
  const bootstrapConfig = resolveBootstrapNodesFromEnvironment();
  const swarm = new Hyperswarm({
    seed: swarmSeed,
    ...(bootstrapConfig.nodes.length > 0 ? { bootstrap: bootstrapConfig.nodes } : {}),
  });
  const roomContexts = new Map();
  let closed = false;

  function log(...args) {
    console.log("[p2p]", ...args);
  }

  log(`local peer id=${logicalPeerId}`);
  if (bootstrapConfig.nodes.length > 0) {
    log(
      `bootstrap override via ${bootstrapConfig.envKey}: ${bootstrapConfig.nodes.join(", ")}`
    );
  } else {
    log("bootstrap override: default hyperdht bootstrap nodes");
  }

  function getRoom(roomId) {
    const cleanRoomId = normalizeRoomId(roomId);
    if (!cleanRoomId) {
      return null;
    }
    return rooms.get(cleanRoomId) || null;
  }

  function isLocalMemberId(memberId) {
    return io.sockets.sockets.has(memberId);
  }

  function normalizePresenceMembers(members) {
    const normalized = [];
    const seen = new Set();

    for (const item of Array.isArray(members) ? members : []) {
      const memberId = String(item?.id || "").trim();
      if (!memberId || seen.has(memberId)) {
        continue;
      }

      seen.add(memberId);
      normalized.push({
        id: memberId,
        name: String(item?.name || "Guest").trim() || "Guest",
        joinedAt: Number(item?.joinedAt) || Date.now(),
        voiceChannelId: item?.voiceChannelId ? normalizeVoiceChannelId(item.voiceChannelId) : null,
        voiceJoinedAt: Number(item?.voiceJoinedAt) || 0,
      });
    }

    return normalized;
  }

  function setRoomVoiceChannelsFromDefinitions(room, definitions) {
    const normalizedDefs = Array.isArray(definitions)
      ? definitions
          .map((item) => ({
            id: normalizeVoiceChannelId(item?.id),
            name: normalizeVoiceChannelName(item?.name, item?.id),
          }))
          .filter((item) => item.id)
      : [];

    if (normalizedDefs.length === 0) {
      ensureDefaultVoiceChannels(room);
      rebuildVoiceMembership(room);
      return;
    }

    normalizedDefs.sort(sortVoiceChannelDefs);
    const nextVoiceChannels = new Map();
    for (const channelDef of normalizedDefs) {
      nextVoiceChannels.set(channelDef.id, createVoiceChannel(channelDef.id, channelDef.name));
    }

    const fallbackChannelId = normalizedDefs[0].id;
    for (const [memberId, channelId] of Array.from(room.memberVoiceChannel.entries())) {
      const nextChannelId = nextVoiceChannels.has(channelId) ? channelId : fallbackChannelId;
      room.memberVoiceChannel.set(memberId, nextChannelId);

      const memberSocket = io.sockets.sockets.get(memberId);
      if (memberSocket) {
        memberSocket.data.voiceChannelId = nextChannelId;
      }
    }

    room.voiceChannels = nextVoiceChannels;
    rebuildVoiceMembership(room);
  }

  function rebuildVoiceMembership(room) {
    for (const channel of room.voiceChannels.values()) {
      channel.members.clear();
      channel.hostId = null;
    }

    for (const [memberId, channelId] of room.memberVoiceChannel.entries()) {
      const channel = room.voiceChannels.get(channelId);
      if (!channel || !room.members.has(memberId)) {
        continue;
      }
      channel.members.add(memberId);
    }

    for (const channel of room.voiceChannels.values()) {
      promoteVoiceChannelHost(room, channel.id);
    }
  }

  function removeRemotePresence(ctx, remoteNoiseKeyHex) {
    const room = getRoom(ctx.roomId);
    if (!room) {
      return;
    }

    const previousSnapshot = ctx.remotePresence.get(remoteNoiseKeyHex);
    if (!previousSnapshot) {
      return;
    }

    ctx.remotePresence.delete(remoteNoiseKeyHex);

    for (const member of previousSnapshot.members) {
      room.members.delete(member.id);
      room.names.delete(member.id);
      room.memberVoiceChannel.delete(member.id);
      room.memberJoinedAt?.delete(member.id);
      room.memberVoiceJoinedAt?.delete(member.id);
    }

    rebuildVoiceMembership(room);
    broadcastRoomState(room);
  }

  function applyRemotePresence(ctx, remoteNoiseKeyHex, snapshot) {
    const room = getOrCreateRoom(ctx.roomId);
    const previousSnapshot = ctx.remotePresence.get(remoteNoiseKeyHex);

    if (previousSnapshot) {
      for (const member of previousSnapshot.members) {
        room.members.delete(member.id);
        room.names.delete(member.id);
        room.memberVoiceChannel.delete(member.id);
        room.memberJoinedAt?.delete(member.id);
        room.memberVoiceJoinedAt?.delete(member.id);
      }
    }

    const normalizedMembers = normalizePresenceMembers(snapshot?.members);
    ctx.remotePresence.set(remoteNoiseKeyHex, { members: normalizedMembers });

    for (const member of normalizedMembers) {
      if (isLocalMemberId(member.id)) {
        continue;
      }
      room.members.add(member.id);
      room.names.set(member.id, member.name || "Guest");
      room.memberJoinedAt?.set(member.id, member.joinedAt || Date.now());

      if (member.voiceChannelId) {
        room.memberVoiceChannel.set(member.id, member.voiceChannelId);
        room.memberVoiceJoinedAt?.set(member.id, member.voiceJoinedAt || Date.now());
      } else {
        room.memberVoiceChannel.delete(member.id);
        room.memberVoiceJoinedAt?.delete(member.id);
      }
    }

    rebuildVoiceMembership(room);
    broadcastRoomState(room);
  }

  function buildRoomContextStatePayload(ctx) {
    const room = getOrCreateRoom(ctx.roomId);
    return {
      peerId: logicalPeerId,
      roomId: ctx.roomId,
      members: createControlSnapshot(room, io).members,
    };
  }

  async function syncRoomHistory(ctx, { emitEvents = true } = {}) {
    if (!ctx.base || ctx.syncInFlight) {
      return;
    }

    ctx.syncInFlight = true;

    try {
      const room = getOrCreateRoom(ctx.roomId);
      const previousMessages = Array.isArray(room.messages) ? room.messages.slice() : [];
      const snapshot = await readRoomHistorySnapshot(ctx.base.view);
      ctx.lastHistorySnapshot = snapshot;

      setRoomVoiceChannelsFromDefinitions(room, snapshot.voiceChannels);

      const nextMessages = snapshot.messages.slice(-maxChatMessages);
      room.messages = nextMessages;

      if (!emitEvents) {
        queueChatStateSave();
        return;
      }

      const previousById = new Map(previousMessages.map((message) => [message.id, message]));
      const nextById = new Map(nextMessages.map((message) => [message.id, message]));
      const localSocketIds = listLocalSocketIds(io, room);

      for (const message of nextMessages) {
        const previous = previousById.get(message.id);
        const serialized = serializeChatMessage(message);
        if (!previous) {
          for (const socketId of localSocketIds) {
            io.to(socketId).emit("chat-message", serialized);
          }
          emitWatchedRoomChatMessage(ctx.roomId, message);
          continue;
        }

        if (JSON.stringify(previous) !== JSON.stringify(message)) {
          for (const socketId of localSocketIds) {
            io.to(socketId).emit("chat-message-updated", serialized);
          }
        }
      }

      for (const previous of previousMessages) {
        if (nextById.has(previous.id)) {
          continue;
        }
        for (const socketId of localSocketIds) {
          io.to(socketId).emit("chat-message-deleted", {
            messageId: previous.id,
          });
        }
      }

      queueChatStateSave();
      broadcastRoomState(room);
    } finally {
      ctx.syncInFlight = false;
    }
  }

  async function openAutobaseForRoom(ctx, bootstrapHex = "") {
    if (ctx.base) {
      return ctx.base;
    }

    const bootstrapKey = fromHex(bootstrapHex);
    const base = new Autobase(ctx.store, bootstrapKey, {
      valueEncoding: "json",
      open(store) {
        return new Hyperbee(store.get({ name: "room-view", valueEncoding: "json" }), {
          keyEncoding: "utf-8",
          valueEncoding: "json",
        });
      },
      async apply(nodes, view, host) {
        const batch = view.batch();

        for (const node of nodes) {
          const value = node?.value;
          if (!value || typeof value !== "object") {
            continue;
          }

          if (value.type === "add-writer" && value.writer) {
            const writerKey = fromHex(value.writer);
            if (writerKey) {
              await host.addWriter(writerKey, { indexer: true });
            }
            continue;
          }

          if (value.type === "message-upsert" && value.message?.id) {
            await batch.put(`${MESSAGE_KEY_PREFIX}${value.message.id}`, value.message);
            continue;
          }

          if (value.type === "message-delete" && value.messageId) {
            await batch.del(`${MESSAGE_KEY_PREFIX}${value.messageId}`);
            continue;
          }

          if (value.type === "voice-channel-upsert" && value.channel?.id) {
            await batch.put(`${VOICE_CHANNEL_KEY_PREFIX}${value.channel.id}`, value.channel);
            continue;
          }

          if (value.type === "voice-channel-delete" && value.channelId) {
            await batch.del(`${VOICE_CHANNEL_KEY_PREFIX}${value.channelId}`);
          }
        }

        await batch.flush();
      },
    });

    await base.ready();
    ctx.base = base;
    ctx.baseKeyHex = toHex(base.key);
    ctx.localWriterHex = toHex(base.local?.key);
    ctx.knownWriterKeys = new Set([ctx.localWriterHex]);
    ctx.base.on("update", () => {
      void syncRoomHistory(ctx, { emitEvents: true });
    });
    return base;
  }

  async function handleBootstrap(ctx, peerState, message) {
    peerState.remotePeerId = normalizePeerKey(message?.peerId);
    const remoteBaseHex = normalizePeerKey(message?.baseKey);
    const remoteWriterHex = normalizePeerKey(message?.writerKey);

    if (remoteBaseHex) {
      peerState.remoteBaseHex = remoteBaseHex;
    }
    if (remoteWriterHex) {
      peerState.remoteWriterHex = remoteWriterHex;
    }

    if (!ctx.base && remoteBaseHex) {
      await openAutobaseForRoom(ctx, remoteBaseHex);
      await syncRoomHistory(ctx, { emitEvents: false });
      sendBootstrap(ctx, peerState);
      await syncLocalPresence(ctx);
    }

    if (
      ctx.base &&
      remoteBaseHex &&
      ctx.baseKeyHex &&
      remoteBaseHex !== ctx.baseKeyHex
    ) {
      log(`base conflict ignored for ${ctx.roomId}: local=${ctx.baseKeyHex} remote=${remoteBaseHex}`);
      return;
    }

    if (
      ctx.base &&
      remoteWriterHex &&
      remoteWriterHex !== ctx.localWriterHex &&
      !ctx.knownWriterKeys.has(remoteWriterHex)
    ) {
      ctx.knownWriterKeys.add(remoteWriterHex);
      try {
        await ctx.base.append({
          type: "add-writer",
          writer: remoteWriterHex,
        });
      } catch (error) {
        log(`add-writer failed for ${ctx.roomId}: ${error?.message || error}`);
      }
    }
  }

  function handleSignal(ctx, message) {
    const from = String(message?.from || "").trim();
    const to = String(message?.to || "").trim();
    if (!from || !to) {
      return;
    }

    if (!isLocalMemberId(to)) {
      return;
    }

    io.to(to).emit("signal", {
      from,
      payload: clonePlain(message?.payload),
    });
  }

  function sendBootstrap(ctx, peerState) {
    if (!peerState.channelOpened) {
      return;
    }

    peerState.messages.bootstrap.send({
      roomId: ctx.roomId,
      baseKey: ctx.baseKeyHex,
      writerKey: ctx.localWriterHex,
      peerId: logicalPeerId,
    });
  }

  function sendState(ctx, peerState) {
    if (!peerState.channelOpened) {
      return;
    }

    peerState.messages.state.send(buildRoomContextStatePayload(ctx));
  }

  function attachConnectionToRoom(ctx, conn, remoteNoiseKeyHex) {
    const peerKey = remoteNoiseKeyHex || toHex(conn.remotePublicKey);
    if (!peerKey || ctx.peerStates.has(peerKey)) {
      return;
    }

    ctx.store.replicate(conn);

    const mux = Protomux.from(conn);
    const peerState = {
      conn,
      remoteNoiseKeyHex: peerKey,
      channelOpened: false,
      messages: null,
    };

    const channel = mux.createChannel({
      protocol: CONTROL_PROTOCOL,
      id: ctx.topic,
      onopen() {
        peerState.channelOpened = true;
        log(`channel open room=${ctx.roomId} peer=${peerKey}`);
        if (ctx.noPeerWarningTimer) {
          clearTimeout(ctx.noPeerWarningTimer);
          ctx.noPeerWarningTimer = null;
        }
        sendBootstrap(ctx, peerState);
        sendState(ctx, peerState);
      },
      onclose() {
        log(`channel close room=${ctx.roomId} peer=${peerKey}`);
        removeRemotePresence(ctx, peerKey);
        ctx.peerStates.delete(peerKey);
      },
    });

    if (!channel) {
      return;
    }

    peerState.messages = {
      bootstrap: channel.addMessage({
        encoding: JSON_ENCODING,
        onmessage(message) {
          void handleBootstrap(ctx, peerState, message);
        },
      }),
      state: channel.addMessage({
        encoding: JSON_ENCODING,
        onmessage(message) {
          applyRemotePresence(ctx, peerKey, message);
        },
      }),
      signal: channel.addMessage({
        encoding: JSON_ENCODING,
        onmessage(message) {
          handleSignal(ctx, message);
        },
      }),
    };

    channel.open();
    ctx.peerStates.set(peerKey, peerState);
  }

  async function createRoomContext(roomId) {
    const cleanRoomId = normalizeRoomId(roomId);
    if (!cleanRoomId) {
      return null;
    }

    if (roomContexts.has(cleanRoomId)) {
      return roomContexts.get(cleanRoomId);
    }

    const topic = buildRoomTopic(cleanRoomId);
    const storePath = path.join(meshRoot, safeRoomStorageId(cleanRoomId));
    fs.mkdirSync(storePath, { recursive: true });

    const ctx = {
      roomId: cleanRoomId,
      topic,
      store: new Corestore(storePath),
      discovery: null,
      base: null,
      baseKeyHex: "",
      localWriterHex: "",
      knownWriterKeys: new Set(),
      peerStates: new Map(),
      remotePresence: new Map(),
      syncInFlight: false,
      lastHistorySnapshot: null,
      baseOpeningPromise: null,
      noPeerWarningTimer: null,
    };

    roomContexts.set(cleanRoomId, ctx);

    ctx.discovery = swarm.join(topic, {
      server: true,
      client: true,
    });
    log(`join topic room=${cleanRoomId} topic=${toHex(topic)}`);
    await ctx.discovery.flushed().catch(() => {});

    ctx.noPeerWarningTimer = setTimeout(() => {
      const room = getRoom(cleanRoomId);
      if (!room || !hasLocalSockets(io, room)) {
        return;
      }
      if (ctx.peerStates.size > 0) {
        return;
      }

      log(
        `no peers discovered in ${Math.round(P2P_NO_PEER_WARNING_DELAY_MS / 1000)}s for room=${cleanRoomId}. ` +
        "Check UDP reachability, CGNAT restrictions, and bootstrap configuration."
      );
    }, P2P_NO_PEER_WARNING_DELAY_MS);

    for (const conn of swarm.connections) {
      attachConnectionToRoom(ctx, conn, toHex(conn.remotePublicKey));
    }

    return ctx;
  }

  async function ensureRoomBase(ctx) {
    if (ctx.base) {
      return ctx.base;
    }

    if (ctx.baseOpeningPromise) {
      return ctx.baseOpeningPromise;
    }

    ctx.baseOpeningPromise = (async () => {
      const firstWaitDeadline = Date.now() + 1200;
      while (!ctx.base && Date.now() < firstWaitDeadline) {
        await wait(120);
      }

      if (ctx.base) {
        return ctx.base;
      }

      const knownRemotePeerIds = Array.from(ctx.peerStates.values())
        .map((peerState) => normalizePeerKey(peerState.remotePeerId))
        .filter(Boolean);
      const leaderId = [logicalPeerId, ...knownRemotePeerIds].sort()[0] || logicalPeerId;

      if (leaderId !== logicalPeerId) {
        const remoteBaseDeadline = Date.now() + 3000;
        while (!ctx.base && Date.now() < remoteBaseDeadline) {
          await wait(150);
        }
      }

      if (!ctx.base) {
        await openAutobaseForRoom(ctx, "");
        await syncRoomHistory(ctx, { emitEvents: false });
        await syncLocalPresence(ctx);
      }

      return ctx.base;
    })().finally(() => {
      ctx.baseOpeningPromise = null;
    });

    return ctx.baseOpeningPromise;
  }

  async function closeRoomContext(ctx) {
    if (!ctx) {
      return;
    }

    for (const remoteNoiseKeyHex of Array.from(ctx.peerStates.keys())) {
      removeRemotePresence(ctx, remoteNoiseKeyHex);
    }

    if (ctx.discovery) {
      await ctx.discovery.destroy().catch(() => {});
      ctx.discovery = null;
    }

    if (ctx.noPeerWarningTimer) {
      clearTimeout(ctx.noPeerWarningTimer);
      ctx.noPeerWarningTimer = null;
    }

    if (ctx.base) {
      ctx.base.removeAllListeners("update");
      await ctx.base.close().catch(() => {});
      ctx.base = null;
    }

    if (ctx.store) {
      await ctx.store.close().catch(() => {});
    }

    roomContexts.delete(ctx.roomId);
  }

  async function syncLocalPresence(ctx) {
    if (!ctx) {
      return;
    }

    for (const peerState of ctx.peerStates.values()) {
      sendState(ctx, peerState);
    }
  }

  swarm.on("connection", (conn, info) => {
    const remoteNoiseKeyHex = normalizePeerKey(toHex(info?.publicKey || conn.remotePublicKey));
    log(`swarm connection peer=${remoteNoiseKeyHex || "unknown"} topics=${Array.isArray(info?.topics) ? info.topics.length : 0}`);

    for (const ctx of roomContexts.values()) {
      attachConnectionToRoom(ctx, conn, remoteNoiseKeyHex);
    }
  });

  return {
    isEnabled() {
      return !closed;
    },
    getLocalPeerId() {
      return logicalPeerId;
    },
    getDiagnostics() {
      return {
        localPeerId: logicalPeerId,
        bootstrapSource: bootstrapConfig.envKey || "default",
        bootstrapNodes: bootstrapConfig.nodes.slice(),
        swarmPublicKey: toHex(swarm?.keyPair?.publicKey),
        connectionCount: Number(swarm?.connections?.size) || 0,
        rooms: Array.from(roomContexts.values()).map((ctx) => ({
          roomId: ctx.roomId,
          topic: toHex(ctx.topic),
          peerCount: ctx.peerStates.size,
          remotePresenceCount: ctx.remotePresence.size,
          hasAutobase: Boolean(ctx.base),
          hasLocalSockets: hasLocalSockets(io, getRoom(ctx.roomId)),
        })),
      };
    },
    async ensureRoom(roomId) {
      return createRoomContext(roomId);
    },
    async joinLocalSocket(roomId) {
      const ctx = await createRoomContext(roomId);
      await ensureRoomBase(ctx);
      await syncRoomHistory(ctx, { emitEvents: false });
      await syncLocalPresence(ctx);
      return ctx;
    },
    async leaveLocalSocket(roomId) {
      const room = getRoom(roomId);
      const ctx = roomContexts.get(normalizeRoomId(roomId));
      if (!ctx) {
        return;
      }

      if (room && hasLocalSockets(io, room)) {
        await syncLocalPresence(ctx);
        return;
      }

      for (const remoteNoiseKeyHex of Array.from(ctx.remotePresence.keys())) {
        removeRemotePresence(ctx, remoteNoiseKeyHex);
      }

      await closeRoomContext(ctx);
    },
    async syncLocalPresence(roomId) {
      const ctx = roomContexts.get(normalizeRoomId(roomId));
      if (!ctx) {
        return;
      }
      await syncLocalPresence(ctx);
    },
    async relaySignal(roomId, { from, to, payload }) {
      const ctx = roomContexts.get(normalizeRoomId(roomId));
      if (!ctx) {
        return false;
      }

      const targetId = String(to || "").trim();
      if (!targetId) {
        return false;
      }

      const room = getRoom(roomId);
      if (!room || !room.members.has(targetId)) {
        return false;
      }

      if (isLocalMemberId(targetId)) {
        return false;
      }

      for (const peerState of ctx.peerStates.values()) {
        if (!peerState.channelOpened) {
          continue;
        }
        peerState.messages.signal.send({
          from,
          to: targetId,
          payload: clonePlain(payload),
        });
      }

      return true;
    },
    async appendChatMessage(roomId, message) {
      const ctx = await createRoomContext(roomId);
      await ensureRoomBase(ctx);
      const payload = serializeChatMessage(message);
      await ctx.base.append({
        type: "message-upsert",
        message: payload,
      });
      return payload;
    },
    async updateChatMessage(roomId, message) {
      const ctx = await createRoomContext(roomId);
      await ensureRoomBase(ctx);
      const payload = serializeChatMessage(message);
      await ctx.base.append({
        type: "message-upsert",
        message: payload,
      });
      return payload;
    },
    async deleteChatMessage(roomId, messageId) {
      const ctx = await createRoomContext(roomId);
      await ensureRoomBase(ctx);
      await ctx.base.append({
        type: "message-delete",
        messageId: String(messageId || "").trim(),
      });
    },
    async upsertVoiceChannel(roomId, channel) {
      const ctx = await createRoomContext(roomId);
      await ensureRoomBase(ctx);
      await ctx.base.append({
        type: "voice-channel-upsert",
        channel: {
          id: normalizeVoiceChannelId(channel?.id),
          name: normalizeVoiceChannelName(channel?.name, channel?.id),
        },
      });
    },
    async deleteVoiceChannel(roomId, channelId) {
      const ctx = await createRoomContext(roomId);
      await ensureRoomBase(ctx);
      await ctx.base.append({
        type: "voice-channel-delete",
        channelId: normalizeVoiceChannelId(channelId),
      });
    },
    async close() {
      if (closed) {
        return;
      }
      closed = true;

      for (const ctx of Array.from(roomContexts.values())) {
        await closeRoomContext(ctx);
      }

      await swarm.destroy().catch(() => {});
    },
  };
}

module.exports = {
  createP2PMesh,
};
