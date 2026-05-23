/* ═══════════════════════════════════════
   SoundMax - Sound Manager Module
   ═══════════════════════════════════════ */

window.SoundMax = window.SoundMax || {};

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

// Export references globally and on the namespace
window.decodeAndRegister = decodeAndRegister;
window.loadAudioFolder = loadAudioFolder;
window.playSound = playSound;
window.stopSound = stopSound;
window.stopAllSounds = stopAllSounds;

window.SoundMax.decodeAndRegister = decodeAndRegister;
window.SoundMax.loadAudioFolder = loadAudioFolder;
window.SoundMax.playSound = playSound;
window.SoundMax.stopSound = stopSound;
window.SoundMax.stopAllSounds = stopAllSounds;
