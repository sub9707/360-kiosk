// 설정 텍스트 파일 불러오기 / 양식 내보내기
//
// 지원 형식
//  - KEY=VALUE (.env / .txt / .cfg) : # 주석, 따옴표, 빈 줄 허용
//  - JSON : 평면 키 또는 { "r2": { ... } } 중첩 구조
// 키 이름은 대소문자·구분자(_ - . 공백)를 무시하고 비교하며, 구버전 .env 키도 인식한다.
import fs from 'node:fs';
import type { EncodePreset, EncoderSetting, LinkMode, Settings, SettingsPatch } from '../shared/types';

type Field =
  | 'cameraIp' | 'saveDir' | 'showCopyright' | 'countdownSeconds' | 'encoder' | 'encodePreset'
  | 'r2.accountId' | 'r2.accessKeyId' | 'r2.secretAccessKey' | 'r2.bucket'
  | 'r2.publicBaseUrl' | 'r2.keyPrefix' | 'r2.linkMode';

const ALIASES: Record<Field, string[]> = {
  cameraIp: ['cameraip', 'wirelessaddress', 'androidip', 'ip', 'connectionip'],
  saveDir: ['savedir', 'basedirectory', 'directorypath', 'videodir'],
  showCopyright: ['showcopyright', 'copyright'],
  countdownSeconds: ['countdownseconds', 'countdown'],
  encoder: ['encoder'],
  encodePreset: ['encodepreset', 'preset', 'quality'],
  'r2.accountId': ['r2accountid', 'accountid'],
  'r2.accessKeyId': ['r2accesskeyid', 'accesskeyid', 'r2accesskey', 'accesskey'],
  'r2.secretAccessKey': ['r2secretaccesskey', 'secretaccesskey', 'r2secretkey', 'secretkey', 'r2secret'],
  'r2.bucket': ['r2bucket', 'bucket', 'r2bucketname', 'bucketname'],
  'r2.publicBaseUrl': ['r2publicbaseurl', 'r2publicurl', 'publicbaseurl', 'publicurl', 'r2domain'],
  'r2.keyPrefix': ['r2keyprefix', 'keyprefix', 'r2prefix', 'prefix'],
  'r2.linkMode': ['r2linkmode', 'linkmode'],
};

export const FIELD_LABELS: Record<Field, string> = {
  cameraIp: '안드로이드 기기 IP',
  saveDir: '로컬 저장 폴더',
  showCopyright: '저작권 문구 표시',
  countdownSeconds: '카운트다운',
  encoder: '인코더',
  encodePreset: '품질',
  'r2.accountId': 'R2 Account ID',
  'r2.accessKeyId': 'R2 Access Key ID',
  'r2.secretAccessKey': 'R2 Secret Access Key',
  'r2.bucket': 'R2 버킷',
  'r2.publicBaseUrl': 'R2 공개 URL',
  'r2.keyPrefix': 'R2 경로 접두사',
  'r2.linkMode': 'R2 공유 링크 방식',
};

const lookup = new Map<string, Field>();
for (const [field, names] of Object.entries(ALIASES) as [Field, string[]][]) {
  for (const n of names) lookup.set(n, field);
}

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

const ENCODERS: EncoderSetting[] = ['auto', 'libx264', 'h264_nvenc', 'h264_qsv', 'h264_amf'];
const PRESETS: EncodePreset[] = ['fast', 'balanced', 'quality'];
const LINK_MODES: LinkMode[] = ['public', 'presigned'];

function parseBool(v: string): boolean | undefined {
  const s = v.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on', '예', '사용'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'off', '아니오', '사용안함'].includes(s)) return false;
  return undefined;
}

function parseKeyValue(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';') || line.startsWith('//')) continue;
    const m = line.match(/^(?:export\s+)?([^=:]+?)\s*[=:]\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    const quoted = /^(['"]).*\1$/.test(v);
    if (quoted) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, ''); // 따옴표 없는 값의 줄 끝 주석 제거
    // 구버전 .env 처럼 모든 역슬래시를 두 번씩 쓴 경로만 절반으로 (UNC \\server\share 는 유지)
    if (v.includes('\\\\') && /^(?:[^\\]|\\\\)*$/.test(v)) v = v.replace(/\\\\/g, '\\');
    out.push([m[1].trim(), v]);
  }
  return out;
}

function flattenJson(obj: unknown, prefix = ''): [string, string][] {
  if (obj === null || typeof obj !== 'object') return [];
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) out.push(...flattenJson(v, prefix + k + '_'));
    else if (v !== undefined && v !== null) out.push([prefix + k, String(v)]);
  }
  return out;
}

export interface ImportResult {
  patch: SettingsPatch;
  fields: string[];
  unknown: string[];
  invalid: string[];
}

export function parseSettingsText(text: string): ImportResult {
  const clean = text.replace(/^﻿/, '');
  let pairs: [string, string][];
  try {
    pairs = flattenJson(JSON.parse(clean));
  } catch {
    pairs = parseKeyValue(clean);
  }

  const patch: SettingsPatch = {};
  const r2: NonNullable<SettingsPatch['r2']> = {};
  const fields: string[] = [];
  const unknown: string[] = [];
  const invalid: string[] = [];

  for (const [key, value] of pairs) {
    const field = lookup.get(norm(key));
    if (!field) {
      if (!['nodeenv', 'vitebasedirectory', 'drivefolderid'].includes(norm(key))) unknown.push(key);
      continue;
    }
    const v = value.trim();
    // 빈 값은 "지정 안 함"으로 간주 (양식의 빈 Secret 이 저장된 값을 지우지 않도록)
    if (v === '') continue;
    let ok = true;
    switch (field) {
      case 'cameraIp':
        patch.cameraIp = v;
        break;
      case 'saveDir':
        patch.saveDir = v;
        break;
      case 'showCopyright': {
        const b = parseBool(v);
        if (b === undefined) ok = false;
        else patch.showCopyright = b;
        break;
      }
      case 'countdownSeconds': {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 10) ok = false;
        else patch.countdownSeconds = Math.round(n);
        break;
      }
      case 'encoder':
        if (ENCODERS.includes(v as EncoderSetting)) patch.encoder = v as EncoderSetting;
        else ok = false;
        break;
      case 'encodePreset':
        if (PRESETS.includes(v as EncodePreset)) patch.encodePreset = v as EncodePreset;
        else ok = false;
        break;
      case 'r2.linkMode':
        if (LINK_MODES.includes(v as LinkMode)) r2.linkMode = v as LinkMode;
        else ok = false;
        break;
      default: {
        const sub = field.slice(3) as 'accountId' | 'accessKeyId' | 'secretAccessKey' | 'bucket' | 'publicBaseUrl' | 'keyPrefix';
        r2[sub] = v;
      }
    }
    if (ok) {
      if (!fields.includes(FIELD_LABELS[field])) fields.push(FIELD_LABELS[field]);
    } else {
      invalid.push(`${key}=${value}`);
    }
  }

  if (Object.keys(r2).length) patch.r2 = r2;
  return { patch, fields, unknown, invalid };
}

export async function readSettingsFile(file: string): Promise<ImportResult> {
  const stat = await fs.promises.stat(file);
  if (stat.size > 256 * 1024) throw new Error('설정 파일이 너무 큽니다 (256KB 초과)');
  return parseSettingsText(await fs.promises.readFile(file, 'utf8'));
}

/** 현재 값으로 채운 양식 (Secret 은 보안을 위해 비워 둔다) */
export function settingsTemplate(s: Settings): string {
  return `# 360 키오스크 설정 파일
# 설정 화면의 [설정 파일 불러오기]로 이 파일을 선택하면 입력칸이 채워집니다.
# 형식: KEY=VALUE  (# 으로 시작하는 줄은 주석)

# ── 촬영 기기 ──
CAMERA_IP=${s.cameraIp}
# 0, 3, 5 (초)
COUNTDOWN=${s.countdownSeconds}

# ── 저장 ──
SAVE_DIR=${s.saveDir}

# ── 인코딩 ──
# auto | libx264 | h264_nvenc | h264_qsv | h264_amf
ENCODER=${s.encoder}
# fast | balanced | quality
ENCODE_PRESET=${s.encodePreset}

# ── Cloudflare R2 ──
R2_ACCOUNT_ID=${s.r2.accountId}
R2_ACCESS_KEY_ID=${s.r2.accessKeyId}
R2_SECRET_ACCESS_KEY=
R2_BUCKET=${s.r2.bucket}
# public (공개 도메인) | presigned (7일 서명 URL)
R2_LINK_MODE=${s.r2.linkMode}
R2_PUBLIC_URL=${s.r2.publicBaseUrl}
R2_KEY_PREFIX=${s.r2.keyPrefix}

# ── 화면 ──
SHOW_COPYRIGHT=${s.showCopyright}
`;
}
