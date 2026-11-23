import { useEffect, useState } from 'react';
import logo from '../assets/images/logo.png';
import s from './Brand.module.scss';

export function Logo() {
  return <img src={logo} alt="HOWDOYOUDO" className={s.logo} draggable={false} />;
}

export function Copyright() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    window.kiosk.settings.get().then((cfg) => setShow(cfg.showCopyright));
  }, []);
  if (!show) return null;
  return <small className={s.copyright}>© {new Date().getFullYear()} HOWDOYOUDO. All rights reserved.</small>;
}
