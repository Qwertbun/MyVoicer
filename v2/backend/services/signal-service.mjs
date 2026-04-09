import { normalizeRoomId, normalizeString } from "../protocol/runtime.mjs";

export class SignalService {
  constructor({ roomService, presenceService } = {}) {
    this.roomService = roomService;
    this.presenceService = presenceService;
  }

  validateSignal({ fromId, toId, roomId }) {
    const cleanFromId = normalizeString(fromId, 96);
    const cleanToId = normalizeString(toId, 96);
    const cleanRoomId = normalizeRoomId(roomId);

    if (!cleanFromId || !cleanToId || !cleanRoomId) {
      return { ok: false, errorCode: "invalid_signal" };
    }

    const fromConnection = this.presenceService.getConnection(cleanFromId);
    const toConnection = this.presenceService.getConnection(cleanToId);
    if (!fromConnection || !toConnection) {
      return { ok: false, errorCode: "peer_not_found" };
    }

    if (fromConnection.roomId !== cleanRoomId || toConnection.roomId !== cleanRoomId) {
      return { ok: false, errorCode: "peer_not_in_room" };
    }

    const canSignal = this.roomService.areMembersInSameVoiceChannel(
      cleanRoomId,
      cleanFromId,
      cleanToId
    );
    if (!canSignal) {
      return { ok: false, errorCode: "voice_channel_mismatch" };
    }

    return {
      ok: true,
      fromId: cleanFromId,
      toId: cleanToId,
      roomId: cleanRoomId,
    };
  }
}
