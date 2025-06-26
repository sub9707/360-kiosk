import React, { useState, useEffect, useRef } from 'react';
import styles from './QRPage.module.scss';
import { Link } from 'react-router-dom';

import HomeIcon from '/src/renderer/assets/icons/home.svg';
import Spinner from '../components/Spinner/Spinner';
import { useEnvConfig } from '../hooks/useEnvConfig';

const QRPage: React.FC = () => {
  const { config, loading } = useEnvConfig();

  const { ipcRenderer } = window.require("electron");
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoType, setVideoType] = useState<string>('loading');
  const [qrImageSrc, setQrImageSrc] = useState<string>('');
  const [qrLink, setQrLink] = useState<string>('');

  const nextButtonRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const loadVideo = async () => {
      const savedVideoPath = localStorage.getItem('editedVideoPath');

      let targetPath = '';
      let type = '';

      if (savedVideoPath) {
        const fs = window.require('fs');
        if (fs.existsSync(savedVideoPath)) {
          targetPath = savedVideoPath;
          type = 'edited';
          localStorage.removeItem('editedVideoPath');
        }
      }

      if (!targetPath) {
        const result = await ipcRenderer.invoke('find-latest-video');
        if (result.success) {
          targetPath = result.path;
          type = result.type;
        } else {
          setVideoType('error');
          return;
        }
      }

      // 동영상 blob 생성
      console.log('Loading video from:', targetPath);
      const videoBlob = await ipcRenderer.invoke('get-video-blob', targetPath);
      console.log('Video blob result:', { success: videoBlob.success, dataLength: videoBlob.data?.length });

      if (videoBlob.success && videoBlob.data && videoBlob.data.length > 0) {
        const blob = new Blob([new Uint8Array(videoBlob.data)], { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(blob);
        console.log('Video blob created:', { size: blob.size, type: blob.type, url: blobUrl });
        setVideoSrc(blobUrl);

        const fileName = targetPath.split(/[\\/]/).pop() || '';
        setVideoFileName(fileName);
        setVideoType(type);
      } else {
        console.error('Video blob 생성 실패:', videoBlob.error || 'No data received');
        setVideoType('error');
        return;
      }

      // 🔗 드라이브 업로드 및 QR 생성
      console.log('Starting upload process for:', targetPath);
      const uploadResult = await ipcRenderer.invoke('upload-video-and-qr', targetPath);

      if (uploadResult.success) {
        console.log('Upload successful:', uploadResult);
        setQrLink(uploadResult.videoUrl);

        // QR 이미지 blob 생성
        if (uploadResult.qrPath) {
          const qrBlob = await ipcRenderer.invoke('get-qr-blob', uploadResult.qrPath);
          if (qrBlob.success) {
            const qrImageBlob = new Blob([new Uint8Array(qrBlob.data)], { type: 'image/png' });
            const qrBlobUrl = URL.createObjectURL(qrImageBlob);
            console.log('QR blob URL:', qrBlobUrl);
            setQrImageSrc(qrBlobUrl);
          } else {
            console.error('QR blob 생성 실패:', qrBlob.error);
          }
        }

        console.log('🔗 공유 링크:', uploadResult.videoUrl);
        console.log('🖼️ QR 이미지 저장됨:', uploadResult.qrPath);
      } else {
        console.error('Upload 실패:', uploadResult.error);
      }
    };

    loadVideo();

    // cleanup function
    return () => {
      if (videoSrc && videoSrc.startsWith('blob:')) {
        URL.revokeObjectURL(videoSrc);
      }
      if (qrImageSrc && qrImageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(qrImageSrc);
      }
    };
  }, []);

  // 페이지 업 키 이벤트 등록
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'PageUp' && nextButtonRef.current) {
        nextButtonRef.current.click();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.videoResult}>
        <div className={styles.videoPlayer}>
          {videoSrc && videoType !== 'error' ? (
            <video
              width="100%"
              height="100%"
              autoPlay
              loop
              controls
              style={{ objectFit: 'contain', backgroundColor: '#000' }}
              onLoadStart={() => console.log('Video load started')}
              onCanPlay={() => console.log('Video can play')}
              onError={(e) => {
                console.error('Video error:', e);
              }}
            >
              <source src={videoSrc} type="video/mp4" />
              브라우저가 비디오를 지원하지 않습니다.
            </video>
          ) : (
            <div className={styles.videoFallback}>
              {videoType === 'error' ? '영상을 불러올 수 없습니다' : '영상을 불러오는 중...'}
            </div>
          )}
        </div>
      </div>

      <div className={styles.qrCode}>
        {qrImageSrc ? (
          <div className={styles.codeBox}>
            <img
              src={qrImageSrc}
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

      <Link to={'/'} ref={nextButtonRef} className={styles.homeBtn}>
        <img src={HomeIcon} />메인화면
      </Link>

      <footer className={styles.footer}>
        {config && config.copyright && (
          <small>&copy; 2025 HOWDOYOUDO. All rights reserved.</small>
        )}
      </footer>
    </div>
  );
};

export default QRPage;