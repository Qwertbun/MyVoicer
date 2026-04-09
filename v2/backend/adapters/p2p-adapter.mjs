export class P2PAdapter {
  constructor(options = {}) {
    this.enabled = Boolean(options.enabled);
  }

  async init() {}

  async joinRoom(_roomId) {
    return false;
  }

  async leaveRoom(_roomId) {
    return false;
  }

  async relaySignal(_roomId, _signalPayload) {
    return false;
  }

  async close() {}
}
