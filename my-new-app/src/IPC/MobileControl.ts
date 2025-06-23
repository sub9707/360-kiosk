// src/main/IPC/MobileControl.ts

import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import WebSocket from 'ws';
import { promises as fsPromises } from 'fs';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getTodayFolder } from './DriveControl';

// `BrowserWindow` 인스턴스를 저장할 변수
let _mainWindow: BrowserWindow | null = null;

let ws: WebSocket | null = null; // 웹소켓 클라이언트 인스턴스

let cameraConnected = false;
let manualReset = false;

// 🔧 연결 상태 관리 변수 강화
let lastConnectionStatus = false;
let connectionNotificationSent = false;
let connectionAttempts = 0;
let isReconnecting = false;
let connectionTimeout: NodeJS.Timeout | null = null;

// Android 웹소켓 서버 주소 (let으로 변경하여 동적 수정 가능)
let ANDROID_WS_URL = 'ws://192.168.219.102:8080';
// Android HTTP 파일 서버 주소  
let ANDROID_FILE_SERVER_URL = 'http://192.168.219.102:8081';

// PC에 영상 파일을 저장할 기본 디렉토리
const VIDEO_SAVE_BASE_DIR = 'F:\\videos\\original';

// 🐛 디버깅 로그 함수 (로그 레벨 추가)
function debugLog(message: string, level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' = 'DEBUG', data?: any) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : level === 'INFO' ? 'ℹ️' : '🐛';
    console.log(`${prefix} [${timestamp}] [MobileControl] ${message}`, data || '');
}

// 🔧 연결 상태 업데이트 함수 (강화된 중복 방지)
function updateConnectionStatus(isConnected: boolean, message: string) {
    // 상태가 실제로 변경된 경우에만 알림
    if (lastConnectionStatus !== isConnected || !connectionNotificationSent) {
        debugLog(`🔔 Connection status changed (attempt #${connectionAttempts}): ${isConnected} - ${message}`, 'INFO');
        _mainWindow?.webContents.send('camera-connect-reply', isConnected, message);
        lastConnectionStatus = isConnected;
        connectionNotificationSent = true;

        if (isConnected) {
            connectionAttempts = 0; // 성공하면 카운터 리셋
            cameraConnected = true;
        } else {
            cameraConnected = false;
        }
    } else {
        debugLog(`Connection status unchanged: ${isConnected} (no notification sent)`);
    }
}

// Android 앱으로 명령을 JSON 형식으로 전송합니다.
function sendMessageToAndroid(channel: string, payload: object = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        const message = { channel, payload };
        ws.send(JSON.stringify(message));
        debugLog(`Android로 메시지 전송: ${JSON.stringify(message)}`, 'INFO');
    } else {
        debugLog('웹소켓이 아직 연결되지 않았습니다.', 'WARN');
    }
}

// 디렉토리가 없으면 생성
async function ensureVideoSaveDir() {
    try {
        await fsPromises.mkdir(VIDEO_SAVE_BASE_DIR, { recursive: true });
        debugLog(`Video save base directory ensured: ${VIDEO_SAVE_BASE_DIR}`);
    } catch (error: any) {
        debugLog(`Failed to create video save base directory: ${error.message}`, 'ERROR');
        if (_mainWindow) {
            dialog.showErrorBox('Error', `Failed to create video save directory: ${VIDEO_SAVE_BASE_DIR}. Please check permissions.`);
        }
    }
}

// IPC 핸들러 등록
ipcMain.on('set-main-window', (event) => {
    _mainWindow = BrowserWindow.fromWebContents(event.sender);
    debugLog('Main window reference set from renderer.', 'INFO');
    ensureVideoSaveDir();
});

// 🔧 Android IP 변경 핸들러
ipcMain.on('change-android-ip', (event, newIP: string) => {
    debugLog(`📡 Android IP 변경 요청: ${newIP}`, 'INFO');
    // IP 주소 업데이트
    ANDROID_WS_URL = `ws://${newIP}:8080`;
    ANDROID_FILE_SERVER_URL = `http://${newIP}:8081`;
    debugLog(`📡 새로운 URL: WS=${ANDROID_WS_URL}, HTTP=${ANDROID_FILE_SERVER_URL}`);

    // 기존 웹소켓 연결이 있으면 종료
    cleanupWebSocket();

    // 연결 상태 리셋
    lastConnectionStatus = false;
    connectionNotificationSent = false;
    connectionAttempts = 0;
});

// 🔧 WebSocket 정리 함수
function cleanupWebSocket() {
    if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
    }

    if (ws) {
        ws.removeAllListeners();
        ws.close();
        ws = null;
    }

    isReconnecting = false;
}

// 🔍 Android 서버 상태 확인 핸들러
ipcMain.handle('check-android-server-status', async () => {
    debugLog('🔍 Android 서버 상태 확인 요청', 'INFO');
    try {
        const statusUrl = `${ANDROID_FILE_SERVER_URL}/status`;
        const response = await axios.get(statusUrl, { timeout: 5000 });

        if (response.status === 200) {
            // 파일 개수도 확인
            const listUrl = `${ANDROID_FILE_SERVER_URL}/list`;
            const listResponse = await axios.get(listUrl, { timeout: 5000 });
            const fileCount = listResponse.data?.files?.length || 0;

            return {
                success: true,
                status: 'Android 서버 정상 응답',
                fileCount: fileCount
            };
        } else {
            return {
                success: false,
                error: `HTTP Status ${response.status}`
            };
        }
    } catch (error: any) {
        debugLog(`Android 서버 상태 확인 실패: ${error.message}`, 'ERROR');
        return {
            success: false,
            error: error.message
        };
    }
});

debugLog('IPC Handlers registered (initial load).', 'INFO');

// 🔍 현재 연결 상태 확인 핸들러 (Film.tsx에서 호출)
ipcMain.handle('check-connection-status', async () => {
    debugLog('🔍 연결 상태 확인 요청', 'INFO');
    
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    const connectionInfo = {
        isConnected: isConnected,
        cameraConnected: cameraConnected,
        connectionAttempts: connectionAttempts,
        isReconnecting: isReconnecting,
        lastConnectionStatus: lastConnectionStatus
    };
    
    debugLog(`🔍 현재 연결 상태: ${JSON.stringify(connectionInfo)}`, 'INFO');
    
    return connectionInfo;
});

// --- 🚀 자동 카메라 연결 요청 핸들러 (프롬프트 제거) ---
ipcMain.on('camera-connect', async () => {
    debugLog('🚀 camera-connect 이벤트 수신 (자동 연결 시도)', 'INFO');

    manualReset = false;

    // 🔧 이미 연결 중인 경우 무시
    if (isReconnecting) {
        debugLog('Already reconnecting, ignoring connect request', 'WARN');
        return;
    }

    // 🔧 이미 연결된 경우 상태 확인만
    if (ws && ws.readyState === WebSocket.OPEN) {
        debugLog('✅ 이미 연결되어 있음 - 상태 확인만 수행', 'INFO');
        updateConnectionStatus(true, 'PC와 연결됨');
        return;
    }

    // 🔧 연결 상태 리셋
    connectionNotificationSent = false;
    connectionAttempts++;

    // 🚀 바로 연결 시도 (네트워크 테스트 생략으로 더 빠른 연결)
    debugLog('🚀 네트워크 테스트 생략하고 바로 연결 시도', 'INFO');
    connectToAndroidApp();
});

ipcMain.handle('reconnect-to-camera', async () => {
    console.log('[MobileControl] 🔄 재연결 요청 수신');
    if (ws && ws.readyState !== WebSocket.CLOSED) {
        console.log('[MobileControl] 기존 WebSocket 연결을 종료합니다.');
        ws.terminate(); // 기존 연결 강제 종료
    }
    ws = null; // 참조 제거

    await new Promise(resolve => setTimeout(resolve, 500));
    return connectToAndroidApp();
});

// Electron 렌더러로부터 명령 수신 및 Android 앱으로 전송
ipcMain.on('camera-record-start', (event) => {
    debugLog('녹화 시작 요청 수신', 'INFO');
    sendMessageToAndroid('startRecording', {});
});

ipcMain.on('camera-record-stop', () => {
    debugLog('녹화 중지 요청 수신', 'INFO');
    sendMessageToAndroid('stopRecording', {});
});

// Android에서 파일을 다운로드하여 PC에 저장하는 핸들러 (외부 호출용)
ipcMain.handle('copy-video-from-android', async (_event, androidFileName: string) => {
    debugLog(`외부에서 copy-video-from-android 호출됨: ${androidFileName}`, 'INFO');
    return await copyVideoFromAndroid(androidFileName);
});

// `clear-android-video` (안드로이드 파일 삭제 요청) 핸들러 추가
ipcMain.on('clear-android-video', async (event, androidFileName: string) => {
    debugLog(`Android 영상 삭제 요청 수신: ${androidFileName}`, 'INFO');
    sendMessageToAndroid('deleteFile', { fileName: androidFileName });
    return { success: true };
});

ipcMain.on('reset-connection-state', () => {
    debugLog('🔄 연결 상태 강제 리셋 요청', 'INFO');

    manualReset = true;

    // 모든 연결 관련 변수 초기화
    lastConnectionStatus = false;
    connectionNotificationSent = false;
    connectionAttempts = 0;
    isReconnecting = false;
    cameraConnected = false;

    // 기존 연결 정리
    cleanupWebSocket();

    setTimeout(() => {
        manualReset = false;
        debugLog('✅ 연결 상태 리셋 완료', 'INFO');
    }, 1000);
});

/**
 * 🚀 Android 앱의 웹소켓 서버에 자동 연결을 시도합니다. (프롬프트 없음)
 */
function connectToAndroidApp() {
    if (_mainWindow === null) {
        debugLog('_mainWindow가 아직 설정되지 않았습니다.', 'ERROR');
        return;
    }

    // 🔧 이미 연결된 경우 확인
    if (ws && ws.readyState === WebSocket.OPEN) {
        debugLog('웹소켓이 이미 연결되어 있습니다.', 'INFO');
        updateConnectionStatus(true, 'PC와 연결됨');
        return;
    }

    // 🔧 연결 시도 중인 경우
    if (ws && ws.readyState === WebSocket.CONNECTING) {
        debugLog('웹소켓 연결 시도 중...', 'WARN');
        return;
    }

    // 🔧 기존 WebSocket 정리
    cleanupWebSocket();

    debugLog(`🚀 웹소켓 서버 ${ANDROID_WS_URL}에 자동 연결 시도... (attempt #${connectionAttempts})`, 'INFO');
    isReconnecting = true;

    ws = new WebSocket(ANDROID_WS_URL);

    // 🔧 연결 타임아웃 설정 (단축)
    connectionTimeout = setTimeout(() => {
        debugLog('WebSocket connection timeout', 'ERROR');
        cleanupWebSocket();
        updateConnectionStatus(false, '연결 타임아웃');
    }, 5000); // 5초 타임아웃으로 단축

    ws.onopen = () => {
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }

        debugLog('✅ 웹소켓 자동 연결 성공!', 'INFO');
        isReconnecting = false;
        updateConnectionStatus(true, 'PC와 자동 연결되었습니다');

        // 🚀 연결 즉시 안정화
        connectionAttempts = 0; // 성공하면 카운터 리셋
        cameraConnected = true;

        // 🔧 연결 확인용 ping 전송 (선택사항)
        setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                sendMessageToAndroid('ping', { timestamp: Date.now() });
                debugLog('🏓 연결 확인용 ping 전송', 'INFO');
            }
        }, 500);
    };

    ws.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data as string);
            const eventName = message.eventName;
            const data = message.data;

            debugLog(`📨 Android로부터 메시지 수신: ${eventName}`);

            // 🔧 이벤트별 처리 최적화
            switch (eventName) {
                case 'video-saved':
                    if (data?.fileName) {
                        await handleVideoSaved(data.fileName);
                    } else {
                        debugLog(`video-saved 이벤트에 fileName이 없음`, 'WARN', data);
                    }
                    break;

                case 'camera-recording-status':
                    debugLog(`📹 Android 녹화 상태: ${data?.isRecording ? '시작' : '중지'}`);
                    _mainWindow?.webContents.send(eventName, data);
                    break;

                case 'pong':
                    debugLog(`🏓 Pong received from Android`); // 로그 줄이기
                    break;

                case 'camera-connect-reply':
                    if (data?.success === true) {
                        debugLog('✅ Android에서 자동 연결 승인됨', 'INFO');
                        updateConnectionStatus(true, 'PC와 자동 연결되었습니다');
                        connectionAttempts = 0;
                        isReconnecting = false;
                    } else {
                        debugLog(`❌ Android 연결 거부: ${data?.message || '이유 미지정'}`, 'ERROR');
                        updateConnectionStatus(false, `Android 연결 거부: ${data?.message || '이유 미지정'}`);
                    }
                    break;

                default:
                    debugLog(`기타 이벤트 전달: ${eventName}`);
                    _mainWindow?.webContents.send(eventName, data);
                    break;
            }

        } catch (error: any) {
            debugLog(`Android 메시지 파싱 오류: ${error.message}`, 'ERROR');
            _mainWindow?.webContents.send('camera-record-complete', {
                success: false,
                error: `Failed to parse Android message: ${error.message}`
            });
        }
    };

    ws.onclose = (event) => {
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
            connectionTimeout = null;
        }

        debugLog(`웹소켓 연결 종료: 코드 ${event.code}, 이유: ${event.reason || '명시되지 않음'}`, 'WARN');
        ws = null;
        isReconnecting = false;
        cameraConnected = false;

        let errorMessage = '연결이 끊어졌습니다';
        if (event.code === 1006) {
            errorMessage = 'Android 앱이 실행되지 않았거나 네트워크 오류';
        } else if (event.code === 1000) {
            errorMessage = '정상적으로 연결이 종료됨';
        }

        updateConnectionStatus(false, errorMessage);

        // 🔧 자동 재연결 조건 강화 (정상 종료가 아니고, 시도 횟수 제한, 수동 리셋이 아닌 경우에만)
        if (event.code !== 1000 && connectionAttempts < 2 && !manualReset) { // 최대 2회로 제한
            const retryDelay = 3000;
            debugLog(`${retryDelay / 1000}초 후 자동 재연결 시도... (${connectionAttempts + 1}/2)`, 'INFO');

            setTimeout(() => {
                if (!cameraConnected && !manualReset) {
                    debugLog('웹소켓 자동 재연결 시도...', 'INFO');
                    connectionNotificationSent = false;
                    connectionAttempts++; // ❗ 중요: 증가시켜야 함 (0으로 리셋하면 안됨)
                    connectToAndroidApp();
                }
            }, retryDelay);
        } else {
            debugLog('자동 재연결 조건 불충족 - 재연결 중단', 'INFO');
            if (connectionAttempts >= 2) {
                updateConnectionStatus(false, '재연결 실패 - 수동으로 재시도하세요');
            }
        }
    };

    ws.onerror = (error: any) => {
        debugLog(`웹소켓 오류: ${error.message}`, 'ERROR');
        cleanupWebSocket();
        updateConnectionStatus(false, `웹소켓 오류: ${error.message}`);
    };
}

// 🔧 비디오 저장 처리 함수 분리
async function handleVideoSaved(androidFileName: string) {
    debugLog(`🎬 Android 녹화 완료! 파일 자동 다운로드 시작: ${androidFileName}`, 'INFO');

    const downloadResult = await copyVideoFromAndroid(androidFileName);

    if (downloadResult.success) {
        debugLog(`✅ PC 저장 성공! 경로: ${downloadResult.localVideoPath}`, 'INFO');
        _mainWindow?.webContents.send('camera-record-complete', {
            success: true,
            path: downloadResult.localVideoPath,
            androidPath: androidFileName
        });

        // Android에 파일 삭제 요청
        debugLog(`🗑️ Android 원본 파일 자동 삭제 요청: ${androidFileName}`);
        sendMessageToAndroid('deleteFile', { fileName: androidFileName });
    } else {
        debugLog(`❌ 파일 다운로드 실패: ${downloadResult.error}`, 'ERROR');
        _mainWindow?.webContents.send('camera-record-complete', {
            success: false,
            error: downloadResult.error
        });
    }
}

/**
 * Android에서 파일을 다운로드하여 PC에 저장하는 내부 함수
 */
async function copyVideoFromAndroid(androidFileName: string) {
    try {
        debugLog(`📁 파일 다운로드 시작: ${androidFileName}`, 'INFO');

        const todayFolder = getTodayFolder();
        const todayDirPath = path.join(VIDEO_SAVE_BASE_DIR, todayFolder);
        debugLog(`📅 저장 폴더: ${todayDirPath}`);

        await fsPromises.mkdir(todayDirPath, { recursive: true });

        const localVideoPath = path.join(todayDirPath, androidFileName);
        const downloadUrl = `${ANDROID_FILE_SERVER_URL}/video/${androidFileName}`;

        debugLog(`📥 다운로드 URL: ${downloadUrl}`);

        const response = await axios({
            method: 'get',
            url: downloadUrl,
            responseType: 'stream',
            timeout: 60000,
            validateStatus: function (status) {
                return status >= 200 && status < 300;
            },
            onDownloadProgress: (progressEvent) => {
                if (progressEvent.total) {
                    const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    if (percent % 25 === 0) { // 25%마다만 로그
                        debugLog(`📥 다운로드 진행: ${percent}%`);
                    }
                }
            }
        });

        if (response.status !== 200) {
            throw new Error(`HTTP Status ${response.status}`);
        }

        const writer = fs.createWriteStream(localVideoPath);
        response.data.pipe(writer);

        await new Promise<void>((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const stats = await fsPromises.stat(localVideoPath);
        debugLog(`✅ 파일 다운로드 완료: ${localVideoPath} (${stats.size} bytes)`, 'INFO');

        return { success: true, localVideoPath };

    } catch (error: any) {
        debugLog(`파일 다운로드 실패: ${error.message}`, 'ERROR');
        return { success: false, error: `파일 다운로드 실패: ${error.message}` };
    }
}