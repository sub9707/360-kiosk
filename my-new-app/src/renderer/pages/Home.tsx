import React from 'react';
import styles from './Home.module.scss';

import sample from '/src/renderer/assets/videos/sample-background.mp4';
import { Link } from 'react-router-dom';

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
                    <div className={styles.titleBox}>
                        <h1>빙글빙글 카메라<br/>키오스크</h1>
                        <p>빙글빙글 도는 카메라로 촬영하고 <br/>편집 영상을 확인해보세요</p>
                    </div>
                    <Link to={'/film'} className={styles.startBtn}>시작하기</Link>
                </div>
            </div>
            <footer className={styles.footer}>
                <small>&copy; 2025 YourCompanyName. All rights reserved.</small>
            </footer>
        </div>
    );
};

export default Home;