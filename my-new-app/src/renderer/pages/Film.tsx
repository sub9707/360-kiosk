import React, { useState, useEffect } from 'react';
import styles from './Film.module.scss';
import { Link, useNavigate } from 'react-router-dom';

import HomeIcon from '/src/renderer/assets/icons/home.svg';

// 필요과정
// 1. 카메라 연결 확인 (버튼 촉발의 IPC 통신 활용)
// 2-1. 카메라 연결 이후 촬영버튼 활성화
// 2-2. 카메라 연결 불가 -> 재시도 버튼 활성화
// 3-1. 촬영버튼 클릭 시 영상 촬영
// 4. 촬영 완료 시 재촬영 여부 확인
// 5. 영상 자동 편집 진행
// 6. 편집이 완료되면 결과 페이지로 자동 이동
// 7. 결과 페이지에서는 QR 코드와 영상 재생이 한번에 이루어짐

const Film: React.FC = () => {
    const { ipcRenderer } = window.require("electron");
    const navigate = useNavigate();

    const [isConnected, setIsConnected] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [connectError, setConnectError] = useState(false);
    const [editingState, setEditingState] = useState('편집 시작');

    const handleConnectCamera = () => {
        ipcRenderer.send("camera-connect");
    };

    const handleStartRecording = () => {
        if (!isConnected) return;
        ipcRenderer.send("camera-record-start");
    };

    const testHandler = async () => {
        try {
            const result = await ipcRenderer.invoke('save-video-to-local');

            if (result.success) {
                console.log('✅ 영상 저장 완료:', result.path);

                setEditingState('편집중');

                const editResult = await ipcRenderer.invoke('edit-video', result.path);

                if (editResult.success) {
                    console.log('🎬 편집 완료:', editResult.path);
                    setEditingState('편집 완료');

                    // 편집된 비디오 경로를 저장하고 결과 페이지로 이동
                    localStorage.setItem('editedVideoPath', editResult.path);
                    navigate('/result');
                } else {
                    console.error('❌ 편집 실패:', editResult.error);
                    alert('영상 편집 실패: ' + editResult.error);
                    setEditingState('편집 시작');
                }
            } else {
                console.error('❌ 저장 실패:', result.error);
                alert('영상 저장 실패: ' + result.error);
                setEditingState('편집 시작');
            }
        } catch (error) {
            console.error('❌ IPC 오류:', error);
            setEditingState('편집 시작');
            alert('알 수 없는 오류가 발생했습니다');
        }
    };


    useEffect(() => {
        handleConnectCamera();
        console.log('camera 테스트')
        ipcRenderer.on("camera-connect-reply", (_event: any, success: boolean) => {
            if (success) {
                setIsConnected(true);
                setConnectError(false);
            } else {
                setIsConnected(false);
                setConnectError(true);
            }
        });

        ipcRenderer.on("camera-record-start-reply", (_event: any, status: string) => {
            if (status === "started") {
                setIsRecording(true);
            }
        });

        ipcRenderer.on("camera-record-complete", (_event: any, success: boolean) => {
            if (success) {
                setIsRecording(false);
                setEditingState('촬영 완료');
            } else {
                setIsRecording(false);
                setEditingState('촬영 실패');
                alert("촬영 중 오류가 발생했습니다.");
            }
        });

        return () => {
            ipcRenderer.removeAllListeners("camera-connect-reply");
            ipcRenderer.removeAllListeners("camera-record-start-reply");
            ipcRenderer.removeAllListeners("camera-record-complete");
        };
    }, []);

    return (
        <div className={styles.container}>
            <div className={styles.menubar}>
                <div className={styles.menubarWrapper}>
                    <Link to={'/'} className={styles.homeBtn}><img src={HomeIcon} /></Link>
                    <div className={styles.status}>
                        {/* 연결 중 상태 */}
                        {(!isConnected && !connectError) ?
                            ('카메라 연결 상태 확인중...')
                            :
                            ('카메라 연결됨')
                        }
                    </div>
                </div>
            </div>
            <div className={styles.instruction}>
                <div className={styles.instructionWrapper}>


                    {/* 연결 실패 시 재시도 버튼 */}
                    {connectError && (
                        <button onClick={handleConnectCamera}>카메라 재연결</button>
                    )}

                    {/* 연결 완료 & 아직 촬영 안 함 */}
                    {isConnected && !isRecording && editingState === '편집 시작' && (
                        <button onClick={handleStartRecording}>촬영 시작</button>
                    )}

                    {/* 촬영 중 */}
                    {isRecording && (
                        <div className={styles.filmInProgress}>
                            <p>촬영이 진행중입니다</p>
                            <button
                                onClick={() => {
                                    ipcRenderer.send("camera-record-stop"); // 가정된 종료 로직
                                }}
                            >
                                촬영 중지
                            </button>
                        </div>
                    )}

                    {/* 촬영 완료됨 */}
                    {!isRecording && editingState !== '편집 시작' && (
                        <div className={styles.filmComplete}>
                            <p>촬영이 완료되었습니다</p>
                            <button
                                onClick={() => {
                                    setIsRecording(false);
                                    setEditingState('편집 시작');
                                }}
                            >
                                재촬영
                            </button>
                            <button onClick={testHandler} disabled={editingState === '편집중'}>
                                {editingState}
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <div className={styles.logo}>
                <div className={styles.logoName}>Logo Here</div>
            </div>
        </div>
    );
};

export default Film;
