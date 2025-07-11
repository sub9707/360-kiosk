// src/renderer/hooks/useIPCListeners.ts

import { useEffect } from 'react';
import { ConnectionState, RecordingState, EditingState } from '../types';

const { ipcRenderer } = window.require("electron");

interface UseIPCListenersProps {
  updateConnectionState: (updates: Partial<ConnectionState>) => void;
  updateRecordingState: (updates: Partial<RecordingState>) => void;
  setEditingState: (state: EditingState) => void;
  editingState: EditingState;
  addDebugLog: (message: string) => void;
}

export const useIPCListeners = ({
  updateConnectionState,
  updateRecordingState,
  setEditingState,
  editingState,
  addDebugLog
}: UseIPCListenersProps) => {
  useEffect(() => {
    ipcRenderer.send('set-main-window');

    // 카메라 연결 응답 처리
    const handleCameraConnectReply = (_event: any, success: boolean, errorMessage?: string) => {
      addDebugLog(`🚀 자동 연결 응답: ${success ? '성공' : '실패'} ${errorMessage || ''}`);

      // 이미 촬영이 완료된 상태에서는 UI 상태를 변경하지 않음
      if (editingState === '촬영 완료' || editingState === '편집중' || editingState === '편집 완료') {
        addDebugLog('🔒 촬영 완료 상태 보존 - UI 상태 변경 안함');
        updateConnectionState({ isConnecting: false });
        if (success) {
          updateConnectionState({
            isConnected: true,
            connectError: false,
            autoConnectionStatus: 'PC와 연결됨'
          });
        } else {
          updateConnectionState({
            isConnected: false,
            connectError: true,
            autoConnectionStatus: `연결 실패: ${errorMessage || '알 수 없는 오류'}`
          });
        }
        return;
      }

      updateConnectionState({ isConnecting: false });
      if (success) {
        updateConnectionState({
          isConnected: true,
          connectError: false,
          autoConnectionStatus: 'PC와 연결됨'
        });
        setEditingState('대기중');
        addDebugLog('✅ 카메라 자동 연결 성공');
      } else {
        updateConnectionState({
          isConnected: false,
          connectError: true,
          autoConnectionStatus: `자동 연결 실패: ${errorMessage || '알 수 없는 오류'}`
        });
        addDebugLog(`❌ 카메라 자동 연결 실패: ${errorMessage || '알 수 없는 오류'}`);
      }
    };

    // 녹화 시작 응답 처리
    const handleRecordStartReply = (_event: any, data: { status: string, error?: string }) => {
      addDebugLog(`녹화 시작 응답: ${JSON.stringify(data)}`);
      if (data.status === "started") {
        updateRecordingState({
          isRecording: true,
          timeLeft: 20,
          progress: 0,
          isTransferring: false
        });
        setEditingState('촬영 중');
        addDebugLog('🎬 녹화 시작됨 - 20초 타이머 가동');
      } else {
        updateRecordingState({
          isRecording: false,
          isTransferring: false
        });
        setEditingState('촬영 실패');
        alert(`녹화 시작 실패: ${data.error || '알 수 없는 오류'}`);
      }
    };

    // video-saved 이벤트 리스너 (전송 시작 신호로 활용)
    const handleVideoSaved = (_event: any, data: any) => {
      addDebugLog(`🎬 Android에서 video-saved 이벤트 수신: ${JSON.stringify(data)}`);
      // Android에서 영상 저장 완료 신호를 받으면 전송 시작 상태로 변경
      updateRecordingState({ isTransferring: true });
      setEditingState('영상 전송중');
      addDebugLog('📤 Android 영상 저장 완료 - PC로 전송 시작');
    };

    // Android 녹화 상태 변경 리스너
    const handleCameraRecordingStatus = (_event: any, data: any) => {
      addDebugLog(`📹 Android 녹화 상태 변경: ${JSON.stringify(data)}`);

      // Android에서 녹화 중지 신호를 받으면 전송 대기 상태로 변경
      if (data && data.isRecording === false) {
        addDebugLog('📹 Android 녹화 중지 감지 - 영상 전송 대기 상태로 변경');
        updateRecordingState({
          isRecording: false,
          isTransferring: true
        });
        setEditingState('영상 전송 대기');
      }
    };

    // 녹화 완료 응답 처리 (중복 방지 강화)
    let recordCompleteProcessed = false;

    const handleRecordComplete = (_event: any, result: { success: boolean, path?: string, androidPath?: string, error?: string }) => {
      addDebugLog(`🎬 녹화 완료 응답: ${JSON.stringify(result)}`);

      // 이미 처리된 경우 또는 촬영 완료 상태라면 중복 처리하지 않음
      if (recordCompleteProcessed || editingState === '촬영 완료' || editingState === '편집중' || editingState === '편집 완료') {
        addDebugLog('⚠️ 이미 처리됨 또는 촬영 완료 상태 - 중복 camera-record-complete 이벤트 무시');
        return;
      }

      recordCompleteProcessed = true;

      updateRecordingState({
        isRecording: false,
        isTransferring: false,
        timeLeft: 20,
        progress: 0
      });

      if (result.success && result.path) {
        addDebugLog(`✅ PC 저장 성공! 경로: ${result.path}`);
        setEditingState('촬영 완료');
        updateRecordingState({
          recordedPath: result.path,
          androidFileName: result.androidPath || null,
          downloadCompleted: true
        });
      } else {
        addDebugLog(`❌ 촬영/저장 실패: ${result.error}`);
        setEditingState('촬영 실패');
        updateRecordingState({
          recordedPath: null,
          androidFileName: null,
          downloadCompleted: false
        });
      }

      // 5초 후 플래그 리셋 (다음 촬영을 위해)
      setTimeout(() => {
        recordCompleteProcessed = false;
        addDebugLog('🔄 녹화 완료 처리 플래그 리셋');
      }, 5000);
    };

    // IPC 이벤트 리스너 등록
    ipcRenderer.on("camera-connect-reply", handleCameraConnectReply);
    ipcRenderer.on("camera-record-start-reply", handleRecordStartReply);
    ipcRenderer.on("camera-record-complete", handleRecordComplete);
    ipcRenderer.on("video-saved", handleVideoSaved);
    ipcRenderer.on("camera-recording-status", handleCameraRecordingStatus);

    return () => {
      ipcRenderer.removeListener("camera-connect-reply", handleCameraConnectReply);
      ipcRenderer.removeListener("camera-record-start-reply", handleRecordStartReply);
      ipcRenderer.removeListener("camera-record-complete", handleRecordComplete);
      ipcRenderer.removeListener("video-saved", handleVideoSaved);
      ipcRenderer.removeListener("camera-recording-status", handleCameraRecordingStatus);
    };
  }, [updateConnectionState, updateRecordingState, setEditingState, editingState, addDebugLog]);
};