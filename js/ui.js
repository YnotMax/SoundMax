/* ═══════════════════════════════════════
   SoundMax - UI Module
   ═══════════════════════════════════════ */

window.SoundMax = window.SoundMax || {};

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
    const hotkeyDisplay = sound.hotkey ? formatHotkeyDisplay(sound.hotkey) : '';
    card.innerHTML = `
      ${sound.favorite ? '<span class="sound-fav">⭐</span>' : ''}
      ${hotkeyDisplay ? `<span class="sound-hotkey" title="Hotkey: ${sound.hotkey}">${hotkeyDisplay}</span>` : ''}
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

function closeModal(id) { 
  document.getElementById(id).classList.add('hidden'); 
  state.editingSoundId = null; 
  state.editingCategoryId = null; 
}

function formatTime(s) { 
  if (!s || isNaN(s)) return '0:00'; 
  return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`; 
}

// Formata a tecla para exibição no card (F1 → F1, Numpad1 → N1, a → A)
function formatHotkeyDisplay(key) {
  if (!key) return '';
  if (key.startsWith('F') && !isNaN(key.slice(1))) return key; // F1-F12
  if (key.startsWith('Numpad')) return 'N' + key.slice(6);     // Numpad0-9 → N0-N9
  if (key.length === 1) return key.toUpperCase();               // Letra/número
  return key.slice(0, 4);                                        // Outros (recortado)
}

function showToast(msg, type = 'info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.classList.add('removing'); setTimeout(() => t.remove(), 300); }, 2500);
}

// Export references globally and on the namespace
window.renderSounds = renderSounds;
window.renderCategories = renderCategories;
window.updateSoundCard = updateSoundCard;
window.updateNowPlaying = updateNowPlaying;
window.updateStats = updateStats;
window.openSoundModal = openSoundModal;
window.openCategoryModal = openCategoryModal;
window.closeModal = closeModal;
window.formatTime = formatTime;
window.formatHotkeyDisplay = formatHotkeyDisplay;
window.showToast = showToast;

window.SoundMax.renderSounds = renderSounds;
window.SoundMax.renderCategories = renderCategories;
window.SoundMax.updateSoundCard = updateSoundCard;
window.SoundMax.updateNowPlaying = updateNowPlaying;
window.SoundMax.updateStats = updateStats;
window.SoundMax.openSoundModal = openSoundModal;
window.SoundMax.openCategoryModal = openCategoryModal;
window.SoundMax.closeModal = closeModal;
window.SoundMax.formatTime = formatTime;
window.SoundMax.formatHotkeyDisplay = formatHotkeyDisplay;
window.SoundMax.showToast = showToast;
