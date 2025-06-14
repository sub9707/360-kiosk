import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Home.module.scss';

import sample from '/src/renderer/assets/videos/sample-background.mp4';
import Logo from '/src/renderer/assets/icons/logo.png';

const Home: React.FC = () => {
    return (
        <div className={styles.pageWrapper}>
            {/** 배경화면 */}
            <div className={styles.backgroundWrapper}>
                <div className={styles.background}>
                    <div className={styles.overlay} />
                    <video autoPlay loop muted className={styles.videoSource}>
                        <source src={sample} type='video/mp4' />
                    </video>
                </div>
            </div>
            {/** 상단 메인 UI */}
            <div className={styles.mainWrapper}>
                <div className={styles.mainContainer}>
                    <Link to={'/film'} className={styles.startBtn}>촬영 시작</Link>
                </div>
            </div>
            <div className={styles.logo}>
                <div className={styles.logoWrapper}>
                    <img src={Logo} alt='logo' />
                    <div className={styles.divider} />
                </div>
            </div>
            <footer className={styles.footer}>
                <small>&copy; 2025 HOWDOYOUDO. All rights reserved.</small>
            </footer>
        </div>
    );
};

export default Home;