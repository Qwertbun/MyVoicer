const SVG_NS = "http://www.w3.org/2000/svg";

// Centralized controls for timing, visual complexity, and audio behavior. 1.75
const BOOT_CONFIG = {
  playback: {
    timelineScale: 2.00,
  },
  timeline: {
    core: 750,
    firstHex: 1700,
    grid: 2900,
    dataFlow: 3900,
    hero: 5100,
    title: 6200,
    bootMessage: 7100,
    complete: 10500,
    online: 11350,
  },
  network: {
    radius: 4,
    cellSize: 82,
  },
  dataPulses: {
    count: 26,
    minSpeed: 0.18,
    maxSpeed: 0.44,
  },
  particles: {
    count: 88,
    maxOrbit: 560,
  },
  parallax: {
    maxX: 0.66,
    maxY: 0.5,
    smoothing: 0.095,
  },
  audio: {
    masterVolume: 0.34,
    humLevel: 0.2,
    tickDivisions: 28,
    autoStartSyncPercent: 0.2,
  },
};

function timelineMs(key) {
  return BOOT_CONFIG.timeline[key] * BOOT_CONFIG.playback.timelineScale;
}

const ui = {
  screen: document.getElementById("boot-screen"),
  networkSvg: document.getElementById("network-svg"),
  linksLayer: document.getElementById("network-links"),
  cellsLayer: document.getElementById("network-cells"),
  pulsesLayer: document.getElementById("network-pulses"),
  statusSub: document.getElementById("status-sub"),
  progressRing: document.getElementById("progress-ring"),
  progressValue: document.getElementById("progress-value"),
  syncReadout: document.getElementById("sync-readout"),
  particleCanvas: document.getElementById("particle-canvas"),
  audioToggle: document.getElementById("audio-toggle"),
};

const state = {
  startTime: performance.now(),
  lastFrameTime: performance.now(),
  progressNormalized: 0,
  dataFlowActive: false,
  completionReached: false,
  onlineActive: false,
  audioAutoStartTriggered: false,
  reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  parallaxTargetX: 0,
  parallaxTargetY: 0,
  parallaxCurrentX: 0,
  parallaxCurrentY: 0,
  lastPointerAt: 0,
  linkSegments: [],
  pulseNodes: [],
  particles: [],
};

function initializeBoot() {
  setupProgressRing();
  buildNetwork();
  createDataPulseNodes();
  setupParticles();
  setupParallax();

  state.audio = new BootAudioEngine(ui.audioToggle, BOOT_CONFIG.audio);
  state.audio.initialize();

  if (state.reduceMotion) {
    forceOnlineState();
    renderFrame(performance.now());
    return;
  }

  queueTimeline();
  requestAnimationFrame(renderFrame);
}

function queueTimeline() {
  const phases = [
    {
      at: timelineMs("core"),
      run: () => {
        ui.screen.classList.add("phase-core");
        state.audio.setHumActive(true);
      },
    },
    { at: timelineMs("firstHex"), run: () => ui.screen.classList.add("phase-first-hex") },
    { at: timelineMs("grid"), run: () => ui.screen.classList.add("phase-grid") },
    {
      at: timelineMs("dataFlow"),
      run: () => {
        ui.screen.classList.add("phase-data");
        state.dataFlowActive = true;
        state.audio.setTickingActive(true);
      },
    },
    { at: timelineMs("hero"), run: () => ui.screen.classList.add("phase-hero") },
    { at: timelineMs("title"), run: () => ui.screen.classList.add("phase-title") },
    { at: timelineMs("bootMessage"), run: () => (ui.statusSub.textContent = "Boot sequence...") },
    {
      at: timelineMs("complete"),
      run: () => {
        ui.screen.classList.add("phase-complete");
        state.completionReached = true;
        state.audio.setTickingActive(false);
        state.audio.playStinger();
      },
    },
    {
      at: timelineMs("online"),
      run: () => {
        ui.screen.classList.add("phase-online");
        state.onlineActive = true;
      },
    },
  ];

  phases.forEach((phase) => {
    window.setTimeout(phase.run, phase.at);
  });
}

function setupProgressRing() {
  const radius = Number(ui.progressRing.getAttribute("r"));
  const circumference = 2 * Math.PI * radius;
  ui.progressRing.style.strokeDasharray = `${circumference.toFixed(2)}`;
  ui.progressRing.style.strokeDashoffset = `${circumference.toFixed(2)}`;
  state.progressCircumference = circumference;
}

function buildNetwork() {
  if (!ui.cellsLayer || !ui.linksLayer) {
    return;
  }

  const radius = BOOT_CONFIG.network.radius;
  const size = BOOT_CONFIG.network.cellSize;
  const coords = [];
  const coordsByKey = new Map();

  for (let q = -radius; q <= radius; q += 1) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);

    for (let r = rMin; r <= rMax; r += 1) {
      const point = axialToPixel(q, r, size);
      const ringDistance = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
      const coord = { q, r, x: point.x, y: point.y, ringDistance };
      coords.push(coord);
      coordsByKey.set(`${q},${r}`, coord);
    }
  }

  for (const coord of coords) {
    const polygon = document.createElementNS(SVG_NS, "polygon");
    polygon.setAttribute("class", "hex-cell");
    polygon.setAttribute("points", hexPoints(coord.x, coord.y, size * 0.92));
    polygon.style.setProperty("--reveal-delay", `${coord.ringDistance * 110 + randomRange(0, 90)}ms`);
    ui.cellsLayer.appendChild(polygon);
  }

  const uniqueNeighborDirections = [
    [1, 0],
    [1, -1],
    [0, -1],
  ];

  for (const coord of coords) {
    for (const [dq, dr] of uniqueNeighborDirections) {
      const neighbor = coordsByKey.get(`${coord.q + dq},${coord.r + dr}`);
      if (!neighbor) {
        continue;
      }

      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("class", "link-line");
      line.setAttribute("x1", `${coord.x.toFixed(2)}`);
      line.setAttribute("y1", `${coord.y.toFixed(2)}`);
      line.setAttribute("x2", `${neighbor.x.toFixed(2)}`);
      line.setAttribute("y2", `${neighbor.y.toFixed(2)}`);
      line.style.setProperty("--link-delay", `${coord.ringDistance * 80 + randomRange(0, 70)}ms`);
      line.style.setProperty("--flow-delay", `${randomRange(0, 1900)}ms`);
      ui.linksLayer.appendChild(line);

      state.linkSegments.push({
        x1: coord.x,
        y1: coord.y,
        x2: neighbor.x,
        y2: neighbor.y,
      });
    }
  }
}

function createDataPulseNodes() {
  if (!ui.pulsesLayer || state.linkSegments.length === 0) {
    return;
  }

  for (let i = 0; i < BOOT_CONFIG.dataPulses.count; i += 1) {
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("class", "pulse-dot");
    dot.setAttribute("r", i % 3 === 0 ? "2.4" : "1.8");
    dot.setAttribute("cx", "0");
    dot.setAttribute("cy", "0");
    ui.pulsesLayer.appendChild(dot);

    state.pulseNodes.push({
      el: dot,
      link: pickRandom(state.linkSegments),
      progress: Math.random(),
      speed: randomRange(BOOT_CONFIG.dataPulses.minSpeed, BOOT_CONFIG.dataPulses.maxSpeed),
    });
  }
}

function setupParticles() {
  const canvas = ui.particleCanvas;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  state.particleContext = context;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener("resize", resize);
  resize();

  state.particles = Array.from({ length: BOOT_CONFIG.particles.count }, () => {
    return {
      orbit: randomRange(70, BOOT_CONFIG.particles.maxOrbit),
      angle: randomRange(0, Math.PI * 2),
      speed: randomRange(0.09, 0.33),
      radius: randomRange(0.6, 1.8),
      hueMix: Math.random(),
      twinkle: randomRange(0.4, 1.5),
      wobble: randomRange(8, 32),
      phase: randomRange(0, Math.PI * 2),
      x: 0,
      y: 0,
    };
  });
}

function setupParallax() {
  window.addEventListener(
    "pointermove",
    (event) => {
      const px = (event.clientX / window.innerWidth) * 2 - 1;
      const py = (event.clientY / window.innerHeight) * 2 - 1;
      state.parallaxTargetX = px * BOOT_CONFIG.parallax.maxX;
      state.parallaxTargetY = py * BOOT_CONFIG.parallax.maxY;
      state.lastPointerAt = performance.now();
    },
    { passive: true }
  );
}

function renderFrame(now) {
  const deltaMs = Math.min(64, now - state.lastFrameTime);
  const deltaSeconds = deltaMs / 1000;
  const elapsed = now - state.startTime;
  state.lastFrameTime = now;

  updateParallax(now);
  updateProgress(elapsed);
  maybeAutoStartAudio();
  updateDataPulses(deltaSeconds);
  drawParticles(elapsed, deltaSeconds);
  state.audio.onProgress(state.progressNormalized, state.dataFlowActive, state.completionReached);

  if (!state.reduceMotion) {
    requestAnimationFrame(renderFrame);
  }
}

function maybeAutoStartAudio() {
  if (state.audioAutoStartTriggered || !state.audio) {
    return;
  }

  // SYNC label uses normalized * 99.8, so convert target percent to normalized threshold.
  const threshold = BOOT_CONFIG.audio.autoStartSyncPercent / 99.8;
  if (state.progressNormalized < threshold) {
    return;
  }

  state.audioAutoStartTriggered = true;
  state.audio.requestAutoStartAtSync();
}

function updateParallax(now) {
  if (now - state.lastPointerAt > 2200) {
    // Idle drift gives depth even when the pointer does not move.
    state.parallaxTargetX = Math.sin(now * 0.00024) * 0.22;
    state.parallaxTargetY = Math.cos(now * 0.00018) * 0.16;
  }

  const smooth = BOOT_CONFIG.parallax.smoothing;
  state.parallaxCurrentX += (state.parallaxTargetX - state.parallaxCurrentX) * smooth;
  state.parallaxCurrentY += (state.parallaxTargetY - state.parallaxCurrentY) * smooth;

  ui.screen.style.setProperty("--parallax-x", state.parallaxCurrentX.toFixed(4));
  ui.screen.style.setProperty("--parallax-y", state.parallaxCurrentY.toFixed(4));
}

function updateProgress(elapsed) {
  const scale = BOOT_CONFIG.playback.timelineScale;
  const start = timelineMs("core") * 0.6;
  const end = timelineMs("complete") - 280 * scale;
  let normalized = clamp((elapsed - start) / (end - start), 0, 1);
  normalized = easeInOutCubic(normalized);

  if (state.completionReached) {
    normalized = 1;
  }

  state.progressNormalized = normalized;

  const dashOffset = state.progressCircumference * (1 - normalized);
  ui.progressRing.style.strokeDashoffset = `${dashOffset.toFixed(2)}`;

  const percentage = Math.round(normalized * 100);
  ui.progressValue.textContent = `${percentage}`.padStart(3, "0");
  ui.syncReadout.textContent = `SYNC ${(normalized * 99.8).toFixed(1)}%`;
}

function updateDataPulses(deltaSeconds) {
  if (!state.dataFlowActive || state.linkSegments.length === 0) {
    return;
  }

  for (const pulse of state.pulseNodes) {
    if (!pulse.link) {
      continue;
    }

    pulse.progress += pulse.speed * deltaSeconds;
    if (pulse.progress >= 1) {
      pulse.progress = 0;
      pulse.link = pickRandom(state.linkSegments);
      pulse.speed = randomRange(BOOT_CONFIG.dataPulses.minSpeed, BOOT_CONFIG.dataPulses.maxSpeed);
    }

    const x = lerp(pulse.link.x1, pulse.link.x2, pulse.progress);
    const y = lerp(pulse.link.y1, pulse.link.y2, pulse.progress);
    pulse.el.setAttribute("cx", `${x.toFixed(2)}`);
    pulse.el.setAttribute("cy", `${y.toFixed(2)}`);
  }
}

function drawParticles(elapsed, deltaSeconds) {
  const ctx = state.particleContext;
  if (!ctx) {
    return;
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  ctx.clearRect(0, 0, width, height);

  const centerX = width * 0.5;
  const centerY = height * 0.47;
  const scale = BOOT_CONFIG.playback.timelineScale;
  const visibility = clamp(
    (elapsed - timelineMs("dataFlow") + 900 * scale) / (2600 * scale),
    0,
    1
  );
  const globalAlpha = visibility * (state.completionReached ? 0.56 : 0.9);

  for (const p of state.particles) {
    const prevX = p.x;
    const prevY = p.y;
    p.angle += p.speed * deltaSeconds;
    const wobbleOffset = Math.sin(elapsed * 0.001 * p.twinkle + p.phase) * p.wobble;
    const orbit = p.orbit + wobbleOffset * 0.22;

    p.x = centerX + Math.cos(p.angle) * orbit;
    p.y = centerY + Math.sin(p.angle * 1.08 + p.phase) * orbit * 0.58;

    const brightness = 0.35 + 0.65 * Math.abs(Math.sin(elapsed * 0.0012 * p.twinkle + p.phase));
    const alpha = globalAlpha * brightness;

    const cyanWeight = 1 - p.hueMix;
    const r = 88 + Math.round(98 * p.hueMix);
    const g = 180 + Math.round(68 * cyanWeight);
    const b = 255;

    if (prevX !== 0 || prevY !== 0) {
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.35})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    ctx.shadowBlur = 10;
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
}

function forceOnlineState() {
  ui.screen.classList.add(
    "phase-core",
    "phase-first-hex",
    "phase-grid",
    "phase-data",
    "phase-hero",
    "phase-title",
    "phase-complete",
    "phase-online"
  );
  state.dataFlowActive = true;
  state.completionReached = true;
  state.onlineActive = true;
  ui.statusSub.textContent = "Boot sequence...";
  ui.progressValue.textContent = "100";
  ui.syncReadout.textContent = "SYNC 99.8%";
  ui.progressRing.style.strokeDashoffset = "0";
}

function axialToPixel(q, r, size) {
  const x = size * Math.sqrt(3) * (q + r / 2);
  const y = size * 1.5 * r;
  return { x, y };
}

function hexPoints(cx, cy, radius) {
  const points = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = ((60 * i - 30) * Math.PI) / 180;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(" ");
}

class BootAudioEngine {
  constructor(toggleButton, config) {
    this.toggleButton = toggleButton;
    this.config = config;
    this.supported = Boolean(window.AudioContext || window.webkitAudioContext);
    this.unlocked = false;
    this.muted = false;
    this.wantHum = false;
    this.tickingActive = false;
    this.lastTickBucket = -1;
    this.autoStartPending = false;
    this.deferredUnlockBound = false;
    this.context = null;
    this.masterGain = null;
    this.humGain = null;
  }

  initialize() {
    if (!this.toggleButton) {
      return;
    }

    if (!this.supported) {
      this.toggleButton.textContent = "SOUND: N/A";
      this.toggleButton.disabled = true;
      this.toggleButton.dataset.state = "locked";
      return;
    }

    this.toggleButton.addEventListener("click", () => {
      this.handleToggleClick();
    });

    this.updateToggleLabel();
  }

  async handleToggleClick() {
    if (!this.supported) {
      return;
    }

    if (!this.unlocked) {
      await this.arm(true);
      return;
    }

    this.muted = !this.muted;
    this.applyMasterGain(0.14);
    this.updateToggleLabel();
  }

  async arm(forceUnmute = false) {
    await this.ensureContext();
    if (!this.context) {
      return;
    }

    if (this.context.state !== "running") {
      await this.context.resume();
    }

    this.unlocked = true;
    this.autoStartPending = false;
    if (forceUnmute) {
      this.muted = false;
    }

    if (this.wantHum) {
      this.setHumActive(true);
    }

    this.applyMasterGain(0.22);
    this.updateToggleLabel();
  }

  requestAutoStartAtSync() {
    if (!this.supported || this.unlocked) {
      return;
    }

    this.autoStartPending = true;
    this.updateToggleLabel();

    this.arm(true).catch(() => {
      this.bindDeferredUnlock();
      this.updateToggleLabel();
    });
  }

  bindDeferredUnlock() {
    if (this.deferredUnlockBound) {
      return;
    }

    this.deferredUnlockBound = true;
    const tryUnlock = () => {
      this.arm(true).catch(() => {
        this.updateToggleLabel();
      });
      this.deferredUnlockBound = false;
    };

    window.addEventListener("pointerdown", tryUnlock, { once: true, passive: true });
    window.addEventListener("keydown", tryUnlock, { once: true });
  }

  async ensureContext() {
    if (this.context) {
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.context = new AudioCtx({ latencyHint: "interactive" });

    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.0001;
    this.masterGain.connect(this.context.destination);

    this.humGain = this.context.createGain();
    this.humGain.gain.value = 0.0001;
    this.humGain.connect(this.masterGain);

    const humLow = this.context.createOscillator();
    humLow.type = "sine";
    humLow.frequency.value = 52;

    const humMid = this.context.createOscillator();
    humMid.type = "triangle";
    humMid.frequency.value = 79;
    humMid.detune.value = 4.5;

    const humFilter = this.context.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 780;
    humFilter.Q.value = 0.6;

    const humBlend = this.context.createGain();
    humBlend.gain.value = 0.24;

    humLow.connect(humFilter);
    humMid.connect(humFilter);
    humFilter.connect(humBlend);
    humBlend.connect(this.humGain);

    const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i += 1) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.42;
    }

    const noiseSource = this.context.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const noiseFilter = this.context.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 320;
    noiseFilter.Q.value = 0.48;

    const noiseGain = this.context.createGain();
    noiseGain.gain.value = 0.02;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.humGain);

    const lfo = this.context.createOscillator();
    lfo.frequency.value = 0.27;
    const lfoGain = this.context.createGain();
    lfoGain.gain.value = 9;
    lfo.connect(lfoGain);
    lfoGain.connect(humMid.detune);

    humLow.start();
    humMid.start();
    noiseSource.start();
    lfo.start();
  }

  setHumActive(active) {
    this.wantHum = active;
    if (!this.context || !this.unlocked || !this.humGain) {
      this.updateToggleLabel();
      return;
    }

    const now = this.context.currentTime;
    const target = active && !this.muted ? this.config.humLevel : 0.0001;
    this.humGain.gain.cancelScheduledValues(now);
    this.humGain.gain.setTargetAtTime(target, now, 0.55);
    this.updateToggleLabel();
  }

  setTickingActive(active) {
    this.tickingActive = active;
    if (!active) {
      this.lastTickBucket = -1;
    }
    this.updateToggleLabel();
  }

  onProgress(normalized, dataFlowActive, completionReached) {
    if (!this.supported || !this.context || !this.unlocked || this.muted) {
      return;
    }
    if (!this.tickingActive || !dataFlowActive || completionReached) {
      return;
    }

    const bucket = Math.floor(normalized * this.config.tickDivisions);
    if (bucket > this.lastTickBucket) {
      this.lastTickBucket = bucket;
      const strength = 0.9 + Math.min(0.4, bucket / this.config.tickDivisions);
      this.playTick(strength);
    }
  }

  playTick(strength = 1) {
    if (!this.context || !this.masterGain) {
      return;
    }

    const t = this.context.currentTime + 0.004;
    const osc = this.context.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1000 + Math.random() * 160, t);
    osc.frequency.exponentialRampToValueAtTime(430, t + 0.08);

    const filter = this.context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1700, t);
    filter.Q.value = 5.6;

    const gain = this.context.createGain();
    const peak = 0.032 * strength;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.011);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  playStinger() {
    if (!this.context || !this.unlocked || this.muted || !this.masterGain) {
      return;
    }

    const t = this.context.currentTime + 0.02;
    const bus = this.context.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.exponentialRampToValueAtTime(0.14, t + 0.07);
    bus.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    bus.connect(this.masterGain);

    const oscA = this.context.createOscillator();
    oscA.type = "sawtooth";
    oscA.frequency.setValueAtTime(210, t);
    oscA.frequency.exponentialRampToValueAtTime(760, t + 0.5);

    const oscB = this.context.createOscillator();
    oscB.type = "sine";
    oscB.frequency.setValueAtTime(420, t);
    oscB.frequency.exponentialRampToValueAtTime(1280, t + 0.42);

    const shimmer = this.context.createOscillator();
    shimmer.type = "triangle";
    shimmer.frequency.setValueAtTime(980, t);
    shimmer.frequency.exponentialRampToValueAtTime(1760, t + 0.34);

    const shimmerGain = this.context.createGain();
    shimmerGain.gain.setValueAtTime(0.0001, t);
    shimmerGain.gain.exponentialRampToValueAtTime(0.02, t + 0.045);
    shimmerGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);

    const filter = this.context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2600, t);
    filter.Q.value = 0.75;

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(bus);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(bus);

    oscA.start(t);
    oscB.start(t);
    shimmer.start(t);

    oscA.stop(t + 0.92);
    oscB.stop(t + 0.84);
    shimmer.stop(t + 0.38);
  }

  applyMasterGain(rampTimeSeconds) {
    if (!this.context || !this.masterGain) {
      return;
    }

    const now = this.context.currentTime;
    const target = this.muted ? 0.0001 : this.config.masterVolume;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(target, now, Math.max(0.01, rampTimeSeconds));

    if (this.humGain) {
      const humTarget = this.wantHum && !this.muted ? this.config.humLevel : 0.0001;
      this.humGain.gain.cancelScheduledValues(now);
      this.humGain.gain.setTargetAtTime(humTarget, now, 0.55);
    }
  }

  updateToggleLabel() {
    if (!this.toggleButton) {
      return;
    }

    if (!this.supported) {
      this.toggleButton.textContent = "SOUND: N/A";
      this.toggleButton.dataset.state = "locked";
      return;
    }

    if (!this.unlocked) {
      this.toggleButton.textContent = this.autoStartPending
        ? "SOUND: WAITING GESTURE"
        : "SOUND: TAP TO ARM";
      this.toggleButton.dataset.state = "locked";
      return;
    }

    if (this.muted) {
      this.toggleButton.textContent = "SOUND: OFF";
      this.toggleButton.dataset.state = "muted";
      return;
    }

    this.toggleButton.textContent = this.tickingActive ? "SOUND: LIVE" : "SOUND: ARMED";
    this.toggleButton.dataset.state = "on";
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from, to, t) {
  return from + (to - from) * t;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

initializeBoot();
