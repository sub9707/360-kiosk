import type { ReactNode } from 'react';
import type { CameraStatus } from '../../shared/types';
import { Copyright } from './Brand';
import s from './Shell.module.scss';
import { CameraPill, IconButton, Stepper } from './ui';

export const STEPS = ['촬영', '확인', '완성'];

/** 촬영/결과 화면 공통 레이아웃 */
export function Shell({
  step,
  camera,
  onHome,
  children,
  actions,
}: {
  step: number;
  camera?: CameraStatus;
  onHome: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={s.page}>
      <div className={s.glow} />
      <header className={s.top}>
        <IconButton icon="home" label="처음으로" onClick={onHome} />
        <Stepper steps={STEPS} current={step} />
        <div className={s.topRight}>{camera && <CameraPill status={camera} />}</div>
      </header>
      <main className={s.stage}>{children}</main>
      <footer className={s.bottom}>
        <div className={s.actions}>{actions}</div>
        <Copyright />
      </footer>
    </div>
  );
}
