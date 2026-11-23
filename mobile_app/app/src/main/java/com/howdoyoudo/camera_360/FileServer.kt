package com.howdoyoudo.camera_360

import android.content.Context
import android.os.Build
import android.os.Environment
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.IOException

/**
 * 녹화 파일 HTTP 서버 (:8081)
 *
 * 최적화
 * - 기존 chunked 응답 + 비버퍼 FileInputStream → 고정 길이(Content-Length) + 256KB 버퍼 스트림
 * - HTTP Range(206) 지원 → PC 가 여러 연결로 구간을 병렬 다운로드해 Wi-Fi 처리량을 끌어올린다
 * - 요청마다 디렉토리 전체를 스캔·로그하던 진단 코드를 제거해 요청 지연을 줄였다
 */
class FileServer(private val context: Context, private val port: Int) : NanoHTTPD(port) {

    private val TAG = "FileServer"

    // CameraXManager 와 동일한 경로
    private val baseDir: File = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        File(context.getExternalFilesDir(Environment.DIRECTORY_MOVIES) ?: context.filesDir, "ElectronCameraApp")
    } else {
        @Suppress("DEPRECATION")
        File(Environment.getExternalStorageDirectory(), "Movies/ElectronCameraApp")
    }

    init {
        if (!baseDir.exists()) baseDir.mkdirs()
    }

    override fun serve(session: IHTTPSession): Response {
        val uri = session.uri
        return when {
            session.method == Method.OPTIONS -> cors(newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, ""))
            uri == "/" || uri == "/status" -> cors(status())
            uri == "/list" || uri.startsWith("/list/") -> cors(list())
            uri == "/check" -> cors(newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, diagnostics()))
            uri.startsWith("/video/") -> serveVideo(uri.removePrefix("/video/"), session.headers["range"])
            uri == "/speedtest" -> speedtest(session.parameters["size"]?.firstOrNull())
            else -> newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found")
        }
    }

    private fun serveVideo(filename: String, rangeHeader: String?): Response {
        if (filename.isEmpty() || filename.contains("..") || filename.contains("/") || filename.contains("\\")) {
            return newFixedLengthResponse(Response.Status.BAD_REQUEST, MIME_PLAINTEXT, "Invalid filename")
        }
        val file = File(baseDir, filename)
        if (!file.isFile || !file.canRead()) {
            Log.w(TAG, "파일 없음: ${file.absolutePath}")
            return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "File not found")
        }
        val size = file.length()
        if (size == 0L) {
            return newFixedLengthResponse(Response.Status.NO_CONTENT, MIME_PLAINTEXT, "File is empty")
        }
        val mime = mimeOf(filename)

        return try {
            val range = parseRange(rangeHeader, size)
            if (range != null) {
                val (start, end) = range
                val length = end - start + 1
                val input = FileInputStream(file)
                skipFully(input, start)
                val res = newFixedLengthResponse(
                    Response.Status.PARTIAL_CONTENT, mime, BufferedInputStream(input, BUFFER), length
                )
                res.addHeader("Content-Range", "bytes $start-$end/$size")
                res.addHeader("Accept-Ranges", "bytes")
                cors(res)
            } else if (rangeHeader != null) {
                val res = newFixedLengthResponse(Response.Status.RANGE_NOT_SATISFIABLE, MIME_PLAINTEXT, "")
                res.addHeader("Content-Range", "bytes */$size")
                res
            } else {
                val res = newFixedLengthResponse(
                    Response.Status.OK, mime, BufferedInputStream(FileInputStream(file), BUFFER), size
                )
                res.addHeader("Accept-Ranges", "bytes")
                res.addHeader("Content-Disposition", "attachment; filename=\"$filename\"")
                cors(res)
            }
        } catch (e: IOException) {
            Log.e(TAG, "전송 오류: ${e.message}")
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, MIME_PLAINTEXT, "IO error: ${e.message}")
        } catch (e: SecurityException) {
            newFixedLengthResponse(Response.Status.FORBIDDEN, MIME_PLAINTEXT, "Permission denied")
        }
    }

    /**
     * 네트워크 테스트용: 요청한 크기만큼 0 바이트를 스트리밍 (디스크 I/O 없이 순수 전송 속도 측정)
     * PC 키오스크 설정의 [네트워크 테스트]가 사용한다. 최대 64MB.
     */
    private fun speedtest(sizeParam: String?): Response {
        val size = (sizeParam?.toLongOrNull() ?: (8L * 1024 * 1024)).coerceIn(1L, 64L * 1024 * 1024)
        val res = newFixedLengthResponse(Response.Status.OK, "application/octet-stream", ZeroStream(size), size)
        res.addHeader("Cache-Control", "no-store")
        return cors(res)
    }

    /** 지정 길이만큼 0 을 내보내는 스트림 */
    private class ZeroStream(private var remaining: Long) : java.io.InputStream() {
        override fun read(): Int {
            if (remaining <= 0) return -1
            remaining--
            return 0
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (remaining <= 0) return -1
            val n = minOf(len.toLong(), remaining).toInt()
            java.util.Arrays.fill(b, off, off + n, 0.toByte())
            remaining -= n
            return n
        }

        override fun available(): Int = minOf(remaining, Int.MAX_VALUE.toLong()).toInt()
    }

    /** "bytes=a-b" / "bytes=a-" / "bytes=-n" 형식 지원. 잘못된 범위는 null */
    private fun parseRange(header: String?, size: Long): Pair<Long, Long>? {
        val m = header?.let { Regex("""bytes=(\d*)-(\d*)""").find(it) } ?: return null
        val (a, b) = m.destructured
        val start: Long
        val end: Long
        if (a.isEmpty()) {
            val suffix = b.toLongOrNull() ?: return null
            start = (size - suffix).coerceAtLeast(0)
            end = size - 1
        } else {
            start = a.toLong()
            end = (b.toLongOrNull() ?: (size - 1)).coerceAtMost(size - 1)
        }
        return if (start in 0..end) start to end else null
    }

    private fun skipFully(input: FileInputStream, n: Long) {
        var left = n
        while (left > 0) {
            val skipped = input.skip(left)
            if (skipped <= 0) throw IOException("skip 실패")
            left -= skipped
        }
    }

    private fun videoFiles(): List<File> =
        baseDir.listFiles()?.filter { it.isFile && it.name.endsWith(".mp4") }?.sortedBy { it.name } ?: emptyList()

    private fun status(): Response {
        val text = buildString {
            append("FileServer OK\nPort: $port\nBase: ${baseDir.absolutePath}\n")
            videoFiles().forEach { append("${it.name}  ${it.length()} bytes\n") }
        }
        return newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, text)
    }

    private fun list(): Response {
        val files = JSONArray()
        videoFiles().forEach {
            files.put(JSONObject().apply {
                put("name", it.name)
                put("size", it.length())
                put("url", "/video/${it.name}")
            })
        }
        val json = JSONObject().apply {
            put("status", "ok")
            put("basePath", baseDir.absolutePath)
            put("directoryExists", baseDir.exists())
            put("files", files)
            put("timestamp", System.currentTimeMillis())
        }
        return newFixedLengthResponse(Response.Status.OK, "application/json", json.toString())
    }

    private fun diagnostics(): String = buildString {
        append("Path: ${baseDir.absolutePath}\n")
        append("Exists: ${baseDir.exists()}  Readable: ${baseDir.canRead()}  Writable: ${baseDir.canWrite()}\n")
        append("Storage: ${Environment.getExternalStorageState()}\n")
        append("Files: ${videoFiles().size}\n")
    }

    private fun cors(res: Response): Response {
        res.addHeader("Access-Control-Allow-Origin", "*")
        res.addHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
        res.addHeader("Access-Control-Allow-Headers", "Content-Type, Range")
        res.addHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
        return res
    }

    private fun mimeOf(name: String) = when {
        name.endsWith(".mp4") -> "video/mp4"
        name.endsWith(".png") -> "image/png"
        name.endsWith(".jpg") || name.endsWith(".jpeg") -> "image/jpeg"
        else -> MIME_PLAINTEXT
    }

    fun startServer() {
        try {
            start(SOCKET_READ_TIMEOUT, false)
            Log.d(TAG, "File server started on :$port (${baseDir.absolutePath})")
        } catch (ioe: IOException) {
            Log.e(TAG, "Couldn't start file server: ${ioe.message}")
        }
    }

    fun stopServer() {
        stop()
        Log.d(TAG, "File server stopped")
    }

    companion object {
        private const val BUFFER = 256 * 1024
    }
}
