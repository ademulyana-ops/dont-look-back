export type SurfaceType = 'wood' | 'tile' | 'concrete';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private noiseNode: AudioNode | null = null;
  private isInitialized = false;
  private isMuted = false;

  private lastHeartbeatTime = 0;
  private lastDripTime = 0;
  private lastCreakTime = 0;

  public init(): void {
    if (this.isInitialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.75;
      this.masterGain.connect(this.ctx.destination);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.value = 0.25;
      this.ambientGain.connect(this.masterGain);

      this.startAmbientDrone();
      this.isInitialized = true;
    } catch {
      // Graceful fallback if Web Audio is blocked
    }
  }

  public resume(): void {
    if (!this.isInitialized) {
      this.init();
    } else if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setPaused(paused: boolean): void {
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    this.ambientGain.gain.cancelScheduledValues(now);
    this.ambientGain.gain.setTargetAtTime(paused ? 0.05 : 0.28, now, 0.25);
  }

  private startAmbientDrone(): void {
    if (!this.ctx || !this.ambientGain) return;

    // Low ominous sub-bass drone
    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc2 = this.ctx.createOscillator();
    const droneFilter = this.ctx.createBiquadFilter();
    const droneSubGain = this.ctx.createGain();

    this.droneOsc1.type = 'sawtooth';
    this.droneOsc1.frequency.value = 46.25; // F#1
    this.droneOsc2.type = 'triangle';
    this.droneOsc2.frequency.value = 49.0; // G1 slight dissonance

    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 135;
    droneFilter.Q.value = 4.0;

    droneSubGain.gain.value = 0.35;

    this.droneOsc1.connect(droneFilter);
    this.droneOsc2.connect(droneFilter);
    droneFilter.connect(droneSubGain);
    droneSubGain.connect(this.ambientGain);

    this.droneOsc1.start();
    this.droneOsc2.start();

    // Filtered pink/brown wind noise
    const bufferSize = this.ctx.sampleRate * 3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 1.8;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 210;
    windFilter.Q.value = 1.5;

    const windGain = this.ctx.createGain();
    windGain.gain.value = 0.22;

    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.ambientGain);
    noise.start();
    this.noiseNode = noise;
  }

  public updateAmbience(
    elapsedTime: number,
    inBasement: boolean,
    inBathroom: boolean,
    monsterDistance: number,
    monsterActive: boolean
  ): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    // Modulate drone pitch slightly for basement cold isolation
    if (this.droneOsc1 && this.droneOsc2) {
      const targetFreq1 = inBasement ? 38.89 : 46.25;
      const targetFreq2 = inBasement ? 41.2 : 49.0;
      this.droneOsc1.frequency.setTargetAtTime(targetFreq1, this.ctx.currentTime, 0.5);
      this.droneOsc2.frequency.setTargetAtTime(targetFreq2, this.ctx.currentTime, 0.5);
    }

    // Bathroom water drip
    if (inBathroom && elapsedTime - this.lastDripTime > 2.4 + Math.random() * 1.5) {
      this.lastDripTime = elapsedTime;
      this.playWaterDrip(0.25);
    }

    // Occasional distant house creak
    if (elapsedTime - this.lastCreakTime > 11 + Math.random() * 9) {
      this.lastCreakTime = elapsedTime;
      this.playWoodCreak(0.14);
    }

    // Monster proximity heartbeat & static tension
    if (monsterActive && monsterDistance < 14) {
      const proximity = Math.max(0, Math.min(1, 1 - monsterDistance / 14));
      const beatInterval = Math.max(0.32, 1.05 - proximity * 0.7);
      if (elapsedTime - this.lastHeartbeatTime >= beatInterval) {
        this.lastHeartbeatTime = elapsedTime;
        this.playHeartbeat(0.15 + proximity * 0.45);
      }
    }
  }

  public playFootstep(surface: SurfaceType, sprinting: boolean): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    const vol = sprinting ? 0.28 : 0.16;
    const pitchJitter = 0.92 + Math.random() * 0.16;

    if (surface === 'wood') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(95 * pitchJitter, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.09);
      filter.type = 'lowpass';
      filter.frequency.value = 320;
    } else if (surface === 'tile') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(190 * pitchJitter, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.07);
      filter.type = 'bandpass';
      filter.frequency.value = 650;
    } else {
      // concrete
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80 * pitchJitter, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.08);
      filter.type = 'lowpass';
      filter.frequency.value = 260;
    }

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playFlashlightClick(on: boolean): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(on ? 1450 : 1100, now);
    osc.frequency.exponentialRampToValueAtTime(on ? 2100 : 750, now + 0.025);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.035);
  }

  public playPendantPickup(count: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Metallic eerie chime + low dread sting
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((f, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * (1 + count * 0.03), now + idx * 0.06);

      gain.gain.setValueAtTime(0.16, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 1.1);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 1.15);
    });

    // If first piece, play a deep ominous horn awakening The Watcher
    if (count === 1) {
      const horn = this.ctx.createOscillator();
      const hornGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      horn.type = 'sawtooth';
      horn.frequency.setValueAtTime(65.41, now + 0.2);
      horn.frequency.linearRampToValueAtTime(55.0, now + 2.4);

      filter.type = 'lowpass';
      filter.frequency.value = 180;

      hornGain.gain.setValueAtTime(0.01, now + 0.2);
      hornGain.gain.linearRampToValueAtTime(0.32, now + 0.6);
      hornGain.gain.exponentialRampToValueAtTime(0.001, now + 2.6);

      horn.connect(filter);
      filter.connect(hornGain);
      hornGain.connect(this.masterGain);

      horn.start(now + 0.2);
      horn.stop(now + 2.65);
    }
  }

  public playDoorLocked(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    for (let i = 0; i < 2; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(125 - i * 20, now + i * 0.11);
      osc.frequency.exponentialRampToValueAtTime(42, now + i * 0.11 + 0.08);

      gain.gain.setValueAtTime(0.3, now + i * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.11 + 0.09);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + i * 0.11);
      osc.stop(now + i * 0.11 + 0.1);
    }
  }

  public playDoorUnlockedCue(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Heavy mechanical bolt unsealing sound
    const notes = [220, 277.18, 329.63, 440];
    notes.forEach((n, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n, now + idx * 0.12);

      gain.gain.setValueAtTime(0.22, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.9);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.95);
    });
  }

  public playJumpscare(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Dissonant shriek chord + low impact
    const shriekFreqs = [311.13, 329.63, 466.16, 622.25, 880, 932.33];
    shriekFreqs.forEach((freq) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.82, now + 0.85);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.92);
    });
  }

  public playVictoryChord(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const chord = [261.63, 329.63, 392.0, 523.25];
    chord.forEach((freq) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 2.9);
    });
  }

  public playWaterDrip(volume = 0.2): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(1650, now + 0.045);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playWoodCreak(volume = 0.16): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(75, now);
    osc.frequency.linearRampToValueAtTime(52, now + 0.25);
    osc.frequency.linearRampToValueAtTime(68, now + 0.5);

    filter.type = 'bandpass';
    filter.frequency.value = 240;
    filter.Q.value = 3.0;

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  public playHeartbeat(volume = 0.25): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const playBeat = (delay: number, mult: number) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(62, now + delay);
      osc.frequency.exponentialRampToValueAtTime(28, now + delay + 0.12);

      gain.gain.setValueAtTime(volume * mult, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.14);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + delay);
      osc.stop(now + delay + 0.15);
    };

    playBeat(0, 1.0);
    playBeat(0.16, 0.65);
  }

  public playMonsterStep(distance: number): void {
    if (!this.ctx || !this.masterGain || this.isMuted || distance > 18) return;
    const vol = Math.max(0.02, (1 - distance / 18) * 0.28);
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(58, now);
    osc.frequency.exponentialRampToValueAtTime(22, now + 0.14);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playCatMeow(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(510, now);
    osc.frequency.linearRampToValueAtTime(680, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.52);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(850, now);
    filter.Q.value = 3.5;

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.58);
  }

  public playBatFlutter(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.07;
      osc.frequency.setValueAtTime(2900 + i * 250, t);
      osc.frequency.exponentialRampToValueAtTime(1400, t + 0.05);

      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.06);
    }
  }

  public playRatSqueak(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2100, now);
    osc.frequency.exponentialRampToValueAtTime(2800, now + 0.04);
    osc.frequency.exponentialRampToValueAtTime(1750, now + 0.09);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playNoteInspect(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Paper rustle noise burst + low eerie chime
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.16);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1650, now);
    filter.Q.value = 1.8;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);

    const chime = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(392, now);
    chime.frequency.exponentialRampToValueAtTime(293.66, now + 0.35);
    chimeGain.gain.setValueAtTime(0.08, now);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    chime.connect(chimeGain);
    chimeGain.connect(this.masterGain);
    chime.start(now);
    chime.stop(now + 0.38);
  }

  public playWakeUpGasp(): void {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    const now = this.ctx.currentTime;

    // 1. Sudden sharp intake of breath (filtered noise swell)
    const breathDur = 0.55;
    const bufferSize = Math.floor(this.ctx.sampleRate * breathDur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, now);
    filter.frequency.exponentialRampToValueAtTime(1350, now + 0.25);
    filter.frequency.exponentialRampToValueAtTime(820, now + breathDur);
    filter.Q.value = 3.2;

    const breathGain = this.ctx.createGain();
    breathGain.gain.setValueAtTime(0.01, now);
    breathGain.gain.linearRampToValueAtTime(0.28, now + 0.14);
    breathGain.gain.exponentialRampToValueAtTime(0.001, now + breathDur);

    noise.connect(filter);
    filter.connect(breathGain);
    breathGain.connect(this.masterGain);
    noise.start(now);

    // 2. Rapid panicked heartbeat thuds on waking up
    const beatOffsets = [0.05, 0.28, 0.85, 1.1];
    for (const offset of beatOffsets) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const t = now + offset;
      osc.frequency.setValueAtTime(68, t);
      osc.frequency.exponentialRampToValueAtTime(28, t + 0.18);

      gain.gain.setValueAtTime(0.32, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.22);
    }

    // 3. Subtle wooden bed frame creak as player jolts upright
    const creak = this.ctx.createOscillator();
    const creakGain = this.ctx.createGain();
    creak.type = 'triangle';
    creak.frequency.setValueAtTime(165, now + 0.25);
    creak.frequency.exponentialRampToValueAtTime(92, now + 0.65);
    creakGain.gain.setValueAtTime(0.08, now + 0.25);
    creakGain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
    creak.connect(creakGain);
    creakGain.connect(this.masterGain);
    creak.start(now + 0.25);
    creak.stop(now + 0.7);
  }

  public dispose(): void {
    try {
      this.droneOsc1?.stop();
      this.droneOsc2?.stop();
      if (this.noiseNode && 'stop' in this.noiseNode) {
        (this.noiseNode as AudioBufferSourceNode).stop();
      }
      this.ctx?.close();
    } catch {
      // ignore cleanup errors
    }
  }
}
