import { createRoot } from "react-dom/client";
import { App } from "./App";
import GazeDemo from "./GazeDemo";

// 시선 단독 테스트: http://localhost:5173/?gaze
const showGazeDemo = new URLSearchParams(window.location.search).has("gaze");

createRoot(document.getElementById("root")!).render(
	showGazeDemo ? <GazeDemo /> : <App />,
);
