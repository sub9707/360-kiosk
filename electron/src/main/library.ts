// 영상 관리 (날짜 폴더 / 편집본 목록 / 삭제)
import fs from 'node:fs';
import path from 'node:path';
import type { LibraryFolder, LibraryVideo, Result } from '../shared/types';
import { config, isStorageConfigured } from './config';
import { mediaUrl } from './media';
import { metaPath, readMeta } from './session';
import { deleteObject } from './storage';

const isEdited = (n: string) => n.startsWith('edited_') && n.endsWith('.mp4');
const base = () => config().get().saveDir;

function safeFolder(folder: string) {
  if (!/^\d{8}$/.test(folder)) throw new Error('잘못된 폴더명');
  return path.join(base(), folder);
}

export async function listFolders(): Promise<LibraryFolder[]> {
  const entries = await fs.promises.readdir(base(), { withFileTypes: true }).catch(() => []);
  const folders = entries.filter((e) => e.isDirectory() && /^\d{8}$/.test(e.name)).map((e) => e.name);
  const result = await Promise.all(
    folders.map(async (name) => {
      const files = await fs.promises.readdir(path.join(base(), name)).catch(() => [] as string[]);
      return { name, count: files.filter(isEdited).length };
    }),
  );
  return result.sort((a, b) => b.name.localeCompare(a.name));
}

export async function listVideos(folder: string): Promise<LibraryVideo[]> {
  const dir = safeFolder(folder);
  const files = (await fs.promises.readdir(dir).catch(() => [] as string[])).filter(isEdited);
  const videos = await Promise.all(
    files.map(async (name) => {
      const file = path.join(dir, name);
      const [stat, meta] = await Promise.all([fs.promises.stat(file), readMeta(file)]);
      return {
        name,
        folder,
        url: mediaUrl(file),
        thumbUrl: mediaUrl(file, 'thumb'),
        size: stat.size,
        mtime: stat.mtimeMs,
        remoteKey: meta?.key ?? null,
      };
    }),
  );
  return videos.sort((a, b) => b.name.localeCompare(a.name));
}

export async function removeVideo(folder: string, name: string, alsoRemote: boolean): Promise<Result> {
  try {
    if (!isEdited(name) || name.includes('/') || name.includes('\\')) throw new Error('잘못된 파일명');
    const dir = safeFolder(folder);
    const file = path.join(dir, name);
    const meta = await readMeta(file);

    if (alsoRemote && meta?.key && isStorageConfigured()) {
      await deleteObject(meta.key);
    }
    const rawName = name.replace(/^edited_/, '');
    await Promise.all(
      [
        file,
        path.join(dir, rawName),
        metaPath(file),
        path.join(dir, '.thumbs', name + '.jpg'),
        // 구버전에서 생성한 QR 이미지
        path.join(dir, `${path.parse(name).name}_qr.png`),
      ].map((f) => fs.promises.rm(f, { force: true })),
    );
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
