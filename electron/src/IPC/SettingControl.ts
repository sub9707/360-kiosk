import { ipcMain, dialog, app } from 'electron';
import fs from 'fs';
import path from 'path';

interface SettingsConfig {
    connection_ip: string;
    directory_path: string;
    copyright: boolean;
    DRIVE_FOLDER_ID: string;
}

const defaultConfig: SettingsConfig = {
    connection_ip: "",
    directory_path: "",
    copyright: true,
    DRIVE_FOLDER_ID: ""
};

// 설정 파일 경로 가져오기
const getConfigPath = (): string => {
    if (app.isPackaged) {
        // 프로덕션 환경: process.resourcesPath 사용
        const resourcePath = path.join(process.resourcesPath, 'settings.config.json');
        console.log(`[SettingControl] 프로덕션 설정 파일 경로: ${resourcePath}`);
        return resourcePath;
    } else {
        // 개발 환경: 프로젝트 루트 기준
        const devPath = path.join(app.getAppPath(), 'src', 'settings.config.json');
        console.log(`[SettingControl] 개발 설정 파일 경로: ${devPath}`);
        return devPath;
    }
};


// 설정 파일 읽기
const loadConfig = (): SettingsConfig => {
    try {
        const configPath = getConfigPath();
        const configData = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(configData);
    } catch (error) {
        console.error('[SettingControl] 설정 파일 로드 오류:', error);
        return defaultConfig;
    }
};

// 설정 파일 저장
const saveConfig = (config: SettingsConfig): void => {
    try {
        const configPath = getConfigPath();
        // 디렉토리가 존재하지 않으면 생성
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
        console.log(`[SettingControl] 설정 파일 저장 완료: ${configPath}`);
    } catch (error) {
        console.error('[SettingControl] 설정 파일 저장 오류:', error);
        throw error;
    }
};

// IPC 핸들러들
// 1. 현재 connectionIP 가져오기
ipcMain.handle('get-connection-ip', () => {
    const config = loadConfig();
    return config.connection_ip;
});

// 2. 현재 디렉토리 가져오기
ipcMain.handle('get-directory-path', () => {
    const config = loadConfig();
    return config.directory_path;
});

// 3. connectionIP 수정하기
ipcMain.handle('set-connection-ip', (event, newIp: string) => {
    try {
        const config = loadConfig();
        config.connection_ip = newIp;
        saveConfig(config);
        return { success: true, message: 'IP 주소가 성공적으로 저장되었습니다.' };
    } catch (error) {
        console.error('[SettingControl] IP 설정 저장 오류:', error);
        return { success: false, message: 'IP 주소 저장에 실패했습니다.' };
    }
});

// 4. Directory Path 수정하기 (디렉토리 선택 다이얼로그)
ipcMain.handle('select-and-set-directory', async () => {
    try {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: '기본 디렉토리 선택'
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const selectedPath = result.filePaths[0];
            const config = loadConfig();
            config.directory_path = selectedPath;
            saveConfig(config);
            
            return { 
                success: true, 
                path: selectedPath, 
                message: '디렉토리가 성공적으로 설정되었습니다.' 
            };
        } else {
            return { 
                success: false, 
                path: null, 
                message: '디렉토리 선택이 취소되었습니다.' 
            };
        }
    } catch (error) {
        console.error('[SettingControl] 디렉토리 선택 오류:', error);
        return { 
            success: false, 
            path: null, 
            message: '디렉토리 선택 중 오류가 발생했습니다.' 
        };
    }
});

// 기존의 select-directory 핸들러도 유지 (호환성을 위해)
ipcMain.handle('select-directory', async () => {
    try {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: '기본 디렉토리 선택'
        });
        return result;
    } catch (error) {
        console.error('[SettingControl] 디렉토리 선택 오류:', error);
        return { canceled: true };
    }
});

// 5. 현재 copyright 값 가져오기
ipcMain.handle('get-copyright-setting', () => {
    const config = loadConfig();
    return config.copyright;
});

// 6. copyright 값 전환하기
ipcMain.handle('toggle-copyright-setting', () => {
    try {
        const config = loadConfig();
        config.copyright = !config.copyright;
        saveConfig(config);
        return { 
            success: true, 
            newValue: config.copyright, 
            message: `저작권 표시가 ${config.copyright ? '활성화' : '비활성화'}되었습니다.` 
        };
    } catch (error) {
        console.error('[SettingControl] 저작권 설정 변경 오류:', error);
        return { 
            success: false, 
            newValue: null, 
            message: '저작권 설정 변경에 실패했습니다.' 
        };
    }
});

// 7. 특정 copyright 값으로 설정하기 (추가 기능)
ipcMain.handle('set-copyright-setting', (event, value: boolean) => {
    try {
        const config = loadConfig();
        config.copyright = value;
        saveConfig(config);
        return { 
            success: true, 
            newValue: config.copyright, 
            message: `저작권 표시가 ${config.copyright ? '활성화' : '비활성화'}되었습니다.` 
        };
    } catch (error) {
        console.error('[SettingControl] 저작권 설정 변경 오류:', error);
        return { 
            success: false, 
            newValue: null, 
            message: '저작권 설정 변경에 실패했습니다.' 
        };
    }
});

// 8. 전체 설정 가져오기 (추가 유틸리티 기능)
ipcMain.handle('get-all-settings', () => {
    return loadConfig();
});

// 9. 설정 파일 리셋 (추가 유틸리티 기능)
ipcMain.handle('reset-settings', () => {
    try {
        saveConfig(defaultConfig);
        return { 
            success: true, 
            message: '설정이 기본값으로 초기화되었습니다.' 
        };
    } catch (error) {
        console.error('[SettingControl] 설정 초기화 오류:', error);
        return { 
            success: false, 
            message: '설정 초기화에 실패했습니다.' 
        };
    }
});

// 개별 함수들 내보내기
export {
    loadConfig,
    saveConfig
};