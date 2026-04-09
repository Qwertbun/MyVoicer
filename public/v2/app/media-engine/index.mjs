function normalizeBoolean(value) {
  return Boolean(value);
}

export function createMediaEngine({ store }) {
  let localAudioStream = null;
  let schedulerTimer = null;
  const schedulerQueue = [];

  function queueTask(task) {
    if (typeof task !== "function") {
      return;
    }

    schedulerQueue.push(task);
    if (schedulerTimer) {
      return;
    }

    schedulerTimer = requestAnimationFrame(() => {
      schedulerTimer = null;
      const tasks = schedulerQueue.splice(0, schedulerQueue.length);
      for (const scheduledTask of tasks) {
        try {
          scheduledTask();
        } catch {
          // no-op
        }
      }
    });
  }

  async function startLocalMic() {
    if (localAudioStream) {
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
        },
      });

      localAudioStream = stream;
      queueTask(() => {
        store.setState({
          localMicActive: true,
          localMicMuted: false,
          status: "Microphone active.",
        });
      });
      return true;
    } catch (error) {
      queueTask(() => {
        store.setState({
          status: `Microphone failed: ${error?.message || error?.name || "unknown"}`,
        });
      });
      return false;
    }
  }

  async function stopLocalMic() {
    if (localAudioStream) {
      for (const track of localAudioStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // no-op
        }
      }
    }

    localAudioStream = null;
    queueTask(() => {
      store.setState({
        localMicActive: false,
        localMicMuted: false,
        status: "Microphone stopped.",
      });
    });
  }

  function setMicMuted(nextMuted) {
    const muted = normalizeBoolean(nextMuted);
    if (!localAudioStream) {
      return;
    }

    for (const track of localAudioStream.getAudioTracks()) {
      track.enabled = !muted;
    }

    queueTask(() => {
      store.setState({
        localMicMuted: muted,
        status: muted ? "Microphone muted." : "Microphone unmuted.",
      });
    });
  }

  return {
    queueTask,
    startLocalMic,
    stopLocalMic,
    setMicMuted,
  };
}
