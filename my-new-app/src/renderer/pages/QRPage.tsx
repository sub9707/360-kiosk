import React, { useState, useEffect } from 'react';
import styles from './QRPage.module.scss';
import { Link } from 'react-router-dom';

import HomeIcon from '/src/renderer/assets/icons/home.svg';

const QRPage: React.FC = () => {
    const { ipcRenderer } = window.require("electron");
    const [videoSrc, setVideoSrc] = useState<string>('');
    const [videoFileName, setVideoFileName] = useState<string>('');
    const [videoType, setVideoType] = useState<string>('loading');

    useEffect(() => {
        const loadVideo = async () => {
            // localStorage에서 편집된 비디오 경로 가져오기
            const savedVideoPath = localStorage.getItem('editedVideoPath');
            
            let targetPath = '';
            let type = '';

            if (savedVideoPath) {
                // 편집된 영상이 실제로 존재하는지 확인
                try {
                    const fs = window.require('fs');
                    if (fs.existsSync(savedVideoPath)) {
                        targetPath = savedVideoPath;
                        type = 'edited';
                        localStorage.removeItem('editedVideoPath');
                    }
                } catch (error) {
                    console.warn('편집된 영상 확인 중 오류:', error);
                }
            }

            // 편집된 영상이 없거나 존재하지 않으면 최신 영상 찾기
            if (!targetPath) {
                try {
                    const result = await ipcRenderer.invoke('find-latest-video');
                    if (result.success) {
                        targetPath = result.path;
                        type = result.type;
                    } else {
                        setVideoType('error');
                        return;
                    }
                } catch (error) {
                    console.error('최신 영상 로드 오류:', error);
                    setVideoType('error');
                    return;
                }
            }

            // 비디오 데이터를 blob URL로 변환
            try {
                const videoBlob = await ipcRenderer.invoke('get-video-blob', targetPath);
                if (videoBlob.success) {
                    const blob = new Blob([new Uint8Array(videoBlob.data)], { type: 'video/mp4' });
                    const blobUrl = URL.createObjectURL(blob);
                    setVideoSrc(blobUrl);
                    
                    const fileName = targetPath.split(/[\\/]/).pop() || '';
                    setVideoFileName(fileName);
                    setVideoType(type);
                } else {
                    setVideoType('error');
                }
            } catch (error) {
                console.error('비디오 blob 변환 오류:', error);
                setVideoType('error');
            }

            // localStorage 정리
            localStorage.removeItem('editedVideoPath');
        };

        loadVideo();

        // Cleanup: blob URL 해제
        return () => {
            if (videoSrc && videoSrc.startsWith('blob:')) {
                URL.revokeObjectURL(videoSrc);
            }
        };
    }, []);

    return (
        <div className={styles.pageWrapper}>
            <div className={styles.videoResult}>
                <div className={styles.videoPlayer}>
                    {videoSrc && videoType !== 'error' ? (
                        <video
                            width="100%"
                            height="100%"
                            autoPlay
                            muted
                            loop
                            controls
                            style={{ 
                                objectFit: 'contain',
                                backgroundColor: '#000' 
                            }}
                        >
                            <source src={videoSrc} type="video/mp4" />
                            브라우저가 비디오를 지원하지 않습니다.
                        </video>
                    ) : videoType === 'error' ? (
                        <div style={{ 
                            width: '100%', 
                            height: '100%', 
                            backgroundColor: '#333',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white'
                        }}>
                            영상을 불러올 수 없습니다
                        </div>
                    ) : (
                        <div style={{ 
                            width: '100%', 
                            height: '100%', 
                            backgroundColor: '#333',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white'
                        }}>
                            영상을 불러오는 중...
                        </div>
                    )}
                </div>
                <p>
                    {videoType === 'loading' && '비디오를 불러오는 중...'}
                    {videoType === 'edited' && `✅ 편집된 영상: ${videoFileName}`}
                    {videoType === 'latest' && `📽️ 최신 영상: ${videoFileName}`}
                    {videoType === 'sample' && `🎬 샘플 영상: ${videoFileName}`}
                    {videoType === 'error' && '❌ 영상을 불러올 수 없습니다'}
                </p>
            </div>
            <div className={styles.qrCode}>
                <div className={styles.codeBox}></div>
                <p>QR코드를 확인하고 영상을 다운로드하세요</p>
            </div>
            <Link to={'/'} className={styles.homeBtn}>
                <img src={HomeIcon}/>메인화면
            </Link>
            <footer>
                <small>&copy; 2025 YourCompanyName. All rights reserved.</small>
            </footer>
        </div>
    );
};

export default QRPage;