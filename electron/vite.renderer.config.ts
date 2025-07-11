import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
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