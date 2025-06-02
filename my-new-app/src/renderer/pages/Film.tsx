import React, { useState, useEffect } from 'react';
import styles from './Film.module.scss';
import { Link, useNavigate } from 'react-router-dom';

import HomeIcon from '/src/renderer/assets/icons/home.svg';
import Logo from '/src/renderer/assets/icons/logo.png';

const Film: React.FC = () => {
    const { ipcRenderer } = window.require("electron");
    const navigate = useNavigate();

    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [connectError, setConnectError] = useState(false);
    const [editingState, setEditingState] = useState('편집 시작');
    const [recordedPath, setRecordedPath] = useState<string | null>(null);
    
    // 프로그레스 바를 위한 상태
    const [timeLeft, setTimeLeft] = useState(15);
    const [progress, setProgress] = useState(100);

    const handleConnectCamera = () => {
        // 재연결 시 상태 초기화
        setIsConnecting(true);
        setConnectError(false);
        setIsConnected(false);
        
        ipcRenderer.send("camera-connect");
    };

    const handleStartRecording = () => {
        if (!isConnected) return;
        
        // 프로그레스 바 초기화
        setTimeLeft(15);
        setProgress(100);
        
        ipcRenderer.send("camera-record-start");
    };

    const handleStopRecording = () => {
        if (!isRecording) return;
        
        ipcRenderer.send("camera-record-stop");
    };

    const handleRetake = async () => {
        setIsRecording(false);
        setEditingState('편집 시작');
        
        // 프로그레스 바 초기화
        setTimeLeft(15);
        setProgress(100);

        if (!recordedPath) {
            console.log("삭제할 영상이 없습니다.");
            return;
        }

        const result = await ipcRenderer.invoke('clear-videos', recordedPath);
        if (result.success) {
            console.log(`🗑️ 삭제된 영상 수: ${result.deleted}`);
            setRecordedPath(null);
        } else {
            console.error(`❌ 삭제 실패: ${result.error}`);
        }
    };

    const testHandler = async () => {
        if (!recordedPath) {
            alert('녹화된 영상이 없습니다');
            return;
        }

        try {
            setEditingState('편집중');

            const editResult = await ipcRenderer.invoke('edit-video', recordedPath);

            if (editResult.success) {
                console.log('🎬 편집 완료:', editResult.path);
                setEditingState('편집 완료');
                localStorage.setItem('editedVideoPath', editResult.path);
                navigate('/result');
            } else {
                console.error('❌ 편집 실패:', editResult.error);
                alert('영상 편집 실패: ' + editResult.error);
                setEditingState('편집 시작');
            }
        } catch (error) {
            console.error('❌ IPC 오류:', error);
            setEditingState('편집 시작');
            alert('알 수 없는 오류가 발생했습니다');
        }
    };

    // 스피너 컴포넌트
    const Spinner = () => (
        <div className={styles.spinner}>
            <div className={styles.spinnerRing}></div>
        </div>
    );

    // 프로그레스 바 타이머 효과
    useEffect(() => {
        let interval = null;
        
        if (isRecording && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft(timeLeft => {
                    const newTime = timeLeft - 1;
                    setProgress((newTime / 15) * 100);
                    return newTime;
                });
            }, 1000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isRecording, timeLeft]);

    useEffect(() => {
        setIsConnecting(true);
        handleConnectCamera();

        const handleCameraConnectReply = (_event: any, success: boolean) => {
            console.log('[React] 연결 응답 수신:', success);
            setIsConnecting(false);
            if (success) {
                setIsConnected(true);
                setConnectError(false);
            } else {
                setIsConnected(false);
                setConnectError(true);
            }
        };

        const handleRecordStartReply = (_event: any, status: string) => {
            if (status === "started") {
                setIsRecording(true);
            }
        };

        const handleRecordStopReply = (_event: any, result: { success: boolean, error?: string }) => {
            console.log('[React] 녹화 중지 응답:', result);
            
            if (result.success) {
                // 촬영 시작 상태로 초기화
                setIsRecording(false);
                setEditingState('편집 시작');
                setRecordedPath(null);
                setTimeLeft(15);
                setProgress(100);
                console.log('[React] 촬영 중지 및 상태 초기화 완료');
            } else {
                console.error('[React] 촬영 중지 실패:', result.error);
                alert('촬영 중지 중 오류가 발생했습니다: ' + result.error);
            }
        };

        const handleRecordComplete = (_event: any, result: { success: boolean, path?: string }) => {
            setIsRecording(false);

            if (result.success && result.path) {
                setEditingState('촬영 완료');
                setRecordedPath(result.path);
            } else {
                setEditingState('촬영 실패');
                alert("촬영 중 오류가 발생했습니다.");
            }
        };

        ipcRenderer.on("camera-connect-reply", handleCameraConnectReply);
        ipcRenderer.on("camera-record-start-reply", handleRecordStartReply);
        ipcRenderer.on("camera-record-stop-reply", handleRecordStopReply);
        ipcRenderer.on("camera-record-complete", handleRecordComplete);

        return () => {
            ipcRenderer.removeListener("camera-connect-reply", handleCameraConnectReply);
            ipcRenderer.removeListener("camera-record-start-reply", handleRecordStartReply);
            ipcRenderer.removeListener("camera-record-stop-reply", handleRecordStopReply);
            ipcRenderer.removeListener("camera-record-complete", handleRecordComplete);
        };
    }, []);

    const getProgressColor = () => {
        if (timeLeft > 10) return '#4ade80'; // 초록색
        if (timeLeft > 5) return '#facc15';  // 노란색
        return '#ef4444'; // 빨간색
    };

    return (
        <div className={styles.container}>
            <div className={styles.menubar}>
                <div className={styles.menubarWrapper}>
                    <Link to={'/'} className={styles.homeBtn}><img src={HomeIcon} /></Link>
                    <div className={styles.status}>
                        {isConnecting
                            ? '카메라 연결 상태 확인중...'
                            : isConnected
                                ? '카메라 연결됨'
                                : '카메라 연결 실패'}
                    </div>
                </div>
            </div>
            <div className={styles.instruction}>
                <div className={styles.instructionWrapper}>

                    {/* 카메라 연결중일 때 스피너 표시 */}
                    {isConnecting && (
                        <div className={styles.connectingStatus}>
                            <Spinner />
                            <p>카메라에 연결중입니다...</p>
                        </div>
                    )}

                    {/* 연결 실패 시 재시도 버튼 */}
                    {connectError && !isConnecting && (
                        <div className={styles.connectError}>
                            <p>카메라 연결에 실패했습니다</p>
                            <button onClick={handleConnectCamera}>카메라 재연결</button>
                        </div>
                    )}

                    {/* 연결 완료 & 아직 촬영 안 함 */}
                    {isConnected && !isRecording && editingState === '편집 시작' && !isConnecting && (
                        <button onClick={handleStartRecording}>촬영 시작</button>
                    )}

                    {/* 촬영 중 */}
                    {isRecording && (
                        <div className={styles.filmInProgress}>
                            <p>촬영이 진행중입니다</p>
                            
                            {/* 프로그레스 바 섹션 */}
                            <div className={styles.progressSection}>
                                <div 
                                    className={styles.timeDisplay}
                                    style={{ color: getProgressColor() }}
                                >
                                    {timeLeft}초
                                </div>
                                
                                <div className={styles.progressBarContainer}>
                                    <div className={styles.progressBarBg}>
                                        <div 
                                            className={styles.progressBar}
                                            style={{ 
                                                width: `${progress}%`,
                                                backgroundColor: getProgressColor(),
                                                boxShadow: `0 0 20px ${getProgressColor()}40`
                                            }}
                                        >
                                            <div className={styles.progressShine}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button onClick={handleStopRecording}>
                                촬영 중지
                            </button>
                        </div>
                    )}

                    {/* 촬영 완료됨 */}
                    {!isRecording && editingState !== '편집 시작' && !isConnecting && (
                        <div className={styles.filmComplete}>
                            {editingState === '편집중' && (
                                <div className={styles.editingStatus}>
                                    <Spinner />
                                    <p>촬영 영상을 편집 중입니다</p>
                                </div>
                            )}
                            
                            {editingState !== '편집중' && (
                                <p>촬영이 완료되었습니다</p>
                            )}

                            {editingState !== '편집중' && (
                                <button onClick={handleRetake}>
                                    재촬영
                                </button>
                            )}

                            <button onClick={testHandler} disabled={editingState === '편집중'}>
                                {editingState}
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <div className={styles.logo}>
                <img src={Logo} alt='logo' />
            </div>
        </div>
    );
};

export default Film;