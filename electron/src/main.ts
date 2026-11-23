import { app, BrowserWindow, globalShortcut } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { config } from './main/config';
import { registerIpc } from './main/ipc';
import { handleMediaProtocol, registerMediaScheme } from './main/media';
import { Session } from './main/session';
import { detectEncoder } from './main/video';

if (started) app.quit();

// 단일 인스턴스 (키오스크에서 중복 실행 방지)
if (!app.requestSingleInstanceLock()) app.quit();

registerMediaScheme();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 1920,
    fullscreen: app.isPackaged,
    backgroundColor: '#0a0a0c',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
  mainWindow.on('closed', () => (mainWindow = null));
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  const cfg = config();
  fs.mkdirSync(cfg.get().saveDir, { recursive: true });

  handleMediaProtocol();
  const session = new Session(() => mainWindow);
  registerIpc(session);
  createWindow();

  // 앱 시작과 동시에 카메라 연결 + 인코더 감지를 백그라운드로 진행 (첫 촬영 대기시간 제거)
  session.connect();
  detectEncoder()
    .then((enc) => console.log('[main] 사용 인코더:', enc))
    .catch((e) => console.error('[main] 인코더 감지 실패', e));

  // 개발 편의: F12 개발자 도구
  globalShortcut.register('F12', () => mainWindow?.webContents.toggleDevTools());
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
