const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

process.env.MOLSPEC_ELECTRON_EMBEDDED = '1';

let mainWindow = null;
let closeServerFn = null;

async function startEmbeddedBackend() {
  const isPackaged = app.isPackaged;
  const appRoot = app.getAppPath();
  const staticDir = path.join(appRoot, 'dist');
  const dataDir = isPackaged
    ? path.join(process.resourcesPath, 'data')
    : path.join(appRoot, 'data');
  const cacheDir = path.join(app.getPath('userData'), 'pubchem-cache');

  const serverEntry = isPackaged
    ? path.join(appRoot, 'dist-electron', 'server.mjs')
    : path.join(appRoot, 'dist-electron', 'server.mjs');

  const mod = await import(pathToFileURL(serverEntry).href);
  const started = await mod.startServer({
    port: 0,
    host: '127.0.0.1',
    staticDir,
    dataDir,
    cacheDir,
    embedded: true,
  });
  closeServerFn = started.close;
  return `http://127.0.0.1:${started.port}`;
}

async function createMainWindow() {
  const devUrl = process.env.ELECTRON_START_URL;
  const targetUrl = devUrl || (await startEmbeddedBackend());

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'MolSpec ADME & PubChem Explorer',
    autoHideMenuBar: true,
    backgroundColor: '#F3F4F6',
    icon: path.join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  await mainWindow.loadURL(targetUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  if (closeServerFn) {
    try {
      closeServerFn();
    } catch {
      // ignore close errors
    }
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  }
});
