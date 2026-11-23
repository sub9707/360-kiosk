import { useEffect, useState } from 'react';
import type { BrandAssetInfo } from '../../shared/types';

// 설정에서 바꾸면 홈 로고 등 모든 구독자가 즉시 갱신되도록 모듈 단위로 공유
let cache: BrandAssetInfo[] | null = null;
const listeners = new Set<(v: BrandAssetInfo[]) => void>();

export async function refreshBranding() {
  cache = await window.kiosk.branding.list();
  listeners.forEach((l) => l(cache!));
  return cache;
}

export function useBranding() {
  const [list, setList] = useState(cache);
  useEffect(() => {
    listeners.add(setList);
    if (!cache) refreshBranding();
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return list;
}
