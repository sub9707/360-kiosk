// src/renderer/hooks/useRecordingTimer.ts

import { useEffect } from 'react';

const { ipcRenderer } = window.require("electron");

interface UseRecordingTimerProps {
  isRecording: boolean;
  timeLeft: number;
  onTimeUpdate: (timeLeft: number, progress: number) => void;
  onTimeEnd: () => void;
  addDebugLog: (message: string) => void;
}

export const useRecordingTimer = ({
  isRecording,
  timeLeft,
  onTimeUpdate,
  onTimeEnd,
  addDebugLog
}: UseRecordingTimerProps) => {
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isRecording && timeLeft > 0) {
      interval = setInterval(() => {
        onTimeUpdate(timeLeft - 1, ((20 - (timeLeft - 1)) / 20) * 100);
        
        if (timeLeft - 1 <= 0) {
          addDebugLog('🎬 촬영 시간 초과 (렌더러 타이머 - 20초 완료)');
          addDebugLog('📤 Android에 녹화 중지 명령 전송');

          // 20초 완료 시 실제로 Android에 녹화 중지 명령 전송
          ipcRenderer.send("camera-record-stop");

          onTimeEnd();
          addDebugLog('⏰ 타이머 완료 - camera-record-complete 이벤트를 대기합니다');

          if (interval) clearInterval(interval);
        }
      }, 1000);
    } else if (!isRecording && interval) {
      clearInterval(interval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, timeLeft, onTimeUpdate, onTimeEnd, addDebugLog]);
};