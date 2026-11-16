import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 相对路径打包，使 dist 可直接通过 file:// 在树莓派 kiosk 模式打开
  base: './',
  server: {
    host: true,
    port: 5173,
  },
});
