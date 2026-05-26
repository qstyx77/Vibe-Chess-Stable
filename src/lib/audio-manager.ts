/**
 * Programmatic 8-bit Audio Manager for Vibe Chess.
 * Uses Web Audio API to synthesize sounds without external assets.
 */

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isInitialized: boolean = false;
  private currentVolumePercent: number = 100; // 0 to 200

  private init() {
    if (this.isInitialized) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      // Base volume is 0.15. 100% volume = 0.15 gain.
      this.masterGain.gain.value = (this.currentVolumePercent / 100) * 0.15;
      this.masterGain.connect(this.ctx.destination);
      this.isInitialized = true;
    } catch (e) {
      console.warn("AudioContext not supported");
    }
  }

  private resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(percent: number) {
    this.currentVolumePercent = percent;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime((percent / 100) * 0.15, this.ctx.currentTime, 0.05);
    }
  }

  getVolume() {
    return this.currentVolumePercent;
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number = 1, fade: boolean = true) {
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    if (fade) {
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
    }

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playNoise(duration: number, volume: number = 1, type: 'white' | 'low' = 'white') {
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;

    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = type === 'low' ? 'lowpass' : 'bandpass';
    filter.frequency.value = type === 'low' ? 400 : 1000;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
    noise.stop(this.ctx.currentTime + duration);
  }

  // --- SOUND TRIGGERS ---

  playMove() {
    this.playTone(150, 'triangle', 0.1, 0.5);
  }

  playCapture() {
    this.playNoise(0.2, 0.8);
    this.playTone(100, 'square', 0.2, 0.4);
  }

  playObliterate() {
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;
    this.playNoise(0.5, 1.0, 'low');
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.5);
  }

  playLevelUp() {
    const now = this.ctx?.currentTime || 0;
    [440, 554, 659].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'square', 0.15, 0.4), i * 100);
    });
  }

  playShield() {
    this.playTone(880, 'sine', 0.8, 0.6);
    this.playTone(885, 'sine', 0.8, 0.4);
  }

  playSnipe() {
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(2000, now + 0.1);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.2);
  }

  playConversion() {
    this.init();
    this.resume();
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 15;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 100;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.6);
    osc.connect(gain);
    gain.connect(this.masterGain);
    lfo.start();
    osc.start();
    lfo.stop(now + 0.6);
    osc.stop(now + 0.6);
  }

  playRally() {
    this.playTone(330, 'square', 0.3, 0.5, false);
    setTimeout(() => this.playTone(440, 'square', 0.5, 0.4), 150);
  }

  playExplosion() {
    this.playNoise(0.8, 1.5, 'low');
    this.playTone(40, 'triangle', 0.8, 1.0);
  }

  playAnvil() {
    this.playNoise(0.4, 1.0, 'low');
    this.playTone(200, 'triangle', 0.5, 1.0);
    this.playTone(205, 'triangle', 0.5, 0.5);
  }

  playShroom() {
    this.playTone(1200, 'sine', 0.1, 0.4);
  }

  playResurrect() {
    [400, 800, 1200, 1600].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'sine', 0.2, 0.3), i * 50);
    });
  }

  playTick() {
    this.playTone(60, 'triangle', 0.05, 0.8);
  }

  playCheck() {
    this.playTone(220, 'sawtooth', 0.1, 0.4);
    setTimeout(() => this.playTone(225, 'sawtooth', 0.2, 0.4), 100);
  }

  playVictory() {
    // Longer, happier major-scale arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.50, 987.77, 1046.50, 1318.51, 1567.98, 2093.00];
    notes.forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'square', 0.4, 0.4), i * 150);
    });
  }

  playDefeat() {
    const notes = [440, 349, 311, 261];
    notes.forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'square', 0.6, 0.4), i * 200);
    });
  }

  playStart() {
    this.playTone(440, 'sine', 0.1, 0.5);
    setTimeout(() => this.playTone(880, 'sine', 0.15, 0.4), 100);
  }
}

export const audioManager = new AudioManager();
