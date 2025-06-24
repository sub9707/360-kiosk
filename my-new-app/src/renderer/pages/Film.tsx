// src/renderer/Film.tsx

import React, { useState, useEffect, useRef } from 'react';
import styles from './Film.module.scss';
import { Link, useNavigate } from 'react-router-dom';

import HomeIcon from '/src/renderer/assets/icons/home.svg';
import Logo from '/src/renderer/assets/icons/logo.png';
import Spinner from '../components/Spinner/Spinner';


const Film: React.FC = () => {
    const { ipcRenderer } = window.require("electron");
    const navigate = useNavigate();

    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [connectError, setConnectError] = useState(false);
    const [editingState, setEditingState] = useState('대기중');
    const [recordedPath, setRecordedPath] = useState<string | null>(null);
    const [androidFileName, setAndroidFileName] = useState<string | null>(null);

    const nextButtonRef = useRef<HTMLButtonElement>(null);

    // 🔥 영상 전송 상태 추가
    const [isTransferring, setIsTransferring] = useState(false);

    // 프로그레스 바를 위한 상태 (20초 제한)
    const [timeLeft, setTimeLeft] = useState(20);
    const [progress, setProgress] = useState(0);

    // 🔥 중복 다운로드 방지를 위한 상태
    const [downloadCompleted, setDownloadCompleted] = useState(false);

    // 🚀 자동 연결 상태 표시
    const [autoConnectionStatus, setAutoConnectionStatus] = useState('카메라 연결 중...');

    // 🐛 디버깅 로그 추가 함수
    const addDebugLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        console.log(`🐛 ${logMessage}`);
    };

    const handleGoHome = () => {
        addDebugLog('🏠 홈으로 돌아가기 - 완전 상태 초기화');

        // 모든 상태 초기화
        setIsConnecting(false);
        setConnectError(false);
        setIsConnected(false);
        setEditingState('대기중');
        setIsRecording(false);
        setIsTransferring(false);
        setDownloadCompleted(false);
        setRecordedPath(null);
        setAndroidFileName(null);
        setTimeLeft(20);
        setProgress(0);

        // MobileControl 상태도 리셋
        ipcRenderer.send('reset-connection-state');

        // 홈으로 이동
        navigate('/');
    };

    // 🚀 자동 재연결 함수 (프롬프트 없이)
    const handleAutoReconnect = () => {
        setEditingState('대기중');
        setIsConnecting(true);
        setConnectError(false);
        setIsTransferring(false); // 🔥 전송 상태 초기화
        setAutoConnectionStatus('카메라 자동 재연결 중...');
        addDebugLog('🚀 자동 재연결 시도');
        ipcRenderer.invoke('reconnect-to-camera');
    };

    // --- IPC 송신 함수들 ---

    const handleConnectCamera = () => {
        // 조건부 체크 제거하고 무조건 초기화
        addDebugLog('🚀 카메라 연결 요청 - 상태 강제 초기화');

        setIsConnecting(true);
        setConnectError(false);
        setIsConnected(false);
        setEditingState('대기중');
        setRecordedPath(null);
        setAndroidFileName(null);
        setDownloadCompleted(false);
        setIsTransferring(false);
        setAutoConnectionStatus('카메라 연결 중...');

        ipcRenderer.send("camera-connect");
    };

    const handleStartRecording = () => {
        if (!isConnected) {
            alert('카메라가 연결되지 않았습니다.');
            return;
        }

        addDebugLog('🎬 녹화 시작 요청 (20초 제한)');
        setTimeLeft(20);
        setProgress(0);
        setIsRecording(true);
        setEditingState('촬영 중');
        setDownloadCompleted(false);
        setIsTransferring(false); // 🔥 전송 상태 초기화

        ipcRenderer.send("camera-record-start");
    };

    const handleStopRecording = () => {
        if (!isRecording) return;

        addDebugLog('녹화 중지 요청');
        ipcRenderer.send("camera-record-stop");
    };

    const handleRetake = async () => {
        addDebugLog('재촬영 시작 - 상태 초기화');
        setIsRecording(false);
        setEditingState('대기중');
        setTimeLeft(20);
        setProgress(0);
        setDownloadCompleted(false);
        setIsTransferring(false); // 🔥 전송 상태 초기화

        // 로컬 PC 파일 삭제
        if (recordedPath) {
            addDebugLog(`로컬 파일 삭제 요청: ${recordedPath}`);
            try {
                const result = await ipcRenderer.invoke('clear-local-video', recordedPath);
                if (result.success) {
                    addDebugLog('로컬 파일 삭제 성공');
                } else {
                    addDebugLog(`로컬 파일 삭제 실패: ${result.error}`);
                }
            } catch (error) {
                addDebugLog(`로컬 파일 삭제 IPC 오류: ${error}`);
            }
            setRecordedPath(null);
        }

        // Android 원본 파일 삭제
        if (androidFileName) {
            addDebugLog(`Android 파일 삭제 요청: ${androidFileName}`);
            try {
                const result = await ipcRenderer.invoke('clear-android-video', androidFileName);
                if (result.success) {
                    addDebugLog('Android 파일 삭제 요청 성공');
                } else {
                    addDebugLog(`Android 파일 삭제 요청 실패: ${result.error}`);
                }
            } catch (error) {
                addDebugLog(`Android 파일 삭제 IPC 오류: ${error}`);
            }
            setAndroidFileName(null);
        }
    };

    const handleEditVideo = async () => {
        addDebugLog(`편집 요청 시도 - recordedPath: ${recordedPath || 'null'}`);

        if (!recordedPath) {
            addDebugLog('❌ 편집 실패: recordedPath가 null');
            return;
        }

        // 🔥 이미 편집 중인 경우 중복 실행 방지
        if (editingState === '편집중') {
            addDebugLog('⚠️ 이미 편집 중 - 중복 실행 방지');
            return;
        }

        try {
            setEditingState('편집중');
            addDebugLog(`편집 시작: ${recordedPath}`);

            const editResult = await ipcRenderer.invoke('edit-video', recordedPath);

            if (editResult.success) {
                addDebugLog(`편집 완료: ${editResult.path}`);
                setEditingState('편집 완료');
                localStorage.setItem('editedVideoPath', editResult.path);
                navigate('/result');
            } else {
                addDebugLog(`편집 실패: ${editResult.error}`);
                alert('영상 편집 실패: ' + editResult.error);
                setEditingState('촬영 완료');
            }
        } catch (error) {
            addDebugLog(`편집 IPC 오류: ${error}`);
            setEditingState('촬영 완료');
            alert('알 수 없는 오류가 발생했습니다.');
        }
    };

    // --- useEffect: IPC 이벤트 리스너 및 타이머 관리 ---

    // 🔥 수정된 프로그레스 바 타이머 (자동 다운로드 제거)
    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;

        if (isRecording && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft(prevTime => {
                    const newTime = prevTime - 1;
                    setProgress(((20 - newTime) / 20) * 100);
                    if (newTime <= 0) {
                        addDebugLog('🎬 촬영 시간 초과 (렌더러 타이머 - 20초 완료)');
                        addDebugLog('📤 Android에 녹화 중지 명령 전송');

                        // 🔧 20초 완료 시 실제로 Android에 녹화 중지 명령 전송
                        ipcRenderer.send("camera-record-stop");

                        setIsRecording(false);
                        // 🔥 촬영 완료 후 전송 대기 상태로 변경
                        setIsTransferring(true);
                        setEditingState('영상 전송 대기');

                        // 🔥 자동 다운로드 로직 제거 - camera-record-complete 이벤트에서만 처리됨
                        addDebugLog('⏰ 타이머 완료 - camera-record-complete 이벤트를 대기합니다');

                        if (interval) clearInterval(interval);
                        return 0;
                    }
                    return newTime;
                });
            }, 1000);
        } else if (!isRecording && interval) {
            clearInterval(interval);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isRecording, timeLeft]);

    // IPC 이벤트 리스너 등록 및 해제
    useEffect(() => {
        ipcRenderer.send('set-main-window');

        const forceStateReset = () => {
            addDebugLog('🔄 페이지 진입 - 강제 상태 초기화');
            setIsConnecting(false);
            setConnectError(false);
            setIsConnected(false);
            setEditingState('대기중');
            setIsRecording(false);
            setIsTransferring(false);
            setDownloadCompleted(false);
            setRecordedPath(null);
            setAndroidFileName(null);
            setAutoConnectionStatus('카메라 연결 준비중...');
        };

        forceStateReset();

        // 🔧 연결 상태 확인 후 초기화 여부 결정
        const checkConnectionAndInit = async () => {
            try {
                addDebugLog('🔍 기존 연결 상태 확인 시작');

                // 🚀 MobileControl의 현재 연결 상태 확인
                const connectionStatus = await ipcRenderer.invoke('check-connection-status');

                if (connectionStatus && connectionStatus.isConnected) {
                    addDebugLog('✅ 이미 연결된 상태 감지 - 자동 연결 시도 생략');
                    setIsConnected(true);
                    setIsConnecting(false);
                    setConnectError(false);
                    setEditingState('대기중');
                    setAutoConnectionStatus('PC와 연결됨');
                    return; // 🔥 이미 연결된 경우 추가 연결 시도하지 않음
                } else {
                    addDebugLog('❌ 연결되지 않은 상태 - 새로운 연결 시도');
                }
            } catch (error) {
                addDebugLog(`⚠️ 연결 상태 확인 실패: ${error} - 새로운 연결 시도`);
            }

            // 🚀 연결되지 않은 경우에만 새로운 연결 시도
            setTimeout(() => {
                addDebugLog('🚀 상태 초기화 완료 - 카메라 연결 시도');
                handleConnectCamera();
            }, 500);
        };

        checkConnectionAndInit();

        // 🚀 카메라 연결 응답 처리 (자동 연결 모드)
        const handleCameraConnectReply = (_event: any, success: boolean, errorMessage?: string) => {
            addDebugLog(`🚀 자동 연결 응답: ${success ? '성공' : '실패'} ${errorMessage || ''}`);

            // 🔧 이미 촬영이 완료된 상태에서는 UI 상태를 변경하지 않음
            if (editingState === '촬영 완료' || editingState === '편집중' || editingState === '편집 완료') {
                addDebugLog('🔒 촬영 완료 상태 보존 - UI 상태 변경 안함');
                setIsConnecting(false);
                if (success) {
                    setIsConnected(true);
                    setConnectError(false);
                    setAutoConnectionStatus('PC와 연결됨');
                } else {
                    setIsConnected(false);
                    setConnectError(true);
                    setAutoConnectionStatus(`연결 실패: ${errorMessage || '알 수 없는 오류'}`);
                }
                return;
            }

            setIsConnecting(false);
            if (success) {
                setIsConnected(true);
                setConnectError(false);
                setEditingState('대기중');
                setAutoConnectionStatus('PC와 연결됨');
                addDebugLog('✅ 카메라 자동 연결 성공');
            } else {
                setIsConnected(false);
                setConnectError(true);
                setAutoConnectionStatus(`자동 연결 실패: ${errorMessage || '알 수 없는 오류'}`);
                addDebugLog(`❌ 카메라 자동 연결 실패: ${errorMessage || '알 수 없는 오류'}`);
            }
        };

        // 녹화 시작 응답 처리
        const handleRecordStartReply = (_event: any, data: { status: string, error?: string }) => {
            addDebugLog(`녹화 시작 응답: ${JSON.stringify(data)}`);
            if (data.status === "started") {
                setIsRecording(true);
                setEditingState('촬영 중');
                setTimeLeft(20);
                setProgress(0);
                setIsTransferring(false); // 🔥 전송 상태 해제
                addDebugLog('🎬 녹화 시작됨 - 20초 타이머 가동');
            } else {
                setIsRecording(false);
                setEditingState('촬영 실패');
                setIsTransferring(false); // 🔥 전송 상태 해제
                alert(`녹화 시작 실패: ${data.error || '알 수 없는 오류'}`);
            }
        };

        // 🐛 video-saved 이벤트 리스너 추가 (디버깅용) - 🔥 전송 시작 신호로 활용
        const handleVideoSaved = (_event: any, data: any) => {
            addDebugLog(`🎬 Android에서 video-saved 이벤트 수신: ${JSON.stringify(data)}`);
            // 🔥 Android에서 영상 저장 완료 신호를 받으면 전송 시작 상태로 변경
            setIsTransferring(true);
            setEditingState('영상 전송중');
            addDebugLog('📤 Android 영상 저장 완료 - PC로 전송 시작');
        };

        // 🔍 Android 녹화 상태 변경 리스너 추가
        const handleCameraRecordingStatus = (_event: any, data: any) => {
            addDebugLog(`📹 Android 녹화 상태 변경: ${JSON.stringify(data)}`);

            // 🔥 Android에서 녹화 중지 신호를 받으면 전송 대기 상태로 변경
            if (data && data.isRecording === false) {
                addDebugLog('📹 Android 녹화 중지 감지 - 영상 전송 대기 상태로 변경');
                setIsRecording(false);
                setIsTransferring(true);
                setEditingState('영상 전송 대기');
            }
        };

        // 🔥 수정된 녹화 완료 응답 처리 (중복 방지 강화)
        let recordCompleteProcessed = false; // 🔥 중복 처리 방지 플래그

        const handleRecordComplete = (_event: any, result: { success: boolean, path?: string, androidPath?: string, error?: string }) => {
            addDebugLog(`🎬 녹화 완료 응답: ${JSON.stringify(result)}`);

            // 🔥 **핵심 수정**: 이미 처리된 경우 또는 촬영 완료 상태라면 중복 처리하지 않음
            if (recordCompleteProcessed || editingState === '촬영 완료' || editingState === '편집중' || editingState === '편집 완료') {
                addDebugLog('⚠️ 이미 처리됨 또는 촬영 완료 상태 - 중복 camera-record-complete 이벤트 무시');
                return;
            }

            recordCompleteProcessed = true; // 🔥 처리 플래그 설정

            setIsRecording(false);
            setIsTransferring(false); // 🔥 전송 완료
            setTimeLeft(20);
            setProgress(0);

            if (result.success && result.path) {
                addDebugLog(`✅ PC 저장 성공! 경로: ${result.path}`);
                setEditingState('촬영 완료');
                setRecordedPath(result.path); // 🔥 여기서 recordedPath가 설정되어야 함
                setAndroidFileName(result.androidPath || null);
                setDownloadCompleted(true); // 🔥 다운로드 완료 상태 설정
            } else {
                addDebugLog(`❌ 촬영/저장 실패: ${result.error}`);
                setEditingState('촬영 실패');
                setRecordedPath(null);
                setAndroidFileName(null);
                setDownloadCompleted(false);
            }

            // 🔥 5초 후 플래그 리셋 (다음 촬영을 위해)
            setTimeout(() => {
                recordCompleteProcessed = false;
                addDebugLog('🔄 녹화 완료 처리 플래그 리셋');
            }, 5000);
        };

        // IPC 이벤트 리스너 등록
        ipcRenderer.on("camera-connect-reply", handleCameraConnectReply);
        ipcRenderer.on("camera-record-start-reply", handleRecordStartReply);
        ipcRenderer.on("camera-record-complete", handleRecordComplete);
        ipcRenderer.on("video-saved", handleVideoSaved); // 🔥 전송 시작 신호로 활용
        ipcRenderer.on("camera-recording-status", handleCameraRecordingStatus); // 🔍 Android 녹화 상태

        return () => {
            ipcRenderer.removeListener("camera-connect-reply", handleCameraConnectReply);
            ipcRenderer.removeListener("camera-record-start-reply", handleRecordStartReply);
            ipcRenderer.removeListener("camera-record-complete", handleRecordComplete);
            ipcRenderer.removeListener("video-saved", handleVideoSaved);
            ipcRenderer.removeListener("camera-recording-status", handleCameraRecordingStatus);
        };
    }, []);

        // 페이지 업 키 이벤트 등록
        useEffect(() => {
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.code === 'PageUp' && nextButtonRef.current) {
                    nextButtonRef.current.click();
                }
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }, []);

    return (
        <div className={styles.container}>
            <div className={styles.menubar}>
                <div className={styles.menubarWrapper}>
                    <button onClick={handleGoHome} className={styles.homeBtn}>
                        <img src={HomeIcon} alt="Home" />
                    </button>
                    <div className={styles.status}>
                        {isConnecting
                            ? autoConnectionStatus
                            : connectError
                                ? '카메라 연결 실패'
                                : isTransferring
                                    ? '영상 전송 중...'
                                    : editingState === '촬영 완료' || editingState === '편집중' || editingState === '편집 완료'
                                        ? `✅ 촬영 완료 (${editingState})`
                                        : '카메라 연결됨'}
                    </div>
                </div>
            </div>

            <div className={styles.instruction}>
                <div className={styles.instructionWrapper}>

                    {/* 🚀 카메라 자동 연결중일 때 스피너 표시 */}
                    {isConnecting && (
                        <div className={styles.connectingStatus}>
                            <Spinner />
                            <p>카메라 연결 중</p>
                        </div>
                    )}

                    {/* 🚀 자동 연결 실패 시 재시도 버튼 (촬영 완료 상태가 아닐 때만) */}
                    {connectError && !isConnecting && editingState !== '촬영 완료' && editingState !== '편집중' && editingState !== '편집 완료' && !isTransferring && (
                        <div className={styles.connectError}>
                            <p>카메라 연결에 실패했습니다</p>
                            <button onClick={handleAutoReconnect} ref={nextButtonRef}>재연결</button>
                        </div>
                    )}

                    {/* 연결 완료 & 촬영 대기 상태 */}
                    {isConnected && !isRecording && editingState === '대기중' && !isConnecting && !isTransferring && (
                    <div className={styles.centerMessage}>
                        <p>카메라가 연결되었습니다</p>
                        <button onClick={handleStartRecording} ref={nextButtonRef}>촬영 시작</button>
                    </div>
                    )}

                    {/* 촬영 중 */}
                    {isRecording && editingState === '촬영 중' && !isTransferring && (
                        <div className={styles.filmInProgress}>
                            <p>촬영 중</p>
                            <div className={styles.progressSection}>
                                <div className={styles.progressBarContainer}>
                                    <div className={styles.progressBarBg}>
                                        <div
                                            className={styles.progressBar}
                                            style={{ width: `${progress}%` }}
                                        >
                                            <div className={styles.progressShine}></div>
                                        </div>
                                    </div>
                                </div>
                                <p className={styles.timeLeft}>{timeLeft}초 남음</p>
                            </div>
                            <button onClick={handleStopRecording}>촬영 중지</button>
                        </div>
                    )}

                    {/* 🔥 영상 전송 중 UI 추가 */}
                    {isTransferring && (editingState === '영상 전송 대기' || editingState === '영상 전송중') && (
                        <div className={styles.transferInProgress}>
                            <Spinner />
                            <p>영상 전송 중</p>
                            <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
                                Android에서 PC로 영상을 전송하고 있습니다...
                            </p>
                        </div>
                    )}

                    {/* 촬영 완료됨 */}
                    {!isRecording && !isTransferring && ['촬영 완료', '편집중', '편집 완료', '촬영 실패'].includes(editingState) && !isConnecting && (
                        <div className={styles.filmComplete}>
                            {editingState === '편집중' && (
                                <div className={styles.editingStatus}>
                                    <Spinner />
                                    <p>영상 편집 중...</p>
                                </div>
                            )}
                            {editingState === '촬영 완료' && (
                                <p>촬영이 완료되었습니다</p>
                            )}
                            {editingState === '촬영 실패' && (
                                <p>촬영에 실패했습니다</p>
                            )}
                            {editingState === '촬영 완료' && (
                                <>
                                    <button onClick={handleRetake}>재촬영</button>
                                    <button onClick={handleEditVideo} ref={nextButtonRef}>편집 시작</button>
                                </>
                            )}
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