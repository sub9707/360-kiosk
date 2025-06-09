import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { google } from 'googleapis';
import QRCode from 'qrcode';

// Google Drive 인증 설정
const KEYFILEPATH = path.resolve(__dirname, '../../credentials.json');
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: SCOPES,
});
const drive = google.drive({ version: 'v3', auth });

// 영상 구간 편집 [ffmpeg]
ipcMain.handle('edit-video', async (_event, inputPath: string) => {
  try {
    const parsed = path.parse(inputPath);
    const outputPath = path.join(parsed.dir, `edited_${parsed.name}.mp4`);
    const ffmpegPath = path.resolve(__dirname, '../../src/exe/ffmpeg/ffmpeg.exe');
    
    // intro, outro 영상 경로
    const introPath = path.resolve(__dirname, '../../src/renderer/assets/videos/intro.mp4');
    const outroPath = path.resolve(__dirname, '../../src/renderer/assets/videos/outro.mp4');

    // intro, outro 파일 존재 확인
    if (!fs.existsSync(introPath)) {
      console.warn('⚠️ intro.mp4 not found:', introPath);
    }
    if (!fs.existsSync(outroPath)) {
      console.warn('⚠️ outro.mp4 not found:', outroPath);
    }

    // intro + 편집된 메인 영상 + outro 구성
    // 메인 영상을 1080x1920으로 크롭하여 해상도 통일
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

    await new Promise((resolve, reject) => {
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

// 동영상, QR 드라이브 업로드
// DriveControl.ts의 upload-video-and-qr 핸들러 수정
ipcMain.handle('upload-video-and-qr', async (_event, filePath: string) => {
  try {
    const folderName = getTodayFolder(); // 예: 20250604

    const kioskFolderId = '1bR2A-WxQkRD51lByA6r8ePt51cqF8O8B'; // 상위 kiosk 폴더 ID
    const targetFolderId = await findOrCreateFolder(folderName, kioskFolderId);

    // 1️⃣ 영상 업로드
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

    await drive.permissions.create({
      fileId: videoId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    const videoUrl = `https://drive.google.com/file/d/${videoId}/view?usp=sharing`;

    // 2️⃣ QR 코드 생성 및 저장
    const parsed = path.parse(filePath);
    const qrPath = path.join(parsed.dir, `${parsed.name}_qr.png`);
    await QRCode.toFile(qrPath, videoUrl, { width: 300 });

    // 3️⃣ QR 이미지 업로드
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

    await drive.permissions.create({
      fileId: qrId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    const qrImageUrl = `https://drive.google.com/file/d/${qrId}/view?usp=sharing`;

    return {
      success: true,
      videoUrl,          // 동영상 공유 링크
      qrUrl: qrImageUrl, // QR 이미지 공유 링크 (수정됨)
      qrPath,            // 로컬 QR 이미지 경로
      localVideoPath: filePath, // 로컬 동영상 경로 추가
    };

  } catch (error: any) {
    console.error('❌ Google Drive 업로드 오류:', error);
    return { success: false, error: error.message };
  }
});

// QR 이미지를 blob으로 읽어오는 핸들러 추가
ipcMain.handle('get-qr-blob', async (_event, qrPath: string) => {
  try {
    if (!fs.existsSync(qrPath)) {
      return { success: false, error: 'QR file not found' };
    }

    const buffer = fs.readFileSync(qrPath);
    return { success: true, data: Array.from(buffer) };
  } catch (error) {
    console.error('❌ Error reading QR blob:', error);
    return { success: false, error: error.message };
  }
});


function getTodayFolder(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}


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
        console.warn(`⚠️ Error reading folder ${folderPath}:`, error);
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
    console.error('❌ Error finding latest video:', error);
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
    console.error('❌ Error reading video blob:', error);
    return { success: false, error: error.message };
  }
});

// 📁 구글 드라이브에 폴더가 없으면 생성
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

