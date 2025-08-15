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

  return (
    <div className={`${styles.footer} ${styles[position]}`}>
      {(variant === 'logo' || variant === 'both') && (
        <div className={styles.logoWrapper}>
          <img src={window.electron.getLogoPath()} alt="Logo" />
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
