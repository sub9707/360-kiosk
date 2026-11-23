import { useState } from 'react';
import type { BrandAsset, BrandAssetInfo } from '../../shared/types';
import { refreshBranding, useBranding } from '../hooks/useBranding';
import s from './BrandingSection.module.scss';
import f from './forms.module.scss';
import { Button } from './ui';

/** 설정 > 로고 · 영상 소스 */
export default function BrandingSection() {
  const list = useBranding();
  const [busy, setBusy] = useState<BrandAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (kind: BrandAsset) => {
    setBusy(kind);
    setError(null);
    const res = await window.kiosk.branding.pick(kind);
    if (res && !res.ok) setError(res.error ?? '파일을 적용하지 못했습니다');
    await refreshBranding();
    setBusy(null);
  };

  const reset = async (kind: BrandAsset) => {
    setBusy(kind);
    setError(null);
    await window.kiosk.branding.reset(kind);
    await refreshBranding();
    setBusy(null);
  };

  return (
    <section className={f.section}>
      <div className={f.sectionHead}>
        <h3>로고 · 영상 소스</h3>
      </div>
      <ul className={s.list}>
        {list?.map((a) => (
          <li key={a.kind} className={s.row}>
            <Preview asset={a} />
            <div className={s.info}>
              <span className={s.label}>{a.label}</span>
              <span className={s.name} title={a.name}>
                {a.custom ? a.name : '기본 파일'}
                {a.duration ? <em> · {a.duration.toFixed(1)}초</em> : null}
              </span>
            </div>
            <div className={s.actions}>
              {a.custom && (
                <Button size="md" variant="ghost" onClick={() => reset(a.kind)} disabled={!!busy}>
                  기본으로
                </Button>
              )}
              <Button size="md" variant="secondary" onClick={() => pick(a.kind)} disabled={!!busy}>
                {busy === a.kind ? '적용 중…' : '변경'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className={f.err}>{error}</p>}
      <p className={f.note}>
        다음 촬영부터 적용됩니다. 영상은 9:16으로 잘라 쓰며, 배경음악이 짧으면 반복합니다.
      </p>
    </section>
  );
}

function Preview({ asset }: { asset: BrandAssetInfo }) {
  if (!asset.url) return <div className={s.thumb} />;
  if (asset.kind === 'logo') {
    return (
      <div className={`${s.thumb} ${s.logo}`}>
        <img src={asset.url} alt="" />
      </div>
    );
  }
  if (asset.kind === 'bgm') {
    return <audio src={asset.url} controls className={s.audio} />;
  }
  return (
    <video
      src={asset.url + '#t=0.5'}
      className={`${s.thumb} ${s.video}`}
      muted
      preload="metadata"
      title="눌러서 재생"
      onClick={(e) => {
        const v = e.currentTarget;
        if (v.paused) v.play();
        else v.pause();
      }}
    />
  );
}
