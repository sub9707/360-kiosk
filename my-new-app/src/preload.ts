// src/preload.ts
import { ipcRenderer } from 'electron';

console.log('🔧 [Preload] Preload script starting (contextIsolation: false mode)...');

// contextIsolation: false일 때는 window 객체에 직접 할당
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
    };
  }
}

try {
  // contextIsolation: false일 때는 window에 직접 할당
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
    }
  };

  console.log('✅ [Preload] window.electron successfully assigned (contextIsolation: false)');
} catch (error) {
  console.error('❌ [Preload] Failed to assign window.electron:', error);
}

// DOM 로드 확인
window.addEventListener('DOMContentLoaded', () => {
  console.log('✅ [Preload] DOM loaded, window.electron available:', !!(window as any).electron);
});