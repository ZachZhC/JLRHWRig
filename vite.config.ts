import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 相对路径打包，使 dist 可直接通过 file:// 在树莓派 kiosk 模式打开
  base: './',
  server: {
    host: true,
    port: 5173,
    // 把 /api 转发到本机 BMCLI Web（CWCM 页的 LIN 链路走这里）
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
  preview: {
    host: true,
    port: 4173,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
    },
  },
});
