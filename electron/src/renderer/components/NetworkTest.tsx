import { useEffect, useState } from 'react';
import type { NetGrade, NetTestResult } from '../../shared/types';
import { Icon } from './Icon';
import s from './NetworkTest.module.scss';
import { Button, Spinner } from './ui';

const GRADES: { key: NetGrade; label: string }[] = [
  { key: 'concern', label: '우려' },
  { key: 'recommended', label: '권장' },
  { key: 'best', label: '최고' },
];

const LABEL: Record<NetGrade, string> = { concern: '우려', recommended: '권장', best: '최고' };

const SUMMARY: Record<NetGrade, string> = {
  best: '행사 운영에 최적인 네트워크입니다.',
  recommended: '운영에 문제없는 수준입니다.',
  concern: '처리 시간이 길어지거나 실패할 수 있습니다. 아래 안내를 확인하세요.',
};

/**
 * 전체 제한 시간. main 의 단계별 제한(합계 80초)을 넘겼는데도 결과가 오지 않으면
 * main 쪽이 멈춘 것으로 보고 실패 처리한다.
 */
const TOTAL_TIMEOUT_MS = 90_000;

/** 진행 단계 이름이 이 시간 동안 바뀌지 않으면 "응답 지연" 경고 표시 */
const SLOW_STEP_MS = 15_000;

/** 우려 · 권장 · 최고 3칸 막대 */
export function GradeMeter({ grade }: { grade: NetGrade | null }) {
  return (
    <div className={s.meter} aria-label={grade ? LABEL[grade] : '측정 불가'}>
      {GRADES.map((g) => (
        <span key={g.key} className={`${s.seg} ${grade === g.key ? s[g.key] : ''}`}>
          {g.label}
        </span>
      ))}
    </div>
  );
}

// 설정 모달을 닫았다 열어도 마지막 결과 유지
let lastResult: NetTestResult | null = null;

export default function NetworkTest({ unsaved = [] }: { unsaved?: string[] }) {
  const [result, setResult] = useState<NetTestResult | null>(lastResult);
  const [step, setStep] = useState<string | null>(null);
  const [stepSince, setStepSince] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      window.kiosk.network.onProgress((name) => {
        setStep(name);
        setStepSince(Date.now());
      }),
    [],
  );

  // 진행 중에는 경과 시간 표시를 위해 1초마다 갱신
  const running = step !== null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const run = async () => {
    // 입력칸에 저장 안 된 값이 있으면 그 값으로 측정할 수 없으므로 막는다
    if (unsaved.length) {
      setError(`저장하지 않은 입력값이 있습니다 (${unsaved.join(', ')}). 먼저 저장한 뒤 테스트하세요.`);
      return;
    }
    setError(null);
    setStep('준비 중');
    setStepSince(Date.now());
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const r = await Promise.race([
        window.kiosk.network.test(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), TOTAL_TIMEOUT_MS);
        }),
      ]);
      lastResult = r;
      setResult(r);
    } catch (e: any) {
      setError(
        e?.message === 'timeout'
          ? `테스트가 ${TOTAL_TIMEOUT_MS / 1000}초 안에 끝나지 않아 실패 처리했습니다. 네트워크 연결을 확인한 뒤 다시 시도하세요.`
          : `테스트 실행 실패: ${e?.message ?? e}`,
      );
    } finally {
      clearTimeout(timer);
      setStep(null);
    }
  };

  const stepElapsed = Math.max(0, Math.floor((now - stepSince) / 1000));

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        {result?.overall && !running && !error ? (
          <div className={`${s.overall} ${s[`o_${result.overall}`]}`}>
            <strong>종합 {LABEL[result.overall]}</strong>
            <span>{SUMMARY[result.overall]}</span>
          </div>
        ) : (
          <p className={s.desc}>
            {running ? (
              <>
                <Spinner size={18} /> {step}… <span className={s.elapsed}>{stepElapsed}초</span>
                {stepElapsed * 1000 >= SLOW_STEP_MS && <span className={s.slow}>응답이 늦어지고 있습니다</span>}
              </>
            ) : (
              '폰·PC 사이 전송 속도와 R2 업로드 속도를 측정합니다. (약 15초)'
            )}
          </p>
        )}
        <Button size="md" variant="secondary" icon="refresh" onClick={run} disabled={running}>
          {running ? '측정 중' : result ? '다시 측정' : '테스트 실행'}
        </Button>
      </div>

      {error && (
        <div className={s.errorBox}>
          <Icon name="alert" size={18} /> {error}
        </div>
      )}

      {result && result.inputErrors.length > 0 && !running && (
        <div className={s.errorBox}>
          <Icon name="alert" size={18} />
          <div>
            <strong>입력값을 확인하세요</strong>
            <ul>
              {result.inputErrors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {result && (
        <ul className={`${s.list} ${running ? s.dim : ''}`}>
          {result.checks.map((c) => (
            <li key={c.id} className={s.row}>
              <div className={s.info}>
                <span className={s.label}>{c.label}</span>
                <span className={s.value}>{c.value}</span>
                {c.estimate && <span className={s.estimate}>{c.estimate}</span>}
                {c.note && (
                  <span className={c.grade === 'concern' ? s.noteWarn : s.note}>
                    {c.grade === 'concern' && <Icon name="alert" size={14} />} {c.note}
                  </span>
                )}
              </div>
              <GradeMeter grade={c.grade} />
            </li>
          ))}
        </ul>
      )}
      {result && !running && (
        <p className={s.time}>측정 시각 {new Date(result.finishedAt).toLocaleTimeString()}</p>
      )}
    </div>
  );
}
