// src/renderer/components/film/FilmStates/index.tsx (새로운 폴더 생성)

import React from 'react';
import { ConnectionState, RecordingState } from '../../../types';
import Button from '../../common/Button/Button';
import ProgressBar from '../../common/ProgressBar/ProgressBar';
import Spinner from '../../Spinner/Spinner';
import styles from './FilmStates.module.scss';

interface FilmStatesProps {
  connectionState: ConnectionState;
  recordingState: RecordingState;
  onConnectCamera: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onRetake: () => void;
  onEdit: () => void;
  nextButtonRef: React.RefObject<HTMLButtonElement>;
}

const FilmStates: React.FC<FilmStatesProps> = ({
  connectionState,
  recordingState,
  onConnectCamera,
  onStartRecording,
  onStopRecording,
  onRetake,
  onEdit,
  nextButtonRef
}) => {
  const { isConnected, isConnecting, connectError } = connectionState;
  const { 
    isRecording, 
    editingState, 
    isTransferring, 
    timeLeft, 
    progress 
  } = recordingState;

  // 카메라 연결 중
  if (isConnecting) {
    return (
      <div className={styles.connectingStatus}>
        <Spinner />
        <p>카메라 연결 중</p>
      </div>
    );
  }

  // 연결 실패 (촬영 완료 상태가 아닐 때만)
  if (connectError && !isConnecting && 
      !['촬영 완료', '편집중', '편집 완료'].includes(editingState) && 
      !isTransferring) {
    return (
      <div className={styles.connectError}>
        <p>카메라 연결에 실패했습니다</p>
        <Button 
          variant="danger" 
          size="large"
          onClick={onConnectCamera}
          ref={nextButtonRef}
        >
          재연결
        </Button>
      </div>
    );
  }

  // 연결 완료 & 촬영 대기 상태
  if (isConnected && !isRecording && editingState === '대기중' && 
      !isConnecting && !isTransferring) {
    return (
      <div className={styles.centerMessage}>
        <p>카메라가 연결되었습니다</p>
        <Button 
          variant="primary" 
          size="large"
          onClick={onStartRecording}
          ref={nextButtonRef}
        >
          촬영 시작
        </Button>
      </div>
    );
  }

  // 촬영 중
  if (isRecording && editingState === '촬영 중' && !isTransferring) {
    return (
      <div className={styles.filmInProgress}>
        <p>촬영 중</p>
        <ProgressBar 
          progress={progress} 
          timeLeft={timeLeft}
          showTimeLeft={true}
        />
        <Button 
          variant="secondary" 
          size="large"
          onClick={onStopRecording}
        >
          촬영 중지
        </Button>
      </div>
    );
  }

  // 영상 전송 중
  if (isTransferring && 
      (editingState === '영상 전송 대기' || editingState === '영상 전송중')) {
    return (
      <div className={styles.transferInProgress}>
        <Spinner />
        <p>영상 전송 중</p>
        <p className={styles.transferDescription}>
          Android에서 PC로 영상을 전송하고 있습니다...
        </p>
      </div>
    );
  }

  // 촬영 완료됨
  if (!isRecording && !isTransferring && 
      ['촬영 완료', '편집중', '편집 완료', '촬영 실패'].includes(editingState) && 
      !isConnecting) {
    return (
      <div className={styles.filmComplete}>
        {editingState === '편집중' && (
          <div className={styles.editingStatus}>
            <Spinner />
            <p>영상 편집 중...</p>
          </div>
        )}
        
        {editingState === '촬영 완료' && (
          <p>촬영이 완료되었습니다</p>
        )}
        
        {editingState === '촬영 실패' && (
          <p>촬영에 실패했습니다</p>
        )}
        
        {editingState === '촬영 완료' && (
          <div className={styles.buttonGroup}>
            <Button 
              variant="secondary" 
              size="large"
              onClick={onRetake}
            >
              재촬영
            </Button>
            <Button 
              variant="primary" 
              size="large"
              onClick={onEdit}
              ref={nextButtonRef}
            >
              편집 시작
            </Button>
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default FilmStates;