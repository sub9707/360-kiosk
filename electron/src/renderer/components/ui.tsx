import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { CameraStatus } from '../../shared/types';
import { Icon, type IconName } from './Icon';
import s from './ui.module.scss';

// ───────────── Button ─────────────

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg' | 'xl';
  icon?: IconName;
  primaryHotkey?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'lg', icon, primaryHotkey, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${s.btn} ${s[variant]} ${s[size]} ${className}`}
      data-hotkey={primaryHotkey ? 'primary' : undefined}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'md' ? 20 : 28} />}
      <span>{children}</span>
    </button>
  );
});

export function IconButton({
  icon,
  label,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button className={`${s.iconBtn} ${className}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={26} />
    </button>
  );
}

// ───────────── ProgressRing ─────────────

export function ProgressRing({
  value,
  size = 360,
  stroke = 14,
  indeterminate = false,
  tone = 'accent',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  indeterminate?: boolean;
  tone?: 'accent' | 'danger';
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={`${s.ring} ${indeterminate ? s.indeterminate : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className={s.ringTrack} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={`${s.ringValue} ${s[tone]}`}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={indeterminate ? c * 0.72 : c * (1 - v)}
        />
      </svg>
      <div className={s.ringContent}>{children}</div>
    </div>
  );
}

export function Spinner({ size = 28 }: { size?: number }) {
  return <span className={s.spinner} style={{ width: size, height: size }} />;
}

// ───────────── Status pill ─────────────

const CAMERA_LABEL: Record<CameraStatus, string> = {
  connected: '카메라 연결됨',
  connecting: '카메라 연결 중',
  disconnected: '카메라 연결 안 됨',
};

export function CameraPill({ status }: { status: CameraStatus }) {
  return (
    <div className={`${s.pill} ${s[`pill_${status}`]}`}>
      <span className={s.dot} />
      {CAMERA_LABEL[status]}
    </div>
  );
}

// ───────────── Stepper ─────────────

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className={s.stepper}>
      {steps.map((label, i) => (
        <li key={label} className={i < current ? s.stepDone : i === current ? s.stepActive : ''}>
          <span className={s.stepIndex}>{i < current ? <Icon name="check" size={16} /> : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}

// ───────────── Modal ─────────────

export function Modal({
  title,
  onClose,
  children,
  width = 920,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  return (
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal} style={{ width }} role="dialog" aria-modal>
        <header className={s.modalHeader}>
          <h2>{title}</h2>
          <IconButton icon="close" label="닫기" onClick={onClose} />
        </header>
        <div className={s.modalBody}>{children}</div>
        {footer && <footer className={s.modalFooter}>{footer}</footer>}
      </div>
    </div>
  );
}
