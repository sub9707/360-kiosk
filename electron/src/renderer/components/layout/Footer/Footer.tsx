import React from 'react';
import styles from './Footer.module.scss';
import Logo from '/src/renderer/assets/icons/logo.png';
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
          <img src={Logo} alt="logo" />
          <div className={styles.divider} />
        </div>
      )}
      
      {(variant === 'copyright' || variant === 'both') && config?.copyright && (
        <small>&copy; 2025 HOWDOYOUDO. All rights reserved.</small>
      )}
    </div>
  );
};

export default Footer;