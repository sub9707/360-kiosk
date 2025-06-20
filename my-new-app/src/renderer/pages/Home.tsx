import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import styles from './Home.module.scss';

import sampleVideo from '/src/renderer/assets/videos/sample-background.mp4';
import Logo from '/src/renderer/assets/icons/logo.png';
import FolderIcon from '/src/renderer/assets/icons/folder.svg';
import SettingIcon from '/src/renderer/assets/icons/setting.svg';
import SettingsModal from '../components/SettingsModal/SettingsModal';
import VideoManagementModal from '../components/VideoManagementModal/VideoManagementModal';

const Home: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [videoSource, setVideoSource] = useState<string>(sampleVideo);
    const [isVideoLoading, setIsVideoLoading] = useState(false);

    const startButtonRef = useRef<HTMLAnchorElement>(null);

    // 최신 배경 영상 로드 (임시로 비활성화)
    useEffect(() => {
        const loadBackgroundVideo = async () => {
            try {
                console.log('🎬 [Home] 배경 영상 로드 시작');
                setIsVideoLoading(true);

                // Electron IPC 사용 가능 여부 확인
                if (typeof window !== 'undefined' && window.electron && window.electron.ipcRenderer) {

                    try {
                        // IPC를 통해 최신 배경 영상 요청
                        const result = await window.electron.ipcRenderer.invoke('get-latest-background-video');

                        if (result.success && result.videoPath && !result.useDefault) {
                            // 로컬 파일 경로를 file:// URL로 변환
                            const fileUrl = `file:///${result.videoPath.replace(/\\/g, '/')}`;
                            setVideoSource(fileUrl);
                        } else {
                            setVideoSource(sampleVideo);
                        }
                    } catch (ipcError) {
                        console.error('❌ [Home] IPC 호출 실패:', ipcError);
                        setVideoSource(sampleVideo);
                    }
                } else {
                    console.warn('⚠️ [Home] Electron IPC가 사용 불가능합니다. 기본 영상을 사용합니다.');
                    setVideoSource(sampleVideo);
                }
            } catch (error) {
                console.error('❌ [Home] 배경 영상 로드 실패:', error);
                setVideoSource(sampleVideo);
            } finally {
                setIsVideoLoading(false);
            }
        };

        loadBackgroundVideo();
    }, []);

    // 영상 로드 에러 처리
    const handleVideoError = (error: React.SyntheticEvent<HTMLVideoElement, Event>) => {
        console.error('❌ [Home] 영상 재생 오류:', error);
        if (videoSource !== sampleVideo) {
            setVideoSource(sampleVideo);
        }
    };

    // 영상 로드 완료 처리
    const handleVideoLoaded = () => {
        setIsVideoLoading(false);
    };

    const handleOpenModal = () => {
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    // HID 디바이스 관련 코드

    // 페이지 업 키 이벤트 등록
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'PageUp' && startButtonRef.current) {
                startButtonRef.current.click();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);


    return (
        <div className={styles.pageWrapper}>
            {/** 배경화면 */}
            <div className={styles.backgroundWrapper}>
                <div className={styles.background}>
                    <div className={styles.overlay} />
                    {/* 로딩 상태 표시 (선택사항) */}
                    <video
                        autoPlay
                        loop
                        muted
                        className={styles.videoSource}
                        onError={handleVideoError}
                        onLoadedData={handleVideoLoaded}
                        onCanPlay={handleVideoLoaded}
                        key={videoSource} // 소스 변경 시 video 요소 재렌더링
                    >
                        <source src={videoSource} type='video/mp4' />
                        {/* 브라우저가 video 태그를 지원하지 않는 경우 */}
                        Your browser does not support the video tag.
                    </video>
                </div>
            </div>
            {/** 상단 메인 UI */}
            <div className={styles.mainWrapper}>
                <div className={styles.mainContainer}>
                    <Link to={'/film'} ref={startButtonRef} className={styles.startBtn}>촬영 시작</Link>
                </div>
            </div>
            <div className={styles.logo}>
                <div className={styles.logoWrapper}>
                    <img src={Logo} alt='logo' />
                    <div className={styles.divider} />
                </div>
            </div>

            <footer className={styles.footer}>
                {
                    (process.env.footer === 'true' && process.env.footer) &&
                    <small>&copy; 2025 HOWDOYOUDO. All rights reserved.</small>
                }
            </footer>

            {/* Settings Button */}
            <button className={styles.settingsButton} onClick={() => setIsSettingsModalOpen(true)}>
                <img src={SettingIcon} alt="Settings" />
            </button>

            {/* Folder Icon Button */}
            <button className={styles.folderButton} onClick={handleOpenModal}>
                <img src={FolderIcon} alt="Manage Videos" />
            </button>

            {/* Settings Modal */}
            <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} />

            {/* Video Management Modal */}
            <VideoManagementModal isOpen={isModalOpen} onClose={handleCloseModal} />

        </div>
    );
};

export default Home;