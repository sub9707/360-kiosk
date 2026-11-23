import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SessionState } from '../../shared/types';
import { Icon } from '../components/Icon';
import { Shell } from '../components/Shell';
import { Button, ProgressRing, Spinner } from '../components/ui';
import { sessionActions, useSession } from '../hooks/useSession';
import s from './Shoot.module.scss';

export default function Shoot() {
  const navigate = useNavigate();
  const st = useSession();

  useEffect(() => {
    sessionActions.connect();
  }, []);

  useEffect(() => {
    if (st && (st.phase === 'processing' || st.phase === 'done')) navigate('/result');
  }, [st?.phase]);

  const goHome = () => {
    sessionActions.reset();
    navigate('/');
  };

  const commit = () => {
    sessionActions.commit();
    navigate('/result');
  };

  if (!st) return null;
  const step = ['review', 'error'].includes(st.phase) && st.rawUrl ? 1 : 0;

  return (
    <Shell step={step} camera={st.camera} onHome={goHome} actions={<Actions st={st} onCommit={commit} />}>
      <Stage st={st} />
    </Shell>
  );
}

function Stage({ st }: { st: SessionState }) {
  switch (st.phase) {
    case 'countdown':
      return (
        <div className={s.center} key="countdown">
          <p className={s.caption}>곧 촬영을 시작합니다</p>
          <div className={s.countdown} key={st.secondsLeft}>
            {st.secondsLeft}
          </div>
          <p className={s.hint}>원판 중앙에서 포즈를 준비하세요</p>
        </div>
      );

    case 'recording': {
      const elapsed = st.recordSeconds - st.secondsLeft;
      return (
        <div className={`${s.center} page-enter`} key="recording">
          <div className={s.rec}>
            <span className={s.recDot} /> REC
          </div>
          <ProgressRing value={elapsed / st.recordSeconds} size={560} stroke={18} tone="danger">
            <span className={s.bigNumber}>{st.secondsLeft}</span>
            <span className={s.unit}>초 남음</span>
          </ProgressRing>
          <p className={s.hint}>천천히 움직이며 다양한 포즈를 취해 보세요</p>
        </div>
      );
    }

    case 'transferring':
      return (
        <div className={`${s.center} page-enter`} key="transfer">
          <ProgressRing value={st.transferProgress} size={420} indeterminate={st.transferProgress === 0}>
            <span className={s.midNumber}>{Math.round(st.transferProgress * 100)}%</span>
          </ProgressRing>
          <h2 className={s.heading}>영상을 가져오는 중</h2>
          <p className={s.hint}>잠시만 기다려 주세요</p>
        </div>
      );

    case 'review':
    case 'error':
      if (st.rawUrl) {
        return (
          <div className={`${s.review} page-enter`} key="review">
            <div className={s.previewFrame}>
              <video src={st.rawUrl} autoPlay loop muted playsInline className={s.preview} />
              <div className={s.previewBadge}>
                {st.renderReady ? (
                  <>
                    <Icon name="check" size={18} /> 편집 준비 완료
                  </>
                ) : (
                  <>
                    <Spinner size={16} /> 편집 준비 중 {Math.round(st.renderProgress * 100)}%
                  </>
                )}
              </div>
            </div>
            {st.error ? (
              <p className={s.error}>
                <Icon name="alert" size={22} /> {st.error}
              </p>
            ) : (
              <p className={s.hint}>마음에 드시면 [완성]을, 아니라면 [다시 찍기]를 눌러 주세요</p>
            )}
          </div>
        );
      }
      return (
        <div className={`${s.center} page-enter`} key="error">
          <div className={s.errorIcon}>
            <Icon name="alert" size={72} />
          </div>
          <h2 className={s.heading}>문제가 발생했어요</h2>
          <p className={s.errorText}>{st.error}</p>
        </div>
      );

    default:
      // idle
      if (st.camera !== 'connected') {
        return (
          <div className={`${s.center} page-enter`} key="connecting">
            <ProgressRing value={0} size={300} indeterminate stroke={10}>
              <Icon name="camera" size={72} />
            </ProgressRing>
            <h2 className={s.heading}>카메라 연결 중</h2>
            <p className={s.hint}>{st.cameraMessage || '촬영 기기와 연결하고 있습니다'}</p>
          </div>
        );
      }
      return (
        <div className={`${s.center} page-enter`} key="ready">
          <div className={s.readyOrb}>
            <Icon name="rotate" size={140} strokeWidth={1.2} />
          </div>
          <h2 className={s.heading}>준비되셨나요?</h2>
          <p className={s.hint}>
            원판 중앙에 서서 버튼을 눌러 주세요
            <br />
            {st.recordSeconds}초 동안 360° 회전하며 촬영합니다
          </p>
          {st.error && (
            <p className={s.error}>
              <Icon name="alert" size={22} /> {st.error}
            </p>
          )}
        </div>
      );
  }
}

function Actions({ st, onCommit }: { st: SessionState; onCommit: () => void }) {
  switch (st.phase) {
    case 'idle':
      return (
        <Button
          size="xl"
          icon="camera"
          onClick={sessionActions.start}
          disabled={st.camera !== 'connected'}
          primaryHotkey
        >
          촬영 시작
        </Button>
      );
    case 'countdown':
    case 'recording':
      return (
        <Button size="lg" variant="secondary" icon="stop" onClick={sessionActions.stop}>
          {st.phase === 'countdown' ? '취소' : '촬영 중지'}
        </Button>
      );
    case 'review':
    case 'error':
      return (
        <>
          <Button size="xl" variant="secondary" icon="refresh" onClick={sessionActions.retake}>
            다시 찍기
          </Button>
          {st.rawUrl && !(st.error && st.phase === 'review') && (
            <Button size="xl" icon="arrowRight" onClick={onCommit} primaryHotkey>
              완성
            </Button>
          )}
        </>
      );
    default:
      return null;
  }
}
