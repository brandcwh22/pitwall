/**
 * Pit Wall desktop shell (Electron).
 *
 * Optional wrapper that makes Pit Wall a double-clickable app: it boots the same
 * zero-dependency web server as a child process and opens a native window at it.
 * The web app (`npm start`) still works without any of this.
 *
 * Design notes:
 * - The server is launched with ELECTRON_RUN_AS_NODE, so Electron's bundled Node
 *   runs it — no system Node needed for a packaged app.
 * - Writable files (config, tokens, settings) are redirected to the OS user-data
 *   dir via PITWALL_DATA_DIR, so a read-only packaged bundle can still save them.
 * - External links open in the user's real browser; internal pages stay in-window.
 */

const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'src', 'server.js');
const PORT = Number(process.env.PORT) || 4270;
const BASE = `http://localhost:${PORT}`;

let serverProc = null;
let win = null;

/** Resolve when the server answers /api/health, or reject after `timeoutMs`. */
function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get(`${BASE}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on('error', retry);
      req.setTimeout(1000, () => req.destroy());
    };
    const retry = () => (Date.now() > deadline ? reject(new Error('server did not start')) : setTimeout(ping, 300));
    ping();
  });
}

/** Start the server as a child, unless one is already listening on PORT. */
async function ensureServer() {
  try {
    await waitForServer(800); // already running (e.g. `npm start`) — reuse it
    return;
  } catch { /* not up yet; start our own */ }

  serverProc = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(PORT),
      PITWALL_DATA_DIR: app.getPath('userData'),
    },
    stdio: 'inherit',
  });
  serverProc.on('exit', (code) => {
    serverProc = null;
    if (code && win) dialog.showErrorBox('Pit Wall', `The server stopped unexpectedly (exit ${code}).`);
  });
  await waitForServer();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 520,
    title: 'Pit Wall',
    backgroundColor: '#0a0e14',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  // Open off-site links (Shortcut, docs, story links) in the real browser;
  // keep our own localhost pages inside the window.
  const isExternal = (url) => {
    try { return new URL(url).origin !== BASE; } catch { return false; }
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isExternal(url)) { e.preventDefault(); shell.openExternal(url); }
  });

  win.loadURL(BASE);
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  try {
    await ensureServer();
    createWindow();
  } catch (err) {
    dialog.showErrorBox('Pit Wall', `Could not start the app:\n${err.message}`);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());

// Only tear down the server if this process started it.
app.on('quit', () => { if (serverProc) serverProc.kill(); });
