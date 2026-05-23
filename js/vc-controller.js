/* ═══════════════════════════════════════
   SoundMax - Voice Changer Controller Module
   ═══════════════════════════════════════ */

window.SoundMax = window.SoundMax || {};

const vc = new VoiceChanger();
let vcRunning = false;
let vcAnimFrame = null;
let vcAudio = null; // elemento Audio para rotear para VB-Cable

async function vcToggle() {
  if (vcRunning) {
    await vcStop();
  } else {
    await vcStart();
  }
}

async function vcStart() {
  const micId = document.getElementById('micInput').value;
  const outId = document.getElementById('audioOutput').value;

  const btn = document.getElementById('vcToggleBtn');
  const indicator = document.getElementById('vcIndicator');
  const statusText = document.getElementById('vcStatusText');

  try {
    statusText.textContent = 'Inicializando microfone...';
    await vc.init(micId || null);

    // ─── ROTA PARA VB-CABLE ───
    const outStream = vc.getOutputStream();
    if (outStream) {
      vcAudio = new Audio();
      vcAudio.srcObject = outStream;
      if (outId) {
        try { await vcAudio.setSinkId(outId); } catch (e) { console.warn('[VC] setSinkId falhou:', e); }
      }
      vcAudio.play().catch(e => console.warn('[VC] play error:', e));
    }

    // Aplicar efeito selecionado
    const activeCard = document.querySelector('.vc-effect-card.active');
    if (activeCard) vc.setEffect(activeCard.dataset.effect);

    vcRunning = true;
    indicator.classList.remove('off'); indicator.classList.add('on');
    btn.classList.add('active');
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg> Parar`;
    statusText.textContent = `Ativo — saída: ${outId ? 'VB-Cable' : 'padrão'}`;
    document.getElementById('vcVisualizerLabel').classList.add('hidden');
    vcDrawWaveform();
    showToast('Voice Changer ativado! Voz sendo enviada para a saída selecionada.', 'success');
  } catch (err) {
    console.error('[VC] Start error:', err);
    statusText.textContent = 'Erro: ' + err.message;
    showToast('Erro ao ativar Voice Changer: ' + err.message, 'error');
    await vcStop();
  }
}

async function vcStop() {
  if (vcAnimFrame) { cancelAnimationFrame(vcAnimFrame); vcAnimFrame = null; }

  // Parar o elemento Audio que rota para o VB-Cable
  if (vcAudio) { vcAudio.pause(); vcAudio.srcObject = null; vcAudio = null; }

  await vc.destroy();
  vcRunning = false;

  const btn = document.getElementById('vcToggleBtn');
  const indicator = document.getElementById('vcIndicator');
  const statusText = document.getElementById('vcStatusText');

  if (indicator) { indicator.classList.remove('on'); indicator.classList.add('off'); }
  if (btn) {
    btn.classList.remove('active');
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg> Iniciar`;
  }
  if (statusText) statusText.textContent = 'Inativo — clique em Iniciar';
  const label = document.getElementById('vcVisualizerLabel');
  if (label) label.classList.remove('hidden');

  const canvas = document.getElementById('vcCanvas');
  if (canvas) {
    const ctx2d = canvas.getContext('2d');
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  }
  showToast('Voice Changer desativado', 'info');
}

function vcDrawWaveform() {
  const canvas = document.getElementById('vcCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const draw = () => {
    if (!vcRunning) return;
    vcAnimFrame = requestAnimationFrame(draw);

    const data = vc.getWaveformData();
    if (!data) return;

    ctx.clearRect(0, 0, W, H);

    // Background subtle gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, 'rgba(124,58,237,0.03)');
    bg.addColorStop(1, 'rgba(124,58,237,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Center line
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();

    // Waveform
    const gradient = ctx.createLinearGradient(0, 0, W, 0);
    gradient.addColorStop(0, '#7c3aed');
    gradient.addColorStop(0.5, '#a855f7');
    gradient.addColorStop(1, '#7c3aed');

    ctx.beginPath();
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    const sliceW = W / data.length;
    let x = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0;
      const y = (v * H) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceW;
    }
    ctx.stroke();

    // Glow effect
    ctx.shadowColor = '#7c3aed';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(124,58,237,0.3)';
    ctx.lineWidth = 4;
    x = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0;
      const y = (v * H) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceW;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  };

  draw();
}

// ─── Voice Changer: Keybind System (personalizável) ─────────────────────────

// Armazena as teclas personalizadas: { effectName: keyString }
let vcEffectKeybinds = {};
let vcListeningEffect = null; // efeito que está em modo "esperando tecla"

function vcLoadKeybinds() {
  try {
    const saved = localStorage.getItem('soundmax_vc_keybinds');
    if (saved) vcEffectKeybinds = JSON.parse(saved);
  } catch (_) {}
}

function vcSaveKeybinds() {
  localStorage.setItem('soundmax_vc_keybinds', JSON.stringify(vcEffectKeybinds));
}

// Formata tecla para exibição no badge (F1→F1, Numpad1→N1, a→A, etc.)
function formatVcKeyDisplay(key) {
  if (!key) return '';
  if (key.startsWith('F') && !isNaN(key.slice(1))) return key;
  if (key.startsWith('Numpad')) return 'N' + key.slice(6);
  if (key === ' ') return 'SPC';
  if (key.length === 1) return key.toUpperCase();
  return key.slice(0, 4);
}

// Renderiza os badges de keybind em todos os cards de efeito
function vcRenderKeybindBadges() {
  document.querySelectorAll('.vc-keybind-btn').forEach(btn => {
    const effect = btn.dataset.effect;
    const key = vcEffectKeybinds[effect];
    if (key) {
      btn.textContent = formatVcKeyDisplay(key);
      btn.classList.add('assigned');
    } else {
      btn.textContent = '';
      btn.classList.remove('assigned');
    }
  });
}

// Entra no modo "listening" — espera o usuário pressionar uma tecla
function vcStartListening(effectName) {
  vcStopListening();
  vcListeningEffect = effectName;
  const btn = document.querySelector(`.vc-keybind-btn[data-effect="${effectName}"]`);
  if (btn) {
    btn.textContent = '';
    btn.classList.add('listening');
    btn.classList.remove('assigned');
  }
}

function vcStopListening() {
  if (!vcListeningEffect) return;
  const btn = document.querySelector(`.vc-keybind-btn[data-effect="${vcListeningEffect}"]`);
  if (btn) btn.classList.remove('listening');
  vcListeningEffect = null;
  vcRenderKeybindBadges();
}

function vcAssignKey(effectName, key) {
  // Remove a tecla de qualquer outro efeito que a use (evita duplicatas)
  for (const [eff, k] of Object.entries(vcEffectKeybinds)) {
    if (k === key && eff !== effectName) {
      delete vcEffectKeybinds[eff];
    }
  }
  vcEffectKeybinds[effectName] = key;
  vcSaveKeybinds();
  vcStopListening();
  showToast(`Tecla "${formatVcKeyDisplay(key)}" atribuída ao efeito`, 'success');
}

function vcClearKey(effectName) {
  delete vcEffectKeybinds[effectName];
  vcSaveKeybinds();
  vcStopListening();
  showToast('Tecla removida', 'info');
}

// Centraliza a lógica de troca de efeito (usado por click e hotkey)
async function vcActivateEffect(effectName) {
  const allCards = document.querySelectorAll('.vc-effect-card');
  const currentActive = document.querySelector('.vc-effect-card.active');
  const currentEffect = currentActive ? currentActive.dataset.effect : 'none';

  // Toggle: se clicar/pressionar o mesmo efeito ativo, volta para "none"
  if (currentEffect === effectName && effectName !== 'none') {
    effectName = 'none';
  }

  // Atualiza UI — destaca o card correto
  allCards.forEach(c => c.classList.remove('active'));
  const targetCard = document.querySelector(`.vc-effect-card[data-effect="${effectName}"]`);
  if (targetCard) targetCard.classList.add('active');

  // Show/hide sliders específicos
  const customSliders = document.getElementById('vcCustomSliders');
  const robotSlider = document.getElementById('vcRobotSlider');
  if (customSliders) customSliders.classList.toggle('hidden', effectName !== 'custom');
  if (robotSlider) robotSlider.classList.toggle('hidden', effectName !== 'robot');

  // Se o VC não está rodando, auto-inicia antes de aplicar o efeito
  if (!vcRunning && effectName !== 'none') {
    await vcStart();
  }

  // Aplica o efeito no DSP engine
  if (vcRunning) {
    vc.setEffect(effectName);
  }
}

function initVoiceChanger() {
  // Carrega keybinds salvos do localStorage
  vcLoadKeybinds();

  // Toggle button
  document.getElementById('vcToggleBtn').addEventListener('click', vcToggle);

  // Monitor toggle
  document.getElementById('vcMonitor').addEventListener('change', (e) => {
    vc.setMonitor(e.target.checked);
  });

  // Effect cards — click handler (left click = ativar efeito)
  document.querySelectorAll('.vc-effect-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Se clicou no botão de keybind, não ativa o efeito
      if (e.target.closest('.vc-keybind-btn')) return;
      vcActivateEffect(card.dataset.effect);
    });

    // Right-click = entrar no modo de atribuir tecla
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      vcStartListening(card.dataset.effect);
    });
  });

  // Keybind buttons — click para atribuir/editar tecla
  document.querySelectorAll('.vc-keybind-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      vcStartListening(btn.dataset.effect);
    });
  });

  // Renderiza os badges de keybind salvos
  vcRenderKeybindBadges();

  // ─── Keybind global listener ───
  document.addEventListener('keydown', (e) => {
    // Modo "listening" — atribuir tecla ao efeito
    if (vcListeningEffect) {
      e.preventDefault();
      e.stopPropagation();
      const blocked = ['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock'];
      if (blocked.includes(e.key)) return;
      if (e.key === 'Escape') { vcStopListening(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { vcClearKey(vcListeningEffect); return; }
      vcAssignKey(vcListeningEffect, e.key);
      return;
    }

    // Não interceptar se estiver digitando em input/select/textarea
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    // Não interceptar se um modal estiver aberto
    if (document.querySelector('.modal-overlay:not(.hidden)')) return;
    // Não interceptar se o painel de Voice Changer não estiver visível
    const vcPanel = document.getElementById('voiceChangerPanel');
    if (vcPanel.classList.contains('hidden')) return;

    // Buscar efeito correspondente à tecla pressionada
    const effectEntry = Object.entries(vcEffectKeybinds).find(([, key]) => key === e.key);
    if (effectEntry) {
      e.preventDefault();
      const effectName = effectEntry[0];

      // Flash visual no card
      const card = document.querySelector(`.vc-effect-card[data-effect="${effectName}"]`);
      if (card) {
        card.classList.remove('hotkey-flash');
        void card.offsetWidth;
        card.classList.add('hotkey-flash');
        setTimeout(() => card.classList.remove('hotkey-flash'), 400);
      }

      vcActivateEffect(effectName);
    }
  });

  // Custom sliders
  const pitchSlider = document.getElementById('vcPitchSlider');
  const reverbSlider = document.getElementById('vcReverbSlider');
  const distSlider = document.getElementById('vcDistSlider');
  const ringSlider = document.getElementById('vcRingFreqSlider');

  pitchSlider.addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    document.getElementById('vcPitchVal').textContent = `${v > 0 ? '+' : ''}${v} st`;
    vc.updateParam('pitch', v);
  });
  reverbSlider.addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    document.getElementById('vcReverbVal').textContent = `${v}%`;
    vc.updateParam('reverb', v / 100);
  });
  distSlider.addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    document.getElementById('vcDistVal').textContent = `${v}%`;
    vc.updateParam('distortion', v / 100);
  });
  ringSlider.addEventListener('input', (e) => {
    const v = parseInt(e.target.value);
    document.getElementById('vcRingFreqVal').textContent = `${v} Hz`;
    vc.updateParam('ringFreq', v);
  });

  // Stop VC if app closes
  window.addEventListener('beforeunload', () => { if (vcRunning) vc.destroy(); });

  // Global hotkey from main process (Ctrl+Shift+V even when minimized)
  window.soundmax.onVcToggle(() => vcToggle());
}

// Export references globally and on the namespace
window.vc = vc;
window.vcRunning = vcRunning;
window.vcAnimFrame = vcAnimFrame;
window.vcAudio = vcAudio;
window.vcToggle = vcToggle;
window.vcStart = vcStart;
window.vcStop = vcStop;
window.vcDrawWaveform = vcDrawWaveform;
window.vcEffectKeybinds = vcEffectKeybinds;
window.vcListeningEffect = vcListeningEffect;
window.vcLoadKeybinds = vcLoadKeybinds;
window.vcSaveKeybinds = vcSaveKeybinds;
window.formatVcKeyDisplay = formatVcKeyDisplay;
window.vcRenderKeybindBadges = vcRenderKeybindBadges;
window.vcStartListening = vcStartListening;
window.vcStopListening = vcStopListening;
window.vcAssignKey = vcAssignKey;
window.vcClearKey = vcClearKey;
window.vcActivateEffect = vcActivateEffect;
window.initVoiceChanger = initVoiceChanger;

window.SoundMax.vc = vc;
window.SoundMax.vcRunning = vcRunning;
window.SoundMax.vcAnimFrame = vcAnimFrame;
window.SoundMax.vcAudio = vcAudio;
window.SoundMax.vcToggle = vcToggle;
window.SoundMax.vcStart = vcStart;
window.SoundMax.vcStop = vcStop;
window.SoundMax.vcDrawWaveform = vcDrawWaveform;
window.SoundMax.vcEffectKeybinds = vcEffectKeybinds;
window.SoundMax.vcListeningEffect = vcListeningEffect;
window.SoundMax.vcLoadKeybinds = vcLoadKeybinds;
window.SoundMax.vcSaveKeybinds = vcSaveKeybinds;
window.SoundMax.formatVcKeyDisplay = formatVcKeyDisplay;
window.SoundMax.vcRenderKeybindBadges = vcRenderKeybindBadges;
window.SoundMax.vcStartListening = vcStartListening;
window.SoundMax.vcStopListening = vcStopListening;
window.SoundMax.vcAssignKey = vcAssignKey;
window.SoundMax.vcClearKey = vcClearKey;
window.SoundMax.vcActivateEffect = vcActivateEffect;
window.SoundMax.initVoiceChanger = initVoiceChanger;
