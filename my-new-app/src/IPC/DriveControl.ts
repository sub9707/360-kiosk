import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

// 원본 영상 저장
ipcMain.handle('save-video-to-local', async (_event) => {
  try {
    // 현재 날짜/시간
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');

    const folderPath = `F:/videos/original/${dateStr}`;
    const fileName = `${dateStr}${timeStr}.mp4`;
    const fullPath = path.join(folderPath, fileName);

    // 디렉토리 생성 (없으면)
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // 임시 샘플 파일 경로
    const sourcePath = path.resolve(__dirname, '../../src/renderer/assets/videos/sample-background.mp4');

    // 파일 복사
    fs.copyFileSync(sourcePath, fullPath);

    return { success: true, path: fullPath };
  } catch (error) {
    console.error('영상 저장 중 오류 발생:', error);
    return { success: false, error: error.message };
  }
});

// 영상 구간 편집 [ffmpeg]
ipcMain.handle('edit-video', async (_event, inputPath: string) => {
  try {
    const parsed = path.parse(inputPath);
    const outputPath = path.join(parsed.dir, `edited_${parsed.name}.mp4`);
    const ffmpegPath = path.resolve(__dirname, '../../src/exe/ffmpeg.exe');

    // 오디오 제거하고 비디오만 편집
    const cmd = `"${ffmpegPath}" -i "${inputPath}" -an -filter_complex `
      + `"[0:v]trim=0:2,setpts=PTS-STARTPTS[v0]; `
      + `[0:v]trim=2:6,setpts=(PTS-STARTPTS)/3[v1]; `
      + `[0:v]trim=6:8,setpts=PTS-STARTPTS[v2]; `
      + `[0:v]trim=8:12,setpts=(PTS-STARTPTS)/3[v3]; `
      + `[0:v]trim=12,setpts=PTS-STARTPTS[v4]; `
      + `[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0[outv]" `
      + `-map "[outv]" "${outputPath}"`;

    console.log('🎬 편집 시작 (오디오 제거):', outputPath);

    await new Promise((resolve, reject) => {
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.error("❌ FFmpeg 편집 오류:", stderr);
          reject(error);
        } else {
          console.log("✅ 편집 완료:", outputPath);
          resolve(outputPath);
        }
      });
    });

    return { success: true, path: outputPath };
  } catch (error: any) {
    console.error("❌ 편집 처리 오류:", error);
    return { success: false, error: error.message };
  }
});

// 가장 최근 영상 찾기
ipcMain.handle('find-latest-video', async (_event) => {
  try {
    const baseDir = 'F:/videos/original';
    const sampleVideoPath = path.resolve(__dirname, '../../src/renderer/assets/videos/sample-background.mp4');

    // 기본 디렉토리가 존재하지 않으면 샘플 영상 반환
    if (!fs.existsSync(baseDir)) {
      return { success: true, path: sampleVideoPath, type: 'sample' };
    }

    // 날짜 폴더들 가져오기
    const dateFolders = fs.readdirSync(baseDir)
      .filter(folder => {
        const folderPath = path.join(baseDir, folder);
        return fs.statSync(folderPath).isDirectory() && /^\d{8}$/.test(folder);
      })
      .sort((a, b) => b.localeCompare(a)); // 최신 날짜 순으로 정렬

    let latestVideo: { path: string; mtime: Date } | null = null;

    // 각 날짜 폴더에서 가장 최근 영상 찾기
    for (const dateFolder of dateFolders) {
      const folderPath = path.join(baseDir, dateFolder);
      
      try {
        const files = fs.readdirSync(folderPath)
          .filter(file => file.endsWith('.mp4'))
          .map(file => {
            const filePath = path.join(folderPath, file);
            const stats = fs.statSync(filePath);
            return { path: filePath, mtime: stats.mtime };
          })
          .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // 최신 수정시간 순

        if (files.length > 0) {
          const folderLatest = files[0];
          if (!latestVideo || folderLatest.mtime > latestVideo.mtime) {
            latestVideo = folderLatest;
          }
        }
      } catch (error) {
        console.warn(`폴더 읽기 오류 ${folderPath}:`, error);
        continue;
      }
    }

    // 최신 영상이 있으면 반환, 없으면 샘플 영상 반환
    if (latestVideo) {
      return { success: true, path: latestVideo.path, type: 'latest' };
    } else {
      return { success: true, path: sampleVideoPath, type: 'sample' };
    }

  } catch (error) {
    console.error('최신 영상 찾기 오류:', error);
    // 오류 발생 시 샘플 영상 반환
    const sampleVideoPath = path.resolve(__dirname, '../../src/renderer/assets/videos/sample-background.mp4');
    return { success: true, path: sampleVideoPath, type: 'sample' };
  }
});

// 비디오 파일을 blob 데이터로 반환
ipcMain.handle('get-video-blob', async (_event, videoPath: string) => {
  try {
    if (!fs.existsSync(videoPath)) {
      return { success: false, error: 'File not found' };
    }

    const buffer = fs.readFileSync(videoPath);
    return { success: true, data: Array.from(buffer) };
  } catch (error) {
    console.error('비디오 blob 읽기 오류:', error);
    return { success: false, error: error.message };
  }
});