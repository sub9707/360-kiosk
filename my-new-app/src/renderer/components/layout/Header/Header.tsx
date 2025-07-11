// src/renderer/components/layout/Header/Header.tsx (새로운 폴더 생성)

import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Header.module.scss';
import HomeIcon from '/src/renderer/assets/icons/home.svg';

interface HeaderProps {
  status?: string | React.ReactNode;
  showHomeButton?: boolean;
  onHomeClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  status, 
  showHomeButton = true, 
  onHomeClick 
}) => {
  const navigate = useNavigate();

  const handleHomeClick = () => {
    if (onHomeClick) {
      onHomeClick();
    } else {
      navigate('/');
    }
  };

  return (
    <div className={styles.menubar}>
      <div className={styles.menubarWrapper}>
        {showHomeButton && (
          <button onClick={handleHomeClick} className={styles.homeBtn}>
            <img src={HomeIcon} alt="Home" />
          </button>
        )}
        {status && (
          <div className={styles.status}>
            {status}
          </div>
        )}
      </div>
    </div>
  );
};

export default Header;