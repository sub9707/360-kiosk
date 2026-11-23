// IPC 채널 등록 — preload.ts 의 KioskApi 와 1:1 대응
import { app, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppInfo, Result, SettingsImport, SettingsPatch } from '../shared/types';
import { config, isStorageConfigured } from './config';
import { listFolders, listVideos, removeVideo } from './library';
import { runNetworkTest } from './nettest';
import { readSettingsFile, settingsTemplate } from './settings-file';
import type { Session } from './session';
import { testConnection } from './storage';
import { RECORD_SECONDS, detectEncoder, getActiveEncoder } from './video';

export function registerIpc(session: Session) {
  // settings
  ipcMain.handle('settings:get', () => config().getPublic());
  ipcMain.handle('settings:update', (_e, patch: SettingsPatch) => {
    config().update(patch);
    return config().getPublic();
  });
  ipcMain.handle('settings:importFile', async (): Promise<Result<SettingsImport> | null> => {
    const r = await dialog.showOpenDialog({
      title: '설정 파일 불러오기',
      properties: ['openFile'],
      filters: [
        { name: '설정 파일', extensions: ['txt', 'env', 'cfg', 'conf', 'ini', 'json'] },
        { name: '모든 파일', extensions: ['*'] },
      ],
    });
    const file = r.filePaths[0];
    if (r.canceled || !file) return null;
    try {
      const parsed = await readSettingsFile(file);
      if (!parsed.fields.length) {
        return { ok: false, error: '인식할 수 있는 설정 항목이 없습니다. [양식 저장]으로 형식을 확인하세요.' };
      }
      return { ok: true, data: { file: path.basename(file), ...parsed } };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('settings:exportTemplate', async () => {
    const r = await dialog.showSaveDialog({
      title: '설정 양식 저장',
      defaultPath: path.join(app.getPath('documents'), 'kiosk-config.txt'),
      filters: [{ name: '텍스트', extensions: ['txt'] }],
    });
    if (r.canceled || !r.filePath) return null;
    await fs.promises.writeFile(r.filePath, '﻿' + settingsTemplate(config().get()), 'utf8');
    return r.filePath;
  });
  ipcMain.handle('settings:pickSaveDir', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: '저장 폴더 선택' });
    if (r.canceled || !r.filePaths[0]) return null;
    config().update({ saveDir: r.filePaths[0] });
    return r.filePaths[0];
  });
  ipcMain.handle('settings:testStorage', async (): Promise<Result<{ latencyMs: number }>> => {
    try {
      return { ok: true, data: { latencyMs: await testConnection() } };
    } catch (e: any) {
      return { ok: false, error: e.name === 'NotFound' ? '버킷을 찾을 수 없습니다' : e.message };
    }
  });
  ipcMain.handle(
    'settings:info',
    (): AppInfo => ({
      version: app.getVersion(),
      activeEncoder: getActiveEncoder(),
      recordSeconds: RECORD_SECONDS,
      storageConfigured: isStorageConfigured(),
    }),
  );
  ipcMain.handle('settings:redetectEncoder', () => detectEncoder(true));

  // network
  ipcMain.handle('network:test', (e) =>
    runNetworkTest((step) => {
      if (!e.sender.isDestroyed()) e.sender.send('network:progress', step);
    }),
  );

  // session
  ipcMain.handle('session:get', () => session.getState());
  ipcMain.on('session:connect', () => session.connect());
  ipcMain.on('session:start', () => session.start());
  ipcMain.on('session:stop', () => session.stop());
  ipcMain.on('session:retake', () => session.retake());
  ipcMain.on('session:commit', () => void session.commit());
  ipcMain.on('session:reset', () => session.reset());

  // library
  ipcMain.handle('library:folders', () => listFolders());
  ipcMain.handle('library:videos', (_e, folder: string) => listVideos(folder));
  ipcMain.handle('library:remove', (_e, folder: string, name: string, alsoRemote: boolean) =>
    removeVideo(folder, name, alsoRemote),
  );
  ipcMain.on('library:openFolder', (_e, folder?: string) => {
    const base = config().get().saveDir;
    const target = folder && /^\d{8}$/.test(folder) ? path.join(base, folder) : base;
    fs.mkdirSync(target, { recursive: true });
    void shell.openPath(target);
  });

  ipcMain.on('app:quit', () => app.quit());
}
