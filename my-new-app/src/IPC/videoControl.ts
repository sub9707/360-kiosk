import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';

ipcMain.handle('get-latest-edited-video', async () => {
  const baseDir = 'F:/videos/original';
  try {
    const folders = fs.readdirSync(baseDir).filter((name) => {
      const fullPath = path.join(baseDir, name);
      return fs.statSync(fullPath).isDirectory();
    });

    // 가장 최근 폴더 찾기
    const latestFolder = folders.sort().reverse()[0];
    if (!latestFolder) return null;

    const folderPath = path.join(baseDir, latestFolder);
    const files = fs.readdirSync(folderPath)
      .filter(file => file.startsWith('edited_') && file.endsWith('.mp4'))
      .sort()
      .reverse(); // 가장 최근 영상

    if (files.length === 0) return null;

    const latestEdited = path.join(folderPath, files[0]);
    return latestEdited;
  } catch (error) {
    console.error('Error while fetching edited video:', error);
    return null;
  }
});
