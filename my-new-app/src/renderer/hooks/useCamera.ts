import { useState, useCallback } from 'react';
import { ConnectionState, RecordingState, EditingState } from '../types';

const { ipcRenderer } = window.require("electron");

export const useCamera = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    isConnecting: false,
    connectError: false,
    autoConnectionStatus: '카메라 연결 준비중...'
  });

  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    editingState: '대기중',
    recordedPath: null,
    androidFileName: null,
    isTransferring: false,
    downloadCompleted: false,
    timeLeft: 20,
    progress: 0
  });

  // 디버그 로그
  const addDebugLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(`🐛 ${logMessage}`);
  }, []);

  // 상태 초기화
  const resetStates = useCallback(() => {
    addDebugLog('🔄 상태 완전 초기화');
    
    setConnectionState({
      isConnected: false,
      isConnecting: false,
      connectError: false,
      autoConnectionStatus: '카메라 연결 준비중...'
    });

    setRecordingState({
      isRecording: false,
      editingState: '대기중',
      recordedPath: null,
      androidFileName: null,
      isTransferring: false,
      downloadCompleted: false,
      timeLeft: 20,
      progress: 0
    });

    ipcRenderer.send('reset-connection-state');
  }, [addDebugLog]);

  // 연결 상태 업데이트
  const updateConnectionState = useCallback((updates: Partial<ConnectionState>) => {
    setConnectionState(prev => ({ ...prev, ...updates }));
  }, []);

  // 녹화 상태 업데이트
  const updateRecordingState = useCallback((updates: Partial<RecordingState>) => {
    setRecordingState(prev => ({ ...prev, ...updates }));
  }, []);

  // 편집 상태 업데이트
  const setEditingState = useCallback((state: EditingState) => {
    setRecordingState(prev => ({ ...prev, editingState: state }));
  }, []);

  // 카메라 연결
  const connectCamera = useCallback(() => {
    addDebugLog('🚀 카메라 연결 요청 - 상태 강제 초기화');
    
    updateConnectionState({
      isConnecting: true,
      connectError: false,
      isConnected: false,
      autoConnectionStatus: '카메라 연결 중...'
    });

    updateRecordingState({
      editingState: '대기중',
      recordedPath: null,
      androidFileName: null,
      downloadCompleted: false,
      isTransferring: false
    });

    ipcRenderer.send("camera-connect");
  }, [addDebugLog, updateConnectionState, updateRecordingState]);

  // 자동 재연결
  const autoReconnect = useCallback(() => {
    setEditingState('대기중');
    updateConnectionState({
      isConnecting: true,
      connectError: false,
      autoConnectionStatus: '카메라 자동 재연결 중...'
    });
    updateRecordingState({
      isTransferring: false
    });
    addDebugLog('🚀 자동 재연결 시도');
    ipcRenderer.invoke('reconnect-to-camera');
  }, [addDebugLog, setEditingState, updateConnectionState, updateRecordingState]);

  // 녹화 시작
  const startRecording = useCallback(() => {
    if (!connectionState.isConnected) {
      alert('카메라가 연결되지 않았습니다.');
      return;
    }

    addDebugLog('🎬 녹화 시작 요청 (20초 제한)');
    updateRecordingState({
      timeLeft: 20,
      progress: 0,
      isRecording: true,
      editingState: '촬영 중',
      downloadCompleted: false,
      isTransferring: false
    });

    ipcRenderer.send("camera-record-start");
  }, [connectionState.isConnected, addDebugLog, updateRecordingState]);

  // 녹화 중지
  const stopRecording = useCallback(() => {
    if (!recordingState.isRecording) return;

    addDebugLog('녹화 중지 요청');
    ipcRenderer.send("camera-record-stop");
  }, [recordingState.isRecording, addDebugLog]);

  // 재촬영
  const retakeVideo = useCallback(async () => {
    addDebugLog('재촬영 시작 - 상태 초기화');
    updateRecordingState({
      isRecording: false,
      editingState: '대기중',
      timeLeft: 20,
      progress: 0,
      downloadCompleted: false,
      isTransferring: false
    });

    // 로컬 PC 파일 삭제
    if (recordingState.recordedPath) {
      addDebugLog(`로컬 파일 삭제 요청: ${recordingState.recordedPath}`);
      try {
        const result = await ipcRenderer.invoke('clear-local-video', recordingState.recordedPath);
        if (result.success) {
          addDebugLog('로컬 파일 삭제 성공');
        } else {
          addDebugLog(`로컬 파일 삭제 실패: ${result.error}`);
        }
      } catch (error) {
        addDebugLog(`로컬 파일 삭제 IPC 오류: ${error}`);
      }
      
      setRecordingState(prev => ({ ...prev, recordedPath: null }));
    }

    // Android 원본 파일 삭제
    if (recordingState.androidFileName) {
      addDebugLog(`Android 파일 삭제 요청: ${recordingState.androidFileName}`);
      try {
        const result = await ipcRenderer.invoke('clear-android-video', recordingState.androidFileName);
        if (result.success) {
          addDebugLog('Android 파일 삭제 요청 성공');
        } else {
          addDebugLog(`Android 파일 삭제 요청 실패: ${result.error}`);
        }
      } catch (error) {
        addDebugLog(`Android 파일 삭제 IPC 오류: ${error}`);
      }
      
      setRecordingState(prev => ({ ...prev, androidFileName: null }));
    }
  }, [addDebugLog, recordingState.recordedPath, recordingState.androidFileName, updateRecordingState]);

  // 편집 시작
  const editVideo = useCallback(async () => {
    addDebugLog(`편집 요청 시도 - recordedPath: ${recordingState.recordedPath || 'null'}`);

    if (!recordingState.recordedPath) {
      addDebugLog('❌ 편집 실패: recordedPath가 null');
      return;
    }

    // 이미 편집 중인 경우 중복 실행 방지
    if (recordingState.editingState === '편집중') {
      addDebugLog('⚠️ 이미 편집 중 - 중복 실행 방지');
      return;
    }

    try {
      setEditingState('편집중');
      addDebugLog(`편집 시작: ${recordingState.recordedPath}`);

      const editResult = await ipcRenderer.invoke('edit-video', recordingState.recordedPath);

      if (editResult.success) {
        addDebugLog(`편집 완료: ${editResult.path}`);
        setEditingState('편집 완료');
        return editResult.path;
      } else {
        addDebugLog(`편집 실패: ${editResult.error}`);
        alert('영상 편집 실패: ' + editResult.error);
        setEditingState('촬영 완료');
        return null;
      }
    } catch (error) {
      addDebugLog(`편집 IPC 오류: ${error}`);
      setEditingState('촬영 완료');
      alert('알 수 없는 오류가 발생했습니다.');
      return null;
    }
  }, [recordingState.recordedPath, recordingState.editingState, addDebugLog, setEditingState]);

  return {
    // States
    connectionState,
    recordingState,
    
    // Actions
    resetStates,
    connectCamera,
    autoReconnect,
    startRecording,
    stopRecording,
    retakeVideo,
    editVideo,
    
    // State setters
    updateConnectionState,
    updateRecordingState,
    setEditingState,
    
    // Utils
    addDebugLog
  };
};