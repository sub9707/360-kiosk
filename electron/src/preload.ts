// src/preload.ts
import { ipcRenderer } from 'electron';
import path from 'path';

console.log('🔧 [Preload] Preload script starting (contextIsolation: false mode)...');

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        send: (channel: string, ...args: any[]) => void;
        on: (channel: string, listener: (...args: any[]) => void) => void;
        once: (channel: string, listener: (...args: any[]) => void) => void;
        removeListener: (channel: string, listener: (...args: any[]) => void) => void;
        removeAllListeners: (channel: string) => void;
      };
      getEnvConfig: () => Promise<any>;
      getLogoPath: () => string;
    };
  }
}

try {
  (window as any).electron = {
    ipcRenderer: {
      invoke: (channel: string, ...args: any[]) => {
        console.log(`🔧 [Preload] IPC invoke: ${channel}`, args);
        return ipcRenderer.invoke(channel, ...args);
      },
      send: (channel: string, ...args: any[]) => {
        console.log(`🔧 [Preload] IPC send: ${channel}`, args);
        ipcRenderer.send(channel, ...args);
      },
      on: (channel: string, listener: (...args: any[]) => void) => {
        console.log(`🔧 [Preload] IPC on: ${channel}`);
        ipcRenderer.on(channel, (event, ...args) => listener(...args));
      },
      once: (channel: string, listener: (...args: any[]) => void) => {
        console.log(`🔧 [Preload] IPC once: ${channel}`);
        ipcRenderer.once(channel, (event, ...args) => listener(...args));
      },
      removeListener: (channel: string, listener: (...args: any[]) => void) => {
        ipcRenderer.removeListener(channel, listener);
      },
      removeAllListeners: (channel: string) => {
        ipcRenderer.removeAllListeners(channel);
      }
    },
    getEnvConfig: () => {
      console.log('🔧 [Preload] getEnvConfig called');
      return ipcRenderer.invoke('get-env-config');
    },
    getLogoPath: () => {
      const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

      if (isDev) {
        // 개발 모드: src/renderer/assets 경로
        return `file://${path.join(__dirname, '../renderer/assets/images/logo.png').replace(/\\/g, '/')}`;
      } else {
        // 배포 모드: resources/assets/images/logo.png
        const logoPath = path.join(process.resourcesPath, 'assets', 'images', 'logo.png');
        return `file://${logoPath.replace(/\\/g, '/')}`;
      }
    }
  };

  console.log('✅ [Preload] window.electron successfully assigned (contextIsolation: false)');
} catch (error) {
  console.error('❌ [Preload] Failed to assign window.electron:', error);
}

window.addEventListener('DOMContentLoaded', () => {
  console.log('✅ [Preload] DOM loaded, window.electron available:', !!(window as any).electron);
});
