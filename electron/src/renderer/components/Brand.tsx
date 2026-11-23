import { useEffect, useState } from 'react';
import defaultLogo from '../assets/images/logo.png';
import { useBranding } from '../hooks/useBranding';
import s from './Brand.module.scss';

export function Logo() {
  const logo = useBranding()?.find((a) => a.kind === 'logo');
  // 사용자 로고가 없으면 번들된 기본 로고 (불러오는 동안에도 기본 로고 표시)
  const src = logo?.custom && logo.url ? logo.url : defaultLogo;
  return <img src={src} alt="HOWDOYOUDO" className={s.logo} draggable={false} />;
}

export function Copyright() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    window.kiosk.settings.get().then((cfg) => setShow(cfg.showCopyright));
  }, []);
  if (!show) return null;
  return <small className={s.copyright}>© {new Date().getFullYear()} HOWDOYOUDO. All rights reserved.</small>;
}
