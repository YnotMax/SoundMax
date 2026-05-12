const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, nativeImage, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── Core App Setup ───
// Previne os erros de "Acesso negado" e "Gpu Cache Creation failed"
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Garante que o usuário não consiga abrir 2 SoundMax ao mesmo tempo (evita corromper cache e áudio)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Alguém tentou abrir de novo, então vamos focar na janela que já existe
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

let mainWindow = null;
let tray = null;

// ─── App State ───
const appState = {};

// ─── Media Permissions ───
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
app.on('web-contents-created', (event, contents) => {
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });
});

// ─── Sound File Loading ───

function scanAudioFolder(folderPath) {
  try {
    const files = fs.readdirSync(folderPath);
    const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.webm'];
    return files
      .filter(f => audioExts.includes(path.extname(f).toLowerCase()))
      .map(f => ({
        name: path.basename(f, path.extname(f)),
        fileName: f,
        path: path.join(folderPath, f),
        ext: path.extname(f).toLowerCase(),
        size: fs.statSync(path.join(folderPath, f)).size,
      }));
  } catch (e) {
    console.error('Error scanning folder:', e);
    return [];
  }
}

// ─── Window ───
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0a0a0f', symbolColor: '#8888a0', height: 36 },
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('SoundMax — Premium Soundboard');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir SoundMax', click: () => mainWindow.show() },
    { label: 'Parar Todos', click: () => { mainWindow?.webContents.send('all-stopped'); }},
    { type: 'separator' },
    { label: 'Sair', click: () => { app.isQuitting = true; app.quit(); }},
  ]));
  tray.on('double-click', () => mainWindow.show());
}

// ─── IPC Handlers ───
function setupIPC() {
  // Scan audio folder
  ipcMain.handle('scan-folder', (_, folderPath) => scanAudioFolder(folderPath));

  // Read audio file as buffer for renderer to decode
  ipcMain.handle('read-audio-file', (_, filePath) => {
    try {
      const buffer = fs.readFileSync(filePath);
      return buffer;
    } catch (e) {
      return null;
    }
  });

  // Open file dialog for multiple audio files
  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { 
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Áudio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] }]
    });
    return result.canceled ? [] : result.filePaths;
  });

  // Get internal audio folder (create if not exists)
  ipcMain.handle('get-default-audio-path', () => {
    const baseDir = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
    const soundsDir = path.join(baseDir, 'sounds');
    if (!fs.existsSync(soundsDir)) {
      fs.mkdirSync(soundsDir, { recursive: true });
    }
    return soundsDir;
  });

  // Copy files to internal folder
  ipcMain.handle('copy-files-to-sounds', (_, filePaths) => {
    const baseDir = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
    const soundsDir = path.join(baseDir, 'sounds');
    if (!fs.existsSync(soundsDir)) fs.mkdirSync(soundsDir, { recursive: true });
    
    let copied = 0;
    for (const src of filePaths) {
      try {
        const dest = path.join(soundsDir, path.basename(src));
        if (src !== dest && !fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
          copied++;
        }
      } catch (e) { console.error('Erro ao copiar', e); }
    }
    return copied;
  });
}

// ─── App Lifecycle ───
app.whenReady().then(() => {
  setupIPC();
  createWindow();
  createTray();
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    mainWindow?.webContents.send('all-stopped');
  });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
