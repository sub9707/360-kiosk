import React from 'react';
import styles from './ProgressBar.module.scss';

interface ProgressBarProps {
  progress: number; // 0-100
  timeLeft: number;
  showTimeLeft?: boolean;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ 
  progress, 
  timeLeft, 
  showTimeLeft = true 
}) => {
  return (
    <div className={styles.progressSection}>
      <div className={styles.progressBarContainer}>
        <div className={styles.progressBarBg}>
          <div
            className={styles.progressBar}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          >
            <div className={styles.progressShine}></div>
          </div>
        </div>
      </div>
      {showTimeLeft && (
        <p className={styles.timeLeft}>{timeLeft}초 남음</p>
      )}
    </div>
  );
};

export default ProgressBar;