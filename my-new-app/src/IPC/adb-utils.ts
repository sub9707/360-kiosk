import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

const ADB_PATH = `F:\\dev\\platform-tools\\adb.exe`;
const TEMP_DEVICE_PATH = '/sdcard/temp_record.mp4';

let currentRecordingProcess: any = null;

export const connectToDevice = (ip: string): Promise<boolean> => {
    return new Promise((resolve) => {
        const command = `${ADB_PATH} connect ${ip}`;

        exec(command, (err, stdout, stderr) => {
            if (err) {
                console.error('[ADB] 오류 발생:', err);
                console.error('[ADB] stderr:', stderr);
                return resolve(false);
            }

            console.log('[ADB] stdout:', stdout.trim());
            const isConnected = stdout.includes('connected') || stdout.includes('already connected');
            resolve(isConnected);
        });
    });
};

export const startCameraApp = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        const command = `${ADB_PATH} shell monkey -p com.sec.android.app.camera -c android.intent.category.LAUNCHER 1`;
        console.log('[ADB] run command:', command);
        exec(command, (err, stdout, stderr) => {
            if (err) {
                console.error('[ADB] startCameraApp error:', err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

// PC로 바로 저장되는 화면 녹화 함수
export const startScreenRecordToPC = async (durationSec = 10): Promise<string | null> => {
    const now = new Date();
    const dateDir = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const filename = `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}.mp4`;

    const localDir = path.join('F:/videos/original', dateDir);
    const localPath = path.join(localDir, filename);

    if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
    }

    console.log(`[ADB] 화면 녹화 시작 (${durationSec}초)...`);

    // 1. 기존 임시 파일 정리
    await deleteDeviceFile(TEMP_DEVICE_PATH);

    // 2. 녹화 시작
    return new Promise((resolve) => {
        const recordCommand = `${ADB_PATH} shell screenrecord --time-limit ${durationSec} ${TEMP_DEVICE_PATH}`;
        
        currentRecordingProcess = exec(recordCommand, async (err) => {
            currentRecordingProcess = null;
            
            if (err) {
                console.error('[ADB] 녹화 실패:', err);
                return resolve(null);
            }

            console.log(`[ADB] 녹화 완료, 파일 복사중: ${localPath}`);

            // 3. PC로 pull
            exec(`${ADB_PATH} pull ${TEMP_DEVICE_PATH} "${localPath}"`, async (pullErr) => {
                if (pullErr) {
                    console.error('[ADB] pull 실패:', pullErr);
                    await deleteDeviceFile(TEMP_DEVICE_PATH);
                    return resolve(null);
                }

                // 4. 기기 파일 삭제
                await deleteDeviceFile(TEMP_DEVICE_PATH);
                console.log('[ADB] 임시 파일 삭제 완료');
                resolve(localPath);
            });
        });
    });
};

// 녹화 중지 함수
export const stopScreenRecord = (): Promise<void> => {
    return new Promise((resolve) => {
        if (currentRecordingProcess) {
            console.log('[ADB] 진행 중인 녹화 프로세스 종료');
            currentRecordingProcess.kill('SIGTERM');
            currentRecordingProcess = null;
        }

        // screenrecord 프로세스를 강제 종료
        const killCommand = `${ADB_PATH} shell "pkill -f screenrecord"`;
        exec(killCommand, (err) => {
            if (err) {
                console.warn('[ADB] screenrecord 프로세스 종료 실패 (이미 종료됨일 수 있음):', err.message);
            } else {
                console.log('[ADB] screenrecord 프로세스 종료 완료');
            }
            resolve();
        });
    });
};

// 기기의 파일 삭제 함수
export const deleteDeviceFile = (devicePath: string): Promise<boolean> => {
    return new Promise((resolve) => {
        const deleteCommand = `${ADB_PATH} shell rm "${devicePath}"`;
        exec(deleteCommand, (err) => {
            if (err) {
                console.warn(`[ADB] 기기 파일 삭제 실패 (파일이 없을 수 있음): ${devicePath}`, err.message);
                resolve(false);
            } else {
                console.log(`[ADB] 기기 파일 삭제 완료: ${devicePath}`);
                resolve(true);
            }
        });
    });
};