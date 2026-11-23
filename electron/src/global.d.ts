import type { KioskApi } from './shared/types';

declare global {
  interface Window {
    kiosk: KioskApi;
  }
}
