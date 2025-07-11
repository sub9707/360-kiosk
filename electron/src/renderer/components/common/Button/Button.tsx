// src/renderer/components/common/Button/Button.tsx (새로운 폴더 생성)

import React from 'react';
import styles from './Button.module.scss';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'transparent';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  className?: string;
  ref?: React.RefObject<HTMLButtonElement>;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    children, 
    onClick, 
    variant = 'primary', 
    size = 'medium', 
    disabled = false, 
    className = '',
    ...props 
  }, ref) => {
    const buttonClass = [
      styles.button,
      styles[variant],
      styles[size],
      className
    ].filter(Boolean).join(' ');

    return (
      <button
        ref={ref}
        className={buttonClass}
        onClick={onClick}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;