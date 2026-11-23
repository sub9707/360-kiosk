// 영상 관리 (날짜 폴더 / 편집본 목록 / 삭제)
import fs from 'node:fs';
import path from 'node:path';
import type { LibraryFolder, LibraryVideo, Result } from '../shared/types';
import { config, isStorageConfigured } from './config';
import { mediaUrl } from './media';
import { metaPath, readMeta, writeMeta } from './session';
import { deleteObject, makeObjectKey, shareUrlFor, uploadFile } from './storage';

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

/**
 * 영상 관리에서 QR 을 다시 띄우기 위한 공유 링크.
 * - 업로드된 영상: 링크를 새로 만듦 (서명 URL 이면 유효기간 7일 갱신)
 * - 로컬에만 있는 영상: upload=true 일 때 지금 업로드
 */
export async function shareVideo(folder: string, name: string, upload: boolean): Promise<Result<string>> {
  try {
    if (!isEdited(name) || name.includes('/') || name.includes('\\')) throw new Error('잘못된 파일명');
    const file = path.join(safeFolder(folder), name);
    const meta = await readMeta(file);

    if (meta?.key) {
      if (!isStorageConfigured()) return { ok: true, data: meta.url };
      return { ok: true, data: await shareUrlFor(meta.key) };
    }
    if (!upload) return { ok: false, error: '클라우드에 업로드되지 않은 영상입니다.' };
    if (!isStorageConfigured()) return { ok: false, error: 'R2 저장소가 설정되지 않았습니다.' };

    const key = makeObjectKey(folder);
    await uploadFile(file, key);
    const url = await shareUrlFor(key);
    await writeMeta(file, { key, url, uploadedAt: Date.now() });
    return { ok: true, data: url };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
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
