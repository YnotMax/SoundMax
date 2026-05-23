/* ═══════════════════════════════════════
   SoundMax - Events Module
   ═══════════════════════════════════════ */

window.SoundMax = window.SoundMax || {};

function initEvents() {
  // ── Tab Navigation ──
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      const isSoundboard = tab === 'soundboard';
      document.querySelector('.content-header').classList.toggle('hidden', !isSoundboard);
      document.getElementById('dropZone').classList.toggle('hidden', !isSoundboard);
      document.getElementById('voiceChangerPanel').classList.toggle('hidden', isSoundboard);
      document.getElementById('searchWrapper').classList.toggle('hidden', !isSoundboard);
      document.querySelector('.topbar-right').classList.toggle('hidden', !isSoundboard);
    });
  });

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

  // Volume do Microfone (independente dos áudios)
  document.getElementById('micVolume')?.addEventListener('input', (e) => {
    const pct = parseInt(e.target.value);
    const gain = pct / 100; // 0–200 → 0.0–2.0
    document.getElementById('micVolumeLabel').textContent = pct + '%';
    if (engine.micGainNode) engine.micGainNode.gain.setTargetAtTime(gain, engine.ctx.currentTime, 0.05);
    localStorage.setItem('soundmax_micVol', pct);
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

  // Hotkey input — suporta F1-F12, Numpad0-9, letras e números
  document.getElementById('soundHotkey').addEventListener('keydown', (e) => {
    e.preventDefault();
    const blocked = ['Shift','Control','Alt','Meta','Tab','CapsLock','Escape'];
    if (blocked.includes(e.key)) return;
    // Armazena o e.key completo (ex: "F1", "Numpad5", "a")
    const keyEl = document.getElementById('soundHotkey');
    keyEl.value = e.key;
    keyEl.placeholder = formatHotkeyDisplay(e.key);
  });
  // Botão limpar hotkey (duplo clique)
  document.getElementById('soundHotkey').addEventListener('dblclick', () => {
    document.getElementById('soundHotkey').value = '';
  });
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
    // Ctrl+Shift+V — toggle Voice Changer
    if (e.ctrlKey && e.shiftKey && e.key === 'V') { e.preventDefault(); vcToggle(); return; }
    if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) return;
    const s = state.sounds.find(s => s.hotkey && s.hotkey.toLowerCase() === e.key.toLowerCase());
    if (s) { e.preventDefault(); playSound(s.id); }
  });

  window.soundmax.onAllStopped(() => {
    stopAllSounds();
  });
}

// Export references globally and on the namespace
window.initEvents = initEvents;
window.SoundMax.initEvents = initEvents;
