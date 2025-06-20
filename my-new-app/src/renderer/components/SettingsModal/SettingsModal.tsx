import React from 'react';
import styles from './SettingsModal.module.scss';
import CloseIcon from '/src/renderer/assets/icons/close.svg';
const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { ipcRenderer } = window.require("electron");

    if (!isOpen) return null;

    const exitButtonHandler = () => {
        if (confirm("프로그램을 종료하시겠습니까?")) {
            ipcRenderer.send('exit-app');
        }
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>환경 설정</h2>
                    <button className={styles.closeButton} onClick={onClose}> <img src={CloseIcon} alt="Close" /></button>
                </div>
                <div className={styles.modalBody}>
                    <div className={styles.inputGroup}>
                        <label>IP 주소</label>
                        <input type="text" defaultValue="192.168.1.100" />
                    </div>
                    <div className={styles.inputGroup}>
                        <label>기본 경로</label>
                        <input className={styles.dirInput} type="text" defaultValue="F:\videos\original" />
                    </div>
                </div>
                <div className={styles.modalFooter}>
                    <button className={styles.saveButton}>저장</button>
                    <button className={styles.exitButton} onClick={exitButtonHandler}>프로그램 종료</button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
