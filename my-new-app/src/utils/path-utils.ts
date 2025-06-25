import { app } from 'electron';
import path from 'path';

/**
 * 개발 환경과 배포 환경에 따라 다른 경로를 반환합니다.
 * @param relativePath 개발 환경에서의 상대 경로
 * @param exePath exe 파일의 이름
 * @returns 최종 경로
 */
export function getResourcePath(relativePath: string, exePath: string): string {
  // NODE_ENV가 production이면 배포 환경
  if (process.env.NODE_ENV === 'production') {
    return path.join(process.resourcesPath, exePath);
  }
  return path.resolve(__dirname, '../../src/exe', relativePath);
}

/**
 * 🆕 미디어 에셋 파일 경로를 반환합니다 (사용자가 교체 가능)
 * @param fileName 파일명 (intro.mp4, outro.mp4, bgm.mp3)
 * @returns 최종 미디어 파일 경로
 */
export function getMediaAssetPath(fileName: string): string {
  if (process.env.NODE_ENV === 'production') {
    // 프로덕션: resources/assets 폴더에서 찾기
    return path.join(process.resourcesPath, 'assets', fileName);
  } else {
    // 개발: src/renderer/assets 폴더에서 찾기
    return path.resolve(__dirname, '../../src/renderer/assets/videos', fileName);
  }
}

/**
 *  비디오 관련 에셋 경로들을 반환합니다
 */
export function getVideoAssetPaths() {
  return {
    intro: getMediaAssetPath('intro.mp4'),
    outro: getMediaAssetPath('outro.mp4'),
    bgm: getMediaAssetPath('bgm.mp3')
  };
}

/**
 * 개발 환경과 배포 환경에 따라 다른 env 경로를 반환합니다.
 * @returns 최종 env 경로
 */
export function getEnvPath() {
  if (process.env.NODE_ENV === 'production') {
    // 프로덕션: resources 폴더에서 .env 찾기
    return path.join(process.resourcesPath, '.env');
  } else {
    // 개발: 프로젝트 루트에서 .env 찾기
    return path.join(app.getAppPath(), '.env');
  }
}
