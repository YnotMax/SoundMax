/**
 * SoundMax Voice Changer — DSP Engine v2
 * Zero dependências. Web Audio API nativa do Chromium/Electron.
 *
 * IMPORTANTE sobre efeitos DSP em microfone ao vivo:
 * - Pitch shift real (mudar nota musical) requer FFT + phase vocoder, não disponível sem lib extra
 * - Os efeitos abaixo usam as técnicas nativas mais agressivas possíveis:
 *   Robot: Ring Modulation (AM) real com DC offset
 *   Deep: Resonant lowpass extremo + bass shelf pesado
 *   Chipmunk: Highpass + treble shelf extremo
 *   Radio: Bandpass estreito + hard distortion
 *   Reverb: Multi-tap delay com feedback alto
 *   Megaphone: Waveshaper saturação + EQ agressivo
 *   Custom: Mix controlável de pitch EQ + reverb + distortion
 */

class VoiceChanger {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.analyserNode = null;
    this.masterGain = null;
    this.monitorGain = null;
    this.destinationNode = null;
    this.outputStream = null;
    this.isActive = false;
    this.activeEffect = null;
    this.effectNodes = [];
    this.params = {
      ringFreq: 60,
      reverb: 0.3,
      distortion: 0.2,
      delay: 0.3,
      pitch: 0,
    };
    this.analyserData = null;
    this._animFrame = null;
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  async init(inputDeviceId = null) {
    try {
      if (this.ctx) await this.destroy();

      this.ctx = new AudioContext({ sampleRate: 44100, latencyHint: 'interactive' });

      const constraints = {
        audio: {
          deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0,
        }
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.source = this.ctx.createMediaStreamSource(this.stream);

      // Analyser
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 1024;
      this.analyserNode.smoothingTimeConstant = 0.7;
      this.analyserData = new Uint8Array(this.analyserNode.frequencyBinCount);

      // Master output
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;

      // Monitor (fone de ouvido)
      this.monitorGain = this.ctx.createGain();
      this.monitorGain.gain.value = 0;

      // Routing: source → analyser → masterGain → monitor + destination
      this.source.connect(this.analyserNode);
      this.analyserNode.connect(this.masterGain);
      this.masterGain.connect(this.monitorGain);
      this.monitorGain.connect(this.ctx.destination);

      // MediaStream para roteamento externo (VB-Cable)
      this.destinationNode = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.destinationNode);
      this.outputStream = this.destinationNode.stream;

      this.isActive = true;
      return true;
    } catch (err) {
      console.error('[VoiceChanger] Init failed:', err);
      throw err;
    }
  }

  // ─── Effect Chain Management ───────────────────────────────────────────────

  setEffect(effectName) {
    if (!this.isActive) return;
    this._clearEffects();
    this.activeEffect = effectName;
    switch (effectName) {
      case 'none':      this._applyNone();      break;
      case 'robot':     this._applyRobot();     break;
      case 'deep':      this._applyDeep();      break;
      case 'demon':     this._applyDemon();     break;
      case 'chipmunk':  this._applyChipmunk();  break;
      case 'alien':     this._applyAlien();     break;
      case 'radio':     this._applyRadio();     break;
      case 'astronaut': this._applyAstronaut(); break;
      case 'reverb':    this._applyReverb();    break;
      case 'megaphone': this._applyMegaphone(); break;
      case 'custom':    this._applyCustom();    break;
      default:          this._applyNone();
    }
  }

  _clearEffects() {
    try { this.source.disconnect(); } catch (_) {}
    try { this.analyserNode.disconnect(); } catch (_) {}
    this.effectNodes.forEach(n => {
      try { n.disconnect(); } catch (_) {}
      if (n instanceof OscillatorNode || n instanceof AudioBufferSourceNode) {
        try { n.stop(); } catch (_) {}
      }
    });
    this.effectNodes = [];
    // Reconectar cadeia base
    this.source.connect(this.analyserNode);
    this.analyserNode.connect(this.masterGain);
  }

  // Insere uma cadeia linear entre analyser e masterGain
  _insertChain(nodes) {
    try { this.analyserNode.disconnect(this.masterGain); } catch (_) {}
    this.effectNodes = [...this.effectNodes, ...nodes];
    this.analyserNode.connect(nodes[0]);
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    nodes[nodes.length - 1].connect(this.masterGain);
  }

  // ─── Efeitos ───────────────────────────────────────────────────────────────

  _applyNone() {
    // Passthrough — já reconectado em _clearEffects
  }

  /**
   * ROBÔ — Ring Modulation real com DC offset
   * Voz × (0.5 + 0.5·sin(2π·f·t)) = amplitude entre 0 e 1
   * Resultado: metalico, robótico, sintético
   */
  _applyRobot() {
    try { this.analyserNode.disconnect(this.masterGain); } catch (_) {}

    // Input passa por um gain cujo valor é modulado
    const ringGain = this.ctx.createGain();
    ringGain.gain.value = 0; // será controlado por DC + oscilador

    // Cria fonte de DC offset (buffer constante = 1.0)
    const dcBuf = this.ctx.createBuffer(1, 2, this.ctx.sampleRate);
    const dcData = dcBuf.getChannelData(0);
    dcData[0] = dcData[1] = 1.0;
    const dcSrc = this.ctx.createBufferSource();
    dcSrc.buffer = dcBuf;
    dcSrc.loop = true;

    // DC escalado a 0.5
    const dcScale = this.ctx.createGain();
    dcScale.gain.value = 0.5;
    dcSrc.connect(dcScale);
    dcScale.connect(ringGain.gain);

    // Oscilador escalado a 0.5
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = this.params.ringFreq;
    const oscScale = this.ctx.createGain();
    oscScale.gain.value = 0.5;
    osc.connect(oscScale);
    oscScale.connect(ringGain.gain);

    // Filtro bandpass para reforçar caráter robótico
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 2.0;

    // Boost de saída (ring mod reduz o volume)
    const outputGain = this.ctx.createGain();
    outputGain.gain.value = 3.0;

    // Routing: analyser → bp → ringGain → outputGain → master
    dcSrc.start();
    osc.start();

    this.analyserNode.connect(bp);
    bp.connect(ringGain);
    ringGain.connect(outputGain);
    outputGain.connect(this.masterGain);

    this.effectNodes = [ringGain, bp, outputGain, osc, oscScale, dcSrc, dcScale];
  }

  /**
   * VOZ GRAVE — Lowpass ressonante agressivo + bass shelf extremo
   * Remove tudo acima de 1.5kHz, boosta graves pesadamente
   */
  _applyDeep() {
    // Bass shelf agressivo
    const bassBoost = this.ctx.createBiquadFilter();
    bassBoost.type = 'lowshelf';
    bassBoost.frequency.value = 250;
    bassBoost.gain.value = 18;

    // Sub bass peak
    const subPeak = this.ctx.createBiquadFilter();
    subPeak.type = 'peaking';
    subPeak.frequency.value = 80;
    subPeak.Q.value = 0.8;
    subPeak.gain.value = 12;

    // Corte de altos ressonante
    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1800;
    lowpass.Q.value = 3.0; // pico ressonante no corte cria textura

    // Corte de agudos
    const hiCut = this.ctx.createBiquadFilter();
    hiCut.type = 'highshelf';
    hiCut.frequency.value = 2000;
    hiCut.gain.value = -20;

    const out = this.ctx.createGain();
    out.gain.value = 0.7;

    this._insertChain([bassBoost, subPeak, lowpass, hiCut, out]);
  }

  /**
   * CHIPMUNK — Treble shelf extremo + remoção de graves
   * Remove tudo abaixo de 800Hz, boosta agudos pesadamente
   */
  _applyChipmunk() {
    // Remove graves
    const hipass = this.ctx.createBiquadFilter();
    hipass.type = 'highpass';
    hipass.frequency.value = 800;
    hipass.Q.value = 2.0;

    // Boost de altos agressivo
    const treble = this.ctx.createBiquadFilter();
    treble.type = 'highshelf';
    treble.frequency.value = 2000;
    treble.gain.value = 20;

    // Pico de presença
    const presence = this.ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 5000;
    presence.Q.value = 1.0;
    presence.gain.value = 10;

    // Harmonic distortion leve para adicionar textura aguda
    const dist = this.ctx.createWaveShaper();
    dist.curve = this._makeDistortionCurve(60);
    dist.oversample = '2x';

    const out = this.ctx.createGain();
    out.gain.value = 0.55;

    this._insertChain([hipass, treble, presence, dist, out]);
  }

  /**
   * RÁDIO — Bandpass estreitíssimo + distorção hard + artefatos AM
   * Simula walkie-talkie / rádio AM com crackle
   */
  _applyRadio() {
    // Pré-distorção para gerar armônicos
    const preDist = this.ctx.createWaveShaper();
    preDist.curve = this._makeDistortionCurve(200);
    preDist.oversample = '4x';

    // Bandpass estreito (banda de voz de rádio: 300–3000Hz)
    const bp1 = this.ctx.createBiquadFilter();
    bp1.type = 'highpass';
    bp1.frequency.value = 400;
    bp1.Q.value = 1.5;

    const bp2 = this.ctx.createBiquadFilter();
    bp2.type = 'lowpass';
    bp2.frequency.value = 3000;
    bp2.Q.value = 2.0;

    // Segunda distorção para crunch
    const postDist = this.ctx.createWaveShaper();
    postDist.curve = this._makeDistortionCurve(150);
    postDist.oversample = '2x';

    // Notch para tirar frequências médias e criar "oco" de rádio
    const notch = this.ctx.createBiquadFilter();
    notch.type = 'notch';
    notch.frequency.value = 1200;
    notch.Q.value = 2.0;

    const out = this.ctx.createGain();
    out.gain.value = 0.6;

    this._insertChain([preDist, bp1, bp2, postDist, notch, out]);
  }

  /**
   * REVERB — Multi-tap delay com feedback alto
   * Simula câmara/caverna/eco
   */
  _applyReverb() {
    try { this.analyserNode.disconnect(this.masterGain); } catch (_) {}

    const dryGain = this.ctx.createGain();
    dryGain.gain.value = 0.5;

    // Delay 1 — eco curto (sala)
    const delay1 = this.ctx.createDelay(2.0);
    delay1.delayTime.value = 0.08;
    const fb1 = this.ctx.createGain();
    fb1.gain.value = 0.5;

    // Delay 2 — eco médio (corredor)
    const delay2 = this.ctx.createDelay(2.0);
    delay2.delayTime.value = 0.22;
    const fb2 = this.ctx.createGain();
    fb2.gain.value = 0.4;

    // Delay 3 — eco longo (caverna)
    const delay3 = this.ctx.createDelay(4.0);
    delay3.delayTime.value = this.params.delay;
    const fb3 = this.ctx.createGain();
    fb3.gain.value = 0.3;

    // LPF no caminho de feedback (simula absorção do ar)
    const fbFilter = this.ctx.createBiquadFilter();
    fbFilter.type = 'lowpass';
    fbFilter.frequency.value = 4000;

    const wetGain = this.ctx.createGain();
    wetGain.gain.value = 0.7;

    const out = this.ctx.createGain();
    out.gain.value = 0.85;

    // Sinal seco
    this.analyserNode.connect(dryGain);
    dryGain.connect(out);

    // Delay 1 feedback loop
    this.analyserNode.connect(delay1);
    delay1.connect(fb1);
    fb1.connect(fbFilter);
    fbFilter.connect(delay1);
    delay1.connect(wetGain);

    // Delay 2 feedback loop
    this.analyserNode.connect(delay2);
    delay2.connect(fb2);
    fb2.connect(delay2);
    delay2.connect(wetGain);

    // Delay 3 feedback loop
    this.analyserNode.connect(delay3);
    delay3.connect(fb3);
    fb3.connect(delay3);
    delay3.connect(wetGain);

    wetGain.connect(out);
    out.connect(this.masterGain);

    this.effectNodes = [dryGain, delay1, fb1, delay2, fb2, delay3, fb3, fbFilter, wetGain, out];
  }

  /**
   * MEGAFONE — Saturação forte + bandpass agressivo + compressão
   */
  _applyMegaphone() {
    // Boost de entrada para saturar
    const preGain = this.ctx.createGain();
    preGain.gain.value = 4.0;

    // Saturação waveshaper
    const dist = this.ctx.createWaveShaper();
    dist.curve = this._makeDistortionCurve(400);
    dist.oversample = '4x';

    // Highpass para tirar graves (megafone não tem bass)
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    hp.Q.value = 1.5;

    // Boost de médios (frequências de voz humana)
    const midBoost = this.ctx.createBiquadFilter();
    midBoost.type = 'peaking';
    midBoost.frequency.value = 2500;
    midBoost.Q.value = 1.2;
    midBoost.gain.value = 8;

    // Corte de super agudos
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6000;

    const out = this.ctx.createGain();
    out.gain.value = 0.35;

    this._insertChain([preGain, dist, hp, midBoost, lp, out]);
  }

  /**
   * CUSTOM — Combinação controlável pelo usuário
   */
  _applyCustom() {
    try { this.analyserNode.disconnect(this.masterGain); } catch (_) {}

    // EQ que simula mudança de pitch via realce de harmônicos
    const eqNode = this.ctx.createBiquadFilter();
    if (this.params.pitch > 0) {
      eqNode.type = 'highshelf';
      eqNode.frequency.value = 1500;
      eqNode.gain.value = Math.abs(this.params.pitch) * 2;
    } else if (this.params.pitch < 0) {
      eqNode.type = 'lowshelf';
      eqNode.frequency.value = 800;
      eqNode.gain.value = Math.abs(this.params.pitch) * 2;
    } else {
      eqNode.type = 'allpass';
    }

    // Distorção variável
    const dist = this.ctx.createWaveShaper();
    dist.curve = this._makeDistortionCurve(this.params.distortion * 500);
    dist.oversample = '2x';

    // Reverb via delay
    const delay = this.ctx.createDelay(3.0);
    delay.delayTime.value = this.params.reverb * 0.5;
    const fb = this.ctx.createGain();
    fb.gain.value = this.params.reverb * 0.55;
    const wetGain = this.ctx.createGain();
    wetGain.gain.value = this.params.reverb * 0.7;
    const dryGain = this.ctx.createGain();
    dryGain.gain.value = 1 - this.params.reverb * 0.4;

    const out = this.ctx.createGain();
    out.gain.value = 0.8;

    this.analyserNode.connect(eqNode);
    eqNode.connect(dist);
    dist.connect(dryGain);
    dryGain.connect(out);
    dist.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wetGain);
    wetGain.connect(out);
    out.connect(this.masterGain);

    this.effectNodes = [eqNode, dist, dryGain, delay, fb, wetGain, out];
  }

  /**
   * DEMÔNIO — Voz extremamente grave, distorcida e com tremolo de baixa frequência
   */
  _applyDemon() {
    const subBoost = this.ctx.createBiquadFilter();
    subBoost.type = 'peaking';
    subBoost.frequency.value = 65;
    subBoost.Q.value = 1.5;
    subBoost.gain.value = 15;

    const bass = this.ctx.createBiquadFilter();
    bass.type = 'lowshelf';
    bass.frequency.value = 150;
    bass.gain.value = 12;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1000;
    lp.Q.value = 1.0;

    const dist = this.ctx.createWaveShaper();
    dist.curve = this._makeDistortionCurve(300);
    dist.oversample = '4x';

    const tremolo = this.ctx.createGain();
    tremolo.gain.value = 0;

    const dcBuf = this.ctx.createBuffer(1, 2, this.ctx.sampleRate);
    dcBuf.getChannelData(0)[0] = dcBuf.getChannelData(0)[1] = 1.0;
    const dcSrc = this.ctx.createBufferSource();
    dcSrc.buffer = dcBuf;
    dcSrc.loop = true;

    const dcScale = this.ctx.createGain();
    dcScale.gain.value = 0.65;
    dcSrc.connect(dcScale);
    dcScale.connect(tremolo.gain);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 16;
    const oscScale = this.ctx.createGain();
    oscScale.gain.value = 0.35;
    osc.connect(oscScale);
    oscScale.connect(tremolo.gain);

    const out = this.ctx.createGain();
    out.gain.value = 1.2;

    dcSrc.start();
    osc.start();

    this.analyserNode.connect(subBoost);
    subBoost.connect(bass);
    bass.connect(lp);
    lp.connect(dist);
    dist.connect(tremolo);
    tremolo.connect(out);
    out.connect(this.masterGain);

    this.effectNodes = [subBoost, bass, lp, dist, tremolo, out, osc, oscScale, dcSrc, dcScale];
  }

  /**
   * ALIENÍGENA — Modulação metálica rápida com delay estéreo / chorus
   */
  _applyAlien() {
    const ringGain = this.ctx.createGain();
    ringGain.gain.value = 0;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 145;

    const oscGain = this.ctx.createGain();
    oscGain.gain.value = 1.0;
    osc.connect(oscGain);
    oscGain.connect(ringGain.gain);

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 600;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'peaking';
    bp.frequency.value = 3200;
    bp.Q.value = 2.0;
    bp.gain.value = 8;

    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = 0.025;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.45;

    const out = this.ctx.createGain();
    out.gain.value = 1.6;

    osc.start();

    this.analyserNode.connect(hp);
    hp.connect(bp);
    bp.connect(ringGain);
    
    ringGain.connect(out);
    ringGain.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(out);

    out.connect(this.masterGain);

    this.effectNodes = [hp, bp, ringGain, osc, oscGain, delay, fb, out];
  }

  /**
   * ASTRONAUTA — Filtro telefônico extremo + ruído estático de fundo espacial
   */
  _applyAstronaut() {
    const preDist = this.ctx.createWaveShaper();
    preDist.curve = this._makeDistortionCurve(180);
    preDist.oversample = '2x';

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    hp.Q.value = 1.5;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    lp.Q.value = 1.5;

    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      noiseData[i] = Math.random() * 2 - 1;
    }
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    noiseSrc.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1500;
    noiseFilter.Q.value = 1.0;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.value = 0.05;

    const out = this.ctx.createGain();
    out.gain.value = 0.65;

    noiseSrc.start();

    this.analyserNode.connect(preDist);
    preDist.connect(hp);
    hp.connect(lp);
    lp.connect(out);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(out);

    out.connect(this.masterGain);

    this.effectNodes = [preDist, hp, lp, noiseSrc, noiseFilter, noiseGain, out];
  }

  // ─── DSP Utilities ─────────────────────────────────────────────────────────

  _makeDistortionCurve(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    const k = amount <= 0 ? 0.001 : amount;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      // Waveshaper cubic soft-clip
      curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  // ─── Param Updates ─────────────────────────────────────────────────────────

  updateParam(key, value) {
    this.params[key] = value;
    // Para o robô, atualiza a frequência do oscilador em tempo real
    if (this.activeEffect === 'robot' && key === 'ringFreq') {
      const osc = this.effectNodes.find(n => n instanceof OscillatorNode);
      if (osc) osc.frequency.setTargetAtTime(value, this.ctx.currentTime, 0.01);
    } else if (this.activeEffect === 'reverb' && key === 'delay') {
      const delays = this.effectNodes.filter(n => n instanceof DelayNode);
      if (delays[2]) delays[2].delayTime.setTargetAtTime(value, this.ctx.currentTime, 0.05);
    } else if (this.activeEffect === 'custom') {
      this.setEffect('custom');
    }
  }

  setMonitor(enabled) {
    if (!this.monitorGain) return;
    this.monitorGain.gain.setTargetAtTime(enabled ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  setMasterGain(value) {
    if (!this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(Math.max(0, value), this.ctx.currentTime, 0.05);
  }

  // ─── Analyser ──────────────────────────────────────────────────────────────

  getWaveformData() {
    if (!this.analyserNode || !this.analyserData) return null;
    this.analyserNode.getByteTimeDomainData(this.analyserData);
    return this.analyserData;
  }

  getOutputStream() {
    return this.outputStream;
  }

  // ─── Destroy ───────────────────────────────────────────────────────────────

  async destroy() {
    this.isActive = false;
    this._clearEffects();
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      await this.ctx.close();
    }
    this.ctx = null;
    this.source = null;
    this.analyserNode = null;
    this.masterGain = null;
    this.monitorGain = null;
    this.destinationNode = null;
    this.outputStream = null;
    this.activeEffect = null;
    this.effectNodes = [];
  }
}

window.VoiceChanger = VoiceChanger;
