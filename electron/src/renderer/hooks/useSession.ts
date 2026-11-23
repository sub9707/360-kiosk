import { useEffect, useState } from 'react';
import type { SessionState } from '../../shared/types';

const kiosk = window.kiosk;

let cache: SessionState | null = null;

/** main 프로세스의 세션 상태를 구독한다 (상태의 단일 원천은 main) */
export function useSession(): SessionState | null {
  const [state, setState] = useState<SessionState | null>(cache);

  useEffect(() => {
    let alive = true;
    const off = kiosk.session.onState((s) => {
      cache = s;
      setState(s);
    });
    kiosk.session.get().then((s) => {
      if (!alive) return;
      cache = s;
      setState(s);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  return state;
}

export const sessionActions = kiosk.session;
