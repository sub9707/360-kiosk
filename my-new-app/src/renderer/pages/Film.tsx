// src/renderer/Film.tsx

import React, { useState, useEffect } from 'react';
import styles from './Film.module.scss';
import { Link, useNavigate } from 'react-router-dom';

import HomeIcon from '/src/renderer/assets/icons/home.svg';
import Logo from '/src/renderer/assets/icons/logo.png';
import Spinner from '../components/Spinner/Spinner';

interface NetworkTestResult {
    websocket: boolean;
    http: boolean;
    fileList?: string[];
}

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

    // 🐛 디버깅을 위한 상태 추가
    const [debugInfo, setDebugInfo] = useState<string[]>([]);
    const [networkTest, setNetworkTest] = useState<NetworkTestResult | null>(null);
    const [showDebugPanel, setShowDebugPanel] = useState(true); // 디버깅 패널 표시 여부

    // 프로그레스 바를 위한 상태 (15초 제한)
    const [timeLeft, setTimeLeft] = useState(15);
    const [progress, setProgress] = useState(0);

    // 🔥 중복 다운로드 방지를 위한 상태
    const [downloadCompleted, setDownloadCompleted] = useState(false);

    // 🐛 디버깅 로그 추가 함수
    const addDebugLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        console.log(`🐛 ${logMessage}`);
        setDebugInfo(prev => [...prev.slice(-12), logMessage]); // 최대 13개까지 유지
    };

    // 재연결 버튼 클릭 시 호출할 함수
    const handleReconnect = () => {
        setEditingState('대기중'); // UI 상태 초기화
        setIsConnecting(true);   // 로딩 스피너 표시
        // 새로 만든 'reconnect-to-camera' 핸들러 호출
        ipcRenderer.invoke('reconnect-to-camera');
    };


    // 🔧 Android IP 변경 테스트
    const handleChangeAndroidIP = () => {
        const newIP = prompt('Android 기기의 새로운 IP 주소를 입력하세요:', '192.168.219.102');
        if (newIP && newIP.trim()) {
            addDebugLog(`IP 주소 변경 요청: ${newIP.trim()}`);
            ipcRenderer.send('change-android-ip', newIP.trim());
        }
    };

    // 🔍 Android 서버 상태 직접 확인
    const handleCheckAndroidServer = async () => {
        addDebugLog('🔍 Android 서버 상태 직접 확인');
        try {
            const result = await ipcRenderer.invoke('check-android-server-status');
            if (result.success) {
                addDebugLog(`✅ Android 서버 응답: ${result.status}`);
                if (result.fileCount !== undefined) {
                    addDebugLog(`📁 서버 파일 개수: ${result.fileCount}개`);
                }
            } else {
                addDebugLog(`❌ Android 서버 확인 실패: ${result.error}`);
            }
        } catch (error) {
            addDebugLog(`Android 서버 확인 오류: ${error}`);
        }
    };

    // --- IPC 송신 함수들 ---

    const handleConnectCamera = () => {
        // 🔧 이미 촬영이 완료된 상태에서는 재연결하지 않음
        if (editingState === '촬영 완료' || editingState === '편집중' || editingState === '편집 완료') {
            addDebugLog('🔒 촬영 완료 상태에서 재연결 방지');
            return;
        }

        setIsConnecting(true);
        setConnectError(false);
        setIsConnected(false);
        setEditingState('대기중');
        setRecordedPath(null);
        setAndroidFileName(null);
        setDownloadCompleted(false); // 🔥 다운로드 상태 초기화

        addDebugLog('카메라 연결 요청 시작');
        ipcRenderer.send("camera-connect");
    };

    const handleStartRecording = () => {
        if (!isConnected) {
            alert('카메라가 연결되지 않았습니다.');
            return;
        }

        addDebugLog('🎬 녹화 시작 요청 (15초 제한)');
        setTimeLeft(15);
        setProgress(0);
        setIsRecording(true);
        setEditingState('촬영 중');
        setDownloadCompleted(false); // 🔥 새 촬영 시작 시 다운로드 상태 초기화

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
        setTimeLeft(15);
        setProgress(0);
        setDownloadCompleted(false); // 🔥 재촬영 시 다운로드 상태 초기화

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
            alert(`녹화된 영상이 없습니다. 먼저 촬영해주세요.

🔍 문제 해결 방법:
1. 네트워크 테스트로 Android 연결 확인
2. Android 앱이 실행 중인지 확인
3. 같은 WiFi 네트워크에 연결되어 있는지 확인
4. Android IP 주소가 올바른지 확인

디버깅 정보를 확인하거나 네트워크 테스트를 해보세요.`);
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

    // 🚀 자동으로 최신 파일 다운로드하는 함수 (수동 테스트용으로만 사용)
    const handleManualDownloadLatestFile = async () => {
        try {
            addDebugLog('🔍 수동 다운로드: Android 파일 목록 확인 중...');

            // 1. 네트워크 테스트로 파일 목록 가져오기
            const networkResult = await ipcRenderer.invoke('test-network-connection');

            if (!networkResult.http) {
                addDebugLog('❌ 수동 다운로드 실패: HTTP 연결 불가');
                alert('Android HTTP 서버에 연결할 수 없습니다.');
                return;
            }

            if (!networkResult.fileList || networkResult.fileList.length === 0) {
                addDebugLog('❌ 수동 다운로드 실패: Android에 파일이 없음');
                alert('Android에 다운로드할 파일이 없습니다.');
                return;
            }

            // 2. 가장 최신 파일 선택 (파일명 정렬)
            const sortedFiles = networkResult.fileList.sort((a: string, b: string) => b.localeCompare(a));
            const latestFileName = sortedFiles[0];

            addDebugLog(`🎬 수동 다운로드 대상: ${latestFileName}`);
            addDebugLog(`📁 전체 파일 목록: ${networkResult.fileList.join(', ')}`);

            // 3. 파일 다운로드 실행
            const result = await ipcRenderer.invoke('copy-video-from-android', latestFileName);

            if (result.success) {
                addDebugLog(`✅ 수동 다운로드 성공: ${result.localVideoPath}`);
                setRecordedPath(result.localVideoPath);
                setAndroidFileName(latestFileName);
                setEditingState('촬영 완료');
                setDownloadCompleted(true);

                // 🗑️ Android 원본 파일 삭제
                addDebugLog(`🗑️ Android 원본 파일 삭제: ${latestFileName}`);
                await ipcRenderer.invoke('clear-android-video', latestFileName);

            } else {
                addDebugLog(`❌ 수동 다운로드 실패: ${result.error}`);
                alert(`수동 다운로드 실패: ${result.error}`);
            }

        } catch (error) {
            addDebugLog(`❌ 수동 다운로드 오류: ${error}`);
            alert(`수동 다운로드 중 오류가 발생했습니다: ${error}`);
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
                    setProgress(((15 - newTime) / 15) * 100);
                    if (newTime <= 0) {
                        addDebugLog('🎬 촬영 시간 초과 (렌더러 타이머 - 15초 완료)');
                        addDebugLog('📤 Android에 녹화 중지 명령 전송');

                        // 🔧 15초 완료 시 실제로 Android에 녹화 중지 명령 전송
                        ipcRenderer.send("camera-record-stop");

                        setIsRecording(false);

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

        // 🔧 초기 로드 시에만 카메라 연결 시도
        if (editingState === '대기중') {
            handleConnectCamera();
        } else {
            addDebugLog('🔒 초기 연결 생략 - 이미 진행 중인 작업 있음');
        }

        // 카메라 연결 응답 처리 (촬영 완료 상태 보존)
        const handleCameraConnectReply = (_event: any, success: boolean, errorMessage?: string) => {
            addDebugLog(`연결 응답: ${success ? '성공' : '실패'} ${errorMessage || ''}`);

            // 🔧 이미 촬영이 완료된 상태에서는 UI 상태를 변경하지 않음
            if (editingState === '촬영 완료' || editingState === '편집중' || editingState === '편집 완료') {
                addDebugLog('🔒 촬영 완료 상태 보존 - UI 상태 변경 안함');
                setIsConnecting(false);
                if (success) {
                    setIsConnected(true);
                    setConnectError(false);
                } else {
                    setIsConnected(false);
                    setConnectError(true);
                }
                return;
            }

            setIsConnecting(false);
            if (success) {
                setIsConnected(true);
                setConnectError(false);
                setEditingState('대기중');
                // 🔧 성공 시 알림 제거 (UI에서 상태 확인 가능)
                addDebugLog('✅ 카메라 연결 성공');
            } else {
                setIsConnected(false);
                setConnectError(true);
                addDebugLog(`❌ 카메라 연결 실패: ${errorMessage || '알 수 없는 오류'}`);

                // 🔧 실패 시에만 alert 표시 (촬영 완료 상태가 아닐 때만)
                if (editingState !== '촬영 완료' && editingState !== '편집중' && editingState !== '편집 완료') {
                    const fullMessage = `카메라 연결 실패: ${errorMessage || '알 수 없는 오류'}

🔍 문제 해결 방법:
• Android 앱이 실행 중인지 확인
• PC와 Android가 같은 WiFi에 연결되어 있는지 확인  
• Android IP 주소가 올바른지 확인
• 네트워크 테스트를 실행해보세요`;
                    alert(fullMessage);
                }
            }
        };

        // 녹화 시작 응답 처리
        const handleRecordStartReply = (_event: any, data: { status: string, error?: string }) => {
            addDebugLog(`녹화 시작 응답: ${JSON.stringify(data)}`);
            if (data.status === "started") {
                setIsRecording(true);
                setEditingState('촬영 중');
                setTimeLeft(15);
                setProgress(0);
                addDebugLog('🎬 녹화 시작됨 - 15초 타이머 가동');
            } else {
                setIsRecording(false);
                setEditingState('촬영 실패');
                alert(`녹화 시작 실패: ${data.error || '알 수 없는 오류'}`);
            }
        };

        // 🐛 video-saved 이벤트 리스너 추가 (디버깅용)
        const handleVideoSaved = (_event: any, data: any) => {
            addDebugLog(`🎬 Android에서 video-saved 이벤트 수신: ${JSON.stringify(data)}`);
        };

        // 🔍 Android 녹화 상태 변경 리스너 추가
        const handleCameraRecordingStatus = (_event: any, data: any) => {
            addDebugLog(`📹 Android 녹화 상태 변경: ${JSON.stringify(data)}`);
        };

        // 🔥 수정된 녹화 완료 응답 처리 (중복 방지)
        const handleRecordComplete = (_event: any, result: { success: boolean, path?: string, androidPath?: string, error?: string }) => {
            addDebugLog(`🎬 녹화 완료 응답: ${JSON.stringify(result)}`);

            // 🔥 이미 다운로드 완료된 경우 추가 처리하지 않음
            if (downloadCompleted) {
                addDebugLog('⚠️ 이미 다운로드 완료됨 - 중복 처리 방지');
                return;
            }

            setIsRecording(false);
            setTimeLeft(15);
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
                const errorMessage = `촬영 중 오류가 발생했습니다: ${result.error || '알 수 없는 오류'}

🔍 주요 원인:
• Android에서 파일이 제대로 저장되지 않음
• HTTP 서버 연결 문제 (404 오류)
• 네트워크 연결 불안정

해결 방법:
• 네트워크 테스트 실행
• Android 앱 재시작
• WiFi 연결 확인`;
                alert(errorMessage);
            }
        };

        // IPC 이벤트 리스너 등록
        ipcRenderer.on("camera-connect-reply", handleCameraConnectReply);
        ipcRenderer.on("camera-record-start-reply", handleRecordStartReply);
        ipcRenderer.on("camera-record-complete", handleRecordComplete);
        ipcRenderer.on("video-saved", handleVideoSaved); // 🐛 디버깅용
        ipcRenderer.on("camera-recording-status", handleCameraRecordingStatus); // 🔍 Android 녹화 상태

        return () => {
            ipcRenderer.removeListener("camera-connect-reply", handleCameraConnectReply);
            ipcRenderer.removeListener("camera-record-start-reply", handleRecordStartReply);
            ipcRenderer.removeListener("camera-record-complete", handleRecordComplete);
            ipcRenderer.removeListener("video-saved", handleVideoSaved);
            ipcRenderer.removeListener("camera-recording-status", handleCameraRecordingStatus);
        };
    }, [downloadCompleted]); // 🔥 downloadCompleted 의존성 추가

    return (
        <div className={styles.container}>
            <div className={styles.menubar}>
                <div className={styles.menubarWrapper}>
                    <Link to={'/'} className={styles.homeBtn}><img src={HomeIcon} alt="Home" /></Link>
                    <div className={styles.status}>
                        {isConnecting
                            ? '카메라 연결 상태 확인중...'
                            : connectError
                                ? '카메라 연결 실패'
                                : editingState === '촬영 완료' || editingState === '편집중' || editingState === '편집 완료'
                                    ? `✅ 촬영 완료 (${editingState})`
                                    : '카메라 연결됨'}
                    </div>
                    {/* 🐛 디버깅 패널 토글 버튼 */}
                    <button
                        onClick={() => setShowDebugPanel(!showDebugPanel)}
                        style={{
                            marginLeft: '10px',
                            padding: '5px 10px',
                            fontSize: '12px',
                            background: '#007acc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                        }}
                    >
                        🐛 {showDebugPanel ? '디버그 숨김' : '디버그 표시'}
                    </button>
                </div>
            </div>

            {/* 🐛 디버깅 정보 패널 */}
            {showDebugPanel && (
                <div style={{
                    position: 'fixed',
                    top: '60px',
                    right: '10px',
                    background: 'rgba(0,0,0,0.95)',
                    color: 'white',
                    padding: '15px',
                    fontSize: '11px',
                    maxWidth: '500px',
                    maxHeight: '500px',
                    zIndex: 1000,
                    borderRadius: '8px',
                    border: '1px solid #333',
                    overflow: 'auto'
                }}>
                    <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <strong>🐛 디버깅 정보</strong>
                        <div>
                            <button
                                onClick={handleCheckAndroidServer}
                                style={{
                                    marginRight: '5px',
                                    padding: '2px 6px',
                                    fontSize: '10px',
                                    background: '#FF9800',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '3px',
                                    cursor: 'pointer'
                                }}
                            >
                                🔍 서버확인
                            </button>
                            <button
                                onClick={handleChangeAndroidIP}
                                style={{
                                    padding: '2px 6px',
                                    fontSize: '10px',
                                    background: '#9C27B0',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '3px',
                                    cursor: 'pointer'
                                }}
                            >
                                📡 IP변경
                            </button>
                        </div>
                    </div>

                    <div style={{ marginBottom: '8px' }}>
                        <div>recordedPath: <span style={{ color: recordedPath ? '#4CAF50' : '#f44336' }}>{recordedPath || 'null'}</span></div>
                        <div>androidFileName: <span style={{ color: androidFileName ? '#4CAF50' : '#f44336' }}>{androidFileName || 'null'}</span></div>
                        <div>editingState: <span style={{ color: '#FFB74D' }}>{editingState}</span></div>
                        <div>isRecording: <span style={{ color: isRecording ? '#4CAF50' : '#f44336' }}>{isRecording.toString()}</span></div>
                        <div>downloadCompleted: <span style={{ color: downloadCompleted ? '#4CAF50' : '#f44336' }}>{downloadCompleted.toString()}</span></div>
                    </div>

                    {/* 🌐 네트워크 테스트 결과 */}
                    {networkTest && (
                        <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                            <div><strong>🌐 네트워크 상태:</strong></div>
                            <div>WebSocket: <span style={{ color: networkTest.websocket ? '#4CAF50' : '#f44336' }}>{networkTest.websocket ? '✅ 연결됨' : '❌ 실패'}</span></div>
                            <div>HTTP Server: <span style={{ color: networkTest.http ? '#4CAF50' : '#f44336' }}>{networkTest.http ? '✅ 연결됨' : '❌ 실패'}</span></div>
                            {networkTest.fileList && (
                                <div>Android 파일: <span style={{ color: '#4CAF50' }}>{networkTest.fileList.length}개</span></div>
                            )}
                        </div>
                    )}

                    <hr style={{ margin: '8px 0', border: '0.5px solid #444' }} />
                    <div style={{ maxHeight: '250px', overflow: 'auto', fontSize: '10px' }}>
                        {debugInfo.map((log, index) => (
                            <div key={index} style={{ marginBottom: '2px' }}>{log}</div>
                        ))}
                    </div>
                </div>
            )}

            <div className={styles.instruction}>
                <div className={styles.instructionWrapper}>

                    {/* 카메라 연결중일 때 스피너 표시 */}
                    {isConnecting && (
                        <div className={styles.connectingStatus}>
                            <Spinner />
                            <p>카메라 연결 중...</p>
                        </div>
                    )}

                    {/* 연결 실패 시 재시도 버튼 (촬영 완료 상태가 아닐 때만) */}
                    {connectError && !isConnecting && editingState !== '촬영 완료' && editingState !== '편집중' && editingState !== '편집 완료' && (
                        <div className={styles.connectError}>
                            <p>카메라 연결에 실패했습니다</p>
                            <div style={{ marginTop: '10px' }}>
                                <button onClick={handleReconnect}>카메라 재연결</button>
                            </div>
                        </div>
                    )}

                    {/* 연결 완료 & 촬영 대기 상태 */}
                    {isConnected && !isRecording && editingState === '대기중' && !isConnecting && (
                        <button onClick={handleStartRecording}>🎬 촬영 시작</button>
                    )}

                    {/* 촬영 중 */}
                    {isRecording && editingState === '촬영 중' && (
                        <div className={styles.filmInProgress}>
                            <p>🎬 촬영 중... (15초 제한)</p>
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

                    {/* 촬영 완료됨 */}
                    {!isRecording && ['촬영 완료', '편집중', '편집 완료', '촬영 실패'].includes(editingState) && !isConnecting && (
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
                                    <button onClick={handleEditVideo}>편집 시작</button>
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