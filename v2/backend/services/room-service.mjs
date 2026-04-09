import {
  normalizeMessageId,
  normalizeRoomId,
  normalizeString,
  normalizeUserName,
  sanitizeRelayEnvelope,
} from "../protocol/runtime.mjs";

const DEFAULT_VOICE_CHANNEL_IDS = ["1", "2", "3"];

function createVoiceChannel(id, name = id) {
  return {
    id,
    name,
    members: new Set(),
    hostId: null,
  };
}

function cloneRoomState(room) {
  const channels = [];
  for (const channel of room.voiceChannels.values()) {
    channels.push({
      id: channel.id,
      name: channel.name,
      hostId: channel.hostId || null,
      members: Array.from(channel.members),
    });
  }

  channels.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const members = Array.from(room.members).map((memberId) => ({
    id: memberId,
    name: room.names.get(memberId) || "Guest",
    channelId: room.memberVoiceChannel.get(memberId) || null,
  }));

  return {
    id: room.id,
    hostId: room.hostId || null,
    members,
    voiceChannels: channels,
    messageCount: room.messages.length,
  };
}

function promoteChannelHost(room, channelId) {
  const channel = room.voiceChannels.get(channelId);
  if (!channel) {
    return null;
  }

  let nextHost = null;
  let joinedAt = Number.POSITIVE_INFINITY;
  for (const memberId of channel.members) {
    const candidateJoinedAt = Number(room.memberJoinedAt.get(memberId) || 0);
    if (candidateJoinedAt < joinedAt) {
      joinedAt = candidateJoinedAt;
      nextHost = memberId;
    }
  }

  channel.hostId = nextHost;
  room.hostId = nextHost;
  return nextHost;
}

function ensureDefaultChannels(room) {
  for (const id of DEFAULT_VOICE_CHANNEL_IDS) {
    if (!room.voiceChannels.has(id)) {
      room.voiceChannels.set(id, createVoiceChannel(id, id));
    }
  }
}

export class RoomService {
  constructor(options = {}) {
    this.rooms = new Map();
    this.maxChatMessages = Math.max(50, Math.round(Number(options.maxChatMessages) || 500));
    this.messageIndex = new Map();
  }

  getOrCreateRoom(rawRoomId) {
    const roomId = normalizeRoomId(rawRoomId);
    if (!roomId) {
      return null;
    }

    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId);
    }

    const room = {
      id: roomId,
      members: new Set(),
      names: new Map(),
      memberJoinedAt: new Map(),
      memberVoiceChannel: new Map(),
      voiceChannels: new Map(),
      hostId: null,
      messages: [],
    };

    ensureDefaultChannels(room);
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(rawRoomId) {
    const roomId = normalizeRoomId(rawRoomId);
    return roomId ? this.rooms.get(roomId) || null : null;
  }

  joinRoom({ roomId, connectionId, userName, authorId }) {
    const room = this.getOrCreateRoom(roomId);
    if (!room) {
      return { ok: false, errorCode: "invalid_room" };
    }

    const cleanConnectionId = normalizeString(connectionId, 96);
    if (!cleanConnectionId) {
      return { ok: false, errorCode: "invalid_connection" };
    }

    room.members.add(cleanConnectionId);
    room.names.set(cleanConnectionId, normalizeUserName(userName));
    room.memberJoinedAt.set(cleanConnectionId, Date.now());
    room.memberVoiceChannel.delete(cleanConnectionId);

    return {
      ok: true,
      roomId: room.id,
      selfId: cleanConnectionId,
      authorId: normalizeString(authorId, 96) || cleanConnectionId,
      room: this.serializeRoomForMember(room.id, cleanConnectionId),
    };
  }

  removeConnection(connectionId) {
    const cleanConnectionId = normalizeString(connectionId, 96);
    if (!cleanConnectionId) {
      return [];
    }

    const updates = [];

    for (const room of this.rooms.values()) {
      if (!room.members.has(cleanConnectionId)) {
        continue;
      }

      room.members.delete(cleanConnectionId);
      room.names.delete(cleanConnectionId);
      room.memberJoinedAt.delete(cleanConnectionId);

      const channelId = room.memberVoiceChannel.get(cleanConnectionId);
      room.memberVoiceChannel.delete(cleanConnectionId);
      if (channelId && room.voiceChannels.has(channelId)) {
        const channel = room.voiceChannels.get(channelId);
        channel.members.delete(cleanConnectionId);
        if (channel.hostId === cleanConnectionId) {
          promoteChannelHost(room, channelId);
        }
      }

      if (room.hostId === cleanConnectionId) {
        room.hostId = null;
        for (const channel of room.voiceChannels.values()) {
          if (channel.hostId) {
            room.hostId = channel.hostId;
            break;
          }
        }
      }

      updates.push({
        roomId: room.id,
        room: cloneRoomState(room),
        leftPeerId: cleanConnectionId,
      });

      if (room.members.size === 0) {
        this.rooms.delete(room.id);
      }
    }

    return updates;
  }

  leaveRoom(roomId, memberId) {
    const room = this.getRoom(roomId);
    const cleanMemberId = normalizeString(memberId, 96);
    if (!room || !cleanMemberId || !room.members.has(cleanMemberId)) {
      return { ok: false, errorCode: "room_not_found" };
    }

    room.members.delete(cleanMemberId);
    room.names.delete(cleanMemberId);
    room.memberJoinedAt.delete(cleanMemberId);
    const channelId = room.memberVoiceChannel.get(cleanMemberId);
    room.memberVoiceChannel.delete(cleanMemberId);
    if (channelId && room.voiceChannels.has(channelId)) {
      const channel = room.voiceChannels.get(channelId);
      channel.members.delete(cleanMemberId);
      if (channel.hostId === cleanMemberId) {
        promoteChannelHost(room, channelId);
      }
    }

    if (room.hostId === cleanMemberId) {
      room.hostId = null;
      for (const channel of room.voiceChannels.values()) {
        if (channel.hostId) {
          room.hostId = channel.hostId;
          break;
        }
      }
    }

    const snapshot = cloneRoomState(room);

    if (room.members.size === 0) {
      this.rooms.delete(room.id);
    }

    return {
      ok: true,
      roomId: room.id,
      leftPeerId: cleanMemberId,
      room: snapshot,
    };
  }

  serializeRoomForMember(roomId, memberId) {
    const room = this.getRoom(roomId);
    if (!room || !room.members.has(memberId)) {
      return null;
    }

    const snapshot = cloneRoomState(room);
    return {
      ...snapshot,
      messages: room.messages.slice(-this.maxChatMessages),
      selfId: memberId,
    };
  }

  moveMemberToVoiceChannel(roomId, memberId, channelId) {
    const room = this.getRoom(roomId);
    const cleanMemberId = normalizeString(memberId, 96);
    const cleanChannelId = normalizeString(channelId, 40);
    if (!room || !cleanMemberId || !cleanChannelId || !room.members.has(cleanMemberId)) {
      return { ok: false, errorCode: "invalid_move" };
    }

    if (!room.voiceChannels.has(cleanChannelId)) {
      room.voiceChannels.set(cleanChannelId, createVoiceChannel(cleanChannelId, cleanChannelId));
    }

    const currentChannelId = room.memberVoiceChannel.get(cleanMemberId);
    if (currentChannelId && room.voiceChannels.has(currentChannelId)) {
      const current = room.voiceChannels.get(currentChannelId);
      current.members.delete(cleanMemberId);
      if (current.hostId === cleanMemberId) {
        promoteChannelHost(room, currentChannelId);
      }
    }

    const nextChannel = room.voiceChannels.get(cleanChannelId);
    nextChannel.members.add(cleanMemberId);
    room.memberVoiceChannel.set(cleanMemberId, cleanChannelId);

    if (!nextChannel.hostId || !nextChannel.members.has(nextChannel.hostId)) {
      promoteChannelHost(room, cleanChannelId);
    }

    return {
      ok: true,
      roomId: room.id,
      channelId: cleanChannelId,
      hostId: room.hostId,
      room: cloneRoomState(room),
    };
  }

  leaveVoiceChannel(roomId, memberId) {
    const room = this.getRoom(roomId);
    const cleanMemberId = normalizeString(memberId, 96);
    if (!room || !cleanMemberId || !room.members.has(cleanMemberId)) {
      return { ok: false, errorCode: "invalid_leave_voice" };
    }

    const currentChannelId = room.memberVoiceChannel.get(cleanMemberId);
    if (!currentChannelId || !room.voiceChannels.has(currentChannelId)) {
      return { ok: false, errorCode: "not_in_voice" };
    }

    const channel = room.voiceChannels.get(currentChannelId);
    channel.members.delete(cleanMemberId);
    room.memberVoiceChannel.delete(cleanMemberId);
    if (channel.hostId === cleanMemberId) {
      promoteChannelHost(room, currentChannelId);
    }

    return {
      ok: true,
      roomId: room.id,
      room: cloneRoomState(room),
    };
  }

  createVoiceChannel(roomId, preferredName = "") {
    const room = this.getRoom(roomId);
    if (!room) {
      return { ok: false, errorCode: "room_not_found" };
    }

    let nextId = "4";
    for (let i = 1; i < 200; i += 1) {
      const candidate = String(i);
      if (!room.voiceChannels.has(candidate)) {
        nextId = candidate;
        break;
      }
    }

    const cleanName = normalizeString(preferredName, 40) || `Room ${nextId}`;
    room.voiceChannels.set(nextId, createVoiceChannel(nextId, cleanName));

    return {
      ok: true,
      roomId: room.id,
      channelId: nextId,
      room: cloneRoomState(room),
    };
  }

  renameVoiceChannel(roomId, channelId, nextName) {
    const room = this.getRoom(roomId);
    const cleanChannelId = normalizeString(channelId, 40);
    if (!room || !cleanChannelId || !room.voiceChannels.has(cleanChannelId)) {
      return { ok: false, errorCode: "channel_not_found" };
    }

    const cleanName = normalizeString(nextName, 40);
    if (!cleanName) {
      return { ok: false, errorCode: "invalid_channel_name" };
    }

    room.voiceChannels.get(cleanChannelId).name = cleanName;
    return {
      ok: true,
      roomId: room.id,
      room: cloneRoomState(room),
    };
  }

  deleteVoiceChannel(roomId, channelId) {
    const room = this.getRoom(roomId);
    const cleanChannelId = normalizeString(channelId, 40);
    if (!room || !cleanChannelId || !room.voiceChannels.has(cleanChannelId)) {
      return { ok: false, errorCode: "channel_not_found" };
    }

    const channel = room.voiceChannels.get(cleanChannelId);
    if (channel.members.size > 0) {
      return { ok: false, errorCode: "channel_not_empty" };
    }

    room.voiceChannels.delete(cleanChannelId);
    if (room.voiceChannels.size === 0) {
      ensureDefaultChannels(room);
    }

    return {
      ok: true,
      roomId: room.id,
      room: cloneRoomState(room),
    };
  }

  areMembersInSameVoiceChannel(roomId, leftMemberId, rightMemberId) {
    const room = this.getRoom(roomId);
    if (!room) {
      return false;
    }

    const leftChannel = room.memberVoiceChannel.get(normalizeString(leftMemberId, 96)) || null;
    const rightChannel = room.memberVoiceChannel.get(normalizeString(rightMemberId, 96)) || null;
    return Boolean(leftChannel && rightChannel && leftChannel === rightChannel);
  }

  appendRelayEnvelope(roomId, envelope) {
    const room = this.getRoom(roomId);
    const sanitizedEnvelope = sanitizeRelayEnvelope(envelope);
    if (!room || !sanitizedEnvelope || sanitizedEnvelope.roomId !== room.id) {
      return { ok: false, errorCode: "invalid_envelope" };
    }

    room.messages.push(sanitizedEnvelope);
    this.messageIndex.set(`${room.id}:${sanitizedEnvelope.messageId}`, sanitizedEnvelope);

    if (room.messages.length > this.maxChatMessages) {
      const removed = room.messages.splice(0, room.messages.length - this.maxChatMessages);
      for (const message of removed) {
        this.messageIndex.delete(`${room.id}:${message.messageId}`);
      }
    }

    return {
      ok: true,
      roomId: room.id,
      envelope: sanitizedEnvelope,
    };
  }

  updateRelayEnvelope(roomId, messageId, envelope) {
    const room = this.getRoom(roomId);
    const cleanMessageId = normalizeMessageId(messageId);
    const sanitizedEnvelope = sanitizeRelayEnvelope(envelope);
    if (!room || !cleanMessageId || !sanitizedEnvelope || sanitizedEnvelope.messageId !== cleanMessageId) {
      return { ok: false, errorCode: "invalid_message_update" };
    }

    const index = room.messages.findIndex((item) => item.messageId === cleanMessageId);
    if (index < 0) {
      return { ok: false, errorCode: "message_not_found" };
    }

    room.messages[index] = sanitizedEnvelope;
    this.messageIndex.set(`${room.id}:${cleanMessageId}`, sanitizedEnvelope);

    return {
      ok: true,
      roomId: room.id,
      messageId: cleanMessageId,
      envelope: sanitizedEnvelope,
    };
  }

  deleteRelayEnvelope(roomId, messageId) {
    const room = this.getRoom(roomId);
    const cleanMessageId = normalizeMessageId(messageId);
    if (!room || !cleanMessageId) {
      return { ok: false, errorCode: "invalid_message_delete" };
    }

    const index = room.messages.findIndex((item) => item.messageId === cleanMessageId);
    if (index < 0) {
      return { ok: false, errorCode: "message_not_found" };
    }

    room.messages.splice(index, 1);
    this.messageIndex.delete(`${room.id}:${cleanMessageId}`);

    return {
      ok: true,
      roomId: room.id,
      messageId: cleanMessageId,
    };
  }

  listRecentRelayEnvelopes(roomId, limit = 500) {
    const room = this.getRoom(roomId);
    if (!room) {
      return [];
    }

    const maxRows = Math.max(1, Math.min(1000, Math.round(Number(limit) || 500)));
    return room.messages.slice(-maxRows);
  }

  getRoomMembers(roomId) {
    const room = this.getRoom(roomId);
    if (!room) {
      return [];
    }

    return Array.from(room.members);
  }
}
