// src/utils/path-utils.ts
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

/**
 * 환경에 따른 적절한 리소스 경로를 반환합니다.
 */
export function getAppResourcePath(devPath: string, prodFileName: string): string {
  if (app.isPackaged) {
    // 프로덕션 환경: process.resourcesPath 사용
    const resourcePath = path.join(process.resourcesPath, prodFileName);
    console.log(`[path-utils] 프로덕션 리소스 경로: ${resourcePath}`);
    return resourcePath;
  } else {
    // 개발 환경: 프로젝트 루트 기준
    const devFullPath = path.join(app.getAppPath(), devPath);
    console.log(`[path-utils] 개발 리소스 경로: ${devFullPath}`);
    return devFullPath;
  }
}

/**
 * FFmpeg 실행 파일 경로를 반환합니다.
 */
export function getExecutablePath(devPath: string, prodFileName: string): string {
  if (app.isPackaged) {
    // 프로덕션 환경: 다양한 경로에서 FFmpeg 찾기
    const possiblePaths = [
      // 1. 기본 resources 경로
      path.join(process.resourcesPath, prodFileName),
      
      // 2. exe 폴더 안에 있는 경우
      path.join(process.resourcesPath, 'exe', prodFileName),
      
      // 3. exe/ffmpeg 폴더 안에 있는 경우
      path.join(process.resourcesPath, 'exe', 'ffmpeg', prodFileName),
      
      // 4. src/exe 구조가 그대로 복사된 경우
      path.join(process.resourcesPath, 'src', 'exe', 'ffmpeg', prodFileName),
      
      // 5. 실행파일과 같은 폴더에 있는 경우
      path.join(path.dirname(process.execPath), prodFileName),
      
      // 6. 실행파일 폴더의 resources 하위
      path.join(path.dirname(process.execPath), 'resources', prodFileName),
      path.join(path.dirname(process.execPath), 'resources', 'exe', prodFileName),
      
      // 7. app.asar.unpacked 경로 (asar에서 제외된 파일들)
      path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'exe', 'ffmpeg', prodFileName),
    ];
    
    console.log(`[path-utils] 🔍 FFmpeg 파일을 찾는 중...`);
    
    for (const testPath of possiblePaths) {
      console.log(`[path-utils] 확인 중: ${testPath}`);
      if (fs.existsSync(testPath)) {
        console.log(`✅ [path-utils] FFmpeg 찾음: ${testPath}`);
        return testPath;
      }
    }
    
    // 모든 경로에서 찾지 못한 경우 디버깅 정보 출력
    console.error(`❌ [path-utils] FFmpeg을 찾을 수 없습니다.`);
    console.error(`[path-utils] 디버깅 정보:`);
    console.error(`   - process.resourcesPath: ${process.resourcesPath}`);
    console.error(`   - process.execPath: ${process.execPath}`);
    console.error(`   - app.getAppPath(): ${app.getAppPath()}`);
    console.error(`   - __dirname: ${__dirname}`);
    
    // resources 폴더 내용 확인
    try {
      const resourcesContents = fs.readdirSync(process.resourcesPath);
      console.error(`   - resources 폴더 내용: ${resourcesContents.join(', ')}`);
      
      // exe 폴더가 있는지 확인
      const exePath = path.join(process.resourcesPath, 'exe');
      if (fs.existsSync(exePath)) {
        const exeContents = fs.readdirSync(exePath);
        console.error(`   - exe 폴더 내용: ${exeContents.join(', ')}`);
      }
    } catch (error) {
      console.error(`   - resources 폴더 확인 실패: ${error}`);
    }
    
    // 첫 번째 경로를 기본값으로 반환 (에러 메시지에서 경로 확인용)
    return possiblePaths[0];
    
  } else {
    // 개발 환경
    const devFullPath = path.join(app.getAppPath(), devPath);
    console.log(`[path-utils] 개발 FFmpeg 경로: ${devFullPath}`);
    
    if (!fs.existsSync(devFullPath)) {
      console.error(`❌ [path-utils] 개발 환경 FFmpeg을 찾을 수 없습니다: ${devFullPath}`);
    }
    
    return devFullPath;
  }
}

/**
 * 비디오 에셋 파일들의 경로를 반환합니다.
 */
export function getVideoAssetPaths() {
  if (app.isPackaged) {
    // 프로덕션 환경: 다양한 경로에서 assets 찾기
    const possibleAssetsPaths = [
      // 1. 기본 resources/assets 경로
      path.join(process.resourcesPath, 'assets'),
      
      // 2. src/renderer/assets 구조가 그대로 복사된 경우
      path.join(process.resourcesPath, 'src', 'renderer', 'assets'),
      
      // 3. app.asar.unpacked 경로
      path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'renderer', 'assets'),
    ];
    
    let assetsPath = '';
    for (const testPath of possibleAssetsPaths) {
      if (fs.existsSync(testPath)) {
        assetsPath = testPath;
        console.log(`✅ [path-utils] Assets 폴더 찾음: ${assetsPath}`);
        break;
      }
    }
    
    if (!assetsPath) {
      // 기본 경로 사용
      assetsPath = possibleAssetsPaths[0];
      console.warn(`⚠️ [path-utils] Assets 폴더를 찾을 수 없어 기본 경로 사용: ${assetsPath}`);
    }
    
    const paths = {
      intro: path.join(assetsPath, 'videos', 'intro.mp4'),
      outro: path.join(assetsPath, 'videos', 'outro.mp4'),
      bgm: path.join(assetsPath, 'videos', 'bgm.mp3')
    };
    
    // 각 파일 존재 여부 확인
    Object.entries(paths).forEach(([name, filePath]) => {
      if (fs.existsSync(filePath)) {
        console.log(`✅ [path-utils] ${name} 파일 확인: ${filePath}`);
      } else {
        console.error(`❌ [path-utils] ${name} 파일 없음: ${filePath}`);
      }
    });
    
    return paths;
    
  } else {
    // 개발 환경
    const assetsPath = path.join(app.getAppPath(), 'src', 'renderer', 'assets');
    console.log(`[path-utils] 개발 비디오 에셋 경로: ${assetsPath}`);
    
    return {
      intro: path.join(assetsPath, 'videos', 'intro.mp4'),
      outro: path.join(assetsPath, 'videos', 'outro.mp4'),
      bgm: path.join(assetsPath, 'videos', 'bgm.mp3')
    };
  }
}