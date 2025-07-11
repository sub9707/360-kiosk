import { ipcMain, app } from 'electron';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { google } from 'googleapis';
import QRCode from 'qrcode';
import { getAppResourcePath, getExecutablePath, getVideoAssetPaths } from '../utils/path-utils';

// Google Drive 인증 설정
const KEYFILEPATH = getAppResourcePath('credentials.json', 'credentials.json');
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: SCOPES,
});
const drive = google.drive({ version: 'v3', auth });

// PC에 영상 파일을 저장할 기본 디렉토리
const VIDEO_SAVE_BASE_DIR = process.env.BASE_DIRECTORY;

// Google Drive 폴더 ID
const DRIVE_FOLDER_ID_FROM_ENV = process.env.DRIVE_FOLDER_ID;


ipcMain.handle('edit-video', async (_event, inputPath: string) => {
  try {
    const startTime = Date.now();
    console.log('🎬 [DriveControl] 영상 편집 시작:', inputPath);

    // Kiosk 폴더 ID 유효성 검사
    if (!DRIVE_FOLDER_ID_FROM_ENV) {
      throw new Error('DRIVE_FOLDER_ID is not defined in the environment variables. Please check your .env file.');
    }

    const parsed = path.parse(inputPath);
    const outputPath = path.join(parsed.dir, `edited_${parsed.name}.mp4`);
    
    // 🆕 FFmpeg 경로 가져오기 및 확인
    console.log('🔧 [DriveControl] FFmpeg 경로 확인 중...');
    const ffmpegPath = getExecutablePath('src/exe/ffmpeg/ffmpeg.exe', 'ffmpeg.exe');
    
    // 🔧 FFmpeg 파일 존재 여부 확인
    if (!fs.existsSync(ffmpegPath)) {
      console.error('❌ [DriveControl] FFmpeg 실행 파일을 찾을 수 없습니다:', ffmpegPath);
      throw new Error(`FFmpeg 실행 파일을 찾을 수 없습니다: ${ffmpegPath}. 프로그램을 다시 설치해주세요.`);
    }

    console.log('📁 [DriveControl] 출력 경로:', outputPath);
    console.log('✅ [DriveControl] FFmpeg 경로 확인됨:', ffmpegPath);

    const tempMainPath = path.join(parsed.dir, `temp_main_${parsed.name}.mp4`);

    // 🔧 **고화질 배속 편집** (화질 보존 + 메모리 효율성)
    const mainEditCmd = `"${ffmpegPath}" -i "${inputPath}" -filter_complex ` +
      `"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[scaled]; ` +
      // 원본에서 직접 각 구간을 추출하여 배속 적용 (2.5초부터 시작)
      `[scaled]trim=start=2.5:end=6.5,setpts=PTS-STARTPTS,setpts=2.0*PTS[v0]; ` + // 2.5~6.5초(4초분량)를 0.5배속 -> 8초
      `[scaled]trim=start=6.5:end=8.5,setpts=PTS-STARTPTS[v1]; ` + // 6.5~8.5초(2초분량)를 1배속 -> 2초
      `[scaled]trim=start=8.5:end=12.5,setpts=PTS-STARTPTS,setpts=2.0*PTS[v2]; ` + // 8.5~12.5초(4초분량)를 0.5배속 -> 8초
      `[scaled]trim=start=12.5:end=17.5,setpts=PTS-STARTPTS[v3]; ` + // 12.5~17.5초(5초분량)를 1배속 -> 5초
      // 단순 연결
      `[v0][v1][v2][v3]concat=n=4:v=1:a=0[outv]" ` +
      `-map "[outv]" -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p ` +
      `-profile:v high -level 4.1 -tune film -an ` +
      `-threads 0 -g 30 -bf 2 -refs 3 ` +
      `-bufsize 4M -maxrate 8M "${tempMainPath}"`;

    console.log('🚀 [DriveControl] 고화질 배속 편집 명령어 실행');

    await new Promise<void>((resolve, reject) => {
      exec(mainEditCmd, {
        maxBuffer: 1024 * 1024 * 50, // 50MB 버퍼 (화질 향상을 위해 증가)
        timeout: 180000 // 3분 타임아웃 (고화질 처리를 위해 증가)
      }, (error, stdout, stderr) => {
        if (error) {
          console.error("❌ [DriveControl] 배속 편집 오류:", error.message);
          console.error("❌ [DriveControl] FFmpeg stderr:", stderr);
          console.error("❌ [DriveControl] FFmpeg stdout:", stdout);
          reject(new Error(`배속 편집 실패: ${error.message}`));
        } else {
          console.log("✅ [DriveControl] 배속 편집 완료");
          if (stdout) console.log("📄 [DriveControl] FFmpeg stdout:", stdout);
          resolve();
        }
      });
    });

    // 🎵 intro + main + outro + BGM 합성 (고화질 버전)
    console.log('🎬 [DriveControl] 에셋 파일 경로 확인 중...');
    const assetPaths = getVideoAssetPaths();
    const introPath = assetPaths.intro;
    const outroPath = assetPaths.outro;
    const bgmPath = assetPaths.bgm;

    console.log('🎬 [DriveControl] assets directory:');
    console.log('   - Intro:', introPath);
    console.log('   - Outro:', outroPath);
    console.log('   - BGM:', bgmPath);

    // 🔧 에셋 파일들 존재 여부 확인
    const assetFiles = [
      { name: 'Intro', path: introPath },
      { name: 'Outro', path: outroPath },
      { name: 'BGM', path: bgmPath }
    ];

    for (const asset of assetFiles) {
      if (!fs.existsSync(asset.path)) {
        console.error(`❌ [DriveControl] ${asset.name} 파일을 찾을 수 없습니다: ${asset.path}`);
        throw new Error(`${asset.name} 파일을 찾을 수 없습니다: ${asset.path}. 프로그램을 다시 설치해주세요.`);
      } else {
        console.log(`✅ [DriveControl] ${asset.name} 파일 확인됨: ${asset.path}`);
      }
    }

    const finalCmd = `"${ffmpegPath}" -i "${introPath}" -i "${tempMainPath}" -i "${outroPath}" -i "${bgmPath}" -filter_complex ` +
      `"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[intro]; ` +
      `[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[main]; ` +
      `[2:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[outro]; ` +
      `[intro][main][outro]concat=n=3:v=1:a=0[outv]; ` +
      `[3:a]atrim=0:35,afade=t=in:d=1,afade=t=out:st=34:d=1,volume=0.8[bgm]" ` +
      `-map "[outv]" -map "[bgm]" ` +
      `-c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p ` +     // CRF 20로 높은 화질
      `-profile:v high -level 4.1 -tune film ` +                    // 고품질 프로파일
      `-c:a aac -b:a 192k -ar 48000 ` +                            // 고품질 오디오
      `-threads 0 -g 30 -bf 2 -refs 3 ` +                          // 최적화된 인코딩 설정
      `-movflags +faststart ` +                                     // 웹 재생 최적화
      `-bufsize 6M -maxrate 12M "${outputPath}"`;                   // 더 높은 비트레이트

    console.log('🚀 [DriveControl] 고화질 최종 합성 명령어 실행');

    await new Promise<void>((resolve, reject) => {
      exec(finalCmd, {
        maxBuffer: 1024 * 1024 * 80, // 80MB 버퍼 (고화질 처리)
        timeout: 300000 // 5분 타임아웃 (고화질 처리를 위해 증가)
      }, (error, stdout, stderr) => {
        if (error) {
          console.error("❌ [DriveControl] 최종 편집 오류:", error.message);
          console.error("❌ [DriveControl] FFmpeg stderr:", stderr);
          console.error("❌ [DriveControl] FFmpeg stdout:", stdout);
          reject(new Error(`최종 편집 실패: ${error.message}`));
        } else {
          console.log("✅ [DriveControl] 최종 편집 완료");
          if (stdout) console.log("📄 [DriveControl] FFmpeg stdout:", stdout);
          resolve();
        }
      });
    });

    // 임시 파일 정리
    await fsPromises.unlink(tempMainPath).catch((cleanupError) => {
      console.warn('⚠️ [DriveControl] 임시 파일 삭제 실패:', cleanupError);
    });

    // 출력 파일 확인
    const stats = await fsPromises.stat(outputPath);
    if (stats.size === 0) {
      throw new Error('편집된 파일이 비어있습니다');
    }

    const endTime = Date.now(); // ✨ 편집 종료 시간 기록
    const totalDuration = ((endTime - startTime) / 1000).toFixed(2); // 초 단위로 변환
    console.log(`✅ [DriveControl] 총 편집 소요 시간: ${totalDuration} 초`);

    console.log(`✅ [DriveControl] 고화질 편집 완료: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
    return { success: true, path: outputPath };

  } catch (error: any) {
    console.error("❌ [DriveControl] 영상 편집 프로세스 오류:", error);
    return { success: false, error: error.message };
  }
});

// 🆕 가장 최신 비디오 파일 찾기 핸들러
ipcMain.handle('find-latest-video', async () => {
  try {
    console.log('🔍 Finding latest video in:', VIDEO_SAVE_BASE_DIR);

    const todayFolder = getTodayFolder();
    const todayDir = path.join(VIDEO_SAVE_BASE_DIR, todayFolder);

    console.log('📁 Checking today folder:', todayDir);

    // 오늘 폴더가 존재하는지 확인
    if (!await fsPromises.access(todayDir).then(() => true).catch(() => false)) {
      console.warn('⚠️ Today folder does not exist:', todayDir);
      return { success: false, error: 'No videos found for today' };
    }

    const files = await fsPromises.readdir(todayDir);
    console.log('📂 Files in today folder:', files);

    // edited_ 파일 우선, 그 다음 일반 mp4 파일
    const editedFiles = files.filter(f => f.startsWith('edited_') && f.endsWith('.mp4'));
    const originalFiles = files.filter(f => !f.startsWith('edited_') && f.endsWith('.mp4') && f !== 'intro.mp4' && f !== 'outro.mp4');

    console.log('🎬 Edited files:', editedFiles);
    console.log('📹 Original files:', originalFiles);

    let targetFile = '';
    let type = '';

    if (editedFiles.length > 0) {
      // 편집된 파일이 있으면 가장 최신 것
      editedFiles.sort((a, b) => b.localeCompare(a));
      targetFile = editedFiles[0];
      type = 'edited';
    } else if (originalFiles.length > 0) {
      // 편집된 파일이 없으면 원본 파일 중 가장 최신 것
      originalFiles.sort((a, b) => b.localeCompare(a));
      targetFile = originalFiles[0];
      type = 'original';
    } else {
      console.warn('⚠️ No video files found');
      return { success: false, error: 'No video files found' };
    }

    const targetPath = path.join(todayDir, targetFile);
    console.log(`✅ Latest video found: ${targetPath} (type: ${type})`);

    // 파일이 실제로 존재하는지 확인
    const exists = await fsPromises.access(targetPath).then(() => true).catch(() => false);
    if (!exists) {
      console.error('❌ File does not exist:', targetPath);
      return { success: false, error: 'File not found' };
    }

    return { success: true, path: targetPath, type };

  } catch (error: any) {
    console.error('❌ Error finding latest video:', error);
    return { success: false, error: error.message };
  }
});

// 🆕 비디오 파일을 blob으로 읽어오는 핸들러
ipcMain.handle('get-video-blob', async (_event, videoPath: string) => {
  try {
    console.log('📹 Reading video blob from:', videoPath);

    // 파일 존재 확인
    if (!await fsPromises.access(videoPath).then(() => true).catch(() => false)) {
      console.error('❌ Video file not found:', videoPath);
      return { success: false, error: 'Video file not found' };
    }

    const stats = await fsPromises.stat(videoPath);
    console.log(`📊 Video file stats: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

    if (stats.size === 0) {
      console.error('❌ Video file is empty:', videoPath);
      return { success: false, error: 'Video file is empty' };
    }

    const buffer = await fsPromises.readFile(videoPath);
    console.log(`✅ Video blob read successfully: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);

    return { success: true, data: Array.from(buffer) };

  } catch (error: any) {
    console.error('❌ Error reading video blob:', error);
    return { success: false, error: error.message };
  }
});

// 동영상, QR 드라이브 업로드
ipcMain.handle('upload-video-and-qr', async (_event, filePath: string) => {
  try {
    console.log('🚀 Starting Google Drive upload for:', filePath);

    // 파일 존재 확인
    if (!await fsPromises.access(filePath).then(() => true).catch(() => false)) {
      console.error('❌ Upload failed: File not found:', filePath);
      return { success: false, error: 'File not found for upload' };
    }

    const stats = await fsPromises.stat(filePath);
    console.log(`📊 Upload file stats: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

    const folderName = getTodayFolder(); // 예: 20250612
    console.log('📁 Target Google Drive folder:', folderName);


    if (!DRIVE_FOLDER_ID_FROM_ENV) {
      throw new Error('KIOSK_FOLDER_ID is not defined in the environment variables. Cannot upload to Google Drive.');
    }

    const driveFolderId = DRIVE_FOLDER_ID_FROM_ENV; 
    const targetFolderId = await findOrCreateFolder(folderName, driveFolderId); 
    console.log('📁 Google Drive folder ID:', targetFolderId);

    // 1️⃣ 영상 업로드
    console.log('📤 Uploading video to Google Drive...');
    const videoMetadata = {
      name: path.basename(filePath),
      parents: [targetFolderId],
    };

    const videoMedia = {
      mimeType: 'video/mp4',
      body: fs.createReadStream(filePath),
    };

    const videoFile = await drive.files.create({
      requestBody: videoMetadata,
      media: videoMedia,
      fields: 'id',
    });

    const videoId = videoFile.data.id;
    console.log('✅ Video uploaded with ID:', videoId);

    await drive.permissions.create({
      fileId: videoId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    const videoUrl = `https://drive.google.com/file/d/${videoId}/view?usp=sharing`;
    console.log('🔗 Video share URL:', videoUrl);

    // 2️⃣ QR 코드 생성 및 저장
    console.log('🏷️ Generating QR code...');
    const parsed = path.parse(filePath);
    const qrPath = path.join(parsed.dir, `${parsed.name}_qr.png`);
    await QRCode.toFile(qrPath, videoUrl, {
      width: 400,           // QR 코드 크기 증가
      margin: 2,            // 여백 최적화
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'  // 중간 수준 오류 정정
    });
    console.log('✅ QR code generated:', qrPath);

    // 3️⃣ QR 이미지 업로드
    console.log('📤 Uploading QR code to Google Drive...');
    const qrMetadata = {
      name: path.basename(qrPath),
      parents: [targetFolderId],
    };

    const qrMedia = {
      mimeType: 'image/png',
      body: fs.createReadStream(qrPath),
    };

    const qrFile = await drive.files.create({
      requestBody: qrMetadata,
      media: qrMedia,
      fields: 'id',
    });

    const qrId = qrFile.data.id;
    console.log('✅ QR code uploaded with ID:', qrId);

    await drive.permissions.create({
      fileId: qrId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    const qrImageUrl = `https://drive.google.com/file/d/${qrId}/view?usp=sharing`;
    console.log('🔗 QR code share URL:', qrImageUrl);

    console.log('🎉 Google Drive upload completed successfully!');

    return {
      success: true,
      videoUrl,           // 동영상 공유 링크
      qrUrl: qrImageUrl, // QR 이미지 공유 링크
      qrPath,             // 로컬 QR 이미지 경로
      localVideoPath: filePath, // 로컬 동영상 경로
    };

  } catch (error: any) {
    console.error('❌ Google Drive 업로드 오류:', error);
    return { success: false, error: error.message };
  }
});

// 로컬 QR 이미지를 blob으로 읽어오는 핸들러
ipcMain.handle('get-qr-blob', async (_event, qrPath: string) => {
  try {
    console.log('🏷️ Reading QR blob from:', qrPath);

    // 파일 존재 확인
    if (!await fsPromises.access(qrPath, fsPromises.constants.F_OK).then(() => true).catch(() => false)) {
      console.error('❌ QR file not found:', qrPath);
      return { success: false, error: 'QR file not found' };
    }

    const buffer = await fsPromises.readFile(qrPath);
    console.log(`✅ QR blob read successfully: ${(buffer.length / 1024).toFixed(2)}KB`);

    return { success: true, data: Array.from(buffer) };
  } catch (error: any) {
    console.error('❌ Error reading QR blob:', error);
    return { success: false, error: error.message };
  }
});

// 로컬 영상 삭제
ipcMain.handle('clear-local-video', async (_event, localFilePath: string) => {
  console.log(`[DriveControl] 로컬 영상 삭제 요청 수신: ${localFilePath}`);
  try {
    await fsPromises.access(localFilePath, fsPromises.constants.F_OK);
    await fsPromises.unlink(localFilePath);
    console.log(`[DriveControl] 로컬 파일 삭제 완료: ${localFilePath}`);
    return { success: true };
  } catch (error: any) {
    console.warn(`[DriveControl] 로컬 파일 삭제 실패 (파일이 없거나 권한 문제): ${error.message}`);
    return { success: true, error: error.message };
  }
});

export function getTodayFolder(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function findOrCreateFolder(name: string, parentId: string): Promise<string> {
  const list = await drive.files.list({
    q: `'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
  });

  if (list.data.files && list.data.files.length > 0) {
    return list.data.files[0].id!;
  }

  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  return res.data.id!;
}