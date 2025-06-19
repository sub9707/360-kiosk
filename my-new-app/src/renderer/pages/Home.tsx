import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import styles from './Home.module.scss';

import sampleVideo from '/src/renderer/assets/videos/sample-background.mp4';
import Logo from '/src/renderer/assets/icons/logo.png';
import FolderIcon from '/src/renderer/assets/icons/folder.svg';
import VideoManagementModal from '../components/VideoManagementModal/VideoManagementModal';

const Home: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [videoSource, setVideoSource] = useState<string>(sampleVideo);
    const [isVideoLoading, setIsVideoLoading] = useState(false);

    // 최신 배경 영상 로드 (임시로 비활성화)
    useEffect(() => {
        const loadBackgroundVideo = async () => {
            try {
                console.log('🎬 [Home] 배경 영상 로드 시작');
                setIsVideoLoading(true);

                // Electron IPC 사용 가능 여부 확인
                if (typeof window !== 'undefined' && window.electron && window.electron.ipcRenderer) {
                    console.log('✅ [Home] Electron IPC 사용 가능');
                    
                    try {
                        // IPC를 통해 최신 배경 영상 요청
                        const result = await window.electron.ipcRenderer.invoke('get-latest-background-video');
                        
                        if (result.success && result.videoPath && !result.useDefault) {
                            // 로컬 파일 경로를 file:// URL로 변환
                            const fileUrl = `file:///${result.videoPath.replace(/\\/g, '/')}`;
                            console.log('✅ [Home] 최신 배경 영상 로드:', result.fileName);
                            console.log('🔗 [Home] File URL:', fileUrl);
                            setVideoSource(fileUrl);
                        } else {
                            console.log('ℹ️ [Home] 기본 샘플 영상 사용:', result.error || 'No custom video found');
                            setVideoSource(sampleVideo);
                        }
                    } catch (ipcError) {
                        console.error('❌ [Home] IPC 호출 실패:', ipcError);
                        setVideoSource(sampleVideo);
                    }
                } else {
                    console.warn('⚠️ [Home] Electron IPC가 사용 불가능합니다. 기본 영상을 사용합니다.');
                    console.log('🔧 [Home] window.electron:', typeof window !== 'undefined' ? window.electron : 'window undefined');
                    setVideoSource(sampleVideo);
                }
            } catch (error) {
                console.error('❌ [Home] 배경 영상 로드 실패:', error);
                console.log('🔄 [Home] 기본 샘플 영상으로 대체');
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
        console.log('🔄 [Home] 샘플 영상으로 대체');
        if (videoSource !== sampleVideo) {
            setVideoSource(sampleVideo);
        }
    };

    // 영상 로드 완료 처리
    const handleVideoLoaded = () => {
        console.log('✅ [Home] 배경 영상 로드 완료');
        setIsVideoLoading(false);
    };

    const handleOpenModal = () => {
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    return (
        <div className={styles.pageWrapper}>
            {/** 배경화면 */}
            <div className={styles.backgroundWrapper}>
                <div className={styles.background}>
                    <div className={styles.overlay} />
                    {/* 로딩 상태 표시 (선택사항) */}
                    {isVideoLoading && (
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            color: 'white',
                            fontSize: '18px',
                            zIndex: 1
                        }}>
                            영상 로딩 중...
                        </div>
                    )}
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

            {/* Folder Icon Button */}
            <button className={styles.folderButton} onClick={handleOpenModal}>
                <img src={FolderIcon} alt="Manage Videos" />
            </button>

            {/* Video Management Modal */}
            <VideoManagementModal isOpen={isModalOpen} onClose={handleCloseModal} />
        </div>
    );
};

export default Home;