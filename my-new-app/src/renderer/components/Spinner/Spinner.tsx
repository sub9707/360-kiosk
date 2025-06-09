// Spinner.tsx
import React from 'react';
import styles from './Spinner.module.scss';

const Spinner = () => {
  return (
    <div className={styles.spinner}>
      <div className={styles.spinnerRing}></div>
    </div>
  );
};

export default Spinner;
