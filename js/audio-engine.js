/* ═══════════════════════════════════════
   SoundMax - Audio Engine Module
   ═══════════════════════════════════════ */

window.SoundMax = window.SoundMax || {};

const engine = {
  ctx: new (window.AudioContext || window.webkitAudioContext)(),
  micStream: null,
  micSource: null,
  micGainNode: null,  // volume do microfone
  mixDest: null,
  outAudio: null,
  micAnalyser: null,
  mixAnalyser: null,
  running: false,
  soundBuffers: new Map(),
  activeNodes: new Map(),
  animFrame: null
};

// Resume AudioContext on user interaction
document.body.addEventListener('click', () => {
  if (engine.ctx.state === 'suspended') engine.ctx.resume();
});

// ─── Setup Engine (Web Audio API) ───
async function initDevices() {
  // Pedir permissão do microfone para garantir que todos os dispositivos sejam listados
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tempStream.getTracks().forEach(t => t.stop());
  } catch (e) {
    console.warn("Microphone access denied or not available.", e);
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter(d => d.kind === 'audioinput');
  const outputs = devices.filter(d => d.kind === 'audiooutput');

  const micSel = document.getElementById('micInput');
  micSel.innerHTML = '';
  inputs.forEach(d => {
    const o = document.createElement('option'); o.value = d.deviceId; 
    o.textContent = `🎤 ${d.label || 'Microfone Desconhecido'}`;
    // Auto select default mic
    if (d.deviceId === 'default' || d.label.toLowerCase().includes('mic')) o.selected = true;
    micSel.appendChild(o);
  });

  const outSel = document.getElementById('audioOutput');
  outSel.innerHTML = '';
  outputs.forEach(d => {
    const o = document.createElement('option'); o.value = d.deviceId; 
    o.textContent = `🔊 ${d.label || 'Saída Desconhecida'}`;
    // Auto select VB-Cable
    if (d.label.toLowerCase().includes('cable input') || d.label.toLowerCase().includes('vb-audio')) o.selected = true;
    outSel.appendChild(o);
  });
}

function updateLevelMeters() {
  if (!engine.running) return;

  const update = () => {
    if (!engine.running) {
      document.getElementById('micLevel').style.width = '0%';
      document.getElementById('outLevel').style.width = '0%';
      return;
    }

    // Mic RMS
    if (engine.micAnalyser) {
      const micData = new Float32Array(engine.micAnalyser.fftSize);
      engine.micAnalyser.getFloatTimeDomainData(micData);
      let sum = 0; for(let i=0; i<micData.length; i++) sum += micData[i]*micData[i];
      const rms = Math.sqrt(sum / micData.length);
      document.getElementById('micLevel').style.width = `${Math.min(100, rms * 100 * 5)}%`;
    }

    // Mix RMS
    if (engine.mixAnalyser) {
      const mixData = new Float32Array(engine.mixAnalyser.fftSize);
      engine.mixAnalyser.getFloatTimeDomainData(mixData);
      let sum = 0; for(let i=0; i<mixData.length; i++) sum += mixData[i]*mixData[i];
      const rms = Math.sqrt(sum / mixData.length);
      document.getElementById('outLevel').style.width = `${Math.min(100, rms * 100 * 5)}%`;
    }

    engine.animFrame = requestAnimationFrame(update);
  };
  update();
}

async function startEngine() {
  try {
    const micId = document.getElementById('micInput').value;
    const outId = document.getElementById('audioOutput').value;

    if (!micId || !outId) throw new Error("Selecione os dispositivos de áudio.");

    engine.micStream = await navigator.mediaDevices.getUserMedia({ 
      audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } 
    });

    if (engine.ctx.state === 'suspended') await engine.ctx.resume();

    engine.mixDest = engine.ctx.createMediaStreamDestination();
    engine.micSource = engine.ctx.createMediaStreamSource(engine.micStream);
    
    engine.micAnalyser = engine.ctx.createAnalyser();
    engine.mixAnalyser = engine.ctx.createAnalyser();

    // Route Mic -> MixBus
    engine.micSource.connect(engine.micAnalyser);
    engine.micAnalyser.connect(engine.mixDest);
    
    // Connect MixBus to MixAnalyser
    engine.mixDest.stream.getTracks().forEach(t => {
      // Create a dummy node just to analyze the final destination
    });
    
    // MIX BUS com controle de volume do mic:
    engine.micSource.disconnect();

    const masterMixBus = engine.ctx.createGain();

    // Mic gain node (volume separado do mic)
    engine.micGainNode = engine.ctx.createGain();
    engine.micGainNode.gain.value = (parseInt(document.getElementById('micVolume')?.value || 100)) / 100;

    engine.micSource.connect(engine.micAnalyser);
    engine.micAnalyser.connect(engine.micGainNode);
    engine.micGainNode.connect(masterMixBus);

    masterMixBus.connect(engine.mixAnalyser);
    engine.mixAnalyser.connect(engine.mixDest);

    // Re-route active sounds to the new MixBus
    engine.activeNodes.forEach(nodes => {
      if (nodes.mixGain) {
        nodes.mixGain.disconnect();
        nodes.mixGain.connect(masterMixBus);
      }
    });

    // Send MixBus to VB-Cable using Audio Element
    engine.outAudio = new Audio();
    engine.outAudio.srcObject = engine.mixDest.stream;
    await engine.outAudio.setSinkId(outId);
    await engine.outAudio.play();

    engine.running = true;
    updateEngineStatus();
    updateLevelMeters();
    showToast('Engine de áudio ativada com sucesso!', 'success');

  } catch (e) {
    console.error(e);
    showToast(`Erro ao iniciar engine: ${e.message}`, 'error');
    stopEngine();
  }
}

function stopEngine() {
  engine.running = false;
  if (engine.animFrame) cancelAnimationFrame(engine.animFrame);
  if (engine.micStream) engine.micStream.getTracks().forEach(t => t.stop());
  if (engine.outAudio) { engine.outAudio.pause(); engine.outAudio.srcObject = null; }

  engine.micStream = null;
  engine.micSource = null;
  engine.micGainNode = null;
  engine.mixDest = null;
  engine.outAudio = null;
  engine.micAnalyser = null;
  engine.mixAnalyser = null;

  updateEngineStatus();
}

async function toggleEngine() {
  if (engine.running) stopEngine();
  else await startEngine();
}

function updateEngineStatus() {
  const btn = document.getElementById('engineToggle');
  const indicator = document.getElementById('engineIndicator');
  if (btn) {
    btn.textContent = engine.running ? '⏹ Parar' : '▶ Iniciar';
    btn.classList.toggle('active', engine.running);
  }
  if (indicator) {
    indicator.classList.toggle('active', engine.running);
    indicator.title = engine.running ? 'Engine activa — mixando mic + sons' : 'Engine parada';
  }
}

// Export references globally and on the namespace
window.engine = engine;
window.initDevices = initDevices;
window.updateLevelMeters = updateLevelMeters;
window.startEngine = startEngine;
window.stopEngine = stopEngine;
window.toggleEngine = toggleEngine;
window.updateEngineStatus = updateEngineStatus;

window.SoundMax.engine = engine;
window.SoundMax.initDevices = initDevices;
window.SoundMax.updateLevelMeters = updateLevelMeters;
window.SoundMax.startEngine = startEngine;
window.SoundMax.stopEngine = stopEngine;
window.SoundMax.toggleEngine = toggleEngine;
window.SoundMax.updateEngineStatus = updateEngineStatus;
