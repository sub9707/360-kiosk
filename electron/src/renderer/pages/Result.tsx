import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionState } from '../../shared/types';
import { Icon } from '../components/Icon';
import { QrCode } from '../components/QrCode';
import { Shell } from '../components/Shell';
import { Button, ProgressRing } from '../components/ui';
import { sessionActions, useSession } from '../hooks/useSession';
import s from './Result.module.scss';

const AUTO_HOME_SECONDS = 120;

export default function Result() {
  const navigate = useNavigate();
  const st = useSession();

  const goHome = () => {
    sessionActions.reset();
    navigate('/');
  };

  // 세션이 초기화되었으면(다른 경로로 리셋 등) 홈으로
  useEffect(() => {
    if (!st) return;
    if (st.phase === 'idle') navigate('/');
    // 완성 요청이 거부된 경우(R2 미설정 등) 확인 화면으로 복귀
    else if (st.phase === 'review' && st.error) navigate('/shoot');
  }, [st?.phase, st?.error]);

  if (!st) return null;
  const videoUrl = st.editedUrl ?? st.rawUrl;

  return (
    <Shell
      step={st.phase === 'done' ? 3 : 2}
      onHome={goHome}
      actions={
        st.phase === 'error' ? (
          <>
            <Button size="xl" variant="secondary" onClick={goHome}>
              처음으로
            </Button>
            <Button size="xl" onClick={sessionActions.commit} primaryHotkey>
              다시 시도
            </Button>
          </>
        ) : (
          <Button
            size="xl"
            variant={st.phase === 'done' ? 'primary' : 'secondary'}
           
            onClick={goHome}
            primaryHotkey={st.phase === 'done'}
          >
            처음으로
          </Button>
        )
      }
    >
      <div className={`${s.layout} page-enter`}>
        <div className={s.videoFrame}>
          {videoUrl && (
            <video
              key={videoUrl}
              src={videoUrl}
              autoPlay
              loop
              muted={!st.editedUrl}
              playsInline
              className={s.video}
            />
          )}
        </div>
        <div className={s.panel}>
          {st.phase === 'done' && st.shareUrl ? (
            <Done url={st.shareUrl} onTimeout={goHome} st={st} />
          ) : st.phase === 'error' ? (
            <div className={s.errorBox}>
              <div>
                <strong>완성하지 못했어요</strong>
                <p>{st.error}</p>
              </div>
            </div>
          ) : (
            <Processing st={st} />
          )}
        </div>
      </div>
    </Shell>
  );
}

function Processing({ st }: { st: SessionState }) {
  const rendering = !st.renderReady;
  // 편집 60%, 업로드 40% 가중치로 전체 진행률 표시
  const total = rendering ? st.renderProgress * 0.6 : 0.6 + st.uploadProgress * 0.4;
  return (
    <div className={s.processing}>
      <ProgressRing value={total} size={240} stroke={5}>
        <span className={s.percent}>{Math.round(total * 100)}%</span>
      </ProgressRing>
      <div className={s.steps}>
        <h2>{rendering ? '영상을 편집하고 있어요' : '영상을 업로드하고 있어요'}</h2>
        <StepRow label="슬로모션 편집" value={st.renderProgress} active={rendering} />
        <StepRow label="클라우드 업로드" value={st.uploadProgress} active={!rendering} />
      </div>
    </div>
  );
}

function StepRow({ label, value, active }: { label: string; value: number; active: boolean }) {
  const done = value >= 1;
  return (
    <div className={`${s.stepRow} ${active ? s.active : ''} ${done ? s.done : ''}`}>
      <span className={s.stepIcon}>{done ? <Icon name="check" size={18} /> : null}</span>
      <span className={s.stepLabel}>{label}</span>
      <span className={s.bar}>
        <span style={{ transform: `scaleX(${value})` }} />
      </span>
    </div>
  );
}

function Done({ url, onTimeout, st }: { url: string; onTimeout: () => void; st: SessionState }) {
  const [left, setLeft] = useState(AUTO_HOME_SECONDS);

  useEffect(() => {
    const t = setInterval(() => setLeft((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (left <= 0) onTimeout();
  }, [left]);

  return (
    <div className={s.done}>
      <QrCode url={url} className={s.qr} />
      <div className={s.doneText}>
        <h2>완성되었어요</h2>
        <p>
          스마트폰 카메라로 QR 코드를 스캔해
          <br />
          영상을 저장하세요
        </p>
        <small>
          {left}초 후 처음 화면으로 돌아갑니다
          {st.timings.total ? ` · 처리 ${(st.timings.total / 1000).toFixed(1)}초` : ''}
        </small>
      </div>
    </div>
  );
}
