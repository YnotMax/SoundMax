const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('soundmax', {
  // Files
  scanFolder: (path) => ipcRenderer.invoke('scan-folder', path),
  readAudioFile: (path) => ipcRenderer.invoke('read-audio-file', path),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  copyFilesToSounds: (paths) => ipcRenderer.invoke('copy-files-to-sounds', paths),
  getDefaultAudioPath: () => ipcRenderer.invoke('get-default-audio-path'),

  // Events from main
  onAllStopped: (cb) => ipcRenderer.on('all-stopped', () => cb()),
  onVcToggle: (cb) => ipcRenderer.on('vc-toggle', () => cb()),
});
