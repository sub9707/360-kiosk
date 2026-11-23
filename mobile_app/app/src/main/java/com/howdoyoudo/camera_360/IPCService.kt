package com.howdoyoudo.camera_360

import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.java_websocket.server.WebSocketServer
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.json.JSONObject
import java.net.InetSocketAddress
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.core.app.NotificationCompat

class IPCService : Service() {

    private val TAG = "ElectronIPCService"
    private var webSocketServer: WebSocketServer? = null
    @Volatile
    private var connectedElectronClient: WebSocket? = null

    interface ElectronMessageCallback {
        fun onMessage(eventName: String, data: JSONObject?)
    }

    companion object {
        var electronMessageCallback: ElectronMessageCallback? = null
        var cameraCommandCallback: ((String, String?) -> Unit)? = null
        var fileDeleteCallback: ((String) -> Unit)? = null
        var connectionStatusCallback: ((Boolean, String) -> Unit)? = null

        @Volatile
        var INSTANCE: IPCService? = null
    }

    override fun onCreate() {
        super.onCreate()
        INSTANCE = this

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "camera_channel",
                "Electron Camera Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }

        val notification: Notification = NotificationCompat.Builder(this, "camera_channel")
            .setContentTitle("Electron 카메라 서비스")
            .setContentText("PC와 연결된 상태입니다.")
            .setSmallIcon(R.drawable.ic_camera) // 리소스 필요
            .build()

        startForeground(1, notification) // 🔥 Foreground 시작
        startWebSocketServer()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "IPCService is being destroyed, stopping WebSocket server.")
        stopWebSocketServer()
        INSTANCE = null
    }

    private fun startWebSocketServer() {
        if (webSocketServer != null) return

        val port = 8080
        webSocketServer = object : WebSocketServer(InetSocketAddress(port)) {

            override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
                val clientInfo = conn.remoteSocketAddress.hostString
                Log.d(TAG, "🔗 PC 연결 요청 from $clientInfo")

                // 🔧 기존 연결이 있으면 종료하고 새 연결로 교체 (자동 허용)
                if (connectedElectronClient != null && connectedElectronClient != conn) {
                    Log.d(TAG, "🔄 기존 연결 종료하고 새 연결로 교체")
                    try {
                        connectedElectronClient?.close()
                    } catch (e: Exception) {
                        Log.w(TAG, "기존 연결 종료 중 오류: ${e.message}")
                    }
                }

                // 🚀 자동으로 연결 허용 (프롬프트 없이 바로 연결)
                connectedElectronClient = conn
                Log.d(TAG, "✅ PC 연결 자동 허용: $clientInfo")

                // 즉시 성공 응답 전송
                sendMessageToElectron("camera-connect-reply", JSONObject().apply {
                    put("success", true)
                    put("message", "자동 연결 성공")
                })

                updateConnectionStatus(true, "PC와 자동 연결됨 ($clientInfo)")
            }

            override fun onClose(conn: WebSocket, code: Int, reason: String, remote: Boolean) {
                Log.w(TAG, "❌ PC 연결 종료: ${conn.remoteSocketAddress}, code: $code, reason: $reason")
                if (conn == connectedElectronClient) {
                    connectedElectronClient = null
                    updateConnectionStatus(false, "PC 연결이 끊어졌습니다")
                }
            }

            override fun onMessage(conn: WebSocket, message: String) {
                try {
                    val json = JSONObject(message)
                    val channel = json.getString("channel")
                    val payload = json.optJSONObject("payload") ?: JSONObject()

                    Log.d(TAG, "📨 PC로부터 메시지: $channel")

                    when (channel) {
                        "ping" -> {
                            sendMessageToElectron("pong", JSONObject().apply {
                                put("message", "pong from Android")
                                put("timestamp", System.currentTimeMillis())
                            })
                        }

                        "startRecording" -> {
                            Log.d(TAG, "🎬 녹화 시작 명령 수신")
                            val durationMs = payload.optLong("durationMs", 0L)
                            cameraCommandCallback?.invoke("start", if (durationMs > 0) durationMs.toString() else null)
                        }

                        "stopRecording" -> {
                            Log.d(TAG, "🛑 녹화 중지 명령 수신")
                            cameraCommandCallback?.invoke("stop", null)
                        }

                        "deleteFile" -> {
                            val fileName = payload.optString("fileName")
                            if (fileName.isNotEmpty()) {
                                Log.d(TAG, "🗑️ 파일 삭제 명령: $fileName")
                                fileDeleteCallback?.invoke(fileName)
                            }
                        }
                    }

                    electronMessageCallback?.onMessage(channel, payload)

                } catch (e: Exception) {
                    Log.e(TAG, "❌ 메시지 처리 중 오류: ${e.message}", e)
                    // 메시지 파싱 오류 시 연결 종료하지 않고 경고만 로그
                    Log.w(TAG, "⚠️ 잘못된 메시지 형식 - 연결 유지: $message")
                }
            }

            override fun onError(conn: WebSocket?, ex: Exception) {
                Log.e(TAG, "⚠️ WebSocket 오류: ${ex.message}", ex)
                // 오류 발생 시에도 서버는 계속 실행
            }

            override fun onStart() {
                Log.i(TAG, "🚀 WebSocket 서버 시작됨 (포트 8080)")
                Log.i(TAG, "🔧 자동 연결 모드: PC 연결 시 프롬프트 없이 바로 허용")
            }
        }

        // 작은 제어 메시지가 Nagle 알고리즘으로 지연되지 않도록 즉시 전송
        webSocketServer?.isTcpNoDelay = true
        webSocketServer?.isReuseAddr = true
        webSocketServer?.start()
    }

    private fun stopWebSocketServer() {
        try {
            connectedElectronClient?.close()
            connectedElectronClient = null

            webSocketServer?.stop()
            webSocketServer = null

            Log.d(TAG, "🛑 WebSocket 서버 중지 완료")
        } catch (e: Exception) {
            Log.e(TAG, "❌ WebSocket 서버 종료 중 오류: ${e.message}", e)
        }
    }

    fun stopServiceAndCleanup() {
        Log.i(TAG, "🧹 Service cleanup and self-stop initiated.")
        stopWebSocketServer()
        stopSelf()
    }

    // 🚀 PC로 메시지 전송 (자동 연결된 클라이언트에게)
    fun sendMessageToElectron(eventName: String, data: JSONObject) {
        if (connectedElectronClient != null && connectedElectronClient?.isOpen == true) {
            try {
                val message = JSONObject().apply {
                    put("eventName", eventName)
                    put("data", data)
                }
                connectedElectronClient?.send(message.toString())
                Log.d(TAG, "📤 PC로 메시지 전송: $eventName")
            } catch (e: Exception) {
                Log.e(TAG, "❌ PC 메시지 전송 실패: ${e.message}")
            }
        } else {
            Log.w(TAG, "⚠️ PC가 연결되지 않음 - 메시지 전송 실패: $eventName")
        }
    }

    private fun updateConnectionStatus(connected: Boolean, message: String) {
        Log.d(TAG, "🔔 연결 상태 업데이트: $connected - $message")
        connectionStatusCallback?.invoke(connected, message)
    }

    // 🔧 연결 상태 확인 메소드 추가
    fun isConnectedToPC(): Boolean {
        return connectedElectronClient != null && connectedElectronClient?.isOpen == true
    }

    // 🔧 연결된 PC 정보 반환
    fun getConnectedPCInfo(): String? {
        return if (isConnectedToPC()) {
            connectedElectronClient?.remoteSocketAddress?.hostString
        } else {
            null
        }
    }
}