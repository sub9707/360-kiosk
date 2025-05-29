// main/CameraControl.ts
import { ipcMain } from 'electron';

let isCameraConnected = false;
let isRecording = false;

// 카메라 연결 요청 처리
ipcMain.on('camera-connect', (event) => {
  console.log('[IPC] camera-connect 요청 수신');

  // 가상의 연결 로직 (3초 후 연결 성공)
  setTimeout(() => {
    isCameraConnected = true;
    event.reply('camera-connect-reply', true); // 연결 성공
  }, 3000);
});

// 촬영 시작 요청 처리
ipcMain.on('camera-record-start', (event) => {
  console.log('[IPC] camera-record-start 요청 수신');

  if (!isCameraConnected) {
    console.warn('[WARN] 카메라가 연결되지 않았습니다');
    return;
  }

  isRecording = true;

  // 시작 신호 보냄
  event.reply('camera-record-start-reply', 'started');

  // 가상의 촬영 완료 (5초 후)
  setTimeout(() => {
    isRecording = false;

    const isSuccess = Math.random() > 0.1; // 90% 확률로 성공

    event.reply('camera-record-complete', isSuccess);
  }, 5000);
});

// 촬영 중지 로직 (선택적으로 확장 가능)
ipcMain.on('camera-record-stop', (event) => {
  console.log('[IPC] 촬영 중지 요청 수신');

  if (!isRecording) {
    console.warn('[WARN] 현재 촬영 중이 아닙니다');
    return;
  }

  isRecording = false;
  event.reply('camera-record-complete', true); // 강제 완료
});
