// src/renderer/hooks/useVideo.ts

import { useState, useEffect, useCallback } from 'react';
import { VideoData, UploadResult, QRState } from '../types';

const { ipcRenderer } = window.require("electron");

export const useVideo = () => {
  const [videoData, setVideoData] = useState<VideoData>({
    path: '',
    fileName: '',
    type: 'loading'
  });

  const [qrState, setQRState] = useState<QRState>({
    qrImageSrc: '',
    qrLink: ''
  });

  const [videoSrc, setVideoSrc] = useState<string>('');

  // 비디오 로드
  const loadVideo = useCallback(async (savedPath?: string) => {
    let targetPath = '';
    let type: VideoData['type'] = 'loading';

    if (savedPath) {
      const fs = window.require('fs');
      if (fs.existsSync(savedPath)) {
        targetPath = savedPath;
        type = 'edited';
      }
    }

    if (!targetPath) {
      const result = await ipcRenderer.invoke('find-latest-video');
      if (result.success) {
        targetPath = result.path;
        type = result.type;
      } else {
        setVideoData(prev => ({ ...prev, type: 'error' }));
        return null;
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
      
      const fileName = targetPath.split(/[\\/]/).pop() || '';
      
      setVideoData({
        path: targetPath,
        fileName,
        type
      });
      setVideoSrc(blobUrl);
      
      return { path: targetPath, blobUrl };
    } else {
      console.error('Video blob 생성 실패:', videoBlob.error || 'No data received');
      setVideoData(prev => ({ ...prev, type: 'error' }));
      return null;
    }
  }, []);

  // QR 업로드 및 생성
  const uploadAndGenerateQR = useCallback(async (videoPath: string): Promise<UploadResult> => {
    console.log('Starting upload process for:', videoPath);
    const uploadResult = await ipcRenderer.invoke('upload-video-and-qr', videoPath);

    if (uploadResult.success) {
      console.log('Upload successful:', uploadResult);
      setQRState(prev => ({ ...prev, qrLink: uploadResult.videoUrl }));

      // QR 이미지 blob 생성
      if (uploadResult.qrPath) {
        const qrBlob = await ipcRenderer.invoke('get-qr-blob', uploadResult.qrPath);
        if (qrBlob.success) {
          const qrImageBlob = new Blob([new Uint8Array(qrBlob.data)], { type: 'image/png' });
          const qrBlobUrl = URL.createObjectURL(qrImageBlob);
          console.log('QR blob URL:', qrBlobUrl);
          setQRState(prev => ({ ...prev, qrImageSrc: qrBlobUrl }));
        } else {
          console.error('QR blob 생성 실패:', qrBlob.error);
        }
      }

      console.log('🔗 공유 링크:', uploadResult.videoUrl);
      console.log('🖼️ QR 이미지 저장됨:', uploadResult.qrPath);
    } else {
      console.error('Upload 실패:', uploadResult.error);
    }

    return uploadResult;
  }, []);

  // 배경 비디오 로드
  const loadBackgroundVideo = useCallback(async (defaultVideo: string) => {
    try {
      console.log('🎬 [Home] 배경 영상 로드 시작');

      // Electron IPC 사용 가능 여부 확인
      if (typeof window !== 'undefined' && window.electron && window.electron.ipcRenderer) {
        try {
          // IPC를 통해 최신 배경 영상 요청
          const result = await window.electron.ipcRenderer.invoke('get-latest-background-video');

          if (result.success && result.videoPath && !result.useDefault) {
            // 로컬 파일 경로를 file:// URL로 변환
            const fileUrl = `file:///${result.videoPath.replace(/\\/g, '/')}`;
            return fileUrl;
          } else {
            return defaultVideo;
          }
        } catch (ipcError) {
          console.error('❌ [Home] IPC 호출 실패:', ipcError);
          return defaultVideo;
        }
      } else {
        console.warn('⚠️ [Home] Electron IPC가 사용 불가능합니다. 기본 영상을 사용합니다.');
        return defaultVideo;
      }
    } catch (error) {
      console.error('❌ [Home] 배경 영상 로드 실패:', error);
      return defaultVideo;
    }
  }, []);

  // 클린업
  const cleanup = useCallback(() => {
    if (videoSrc && videoSrc.startsWith('blob:')) {
      URL.revokeObjectURL(videoSrc);
    }
    if (qrState.qrImageSrc && qrState.qrImageSrc.startsWith('blob:')) {
      URL.revokeObjectURL(qrState.qrImageSrc);
    }
  }, [videoSrc, qrState.qrImageSrc]);

  // 컴포넌트 언마운트 시 클린업
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    videoData,
    videoSrc,
    qrState,
    loadVideo,
    uploadAndGenerateQR,
    loadBackgroundVideo,
    cleanup
  };
};