import React, { useEffect, useState } from 'react';
import styles from './SettingsModal.module.scss';
import CloseIcon from '/src/renderer/assets/icons/close.svg';

const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { ipcRenderer } = window.require("electron");

    const [ipAddress, setIpAddress] = useState('0.0.0.0');
    const [defaultDirectory, setDefaultDirectory] = useState('C:\\Users\\User\\Documents');
    const [copyrightEnabled, setCopyrightEnabled] = useState(true);

    // 초기 기본 데이터 로드
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const ip = await ipcRenderer.invoke('get-connection-ip');
                setIpAddress(ip || '0.0.0.0');

                const directory = await ipcRenderer.invoke('get-directory-path');
                setDefaultDirectory(directory || 'C:\\Users\\User\\Documents');

                const copyright = await ipcRenderer.invoke('get-copyright-setting');
                setCopyrightEnabled(copyright);
            } catch (err) {
                console.error("초기 설정 로드 중 오류 발생: ", err);
            }
        };

        if (isOpen) {
            loadInitialData();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const exitButtonHandler = () => {
        ipcRenderer.send('exit-app');
    }

    const handleIpSave = async () => {
        try {
            const result = await ipcRenderer.invoke('set-connection-ip', ipAddress);
            if (result.success) {
                console.log('IP 저장 성공:', result.message);
            } else {
                console.error('IP 저장 실패:', result.message);
            }
        } catch (error) {
            console.error('IP 저장 중 오류:', error);
        }
    }

    const handleDirectorySelect = async () => {
        try {
            const result = await ipcRenderer.invoke('select-and-set-directory');
            if (result.success) {
                setDefaultDirectory(result.path);
                console.log('디렉토리 설정 성공:', result.message);
            } else {
                console.log('디렉토리 선택:', result.message);
            }
        } catch (error) {
            console.error('디렉토리 선택 중 오류:', error);
        }
    }

    const handleCopyrightToggle = async () => {
        try {
            const result = await ipcRenderer.invoke('toggle-copyright-setting');
            if (result.success) {
                setCopyrightEnabled(result.newValue);
                console.log('저작권 설정 변경 성공:', result.message);
            } else {
                console.error('저작권 설정 변경 실패:', result.message);
            }
        } catch (error) {
            console.error('저작권 설정 변경 중 오류:', error);
        }
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>환경 설정</h2>
                    <button className={styles.closeButton} onClick={onClose}>
                        <img src={CloseIcon} alt="Close" />
                    </button>
                </div>

                <div className={styles.modalBody}>
                    {/* IP 설정 */}
                    <div className={styles.settingSection}>
                        <h3 className={styles.settingHeader}>IP 변경 (연결된 모바일 기기와 동일한 주소)</h3>
                        <div className={styles.inputGroup}>
                            <input
                                type="text"
                                className={styles.textInput}
                                value={ipAddress}
                                onChange={(e) => setIpAddress(e.target.value)}
                                placeholder="IP 주소를 입력하세요"
                            />
                            <button className={styles.settingButton} onClick={handleIpSave}>
                                설정
                            </button>
                        </div>
                    </div>

                    {/* 기본 디렉토리 설정 */}
                    <div className={styles.settingSection}>
                        <h3 className={styles.settingHeader}>기본 디렉토리 설정</h3>
                        <div className={styles.inputGroup}>
                            <input
                                type="text"
                                className={styles.textInput}
                                value={defaultDirectory}
                                onChange={(e) => setDefaultDirectory(e.target.value)}
                                placeholder="디렉토리 경로"
                                readOnly
                            />
                            <button className={styles.browseButton} onClick={handleDirectorySelect}>
                                ...
                            </button>
                        </div>
                    </div>

                    {/* 저작권 표시 설정 */}
                    <div className={styles.settingSection}>
                        <h3 className={styles.settingHeader}>저작권 표시</h3>
                        <div className={styles.toggleGroup}>
                            <span className={styles.toggleLabel}>
                                {copyrightEnabled ? '활성화' : '비활성화'}
                            </span>
                            <button 
                                className={`${styles.toggleButton} ${copyrightEnabled ? styles.active : ''}`} 
                                onClick={handleCopyrightToggle}
                            >
                                <div className={styles.toggleSlider}></div>
                            </button>
                        </div>
                    </div>
                </div>

                <div className={styles.modalFooter}>
                    <button className={styles.exitButton} onClick={onClose}>
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;