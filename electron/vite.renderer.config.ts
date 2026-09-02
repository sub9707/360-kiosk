import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    // 5173은 Windows 예약 포트 범위(5083-5282)에 걸려 EACCES가 발생하므로 고정 변경
    port: 5400,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/renderer/components'),
      '@/hooks': path.resolve(__dirname, './src/renderer/hooks'),
      '@/types': path.resolve(__dirname, './src/renderer/types'),
      '@/assets': path.resolve(__dirname, './src/renderer/assets'),
    }
  },
});