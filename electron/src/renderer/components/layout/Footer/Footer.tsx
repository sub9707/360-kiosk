// src/renderer/components/Footer/Footer.tsx
import React from 'react';
import styles from './Footer.module.scss';
import { useEnvConfig } from '../../../hooks/useEnvConfig';

interface FooterProps {
  variant?: 'logo' | 'copyright' | 'both';
  position?: 'fixed' | 'absolute';
}

const Footer: React.FC<FooterProps> = ({ 
  variant = 'logo', 
  position = 'fixed' 
}) => {
  const { config } = useEnvConfig();

  // 로고 경로는 preload에서 가져오기
  const logoSrc = window.electron.getLogoPath();

  return (
    <div className={`${styles.footer} ${styles[position]}`}>
      {(variant === 'logo' || variant === 'both') && (
        <div className={styles.logoWrapper}>
          <img src={logoSrc} alt="logo" />
          <div className={styles.divider} />
        </div>
      )}

      {(variant === 'copyright' || variant === 'both') && 
        config?.copyright && (
          <small>
            &copy; 2025 HOWDOYOUDO. All rights reserved.
          </small>
      )}
    </div>
  );
};

export default Footer;
