package com.howdoyoudo.camera_360

import android.content.Context
import android.os.Build
import android.util.Log
import android.os.Environment
import fi.iki.elonen.NanoHTTPD
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.IOException
import java.io.File

class FileServer(private val context: Context, private val port: Int) : NanoHTTPD(port) {

    private val TAG = "FileServer"

    // 🔧 CameraXManager와 동일한 경로 사용
    private val BASE_VIDEO_PATH = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        // Android 10+ : 앱 전용 외부 저장소 사용
        File(context.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: context.filesDir, "ElectronCameraApp").absolutePath
    } else {
        // Android 9 이하 : 기존 방식
        File(Environment.getExternalStorageDirectory(), "Movies/ElectronCameraApp").absolutePath
    }

    init {
        Log.d(TAG, "🔧 FileServer initialized with base path: $BASE_VIDEO_PATH")
        checkDirectoryAndPermissions()
    }

    /**
     * 🔍 디렉토리 및 권한 상태 확인
     */
    private fun checkDirectoryAndPermissions() {
        val baseDir = File(BASE_VIDEO_PATH)

        Log.d(TAG, "📂 Directory check:")
        Log.d(TAG, "  Path: ${baseDir.absolutePath}")
        Log.d(TAG, "  Exists: ${baseDir.exists()}")
        Log.d(TAG, "  Is Directory: ${baseDir.isDirectory}")
        Log.d(TAG, "  Can Read: ${baseDir.canRead()}")
        Log.d(TAG, "  Can Write: ${baseDir.canWrite()}")

        // External storage 상태 확인
        val storageState = Environment.getExternalStorageState()
        Log.d(TAG, "📱 External Storage State: $storageState")
        Log.d(TAG, "📱 External Storage Available: ${Environment.MEDIA_MOUNTED == storageState}")

        // 디렉토리가 없으면 생성 시도
        if (!baseDir.exists()) {
            Log.w(TAG, "⚠️ Directory does not exist, attempting to create...")
            val created = baseDir.mkdirs()
            Log.d(TAG, "📁 Directory creation result: $created")
        }

        // 파일 목록 확인
        try {
            val files = baseDir.listFiles()
            if (files != null) {
                Log.d(TAG, "📂 Found ${files.size} files in directory:")
                files.forEach { file ->
                    Log.d(TAG, "  📄 ${file.name} (${file.length()} bytes) - ${if (file.canRead()) "readable" else "not readable"}")
                }
            } else {
                Log.w(TAG, "⚠️ Cannot list files in directory (permission issue?)")
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "❌ Security exception when listing files: ${e.message}")
        }
    }

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        val method = session.method
        val remoteIP = session.headers["http-client-ip"] ?: session.headers["remote-addr"] ?: "unknown"

        Log.d(TAG, "🌐 HTTP $method Request: $uri from $remoteIP")

        // 🔍 루트 경로 요청 시 서버 상태 및 파일 목록 반환
        if (uri == "/" || uri == "/status") {
            return getServerStatus()
        }

        // 🔍 파일 목록 조회
        if (uri == "/list" || uri.startsWith("/list/")) {
            return getFileList()
        }

        // 🔍 실시간 디렉토리 체크
        if (uri == "/check") {
            checkDirectoryAndPermissions()
            return newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, "Directory check completed. See logcat for details.")
        }

        // 비디오 파일 다운로드 요청 처리
        if (uri.startsWith("/video/")) {
            val filename = uri.substring("/video/".length)
            Log.d(TAG, "🎬 Video file requested: '$filename'")

            // 파일명 검증
            if (filename.isEmpty() || filename.contains("..") || filename.contains("/")) {
                Log.w(TAG, "❌ Invalid filename: '$filename'")
                return newFixedLengthResponse(Response.Status.BAD_REQUEST, MIME_PLAINTEXT, "Error: Invalid filename")
            }

            val videoFile = File(BASE_VIDEO_PATH, filename)
            Log.d(TAG, "🔍 Looking for file: ${videoFile.absolutePath}")

            // 🔍 파일 상태 상세 확인
            Log.d(TAG, "📊 File status:")
            Log.d(TAG, "  Exists: ${videoFile.exists()}")
            Log.d(TAG, "  Is File: ${videoFile.isFile}")
            Log.d(TAG, "  Can Read: ${videoFile.canRead()}")
            Log.d(TAG, "  Size: ${if (videoFile.exists()) videoFile.length() else "N/A"} bytes")
            Log.d(TAG, "  Parent Dir: ${videoFile.parentFile?.absolutePath}")
            Log.d(TAG, "  Parent Exists: ${videoFile.parentFile?.exists()}")

            if (videoFile.exists() && videoFile.isFile && videoFile.canRead()) {
                try {
                    val mimeType = getMimeType(filename)
                    val fileSize = videoFile.length()

                    if (fileSize == 0L) {
                        Log.w(TAG, "⚠️ File exists but is empty: ${videoFile.absolutePath}")
                        return newFixedLengthResponse(Response.Status.NO_CONTENT, MIME_PLAINTEXT, "Error: File is empty")
                    }

                    val fis = FileInputStream(videoFile)

                    Log.d(TAG, "✅ Serving file: ${videoFile.absolutePath}")
                    Log.d(TAG, "📊 File size: $fileSize bytes, MIME: $mimeType")

                    val response = newChunkedResponse(Response.Status.OK, mimeType, fis)

                    // CORS 헤더 추가
                    response.addHeader("Access-Control-Allow-Origin", "*")
                    response.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                    response.addHeader("Access-Control-Allow-Headers", "Content-Type")
                    response.addHeader("Content-Disposition", "attachment; filename=\"$filename\"")

                    return response
                } catch (e: FileNotFoundException) {
                    Log.e(TAG, "❌ File not found during serving: ${e.message}")
                    return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Error: File not found during read - ${e.message}")
                } catch (e: IOException) {
                    Log.e(TAG, "❌ IO Error during serving: ${e.message}")
                    return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, MIME_PLAINTEXT, "Error: Internal server error - ${e.message}")
                } catch (e: SecurityException) {
                    Log.e(TAG, "❌ Security Error during serving: ${e.message}")
                    return newFixedLengthResponse(Response.Status.FORBIDDEN, MIME_PLAINTEXT, "Error: Permission denied - ${e.message}")
                }
            } else {
                Log.w(TAG, "❌ File access failed: ${videoFile.absolutePath}")
                Log.w(TAG, "  Exists: ${videoFile.exists()}")
                Log.w(TAG, "  Is File: ${videoFile.isFile}")
                Log.w(TAG, "  Can Read: ${videoFile.canRead()}")

                // 🔍 디렉토리 내용 재확인
                val parentDir = File(BASE_VIDEO_PATH)
                if (parentDir.exists() && parentDir.isDirectory) {
                    try {
                        val files = parentDir.listFiles()
                        Log.d(TAG, "📁 Directory contents (${files?.size ?: 0} files):")
                        files?.forEach { file ->
                            Log.d(TAG, "  📄 ${file.name} (${file.length()} bytes) - readable: ${file.canRead()}")
                        }
                    } catch (e: SecurityException) {
                        Log.e(TAG, "❌ Cannot list directory contents: ${e.message}")
                    }
                } else {
                    Log.w(TAG, "❌ Base directory issue: exists=${parentDir.exists()}, isDir=${parentDir.isDirectory}")
                }

                return newFixedLengthResponse(
                    Response.Status.NOT_FOUND,
                    MIME_PLAINTEXT,
                    "Error: File '$filename' not accessible.\nExists: ${videoFile.exists()}\nReadable: ${videoFile.canRead()}\nDirectory: $BASE_VIDEO_PATH"
                )
            }
        }

        // OPTIONS 요청 처리 (CORS preflight)
        if (method == Method.OPTIONS) {
            val response = newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, "")
            response.addHeader("Access-Control-Allow-Origin", "*")
            response.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            response.addHeader("Access-Control-Allow-Headers", "Content-Type")
            return response
        }

        Log.w(TAG, "❌ Unknown request: $method $uri")
        return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "The requested URL was not found on this server.")
    }

    /**
     * 🔍 서버 상태 및 기본 정보 반환
     */
    private fun getServerStatus(): Response {
        val baseDir = File(BASE_VIDEO_PATH)
        val status = StringBuilder()

        status.append("🎬 FileServer Status\n")
        status.append("===================\n")
        status.append("Port: $port\n")
        status.append("Base Path: $BASE_VIDEO_PATH\n")
        status.append("Directory Exists: ${baseDir.exists()}\n")
        status.append("Directory Readable: ${baseDir.canRead()}\n")
        status.append("External Storage State: ${Environment.getExternalStorageState()}\n")
        status.append("Storage Available: ${Environment.MEDIA_MOUNTED == Environment.getExternalStorageState()}\n\n")

        if (baseDir.exists()) {
            try {
                val files = baseDir.listFiles()?.filter { it.name.endsWith(".mp4") } ?: emptyList()
                status.append("Video Files: ${files.size}\n\n")

                files.forEach { file ->
                    status.append("📹 ${file.name}\n")
                    status.append("   Size: ${file.length()} bytes\n")
                    status.append("   Readable: ${file.canRead()}\n")
                    status.append("   URL: http://[SERVER_IP]:$port/video/${file.name}\n\n")
                }
            } catch (e: SecurityException) {
                status.append("❌ Permission denied to list files: ${e.message}\n")
            }
        } else {
            status.append("❌ Base directory does not exist!\n")
        }

        val response = newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, status.toString())
        response.addHeader("Access-Control-Allow-Origin", "*")
        return response
    }

    /**
     * 🔍 파일 목록 JSON 형태로 반환
     */
    private fun getFileList(): Response {
        val baseDir = File(BASE_VIDEO_PATH)
        val fileList = StringBuilder()

        fileList.append("{\n")
        fileList.append("  \"status\": \"ok\",\n")
        fileList.append("  \"basePath\": \"$BASE_VIDEO_PATH\",\n")
        fileList.append("  \"directoryExists\": ${baseDir.exists()},\n")
        fileList.append("  \"files\": [\n")

        if (baseDir.exists()) {
            try {
                val files = baseDir.listFiles()?.filter { it.name.endsWith(".mp4") && it.canRead() } ?: emptyList()
                files.forEachIndexed { index, file ->
                    fileList.append("    {\n")
                    fileList.append("      \"name\": \"${file.name}\",\n")
                    fileList.append("      \"size\": ${file.length()},\n")
                    fileList.append("      \"readable\": ${file.canRead()},\n")
                    fileList.append("      \"url\": \"/video/${file.name}\"\n")
                    fileList.append("    }")
                    if (index < files.size - 1) fileList.append(",")
                    fileList.append("\n")
                }
            } catch (e: SecurityException) {
                fileList.append("    {\"error\": \"Permission denied: ${e.message}\"}\n")
            }
        }

        fileList.append("  ],\n")
        fileList.append("  \"timestamp\": ${System.currentTimeMillis()}\n")
        fileList.append("}")

        val response = newFixedLengthResponse(Response.Status.OK, "application/json", fileList.toString())
        response.addHeader("Access-Control-Allow-Origin", "*")
        return response
    }

    private fun getMimeType(filename: String): String {
        return when {
            filename.endsWith(".mp4") -> "video/mp4"
            filename.endsWith(".png") -> "image/png"
            filename.endsWith(".jpg") || filename.endsWith(".jpeg") -> "image/jpeg"
            else -> MIME_PLAINTEXT
        }
    }

    fun startServer() {
        try {
            start(SOCKET_READ_TIMEOUT, false)
            Log.d(TAG, "✅ File server started on port $port")
            Log.d(TAG, "🌐 Server URLs:")
            Log.d(TAG, "  Status: http://[DEVICE_IP]:$port/status")
            Log.d(TAG, "  File List: http://[DEVICE_IP]:$port/list")
            Log.d(TAG, "  Directory Check: http://[DEVICE_IP]:$port/check")

            // 시작 시 디렉토리 상태 확인
            checkDirectoryAndPermissions()

        } catch (ioe: IOException) {
            Log.e(TAG, "❌ Couldn't start file server: ${ioe.message}")
        }
    }

    fun stopServer() {
        stop()
        Log.d(TAG, "🛑 File server stopped.")
    }
}