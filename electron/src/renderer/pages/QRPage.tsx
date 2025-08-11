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
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  
  const nextButtonRef = useRef<HTMLAnchorElement>(null);

  // 키보드 이벤트 처리
  useKeyboard('PageUp', () => {}, nextButtonRef);

  useEffect(() => {
    // 이미 초기화되었다면 실행하지 않음
    if (isInitialized) {
      console.log('Already initialized, skipping...');
      return;
    }

    const initializeVideo = async () => {
      try {
        console.log('🎬 QRPage 초기화 시작');
        
        const savedVideoPath = localStorage.getItem('editedVideoPath');
        console.log('📁 저장된 비디오 경로:', savedVideoPath);
        
        // 비디오 로드
        const result = await loadVideo(savedVideoPath || undefined);
        if (!result) {
          console.error('❌ 비디오 로드 실패');
          return;
        }

        const { path } = result;
        console.log('✅ 비디오 로드 성공:', path);
        
        // 파일명 설정
        const fileName = path.split(/[\\/]/).pop() || '';
        setVideoFileName(fileName);
        
        // localStorage 클리어 (한 번만)
        if (savedVideoPath) {
          localStorage.removeItem('editedVideoPath');
          console.log('🗑️ localStorage 클리어됨');
        }

        // 드라이브 업로드 및 QR 생성 (한 번만)
        const uploadResult = await uploadAndGenerateQR(path);
        if (uploadResult.success) {
          console.log('✅ 업로드 및 QR 생성 완료');
        } else {
          console.error('❌ 업로드 실패:', uploadResult.error);
        }

        // 초기화 완료 표시
        setIsInitialized(true);
        console.log('🎉 QRPage 초기화 완료');

      } catch (error) {
        console.error('❌ QRPage 초기화 실패:', error);
      }
    };

    initializeVideo();
  }, []); // 빈 의존성 배열로 한 번만 실행

  // 컴포넌트 언마운트 시에만 cleanup 실행
  useEffect(() => {
    return () => {
      console.log('🧹 QRPage cleanup 실행');
      cleanup();
    };
  }, []); // cleanup 함수를 의존성에서 제거

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