import React, { useState, useEffect } from 'react';
import styles from './QRPage.module.scss';
import { Link } from 'react-router-dom';

import HomeIcon from '/src/renderer/assets/icons/home.svg';

const QRPage: React.FC = () => {
  const { ipcRenderer } = window.require("electron");
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [videoFileName, setVideoFileName] = useState<string>('');
  const [videoType, setVideoType] = useState<string>('loading');
  const [qrImageSrc, setQrImageSrc] = useState<string>('');
  const [qrLink, setQrLink] = useState<string>('');

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

  return (
    <div className={styles.pageWrapper}>
      <div className={styles.videoResult}>
        <div className={styles.videoPlayer}>
          {videoSrc && videoType !== 'error' ? (
            <video
              width="100%"
              height="100%"
              autoPlay
              muted
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
        <p>
          {videoType === 'loading' && '비디오를 불러오는 중...'}
          {videoType === 'edited' && `✅ 편집된 영상: ${videoFileName}`}
          {videoType === 'latest' && `📽️ 최신 영상: ${videoFileName}`}
          {videoType === 'sample' && `🎬 샘플 영상: ${videoFileName}`}
          {videoType === 'error' && '❌ 영상을 불러올 수 없습니다'}
        </p>
      </div>

      <div className={styles.qrCode}>
        {qrImageSrc ? (
          <div>
            <img 
              src={qrImageSrc} 
              alt="QR Code" 
              style={{ width: '180px', height: '180px' }}
            />
          </div>
        ) : (
          <div className={styles.codeBox}>QR 생성 중...</div>
        )}
        <p>QR코드를 확인하고 영상을 다운로드하세요</p>
        {qrLink && (
          <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
            공유 링크: {qrLink}
          </p>
        )}
      </div>

      <Link to={'/'} className={styles.homeBtn}>
        <img src={HomeIcon}/>메인화면
      </Link>

      <footer>
        <small>&copy; 2025 YourCompanyName. All rights reserved.</small>
      </footer>
    </div>
  );
};

export default QRPage;