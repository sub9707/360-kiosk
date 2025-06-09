import path from 'path';

/**
 * 개발 환경과 배포 환경에 따라 다른 경로를 반환합니다.
 * @param relativePath 개발 환경에서의 상대 경로
 * @param exePath exe 파일의 이름
 * @returns 최종 경로
 */
export function getResourcePath(relativePath: string, exePath: string): string {
  // NODE_ENV가 production이면 배포 환경으로 간주
  if (process.env.NODE_ENV === 'production') {
    // 배포 환경에서는 exe 디렉토리 바로 아래에 있는 exe 파일을 참조
    return path.join(process.resourcesPath, exePath);
  }
  // 개발 환경에서는 src/exe 하위의 파일을 직접 참조
  return path.resolve(__dirname, '../../src/exe', relativePath);
}
