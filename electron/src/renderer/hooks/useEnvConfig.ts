// src/renderer/hooks/useEnvConfig.ts (새 파일)
import { useState, useEffect } from 'react';

interface EnvConfig {
    copyright: boolean;
    nodeEnv: string;
    baseDirectory: string;
    wirelessAddress: string;
    driveFolderId: string;
}

export const useEnvConfig = () => {
    const [config, setConfig] = useState<EnvConfig | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadConfig = async () => {
            try {
                // Electron 환경 체크
                if (typeof window !== 'undefined' && window.electron?.getEnvConfig) {
                    const envConfig = await window.electron.getEnvConfig();
                    setConfig(envConfig);
                } else {
                    console.warn('⚠️ [useEnvConfig] Electron not available, using defaults');
                    // Electron이 없는 환경에서는 기본값 사용
                    setConfig({
                        copyright: true,
                        nodeEnv: 'development',
                        baseDirectory: '',
                        wirelessAddress: '',
                        driveFolderId: ''
                    });
                }
            } catch (error) {
                console.error('❌ [useEnvConfig] Failed to load config:', error);
                setConfig({
                    copyright: false,
                    nodeEnv: 'development',
                    baseDirectory: '',
                    wirelessAddress: '',
                    driveFolderId: ''
                });
            } finally {
                setLoading(false);
            }
        };

        loadConfig();
    }, []);

    return { config, loading };
};