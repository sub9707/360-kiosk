
export interface VideoData {
  path: string;
  fileName: string;
  type: 'edited' | 'raw' | 'loading' | 'error';
}

export interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  connectError: boolean;
  autoConnectionStatus: string;
}

export interface RecordingState {
  isRecording: boolean;
  editingState: EditingState;
  recordedPath: string | null;
  androidFileName: string | null;
  isTransferring: boolean;
  downloadCompleted: boolean;
  timeLeft: number;
  progress: number;
}

export type EditingState = 
  | '대기중'
  | '촬영 중'
  | '촬영 완료'
  | '편집중'
  | '편집 완료'
  | '촬영 실패'
  | '영상 전송 대기'
  | '영상 전송중';

export interface UploadResult {
  success: boolean;
  videoUrl?: string;
  qrPath?: string;
  error?: string;
}

export interface IpcResult {
  success: boolean;
  path?: string;
  error?: string;
  androidPath?: string;
}

export interface QRState {
  qrImageSrc: string;
  qrLink: string;
}

export interface EnvConfig {
  copyright: boolean;
}