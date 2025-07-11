// src/renderer/Home.tsx (리팩토링)

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './Home.module.scss';

// Assets
import sampleVideo from '/src/renderer/assets/videos/sample-background.mp4';
import FolderIcon from '/src/renderer/assets/icons/folder.svg';
import SettingIcon from '/src/renderer/assets/icons/setting.svg';

// Components
import Footer from '../components/layout/Footer/Footer';
import Button from '../components/common/Button/Button';
import VideoPlayer from '../components/common/VideoPlayer/VideoPlayer';
import SettingsModal from '../components/SettingsModal/SettingsModal';
import VideoManagementModal from '../components/VideoManagementModal/VideoManagementModal';

// Hooks
import { useEnvConfig } from '../hooks/useEnvConfig';
import { useKeyboard } from '../hooks/useKeyboard';
import { useVideo } from '../hooks/useVideo';

const Home: React.FC = () => {
  const { config } = useEnvConfig();
  const { loadBackgroundVideo } = useVideo();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [videoSource, setVideoSource] = useState<string>(sampleVideo);
  const [isVideoLoading, setIsVideoLoading] = useState(false);

  const startButtonRef = useRef<HTMLAnchorElement>(null);

  // 키보드 이벤트 처리
  useKeyboard('PageUp', () => {}, startButtonRef);

  // 배경 영상 로드
  useEffect(() => {
    const loadVideo = async () => {
      setIsVideoLoading(true);
      const videoSrc = await loadBackgroundVideo(sampleVideo);
      setVideoSource(videoSrc);
      setIsVideoLoading(false);
    };

    loadVideo();
  }, [loadBackgroundVideo]);

  // 영상 에러 처리
  const handleVideoError = (error: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error('❌ [Home] 영상 재생 오류:', error);
    if (videoSource !== sampleVideo) {
      setVideoSource(sampleVideo);
    }
  };

  // 영상 로드 완료 처리
  const handleVideoLoaded = () => {
    setIsVideoLoading(false);
  };

  return (
    <div className={styles.pageWrapper}>
      {/* 배경화면 */}
      <div className={styles.backgroundWrapper}>
        <div className={styles.background}>
          <div className={styles.overlay} />
          <VideoPlayer
            src={videoSource}
            loading={isVideoLoading}
            autoPlay={true}
            loop={true}
            muted={true}
            aspectRatio="cover"
            onError={handleVideoError}
            onLoadedData={handleVideoLoaded}
            onCanPlay={handleVideoLoaded}
            className={styles.videoSource}
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

      <Footer variant="both" position="absolute" />

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
        onClose={() => setIsSettingsModalOpen(false)} 
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