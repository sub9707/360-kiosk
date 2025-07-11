export interface CameraConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  connectError: boolean;
}

export interface RecordingState {
  isRecording: boolean;
  editingState: '편집 시작' | '촬영 완료' | '편집중' | '편집 완료' | '촬영 실패';
  recordedPath: string | null;
  timeLeft: number;
  progress: number;
}

export interface IPCResult {
  success: boolean;
  error?: string;
  path?: string;
  deleted?: number;
}