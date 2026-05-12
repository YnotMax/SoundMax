/* ═══════════════════════════════════════
   SoundMax v2.1 — Web Audio API Engine
   ═══════════════════════════════════════ */

const state = {
  sounds: [],
  categories: [{ id: 'all', name: 'Todos os Sons', emoji: '🎵', isDefault: true }],
  activeCategory: 'all',
  playingSounds: new Set(),
  editingSoundId: null,
  editingCategoryId: null,
  masterVolume: 80,
  viewMode: 'grid',
  audioFolder: '',
};

// ─── Web Audio API Engine ───
const engine = {
  ctx: new (window.AudioContext || window.webkitAudioContext)(),
  micStream: null,
  micSource: null,
  mixDest: null,
  outAudio: null,
  micAnalyser: null,
  mixAnalyser: null,
  running: false,
  soundBuffers: new Map(), // id -> AudioBuffer
  activeNodes: new Map(),  // id -> { source, gain, mixGain }
  animFrame: null
};

// Resume AudioContext on user interaction
document.body.addEventListener('click', () => {
  if (engine.ctx.state === 'suspended') engine.ctx.resume();
});

// ─── Storage ───
function saveState() {
  const data = {
    categories: state.categories,
    masterVolume: state.masterVolume,
    viewMode: state.viewMode,
    sounds: state.sounds.map(s => ({ ...s, dataUrl: undefined })),
  };
  localStorage.setItem('soundmax_v2', JSON.stringify(data));
}
function loadState() {
  try {
    const d = JSON.parse(localStorage.getItem('soundmax_v2'));
    if (!d) return;
    if (d.categories) state.categories = d.categories;
    if (d.masterVolume !== undefined) state.masterVolume = d.masterVolume;
    if (d.viewMode) state.viewMode = d.viewMode;
  } catch (e) {}
}

// ─── Audio Decoding ───
async function decodeAndRegister(sound) {
  try {
    const fileBuffer = await window.soundmax.readAudioFile(sound.path);
    if (!fileBuffer) return false;
    const arrayBuffer = fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength);
    const decoded = await engine.ctx.decodeAudioData(arrayBuffer);
    engine.soundBuffers.set(sound.id, decoded);
    sound.duration = decoded.duration;
    return true;
  } catch (e) {
    console.error(`Failed to decode ${sound.name}:`, e);
    return false;
  }
}

// ─── Load Sounds from Folder ───
async function loadAudioFolder(folderPath, isManual = false) {
  const statusEl = document.getElementById('loadingStatus');
  if (statusEl) { statusEl.textContent = 'Carregando áudios...'; statusEl.classList.remove('hidden'); }

  const files = await window.soundmax.scanFolder(folderPath);
  state.audioFolder = folderPath;

  // Sincroniza remoções (remove do app os arquivos que foram apagados da pasta)
  const initialCount = state.sounds.length;
  state.sounds = state.sounds.filter(s => files.find(f => f.path === s.path));
  const removed = initialCount - state.sounds.length;

  const colors = ['#7C3AED','#06D6A0','#3B82F6','#F59E0B','#EF4444','#EC4899','#14B8A6','#F97316','#8B5CF6','#64748B'];
  let loaded = 0;

  for (const f of files) {
    if (state.sounds.find(s => s.path === f.path)) continue;

    const sound = {
      id: crypto.randomUUID(),
      name: f.name.length > 30 ? f.name.slice(0, 30) : f.name,
      fileName: f.fileName,
      path: f.path,
      category: 'all',
      volume: 100,
      color: colors[loaded % colors.length],
      hotkey: '',
      loop: false,
      favorite: false,
      duration: 0,
    };

    const ok = await decodeAndRegister(sound);
    if (ok) {
      state.sounds.push(sound);
      loaded++;
      if (statusEl) statusEl.textContent = `Carregando: ${loaded}/${files.length}...`;
    }
  }

  if (statusEl) statusEl.classList.add('hidden');
  saveState();
  renderSounds();
  renderCategories();
  updateStats();
  
  if (loaded > 0 || removed > 0) {
    let msg = [];
    if (loaded > 0) msg.push(`${loaded} novos`);
    if (removed > 0) msg.push(`${removed} removidos`);
    showToast(`Sincronizado: ${msg.join(' e ')}`, 'success');
  } else if (loaded === 0 && removed === 0 && isManual) {
    // Apenas mostrar se foi um clique no refresh
    showToast('A biblioteca já está sincronizada', 'info');
  }
}

// ─── Play/Stop Audio ───
function playSound(soundId) {
  const sound = state.sounds.find(s => s.id === soundId);
  if (!sound) return;

  // Toggle if playing
  if (state.playingSounds.has(soundId)) {
    stopSound(soundId);
    return;
  }

  const buffer = engine.soundBuffers.get(soundId);
  if (!buffer) return;

  const source = engine.ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = sound.loop;

  const vol = (sound.volume / 100) * (state.masterVolume / 100);

  // Gain for preview (local speakers)
  const localGain = engine.ctx.createGain();
  localGain.gain.value = vol;
  source.connect(localGain);
  localGain.connect(engine.ctx.destination);

  // Gain for engine mix (VB-Cable)
  let mixGain = null;
  if (engine.running && engine.mixDest) {
    mixGain = engine.ctx.createGain();
    mixGain.gain.value = vol;
    source.connect(mixGain);
    mixGain.connect(engine.mixDest);
  }

  source.onended = () => {
    state.playingSounds.delete(soundId);
    engine.activeNodes.delete(soundId);
    updateSoundCard(soundId);
    updateNowPlaying();
  };

  engine.activeNodes.set(soundId, { source, localGain, mixGain });
  source.start(0);

  state.playingSounds.add(soundId);
  updateSoundCard(soundId);
  updateNowPlaying();
}

function stopSound(soundId) {
  const nodes = engine.activeNodes.get(soundId);
  if (nodes) {
    try { nodes.source.stop(); } catch (e) {}
    engine.activeNodes.delete(soundId);
  }
  state.playingSounds.delete(soundId);
  updateSoundCard(soundId);
  updateNowPlaying();
}

function stopAllSounds() {
  engine.activeNodes.forEach(nodes => {
    try { nodes.source.stop(); } catch (e) {}
  });
  engine.activeNodes.clear();
  state.playingSounds.clear();
  document.querySelectorAll('.sound-card.playing').forEach(c => c.classList.remove('playing'));
  updateNowPlaying();
}

// ─── Render UI ───
function renderSounds() {
  const grid = document.getElementById('soundGrid');
  const empty = document.getElementById('emptyState');
  const search = document.getElementById('searchInput').value.toLowerCase().trim();

  let filtered = state.sounds;
  if (state.activeCategory !== 'all') filtered = filtered.filter(s => s.category === state.activeCategory);
  if (search) filtered = filtered.filter(s => s.name.toLowerCase().includes(search));
  filtered.sort((a, b) => (b.favorite - a.favorite) || a.name.localeCompare(b.name));

  grid.innerHTML = '';
  if (filtered.length === 0) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  filtered.forEach(sound => {
    const playing = state.playingSounds.has(sound.id);
    const card = document.createElement('div');
    card.className = `sound-card${playing ? ' playing' : ''}`;
    card.style.setProperty('--card-accent', sound.color);
    card.dataset.soundId = sound.id;

    const dur = formatTime(sound.duration);
    card.innerHTML = `
      ${sound.favorite ? '<span class="sound-fav">⭐</span>' : ''}
      ${sound.hotkey ? `<span class="sound-hotkey">${sound.hotkey}</span>` : ''}
      <div class="sound-play-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="${playing ? '6,4 10,4 10,20 6,20' : '5,3 19,12 5,21'}"></polygon>${playing ? '<polygon points="14,4 18,4 18,20 14,20"></polygon>' : ''}</svg>
      </div>
      <span class="sound-name" title="${sound.name}">${sound.name}</span>
      <span class="sound-duration">${dur}</span>
      <button class="sound-settings" title="Configurações">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </button>
      <div class="sound-card-progress"><div class="sound-card-progress-fill"></div></div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.sound-settings')) { openSoundModal(sound.id); return; }
      playSound(sound.id);
    });
    grid.appendChild(card);
  });
}

function renderCategories() {
  const list = document.getElementById('categoryList');
  list.innerHTML = '';
  state.categories.forEach(cat => {
    const count = cat.id === 'all' ? state.sounds.length : state.sounds.filter(s => s.category === cat.id).length;
    const item = document.createElement('div');
    item.className = `category-item${state.activeCategory === cat.id ? ' active' : ''}`;
    item.innerHTML = `<span class="cat-emoji">${cat.emoji}</span><span>${cat.name}</span><span class="cat-count">${count}</span>
      ${!cat.isDefault ? `<button class="cat-edit"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>` : ''}`;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.cat-edit')) { openCategoryModal(cat.id); return; }
      state.activeCategory = cat.id;
      document.getElementById('activeCategoryTitle').textContent = cat.name;
      renderCategories();
      renderSounds();
    });
    list.appendChild(item);
  });
}

function updateSoundCard(soundId) {
  const card = document.querySelector(`[data-sound-id="${soundId}"]`);
  if (!card) return;
  const playing = state.playingSounds.has(soundId);
  card.classList.toggle('playing', playing);
  const icon = card.querySelector('.sound-play-icon svg');
  if (icon) icon.innerHTML = playing
    ? '<polygon points="6,4 10,4 10,20 6,20"></polygon><polygon points="14,4 18,4 18,20 14,20"></polygon>'
    : '<polygon points="5,3 19,12 5,21"></polygon>';
}

function updateNowPlaying() {
  const bar = document.getElementById('nowPlaying');
  if (state.playingSounds.size === 0) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const id = [...state.playingSounds].pop();
  const sound = state.sounds.find(s => s.id === id);
  if (sound) document.getElementById('nowPlayingName').textContent = sound.name;
}

function updateStats() {
  document.getElementById('totalSounds').textContent = state.sounds.length;
  document.getElementById('totalCategories').textContent = state.categories.length - 1;
}

// ─── Modals ───
function openSoundModal(soundId) {
  const sound = state.sounds.find(s => s.id === soundId);
  if (!sound) return;
  state.editingSoundId = soundId;
  document.getElementById('soundName').value = sound.name;
  document.getElementById('soundVolume').value = sound.volume;
  document.getElementById('soundVolumeLabel').textContent = sound.volume + '%';
  document.getElementById('soundHotkey').value = sound.hotkey || '';
  document.getElementById('soundLoop').checked = sound.loop;
  document.getElementById('soundFavorite').checked = sound.favorite;
  const sel = document.getElementById('soundCategory');
  sel.innerHTML = '';
  state.categories.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = `${c.emoji} ${c.name}`; if (sound.category === c.id) o.selected = true; sel.appendChild(o); });
  document.querySelectorAll('.color-swatch').forEach(sw => sw.classList.toggle('active', sw.dataset.color === sound.color));
  document.getElementById('soundModal').classList.remove('hidden');
}

function openCategoryModal(catId = null) {
  state.editingCategoryId = catId;
  const cat = catId ? state.categories.find(c => c.id === catId) : null;
  document.getElementById('categoryModalTitle').textContent = cat ? 'Editar Categoria' : 'Nova Categoria';
  document.getElementById('categoryName').value = cat ? cat.name : '';
  document.getElementById('saveCategoryBtn').textContent = cat ? 'Salvar' : 'Criar';
  document.getElementById('deleteCategoryBtn').classList.toggle('hidden', !cat);
  document.querySelectorAll('.emoji-btn').forEach(b => b.classList.toggle('active', cat && b.dataset.emoji === cat.emoji));
  document.getElementById('categoryModal').classList.remove('hidden');
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); state.editingSoundId = null; state.editingCategoryId = null; }

function formatTime(s) { if (!s || isNaN(s)) return '0:00'; return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`; }
function showToast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 300); }, 2500);
}

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
    // For analysis, we just connect a dummy source to mixAnalyser? No, we route the mix bus into it.
    // Actually, creating another destination for analysis is tricky, let's just use a GainNode as the true MixBus.
    
    // REDESIGN THE MIX BUS:
    engine.micSource.disconnect();
    
    const masterMixBus = engine.ctx.createGain();
    engine.micSource.connect(engine.micAnalyser);
    engine.micAnalyser.connect(masterMixBus);
    
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
    indicator.title = engine.running ? 'Engine ativa — mixando mic + sons' : 'Engine parada';
  }
}

// ─── Events ───
function initEvents() {
  document.getElementById('sidebarToggle').addEventListener('click', () => document.querySelector('.sidebar').classList.toggle('collapsed'));

  document.getElementById('addSoundBtn').addEventListener('click', async () => {
    const files = await window.soundmax.openFileDialog();
    if (files && files.length > 0) {
      const copied = await window.soundmax.copyFilesToSounds(files);
      if (copied > 0) showToast(`${copied} arquivos importados com sucesso!`, 'success');
      const defaultPath = await window.soundmax.getDefaultAudioPath();
      loadAudioFolder(defaultPath);
    }
  });

  document.getElementById('refreshBtn')?.addEventListener('click', async () => {
    const defaultPath = await window.soundmax.getDefaultAudioPath();
    loadAudioFolder(defaultPath, true);
  });
  
  document.getElementById('tutorialBtn')?.addEventListener('click', () => {
    document.getElementById('tutorialModal').classList.remove('hidden');
  });

  document.getElementById('stopAllBtn').addEventListener('click', stopAllSounds);
  document.getElementById('searchInput').addEventListener('input', renderSounds);

  const mv = document.getElementById('masterVolume');
  mv.value = state.masterVolume;
  document.getElementById('masterVolumeLabel').textContent = state.masterVolume + '%';
  mv.addEventListener('input', (e) => {
    state.masterVolume = parseInt(e.target.value);
    document.getElementById('masterVolumeLabel').textContent = state.masterVolume + '%';
    
    // Update live volumes
    engine.activeNodes.forEach((nodes, soundId) => {
      const sound = state.sounds.find(s => s.id === soundId);
      if (sound) {
        const vol = (sound.volume / 100) * (state.masterVolume / 100);
        if (nodes.localGain) nodes.localGain.gain.value = vol;
        if (nodes.mixGain) nodes.mixGain.gain.value = vol;
      }
    });
    saveState();
  });

  document.getElementById('engineToggle')?.addEventListener('click', toggleEngine);

  document.getElementById('viewGrid').addEventListener('click', () => { state.viewMode='grid'; document.getElementById('soundGrid').classList.remove('list-view'); document.getElementById('viewGrid').classList.add('active'); document.getElementById('viewList').classList.remove('active'); saveState(); });
  document.getElementById('viewList').addEventListener('click', () => { state.viewMode='list'; document.getElementById('soundGrid').classList.add('list-view'); document.getElementById('viewList').classList.add('active'); document.getElementById('viewGrid').classList.remove('active'); saveState(); });

  const dz = document.getElementById('dropZone'), ov = document.getElementById('dropOverlay');
  let dc = 0;
  dz.addEventListener('dragenter', (e) => { e.preventDefault(); dc++; ov.classList.add('visible'); });
  dz.addEventListener('dragleave', () => { dc--; if (dc <= 0) { ov.classList.remove('visible'); dc = 0; } });
  dz.addEventListener('dragover', (e) => e.preventDefault());
  dz.addEventListener('drop', async (e) => { 
    e.preventDefault(); dc = 0; ov.classList.remove('visible'); 
    if (e.dataTransfer.files.length) {
      const paths = Array.from(e.dataTransfer.files).map(f => f.path).filter(p => p);
      if (paths.length > 0) {
        const copied = await window.soundmax.copyFilesToSounds(paths);
        if (copied > 0) showToast(`${copied} arquivos importados com sucesso!`, 'success');
        const defaultPath = await window.soundmax.getDefaultAudioPath();
        loadAudioFolder(defaultPath);
      }
    }
  });

  document.getElementById('addCategoryBtn').addEventListener('click', () => openCategoryModal());
  document.getElementById('saveCategoryBtn').addEventListener('click', () => {
    const name = document.getElementById('categoryName').value.trim();
    if (!name) { showToast('Digite um nome', 'error'); return; }
    const emoji = document.querySelector('.emoji-btn.active')?.dataset.emoji || '📁';
    if (state.editingCategoryId) { const c = state.categories.find(c => c.id === state.editingCategoryId); if (c) { c.name = name; c.emoji = emoji; } }
    else state.categories.push({ id: crypto.randomUUID(), name, emoji, isDefault: false });
    saveState(); renderCategories(); updateStats(); closeModal('categoryModal');
  });
  document.getElementById('deleteCategoryBtn').addEventListener('click', () => {
    if (!state.editingCategoryId) return;
    state.sounds.forEach(s => { if (s.category === state.editingCategoryId) s.category = 'all'; });
    state.categories = state.categories.filter(c => c.id !== state.editingCategoryId);
    if (state.activeCategory === state.editingCategoryId) state.activeCategory = 'all';
    saveState(); renderCategories(); renderSounds(); updateStats(); closeModal('categoryModal');
  });

  document.querySelectorAll('.emoji-btn').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.emoji-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); }));
  document.querySelectorAll('.color-swatch').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active')); b.classList.add('active'); }));

  document.getElementById('soundVolume').addEventListener('input', (e) => document.getElementById('soundVolumeLabel').textContent = e.target.value + '%');
  document.getElementById('soundHotkey').addEventListener('keydown', (e) => { e.preventDefault(); document.getElementById('soundHotkey').value = e.key.length === 1 ? e.key.toUpperCase() : e.key; });
  document.getElementById('saveSoundBtn').addEventListener('click', () => {
    const s = state.sounds.find(s => s.id === state.editingSoundId); if (!s) return;
    s.name = document.getElementById('soundName').value.trim() || s.name;
    s.category = document.getElementById('soundCategory').value;
    s.volume = parseInt(document.getElementById('soundVolume').value);
    s.hotkey = document.getElementById('soundHotkey').value;
    s.loop = document.getElementById('soundLoop').checked;
    s.favorite = document.getElementById('soundFavorite').checked;
    const ac = document.querySelector('.color-swatch.active'); if (ac) s.color = ac.dataset.color;
    saveState(); renderSounds(); renderCategories(); closeModal('soundModal');
  });
  document.getElementById('deleteSoundBtn').addEventListener('click', () => {
    if (!state.editingSoundId) return;
    stopSound(state.editingSoundId);
    state.sounds = state.sounds.filter(s => s.id !== state.editingSoundId);
    saveState(); renderSounds(); renderCategories(); updateStats(); closeModal('soundModal');
  });

  document.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.modal)));
  document.querySelectorAll('.modal-overlay').forEach(o => o.addEventListener('click', (e) => { if (e.target === o) closeModal(o.id); }));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { stopAllSounds(); return; }
    if (e.ctrlKey && e.key === 'k') { e.preventDefault(); document.getElementById('searchInput').focus(); return; }
    if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    const s = state.sounds.find(s => s.hotkey && s.hotkey.toLowerCase() === e.key.toLowerCase());
    if (s) { e.preventDefault(); playSound(s.id); }
  });

  window.soundmax.onAllStopped(() => {
    stopAllSounds();
  });
}

// ─── Init ───
async function init() {
  loadState();
  if (state.viewMode === 'list') {
    document.getElementById('soundGrid').classList.add('list-view');
    document.getElementById('viewList').classList.add('active');
    document.getElementById('viewGrid').classList.remove('active');
  }
  document.getElementById('masterVolume').value = state.masterVolume;
  document.getElementById('masterVolumeLabel').textContent = state.masterVolume + '%';

  initEvents();
  await initDevices();
  renderCategories();
  renderSounds();
  updateStats();

  const defaultPath = await window.soundmax.getDefaultAudioPath();
  if (defaultPath) loadAudioFolder(defaultPath);
}

document.addEventListener('DOMContentLoaded', init);
