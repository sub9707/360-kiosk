// 안드로이드 촬영 앱 연결 (WebSocket 제어 + HTTP 파일 전송)
//
// - 연결이 끊기면 백오프(1s→5s)로 계속 자동 재연결한다. (수동 재연결 버튼 불필요)
// - 5초 주기 ping, 12초 무응답 시 연결을 끊고 재연결해 "좀비 연결"을 방지한다.
// - 녹화 파일은 Range 요청 4개를 병렬로 받아 Wi-Fi 대역폭을 최대한 활용한다.
//   (Range 를 지원하지 않는 구버전 앱이면 단일 스트림으로 자동 전환)
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import WebSocket from 'ws';
import type { CameraStatus } from '../shared/types';

const WS_PORT = 8080;
const HTTP_PORT = 8081;
const CONNECT_TIMEOUT = 3000;
const PING_INTERVAL = 5000;
const PONG_TIMEOUT = 12000;

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 8 });

export interface CameraEvents {
  status: (status: CameraStatus, message: string) => void;
  recording: (isRecording: boolean) => void;
  saved: (fileName: string, fileSize: number) => void;
  failed: (error: string) => void;
}

export declare interface CameraLink {
  on<E extends keyof CameraEvents>(event: E, listener: CameraEvents[E]): this;
  emit<E extends keyof CameraEvents>(event: E, ...args: Parameters<CameraEvents[E]>): boolean;
}

export class CameraLink extends EventEmitter {
  private ws: WebSocket | null = null;
  private ip = '';
  private wanted = false;
  private retry = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private lastPong = 0;
  status: CameraStatus = 'disconnected';

  setIp(ip: string) {
    if (ip === this.ip) return;
    this.ip = ip;
    if (this.wanted) this.reconnectNow();
  }

  /** 연결 유지 시작 (이미 연결되어 있으면 아무 것도 하지 않음) */
  connect() {
    this.wanted = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      if (this.status === 'connected') this.emit('status', 'connected', '카메라 연결됨');
      return;
    }
    this.open();
  }

  reconnectNow() {
    this.retry = 0;
    this.teardown();
    if (this.wanted) this.open();
  }

  disconnect() {
    this.wanted = false;
    this.teardown();
    this.setStatus('disconnected', '연결 해제');
  }

  send(channel: string, payload: Record<string, unknown> = {}): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ channel, payload }));
    return true;
  }

  get baseUrl() {
    return `http://${this.ip}:${HTTP_PORT}`;
  }

  private setStatus(s: CameraStatus, msg: string) {
    this.status = s;
    this.emit('status', s, msg);
  }

  private teardown() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = this.pingTimer = null;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.on('error', () => undefined);
      this.ws.terminate();
      this.ws = null;
    }
  }

  private scheduleRetry() {
    if (!this.wanted || this.retryTimer) return;
    const delay = Math.min(5000, 1000 * 2 ** Math.min(this.retry, 3));
    this.retry++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, delay);
  }

  private open() {
    this.teardown();
    if (!this.ip) {
      this.setStatus('disconnected', '카메라 IP가 설정되지 않았습니다');
      return;
    }
    this.setStatus('connecting', this.retry ? `재연결 시도 중 (${this.retry})` : '카메라 연결 중');
    const ws = new WebSocket(`ws://${this.ip}:${WS_PORT}`, {
      handshakeTimeout: CONNECT_TIMEOUT,
      perMessageDeflate: false,
    });
    this.ws = ws;

    ws.on('open', () => {
      this.retry = 0;
      this.lastPong = Date.now();
      this.setStatus('connected', '카메라 연결됨');
      this.pingTimer = setInterval(() => {
        if (Date.now() - this.lastPong > PONG_TIMEOUT) {
          console.warn('[camera] pong 시간 초과 → 재연결');
          this.teardown();
          this.setStatus('connecting', '카메라 응답 없음 · 재연결 중');
          this.scheduleRetry();
          return;
        }
        this.send('ping', { t: Date.now() });
      }, PING_INTERVAL);
    });

    ws.on('message', (raw) => {
      this.lastPong = Date.now(); // 어떤 메시지든 생존 신호로 취급
      let msg: { eventName?: string; data?: any };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const data = msg.data ?? {};
      switch (msg.eventName) {
        case 'camera-recording-status':
          this.emit('recording', !!data.isRecording);
          break;
        case 'video-saved':
          if (data.success === false || !data.fileName) {
            this.emit('failed', data.error || '녹화 파일 저장 실패');
          } else {
            this.emit('saved', String(data.fileName), Number(data.fileSize) || 0);
          }
          break;
        case 'camera-connect-reply':
          if (data.success === false) this.setStatus('disconnected', `연결 거부: ${data.message ?? ''}`);
          break;
      }
    });

    ws.on('error', (err) => {
      console.warn('[camera] ws error:', err.message);
    });

    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.wanted) {
        this.setStatus('connecting', '카메라 재연결 중');
        this.scheduleRetry();
      } else {
        this.setStatus('disconnected', '연결 해제');
      }
    });
  }

  // ───────────────────────── 파일 전송 ─────────────────────────

  async download(
    fileName: string,
    dest: string,
    expectedSize: number,
    onProgress?: (ratio: number) => void,
  ): Promise<void> {
    const url = `${this.baseUrl}/video/${encodeURIComponent(fileName)}`;
    const tmp = dest + '.part';
    try {
      if (expectedSize > 4 * 1024 * 1024) {
        const ok = await parallelDownload(url, tmp, expectedSize, 4, onProgress);
        if (!ok) await streamDownload(url, tmp, expectedSize, onProgress);
      } else {
        await streamDownload(url, tmp, expectedSize, onProgress);
      }
      await fs.promises.rename(tmp, dest);
    } catch (e) {
      await fs.promises.rm(tmp, { force: true });
      throw e;
    }
  }
}

function get(url: string, headers: Record<string, string> = {}): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent: httpAgent, headers, timeout: 15000 }, resolve);
    req.on('timeout', () => req.destroy(new Error('전송 시간 초과')));
    req.on('error', reject);
  });
}

async function streamDownload(url: string, dest: string, size: number, onProgress?: (r: number) => void) {
  const res = await get(url);
  if (res.statusCode !== 200) {
    res.resume();
    throw new Error(`다운로드 실패 (HTTP ${res.statusCode})`);
  }
  const total = Number(res.headers['content-length']) || size;
  let loaded = 0;
  res.on('data', (c: Buffer) => {
    loaded += c.length;
    if (total) onProgress?.(loaded / total);
  });
  const out = fs.createWriteStream(dest, { highWaterMark: 1024 * 1024 });
  await new Promise<void>((resolve, reject) => {
    res.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    res.on('error', reject);
    res.on('aborted', () => reject(new Error('전송이 중단되었습니다')));
  });
  if (size && loaded !== size) throw new Error(`파일 크기 불일치 (${loaded}/${size})`);
}

/** Range 를 지원하지 않으면 false 를 반환 (호출측에서 단일 스트림으로 폴백) */
async function parallelDownload(
  url: string,
  dest: string,
  size: number,
  parts: number,
  onProgress?: (r: number) => void,
): Promise<boolean> {
  const chunk = Math.ceil(size / parts);
  const ranges = Array.from({ length: parts }, (_, i) => [i * chunk, Math.min(size, (i + 1) * chunk) - 1]);

  // 첫 구간으로 Range 지원 여부 확인
  const first = await get(url, { Range: `bytes=${ranges[0][0]}-${ranges[0][1]}` });
  if (first.statusCode !== 206) {
    first.destroy();
    return false;
  }

  const fh = await fs.promises.open(dest, 'w');
  let loaded = 0;
  try {
    await fh.truncate(size);
    const pump = async (res: http.IncomingMessage, start: number) => {
      let pos = start;
      for await (const c of res as AsyncIterable<Buffer>) {
        await fh.write(c, 0, c.length, pos);
        pos += c.length;
        loaded += c.length;
        onProgress?.(loaded / size);
      }
    };
    await Promise.all(
      ranges.map(async ([a, b], i) => {
        const res = i === 0 ? first : await get(url, { Range: `bytes=${a}-${b}` });
        if (res.statusCode !== 206) {
          res.resume();
          throw new Error(`구간 다운로드 실패 (HTTP ${res.statusCode})`);
        }
        await pump(res, a);
      }),
    );
  } finally {
    await fh.close();
  }
  if (loaded !== size) throw new Error(`파일 크기 불일치 (${loaded}/${size})`);
  return true;
}
