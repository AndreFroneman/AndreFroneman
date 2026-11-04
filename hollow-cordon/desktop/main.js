'use strict';
// =====================================================================
//  Hollow Cordon — desktop app (Electron main process)
//
//  Opens the game in its own window. The game is fully offline, so the
//  shell is locked down: sandboxed renderer without Node, every
//  permission request denied, new windows and navigation away from the
//  bundled files blocked, and all non-local network requests cancelled.
//
//  F11 or Alt+Enter toggles fullscreen.
// =====================================================================

const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');

// in development the game is the parent folder; packaged builds ship it as resources/game
const GAME_DIR = app.isPackaged ? path.join(process.resourcesPath, 'game') : path.join(__dirname, '..');
const LOCAL = /^(file|devtools|data|blob|chrome-extension):/i;

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 960, minHeight: 600,
    title: 'Hollow Cordon — Version 2', backgroundColor: '#07080a', show: false,
    icon: path.join(GAME_DIR, 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      spellcheck: false, backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => win.show());

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  win.on('closed', () => { win = null; });

  win.loadFile(path.join(GAME_DIR, 'index.html'));
}

app.whenReady().then(() => {
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  s.setPermissionCheckHandler(() => false);
  s.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !LOCAL.test(d.url) }));

  // macOS keeps a minimal app menu (Quit, Hide, window controls); elsewhere no menu bar
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'windowMenu' }]) : null);

  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
