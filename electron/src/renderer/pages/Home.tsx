import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './Home.module.scss';

// Assets
import backgroundImage from '/src/renderer/assets/images/home-background.png';
import FolderIcon from '/src/renderer/assets/icons/folder.svg';
import SettingIcon from '/src/renderer/assets/icons/setting.svg';

// Components
import Footer from '../components/layout/Footer/Footer';
import SettingsModal from '../components/SettingsModal/SettingsModal';
import VideoManagementModal from '../components/VideoManagementModal/VideoManagementModal';

// Hooks
import { useKeyboard } from '../hooks/useKeyboard';

const Home: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [footerKey, setFooterKey] = useState(0);

  const startButtonRef = useRef<HTMLAnchorElement>(null);

  // 키보드 이벤트 처리
  useKeyboard('PageUp', () => { }, startButtonRef);

  // SettingsModal이 닫힐 때 Footer 리렌더링
  const handleSettingsModalClose = () => {
    setIsSettingsModalOpen(false);
    setFooterKey(prev => prev + 1);
  };

  return (
    <div className={styles.pageWrapper}>
      {/* 배경화면 */}
      <div className={styles.backgroundWrapper}>
        <div className={styles.background}>
          <div className={styles.overlay} />
          <img
            src={backgroundImage}
            alt=""
            className={styles.videoSource}
            draggable={false}
          />
        </div>
      </div>

      {/* 상단 메인 UI */}
      <div className={styles.mainWrapper}>
        <div className={styles.mainContainer}>
          <Link
            to="/film"
            ref={startButtonRef}
            className={styles.startBtn}
          >
            촬영 시작
          </Link>
        </div>
      </div>

      <Footer key={footerKey} variant="both" position="absolute" />

      {/* Settings Button */}
      <button
        className={styles.settingsButton}
        onClick={() => setIsSettingsModalOpen(true)}
      >
        <img src={SettingIcon} alt="Settings" />
      </button>

      {/* Folder Icon Button */}
      <button
        className={styles.folderButton}
        onClick={() => setIsModalOpen(true)}
      >
        <img src={FolderIcon} alt="Manage Videos" />
      </button>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={handleSettingsModalClose}
      />

      {/* Video Management Modal */}
      <VideoManagementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default Home;
