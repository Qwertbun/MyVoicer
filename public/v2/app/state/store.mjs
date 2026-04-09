export function createStore(initialState) {
  let state = Object.freeze({ ...initialState });
  const listeners = new Set();

  function getState() {
    return state;
  }

  function setState(patchOrUpdater) {
    const patch = typeof patchOrUpdater === "function"
      ? patchOrUpdater(state)
      : patchOrUpdater;

    if (!patch || typeof patch !== "object") {
      return state;
    }

    state = Object.freeze({
      ...state,
      ...patch,
    });

    for (const listener of listeners) {
      try {
        listener(state);
      } catch {
        // no-op
      }
    }

    return state;
  }

  function subscribe(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }

  function select(selector) {
    if (typeof selector !== "function") {
      return undefined;
    }
    return selector(state);
  }

  return {
    getState,
    setState,
    subscribe,
    select,
  };
}

export function createInitialState() {
  return {
    connected: false,
    selfId: "",
    roomId: "",
    profileName: "Guest",
    roomKey: "synto-v2",
    participants: [],
    voiceChannels: [],
    activeVoiceChannelId: "",
    chatMessages: [],
    localMicActive: false,
    localMicMuted: false,
    runtimeVersion: "v2",
    status: "Disconnected",
  };
}
