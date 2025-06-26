import React from 'react';
import styles from './SettingsModal.module.scss';
import CloseIcon from '/src/renderer/assets/icons/close.svg';
const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { ipcRenderer } = window.require("electron");

    if (!isOpen) return null;

    const exitButtonHandler = () => {
        ipcRenderer.send('exit-app');
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>환경 설정</h2>
                    <button className={styles.closeButton} onClick={onClose}> <img src={CloseIcon} alt="Close" /></button>
                </div>

                <div className={styles.modalFooter}>
                    <button className={styles.exitButton} onClick={exitButtonHandler}>프로그램 종료</button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
