package com.howdoyoudo.camera_360

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.util.Log
import android.util.Size
import android.os.Handler
import android.os.Looper
import android.os.Environment

import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner

import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy

import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.json.JSONObject

class CameraXManager(private val context: Context, private val lifecycleOwner: LifecycleOwner) {

    private val TAG = "CameraXManager"
    private var cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private var videoCapture: VideoCapture<Recorder>? = null
    private var recording: Recording? = null
    private var preview: Preview? = null
    private var cameraProvider: ProcessCameraProvider? = null

    // 🔧 카메라 상태 관리 변수 강화
    private var isCameraInitialized = false
    private var isRecordingInProgress = false
    private var isPreviewActive = false
    private var initializationInProgress = false

    // 🎬 20초 타이머 관련 변수
    private var recordingTimer: Handler? = null
    private var recordingRunnable: Runnable? = null
    private val DEFAULT_RECORDING_DURATION_MS = 20 * 1000L // PC 가 길이를 지정하지 않은 경우(구버전 호환)
    private var recordingDurationMs = DEFAULT_RECORDING_DURATION_MS

    // 최종 결과물은 PC 에서 8Mbps 이하로 재인코딩되므로 원본을 과도하게 높은 비트레이트로 찍을 필요가 없다.
    // (기기 기본 FHD ≈ 16~20Mbps → 10Mbps: 전송 시간 약 40~50% 단축, 재인코딩 화질 영향 미미)
    private val TARGET_VIDEO_BITRATE = 10_000_000

    // 📁 Scoped Storage 호환 저장 경로
    private val VIDEO_SAVE_DIR = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        // Android 10+ : 앱 전용 외부 저장소 사용 (권한 불필요)
        File(context.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: context.filesDir, "ElectronCameraApp")
    } else {
        // Android 9 이하 : 기존 방식
        File(Environment.getExternalStorageDirectory(), "Movies/ElectronCameraApp")
    }

    // 비디오 저장 완료 콜백
    private var onVideoSavedListener: ((String) -> Unit)? = null

    fun setOnVideoSavedListener(listener: (String) -> Unit) {
        this.onVideoSavedListener = listener
    }

    init {
        // 저장 디렉토리 생성
        if (!VIDEO_SAVE_DIR.exists()) {
            val created = VIDEO_SAVE_DIR.mkdirs()
            Log.d(TAG, "📁 Video directory created: $created at ${VIDEO_SAVE_DIR.absolutePath}")
        } else {
            Log.d(TAG, "📁 Video directory exists: ${VIDEO_SAVE_DIR.absolutePath}")
        }
    }

    @SuppressLint("RestrictedApi")
    fun startCameraPreview(previewView: PreviewView) {
        // 🔧 중복 초기화 방지 강화
        if (initializationInProgress) {
            Log.d(TAG, "📷 Camera initialization already in progress, skipping")
            return
        }

        if (isCameraInitialized && isPreviewActive) {
            Log.d(TAG, "📷 Camera already initialized and preview active, skipping")
            return
        }

        initializationInProgress = true
        Log.d(TAG, "📷 Starting camera initialization...")

        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

        cameraProviderFuture.addListener({
            try {
                // 🔧 안전한 카메라 정리
                safeCleanupCamera()

                cameraProvider = cameraProviderFuture.get()

                // 🔧 모든 기존 use case 바인딩 해제
                cameraProvider?.unbindAll()

                // 잠시 대기 (리소스 정리 시간 확보)
                Thread.sleep(100)

                // Preview 생성
                preview = Preview.Builder()
                    .setResolutionSelector(
                        ResolutionSelector.Builder()
                            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
                            .setResolutionStrategy(ResolutionStrategy(Size(1280, 720), ResolutionStrategy.FALLBACK_RULE_NONE))
                            .build()
                    )
                    .build()

                // Recorder (for video capture)
                val recorder = Recorder.Builder()
                    .setQualitySelector(QualitySelector.from(Quality.FHD))
                    .setTargetVideoEncodingBitRate(TARGET_VIDEO_BITRATE)
                    .build()
                videoCapture = VideoCapture.withOutput(recorder)

                // 🔧 Preview surface provider 설정 (메인 스레드에서)
                Handler(Looper.getMainLooper()).post {
                    try {
                        preview?.setSurfaceProvider(previewView.surfaceProvider)

                        // 카메라 바인딩
                        cameraProvider?.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            videoCapture
                        )

                        isCameraInitialized = true
                        isPreviewActive = true
                        initializationInProgress = false

                        Log.d(TAG, "✅ Camera preview started successfully")

                    } catch (bindException: Exception) {
                        Log.e(TAG, "❌ Camera binding failed", bindException)
                        initializationInProgress = false
                        handleCameraError(bindException)
                    }
                }

            } catch (exc: Exception) {
                Log.e(TAG, "❌ Camera provider failed", exc)
                initializationInProgress = false
                handleCameraError(exc)
            }
        }, ContextCompat.getMainExecutor(context))
    }

    // 🔧 카메라 오류 처리
    private fun handleCameraError(exception: Exception) {
        Log.e(TAG, "🔧 Handling camera error: ${exception.message}")
        safeCleanupCamera()

        // 3초 후 재시도
        Handler(Looper.getMainLooper()).postDelayed({
            Log.d(TAG, "🔄 Retrying camera initialization after error...")
            initializationInProgress = false
            // restartCamera 메서드는 외부에서 호출하도록 함
        }, 3000)
    }

    /**
     * @param durationMs PC 가 지정한 녹화 길이. null 이면 기본 20초.
     */
    fun startRecording(durationMs: Long? = null) {
        recordingDurationMs = durationMs?.takeIf { it in 3_000L..60_000L } ?: DEFAULT_RECORDING_DURATION_MS
        if (!isCameraInitialized) {
            Log.e(TAG, "❌ Camera not initialized. Cannot start recording.")
            return
        }

        if (videoCapture == null) {
            Log.e(TAG, "❌ VideoCapture is not initialized.")
            return
        }

        if (isRecordingInProgress) {
            Log.w(TAG, "⚠️ Recording already in progress. Ignoring start request.")
            return
        }

        Log.d(TAG, "🎬 Starting recording...")

        // 🔧 안전한 기존 녹화 정리
        safeCleanupRecording()

        // 🎬 기존 타이머가 있으면 취소
        stopRecordingTimer()

        // 📁 직접 파일 시스템에 저장할 파일 생성
        val name = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(System.currentTimeMillis())
        val fileName = "VIDEO_${name}.mp4"
        val videoFile = File(VIDEO_SAVE_DIR, fileName)

        Log.d(TAG, "🎬 Recording will be saved to: ${videoFile.absolutePath}")

        // 📁 FileOutputOptions 사용
        val fileOutputOptions = FileOutputOptions.Builder(videoFile).build()

        try {
            recording = videoCapture?.output?.prepareRecording(
                context,
                fileOutputOptions
            )
                // 오디오는 편집 시 BGM 으로 대체되므로 녹음하지 않는다 (파일 크기·인코딩 부하 감소)
                ?.start(ContextCompat.getMainExecutor(context)) { recordEvent: VideoRecordEvent ->
                    handleRecordingEvent(recordEvent, fileName, videoFile)
                }

            if (recording != null) {
                Log.d(TAG, "🎬 Recording start initiated successfully")
            } else {
                Log.e(TAG, "❌ Failed to start recording - recording is null")
                isRecordingInProgress = false
            }

        } catch (e: Exception) {
            Log.e(TAG, "❌ Exception during recording start: ${e.message}", e)
            isRecordingInProgress = false
            safeCleanupRecording()
        }
    }

    // 🔧 녹화 이벤트 처리 분리
    private fun handleRecordingEvent(recordEvent: VideoRecordEvent, fileName: String, videoFile: File) {
        when (recordEvent) {
            is VideoRecordEvent.Start -> {
                Log.d(TAG, "🎬 Recording started - 20초 타이머 시작")
                isRecordingInProgress = true
                IPCService.INSTANCE?.sendMessageToElectron("camera-recording-status", JSONObject().apply {
                    put("isRecording", true)
                    put("fileName", fileName)
                })

                // 🎬 20초 후 자동 중지 타이머 시작
                startRecordingTimer()
            }
            is VideoRecordEvent.Finalize -> {
                Log.d(TAG, "🎬 Recording finalized")
                isRecordingInProgress = false
                stopRecordingTimer()

                if (!recordEvent.hasError()) {
                    handleSuccessfulRecording(videoFile, fileName)
                } else {
                    // 🔧 VideoRecordEvent.Finalize의 올바른 에러 처리
                    val errorCode = recordEvent.error
                    val errorCause = recordEvent.cause
                    handleFailedRecording(errorCode, errorCause, fileName)
                }

                IPCService.INSTANCE?.sendMessageToElectron("camera-recording-status", JSONObject().apply {
                    put("isRecording", false)
                })
            }
            is VideoRecordEvent.Status -> {
                // 🔧 상태 로그 줄이기
                val stats = recordEvent.recordingStats
                if (stats.recordedDurationNanos > 0) {
                    val durationSeconds = stats.recordedDurationNanos / 1_000_000_000.0
                    if (durationSeconds.toInt() % 3 == 0) { // 3초마다만 로그
                        Log.d(TAG, "🎬 Recording: ${String.format("%.1f", durationSeconds)}초")
                    }
                }
            }
        }
    }

    // 🔧 성공적인 녹화 처리
    private fun handleSuccessfulRecording(videoFile: File, fileName: String) {
        Log.d(TAG, "✅ Video saved successfully!")
        Log.d(TAG, "📁 File: ${videoFile.absolutePath} (${videoFile.length()} bytes)")

        if (videoFile.exists() && videoFile.length() > 0) {
            IPCService.INSTANCE?.sendMessageToElectron("video-saved", JSONObject().apply {
                put("fileName", fileName)
                put("fileSize", videoFile.length())
            })
            onVideoSavedListener?.invoke(fileName)

            // 🔧 디렉토리 로그 줄이기
            VIDEO_SAVE_DIR.listFiles()?.let { files ->
                Log.d(TAG, "📂 Directory: ${files.size} files")
            }
        } else {
            Log.e(TAG, "❌ Saved file invalid!")
            IPCService.INSTANCE?.sendMessageToElectron("video-saved", JSONObject().apply {
                put("success", false)
                put("error", "Saved file does not exist or is empty")
            })
        }
    }

    // 🔧 실패한 녹화 처리 (간소화)
    private fun handleFailedRecording(errorCode: Int, errorCause: Throwable?, fileName: String) {
        val errorMessage = "녹화 실패 (오류 코드: $errorCode)"

        val fullErrorMessage = if (errorCause != null) {
            "$errorMessage - ${errorCause.message}"
        } else {
            errorMessage
        }

        Log.e(TAG, "❌ Recording failed: $fullErrorMessage")
        IPCService.INSTANCE?.sendMessageToElectron("video-saved", JSONObject().apply {
            put("success", false)
            put("error", fullErrorMessage)
            put("errorCode", errorCode)
            put("fileName", fileName)
        })
    }

    /**
     * 🎬 20초 녹화 타이머 시작
     */
    private fun startRecordingTimer() {
        recordingTimer = Handler(Looper.getMainLooper())
        recordingRunnable = Runnable {
            Log.d(TAG, "🎬 ${recordingDurationMs}ms 타이머 완료 - 자동으로 녹화 중지")
            stopRecording()
        }
        recordingTimer?.postDelayed(recordingRunnable!!, recordingDurationMs)
    }

    /**
     * 🎬 녹화 타이머 중지
     */
    private fun stopRecordingTimer() {
        recordingRunnable?.let { runnable ->
            recordingTimer?.removeCallbacks(runnable)
        }
        recordingTimer = null
        recordingRunnable = null
    }

    /**
     * 비디오 녹화를 중지합니다.
     */
    fun stopRecording() {
        Log.d(TAG, "🎬 Stop recording called")
        stopRecordingTimer()

        if (recording != null && isRecordingInProgress) {
            try {
                recording?.stop()
                Log.d(TAG, "🎬 Recording stopped successfully")
            } catch (e: Exception) {
                Log.e(TAG, "❌ Error stopping recording: ${e.message}")
            }
            recording = null
            isRecordingInProgress = false
        } else {
            Log.d(TAG, "🎬 No active recording to stop")
        }
    }

    /**
     * 🔧 안전한 녹화 관련 리소스 정리
     */
    private fun safeCleanupRecording() {
        try {
            stopRecordingTimer()

            if (recording != null) {
                try {
                    recording?.stop()
                } catch (e: Exception) {
                    Log.w(TAG, "⚠️ Error stopping recording during cleanup: ${e.message}")
                }
                recording = null
            }

            isRecordingInProgress = false
            Log.d(TAG, "🔧 Recording cleanup completed")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error during recording cleanup: ${e.message}")
        }
    }

    /**
     * 🔧 안전한 카메라 관련 리소스 정리
     */
    private fun safeCleanupCamera() {
        try {
            // 녹화 먼저 정리
            safeCleanupRecording()

            // Preview surface provider 정리 (메인 스레드에서)
            Handler(Looper.getMainLooper()).post {
                try {
                    preview?.setSurfaceProvider(null)
                } catch (e: Exception) {
                    Log.w(TAG, "⚠️ Error clearing surface provider: ${e.message}")
                }
            }

            // 카메라 바인딩 해제
            try {
                cameraProvider?.unbindAll()
            } catch (e: Exception) {
                Log.w(TAG, "⚠️ Error unbinding camera: ${e.message}")
            }

            // 리소스 정리
            preview = null
            videoCapture = null
            isPreviewActive = false

            Log.d(TAG, "🔧 Camera cleanup completed")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error during camera cleanup: ${e.message}")
        }
    }

    /**
     * CameraX 관련 리소스를 정리하고 스레드 풀을 종료합니다.
     */
    fun shutdown() {
        Log.d(TAG, "🛑 CameraXManager shutdown initiated")

        // 초기화 상태 리셋
        initializationInProgress = false
        isCameraInitialized = false

        // 카메라 정리
        safeCleanupCamera()

        // ExecutorService 종료
        try {
            cameraExecutor.shutdown()
            if (!cameraExecutor.awaitTermination(2, java.util.concurrent.TimeUnit.SECONDS)) {
                cameraExecutor.shutdownNow()
            }
            Log.d(TAG, "🛑 CameraExecutor shutdown complete")
        } catch (e: Exception) {
            Log.w(TAG, "⚠️ Error shutting down camera executor: ${e.message}")
            cameraExecutor.shutdownNow()
        }

        Log.d(TAG, "✅ CameraXManager shutdown complete")
    }

    /**
     * 🔧 카메라 재시작 (문제 발생 시 복구용)
     */
    fun restartCamera(previewView: PreviewView) {
        Log.d(TAG, "🔄 Restarting camera...")

        // 상태 리셋
        initializationInProgress = false
        isCameraInitialized = false
        isPreviewActive = false

        // 정리 후 재시작
        safeCleanupCamera()

        // 1초 대기 후 재시작
        Handler(Looper.getMainLooper()).postDelayed({
            startCameraPreview(previewView)
        }, 1000)
    }

    /**
     * 🔧 카메라 상태 확인
     */
    fun getCameraStatus(): String {
        return "Initialized: $isCameraInitialized, PreviewActive: $isPreviewActive, Recording: $isRecordingInProgress, InitInProgress: $initializationInProgress"
    }
}