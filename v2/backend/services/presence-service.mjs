import { normalizeRoomId, normalizeString, normalizeUserName } from "../protocol/runtime.mjs";

export class PresenceService {
  constructor() {
    this.connections = new Map();
  }

  registerConnection(connectionId) {
    const cleanConnectionId = normalizeString(connectionId, 96);
    if (!cleanConnectionId) {
      return null;
    }

    const entry = {
      id: cleanConnectionId,
      roomId: "",
      userName: "Guest",
      authorId: cleanConnectionId,
      connectedAt: Date.now(),
      watchedRoomIds: new Set(),
    };

    this.connections.set(cleanConnectionId, entry);
    return entry;
  }

  removeConnection(connectionId) {
    const cleanConnectionId = normalizeString(connectionId, 96);
    if (!cleanConnectionId) {
      return null;
    }

    const existing = this.connections.get(cleanConnectionId) || null;
    this.connections.delete(cleanConnectionId);
    return existing;
  }

  setRoomConnection(connectionId, roomId, userName = "Guest", authorId = "") {
    const cleanConnectionId = normalizeString(connectionId, 96);
    const cleanRoomId = normalizeRoomId(roomId);
    const entry = this.connections.get(cleanConnectionId);
    if (!entry || !cleanRoomId) {
      return null;
    }

    entry.roomId = cleanRoomId;
    entry.userName = normalizeUserName(userName);
    entry.authorId = normalizeString(authorId, 96) || cleanConnectionId;
    return entry;
  }

  clearRoomConnection(connectionId) {
    const cleanConnectionId = normalizeString(connectionId, 96);
    const entry = this.connections.get(cleanConnectionId);
    if (!entry) {
      return null;
    }

    entry.roomId = "";
    return entry;
  }

  setWatchedRooms(connectionId, roomIds = []) {
    const cleanConnectionId = normalizeString(connectionId, 96);
    const entry = this.connections.get(cleanConnectionId);
    if (!entry) {
      return [];
    }

    const watched = new Set();
    const input = Array.isArray(roomIds) ? roomIds : [];
    for (const roomId of input) {
      const cleanRoomId = normalizeRoomId(roomId);
      if (!cleanRoomId) {
        continue;
      }
      watched.add(cleanRoomId);
      if (watched.size >= 24) {
        break;
      }
    }

    entry.watchedRoomIds = watched;
    return Array.from(watched);
  }

  getConnection(connectionId) {
    return this.connections.get(normalizeString(connectionId, 96)) || null;
  }

  listConnectionsInRoom(roomId) {
    const cleanRoomId = normalizeRoomId(roomId);
    if (!cleanRoomId) {
      return [];
    }

    const result = [];
    for (const entry of this.connections.values()) {
      if (entry.roomId === cleanRoomId) {
        result.push(entry);
      }
    }
    return result;
  }

  listConnections() {
    return Array.from(this.connections.values());
  }
}
