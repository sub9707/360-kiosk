import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import background from '../assets/images/home-background.png';
import { Copyright, Logo } from '../components/Brand';
import LibraryModal from '../components/LibraryModal';
import SettingsModal from '../components/SettingsModal';
import { Button, CameraPill, IconButton } from '../components/ui';
import { sessionActions, useSession } from '../hooks/useSession';
import s from './Home.module.scss';

export default function Home() {
  const navigate = useNavigate();
  const session = useSession();
  const [modal, setModal] = useState<'settings' | 'library' | null>(null);

  const start = () => {
    sessionActions.reset();
    sessionActions.connect();
    navigate('/shoot');
  };

  return (
    <div className={s.page}>
      <img src={background} alt="" className={s.bg} draggable={false} />
      <div className={s.scrim} />

      <header className={s.top}>
        <Logo />
        {session && <CameraPill status={session.camera} />}
      </header>

      <main className={`${s.hero} page-enter`}>
        <h1 className={s.title}>
          나만의 360° 영상을
          <br />
          지금 만들어 보세요
        </h1>
        <p className={s.sub}>원판 위에 올라선 뒤 아래 버튼을 눌러 주세요</p>
        <Button size="xl" onClick={start} primaryHotkey className={s.cta}>
          촬영 시작
        </Button>
      </main>

      <footer className={s.bottom}>
        <Copyright />
        <div className={s.admin}>
          <IconButton icon="folder" label="영상 관리" onClick={() => setModal('library')} />
          <IconButton icon="settings" label="설정" onClick={() => setModal('settings')} />
        </div>
      </footer>

      {modal === 'settings' && <SettingsModal onClose={() => setModal(null)} />}
      {modal === 'library' && <LibraryModal onClose={() => setModal(null)} />}
    </div>
  );
}
