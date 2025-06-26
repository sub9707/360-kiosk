import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// ✨ 빌드 환경 감지 함수 (NODE_ENV에 의존하지 않음)
function isProduction(): boolean {
  return app.isPackaged;
}

// ✨ 환경에 따른 .env 경로 계산 (resources 폴더 사용)
function getEnvPath(): string {
  if (isProduction()) {
    // 프로덕션: resources 폴더에서 .env 파일 찾기
    return path.join(process.resourcesPath, '.env');
  } else {
    // 개발: 프로젝트 루트에서 .env 찾기
    return path.join(app.getAppPath(), '.env');
  }
}

// ✨ NODE_ENV 강제 설정 (앱 패키징 상태 기반)
if (isProduction()) {
  process.env.NODE_ENV = 'production';
} else if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

// ✨ 기본 .env 파일 생성 함수
function createDefaultEnvFile(envPath: string) {
  const defaultEnvContent = `# ========================================
# 키오스크 프로그램 설정
# ========================================
# 수정 후 파일을 저장하고 프로그램을 다시 시작하면 설정이 적용됩니다.

# 환경 설정 (이 값은 자동으로 설정되므로 수정하지 마세요)
NODE_ENV=${isProduction() ? 'production' : 'development'}

# copyright를 true로 바꾸면 화면 아래 저작권 표시가 나타납니다.
# copyright를 false로 바꾸면 사라집니다.
copyright=true

# 네트워크 설정
# IP 주소를 현재 PC의 실제 IP로 변경하세요
WIRELESS_ADDRESS=192.168.1.100

# 영상 저장 경로
# 영상이 저장될 폴더 경로를 설정하세요
# 주의: 백슬래시(\\)는 두 번씩 써야 합니다 (예: C:\\\\videos\\\\original)
BASE_DIRECTORY=C:\\\\videos\\\\original
VITE_BASE_DIRECTORY=C:\\\\videos\\\\original

# Google Drive 설정
# 영상이 업로드될 Google Drive의 최상위 폴더 ID를 입력하세요.
# 구글드라이브 폴더 들어간 뒤, https://drive.google.com/drive/folders/[여기 문자열]
# 예시: DRIVE_FOLDER_ID=1bR2A-WxQkRD51lByA6r8ePt51cqF8O8B
DRIVE_FOLDER_ID=1bR2A-WxQkRD51lByA6r8ePt51cqF8O8B
`;

  try {
    // 디렉토리가 없으면 생성
    const envDir = path.dirname(envPath);
    if (!fs.existsSync(envDir)) {
      fs.mkdirSync(envDir, { recursive: true });
    }

    fs.writeFileSync(envPath, defaultEnvContent, 'utf8');
    console.log(`[main.ts] ✅ Default .env file created: ${envPath}`);
    console.log(`[main.ts] 📝 To change settings, edit this file with notepad.`);
    return true;
  } catch (error) {
    console.error(`[main.ts] ❌ Failed to create .env file:`, error);
    return false;
  }
}

// ✨ .env 파일 로드 및 검증
const envPath = getEnvPath();
console.log(`[main.ts] 🔧 Runtime environment: ${isProduction() ? 'Production (Built)' : 'Development'}`);
console.log(`[main.ts] 📂 Config file path: ${envPath}`);

// .env 파일이 없으면 기본 파일 생성
if (!fs.existsSync(envPath)) {
  console.log(`[main.ts] ⚠️ Config file not found. Creating default config file...`);
  const success = createDefaultEnvFile(envPath);
  if (success) {
    console.log(`[main.ts] 💡 Please edit the config file to modify IP address and storage path: ${envPath}`);
  } else {
    console.error(`[main.ts] ❌ Failed to create .env file at specified path.`);
  }
} else {
  console.log(`[main.ts] ✅ Config file found: ${envPath}`);
}

// dotenv로 환경변수 로드
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('[main.ts] ❌ Failed to read config file:', result.error);
} else {
  console.log('[main.ts] ✅ Config file loaded successfully');

  // .env에서 NODE_ENV가 로드되었지만, 패키징 상태와 다르면 강제 수정
  if (isProduction() && process.env.NODE_ENV !== 'production') {
    process.env.NODE_ENV = 'production';
  } else if (!isProduction() && process.env.NODE_ENV !== 'development') {
    process.env.NODE_ENV = 'development';
  }
}

// 필수 설정값 검증
if (!process.env.BASE_DIRECTORY || !process.env.WIRELESS_ADDRESS) {
  console.warn('⚠️ Some required settings are missing. Please check the .env file.');
}

// ✨ 환경변수 로드 후 동적으로 IPC 모듈들 import
async function loadIpcModules() {
  console.log('[main.ts] 🔌 Loading IPC modules...');

  await import('./IPC/DriveControl');
  await import('./IPC/MobileControl');
  await import('./IPC/VideoControl');

  ipcMain.handle('get-env-config', () => {
    return {
      copyright: process.env.copyright === 'true',
      nodeEnv: process.env.NODE_ENV,
      baseDirectory: process.env.BASE_DIRECTORY,
      wirelessAddress: process.env.WIRELESS_ADDRESS,
      driveFolderId: process.env.DRIVE_FOLDER_ID
    };
  });

  console.log('[main.ts] ✅ All IPC modules loaded successfully');
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1080,
    height: 1920,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    fullscreen: true,
    resizable: true
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open DevTools only in development mode
  if (!isProduction()) {
    mainWindow.webContents.openDevTools();
  }
};

app.on('ready', async () => {
  await loadIpcModules();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on('exit-app', () => {
  app.quit();
});