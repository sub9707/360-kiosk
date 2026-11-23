// 브랜딩 리소스 (로고 / 인트로 / 아웃트로 / 배경음악)
// - 사용자가 고른 파일을 userData/branding/<kind>.<ext> 로 복사해 둔다. (원본 이동·삭제와 무관)
// - 사용자 파일이 없으면 앱에 포함된 기본 파일을 사용한다.
import { app, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { BrandAsset, BrandAssetInfo, Result } from '../shared/types';
import { paths } from './paths';
import { probeMedia } from './video';

const SPEC: Record<BrandAsset, { label: string; exts: string[]; max?: number }> = {
  logo: { label: '로고 이미지', exts: ['png', 'jpg', 'jpeg', 'webp', 'svg'] },
  intro: { label: '인트로 영상', exts: ['mp4', 'mov', 'webm', 'mkv'], max: 30 },
  outro: { label: '아웃트로 영상', exts: ['mp4', 'mov', 'webm', 'mkv'], max: 30 },
  bgm: { label: '배경음악', exts: ['mp3', 'm4a', 'aac', 'wav', 'ogg'], max: 600 },
};

export const BRAND_ASSETS = Object.keys(SPEC) as BrandAsset[];

const dir = () => path.join(app.getPath('userData'), 'branding');
const namesFile = () => path.join(dir(), 'names.json');

function defaultPath(kind: BrandAsset): string {
  if (kind === 'logo') return path.join(paths.assets(), 'images', 'logo.png');
  return paths[kind]();
}

/** 사용자 지정 파일 경로 (없으면 null) */
function customPath(kind: BrandAsset): string | null {
  const files = fs.existsSync(dir()) ? fs.readdirSync(dir()) : [];
  const hit = files.find((f) => path.parse(f).name === kind && !f.endsWith('.part'));
  return hit ? path.join(dir(), hit) : null;
}

/** 편집·표시에 실제로 쓰는 파일 */
export function brandPath(kind: BrandAsset): string {
  return customPath(kind) ?? defaultPath(kind);
}

function readNames(): Partial<Record<BrandAsset, string>> {
  try {
    return JSON.parse(fs.readFileSync(namesFile(), 'utf8'));
  } catch {
    return {};
  }
}

function writeNames(names: Partial<Record<BrandAsset, string>>) {
  fs.writeFileSync(namesFile(), JSON.stringify(names));
}

export async function brandInfo(): Promise<BrandAssetInfo[]> {
  const names = readNames();
  return Promise.all(
    BRAND_ASSETS.map(async (kind) => {
      const custom = customPath(kind);
      const file = custom ?? defaultPath(kind);
      const stat = fs.existsSync(file) ? fs.statSync(file) : null;
      let duration: number | undefined;
      if (kind !== 'logo' && stat) duration = (await probeMedia(file).catch(() => null))?.duration;
      return {
        kind,
        label: SPEC[kind].label,
        custom: !!custom,
        name: custom ? names[kind] ?? path.basename(custom) : '기본',
        url: stat ? `kiosk-media://brand/${kind}?v=${Math.round(stat.mtimeMs)}` : null,
        duration,
      };
    }),
  );
}

/** 파일 선택 → 검사 → 복사. 취소 시 null */
export async function pickBrandAsset(kind: BrandAsset): Promise<Result | null> {
  const spec = SPEC[kind];
  const r = await dialog.showOpenDialog({
    title: `${spec.label} 선택`,
    properties: ['openFile'],
    filters: [{ name: spec.label, extensions: spec.exts }],
  });
  const src = r.filePaths[0];
  if (r.canceled || !src) return null;

  try {
    const ext = path.extname(src).slice(1).toLowerCase();
    if (!spec.exts.includes(ext)) throw new Error(`지원하지 않는 형식입니다 (${spec.exts.join(', ')})`);

    if (kind !== 'logo') {
      const info = await probeMedia(src);
      if (kind === 'bgm' && !info.audio) throw new Error('오디오가 없는 파일입니다.');
      if (kind !== 'bgm' && !info.video) throw new Error('영상이 없는 파일입니다.');
      if (info.duration < 0.5) throw new Error('너무 짧은 파일입니다.');
      if (spec.max && info.duration > spec.max) {
        throw new Error(`${spec.max}초 이하 파일만 사용할 수 있습니다. (현재 ${info.duration.toFixed(1)}초)`);
      }
    } else if (fs.statSync(src).size > 10 * 1024 * 1024) {
      throw new Error('10MB 이하 이미지만 사용할 수 있습니다.');
    }

    await fs.promises.mkdir(dir(), { recursive: true });
    const dest = path.join(dir(), `${kind}.${ext}`);
    const tmp = dest + '.part';
    await fs.promises.copyFile(src, tmp);
    const old = customPath(kind);
    if (old) await fs.promises.rm(old, { force: true });
    await fs.promises.rename(tmp, dest);
    writeNames({ ...readNames(), [kind]: path.basename(src) });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function resetBrandAsset(kind: BrandAsset): Promise<void> {
  const old = customPath(kind);
  if (old) await fs.promises.rm(old, { force: true });
  const names = readNames();
  delete names[kind];
  if (fs.existsSync(dir())) writeNames(names);
}
