// src/renderer/components/common/VideoPlayer/VideoPlayer.tsx (새로운 폴더 생성)

import React from 'react';
import styles from './VideoPlayer.module.scss';

interface VideoPlayerProps {
  src: string;
  loading?: boolean;
  error?: boolean;
  autoPlay?: boolean;
  controls?: boolean;
  loop?: boolean;
  muted?: boolean;
  aspectRatio?: 'horizontal' | 'vertical' | 'cover';
  onError?: (error: React.SyntheticEvent<HTMLVideoElement, Event>) => void;
  onLoadedData?: () => void;
  onCanPlay?: () => void;
  onLoadStart?: () => void;
  className?: string;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  loading = false,
  error = false,
  autoPlay = false,
  controls = false,
  loop = false,
  muted = true,
  aspectRatio = 'vertical',
  onError,
  onLoadedData,
  onCanPlay,
  onLoadStart,
  className = ''
}) => {
  if (loading) {
    return (
      <div className={`${styles.videoContainer} ${styles[aspectRatio]} ${className}`}>
        <div className={styles.videoFallback}>
          영상을 불러오는 중...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${styles.videoContainer} ${styles[aspectRatio]} ${className}`}>
        <div className={styles.videoFallback}>
          영상을 불러올 수 없습니다
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.videoContainer} ${styles[aspectRatio]} ${className}`}>
      <video
        width="100%"
        height="100%"
        autoPlay={autoPlay}
        loop={loop}
        controls={controls}
        muted={muted}
        onError={onError}
        onLoadedData={onLoadedData}
        onCanPlay={onCanPlay}
        onLoadStart={onLoadStart}
        className={styles.video}
      >
        <source src={src} type="video/mp4" />
        브라우저가 비디오를 지원하지 않습니다.
      </video>
    </div>
  );
};

export default VideoPlayer;