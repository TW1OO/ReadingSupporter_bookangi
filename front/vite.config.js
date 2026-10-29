import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // 카메라는 localhost 또는 HTTPS에서만 동작합니다.
    // 사전 API 키는 서버에만 둡니다. 프론트는 /api 로만 호출합니다.
    proxy: {
      '/api/pdf-proxy': { target: 'http://127.0.0.1:8001', changeOrigin: true },
    },
  },
});
