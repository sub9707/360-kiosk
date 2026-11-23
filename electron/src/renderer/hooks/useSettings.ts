import { useCallback, useEffect, useState } from 'react';
import type { Settings, SettingsPatch } from '../../shared/types';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    window.kiosk.settings.get().then(setSettings);
  }, []);

  const update = useCallback(async (patch: SettingsPatch) => {
    const next = await window.kiosk.settings.update(patch);
    setSettings(next);
    return next;
  }, []);

  return { settings, update, setSettings };
}
