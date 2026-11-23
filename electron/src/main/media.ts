// kiosk-media:// 프로토콜
//
// 기존에는 영상 파일 전체를 읽어 Array.from(buffer) 로 IPC 전송했다.
// (40MB 영상 → 4천만 개 숫자 배열 직렬화, 수 초 지연 + 수백 MB 메모리)
// 이제는 <video src="kiosk-media://..."> 가 Range 요청으로 필요한 만큼만 스트리밍한다.
import { protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { config } from './config';
import { ensureThumbnail } from './video';

const SCHEME = 'kiosk-media';

export function registerMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true },
    },
  ]);
}

export function mediaUrl(file: string, kind: 'file' | 'thumb' = 'file'): string {
  const stat = fs.existsSync(file) ? fs.statSync(file) : null;
  const v = stat ? `?v=${Math.round(stat.mtimeMs)}` : '';
  return `${SCHEME}://${kind}/${encodeURIComponent(file)}${v}`;
}

function isInside(file: string, dir: string) {
  const rel = path.relative(path.resolve(dir), path.resolve(file));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

const MIME: Record<string, string> = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png' };

async function serveFile(file: string, req: Request): Promise<Response> {
  const stat = await fs.promises.stat(file).catch(() => null);
  if (!stat?.isFile()) return new Response('not found', { status: 404 });
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const range = req.headers.get('range')?.match(/bytes=(\d*)-(\d*)/);

  if (range) {
    const start = range[1] ? parseInt(range[1], 10) : 0;
    const end = range[2] ? Math.min(parseInt(range[2], 10), stat.size - 1) : stat.size - 1;
    if (start >= stat.size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    }
    const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
      },
    });
  }
  const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(body, {
    headers: { 'Content-Type': type, 'Content-Length': String(stat.size), 'Accept-Ranges': 'bytes' },
  });
}

export function handleMediaProtocol() {
  protocol.handle(SCHEME, async (req) => {
    try {
      const url = new URL(req.url);
      const file = decodeURIComponent(url.pathname.replace(/^\//, ''));
      // 저장 폴더 밖의 파일은 제공하지 않는다
      if (!isInside(file, config().get().saveDir)) return new Response('forbidden', { status: 403 });
      if (url.host === 'thumb') {
        const thumb = await ensureThumbnail(file);
        return serveFile(thumb, req);
      }
      return serveFile(file, req);
    } catch (e) {
      console.error('[media]', e);
      return new Response('error', { status: 500 });
    }
  });
}
