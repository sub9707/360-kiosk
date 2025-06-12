// src/main/IPC/DriveControl.ts

import { ipcMain, app } from 'electron';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { google } from 'googleapis';
import QRCode from 'qrcode';
import { getResourcePath } from '../utils/path-utils';

// Google Drive 인증 설정
const KEYFILEPATH = path.resolve(__dirname, '../../credentials.json');
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: SCOPES,
});
const drive = google.drive({ version: 'v3', auth });

// PC에 영상 파일을 저장할 기본 디렉토리
const VIDEO_SAVE_BASE_DIR = 'F:\\videos\\original';

// 영상 구간 편집 [ffmpeg]
ipcMain.handle('edit-video', async (_event, inputPath: string) => {
  try {
    const parsed = path.parse(inputPath);
    const outputPath = path.join(parsed.dir, `edited_${parsed.name}.mp4`);
    const ffmpegPath = getResourcePath('ffmpeg/ffmpeg.exe', 'ffmpeg.exe'); 
    
    // intro, outro 영상 경로
    const introPath = path.resolve(app.getAppPath(), 'src/renderer/assets/videos/intro.mp4');
    const outroPath = path.resolve(app.getAppPath(), 'src/renderer/assets/videos/outro.mp4');

    // intro, outro 파일 존재 확인
    try {
        await fsPromises.access(introPath, fsPromises.constants.F_OK);
    } catch (e) {
        console.warn('⚠️ intro.mp4 not found:', introPath);
    }
    try {
        await fsPromises.access(outroPath, fsPromises.constants.F_OK);
    } catch (e) {
        console.warn('⚠️ outro.mp4 not found:', outroPath);
    }

    // intro + 편집된 메인 영상 + outro 구성
    const cmd = `"${ffmpegPath}" -i "${introPath}" -i "${inputPath}" -i "${outroPath}" -an -filter_complex `
      + `"[1:v]crop=1080:1920:0:210,trim=0:2,setpts=PTS-STARTPTS[v0]; `
      + `[1:v]crop=1080:1920:0:210,trim=2:6,setpts=(PTS-STARTPTS)/2[v1]; `
      + `[1:v]crop=1080:1920:0:210,trim=6:8,setpts=PTS-STARTPTS[v2]; `
      + `[1:v]crop=1080:1920:0:210,trim=8:12,setpts=(PTS-STARTPTS)/2[v3]; `
      + `[1:v]crop=1080:1920:0:210,trim=12:9999,setpts=PTS-STARTPTS[v4]; `
      + `[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0[main]; `
      + `[0:v][main][2:v]concat=n=3:v=1:a=0[outv]" `
      + `-map "[outv]" "${outputPath}"`;

    console.log('🎬 Starting video edit with intro/outro (audio removed):', outputPath);

    await new Promise<string>((resolve, reject) => {
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          console.error("❌ FFmpeg editing error:", stderr);
          reject(error);
        } else {
          console.log("✅ Video edit complete with intro/outro:", outputPath);
          resolve(outputPath);
        }
      });
    });

    return { success: true, path: outputPath };
  } catch (error: any) {
    console.error("❌ Video editing process error:", error);
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
    console.log(`📊 Video file stats: ${stats.size} bytes`);
    
    if (stats.size === 0) {
      console.error('❌ Video file is empty:', videoPath);
      return { success: false, error: 'Video file is empty' };
    }
    
    const buffer = await fsPromises.readFile(videoPath);
    console.log(`✅ Video blob read successfully: ${buffer.length} bytes`);
    
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
    console.log(`📊 Upload file stats: ${stats.size} bytes`);
    
    const folderName = getTodayFolder(); // 예: 20250612
    console.log('📁 Target Google Drive folder:', folderName);

    const kioskFolderId = '1bR2A-WxQkRD51lByA6r8ePt51cqF8O8B'; // 상위 kiosk 폴더 ID
    const targetFolderId = await findOrCreateFolder(folderName, kioskFolderId);
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
    await QRCode.toFile(qrPath, videoUrl, { width: 300 });
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
    
    if (!await fsPromises.access(qrPath, fsPromises.constants.F_OK).then(() => true).catch(() => false)) {
      console.error('❌ QR file not found:', qrPath);
      return { success: false, error: 'QR file not found' };
    }

    const buffer = await fsPromises.readFile(qrPath);
    console.log(`✅ QR blob read successfully: ${buffer.length} bytes`);
    
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