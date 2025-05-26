import React, { useState, useEffect } from 'react';
import styles from './Film.module.scss';


// 필요과정
// 1. 카메라 연결 확인 (버튼 촉발의 IPC 통신 활용)
// 2-1. 카메라 연결 이후 촬영버튼 활성화
// 2-2. 카메라 연결 불가 -> 재시도 버튼 활성화
// 3-1. 촬영버튼 클릭 시 영상 촬영

const Film: React.FC = () => {
    const [message, setMessage] = useState("");
    const { ipcRenderer } = window.require("electron");

    const handleClick = () => {
        ipcRenderer.send("channel", "HIHIHIHI");
    };

    useEffect(() => {
        // IPC 이벤트 리스너 등록
        ipcRenderer.on("channel", (event: any, data: string) => {
            setMessage(data); // 받은 메시지를 상태로 설정
        });
    }, [ipcRenderer]);

    return (
        <div>
            <h1>Received: {message}</h1>
            <button onClick={handleClick}>Click me</button>
        </div>
    );
};

export default Film;