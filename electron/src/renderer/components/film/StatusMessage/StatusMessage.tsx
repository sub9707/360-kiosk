// src/renderer/components/film/StatusMessage/StatusMessage.tsx (새로운 폴더 생성)

import React from 'react';
import { ConnectionState, RecordingState } from '../../../types';
import styles from './StatusMessage.module.scss';

interface StatusMessageProps {
  connectionState: ConnectionState;
  recordingState: RecordingState;
}

const StatusMessage: React.FC<StatusMessageProps> = ({ 
  connectionState, 
  recordingState 
}) => {
  const { isConnecting, connectError } = connectionState;
  const { editingState, isTransferring } = recordingState;

  if (isConnecting) {
    return connectionState.autoConnectionStatus;
  }
  
  if (connectError) {
    return '카메라 연결 실패';
  }
  
  if (isTransferring) {
    return '영상 전송 중...';
  }
  
  if (editingState === '촬영 완료' || editingState === '편집중' || editingState === '편집 완료') {
    return `✅ 촬영 완료 (${editingState})`;
  }
  
  return '카메라 연결됨';
};

export default StatusMessage;