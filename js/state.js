/* ═══════════════════════════════════════
   SoundMax - State Module
   ═══════════════════════════════════════ */

window.SoundMax = window.SoundMax || {};

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

// Export references globally and on the namespace
window.state = state;
window.saveState = saveState;
window.loadState = loadState;

window.SoundMax.state = state;
window.SoundMax.saveState = saveState;
window.SoundMax.loadState = loadState;
