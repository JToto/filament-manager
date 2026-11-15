const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

let mainWindow = null;
let serverProcess = null;

/**
 * Stellt sicher, dass das Datenverzeichnis unter `~/Library/Application Support/SpoolMate/data`
 * existiert. Beim allerersten Start legt `DatabaseManager` dort automatisch eine neue,
 * leere SQLite-Datenbank (`filaments.db`) inkl. Standard-Herstellern an.
 */
function ensureUserDataDirectory(targetDataDir) {
  if (!fs.existsSync(targetDataDir)) {
    fs.mkdirSync(targetDataDir, { recursive: true });
  }
}

/**
 * Ermittelt die installierte Node.js 22+ Binary auf macOS (da Finder-Starts nur /usr/bin im PATH haben).
 */
function resolveNodeBinary() {
  const candidates = [
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    process.env.HOME ? path.join(process.env.HOME, '.nvm/current/bin/node') : null,
    'node'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === 'node' || fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'node';
}

/**
 * Startet `server.js` über die lokale Node 22+ Runtime (inkl. nativem `node:sqlite`)
 * auf einem freien lokalen Port (127.0.0.1) und gibt die URL zurück.
 */
function spawnBackendServer(dataDir) {
  return new Promise((resolve, reject) => {
    const nodeBin = resolveNodeBinary();
    const serverScript = path.join(__dirname, '..', 'server.js');

    const env = {
      ...process.env,
      PATH: `/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ''}`,
      PORT: '0',
      HOST: '127.0.0.1',
      SPOOLMATE_DATA_DIR: dataDir
    };

    const child = spawn(nodeBin, ['--no-warnings', serverScript], {
      cwd: path.join(__dirname, '..'),
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess = child;
    let resolved = false;
    let stderrOutput = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      const match = text.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match && !resolved) {
        resolved = true;
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrOutput += text;
      process.stderr.write(text);
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    child.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        reject(
          new Error(
            `Backend-Server vorzeitig beendet (Code ${code}).\n${stderrOutput || ''}`
          )
        );
      }
    });
  });
}

async function createMainWindow() {
  const dataDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'data')
    : path.join(__dirname, '..', 'data');

  if (app.isPackaged) {
    ensureUserDataDirectory(dataDir);
  }

  const serverUrl = await spawnBackendServer(dataDir);
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'SpoolMate — Filament-Verwaltung',
    backgroundColor: '#F6F4EF',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  await mainWindow.loadURL(serverUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await createMainWindow();
  } catch (err) {
    dialog.showErrorBox(
      'SpoolMate Startfehler',
      `Der lokale SpoolMate-Server konnte nicht gestartet werden:\n\n${err.message}`
    );
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    try {
      serverProcess.kill('SIGTERM');
    } catch (_) {}
    serverProcess = null;
  }
});
