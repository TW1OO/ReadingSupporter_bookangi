import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
	plugins: [react()],
	resolve: { alias: { "@": path.resolve(__dirname, "src") } },
	server: {
		port: 5173,
		// 사전 API 키는 서버에만 둔다. 프론트는 /api 로만 호출.
		// 순서 중요: 더 구체적인 경로를 먼저 둔다. (/api 가 먼저면 pdf-proxy 요청도 FastAPI 로 가서 404)
		proxy: {
			"/api/pdf-proxy": { target: "http://127.0.0.1:8001", changeOrigin: true },
			"/api": "http://localhost:8000",
		},
	},
	test: { environment: "node" },
});
