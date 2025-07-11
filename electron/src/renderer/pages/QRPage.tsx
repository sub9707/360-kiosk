// src/renderer/QRPage.tsx (리// src/renderer/QRPage.tsx (리팩토링)

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './QRPage.module.scss';

// Assets
import HomeIcon from '/src/renderer/assets/icons/home.svg';

// Components
import { Footer } from '../components/layout';
import VideoPlayer from '../components/common/VideoPlayer/VideoPlayer';
import Spinner from '../components/Spinner/Spinner';

// Hooks
import { useKeyboard } from '../hooks/useKeyboard';
import { useVideo } from '../hooks/useVideo';

// Types
import { VideoData } from '../types/index';

const { ipcRenderer } = window.require("electron");

const QRPage: React.FC = () => {
  const { videoData, videoSrc, qrState, loadVideo, uploadAndGenerateQR, cleanup } = useVideo();
  const [videoFileName, setVideoFileName] = useState<string>('');
  
  const nextButtonRef = useRef<HTMLAnchorElement>(null);

  // 키보드 이벤트 처리
  useKeyboard('PageUp', () => {}, nextButtonRef);

  useEffect(() => {
    const initializeVideo = async () => {
      const savedVideoPath = localStorage.getItem('editedVideoPath');
      
      // 비디오 로드
      const result = await loadVideo(savedVideoPath);
      if (!result) return;

      const { path } = result;
      
      // 파일명 설정
      const fileName = path.split(/[\\/]/).pop() || '';
      setVideoFileName(fileName);
      
      // localStorage 클리어
      if (savedVideoPath) {
        localStorage.removeItem('editedVideoPath');
      }

      // 드라이브 업로드 및 QR 생성
      await uploadAndGenerateQR(path);
    };

    initializeVideo();

    // cleanup function
    return cleanup;
  }, [loadVideo, uploadAndGenerateQR, cleanup]);

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.videoResult}>
        <div className={styles.videoPlayer}>
          <VideoPlayer
            src={videoSrc}
            loading={videoData.type === 'loading'}
            error={videoData.type === 'error'}
            autoPlay={true}
            loop={true}
            controls={true}
            aspectRatio="vertical"
            onError={(e) => {
              console.error('Video error:', e);
            }}
            onLoadStart={() => console.log('Video load started')}
            onCanPlay={() => console.log('Video can play')}
          />
        </div>
      </div>

      <div className={styles.qrCode}>
        {qrState.qrImageSrc ? (
          <div className={styles.codeBox}>
            <img
              src={qrState.qrImageSrc}
              alt="QR Code"
            />
            <p>QR코드를 스캔하여 영상을 다운로드하세요</p>
          </div>
        ) : (
          <div className={styles.codeBox}>
            <Spinner />
            <p>QR코드 생성 중</p>
          </div>
        )}
      </div>

      <Link to="/" ref={nextButtonRef} className={styles.homeBtn}>
        <img src={HomeIcon} alt="Home" />
        메인화면
      </Link>

      <Footer variant="copyright" position="absolute" />
    </div>
  );
};

export default QRPage;