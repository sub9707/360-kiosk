import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const ADB_PATH = `F:\\dev\\platform-tools\\adb.exe`;
const TEMP_DEVICE_PATH = '/sdcard/temp_record.mp4';

let currentRecordingProcess: any = null;

/**
 * 연결된 ADB 디바이스 중 첫 번째의 ID를 반환합니다.
 * 없으면 null 반환.
 */
export function getConnectedDeviceId(): string | null {
    try {
        const output = execSync('adb devices', { encoding: 'utf-8' });
        const lines = output.split('\n').slice(1); // 첫 줄은 "List of devices attached"

        const devices = lines
            .map(line => line.trim())
            .filter(line => line.endsWith('device'))
            .map(line => line.split('\t')[0]);

        if (devices.length === 0) {
            console.warn('[ADB] 연결된 디바이스가 없습니다.');
            return null;
        }

        return devices[0]; // 가장 첫 번째 디바이스 반환
    } catch (error) {
        console.error('❌ ADB 장치 목록 가져오기 실패:', error);
        return null;
    }
}

export const connectToDevice = (ip: string): Promise<boolean> => {
    return new Promise((resolve) => {
        const command = `${ADB_PATH} connect ${ip}`;

        exec(command, (err, stdout, stderr) => {
            if (err) {
                console.error('[ADB] Connection error:', err);
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
        const deviceId = getConnectedDeviceId();
        if (!deviceId) {
            return reject(new Error('No ADB device connected.'));
        }

        const command = `${ADB_PATH} -s ${deviceId} shell monkey -p com.sec.android.app.camera -c android.intent.category.LAUNCHER 1`;
        console.log('[ADB] Executing command to start camera app:', command);

        exec(command, (err, stdout, stderr) => {
            if (err) {
                console.error('[ADB] Failed to start camera app:', err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
};

export const startScreenRecordToPC = async (durationSec = 10): Promise<string | null> => {
    const now = new Date();
    const dateDir = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const filename = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}.mp4`;

    const localDir = path.join('F:/videos/original', dateDir);
    const localPath = path.join(localDir, filename);

    if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
    }

    console.log(`[ADB] Starting screen recording for ${durationSec} seconds...`);

    // ✅ 디바이스 ID 가져오기
    const deviceId = getConnectedDeviceId();
    if (!deviceId) {
        console.error('[ADB] No connected device found to start recording');
        return null;
    }

    // 1. Delete existing temp file (if any)
    await deleteDeviceFile(TEMP_DEVICE_PATH);

    // 2. Start recording
    return new Promise((resolve) => {
        const recordCommand = `${ADB_PATH} -s ${deviceId} shell screenrecord --time-limit ${durationSec} ${TEMP_DEVICE_PATH}`;

        currentRecordingProcess = exec(recordCommand, async (err) => {
            currentRecordingProcess = null;

            if (err) {
                console.error('[ADB] Screen recording failed:', err);
                return resolve(null);
            }

            console.log(`[ADB] Recording complete, pulling file to PC: ${localPath}`);

            // 3. Pull the file from device
            exec(`${ADB_PATH} -s ${deviceId} pull ${TEMP_DEVICE_PATH} "${localPath}"`, async (pullErr) => {
                if (pullErr) {
                    console.error('[ADB] Failed to pull recorded file:', pullErr);
                    await deleteDeviceFile(TEMP_DEVICE_PATH);
                    return resolve(null);
                }

                // 4. Delete temp file from device
                await deleteDeviceFile(TEMP_DEVICE_PATH);
                console.log('[ADB] Temporary file deleted from device');
                resolve(localPath);
            });
        });
    });
};


export const stopScreenRecord = (): Promise<void> => {
    return new Promise((resolve) => {
        if (currentRecordingProcess) {
            console.log('[ADB] Stopping ongoing recording process...');
            currentRecordingProcess.kill('SIGTERM');
            currentRecordingProcess = null;
        }

        const killCommand = `${ADB_PATH} shell "pkill -f screenrecord"`;
        exec(killCommand, (err) => {
            if (err) {
                console.warn('[ADB] Failed to terminate screenrecord process (might already be stopped):', err.message);
            } else {
                console.log('[ADB] screenrecord process terminated successfully');
            }
            resolve();
        });
    });
};

export const deleteDeviceFile = (devicePath: string): Promise<boolean> => {
    return new Promise((resolve) => {
        const deleteCommand = `${ADB_PATH} shell rm "${devicePath}"`;
        exec(deleteCommand, (err) => {
            if (err) {
                if (err.message.includes('No such file')) {
                    console.log(`[ADB] No previous file found on device: ${devicePath}`);
                } else {
                    console.warn(`[ADB] Failed to delete file on device: ${devicePath}`, err.message);
                }
                resolve(false);
            } else {
                console.log(`[ADB] File deleted from device: ${devicePath}`);
                resolve(true);
            }
        });
    });
};
