// 앱 설정 저장소
// - 단일 JSON 파일(userData/settings.json)로 통합. 변경 즉시 반영(재시작 불필요).
// - 최초 실행 시 기존 .env / settings.config.json 값을 자동으로 가져온다.
// - R2 secret 은 OS 키체인(safeStorage)으로 암호화해 저장한다.
import { app, safeStorage } from 'electron';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { Settings, SettingsPatch } from '../shared/types';

const SECRET_MASK = '••••••••';

const DEFAULTS: Settings = {
  cameraIp: '192.168.0.10',
  saveDir: path.join(app.getPath('videos'), '360-kiosk'),
  showCopyright: true,
  countdownSeconds: 3,
  encoder: 'auto',
  encodePreset: 'fast',
  r2: {
    accountId: '',
    accessKeyId: '',
    secretAccessKey: '',
    bucket: '',
    publicBaseUrl: '',
    keyPrefix: '',
    linkMode: 'public',
  },
};

interface StoredFile extends Omit<Settings, 'r2'> {
  r2: Omit<Settings['r2'], 'secretAccessKey'> & { secretEnc?: string; secretPlain?: string };
  /** 인코더 자동 감지 캐시 */
  encoderCache?: { key: string; encoder: string };
}

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim().replace(/^['"]|['"]$/g, '');
    v = v.replace(/\\\\/g, '\\');
    out[m[1]] = v;
  }
  return out;
}

function legacyImport(): Partial<Settings> {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const env = parseEnvFile(path.join(base, '.env'));
  const out: Partial<Settings> = {};
  if (env.WIRELESS_ADDRESS) out.cameraIp = env.WIRELESS_ADDRESS;
  if (env.BASE_DIRECTORY) out.saveDir = env.BASE_DIRECTORY;
  if (env.copyright) out.showCopyright = env.copyright === 'true';
  return out;
}

class ConfigStore extends EventEmitter {
  private data: StoredFile;

  constructor() {
    super();
    this.data = this.load();
  }

  private load(): StoredFile {
    const file = settingsPath();
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<StoredFile>;
      return {
        ...DEFAULTS,
        ...raw,
        r2: { ...DEFAULTS.r2, ...(raw.r2 ?? {}) },
      } as StoredFile;
    } catch {
      const migrated = { ...DEFAULTS, ...legacyImport() } as unknown as StoredFile;
      migrated.r2 = { ...DEFAULTS.r2 };
      delete (migrated.r2 as any).secretAccessKey;
      this.data = migrated;
      this.persist();
      console.log('[config] settings.json 생성:', file);
      return migrated;
    }
  }

  private persist() {
    const file = settingsPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, file);
  }

  private decryptSecret(): string {
    const { secretEnc, secretPlain } = this.data.r2;
    if (secretEnc && safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(secretEnc, 'base64'));
      } catch (e) {
        console.error('[config] R2 secret 복호화 실패', e);
        return '';
      }
    }
    return secretPlain ?? '';
  }

  /** main 프로세스 내부용 (secret 포함) */
  get(): Settings {
    const { secretEnc: _e, secretPlain: _p, ...r2 } = this.data.r2;
    const { encoderCache: _c, ...rest } = this.data;
    return { ...rest, r2: { ...r2, secretAccessKey: this.decryptSecret() } };
  }

  /** renderer 전달용 (secret 마스킹) */
  getPublic(): Settings {
    const s = this.get();
    return { ...s, r2: { ...s.r2, secretAccessKey: s.r2.secretAccessKey ? SECRET_MASK : '' } };
  }

  update(patch: SettingsPatch): Settings {
    const before = this.get();
    const { r2: r2Patch, ...rest } = patch;
    Object.assign(this.data, rest);
    if (r2Patch) {
      const { secretAccessKey, ...r2rest } = r2Patch;
      Object.assign(this.data.r2, r2rest);
      if (typeof r2rest.publicBaseUrl === 'string') {
        this.data.r2.publicBaseUrl = r2rest.publicBaseUrl.trim().replace(/\/+$/, '');
      }
      if (typeof r2rest.keyPrefix === 'string') {
        this.data.r2.keyPrefix = r2rest.keyPrefix.trim().replace(/^\/+/, '');
      }
      if (secretAccessKey !== undefined && secretAccessKey !== SECRET_MASK) {
        if (safeStorage.isEncryptionAvailable()) {
          this.data.r2.secretEnc = safeStorage.encryptString(secretAccessKey).toString('base64');
          delete this.data.r2.secretPlain;
        } else {
          this.data.r2.secretPlain = secretAccessKey;
          delete this.data.r2.secretEnc;
        }
      }
    }
    this.persist();
    const after = this.get();
    this.emit('change', after, before);
    return after;
  }

  getEncoderCache() {
    return this.data.encoderCache;
  }

  setEncoderCache(key: string, encoder: string) {
    this.data.encoderCache = { key, encoder };
    this.persist();
  }
}

let store: ConfigStore | null = null;

/** app ready 이후 호출해야 한다 (safeStorage 사용) */
export function config(): ConfigStore {
  if (!store) store = new ConfigStore();
  return store;
}

export function isStorageConfigured(s: Settings = config().get()): boolean {
  const r = s.r2;
  const base = !!(r.accountId && r.accessKeyId && r.secretAccessKey && r.bucket);
  return base && (r.linkMode === 'presigned' || !!r.publicBaseUrl);
}
