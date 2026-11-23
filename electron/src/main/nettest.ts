// 네트워크 테스트 — 각 항목을 우려 / 권장 / 최고 3단계로 판정
//
// 0. 입력값 검증  : 저장된 폰 IP / R2 항목이 비었거나 형식이 틀리면 해당 측정을 건너뛰고 알린다
// 1. PC 연결      : 폰과 같은 서브넷인지, 유선/Wi-Fi, Wi-Fi 신호·대역
// 2. 폰↔PC 지연   : /status 10회 왕복 (keep-alive)
// 3. 폰→PC 처리량 : /speedtest 를 4개 연결로 병렬 다운로드 (실제 원본 전송과 동일 방식)
// 4. R2 지연      : HeadBucket 왕복
// 5. R2 업로드    : 8MB 임의 데이터 멀티파트 업로드 후 삭제
//
// 모든 단계는 제한 시간이 있으며, 초과하면 진행 중인 요청을 중단하고 "우려(시간 초과)"로 처리한 뒤
// 다음 단계로 넘어간다. 전송 측정은 5초간 데이터가 전혀 오지 않으면 즉시 실패 처리한다.
import { execFile } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import type { NetCheck, NetGrade, NetTestResult, Settings } from '../shared/types';
import { config } from './config';
import { measureUpload, testConnection } from './storage';
import { RECORD_SECONDS } from './video';

const HTTP_PORT = 8081;

/** 판정 기준. higher=true 면 값이 클수록 좋음 */
const THRESHOLDS = {
  // 폰↔PC 는 제어 신호만 오가므로 지연보다 전송 속도가 중요. 안드로이드 Wi-Fi 절전으로 수십 ms 는 흔함
  lanLatencyMs: { best: 20, recommended: 100, higher: false },
  lanMbps: { best: 150, recommended: 50, higher: true },
  r2LatencyMs: { best: 150, recommended: 400, higher: false },
  r2Mbps: { best: 50, recommended: 15, higher: true },
  wifiSignal: { best: 80, recommended: 60, higher: true },
} as const;

/** 단계별 제한 시간(ms) */
export const STEP_TIMEOUT = {
  link: 8_000,
  lanLatency: 12_000,
  lanThroughput: 20_000,
  r2Latency: 10_000,
  r2Upload: 30_000,
} as const;

/** 데이터가 이 시간 동안 전혀 들어오지 않으면 전송 정지로 판단 */
const STALL_MS = 5_000;

/** 체감 시간 환산용 파일 크기 */
const RAW_MB = (RECORD_SECONDS * 10) / 8; // 10Mbps 녹화
const EDITED_MB = 20; // 편집본(약 32초, 최대 8Mbps) 보수적 추정

const RANK: Record<NetGrade, number> = { concern: 0, recommended: 1, best: 2 };

function grade(value: number, t: { best: number; recommended: number; higher: boolean }): NetGrade {
  if (t.higher) return value >= t.best ? 'best' : value >= t.recommended ? 'recommended' : 'concern';
  return value <= t.best ? 'best' : value <= t.recommended ? 'recommended' : 'concern';
}

const worst = (grades: (NetGrade | null)[]): NetGrade | null => {
  const g = grades.filter((x): x is NetGrade => !!x);
  return g.length ? g.reduce((a, b) => (RANK[a] <= RANK[b] ? a : b)) : null;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

const fmtSec = (s: number) => (s < 10 ? s.toFixed(1) : Math.round(s).toString());

// ───────────────────────── 0. 입력값 검증 ─────────────────────────

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

interface InputCheck {
  ipError: string | null;
  r2Missing: string[];
  r2Error: string | null;
}

export function validateInputs(s: Settings): InputCheck {
  const ip = s.cameraIp.trim();
  const ipError = !ip
    ? '안드로이드 기기 IP가 입력되지 않았습니다.'
    : !IPV4.test(ip) && ip !== 'localhost'
      ? `안드로이드 기기 IP 형식이 올바르지 않습니다: "${ip}"`
      : null;

  const r = s.r2;
  const required: [string, string][] = [
    ['Account ID', r.accountId],
    ['Access Key ID', r.accessKeyId],
    ['Secret Access Key', r.secretAccessKey],
    ['버킷 이름', r.bucket],
  ];
  if (r.linkMode === 'public') required.push(['공개 URL', r.publicBaseUrl]);
  const r2Missing = required.filter(([, v]) => !v?.trim()).map(([k]) => k);

  let r2Error: string | null = null;
  if (r.accountId && !/^[0-9a-f]{32}$/i.test(r.accountId.trim())) {
    r2Error = 'R2 Account ID 형식이 올바르지 않습니다 (32자리 16진수).';
  } else if (r.linkMode === 'public' && r.publicBaseUrl && !/^https?:\/\/[^/\s]+/i.test(r.publicBaseUrl)) {
    r2Error = 'R2 공개 URL은 http:// 또는 https:// 로 시작해야 합니다.';
  }
  return { ipError, r2Missing, r2Error };
}

// ───────────────────────── 시간 제한 ─────────────────────────

class StepTimeout extends Error {}

/** fn 에 AbortSignal 을 넘겨 실행하고, ms 를 넘기면 abort 후 StepTimeout 을 던진다 */
async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ac.abort();
      reject(new StepTimeout());
    }, ms);
  });
  try {
    return await Promise.race([fn(ac.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** 단계 실행 래퍼: 시간 초과·예외를 모두 "우려" 결과로 변환해 다음 단계로 넘어가게 한다 */
async function step(
  base: Pick<NetCheck, 'id' | 'label'>,
  ms: number,
  fn: (signal: AbortSignal) => Promise<NetCheck>,
): Promise<NetCheck> {
  try {
    return await withTimeout(ms, fn);
  } catch (e: any) {
    if (e instanceof StepTimeout) {
      return { ...base, value: '시간 초과', grade: 'concern', note: `${ms / 1000}초 안에 측정을 마치지 못했습니다.` };
    }
    return { ...base, value: '실패', grade: 'concern', note: e?.message ?? String(e) };
  }
}

// ───────────────────────── 1. PC 연결 ─────────────────────────

const ipToInt = (ip: string) => ip.split('.').reduce((a, o) => (a << 8) + (parseInt(o, 10) & 255), 0) >>> 0;

function findLocalInterface(targetIp: string): { name: string; address: string } | null {
  if (!IPV4.test(targetIp)) return null;
  const t = ipToInt(targetIp);
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const mask = ipToInt(a.netmask);
      if ((ipToInt(a.address) & mask) === (t & mask)) return { name, address: a.address };
    }
  }
  return null;
}

interface WifiInfo {
  signal?: number;
  band?: string;
  rxMbps?: number;
}

/** netsh 출력(영문/한글 Windows 모두)에서 신호·대역·수신 속도 추출 */
function readWifiInfo(signal: AbortSignal): Promise<WifiInfo | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      'cmd.exe',
      ['/d', '/c', 'chcp 65001 >nul & netsh wlan show interfaces'],
      { windowsHide: true, timeout: 5000, signal },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        const info: WifiInfo = {};
        for (const line of stdout.split(/\r?\n/)) {
          const [k, ...rest] = line.split(':');
          const key = (k ?? '').trim().toLowerCase();
          const val = rest.join(':').trim();
          if (!val) continue;
          if (/^(signal|신호)/.test(key)) info.signal = parseInt(val, 10);
          else if (/^(band|대역)/.test(key)) info.band = val;
          else if (/(receive rate|수신 속도)/.test(key)) info.rxMbps = parseFloat(val);
          else if (/^(channel|채널)/.test(key) && !info.band) {
            const ch = parseInt(val, 10);
            if (ch) info.band = ch <= 14 ? '2.4 GHz' : '5 GHz';
          }
        }
        resolve(info.signal !== undefined || info.band ? info : null);
      },
    );
  });
}

async function checkLink(ip: string, signal: AbortSignal): Promise<NetCheck> {
  const base = { id: 'link' as const, label: 'PC 네트워크 연결' };
  if (ip.startsWith('127.') || ip === 'localhost') {
    return { ...base, value: '로컬 테스트 (127.0.0.1)', grade: null, note: '모의 서버 테스트 중에는 판정하지 않습니다.' };
  }
  const iface = findLocalInterface(ip);
  if (!iface) {
    return {
      ...base,
      value: '같은 네트워크 아님',
      grade: 'concern',
      note: `PC에 ${ip} 와 같은 대역의 네트워크가 없습니다. 폰과 PC를 같은 공유기에 연결하세요.`,
    };
  }
  const isWifi = /wi-?fi|wlan|wireless|무선/i.test(iface.name);
  if (!isWifi) return { ...base, value: `유선 (${iface.name})`, grade: 'best' };

  const wifi = await readWifiInfo(signal);
  if (!wifi) return { ...base, value: `Wi-Fi (${iface.name})`, grade: 'recommended', note: 'Wi-Fi 상세 정보를 읽지 못했습니다.' };

  const is24 = !!wifi.band && /2\.4/.test(wifi.band);
  let g: NetGrade = wifi.signal !== undefined ? grade(wifi.signal, THRESHOLDS.wifiSignal) : 'recommended';
  if (is24) g = 'concern';
  const parts = [wifi.band, wifi.signal !== undefined ? `신호 ${wifi.signal}%` : null, wifi.rxMbps ? `${wifi.rxMbps} Mbps` : null];
  return {
    ...base,
    value: `Wi-Fi · ${parts.filter(Boolean).join(' · ')}`,
    grade: g,
    note:
      g === 'concern'
        ? is24
          ? 'PC가 2.4GHz에 연결되어 있습니다. 5GHz 대역(SSID) 또는 유선 연결을 권장합니다.'
          : 'Wi-Fi 신호가 약합니다. 공유기와 거리를 줄이거나 유선 연결을 권장합니다.'
        : undefined,
  };
}

// ───────────────────────── 2~3. 폰 ↔ PC ─────────────────────────

const agent = new http.Agent({ keepAlive: true, maxSockets: 8 });

function request(url: string, signal: AbortSignal, timeoutMs = 3000): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent, signal, ...(timeoutMs > 0 ? { timeout: timeoutMs } : {}) }, resolve);
    if (timeoutMs > 0) req.on('timeout', () => req.destroy(new Error('응답 시간 초과')));
    req.on('error', reject);
  });
}

async function checkLanLatency(ip: string, signal: AbortSignal): Promise<NetCheck> {
  const base = { id: 'lanLatency' as const, label: '폰 ↔ PC 응답 속도' };
  const samples: number[] = [];
  let failed = 0;
  for (let i = 0; i < 10 && !signal.aborted; i++) {
    const t0 = performance.now();
    try {
      const res = await request(`http://${ip}:${HTTP_PORT}/status`, signal, 2000);
      res.resume();
      await new Promise((r) => res.on('end', r));
      samples.push(performance.now() - t0);
    } catch {
      failed++;
      // 처음 3번이 모두 실패하면 더 기다리지 않고 실패 처리
      if (!samples.length && failed >= 3) break;
    }
  }
  if (!samples.length) {
    return { ...base, value: '응답 없음', grade: 'concern', note: '폰 앱이 실행 중인지, IP가 맞는지 확인하세요.' };
  }
  const tries = samples.length + failed;
  // 첫 요청은 TCP 연결 수립 포함 → 이후 값의 중앙값 사용
  const med = median(samples.length > 1 ? samples.slice(1) : samples);
  let g = grade(med, THRESHOLDS.lanLatencyMs);
  if (failed > 0) g = 'concern';
  return {
    ...base,
    value: `${Math.round(med)} ms${failed ? ` · 실패 ${failed}/${tries}` : ''}`,
    grade: g,
    note:
      g === 'concern'
        ? failed
          ? '요청 일부가 실패했습니다. Wi-Fi 신호와 공유기 상태를 확인하세요.'
          : '응답이 매우 느립니다. 폰의 Wi-Fi 절전 설정, 공유기와의 거리, 주변 Wi-Fi 혼잡을 확인하세요.'
        : undefined,
  };
}

async function checkLanThroughput(ip: string, signal: AbortSignal): Promise<NetCheck> {
  const base = { id: 'lanThroughput' as const, label: '폰 → PC 전송 속도' };
  const total = 32 * 1024 * 1024;
  const parts = 4;
  const per = total / parts;

  // 엔드포인트 지원 여부 확인 (구버전 앱은 404)
  const probe = await request(`http://${ip}:${HTTP_PORT}/speedtest?size=1024`, signal);
  probe.resume();
  if (probe.statusCode !== 200) {
    return { ...base, value: '측정 불가', grade: null, note: '폰 앱을 최신 버전(v1.2 이상)으로 업데이트하면 측정할 수 있습니다.' };
  }

  // 전송 정지 감지: STALL_MS 동안 바이트가 전혀 늘지 않으면 중단
  const stall = new AbortController();
  const both = AbortSignal.any([signal, stall.signal]);
  let loaded = 0;
  let lastLoaded = 0;
  let lastChange = performance.now();
  const watchdog = setInterval(() => {
    if (loaded !== lastLoaded) {
      lastLoaded = loaded;
      lastChange = performance.now();
    } else if (performance.now() - lastChange > STALL_MS) {
      stall.abort();
    }
  }, 500);

  const t0 = performance.now();
  try {
    await Promise.all(
      Array.from({ length: parts }, async () => {
        // 소켓 타임아웃 없이(0) 감시 타이머가 정지를 판단한다 (연결 지연도 "데이터 없음"으로 잡힘)
        const res = await request(`http://${ip}:${HTTP_PORT}/speedtest?size=${per}`, both, 0);
        for await (const c of res as AsyncIterable<Buffer>) loaded += c.length;
      }),
    );
  } catch (e: any) {
    if (stall.signal.aborted) {
      return {
        ...base,
        value: '전송 정지',
        grade: 'concern',
        note: `${STALL_MS / 1000}초 동안 데이터가 오지 않았습니다 (${Math.round(loaded / 1048576)}MB 수신 후). Wi-Fi 연결이 불안정합니다.`,
      };
    }
    throw e; // 상위 step() 에서 시간 초과 / 실패로 처리
  } finally {
    clearInterval(watchdog);
  }
  const sec = (performance.now() - t0) / 1000;
  const mbps = (loaded * 8) / 1e6 / sec;
  const g = grade(mbps, THRESHOLDS.lanMbps);
  return {
    ...base,
    value: `${Math.round(mbps)} Mbps`,
    estimate: `원본(${Math.round(RAW_MB)}MB) 전송 약 ${fmtSec((RAW_MB * 8) / mbps)}초`,
    grade: g,
    note: g === 'concern' ? '폰을 5GHz Wi-Fi에 연결하고, 공유기를 촬영 위치 가까이에 두세요.' : undefined,
  };
}

// ───────────────────────── 4~5. R2 ─────────────────────────

async function checkR2Latency(signal: AbortSignal): Promise<NetCheck> {
  const base = { id: 'r2Latency' as const, label: 'R2 응답 속도' };
  await testConnection(signal); // TLS 연결 수립
  const samples = [await testConnection(signal), await testConnection(signal), await testConnection(signal)];
  const med = median(samples);
  const g = grade(med, THRESHOLDS.r2LatencyMs);
  return {
    ...base,
    value: `${Math.round(med)} ms`,
    grade: g,
    note: g === 'concern' ? '인터넷 회선이 느리거나 혼잡합니다. 행사장 회선 상태를 확인하세요.' : undefined,
  };
}

async function checkR2Upload(signal: AbortSignal): Promise<NetCheck> {
  const base = { id: 'r2Upload' as const, label: 'R2 업로드 속도' };
  const { ms, bytes } = await measureUpload(8 * 1024 * 1024, signal);
  const mbps = (bytes * 8) / 1e6 / (ms / 1000);
  const g = grade(mbps, THRESHOLDS.r2Mbps);
  return {
    ...base,
    value: `${mbps.toFixed(mbps < 10 ? 1 : 0)} Mbps`,
    estimate: `편집본(약 ${EDITED_MB}MB) 업로드 약 ${fmtSec((EDITED_MB * 8) / mbps)}초`,
    grade: g,
    note:
      g === 'concern'
        ? '업로드 대역폭이 부족합니다. 행사장 유선 인터넷 또는 별도 회선(LTE 라우터 등)을 검토하세요.'
        : undefined,
  };
}

/** 오류 메시지를 사용자용으로 정리 */
function friendlyR2(check: NetCheck): NetCheck {
  if (check.value !== '실패' || !check.note) return check;
  const n = check.note;
  const note = /NotFound|NoSuchBucket/i.test(n)
    ? '버킷을 찾을 수 없습니다. 버킷 이름과 Account ID를 확인하세요.'
    : /AccessDenied|Forbidden|403|InvalidAccessKeyId|SignatureDoesNotMatch/i.test(n)
      ? 'R2 인증에 실패했습니다. Access Key / Secret과 토큰 권한(Object Read & Write)을 확인하세요.'
      : /ENOTFOUND|getaddrinfo|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(n)
        ? 'R2에 연결할 수 없습니다. PC의 인터넷 연결을 확인하세요.'
        : n;
  return { ...check, note };
}

// ───────────────────────── 실행 ─────────────────────────

let running: Promise<NetTestResult> | null = null;

export function runNetworkTest(onProgress: (step: string) => void): Promise<NetTestResult> {
  if (running) return running;
  running = (async () => {
    const settings = config().get();
    const ip = settings.cameraIp.trim();
    const input = validateInputs(settings);
    const inputErrors: string[] = [];
    if (input.ipError) inputErrors.push(input.ipError);
    if (input.r2Missing.length) inputErrors.push(`R2 입력값 없음: ${input.r2Missing.join(', ')}`);
    if (input.r2Error) inputErrors.push(input.r2Error);

    const checks: NetCheck[] = [];
    const skip = (id: NetCheck['id'], label: string, note: string): NetCheck => ({
      id,
      label,
      value: '입력값 없음',
      grade: null,
      note,
    });

    // ── 폰 ↔ PC ──
    if (input.ipError) {
      const note = '안드로이드 기기 IP를 입력하고 [저장 후 연결]을 누르세요.';
      checks.push(skip('link', 'PC 네트워크 연결', note));
      checks.push(skip('lanLatency', '폰 ↔ PC 응답 속도', note));
      checks.push(skip('lanThroughput', '폰 → PC 전송 속도', note));
    } else {
      onProgress('PC 네트워크 연결 확인 중');
      checks.push(await step({ id: 'link', label: 'PC 네트워크 연결' }, STEP_TIMEOUT.link, (sig) => checkLink(ip, sig)));

      onProgress('폰 응답 속도 측정 중');
      const latency = await step({ id: 'lanLatency', label: '폰 ↔ PC 응답 속도' }, STEP_TIMEOUT.lanLatency, (sig) =>
        checkLanLatency(ip, sig),
      );
      checks.push(latency);

      if (latency.grade === 'concern' && !/ms/.test(latency.value)) {
        checks.push({ id: 'lanThroughput', label: '폰 → PC 전송 속도', value: '측정 불가', grade: null, note: '폰이 응답하지 않아 건너뜀' });
      } else {
        onProgress('폰 → PC 전송 속도 측정 중 (32MB)');
        checks.push(
          await step({ id: 'lanThroughput', label: '폰 → PC 전송 속도' }, STEP_TIMEOUT.lanThroughput, (sig) =>
            checkLanThroughput(ip, sig),
          ),
        );
      }
    }

    // ── R2 ──
    if (input.r2Missing.length || input.r2Error) {
      const note = input.r2Error ?? `${input.r2Missing.join(', ')}을(를) 입력하고 저장하세요.`;
      checks.push(skip('r2Latency', 'R2 응답 속도', note));
      checks.push(skip('r2Upload', 'R2 업로드 속도', note));
    } else {
      onProgress('R2 응답 속도 측정 중');
      const lat = friendlyR2(
        await step({ id: 'r2Latency', label: 'R2 응답 속도' }, STEP_TIMEOUT.r2Latency, (sig) => checkR2Latency(sig)),
      );
      checks.push(lat);
      if (lat.grade === 'concern' && !/ms/.test(lat.value)) {
        checks.push({ id: 'r2Upload', label: 'R2 업로드 속도', value: '측정 불가', grade: null, note: 'R2 연결에 실패해 건너뜀' });
      } else {
        onProgress('R2 업로드 속도 측정 중 (8MB)');
        checks.push(
          friendlyR2(
            await step({ id: 'r2Upload', label: 'R2 업로드 속도' }, STEP_TIMEOUT.r2Upload, (sig) => checkR2Upload(sig)),
          ),
        );
      }
    }

    // 입력값 문제가 있으면 종합 판정에 반영 (측정된 항목이 좋아도 '우려')
    const overall = worst([...checks.map((c) => c.grade), inputErrors.length ? 'concern' : null]);
    return { inputErrors, checks, overall, finishedAt: Date.now() };
  })().finally(() => {
    running = null;
  });
  return running;
}
