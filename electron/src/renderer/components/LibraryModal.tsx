import { useEffect, useState } from 'react';
import type { LibraryFolder, LibraryVideo } from '../../shared/types';
import { Icon } from './Icon';
import s from './LibraryModal.module.scss';
import { Button, Modal } from './ui';

const fmtDate = (f: string) => `${f.slice(0, 4)}.${f.slice(4, 6)}.${f.slice(6, 8)}`;
const fmtTime = (name: string) => {
  const m = name.match(/_(\d{2})(\d{2})(\d{2})\.mp4$/);
  return m ? `${m[1]}:${m[2]}:${m[3]}` : name;
};

export default function LibraryModal({ onClose }: { onClose: () => void }) {
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [selected, setSelected] = useState<LibraryVideo | null>(null);

  useEffect(() => {
    window.kiosk.library.folders().then((f) => {
      setFolders(f);
      if (f[0]) setFolder(f[0].name);
    });
  }, []);

  useEffect(() => {
    if (folder) window.kiosk.library.videos(folder).then(setVideos);
  }, [folder]);

  const onDeleted = (v: LibraryVideo) => {
    setVideos((list) => list.filter((x) => x.name !== v.name));
    setFolders((list) => list.map((f) => (f.name === v.folder ? { ...f, count: f.count - 1 } : f)));
    setSelected(null);
  };

  return (
    <Modal title="영상 관리" onClose={onClose} width={980}>
      {folders.length === 0 ? (
        <p className={s.empty}>저장된 영상이 없습니다</p>
      ) : (
        <>
          <div className={s.folders}>
            {folders.map((f) => (
              <button
                key={f.name}
                className={`${s.chip} ${f.name === folder ? s.chipActive : ''}`}
                onClick={() => setFolder(f.name)}
              >
                {fmtDate(f.name)} <em>{f.count}</em>
              </button>
            ))}
          </div>
          <div className={s.grid}>
            {videos.map((v) => (
              <button key={v.name} className={s.card} onClick={() => setSelected(v)}>
                <img src={v.thumbUrl} loading="lazy" alt="" />
                <span className={s.cardMeta}>
                  {fmtTime(v.name)}
                  {v.remoteKey && <Icon name="cloud" size={16} />}
                </span>
              </button>
            ))}
          </div>
          {videos.length === 0 && <p className={s.empty}>이 날짜에 편집된 영상이 없습니다</p>}
        </>
      )}
      {selected && <Viewer video={selected} onClose={() => setSelected(null)} onDeleted={onDeleted} />}
    </Modal>
  );
}

function Viewer({
  video,
  onClose,
  onDeleted,
}: {
  video: LibraryVideo;
  onClose: () => void;
  onDeleted: (v: LibraryVideo) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [alsoRemote, setAlsoRemote] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    const res = await window.kiosk.library.remove(video.folder, video.name, alsoRemote && !!video.remoteKey);
    if (res.ok) onDeleted(video);
    else setError(res.error ?? '삭제 실패');
  };

  return (
    <Modal
      title={`${fmtDate(video.folder)} ${fmtTime(video.name)}`}
      onClose={onClose}
      width={620}
      footer={
        confirm ? (
          <>
            {video.remoteKey && (
              <label className={s.check}>
                <input type="checkbox" checked={alsoRemote} onChange={(e) => setAlsoRemote(e.target.checked)} />
                R2 클라우드에서도 삭제 (QR 링크 무효화)
              </label>
            )}
            <Button size="md" variant="ghost" onClick={() => setConfirm(false)}>
              취소
            </Button>
            <Button size="md" variant="danger" icon="trash" onClick={remove}>
              삭제
            </Button>
          </>
        ) : (
          <Button size="md" variant="danger" icon="trash" onClick={() => setConfirm(true)}>
            영상 삭제
          </Button>
        )
      }
    >
      <video src={video.url} controls autoPlay className={s.player} />
      <p className={s.info}>
        {(video.size / 1024 / 1024).toFixed(1)}MB · {video.remoteKey ? '클라우드 업로드됨' : '로컬에만 저장됨'}
      </p>
      {error && <p className={s.error}>{error}</p>}
    </Modal>
  );
}
