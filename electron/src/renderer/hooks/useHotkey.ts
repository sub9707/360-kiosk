import { useEffect } from 'react';

/**
 * 물리 버튼(PageUp) → 화면의 주 버튼([data-hotkey="primary"]) 클릭.
 * 각 화면이 ref 를 넘길 필요 없이, 현재 보이는 주 버튼에 표시만 하면 된다.
 */
export function useHotkey(code = 'PageUp') {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== code || e.repeat) return;
      const target = document.querySelector<HTMLElement>('[data-hotkey="primary"]:not([disabled])');
      if (target) {
        e.preventDefault();
        target.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [code]);
}
