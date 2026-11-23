// main / preload / renderer 가 공유하는 타입 정의

export type EncoderId = 'libx264' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf';
export type EncoderSetting = 'auto' | EncoderId;
export type EncodePreset = 'fast' | 'balanced' | 'quality';
export type LinkMode = 'public' | 'presigned';

export interface R2Settings {
  accountId: string;
  accessKeyId: string;
  /** renderer 로는 마스킹된 값만 전달된다. */
  secretAccessKey: string;
  bucket: string;
  /** 공개 버킷 도메인 (예: https://video.example.com 또는 https://pub-xxx.r2.dev) */
  publicBaseUrl: string;
  keyPrefix: string;
  linkMode: LinkMode;
}

export interface Settings {
  cameraIp: string;
  saveDir: string;
  showCopyright: boolean;
  /** 촬영 전 카운트다운(초). 0이면 사용 안 함 */
  countdownSeconds: number;
  encoder: EncoderSetting;
  encodePreset: EncodePreset;
  r2: R2Settings;
}

export type SettingsPatch = Partial<Omit<Settings, 'r2'>> & { r2?: Partial<R2Settings> };

export interface AppInfo {
  version: string;
  activeEncoder: EncoderId | null;
  recordSeconds: number;
  storageConfigured: boolean;
}

// ───────────────────────── Session ─────────────────────────

export type CameraStatus = 'disconnected' | 'connecting' | 'connected';

export type SessionPhase =
  | 'idle' // 촬영 대기
  | 'countdown'
  | 'recording'
  | 'transferring' // 안드로이드 → PC 전송
  | 'review' // 촬영 완료, 재촬영/완성 선택
  | 'processing' // 사용자가 완성을 눌렀고 편집·업로드 진행 중
  | 'done'
  | 'error';

export interface SessionState {
  camera: CameraStatus;
  cameraMessage: string;
  phase: SessionPhase;
  /** countdown / recording 의 남은 초 */
  secondsLeft: number;
  recordSeconds: number;
  /** 0~1 */
  transferProgress: number;
  renderProgress: number;
  uploadProgress: number;
  renderReady: boolean;
  /** 원본 영상(로컬) 미리보기 URL */
  rawUrl: string | null;
  /** 편집본(로컬) 재생 URL */
  editedUrl: string | null;
  /** QR 에 들어갈 공유 URL — 업로드 완료 후 채워짐 */
  shareUrl: string | null;
  error: string | null;
  timings: Partial<Record<'transfer' | 'render' | 'upload' | 'total', number>>;
}

// ───────────────────────── Library ─────────────────────────

export interface LibraryFolder {
  name: string;
  count: number;
}

export interface LibraryVideo {
  name: string;
  folder: string;
  url: string;
  thumbUrl: string;
  size: number;
  mtime: number;
  remoteKey: string | null;
}

export interface Result<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ───────────────────────── Bridge API ─────────────────────────

// ───────────────────────── Network test ─────────────────────────

export type NetGrade = 'concern' | 'recommended' | 'best';

export interface NetCheck {
  id: 'link' | 'lanLatency' | 'lanThroughput' | 'r2Latency' | 'r2Upload';
  label: string;
  /** 측정값 표시 문자열 (예: "182 Mbps") */
  value: string;
  /** 체감 지표 (예: "원본 전송 약 1.3초") */
  estimate?: string;
  /** 측정 불가/건너뜀이면 null */
  grade: NetGrade | null;
  /** 우려 시 조치 안내 또는 건너뛴 이유 */
  note?: string;
}

export interface NetTestResult {
  /** 저장된 설정의 입력값 문제 (비어 있거나 형식 오류) */
  inputErrors: string[];
  checks: NetCheck[];
  overall: NetGrade | null;
  finishedAt: number;
}

export interface SettingsImport {
  file: string;
  patch: SettingsPatch;
  /** 인식된 항목(표시용 이름) */
  fields: string[];
  /** 알 수 없는 키 */
  unknown: string[];
  /** 값 형식이 잘못된 줄 */
  invalid: string[];
}

export interface KioskApi {
  settings: {
    get(): Promise<Settings>;
    /** 파일 선택 → 파싱 결과 반환 (저장하지 않음). 취소 시 null */
    importFile(): Promise<Result<SettingsImport> | null>;
    /** 현재 값으로 양식 파일 저장. 저장 경로 또는 null */
    exportTemplate(): Promise<string | null>;
    update(patch: SettingsPatch): Promise<Settings>;
    pickSaveDir(): Promise<string | null>;
    testStorage(): Promise<Result<{ latencyMs: number }>>;
    info(): Promise<AppInfo>;
    redetectEncoder(): Promise<EncoderId>;
  };
  session: {
    get(): Promise<SessionState>;
    connect(): void;
    start(): void;
    stop(): void;
    retake(): void;
    commit(): void;
    reset(): void;
    onState(cb: (s: SessionState) => void): () => void;
  };
  network: {
    /** 전체 네트워크 테스트 실행 (약 10~20초) */
    test(): Promise<NetTestResult>;
    /** 진행 중인 단계 이름 구독 */
    onProgress(cb: (step: string) => void): () => void;
  };
  library: {
    folders(): Promise<LibraryFolder[]>;
    videos(folder: string): Promise<LibraryVideo[]>;
    remove(folder: string, name: string, alsoRemote: boolean): Promise<Result>;
    /** QR 용 공유 링크 (upload=true 면 미업로드 영상을 지금 업로드) */
    share(folder: string, name: string, upload: boolean): Promise<Result<string>>;
    openFolder(folder?: string): void;
  };
  app: {
    quit(): void;
  };
}
