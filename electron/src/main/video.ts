// FFmpeg 기반 영상 처리
//
// 기존: (1) 원본 전체를 스케일 → 배속 편집 → medium 인코딩 → 임시 파일
//       (2) 임시 파일 디코드 + 인트로/아웃트로 합성 → medium 재인코딩
// 개선: 필요한 구간만 입력 단계에서 시킹(-ss/-t)해 디코드하고, 배속·합성·BGM 을
//       하나의 filter graph 로 처리해 "단일 패스" 로 인코딩한다.
//       인코더는 PC 에서 사용 가능한 것 중 가장 빠른 것을 벤치마크로 자동 선택한다.
import { app } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EncodePreset, EncoderId } from '../shared/types';
import { config } from './config';
import { paths } from './paths';

// ───────────────────────── 편집 구성 ─────────────────────────

/** 원본 기준 구간과 재생 속도 (speed 0.5 = 2배 슬로모션) */
export const SEGMENTS = [
  { start: 2.5, end: 6.5, speed: 0.5 },
  { start: 6.5, end: 8.5, speed: 1 },
  { start: 8.5, end: 12.5, speed: 0.5 },
  { start: 12.5, end: 17.5, speed: 1 },
] as const;

const WINDOW_START = SEGMENTS[0].start;
const WINDOW_END = SEGMENTS[SEGMENTS.length - 1].end;
const MAIN_DURATION = SEGMENTS.reduce((t, s) => t + (s.end - s.start) / s.speed, 0);

/** 편집에 필요한 최소 녹화 길이(+여유 0.5초). 기존 20초 → 18초로 단축 */
export const RECORD_SECONDS = Math.ceil(WINDOW_END + 0.5);

const OUT_W = 1080;
const OUT_H = 1920;
const FPS = 30;
const MAX_RATE = '8M';

// ───────────────────────── 프로세스 실행 ─────────────────────────

interface RunOptions {
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  timeoutMs?: number;
}

export class AbortError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortError';
  }
}

function runFfmpeg(args: string[], opts: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new AbortError());
    const proc = spawn(paths.ffmpeg(), ['-hide_banner', '-nostdin', '-y', ...args], {
      windowsHide: true,
    });
    let stderr = '';
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (d: string) => {
      stderr = (stderr + d).slice(-8000);
    });
    if (opts.onStdout) {
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', opts.onStdout);
    } else {
      proc.stdout.resume();
    }
    const onAbort = () => proc.kill('SIGKILL');
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = opts.timeoutMs ? setTimeout(() => proc.kill('SIGKILL'), opts.timeoutMs) : null;

    proc.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.signal?.aborted) return reject(new AbortError());
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg 종료 코드 ${code}\n${stderr.split('\n').slice(-6).join('\n')}`));
    });
  });
}

// ───────────────────────── 미디어 정보 ─────────────────────────

const durationCache = new Map<string, number>();

async function probeDuration(file: string): Promise<number> {
  const stat = fs.statSync(file);
  const key = `${file}|${stat.size}|${stat.mtimeMs}`;
  const hit = durationCache.get(key);
  if (hit) return hit;
  // ffmpeg -i 는 출력 지정이 없으므로 항상 실패 코드로 끝난다 → stderr 만 파싱
  const stderr = await new Promise<string>((resolve) => {
    const p = spawn(paths.ffmpeg(), ['-hide_banner', '-i', file], { windowsHide: true });
    let out = '';
    p.stderr.on('data', (d) => (out += d));
    p.on('close', () => resolve(out));
    p.on('error', () => resolve(out));
  });
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`길이를 확인할 수 없습니다: ${path.basename(file)}`);
  const sec = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
  durationCache.set(key, sec);
  return sec;
}

// ───────────────────────── 인코더 ─────────────────────────

function encoderArgs(enc: EncoderId, preset: EncodePreset): string[] {
  switch (enc) {
    case 'h264_nvenc':
      return [
        '-c:v', 'h264_nvenc',
        '-preset', { fast: 'p2', balanced: 'p4', quality: 'p6' }[preset],
        '-tune', 'hq', '-rc', 'vbr', '-cq', '23', '-b:v', '0',
        '-maxrate', MAX_RATE, '-bufsize', '12M', '-profile:v', 'high',
      ];
    case 'h264_qsv':
      return [
        '-c:v', 'h264_qsv',
        '-preset', { fast: 'veryfast', balanced: 'medium', quality: 'slower' }[preset],
        '-global_quality', '23', '-look_ahead', '0', '-profile:v', 'high',
      ];
    case 'h264_amf':
      return [
        '-c:v', 'h264_amf',
        '-quality', { fast: 'speed', balanced: 'balanced', quality: 'quality' }[preset],
        '-rc', 'vbr_peak', '-b:v', '6M', '-maxrate', MAX_RATE, '-profile:v', 'high',
      ];
    default:
      return [
        '-c:v', 'libx264',
        '-preset', { fast: 'veryfast', balanced: 'faster', quality: 'medium' }[preset],
        '-crf', preset === 'fast' ? '21' : '20',
        '-maxrate', MAX_RATE, '-bufsize', '12M', '-profile:v', 'high',
      ];
  }
}

const HW_CANDIDATES: EncoderId[] = ['h264_nvenc', 'h264_qsv', 'h264_amf'];

async function machineKey(): Promise<string> {
  let gpu = '';
  try {
    const info: any = await app.getGPUInfo('basic');
    gpu = (info?.gpuDevice ?? [])
      .map((d: any) => `${d.vendorId}:${d.deviceId}`)
      .join(',');
  } catch {
    /* noop */
  }
  const ffStat = fs.existsSync(paths.ffmpeg()) ? fs.statSync(paths.ffmpeg()).size : 0;
  return `${os.cpus()[0]?.model}|${os.cpus().length}|${gpu}|${ffStat}`;
}

/** 실제 출력 해상도로 짧게 인코딩해 보고, 가장 빠른 인코더를 고른다. */
async function benchmarkEncoders(): Promise<EncoderId> {
  const listing = await runFfmpeg(['-encoders']).catch(() => '');
  const available = HW_CANDIDATES.filter((e) => listing.includes(e));
  const candidates: EncoderId[] = ['libx264', ...available];
  let best: { enc: EncoderId; ms: number } | null = null;

  for (const enc of candidates) {
    const t0 = Date.now();
    try {
      await runFfmpeg(
        [
          '-f', 'lavfi', '-i', `testsrc2=size=${OUT_W}x${OUT_H}:rate=${FPS}:duration=3`,
          '-pix_fmt', 'yuv420p',
          ...encoderArgs(enc, 'fast'),
          '-f', 'null', '-',
        ],
        { timeoutMs: 20000 },
      );
      const ms = Date.now() - t0;
      console.log(`[video] encoder ${enc}: ${ms}ms`);
      if (!best || ms < best.ms) best = { enc, ms };
    } catch {
      console.log(`[video] encoder ${enc}: 사용 불가`);
    }
  }
  return best?.enc ?? 'libx264';
}

let detected: Promise<EncoderId> | null = null;

export function detectEncoder(force = false): Promise<EncoderId> {
  if (detected && !force) return detected;
  detected = (async () => {
    const key = await machineKey();
    const cache = config().getEncoderCache();
    if (!force && cache?.key === key) return cache.encoder as EncoderId;
    const enc = await benchmarkEncoders();
    config().setEncoderCache(key, enc);
    return enc;
  })();
  return detected;
}

let lastUsedEncoder: EncoderId | null = null;
export const getActiveEncoder = () => lastUsedEncoder;

async function resolveEncoder(): Promise<EncoderId> {
  const setting = config().get().encoder;
  const enc = setting === 'auto' ? await detectEncoder() : setting;
  lastUsedEncoder = enc;
  return enc;
}

// ───────────────────────── 편집 렌더링 ─────────────────────────

export interface RenderOptions {
  input: string;
  output: string;
  signal?: AbortSignal;
  onProgress?: (ratio: number) => void;
}

function buildFilterGraph(total: number): string {
  // 9:16 로 먼저 잘라낸 뒤 확대한다. (확대 후 자르면 버려질 픽셀까지 스케일링하게 됨)
  const norm =
    `crop='min(iw,ih*${OUT_W}/${OUT_H})':'min(ih,iw*${OUT_H}/${OUT_W})',` +
    `scale=${OUT_W}:${OUT_H}:flags=bicubic,setsar=1,fps=${FPS},format=yuv420p`;

  const n = SEGMENTS.length;
  const splitOut = SEGMENTS.map((_, i) => `[s${i}]`).join('');
  const segs = SEGMENTS.map((s, i) => {
    // 입력은 WINDOW_START 부터 시킹되어 들어오므로 0 기준으로 변환
    const a = +(s.start - WINDOW_START).toFixed(3);
    const b = +(s.end - WINDOW_START).toFixed(3);
    const pts = s.speed === 1 ? 'PTS-STARTPTS' : `(PTS-STARTPTS)/${s.speed}`;
    return `[s${i}]trim=${a}:${b},setpts=${pts}[v${i}]`;
  });
  const segLabels = SEGMENTS.map((_, i) => `[v${i}]`).join('');
  const fadeOut = Math.max(0, total - 1).toFixed(3);

  return [
    `[0:v]${norm}[intro]`,
    `[1:v]${norm},split=${n}${splitOut}`,
    ...segs,
    `${segLabels}concat=n=${n}:v=1:a=0,fps=${FPS}[main]`,
    `[2:v]${norm}[outro]`,
    `[intro][main][outro]concat=n=3:v=1:a=0[outv]`,
    `[3:a]atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS,` +
      `afade=t=in:d=1,afade=t=out:st=${fadeOut}:d=1,volume=0.8[bgm]`,
  ].join(';');
}

async function renderWith(enc: EncoderId, opts: RenderOptions, total: number) {
  const preset = config().get().encodePreset;
  const tmp = opts.output + '.part.mp4';
  const args = [
    '-progress', 'pipe:1', '-nostats',
    '-i', paths.intro(),
    '-ss', String(WINDOW_START), '-t', String(WINDOW_END - WINDOW_START), '-i', opts.input,
    '-i', paths.outro(),
    '-i', paths.bgm(),
    '-filter_complex', buildFilterGraph(total),
    '-map', '[outv]', '-map', '[bgm]',
    ...encoderArgs(enc, preset),
    '-g', String(FPS * 2), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart',
    tmp,
  ];

  let buf = '';
  await runFfmpeg(args, {
    signal: opts.signal,
    timeoutMs: 5 * 60_000,
    onStdout: (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const m = line.match(/^out_time_us=(\d+)/);
        if (m) opts.onProgress?.(Math.min(0.99, +m[1] / 1e6 / total));
      }
    },
  }).catch(async (e) => {
    await fs.promises.rm(tmp, { force: true });
    throw e;
  });
  await fs.promises.rename(tmp, opts.output);
}

export async function renderEdit(opts: RenderOptions): Promise<{ encoder: EncoderId; ms: number }> {
  const t0 = Date.now();
  for (const f of [paths.intro(), paths.outro(), paths.bgm(), paths.ffmpeg()]) {
    if (!fs.existsSync(f)) throw new Error(`필수 파일이 없습니다: ${f}`);
  }
  const [introLen, outroLen] = await Promise.all([probeDuration(paths.intro()), probeDuration(paths.outro())]);
  const total = introLen + MAIN_DURATION + outroLen;

  let enc = await resolveEncoder();
  try {
    await renderWith(enc, opts, total);
  } catch (e) {
    if (e instanceof AbortError || enc === 'libx264') throw e;
    // 하드웨어 인코더 오류(드라이버 등) → CPU 로 즉시 재시도
    console.warn(`[video] ${enc} 실패, libx264 로 재시도`, e);
    enc = 'libx264';
    lastUsedEncoder = enc;
    await renderWith(enc, opts, total);
  }
  opts.onProgress?.(1);
  return { encoder: enc, ms: Date.now() - t0 };
}

// ───────────────────────── 썸네일 ─────────────────────────

let thumbQueue: Promise<unknown> = Promise.resolve();
const thumbInflight = new Map<string, Promise<string>>();

/** 영상 옆 .thumbs 폴더에 캐시. 동시 실행은 1개로 제한해 UI 가 버벅이지 않게 한다. */
export function ensureThumbnail(video: string): Promise<string> {
  const thumb = path.join(path.dirname(video), '.thumbs', path.basename(video) + '.jpg');
  if (fs.existsSync(thumb)) return Promise.resolve(thumb);
  const inflight = thumbInflight.get(thumb);
  if (inflight) return inflight;

  const job = thumbQueue
    .catch(() => undefined)
    .then(async () => {
      await fs.promises.mkdir(path.dirname(thumb), { recursive: true });
      await runFfmpeg(
        ['-ss', '6', '-i', video, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '5', thumb],
        { timeoutMs: 15000 },
      );
      return thumb;
    })
    .finally(() => thumbInflight.delete(thumb));
  thumbQueue = job;
  thumbInflight.set(thumb, job);
  return job;
}
