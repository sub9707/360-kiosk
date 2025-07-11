// src/renderer/Film.tsx (리팩토링)

import React, { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Film.module.scss';

// Components
import Header from '../components/layout/Header/Header';
import Footer from '../components/layout/Footer/Footer';
import FilmStates from '../components/film/FilmStates/FilmStates';
import StatusMessage from '../components/film/StatusMessage/StatusMessage';

// Hooks
import { useCamera } from '../hooks/useCamera';
import { useKeyboard } from '../hooks/useKeyboard';
import { useRecordingTimer } from '../hooks/useRecordingTimer';
import { useIPCListeners } from '../hooks/useIPCListeners';

const { ipcRenderer } = window.require("electron");

const Film: React.FC = () => {
  const navigate = useNavigate();
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  // 카메라 관련 상태 및 액션
  const {
    connectionState,
    recordingState,
    resetStates,
    connectCamera,
    autoReconnect,
    startRecording,
    stopRecording,
    retakeVideo,
    editVideo,
    updateConnectionState,
    updateRecordingState,
    setEditingState,
    addDebugLog
  } = useCamera();

  // 키보드 이벤트 처리
  useKeyboard('PageUp', () => {}, nextButtonRef);

  // 녹화 타이머 관리
  useRecordingTimer({
    isRecording: recordingState.isRecording,
    timeLeft: recordingState.timeLeft,
    onTimeUpdate: (timeLeft, progress) => {
      updateRecordingState({ timeLeft, progress });
    },
    onTimeEnd: () => {
      updateRecordingState({
        isRecording: false,
        isTransferring: true
      });
      setEditingState('영상 전송 대기');
    },
    addDebugLog
  });

  // IPC 이벤트 리스너
  useIPCListeners({
    updateConnectionState,
    updateRecordingState,
    setEditingState,
    editingState: recordingState.editingState,
    addDebugLog
  });

  // 페이지 진입 시 초기화 및 자동 연결
  useEffect(() => {
    const initializeAndConnect = async () => {
      addDebugLog('🔄 페이지 진입 - 강제 상태 초기화');
      resetStates();

      try {
        addDebugLog('🔍 기존 연결 상태 확인 시작');
        const connectionStatus = await ipcRenderer.invoke('check-connection-status');

        if (connectionStatus?.isConnected) {
          addDebugLog('✅ 이미 연결된 상태 감지 - 자동 연결 시도 생략');
          updateConnectionState({
            isConnected: true,
            isConnecting: false,
            connectError: false,
            autoConnectionStatus: 'PC와 연결됨'
          });
          setEditingState('대기중');
        } else {
          addDebugLog('❌ 연결되지 않은 상태 - 새로운 연결 시도');
          setTimeout(() => {
            addDebugLog('🚀 상태 초기화 완료 - 카메라 연결 시도');
            connectCamera();
          }, 500);
        }
      } catch (error) {
        addDebugLog(`⚠️ 연결 상태 확인 실패: ${error} - 새로운 연결 시도`);
        setTimeout(() => {
          connectCamera();
        }, 500);
      }
    };

    initializeAndConnect();
  }, []);

  // 홈으로 이동
  const handleGoHome = () => {
    addDebugLog('🏠 홈으로 돌아가기 - 완전 상태 초기화');
    resetStates();
    navigate('/');
  };

  // 편집 시작 및 결과 페이지로 이동
  const handleEditVideo = async () => {
    const editedPath = await editVideo();
    if (editedPath) {
      localStorage.setItem('editedVideoPath', editedPath);
      navigate('/result');
    }
  };

  return (
    <div className={styles.container}>
      <Header 
        status={<StatusMessage 
          connectionState={connectionState} 
          recordingState={recordingState} 
        />}
        onHomeClick={handleGoHome}
      />

      <div className={styles.instruction}>
        <div className={styles.instructionWrapper}>
          <FilmStates
            connectionState={connectionState}
            recordingState={recordingState}
            onConnectCamera={autoReconnect}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onRetake={retakeVideo}
            onEdit={handleEditVideo}
            nextButtonRef={nextButtonRef}
          />
        </div>
      </div>

      <Footer variant="logo" position="fixed" />
    </div>
  );
};

export default Film;