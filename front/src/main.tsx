import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import GazeDemo from "./GazeDemo";

// 기본(/)        : PDF 리더
// 시선 단독 테스트: http://localhost:5173/?gaze
// 기존 샘플 화면  : http://localhost:5173/?legacy
// pdf-reader/styles.css 는 body/button/header 등 전역 스타일이라 정적 import 하면 다른 화면까지 바뀐다.
// 그래서 PDF 리더일 때만 동적으로 불러온다.
const PdfReaderApp = lazy(() => import("./pdf-reader/PdfReaderApp.jsx"));

const params = new URLSearchParams(window.location.search);
const root = createRoot(document.getElementById("root")!);

if (params.has("gaze")) {
	root.render(<GazeDemo />);
} else if (params.has("legacy")) {
	root.render(<App />);
} else {
	root.render(
		<Suspense fallback={null}>
			<PdfReaderApp />
		</Suspense>,
	);
}
