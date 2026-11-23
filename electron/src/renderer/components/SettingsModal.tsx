import { useEffect, useState } from 'react';
import type { AppInfo, EncoderSetting, EncodePreset, LinkMode, R2Settings, SettingsImport } from '../../shared/types';
import { useSession } from '../hooks/useSession';
import { useSettings } from '../hooks/useSettings';
import NetworkTest from './NetworkTest';
import { Button, CameraPill, Modal } from './ui';
import s from './forms.module.scss';

const ENCODERS: { value: EncoderSetting; label: string }[] = [
  { value: 'auto', label: '자동 (가장 빠른 인코더)' },
  { value: 'libx264', label: 'CPU (libx264)' },
  { value: 'h264_nvenc', label: 'NVIDIA NVENC' },
  { value: 'h264_qsv', label: 'Intel Quick Sync' },
  { value: 'h264_amf', label: 'AMD AMF' },
];

const PRESETS: { value: EncodePreset; label: string }[] = [
  { value: 'fast', label: '빠름 (권장)' },
  { value: 'balanced', label: '균형' },
  { value: 'quality', label: '고화질 (느림)' },
];

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  const session = useSession();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [ip, setIp] = useState('');
  const [r2, setR2] = useState<R2Settings | null>(null);
  const [r2Status, setR2Status] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // 파일에서 불러왔지만 아직 저장하지 않은 입력칸
  const [pending, setPending] = useState<{ ip: boolean; r2: Set<keyof R2Settings> }>({ ip: false, r2: new Set() });
  const [templatePath, setTemplatePath] = useState<string | null>(null);
  const [imported, setImported] = useState<{ ok: boolean; data?: SettingsImport; error?: string } | null>(null);

  useEffect(() => {
    window.kiosk.settings.info().then(setInfo);
  }, []);

  useEffect(() => {
    if (settings && !r2) {
      setIp(settings.cameraIp);
      setR2(settings.r2);
    }
  }, [settings]);

  if (!settings || !r2) return null;

  const saveIp = async () => {
    await update({ cameraIp: ip.trim() });
    window.kiosk.session.connect();
    setPending((p) => ({ ...p, ip: false }));
  };

  const saveR2 = async () => {
    setBusy('r2');
    setR2Status(null);
    await update({ r2 });
    setPending((p) => ({ ...p, r2: new Set() }));
    const res = await window.kiosk.settings.testStorage();
    setR2Status(res.ok ? { ok: true, text: `연결 성공 · ${res.data!.latencyMs}ms` } : { ok: false, text: res.error! });
    setInfo(await window.kiosk.settings.info());
    setBusy(null);
  };

  const redetect = async () => {
    setBusy('enc');
    await window.kiosk.settings.redetectEncoder();
    setInfo(await window.kiosk.settings.info());
    setBusy(null);
  };

  const importFile = async () => {
    const res = await window.kiosk.settings.importFile();
    if (!res) return; // 취소
    if (!res.ok || !res.data) {
      setImported({ ok: false, error: res.error });
      return;
    }
    const { patch } = res.data;
    const { cameraIp, r2: r2Patch, ...instant } = patch;
    // 즉시 적용되는 항목(폴더·카운트다운·인코더·품질·저작권)은 바로 반영
    if (Object.keys(instant).length) await update(instant);
    // IP·R2 는 입력칸만 채우고 사용자가 확인 후 저장
    if (cameraIp !== undefined) setIp(cameraIp);
    if (r2Patch) setR2((cur) => (cur ? { ...cur, ...r2Patch } : cur));
    setPending({
      ip: cameraIp !== undefined && cameraIp !== settings.cameraIp,
      r2: new Set(Object.keys(r2Patch ?? {}) as (keyof R2Settings)[]),
    });
    setR2Status(null);
    setImported({ ok: true, data: res.data });
  };

  const applyPending = async () => {
    if (pending.ip) await saveIp();
    if (pending.r2.size) await saveR2();
  };

  const exportTemplate = async () => {
    const saved = await window.kiosk.settings.exportTemplate();
    if (saved) setTemplatePath(saved);
  };

  const r2Field = (key: keyof R2Settings, label: string, opts: { type?: string; placeholder?: string } = {}) => (
    <label className={`${s.field} ${pending.r2.has(key) ? s.filled : ''}`}>
      <span>{label}</span>
      <input
        type={opts.type ?? 'text'}
        value={r2[key] as string}
        placeholder={opts.placeholder}
        spellCheck={false}
        onChange={(e) => {
          setR2({ ...r2, [key]: e.target.value });
          setPending((p) => ({ ...p, r2: new Set(p.r2).add(key) }));
        }}
        onFocus={(e) => key === 'secretAccessKey' && e.target.select()}
      />
    </label>
  );

  return (
    <Modal
      title="설정"
      onClose={onClose}
      footer={
        <>
          <span className={s.version}>v{info?.version}</span>
          <Button size="md" variant="danger" icon="power" onClick={() => window.kiosk.app.quit()}>
            프로그램 종료
          </Button>
          <Button size="md" onClick={onClose}>
            닫기
          </Button>
        </>
      }
    >
      <div className={s.toolbar}>
        <Button size="md" variant="secondary" icon="folder" onClick={importFile}>
          설정 파일 불러오기
        </Button>
        <Button size="md" variant="ghost" icon="external" onClick={exportTemplate}>
          양식 저장
        </Button>
      </div>

      {templatePath && (
        <div className={s.banner}>
          <p>
            현재 설정으로 양식을 저장했습니다. (Secret은 비워 둠)
            <br />
            <code>{templatePath}</code>
          </p>
          <Button size="md" variant="ghost" icon="close" onClick={() => setTemplatePath(null)}>
            닫기
          </Button>
        </div>
      )}

      {imported?.ok === false && (
        <div className={`${s.banner} ${s.bannerError}`}>
          <p>불러오기 실패: {imported.error}</p>
          <Button size="md" variant="ghost" icon="close" onClick={() => setImported(null)}>
            닫기
          </Button>
        </div>
      )}

      {imported?.ok && imported.data && (
        <div className={s.banner}>
          <div>
            <p>
              <strong>{imported.data.file}</strong>에서 {imported.data.fields.length}개 항목을 불러왔습니다.
            </p>
            <p className={s.bannerSub}>{imported.data.fields.join(' · ')}</p>
            {(pending.ip || pending.r2.size > 0) && (
              <p className={s.bannerSub}>강조된 칸(IP·R2)은 확인 후 저장해야 적용됩니다.</p>
            )}
            {imported.data.invalid.length > 0 && (
              <p className={s.bannerWarn}>형식 오류로 건너뜀: {imported.data.invalid.join(', ')}</p>
            )}
            {imported.data.unknown.length > 0 && (
              <p className={s.bannerWarn}>알 수 없는 항목: {imported.data.unknown.join(', ')}</p>
            )}
          </div>
          {pending.ip || pending.r2.size > 0 ? (
            <Button size="md" onClick={applyPending} disabled={busy === 'r2'}>
              {busy === 'r2' ? '적용 중…' : '모두 저장'}
            </Button>
          ) : (
            <Button size="md" variant="ghost" icon="close" onClick={() => setImported(null)}>
              닫기
            </Button>
          )}
        </div>
      )}

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h3>촬영 기기</h3>
          {session && <CameraPill status={session.camera} />}
        </div>
        <div className={s.row}>
          <label className={`${s.field} ${pending.ip ? s.filled : ''}`}>
            <span>안드로이드 기기 IP</span>
            <input
              value={ip}
              onChange={(e) => {
                setIp(e.target.value);
                setPending((p) => ({ ...p, ip: true }));
              }}
              placeholder="192.168.0.10"
              spellCheck={false}
            />
          </label>
          <Button size="md" variant="secondary" onClick={saveIp} disabled={!ip.trim()}>
            저장 후 연결
          </Button>
        </div>
        <label className={s.field}>
          <span>촬영 전 카운트다운</span>
          <select
            value={settings.countdownSeconds}
            onChange={(e) => update({ countdownSeconds: Number(e.target.value) })}
          >
            {[0, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? '사용 안 함' : `${n}초`}
              </option>
            ))}
          </select>
        </label>
        <p className={s.note}>녹화 시간: {info?.recordSeconds}초 (편집에 필요한 구간만 촬영)</p>
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h3>네트워크 테스트</h3>
        </div>
        <NetworkTest
          unsaved={[...(pending.ip ? ['기기 IP'] : []), ...(pending.r2.size ? ['R2 설정'] : [])]}
        />
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h3>영상 저장</h3>
        </div>
        <div className={s.row}>
          <label className={s.field}>
            <span>로컬 저장 폴더</span>
            <input value={settings.saveDir} readOnly />
          </label>
          <Button size="md" variant="secondary" onClick={() => window.kiosk.settings.pickSaveDir().then(() => update({}))}>
            변경
          </Button>
          <Button size="md" variant="ghost" icon="external" onClick={() => window.kiosk.library.openFolder()}>
            열기
          </Button>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h3>편집 인코딩</h3>
          <span className={s.badge}>사용 중: {info?.activeEncoder ?? '감지 전'}</span>
        </div>
        <div className={s.grid2}>
          <label className={s.field}>
            <span>인코더</span>
            <select
              value={settings.encoder}
              onChange={(e) => update({ encoder: e.target.value as EncoderSetting })}
            >
              {ENCODERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className={s.field}>
            <span>품질</span>
            <select
              value={settings.encodePreset}
              onChange={(e) => update({ encodePreset: e.target.value as EncodePreset })}
            >
              {PRESETS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button size="md" variant="ghost" icon="refresh" onClick={redetect} disabled={busy === 'enc'}>
          {busy === 'enc' ? '측정 중…' : '인코더 다시 측정'}
        </Button>
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h3>Cloudflare R2</h3>
          <span className={`${s.badge} ${info?.storageConfigured ? s.badgeOk : s.badgeWarn}`}>
            {info?.storageConfigured ? '설정됨' : '설정 필요'}
          </span>
        </div>
        <div className={s.grid2}>
          {r2Field('accountId', 'Account ID')}
          {r2Field('bucket', '버킷 이름')}
          {r2Field('accessKeyId', 'Access Key ID')}
          {r2Field('secretAccessKey', 'Secret Access Key', { type: 'password' })}
        </div>
        <div className={s.grid2}>
          <label className={s.field}>
            <span>공유 링크 방식</span>
            <select value={r2.linkMode} onChange={(e) => setR2({ ...r2, linkMode: e.target.value as LinkMode })}>
              <option value="public">공개 도메인 (권장 · 짧은 QR)</option>
              <option value="presigned">서명 URL (7일 만료)</option>
            </select>
          </label>
          {r2Field('keyPrefix', '경로 접두사 (선택)', { placeholder: 'kiosk' })}
        </div>
        {r2.linkMode === 'public' &&
          r2Field('publicBaseUrl', '공개 URL', { placeholder: 'https://video.example.com 또는 https://pub-xxxx.r2.dev' })}
        <div className={s.row}>
          <Button size="md" onClick={saveR2} disabled={busy === 'r2'}>
            {busy === 'r2' ? '확인 중…' : '저장 및 연결 테스트'}
          </Button>
          {r2Status && <span className={r2Status.ok ? s.ok : s.err}>{r2Status.text}</span>}
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h3>화면</h3>
        </div>
        <label className={s.toggle}>
          <input
            type="checkbox"
            checked={settings.showCopyright}
            onChange={(e) => update({ showCopyright: e.target.checked })}
          />
          <span className={s.switch} />
          저작권 문구 표시
        </label>
      </section>
    </Modal>
  );
}
