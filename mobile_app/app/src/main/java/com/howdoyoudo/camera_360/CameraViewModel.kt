package com.howdoyoudo.camera_360

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel

class CameraViewModel : ViewModel() {

    // 연결 상태를 LiveData 관리 (Electron 앱과의 IPC 연결 상태)
    private val _connectionStatus = MutableLiveData<Boolean>().apply { value = false }
    val connectionStatus: LiveData<Boolean> = _connectionStatus

    // 녹화 상태를 LiveData 관리 (카메라 녹화 중인지 여부)
    private val _recordingStatus = MutableLiveData<Boolean>().apply { value = false }
    val recordingStatus: LiveData<Boolean> = _recordingStatus

    // 최근 수신된 명령을 LiveData 관리
    private val _lastCommand = MutableLiveData<String>().apply { value = "없음" }
    val lastCommand: LiveData<String> = _lastCommand

    // 연결 상태 업데이트 함수
    fun updateConnectionStatus(isConnected: Boolean) {
        _connectionStatus.value = isConnected
    }

    // 녹화 상태 업데이트 함수
    fun updateRecordingStatus(isRecording: Boolean) {
        _recordingStatus.value = isRecording
    }

    // 최근 명령 설정 함수
    fun setLastCommand(command: String) {
        _lastCommand.value = command
    }

    // 기타 설정 (예: 포트 번호, 저장 경로 등)을 필요에 따라 LiveData로 추가하고,
    // MainActivity에서 설정 변경 UI와 연동할 수 있습니다.
}