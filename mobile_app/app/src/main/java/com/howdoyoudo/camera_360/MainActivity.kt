package com.howdoyoudo.camera_360

import android.Manifest
import android.content.*
import android.content.pm.PackageManager
import android.os.*
import android.util.Log
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModelProvider
import com.howdoyoudo.camera_360.databinding.ActivityMainBinding
import org.json.JSONObject
import java.io.File
import android.net.wifi.WifiManager
import android.view.WindowManager
import java.text.SimpleDateFormat
import java.util.*

class MainActivity : AppCompatActivity() {

    private val TAG = "MainActivity"
    private lateinit var viewBinding: ActivityMainBinding
    private lateinit var cameraXManager: CameraXManager
    private lateinit var fileServer: FileServer
    private lateinit var cameraViewModel: CameraViewModel
    private var isAppInForeground = true
    private var wifiLock: WifiManager.WifiLock? = null

    // 🔴 녹화 인디케이터 관련 변수 추가
    private var recordingBlinkHandler: Handler? = null
    private var recordingBlinkRunnable: Runnable? = null
    private var isBlinking = false

    // 🔧 API 레벨별 권한 배열
    private val REQUIRED_PERMISSIONS = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> { // Android 13+
            arrayOf(
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.READ_MEDIA_VIDEO
            )
        }
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.R -> { // Android 11-12
            arrayOf(
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.READ_EXTERNAL_STORAGE
            )
        }
        else -> { // Android 10 이하
            arrayOf(
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.WRITE_EXTERNAL_STORAGE,
                Manifest.permission.READ_EXTERNAL_STORAGE
            )
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            Log.d(TAG, "🚀 MainActivity onCreate 시작")
            Log.d(TAG, "📱 Android API: ${Build.VERSION.SDK_INT}, Target: ${applicationInfo.targetSdkVersion}")

            viewBinding = ActivityMainBinding.inflate(layoutInflater)
            setContentView(viewBinding.root)

            logSystemInfo()

            // 🔧 안전한 초기화
            initializeComponents()
            setupCallbacks()
            setupObservers()

            // 권한 체크
            if (!allPermissionsGranted()) {
                Log.d(TAG, "📋 권한 요청 필요")
                requestPermissions()
            } else {
                Log.d(TAG, "✅ 모든 권한 허용됨")
                initializeAfterPermissions()
            }

        } catch (e: Exception) {
            Log.e(TAG, "❌ onCreate 초기화 실패", e)
            Toast.makeText(this, "앱 초기화 실패: ${e.message}", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    // 🔧 컴포넌트 초기화 분리
    private fun initializeComponents() {
        try {
            cameraXManager = CameraXManager(this, this)
            fileServer = FileServer(this, 8081)
            fileServer.startServer()
            cameraViewModel = ViewModelProvider(this)[CameraViewModel::class.java]
            Log.d(TAG, "✅ 컴포넌트 초기화 완료")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 컴포넌트 초기화 실패", e)
            throw e
        }
    }

    // 🔧 콜백 설정 분리
    private fun setupCallbacks() {
        try {
            // 녹화 완료 콜백
            cameraXManager.setOnVideoSavedListener { fileName ->
                runOnUiThread {
                    viewBinding.recordingStatusTextView.text = "📹 완료: $fileName"
                    IPCService.INSTANCE?.sendMessageToElectron("video-saved", JSONObject().apply {
                        put("fileName", fileName)
                        put("fileSize", getVideoFileSize(fileName))
                        put("timestamp", System.currentTimeMillis())
                    })
                    checkSavedFile(fileName)
                }
            }

            // 🚀 IPC 명령 처리
            IPCService.cameraCommandCallback = { command, arg ->
                runOnUiThread {
                    when (command) {
                        "start" -> {
                            if (isAppInForeground) {
                                Log.d(TAG, "🎬 PC에서 녹화 시작 명령 수신")
                                cameraXManager.startRecording(arg?.toLongOrNull())
                                viewBinding.recordingStatusTextView.text = "🎬 PC 제어로 촬영 중..."
                                cameraViewModel.updateRecordingStatus(true)
                            } else {
                                Log.w(TAG, "⚠️ 앱이 백그라운드 상태라 녹화 시작 무시")
                            }
                        }
                        "stop" -> {
                            Log.d(TAG, "🛑 PC에서 녹화 중지 명령 수신")
                            cameraXManager.stopRecording()
                            cameraViewModel.updateRecordingStatus(false)
                        }
                    }
                    cameraViewModel.setLastCommand("PC 명령: $command")
                }
            }

            // 🚀 연결 상태 콜백
            IPCService.connectionStatusCallback = { isConnected, message ->
                runOnUiThread {
                    cameraViewModel.updateConnectionStatus(isConnected)
                    if (isConnected) {
                        Log.d(TAG, "✅ PC 자동 연결됨: $message")
                        viewBinding.connectionStatusTextView.text = "✅ PC 연결됨"
                        cameraViewModel.setLastCommand("자동 연결 성공")

                        // 🚀 연결 성공 시 PC에 현재 상태 전송
                        IPCService.INSTANCE?.sendMessageToElectron("camera-status", JSONObject().apply {
                            put("connected", true)
                            put("appVersion", getAppVersion())
                            put("androidVersion", Build.VERSION.RELEASE)
                            put("deviceModel", Build.MODEL)
                            put("cameraReady", true)
                        })
                    } else {
                        Log.w(TAG, "❌ PC 연결 실패: $message")
                        viewBinding.connectionStatusTextView.text = "❌ PC 연결 실패"
                        cameraViewModel.setLastCommand("연결 상태: $message")
                    }
                }
            }

            // 🚀 파일 삭제 콜백
            IPCService.fileDeleteCallback = { fileName ->
                runOnUiThread {
                    Log.d(TAG, "🗑️ PC에서 파일 삭제 요청: $fileName")
                    deleteVideoFile(fileName)
                    viewBinding.recordingStatusTextView.text = "🗑️ 파일 삭제: $fileName"
                }
            }

            Log.d(TAG, "✅ 콜백 설정 완료")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 콜백 설정 실패", e)
            throw e
        }
    }

    // 🔧 옵저버 설정 분리
    private fun setupObservers() {
        try {
            cameraViewModel.connectionStatus.observe(this) { isConnected ->
                viewBinding.connectionStatusTextView.text = if (isConnected) {
                    "✅ PC 연결됨"
                } else {
                    "❌ PC 연결 대기중"
                }
            }

            cameraViewModel.recordingStatus.observe(this) { isRecording ->
                viewBinding.recordingStatusTextView.text = if (isRecording) {
                    "🎬 PC 제어로 촬영 중"
                } else {
                    "⏸️ 촬영 대기"
                }
            }

            cameraViewModel.lastCommand.observe(this) { command ->
                Log.d(TAG, "📋 최신 명령: $command")
            }

            Log.d(TAG, "✅ 옵저버 설정 완료")
        } catch (e: Exception) {
            Log.e(TAG, "❌ 옵저버 설정 실패", e)
            throw e
        }
    }

    // 🔧 권한 허용 후 초기화
    private fun initializeAfterPermissions() {
        try {
            Log.d(TAG, "🚀 권한 확인 완료 - 카메라 및 서비스 초기화")

            // 화면 켜둠 플래그 추가
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            Log.d(TAG, "✅ FLAG_KEEP_SCREEN_ON 설정 완료")

            // 1. CameraX 프리뷰 시작
            cameraXManager.startCameraPreview(viewBinding.previewView)

            // 2. IPCService 자동 실행
            val intent = Intent(this, IPCService::class.java)
            startService(intent)

            // 3. Wi-Fi Lock 확보
            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            wifiLock = wifiManager.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "ElectronCameraLock")
            try {
                wifiLock?.acquire()
                Log.d(TAG, "✅ Wi-Fi Lock 확보 성공")

                // 추가: 화면 WakeLock도 함께 확보
                val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
                val screenWakeLock = powerManager.newWakeLock(
                    PowerManager.SCREEN_DIM_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                    "ElectronCamera::ScreenLock"
                )
                screenWakeLock.acquire()
                Log.d(TAG, "✅ Screen WakeLock 확보 성공")

            } catch (e: SecurityException) {
                Log.w(TAG, "⚠️ WAKE_LOCK 권한 없음 - Wi-Fi Lock 생략")
            }

            Log.d(TAG, "✅ 카메라 및 네트워크 서비스 자동 시작 완료")
            Log.d(TAG, "🌐 PC 연결 대기 중... (자동 연결 모드)")

        } catch (e: Exception) {
            Log.e(TAG, "❌ 권한 허용 후 초기화 실패", e)
            Toast.makeText(this, "카메라 초기화 실패: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    // 🔧 권한 체크 개선
    private fun allPermissionsGranted(): Boolean {
        val granted = REQUIRED_PERMISSIONS.all {
            val result = ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
            Log.d(TAG, "🔐 Permission $it: $result")
            result
        }
        Log.d(TAG, "📋 모든 권한 허용 여부: $granted")
        return granted
    }

    private fun requestPermissions() {
        Log.d(TAG, "📋 권한 요청 시작: ${REQUIRED_PERMISSIONS.contentToString()}")
        permissionLauncher.launch(REQUIRED_PERMISSIONS)
    }

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            Log.d(TAG, "📋 권한 요청 결과: $result")

            if (result.values.all { it }) {
                Log.d(TAG, "✅ 모든 권한 허용됨")
                initializeAfterPermissions()
            } else {
                Log.e(TAG, "❌ 필수 권한이 거부됨")
                val deniedPermissions = result.filter { !it.value }.keys
                Log.e(TAG, "❌ 거부된 권한들: $deniedPermissions")

                Toast.makeText(this, "카메라 및 저장소 권한이 필요합니다", Toast.LENGTH_LONG).show()

                AlertDialog.Builder(this)
                    .setTitle("권한 필요")
                    .setMessage("앱을 사용하려면 카메라와 저장소 권한이 필요합니다.\n설정에서 권한을 허용해주세요.")
                    .setPositiveButton("설정으로 이동") { _, _ ->
                        val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                            data = android.net.Uri.fromParts("package", packageName, null)
                        }
                        startActivity(intent)
                        finish()
                    }
                    .setNegativeButton("종료") { _, _ ->
                        finish()
                    }
                    .setCancelable(false)
                    .show()
            }
        }

    // 나머지 메서드들은 동일...
    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "🛑 MainActivity is being destroyed. Cleaning up resources.")

        try {
            fileServer.stopServer()
            Log.d(TAG, "✅ FileServer stopped successfully.")
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error stopping FileServer", e)
        }

        IPCService.INSTANCE?.stopServiceAndCleanup()
        Log.d(TAG, "📤 IPCService cleanup requested.")

        cameraXManager.shutdown()
        Log.d(TAG, "✅ MainActivity cleanup completed.")

        wifiLock?.let {
            if (it.isHeld) it.release()
        }
    }

    override fun onResume() {
        super.onResume()
        isAppInForeground = true
        Log.d(TAG, "▶️ App resumed - 카메라 사용 가능")

        if (IPCService.INSTANCE == null) {
            Log.i(TAG, "🚀 IPCService가 null이라 자동 시작 요청")
            val intent = Intent(this, IPCService::class.java)
            startService(intent)

            Handler(Looper.getMainLooper()).postDelayed({
                if (IPCService.INSTANCE != null) {
                    Log.d(TAG, "✅ IPCService 자동 재시작 완료")
                } else {
                    Log.w(TAG, "⚠️ IPCService 자동 재시작 실패")
                }
            }, 1000)
        } else {
            Log.d(TAG, "ℹ️ IPCService 이미 실행 중")
        }
    }

    override fun onPause() {
        super.onPause()
        isAppInForeground = false
        Log.d(TAG, "⏸️ App paused - 카메라 사용 불가")
    }

    private fun logSystemInfo() {
        Log.d(TAG, "📱 Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        Log.d(TAG, "📱 Device: ${Build.MANUFACTURER} ${Build.MODEL}")
        Log.d(TAG, "📱 App Version: ${getAppVersion()}")
    }

    private fun getAppVersion(): String {
        return try {
            val packageInfo = packageManager.getPackageInfo(packageName, 0)
            packageInfo.versionName ?: "Unknown"
        } catch (e: Exception) {
            Log.w(TAG, "앱 버전 정보 가져오기 실패: ${e.message}")
            "Unknown"
        }
    }

    private fun checkSavedFile(fileName: String) {
        // 🔧 앱 전용 디렉토리에서 파일 확인
        val file = getVideoFile(fileName)
        if (file.exists()) {
            Log.d(TAG, "✅ 파일 저장 확인됨: ${file.absolutePath} (${file.length()} bytes)")
        } else {
            Log.w(TAG, "⚠️ 파일 저장 확인 실패: ${file.absolutePath}")
        }
    }

    private fun deleteVideoFile(fileName: String) {
        try {
            val file = getVideoFile(fileName)
            if (file.exists()) {
                val deleted = file.delete()
                Log.d(TAG, if (deleted) "✅ 파일 삭제 성공: $fileName" else "❌ 파일 삭제 실패: $fileName")

                IPCService.INSTANCE?.sendMessageToElectron("file-delete-result", JSONObject().apply {
                    put("fileName", fileName)
                    put("success", deleted)
                })
            } else {
                Log.w(TAG, "⚠️ 삭제 요청된 파일이 존재하지 않음: $fileName")

                IPCService.INSTANCE?.sendMessageToElectron("file-delete-result", JSONObject().apply {
                    put("fileName", fileName)
                    put("success", true)
                    put("message", "File does not exist")
                })
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ 파일 삭제 중 오류: ${e.message}")

            IPCService.INSTANCE?.sendMessageToElectron("file-delete-result", JSONObject().apply {
                put("fileName", fileName)
                put("success", false)
                put("error", e.message)
            })
        }
    }

    private fun getVideoFileSize(fileName: String): Long {
        return try {
            val file = getVideoFile(fileName)
            if (file.exists()) file.length() else 0L
        } catch (e: Exception) {
            Log.w(TAG, "파일 크기 확인 실패: ${e.message}")
            0L
        }
    }

    // 🔧 앱 전용 디렉토리를 사용하는 헬퍼 함수
    private fun getVideoFile(fileName: String): File {
        val videoDir = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            File(getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: filesDir, "ElectronCameraApp")
        } else {
            File(Environment.getExternalStorageDirectory(), "Movies/ElectronCameraApp")
        }

        if (!videoDir.exists()) {
            videoDir.mkdirs()
        }

        return File(videoDir, fileName)
    }
}