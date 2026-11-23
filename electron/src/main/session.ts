// 촬영 세션 오케스트레이터 (상태는 main 에서만 관리하고 renderer 는 구독만 한다)
//
// 타임라인 최적화:
//   녹화 종료 → (병렬 Range 전송) → 원본 저장 즉시 "백그라운드 선편집" 시작
//   → 사용자가 영상 확인 후 [완성] 을 누르는 순간 이미 편집이 끝나 있거나 거의 끝난 상태
//   → 업로드(R2, 사전 워밍된 연결 + 병렬 멀티파트) → QR 표시
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { SessionState } from '../shared/types';
import { CameraLink } from './camera';
import { config, isStorageConfigured } from './config';
import { mediaUrl } from './media';
import { timestamp, todayFolder } from './paths';
import * as storage from './storage';
import { AbortError, RECORD_SECONDS, SEGMENTS, renderEdit } from './video';

const MIN_CLIP_SECONDS = SEGMENTS[SEGMENTS.length - 1].end;

interface Shot {
  id: number;
  folder: string;
  rawPath: string | null;
  editedPath: string | null;
  androidName: string | null;
  recordStartedAt: number;
  recordEndedAt: number;
  render: Promise<void> | null;
  abort: AbortController;
  committed: boolean;
  tooShort: boolean;
  t: { savedAt?: number; recordEnd?: number };
}

const initialState = (): SessionState => ({
  camera: 'disconnected',
  cameraMessage: '',
  phase: 'idle',
  secondsLeft: 0,
  recordSeconds: RECORD_SECONDS,
  transferProgress: 0,
  renderProgress: 0,
  uploadProgress: 0,
  renderReady: false,
  rawUrl: null,
  editedUrl: null,
  shareUrl: null,
  error: null,
  timings: {},
});

export class Session extends EventEmitter {
  readonly camera = new CameraLink();
  private state: SessionState = initialState();
  private shot: Shot | null = null;
  private seq = 0;
  private timers: NodeJS.Timeout[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private getWindow: () => BrowserWindow | null) {
    super();
    const cfg = config();
    this.camera.setIp(cfg.get().cameraIp);
    cfg.on('change', (s) => this.camera.setIp(s.cameraIp));

    this.camera.on('status', (camera, cameraMessage) => this.set({ camera, cameraMessage }, true));
    this.camera.on('recording', (rec) => this.onRecording(rec));
    this.camera.on('saved', (name, size) => void this.onSaved(name, size));
    this.camera.on('failed', (err) => {
      if (this.shot && ['recording', 'transferring'].includes(this.state.phase)) {
        this.fail(`촬영 실패: ${err}`);
      }
    });
  }

  // ───────────────────────── 상태 전파 ─────────────────────────

  getState() {
    return this.state;
  }

  /** 진행률 업데이트는 66ms 단위로 묶어서 보내 IPC 부하를 줄인다 */
  private set(patch: Partial<SessionState>, immediate = false) {
    this.state = { ...this.state, ...patch };
    if (immediate || patch.phase) return this.flush();
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 66);
  }

  private flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    const win = this.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('session:state', this.state);
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms));
  }

  private isCurrent(shot: Shot | null): shot is Shot {
    return !!shot && shot === this.shot;
  }

  private fail(message: string) {
    this.clearTimers();
    this.set({ phase: 'error', error: message });
  }

  // ───────────────────────── 사용자 액션 ─────────────────────────

  connect() {
    this.camera.connect();
  }

  start() {
    if (!['idle', 'error', 'review'].includes(this.state.phase)) return;
    if (this.camera.status !== 'connected') {
      this.camera.connect();
      this.set({ error: '카메라가 연결되지 않았습니다' }, true);
      return;
    }
    this.discardShot();
    storage.warmup(); // 업로드 연결 미리 열기

    const shot: Shot = {
      id: ++this.seq,
      folder: todayFolder(),
      rawPath: null,
      editedPath: null,
      androidName: null,
      recordStartedAt: 0,
      recordEndedAt: 0,
      render: null,
      abort: new AbortController(),
      committed: false,
      tooShort: false,
      t: {},
    };
    this.shot = shot;
    this.state = { ...initialState(), camera: this.state.camera, cameraMessage: this.state.cameraMessage };

    const countdown = Math.max(0, Math.floor(config().get().countdownSeconds));
    if (countdown > 0) {
      this.set({ phase: 'countdown', secondsLeft: countdown });
      for (let i = 1; i <= countdown; i++) {
        this.later(i * 1000, () => {
          if (!this.isCurrent(shot)) return;
          if (i === countdown) this.beginRecording(shot);
          else this.set({ secondsLeft: countdown - i }, true);
        });
      }
    } else {
      this.beginRecording(shot);
    }
  }

  private beginRecording(shot: Shot) {
    const durationMs = RECORD_SECONDS * 1000;
    if (!this.camera.send('startRecording', { durationMs })) {
      return this.fail('카메라와 연결이 끊어졌습니다');
    }
    this.set({ phase: 'recording', secondsLeft: RECORD_SECONDS });
    // 카메라가 녹화 시작을 알려주지 않으면 실패 처리
    this.later(4000, () => {
      if (this.isCurrent(shot) && !shot.recordStartedAt) this.fail('카메라에서 녹화가 시작되지 않았습니다');
    });
  }

  private onRecording(isRecording: boolean) {
    const shot = this.shot;
    if (!shot) return;
    if (isRecording && this.state.phase === 'recording' && !shot.recordStartedAt) {
      shot.recordStartedAt = Date.now();
      for (let i = 1; i <= RECORD_SECONDS; i++) {
        this.later(i * 1000, () => this.isCurrent(shot) && this.set({ secondsLeft: RECORD_SECONDS - i }, true));
      }
      // 구버전 안드로이드 앱(자체 20초 타이머) 호환: PC 가 직접 정지 신호를 보낸다
      this.later(RECORD_SECONDS * 1000 + 300, () => {
        if (this.isCurrent(shot) && this.state.phase === 'recording') this.camera.send('stopRecording');
      });
    } else if (!isRecording && shot.recordStartedAt && !shot.recordEndedAt) {
      shot.recordEndedAt = Date.now();
      shot.t.recordEnd = shot.recordEndedAt;
      this.clearTimers();
      this.set({ phase: 'transferring', secondsLeft: 0, transferProgress: 0 });
      // 전송 시작 신호가 오지 않으면 실패 처리
      this.later(15000, () => {
        if (this.isCurrent(shot) && this.state.phase === 'transferring' && !shot.androidName) {
          this.fail('카메라에서 영상을 받지 못했습니다');
        }
      });
    }
  }

  stop() {
    if (this.state.phase === 'recording') this.camera.send('stopRecording');
    else if (this.state.phase === 'countdown') {
      this.discardShot();
      this.resetToIdle();
    }
  }

  private async onSaved(androidName: string, size: number) {
    const shot = this.shot;
    if (shot?.androidName === androidName) return; // 중복 이벤트
    if (!shot || shot.androidName || !['recording', 'transferring'].includes(this.state.phase)) {
      // 취소된 촬영(녹화 중 홈 이동 등)이 뒤늦게 저장됨 → 폰에 파일이 쌓이지 않도록 삭제
      console.log('[session] 취소된 촬영 파일 삭제 요청:', androidName);
      this.camera.send('deleteFile', { fileName: androidName });
      return;
    }
    shot.androidName = androidName;
    if (!shot.recordEndedAt) {
      shot.recordEndedAt = Date.now();
      shot.t.recordEnd = shot.recordEndedAt;
    }
    this.clearTimers();
    this.set({ phase: 'transferring', transferProgress: 0 });

    const dir = path.join(config().get().saveDir, shot.folder);
    const safeName = path.basename(androidName).replace(/[^\w.\-]/g, '_') || `VIDEO_${timestamp()}.mp4`;
    const rawPath = path.join(dir, safeName);
    const t0 = Date.now();
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      await this.camera.download(androidName, rawPath, size, (p) => {
        if (this.isCurrent(shot)) this.set({ transferProgress: p });
      });
    } catch (e: any) {
      if (this.isCurrent(shot)) this.fail(`영상 전송 실패: ${e.message}`);
      return;
    }
    this.camera.send('deleteFile', { fileName: androidName });
    if (!this.isCurrent(shot)) {
      await fs.promises.rm(rawPath, { force: true });
      return;
    }
    shot.rawPath = rawPath;
    shot.t.savedAt = Date.now();

    const clipSeconds = (shot.recordEndedAt - shot.recordStartedAt) / 1000;
    const tooShort = shot.recordStartedAt > 0 && clipSeconds < MIN_CLIP_SECONDS;
    shot.tooShort = tooShort;
    this.set({
      phase: 'review',
      transferProgress: 1,
      rawUrl: mediaUrl(rawPath),
      error: tooShort ? `촬영 시간이 너무 짧습니다 (${clipSeconds.toFixed(1)}초). 재촬영해 주세요.` : null,
      timings: { transfer: Date.now() - t0 },
    });
    if (!tooShort) this.startRender(shot);
  }

  private startRender(shot: Shot) {
    if (!shot.rawPath) return;
    const parsed = path.parse(shot.rawPath);
    const edited = path.join(parsed.dir, `edited_${parsed.name}.mp4`);
    shot.render = renderEdit({
      input: shot.rawPath,
      output: edited,
      signal: shot.abort.signal,
      onProgress: (p) => this.isCurrent(shot) && this.set({ renderProgress: p }),
    }).then(({ encoder, ms }) => {
      console.log(`[session] 편집 완료 ${ms}ms (${encoder})`);
      shot.editedPath = edited;
      if (this.isCurrent(shot)) {
        this.set({
          renderReady: true,
          renderProgress: 1,
          editedUrl: mediaUrl(edited),
          timings: { ...this.state.timings, render: ms },
        });
      }
    });
    shot.render.catch((e) => {
      if (!(e instanceof AbortError)) console.error('[session] 편집 실패', e);
    });
  }

  retake() {
    if (!['review', 'error'].includes(this.state.phase)) return;
    this.discardShot();
    this.resetToIdle();
  }

  async commit() {
    const shot = this.shot;
    if (!shot?.rawPath || shot.tooShort || !['review', 'error'].includes(this.state.phase)) {
      return;
    }
    if (!isStorageConfigured()) {
      this.set({ error: 'R2 저장소가 설정되지 않았습니다. 관리자 설정을 확인하세요.' }, true);
      return;
    }
    shot.committed = true;
    this.set({ phase: 'processing', error: null, uploadProgress: 0 });
    const t0 = Date.now();

    try {
      if (!shot.render) this.startRender(shot);
      await shot.render;
      if (!shot.editedPath) throw new Error('편집 결과가 없습니다');

      const key = storage.makeObjectKey(shot.folder);
      const tUp = Date.now();
      await storage.uploadFile(shot.editedPath, key, (p) => this.isCurrent(shot) && this.set({ uploadProgress: p }));
      const shareUrl = await storage.shareUrlFor(key);
      await writeMeta(shot.editedPath, { key, url: shareUrl, uploadedAt: Date.now() });

      if (!this.isCurrent(shot)) return;
      const total = shot.t.recordEnd ? Date.now() - shot.t.recordEnd : Date.now() - t0;
      this.set({
        phase: 'done',
        shareUrl,
        uploadProgress: 1,
        timings: { ...this.state.timings, upload: Date.now() - tUp, total },
      });
      console.log('[session] 완료', this.state.timings);
    } catch (e: any) {
      if (e instanceof AbortError) return;
      console.error('[session] 처리 실패', e);
      shot.committed = false; // 재촬영 시 파일 정리 대상이 되도록
      shot.render = shot.editedPath ? Promise.resolve() : null;
      if (this.isCurrent(shot)) this.fail(`처리 실패: ${e.message ?? e}`);
    }
  }

  /** 홈으로 돌아갈 때. 이미 확정(업로드 중)된 촬영은 백그라운드에서 마저 진행한다. */
  reset() {
    if (this.shot && !this.shot.committed) this.discardShot();
    this.shot = null;
    this.resetToIdle();
  }

  private resetToIdle() {
    this.clearTimers();
    this.state = { ...initialState(), camera: this.state.camera, cameraMessage: this.state.cameraMessage };
    this.flush();
  }

  /** 확정되지 않은 촬영의 편집 작업 중단 + 로컬/안드로이드 파일 정리 */
  private discardShot() {
    const shot = this.shot;
    if (!shot || shot.committed) return;
    this.shot = null;
    shot.abort.abort();
    // 녹화 중이었다면 폰 녹화도 즉시 중지 (저장된 파일은 onSaved 에서 삭제 요청)
    if (this.state.phase === 'recording') this.camera.send('stopRecording');
    if (shot.androidName && !shot.rawPath) this.camera.send('deleteFile', { fileName: shot.androidName });
    const files = [shot.rawPath, shot.editedPath].filter(Boolean) as string[];
    const cleanup = async () => {
      await shot.render?.catch(() => undefined);
      await Promise.all(files.map((f) => fs.promises.rm(f, { force: true })));
    };
    void cleanup();
  }
}

// ───────────────────────── 메타데이터 ─────────────────────────

export interface VideoMeta {
  key: string;
  url: string;
  uploadedAt: number;
}

export function metaPath(video: string) {
  return path.join(path.dirname(video), '.meta', path.basename(video) + '.json');
}

export async function writeMeta(video: string, meta: VideoMeta) {
  const file = metaPath(video);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, JSON.stringify(meta));
}

export async function readMeta(video: string): Promise<VideoMeta | null> {
  try {
    return JSON.parse(await fs.promises.readFile(metaPath(video), 'utf8'));
  } catch {
    return null;
  }
}
