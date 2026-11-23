// 개발/배포 환경별 리소스 경로
import { app } from 'electron';
import path from 'node:path';

/** 배포: resources/<name>, 개발: 프로젝트 루트 기준 devPath */
function resource(devPath: string, prodName: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, prodName)
    : path.join(app.getAppPath(), devPath);
}

export const paths = {
  ffmpeg: () => resource('src/exe/ffmpeg/ffmpeg.exe', 'ffmpeg.exe'),
  assets: () => resource('src/renderer/assets', 'assets'),
  intro: () => path.join(paths.assets(), 'videos', 'intro.mp4'),
  outro: () => path.join(paths.assets(), 'videos', 'outro.mp4'),
  bgm: () => path.join(paths.assets(), 'videos', 'bgm.mp3'),
  /** 정규화된 인트로/아웃트로 캐시 등 */
  cache: () => path.join(app.getPath('userData'), 'cache'),
};

export function todayFolder(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${todayFolder(d)}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
