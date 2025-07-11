import { useEffect } from 'react';

export const useKeyboard = (
  targetKey: string,
  callback: () => void,
  elementRef?: React.RefObject<HTMLElement>
) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === targetKey) {
        if (elementRef?.current) {
          elementRef.current.click();
        } else {
          callback();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [targetKey, callback, elementRef]);
};