// src/renderer/components/Footer/Footer.tsx
import React, { useEffect, useState } from 'react';
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
  const { ipcRenderer } = window.require("electron");
  const [copyright, setCopyright] = useState<boolean>(false);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const copyrightRes = await ipcRenderer.invoke('get-copyright-setting');
        setCopyright(copyrightRes || false);
      } catch (err) {
        console.error("copyright 데이터 불러오는 중 오류 발생: ", err);
      }
    };

      loadInitialData();
  }, []);

  return (
    <div className={`${styles.footer} ${styles[position]}`}>
      {(variant === 'logo' || variant === 'both') && (
        <div className={styles.logoWrapper}>
          <img src={window.electron.getLogoPath()} alt="Logo" />
          <div className={styles.divider} />
        </div>
      )}

      {(variant === 'copyright' || variant === 'both') &&
        copyright && (
          <small>
            &copy; 2025 HOWDOYOUDO. All rights reserved.
          </small>
        )}
    </div>
  );
};

export default Footer;
