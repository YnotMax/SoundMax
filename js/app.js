/* ═══════════════════════════════════════
   SoundMax - Entry Point (Orchestrator)
   ═══════════════════════════════════════ */

async function init() {
  loadState();
  if (state.viewMode === 'list') {
    document.getElementById('soundGrid').classList.add('list-view');
    document.getElementById('viewList').classList.add('active');
    document.getElementById('viewGrid').classList.remove('active');
  }
  document.getElementById('masterVolume').value = state.masterVolume;
  document.getElementById('masterVolumeLabel').textContent = state.masterVolume + '%';

  // Restaurar volume do mic salvo
  const savedMicVol = localStorage.getItem('soundmax_micVol') || '100';
  const micVolEl = document.getElementById('micVolume');
  const micVolLabel = document.getElementById('micVolumeLabel');
  if (micVolEl) { micVolEl.value = savedMicVol; }
  if (micVolLabel) { micVolLabel.textContent = savedMicVol + '%'; }

  initEvents();
  initVoiceChanger();
  await initDevices();
  renderCategories();
  renderSounds();
  updateStats();

  const defaultPath = await window.soundmax.getDefaultAudioPath();
  if (defaultPath) loadAudioFolder(defaultPath);
}

document.addEventListener('DOMContentLoaded', init);
