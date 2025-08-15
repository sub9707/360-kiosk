import { ipcMain, app, shell } from 'electron';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';
import QRCode from 'qrcode';
import { getAppResourcePath, getExecutablePath, getVideoAssetPaths } from '../utils/path-utils';
import http from 'http';
import url from 'url';

// OAuth 2.0 인증 설정
// credentials.json은 앱 리소스에서 가져옴
const CREDENTIALS_PATH = getAppResourcePath('oauth2_credentials.json', 'oauth2_credentials.json');

// token.json은 사용자 데이터 디렉토리에 저장
const TOKEN_PATH = path.join(app.getPath('userData'), 'google_drive_token.json');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Google Drive 인스턴스
let drive: drive_v3.Drive | null = null;
let authClient: any = null;

// PC에 영상 파일을 저장할 기본 디렉토리
const VIDEO_SAVE_BASE_DIR = process.env.BASE_DIRECTORY;

// Google Drive 폴더 ID
const DRIVE_FOLDER_ID_FROM_ENV = process.env.DRIVE_FOLDER_ID;

/**
 * OAuth2Client 인스턴스 생성
 */
async function createOAuth2Client(): Promise<any> {
  try {
    console.log('🔧 [DriveControl] OAuth 클라이언트 설정 파일 읽기:', CREDENTIALS_PATH);

    const content = await fsPromises.readFile(CREDENTIALS_PATH, 'utf-8');
    const credentials = JSON.parse(content);

    console.log('📋 [DriveControl] 인증서 타입 확인:', {
      hasInstalled: !!credentials.installed,
      hasWeb: !!credentials.web
    });

    // web 타입을 우선 사용 (localhost 리다이렉션을 위해)
    const clientInfo = credentials.web || credentials.installed;

    if (!clientInfo) {
      throw new Error('OAuth 클라이언트 정보를 찾을 수 없습니다. credentials 파일을 확인해주세요.');
    }

    const { client_secret, client_id, redirect_uris } = clientInfo;

    if (!client_id || !client_secret) {
      throw new Error('client_id 또는 client_secret이 없습니다.');
    }

    // redirect_uri 설정
    let redirectUri = 'http://localhost:3000';

    if (redirect_uris && redirect_uris.length > 0) {
      // localhost:3000이 있는지 확인
      const localhostUri = redirect_uris.find((uri: string) =>
        uri.includes('localhost:3000') || uri.includes('127.0.0.1:3000')
      );

      if (localhostUri) {
        redirectUri = localhostUri;
      } else {
        redirectUri = redirect_uris[0];
      }
    }

    console.log('[DriveControl] 사용할 Redirect URI:', redirectUri);

    // Google OAuth2 클라이언트 생성
    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirectUri
    );

    console.log('[DriveControl] OAuth2 클라이언트 생성 완료');
    return oAuth2Client;

  } catch (error: any) {
    console.error('[DriveControl] OAuth 클라이언트 생성 실패:', error);

    if (error.code === 'ENOENT') {
      throw new Error(`OAuth 설정 파일을 찾을 수 없습니다: ${CREDENTIALS_PATH}\n프로그램을 다시 설치하거나 파일 경로를 확인해주세요.`);
    } else if (error instanceof SyntaxError) {
      throw new Error(`OAuth 설정 파일이 올바른 JSON 형식이 아닙니다: ${CREDENTIALS_PATH}\nGoogle Cloud Console에서 새로운 인증서를 다운로드해주세요.`);
    }

    throw new Error(`OAuth 클라이언트 설정 실패: ${error.message}`);
  }
}

/**
 * 저장된 토큰 파일을 읽어옵니다.
 */
async function loadSavedCredentialsIfExist(): Promise<any> {
  try {
    // 토큰 파일이 존재하는지 확인
    await fsPromises.access(TOKEN_PATH);

    const tokenContent = await fsPromises.readFile(TOKEN_PATH, 'utf-8');
    const token = JSON.parse(tokenContent);

    const oAuth2Client = await createOAuth2Client();
    oAuth2Client.setCredentials(token);

    console.log('[DriveControl] 토큰 파일 위치:', TOKEN_PATH);

    // 토큰이 만료되었는지 확인하고 필요시 갱신
    if (token.expiry_date && token.expiry_date < Date.now()) {
      console.log('[DriveControl] 토큰 만료됨, 갱신 시도...');
      if (token.refresh_token) {
        try {
          const { credentials } = await oAuth2Client.refreshAccessToken();
          oAuth2Client.setCredentials(credentials);
          await saveCredentials(oAuth2Client);
          console.log('[DriveControl] 토큰 갱신 완료');
        } catch (refreshError) {
          console.error('[DriveControl] 토큰 갱신 실패:', refreshError);
          return null;
        }
      }
    }

    return oAuth2Client;
  } catch (err) {
    console.log('[DriveControl] 저장된 토큰이 없습니다. 위치:', TOKEN_PATH);
    return null;
  }
}

/**
 * 인증된 credentials를 토큰 파일로 저장합니다.
 */
async function saveCredentials(client: any) {
  const tokens = client.credentials;

  // 사용자 데이터 디렉토리가 없으면 생성
  const userDataDir = path.dirname(TOKEN_PATH);
  await fsPromises.mkdir(userDataDir, { recursive: true });

  await fsPromises.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('[DriveControl] 토큰 저장 완료:', TOKEN_PATH);
}

/**
 * 브라우저를 통한 OAuth 인증을 수행합니다.
 */
async function authenticateWithBrowser(): Promise<any> {
  const oAuth2Client = await createOAuth2Client();

  return new Promise((resolve, reject) => {
    let serverClosed = false;

    const server = http.createServer(async (req, res) => {
      try {
        console.log('[DriveControl] 요청 수신:', req.url);

        const queryUrl = url.parse(req.url!, true);
        console.log('[DriveControl] 파싱된 쿼리:', queryUrl.query);

        // 루트 경로 또는 빈 경로에서 처리
        if (queryUrl.pathname === '/' || queryUrl.pathname === '') {
          const code = queryUrl.query.code as string;
          const error = queryUrl.query.error as string;

          if (error) {
            console.error('❌ [DriveControl] OAuth 에러:', error);
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <html>
                <head>
                  <title>인증 실패</title>
                  <meta charset="utf-8">
                </head>
                <body>
                  <h1>❌ 인증 실패</h1>
                  <p>OAuth 인증 중 오류가 발생했습니다: ${error}</p>
                  <p>창을 닫고 다시 시도해주세요.</p>
                </body>
              </html>
            `);

            if (!serverClosed) {
              serverClosed = true;
              server.close();
              reject(new Error(`OAuth 인증 실패: ${error}`));
            }
            return;
          }

          if (code) {
            console.log('[DriveControl] 인증 코드 수신:', code.substring(0, 10) + '...');

            // 성공 페이지 먼저 응답
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
  <html>
    <head>
      <title>인증 완료</title>
      <meta charset="utf-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 15px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          text-align: center;
          max-width: 400px;
        }
        h1 { 
          color: #4CAF50; 
          margin-bottom: 20px;
          font-size: 28px;
        }
        p { 
          color: #666; 
          line-height: 1.6;
          font-size: 16px;
        }
        .spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #4CAF50;
          border-radius: 50%;
          width: 30px;
          height: 30px;
          animation: spin 1s linear infinite;
          margin: 20px auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .auto-close {
          color: #999;
          font-size: 14px;
          margin-top: 20px;
        }
      </style>
      <script>
        let countdown = 5;
        let countdownInterval;
        
        function updateCountdown() {
          const element = document.getElementById('countdown');
          if (element && countdown >= 0) {
            element.textContent = countdown;
            countdown--;
          }
          
          // 카운트다운이 0 미만이 되면 인터벌 정리하고 창 닫기
          if (countdown < 0) {
            if (countdownInterval) {
              clearInterval(countdownInterval);
            }
            window.close();
          }
        }
        
        // 페이지 로드 후 카운트다운 시작
        window.addEventListener('DOMContentLoaded', () => {
          // 초기 표시
          updateCountdown();
          
          // 1초마다 업데이트
          countdownInterval = setInterval(updateCountdown, 1000);
        });
        
        // 백업: 5초 후 강제로 창 닫기
        setTimeout(() => {
          if (countdownInterval) {
            clearInterval(countdownInterval);
          }
          window.close();
        }, 5000);
      </script>
    </head>
    <body>
      <div class="container">
        <h1>✅ 인증 완료!</h1>
        <div class="spinner"></div>
        <p>Google Drive 연결이 성공적으로 완료되었습니다.</p>
        <p>앱으로 돌아가서 작업을 계속하세요.</p>
        <p class="auto-close">
          <span id="countdown">5</span>초 후 자동으로 닫힙니다...
        </p>
      </div>
    </body>
  </html>
`);

            // 서버 닫기 (중복 방지)
            if (!serverClosed) {
              serverClosed = true;

              // 잠시 대기 후 서버 닫기 (응답이 완전히 전송되도록)
              setTimeout(() => {
                server.close();
              }, 100);
            }

            // 토큰 교환 비동기 처리
            setTimeout(async () => {
              try {
                console.log('🔄 [DriveControl] 토큰 교환 시작...');
                const { tokens } = await oAuth2Client.getToken(code);
                console.log('✅ [DriveControl] 토큰 교환 성공');

                oAuth2Client.setCredentials(tokens);

                // 토큰 저장
                await saveCredentials(oAuth2Client);
                console.log('💾 [DriveControl] 토큰 저장 완료');

                resolve(oAuth2Client);
              } catch (tokenError) {
                console.error('❌ [DriveControl] 토큰 교환 실패:', tokenError);
                reject(new Error(`토큰 교환 실패: ${tokenError.message} `));
              }
            }, 200);

          } else {
            console.warn('⚠️ [DriveControl] 인증 코드가 없음');
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              < html >
              <head>
              <title>인증 실패 </title>
                < meta charset = "utf-8" >
                  </head>
                  < body >
                  <h1>❌ 인증 실패 </h1>
                    < p > 인증 코드를 받지 못했습니다.</>
                      < p > 창을 닫고 다시 시도해주세요.</>
                        </body>
                        </html>
                          `);

            if (!serverClosed) {
              serverClosed = true;
              server.close();
              reject(new Error('인증 코드를 받지 못했습니다.'));
            }
          }
        } else {
          // 다른 경로 요청 처리
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>404 - Page Not Found</h1>');
        }
      } catch (error) {
        console.error('❌ [DriveControl] 서버 에러:', error);

        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>500 - Internal Server Error</h1>');

        if (!serverClosed) {
          serverClosed = true;
          server.close();
          reject(error);
        }
      }
    });

    // 서버 에러 처리
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌[DriveControl] 포트 3000이 이미 사용 중입니다.`);
        reject(new Error('포트 3000이 이미 사용 중입니다. 다른 프로그램을 종료하거나 잠시 후 다시 시도해주세요.'));
      } else {
        console.error('❌ [DriveControl] 서버 에러:', error);
        reject(error);
      }
    });

    // 랜덤 포트 대신 3000 포트 고정 사용
    const PORT = 3000;

    server.listen(PORT, () => {
      console.log(`[DriveControl] OAuth 서버 시작: http://localhost:${PORT}`);

      // OAuth URL 생성
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        include_granted_scopes: true, // 추가 권한 포함
      });

      console.log('[DriveControl] 인증 URL 생성 완료');
      console.log('[DriveControl] 브라우저에서 인증을 진행해주세요...');

      // 브라우저에서 인증 URL 열기
      shell.openExternal(authUrl).catch(browserError => {
        console.error('[DriveControl] 브라우저 열기 실패:', browserError);
        console.log('[DriveControl] 수동으로 다음 URL을 브라우저에서 열어주세요:');
        console.log(authUrl);
      });
    });

    // 타임아웃 설정 (10분으로 증가)
    const timeout = setTimeout(() => {
      if (!serverClosed) {
        serverClosed = true;
        console.log('[DriveControl] OAuth 인증 타임아웃 (10분)');
        server.close();
        reject(new Error('OAuth 인증 시간 초과 (10분). 다시 시도해주세요.'));
      }
    }, 10 * 60 * 1000);

    // Promise가 resolve/reject될 때 타임아웃 클리어
    const originalResolve = resolve;
    const originalReject = reject;

    resolve = (value: any) => {
      clearTimeout(timeout);
      originalResolve(value);
    };

    reject = (reason: any) => {
      clearTimeout(timeout);
      originalReject(reason);
    };
  });
}

/**
 * OAuth 2.0 인증을 수행합니다.
 */
async function authorize(): Promise<any> {
  let client = await loadSavedCredentialsIfExist();

  if (client) {
    console.log('[DriveControl] 저장된 토큰으로 인증 성공');
    return client;
  }

  console.log('[DriveControl] 새로운 OAuth 인증 시작...');

  // 브라우저를 통한 인증 수행
  client = await authenticateWithBrowser();

  console.log('[DriveControl] OAuth 인증 완료');

  return client;
}

/**
 * Google Drive API를 초기화합니다.
 */
async function initializeDrive() {
  if (!drive || !authClient) {
    try {
      authClient = await authorize();
      drive = google.drive({ version: 'v3', auth: authClient });
      console.log('[DriveControl] Google Drive API 초기화 완료');
    } catch (error) {
      console.error('[DriveControl] Google Drive API 초기화 실패:', error);
      throw error;
    }
  }
  return drive;
}

// OAuth 재인증 핸들러 (UI에서 호출 가능)
ipcMain.handle('reauthorize-drive', async () => {
  try {
    console.log('[DriveControl] OAuth 재인증 시작...');

    // 기존 토큰 삭제
    try {
      await fsPromises.unlink(TOKEN_PATH);
      console.log('[DriveControl] 기존 토큰 삭제 완료');
    } catch (err) {
      console.log('[DriveControl] 기존 토큰이 없음');
    }

    // Drive 인스턴스 초기화
    drive = null;
    authClient = null;

    // 재인증
    await initializeDrive();

    return { success: true, message: 'OAuth 재인증 완료' };
  } catch (error: any) {
    console.error('❌ [DriveControl] OAuth 재인증 실패:', error);
    return { success: false, error: error.message };
  }
});

// 인증 상태 확인 핸들러
ipcMain.handle('check-drive-auth', async () => {
  try {
    const client = await loadSavedCredentialsIfExist();
    if (client) {
      // 토큰 유효성 검사를 위한 간단한 API 호출
      const driveInstance = google.drive({ version: 'v3', auth: client });
      await driveInstance.about.get({ fields: 'user' });
      return { authenticated: true };
    }
    return { authenticated: false };
  } catch (error) {
    console.error('[DriveControl] 인증 상태 확인 실패:', error);
    return { authenticated: false };
  }
});

ipcMain.handle('edit-video', async (_event, inputPath: string) => {
  try {
    const startTime = Date.now();
    console.log('[DriveControl] 영상 편집 시작:', inputPath);

    // Drive 초기화 (필요한 경우)
    await initializeDrive();

    // Kiosk 폴더 ID 유효성 검사
    if (!DRIVE_FOLDER_ID_FROM_ENV) {
      console.warn('DRIVE_FOLDER_ID is not defined. Will use root folder.');
    }

    const parsed = path.parse(inputPath);
    const outputPath = path.join(parsed.dir, `edited_${parsed.name}.mp4`);

    // FFmpeg 경로 가져오기 및 확인
    console.log('[DriveControl] FFmpeg 경로 확인 중...');
    const ffmpegPath = getExecutablePath('src/exe/ffmpeg/ffmpeg.exe', 'ffmpeg.exe');

    // FFmpeg 파일 존재 여부 확인
    if (!fs.existsSync(ffmpegPath)) {
      console.error('[DriveControl] FFmpeg 실행 파일을 찾을 수 없습니다:', ffmpegPath);
      throw new Error(`FFmpeg 실행 파일을 찾을 수 없습니다: ${ffmpegPath}. 프로그램을 다시 설치해주세요.`);
    }

    console.log('[DriveControl] 출력 경로:', outputPath);
    console.log('[DriveControl] FFmpeg 경로 확인됨:', ffmpegPath);

    const tempMainPath = path.join(parsed.dir, `temp_main_${parsed.name}.mp4`);

    // 배속 편집
    const mainEditCmd = `"${ffmpegPath}" -i "${inputPath}" -filter_complex ` +
      `"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[scaled]; ` +
      // 원본에서 직접 각 구간을 추출하여 배속 적용 (2.5초부터 시작)
      `[scaled]trim=start=2.5:end=6.5,setpts=PTS-STARTPTS,setpts=2.0*PTS[v0]; ` + // 2.5~6.5초(4초분량)를 0.5배속 -> 8초
      `[scaled]trim=start=6.5:end=8.5,setpts=PTS-STARTPTS[v1]; ` +                // 6.5~8.5초(2초분량)를 1배속 -> 2초
      `[scaled]trim=start=8.5:end=12.5,setpts=PTS-STARTPTS,setpts=2.0*PTS[v2]; ` + // 8.5~12.5초(4초분량)를 0.5배속 -> 8초
      `[scaled]trim=start=12.5:end=17.5,setpts=PTS-STARTPTS[v3]; ` +              // 12.5~17.5초(5초분량)를 1배속 -> 5초
      // 단순 연결
      `[v0][v1][v2][v3]concat=n=4:v=1:a=0[outv]" ` +
      `-map "[outv]" -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p ` +
      `-profile:v high -level 4.1 -tune film -an ` +
      `-threads 0 -g 30 -bf 2 -refs 3 ` +
      `-bufsize 4M -maxrate 8M "${tempMainPath}"`;

    console.log('[DriveControl] 고화질 배속 편집 명령어 실행');

    await new Promise<void>((resolve, reject) => {
      exec(mainEditCmd, {
        maxBuffer: 1024 * 1024 * 50, // 50MB 버퍼 (화질 향상)
        timeout: 180000 // 3분 타임아웃 (고화질 처리)
      }, (error, stdout, stderr) => {
        if (error) {
          console.error("[DriveControl] 배속 편집 오류:", error.message);
          console.error("[DriveControl] FFmpeg stderr:", stderr);
          console.error("[DriveControl] FFmpeg stdout:", stdout);
          reject(new Error(`배속 편집 실패: ${error.message}`));
        } else {
          console.log("[DriveControl] 배속 편집 완료");
          if (stdout) console.log("[DriveControl] FFmpeg stdout:", stdout);
          resolve();
        }
      });
    });

    // intro + main + outro + BGM 합성 (고화질 버전)
    console.log('[DriveControl] 에셋 파일 경로 확인 중...');
    const assetPaths = getVideoAssetPaths();
    const introPath = assetPaths.intro;
    const outroPath = assetPaths.outro;
    const bgmPath = assetPaths.bgm;

    console.log('[DriveControl] assets directory:');
    console.log('   - Intro:', introPath);
    console.log('   - Outro:', outroPath);
    console.log('   - BGM:', bgmPath);

    // 에셋 파일들 존재 여부 확인
    const assetFiles = [
      { name: 'Intro', path: introPath },
      { name: 'Outro', path: outroPath },
      { name: 'BGM', path: bgmPath }
    ];

    for (const asset of assetFiles) {
      if (!fs.existsSync(asset.path)) {
        console.error(`[DriveControl] ${asset.name} 파일을 찾을 수 없습니다: ${asset.path}`);
        throw new Error(`${asset.name} 파일을 찾을 수 없습니다: ${asset.path}. 프로그램을 다시 설치해주세요.`);
      } else {
        console.log(`[DriveControl] ${asset.name} 파일 확인됨: ${asset.path}`);
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

    console.log('[DriveControl] 고화질 최종 합성 명령어 실행');

    await new Promise<void>((resolve, reject) => {
      exec(finalCmd, {
        maxBuffer: 1024 * 1024 * 80, // 80MB 버퍼 (고화질 처리)
        timeout: 300000 // 5분 타임아웃 (고화질 처리를 위해 증가)
      }, (error, stdout, stderr) => {
        if (error) {
          console.error("[DriveControl] 최종 편집 오류:", error.message);
          console.error("[DriveControl] FFmpeg stderr:", stderr);
          console.error("[DriveControl] FFmpeg stdout:", stdout);
          reject(new Error(`최종 편집 실패: ${error.message}`));
        } else {
          console.log("[DriveControl] 최종 편집 완료");
          if (stdout) console.log("[DriveControl] FFmpeg stdout:", stdout);
          resolve();
        }
      });
    });

    // 임시 파일 정리
    await fsPromises.unlink(tempMainPath).catch((cleanupError) => {
      console.warn('[DriveControl] 임시 파일 삭제 실패:', cleanupError);
    });

    // 출력 파일 확인
    const stats = await fsPromises.stat(outputPath);
    if (stats.size === 0) {
      throw new Error('편집된 파일이 비어있습니다');
    }

    const endTime = Date.now(); // 편집 종료 시간 기록
    const totalDuration = ((endTime - startTime) / 1000).toFixed(2); // 초 단위로 변환
    console.log(`[DriveControl] 총 편집 소요 시간: ${totalDuration} 초`);

    console.log(`[DriveControl] 고화질 편집 완료: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
    return { success: true, path: outputPath };

  } catch (error: any) {
    console.error("[DriveControl] 영상 편집 프로세스 오류:", error);
    return { success: false, error: error.message };
  }
});

// 가장 최신 비디오 파일 찾기 핸들러
ipcMain.handle('find-latest-video', async () => {
  try {
    console.log('Finding latest video in:', VIDEO_SAVE_BASE_DIR);

    const todayFolder = getTodayFolder();
    const todayDir = path.join(VIDEO_SAVE_BASE_DIR, todayFolder);

    console.log('Checking today folder:', todayDir);

    // 오늘 폴더가 존재하는지 확인
    if (!await fsPromises.access(todayDir).then(() => true).catch(() => false)) {
      console.warn('Today folder does not exist:', todayDir);
      return { success: false, error: 'No videos found for today' };
    }

    const files = await fsPromises.readdir(todayDir);
    console.log('Files in today folder:', files);

    // edited_ 파일 우선, 그 다음 일반 mp4 파일
    const editedFiles = files.filter(f => f.startsWith('edited_') && f.endsWith('.mp4'));
    const originalFiles = files.filter(f => !f.startsWith('edited_') && f.endsWith('.mp4') && f !== 'intro.mp4' && f !== 'outro.mp4');

    console.log('Edited files:', editedFiles);
    console.log('Original files:', originalFiles);

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
      console.warn('No video files found');
      return { success: false, error: 'No video files found' };
    }

    const targetPath = path.join(todayDir, targetFile);
    console.log(`Latest video found: ${targetPath} (type: ${type})`);

    // 파일이 실제로 존재하는지 확인
    const exists = await fsPromises.access(targetPath).then(() => true).catch(() => false);
    if (!exists) {
      console.error('File does not exist:', targetPath);
      return { success: false, error: 'File not found' };
    }

    return { success: true, path: targetPath, type };

  } catch (error: any) {
    console.error('Error finding latest video:', error);
    return { success: false, error: error.message };
  }
});

// 비디오 파일을 blob으로 읽어오는 핸들러
ipcMain.handle('get-video-blob', async (_event, videoPath: string) => {
  try {
    console.log('Reading video blob from:', videoPath);

    // 파일 존재 확인
    if (!await fsPromises.access(videoPath).then(() => true).catch(() => false)) {
      console.error('Video file not found:', videoPath);
      return { success: false, error: 'Video file not found' };
    }

    const stats = await fsPromises.stat(videoPath);
    console.log(`Video file stats: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

    if (stats.size === 0) {
      console.error('Video file is empty:', videoPath);
      return { success: false, error: 'Video file is empty' };
    }

    const buffer = await fsPromises.readFile(videoPath);
    console.log(`Video blob read successfully: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);

    return { success: true, data: Array.from(buffer) };

  } catch (error: any) {
    console.error('Error reading video blob:', error);
    return { success: false, error: error.message };
  }
});

// 동영상, QR 드라이브 업로드
ipcMain.handle('upload-video-and-qr', async (_event, filePath: string) => {
  try {
    console.log('Starting Google Drive upload for:', filePath);

    // Drive 초기화
    await initializeDrive();

    // 파일 존재 확인
    if (!await fsPromises.access(filePath).then(() => true).catch(() => false)) {
      console.error('Upload failed: File not found:', filePath);
      return { success: false, error: 'File not found for upload' };
    }

    const stats = await fsPromises.stat(filePath);
    console.log(`Upload file stats: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

    const folderName = getTodayFolder(); // 예: 20250612
    console.log('Target Google Drive folder:', folderName);

    if (!DRIVE_FOLDER_ID_FROM_ENV) {
      // 폴더 ID가 없으면 루트에 생성
      console.warn('DRIVE_FOLDER_ID not set, will create folder in root');
    }

    const targetFolderId = await findOrCreateFolder(folderName, DRIVE_FOLDER_ID_FROM_ENV || 'root');
    console.log('Google Drive folder ID:', targetFolderId);

    // 영상 업로드
    console.log('Uploading video to Google Drive...');
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
    console.log('Video share URL:', videoUrl);

    // QR 코드 생성 및 저장
    console.log('Generating QR code...');
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
    console.log('QR code generated:', qrPath);

    // QR 이미지 업로드
    console.log('Uploading QR code to Google Drive...');
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
    console.log('QR code uploaded with ID:', qrId);

    await drive.permissions.create({
      fileId: qrId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    const qrImageUrl = `https://drive.google.com/file/d/${qrId}/view?usp=sharing`;
    console.log('QR code share URL:', qrImageUrl);

    console.log('Google Drive upload completed successfully!');

    return {
      success: true,
      videoUrl,           // 동영상 공유 링크
      qrUrl: qrImageUrl, // QR 이미지 공유 링크
      qrPath,             // 로컬 QR 이미지 경로
      localVideoPath: filePath, // 로컬 동영상 경로
    };

  } catch (error: any) {
    console.error('Google Drive 업로드 오류:', error);

    // OAuth 토큰 만료 에러 처리
    if (error.code === 401 || error.message?.includes('invalid_grant')) {
      console.log('[DriveControl] 토큰 만료 감지, 재인증 필요');
      return {
        success: false,
        error: 'OAuth 토큰이 만료되었습니다. 재인증이 필요합니다.',
        requiresReauth: true
      };
    }

    return { success: false, error: error.message };
  }
});

// 로컬 QR 이미지를 blob으로 읽어오는 핸들러
ipcMain.handle('get-qr-blob', async (_event, qrPath: string) => {
  try {
    console.log('Reading QR blob from:', qrPath);

    // 파일 존재 확인
    if (!await fsPromises.access(qrPath, fsPromises.constants.F_OK).then(() => true).catch(() => false)) {
      console.error('QR file not found:', qrPath);
      return { success: false, error: 'QR file not found' };
    }

    const buffer = await fsPromises.readFile(qrPath);
    console.log(`QR blob read successfully: ${(buffer.length / 1024).toFixed(2)}KB`);

    return { success: true, data: Array.from(buffer) };
  } catch (error: any) {
    console.error('Error reading QR blob:', error);
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
  await initializeDrive();

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