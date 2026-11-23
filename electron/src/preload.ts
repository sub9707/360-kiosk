// contextIsolation 환경에서 renderer 에 타입이 지정된 API 만 노출한다.
import { contextBridge, ipcRenderer } from 'electron';
import type { KioskApi, SessionState } from './shared/types';

const api: KioskApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    importFile: () => ipcRenderer.invoke('settings:importFile'),
    exportTemplate: () => ipcRenderer.invoke('settings:exportTemplate'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    pickSaveDir: () => ipcRenderer.invoke('settings:pickSaveDir'),
    testStorage: () => ipcRenderer.invoke('settings:testStorage'),
    info: () => ipcRenderer.invoke('settings:info'),
    redetectEncoder: () => ipcRenderer.invoke('settings:redetectEncoder'),
  },
  session: {
    get: () => ipcRenderer.invoke('session:get'),
    connect: () => ipcRenderer.send('session:connect'),
    start: () => ipcRenderer.send('session:start'),
    stop: () => ipcRenderer.send('session:stop'),
    retake: () => ipcRenderer.send('session:retake'),
    commit: () => ipcRenderer.send('session:commit'),
    reset: () => ipcRenderer.send('session:reset'),
    onState: (cb) => {
      const listener = (_e: unknown, s: SessionState) => cb(s);
      ipcRenderer.on('session:state', listener);
      return () => ipcRenderer.removeListener('session:state', listener);
    },
  },
  network: {
    test: () => ipcRenderer.invoke('network:test'),
    onProgress: (cb) => {
      const listener = (_e: unknown, step: string) => cb(step);
      ipcRenderer.on('network:progress', listener);
      return () => ipcRenderer.removeListener('network:progress', listener);
    },
  },
  library: {
    folders: () => ipcRenderer.invoke('library:folders'),
    videos: (folder) => ipcRenderer.invoke('library:videos', folder),
    remove: (folder, name, alsoRemote) => ipcRenderer.invoke('library:remove', folder, name, alsoRemote),
    openFolder: (folder) => ipcRenderer.send('library:openFolder', folder),
  },
  app: {
    quit: () => ipcRenderer.send('app:quit'),
  },
};

contextBridge.exposeInMainWorld('kiosk', api);
