import { ipcMain } from 'electron';
import { connectToDevice, startCameraApp, startScreenRecordToPC, stopScreenRecord } from './adb-utils';

let isCameraConnected = false;
let isRecording = false;
let currentRecordingPath: string | null = null;

const DEVICE_IP = '192.168.219.102:37484';

// 카메라 연결 로직
ipcMain.on('camera-connect', async (event) => {
    console.log('[IPC] camera-connect request received');

    const connected = await connectToDevice(DEVICE_IP);
    if (!connected) {
        console.warn('[WARN] ADB connect failed');
        event.reply('camera-connect-reply', false);
        return;
    }

    console.log('[INFO] ADB connect succeed');

    try {
        await startCameraApp();
        isCameraConnected = true;
        event.reply('camera-connect-reply', true);
    } catch (error) {
        console.error('[ERROR] camera open failed:', error);
        event.reply('camera-connect-reply', false);
    }
});

// 카메라 녹화 시작 로직
ipcMain.on('camera-record-start', async (event) => {
    console.log('[IPC] camera-record-start request received');

    if (!isCameraConnected) {
        console.warn('[WARN] camera not connected');
        return;
    }

    if (isRecording) {
        console.warn('[WARN] already recording');
        return;
    }

    isRecording = true;
    currentRecordingPath = null;
    event.reply('camera-record-start-reply', 'started');

    const savedPath = await startScreenRecordToPC(15);

    // 녹화가 정상적으로 완료된 경우에만 상태 업데이트
    if (isRecording) {
        isRecording = false;
        
        if (savedPath) {
            console.log(`[IPC] Record and save done: ${savedPath}`);
            currentRecordingPath = savedPath;
            event.reply('camera-record-complete', { success: true, path: savedPath });
        } else {
            console.error(`[IPC] record failed`);
            event.reply('camera-record-complete', { success: false });
        }
    }
});

// 카메라 녹화 중지 로직
ipcMain.on('camera-record-stop', async (event) => {
    console.log('[IPC] camera-record-stop request received');

    if (!isRecording) {
        console.warn('[WARN] not recording');
        return;
    }

    isRecording = false;
    
    try {
        // 1. 진행 중인 녹화 중단
        await stopScreenRecord();
        console.log('[IPC] record stopped');

        // 2. 현재 녹화 경로가 있다면 삭제 (부분적으로 생성된 파일)
        if (currentRecordingPath) {
            const deleteResult = await deleteRecordedVideo(currentRecordingPath);
            if (deleteResult.success) {
                console.log(`[IPC] 부분 녹화 파일 삭제 완료: ${currentRecordingPath}`);
            }
        }

        // 3. 상태 초기화
        currentRecordingPath = null;
        
        // 4. React에 중지 완료 알림
        event.reply('camera-record-stop-reply', { success: true });
        
    } catch (error) {
        console.error('[IPC] error while stop recording:', error);
        event.reply('camera-record-stop-reply', { success: false, error: error.message });
    }
});

// 공통 영상 삭제 함수 (재사용 가능)
const deleteRecordedVideo = async (targetPath: string) => {
    const fs = require('fs');
    const path = require('path');
    
    try {
        if (!fs.existsSync(targetPath)) {
            return { success: true, deleted: 0, message: '파일이 존재하지 않습니다.' };
        }

        const stats = fs.statSync(targetPath);

        if (stats.isFile()) {
            fs.unlinkSync(targetPath);
            return { success: true, deleted: 1 };
        } else if (stats.isDirectory()) {
            const files = fs.readdirSync(targetPath).filter((f: string) => f.endsWith('.mp4'));
            let deletedCount = 0;
            for (const file of files) {
                try {
                    fs.unlinkSync(path.join(targetPath, file));
                    deletedCount++;
                } catch (err) {
                    console.warn(`failed to delete: ${file}`, err);
                }
            }
            return { success: true, deleted: deletedCount };
        } else {
            return { success: false, error: '삭제 대상이 파일이나 폴더가 아닙니다.' };
        }
    } catch (error: any) {
        console.error('video deleting failed:', error);
        return { success: false, error: error.message };
    }
};

// 기존 clear-videos 핸들러를 공통 함수 사용하도록 수정
ipcMain.handle('clear-videos', async (_event, targetPath: string) => {
    return await deleteRecordedVideo(targetPath);
});