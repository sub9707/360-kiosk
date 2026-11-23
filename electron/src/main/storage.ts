// Cloudflare R2 (S3 호환) 업로드
//
// - S3Client 를 재사용하고 keep-alive 로 TLS 연결을 유지한다.
// - 촬영이 시작되면 warmup() 으로 미리 연결을 열어 두어 업로드 시작 지연을 없앤다.
// - 5MB 단위 멀티파트를 4개 병렬로 전송한다.
// - 객체 키에 추측 불가능한 랜덤 토큰을 넣는다. (공개 버킷에서 타임스탬프만으로
//   다른 참여자 영상을 유추해 열람하는 것을 방지)
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import type { Settings } from '../shared/types';
import { config, isStorageConfigured } from './config';

let client: S3Client | null = null;
let clientKey = '';

function getClient(s: Settings): S3Client {
  const r = s.r2;
  const key = `${r.accountId}|${r.accessKeyId}|${r.secretAccessKey}`;
  if (client && key === clientKey) return client;
  client?.destroy();
  const agent = new https.Agent({ keepAlive: true, maxSockets: 16 });
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${r.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r.accessKeyId, secretAccessKey: r.secretAccessKey },
    requestHandler: { httpsAgent: agent, connectionTimeout: 5000, requestTimeout: 120000 } as any,
    maxAttempts: 3,
  });
  clientKey = key;
  return client;
}

function requireConfigured(): Settings {
  const s = config().get();
  if (!isStorageConfigured(s)) {
    throw new Error('R2 저장소 설정이 완료되지 않았습니다. 설정에서 R2 정보를 입력하세요.');
  }
  return s;
}

/** 업로드 전에 TLS 연결을 미리 맺어 둔다 (실패해도 무시) */
export function warmup(): void {
  const s = config().get();
  if (!isStorageConfigured(s)) return;
  getClient(s)
    .send(new HeadBucketCommand({ Bucket: s.r2.bucket }))
    .catch(() => undefined);
}

export async function testConnection(signal?: AbortSignal): Promise<number> {
  const s = requireConfigured();
  const t0 = Date.now();
  await getClient(s).send(new HeadBucketCommand({ Bucket: s.r2.bucket }), { abortSignal: signal });
  return Date.now() - t0;
}

/** 예: 20261123/a8Kd93_xQ2pLm7Rz.mp4 */
export function makeObjectKey(folder: string): string {
  const s = config().get();
  const token = crypto.randomBytes(12).toString('base64url');
  const prefix = s.r2.keyPrefix ? s.r2.keyPrefix.replace(/\/?$/, '/') : '';
  return `${prefix}${folder}/${token}.mp4`;
}

export async function shareUrlFor(key: string): Promise<string> {
  const s = requireConfigured();
  if (s.r2.linkMode === 'public') {
    return `${s.r2.publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  // presigned 최대 유효기간 7일
  return getSignedUrl(getClient(s), new GetObjectCommand({ Bucket: s.r2.bucket, Key: key }), {
    expiresIn: 7 * 24 * 3600,
  });
}

export async function uploadFile(
  file: string,
  key: string,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const s = requireConfigured();
  const size = (await fs.promises.stat(file)).size;
  const upload = new Upload({
    client: getClient(s),
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
    leavePartsOnError: false,
    params: {
      Bucket: s.r2.bucket,
      Key: key,
      Body: fs.createReadStream(file, { highWaterMark: 1024 * 1024 }),
      ContentType: 'video/mp4',
      ContentLength: size,
      CacheControl: 'public, max-age=31536000, immutable',
    },
  });
  upload.on('httpUploadProgress', (p) => {
    if (p.loaded != null) onProgress?.(Math.min(1, p.loaded / size));
  });
  const onAbort = () => upload.abort().catch(() => undefined);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    await upload.done();
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  onProgress?.(1);
}

/** 네트워크 테스트: 압축되지 않는 임의 데이터를 실제 업로드 방식으로 올리고 바로 삭제 */
export async function measureUpload(bytes: number, signal?: AbortSignal): Promise<{ ms: number; bytes: number }> {
  const s = requireConfigured();
  const prefix = s.r2.keyPrefix ? s.r2.keyPrefix.replace(/\/?$/, '/') : '';
  const key = `${prefix}_nettest/${crypto.randomBytes(8).toString('hex')}.bin`;
  const body = crypto.randomBytes(bytes);
  const t0 = Date.now();
  const upload = new Upload({
    client: getClient(s),
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
    leavePartsOnError: false,
    params: { Bucket: s.r2.bucket, Key: key, Body: body, ContentType: 'application/octet-stream' },
  });
  const onAbort = () => upload.abort().catch(() => undefined);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    await upload.done();
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  const ms = Date.now() - t0;
  await deleteObject(key).catch(() => undefined);
  return { ms, bytes };
}

export async function deleteObject(key: string): Promise<void> {
  const s = requireConfigured();
  await getClient(s).send(new DeleteObjectCommand({ Bucket: s.r2.bucket, Key: key }));
}
