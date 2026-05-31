// GreyNet — Electron main process.
// Wraps the existing single-file index.html in a native Windows window.

const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// Disable hardware acceleration only if running in a VM where it causes blank windows
// (uncomment if you ever see a black window on launch):
// app.disableHardwareAcceleration();

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#0e1116',
    title: 'GreyNet — Network Designer',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Hide the menu bar entirely (still toggleable with Alt)
  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Show window once ready to avoid white flash
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Any window.open or target=_blank link opens in the user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
