const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { AuthService } = require('./auth/service.cjs');
const { SecureVault } = require('./auth/vault.cjs');
const { publicError } = require('./auth/errors.cjs');

// Keep development data inside this project rather than touching another profile.
const smoke = process.argv.includes('--smoke-test');
if (!app.isPackaged) app.setPath('userData', path.join(__dirname, '..', smoke ? '.smoke-data' : '.local-data'));
app.setAppUserModelId('dev.lilac.launcher');
const appFile = path.join(__dirname, '..', 'src', 'index.html');
const appUrl = pathToFileURL(appFile).href;
let auth;
if (!smoke && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
});

function createWindow() {
  const win = new BrowserWindow({
    title: 'Lilac Client', width: 1280, height: 850, minWidth: 1000, minHeight: 720,
    frame: false, backgroundColor: '#101317', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  win.loadFile(appFile);
  win.once('ready-to-show', () => { if (!smoke) win.show(); });
  if (smoke) {
    win.webContents.once('did-finish-load', () => {
      require('./smoke.cjs')(win).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
    });
  }
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
}

ipcMain.on('window:control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !trusted(event)) return;
  if (action === 'minimize') win.minimize();
  if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  if (action === 'close') win.close();
});
function trusted(event) {
  return event.senderFrame === event.sender.mainFrame && event.senderFrame?.url === appUrl;
}
function authHandler(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!trusted(event)) return { ok: false, error: { code: 'untrusted_sender', message: '요청이 허용되지 않았습니다.' } };
    try { return { ok: true, state: await handler(...args) }; }
    catch (error) { return { ok: false, error: publicError(error) }; }
  });
}
authHandler('auth:state', () => auth.snapshot());
authHandler('auth:login', () => auth.login());
authHandler('auth:refresh', () => auth.refresh());
authHandler('auth:logout', () => auth.logout());
authHandler('auth:cancel', () => { auth.cancel(); return auth.snapshot(); });
app.whenReady().then(() => {
  auth = new AuthService({
    configFile: app.isPackaged ? path.join(process.resourcesPath, 'microsoft.json') : path.join(__dirname, '..', smoke ? '.smoke-data' : 'config', 'microsoft.local.json'),
    envClientId: smoke || app.isPackaged ? undefined : process.env.LILAC_MS_CLIENT_ID,
    vault: new SecureVault(path.join(app.getPath('userData'), 'auth', 'msal-cache.bin'), safeStorage),
    openBrowser: url => shell.openExternal(url),
    publish: state => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && win.webContents.getURL() === appUrl) win.webContents.send('auth:changed', state);
      }
    }
  });
  createWindow();
  auth.ready.then(() => { if (auth.account) return auth.refresh(); }).catch(() => {});
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('before-quit', () => auth?.cancel());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
