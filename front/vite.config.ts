import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
	plugins: [react()],
	resolve: { alias: { "@": path.resolve(__dirname, "src") } },
	server: {
		port: 5173,
		// 사전 API 키는 서버에만 둔다. 프론트는 /api 로만 호출.
		proxy: { "/api": "http://localhost:8000" },
	},
	test: { environment: "node" },
});
