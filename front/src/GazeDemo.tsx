import { useState } from "react";
import {
	useGaze,
	CalibrationOverlay,
	GazeDebugOverlay,
	type CalibrationReport,
} from "./modules/gaze";

// 스무딩 실험: ?gaze&smooth=0.3,0.0005  (minCutoff,beta). 낮을수록 안정적이고 느리다.
const smoothParam = new URLSearchParams(window.location.search).get("smooth");
const [mc, bt] = (smoothParam ?? "").split(",").map(Number);
const SMOOTHING =
	Number.isFinite(mc) && Number.isFinite(bt) && smoothParam
		? { minCutoff: mc, beta: bt, dCutoff: 1.0 }
		: undefined;
const SESSION_ID = Math.random().toString(36).slice(2, 10);

function postMetrics({ mode, before: r, after }: CalibrationReport) {
	if (!r.sampleCount) return;
	fetch("/api/gaze/metrics", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			session_id: SESSION_ID,
			mean_error_px: r.meanErrorPx,
			accuracy_px: r.accuracyPx,
			p90_error_px: r.p90ErrorPx,
			bias_dx: r.bias.dx,
			bias_dy: r.bias.dy,
			sample_count: r.sampleCount,
			grade: r.grade,
			viewport_w: window.innerWidth,
			viewport_h: window.innerHeight,
			...(r.postureDrift && {
				pose_drift_pos: r.postureDrift.pos,
				pose_drift_size: r.postureDrift.size,
				pose_drift_angle: r.postureDrift.angle,
			}),
			finish_mode: mode,
			...(after.sampleCount > 0 && {
				after_accuracy_px: after.accuracyPx,
				after_mean_error_px: after.meanErrorPx,
				after_p90_error_px: after.p90ErrorPx,
				after_bias_dx: after.bias.dx,
				after_bias_dy: after.bias.dy,
			}),
		}),
	}).catch((e) => console.warn("메트릭 전송 실패", e));
}

const TEXT = [
	"그는 좌고우면하느라 결정을 내리지 못했다. 주변의 시선이 부담스러웠기 때문이다.",
	"책을 읽다 보면 모르는 단어를 만나 흐름이 끊기곤 한다. 그럴 때마다 앱을 바꾸는 일은 번거롭다.",
	"시선은 문단과 줄까지만 추정하고, 단어는 손으로 가리켜 고르는 것이 이 서비스의 약속이다.",
];

export default function GazeDemo() {
	const { controller, status, error, start } = useGaze(SMOOTHING && { smoothing: SMOOTHING });
	const [cal, setCal] = useState(false);

	return (
		<div
			style={{
				maxWidth: 640,
				margin: "0 auto",
				padding: "80px 24px",
				fontSize: 20,
				lineHeight: 2,
			}}
		>
			<button
				onClick={async () => {
					await start();
					setCal(true);
				}}
				disabled={status === "loading"}
			>
				시선 켜기 ({status}
				{error ? `: ${error}` : ""})
			</button>
			{TEXT.map((t, i) => (
				<p key={i} data-gaze-paragraph={`p-${i}`}>
					{t}
				</p>
			))}
			{cal && (
				<CalibrationOverlay
					controller={controller}
					onCancel={() => setCal(false)}
					onDone={(r) => {
						console.log("보정 결과", r);
						postMetrics(r);
						setCal(false);
					}}
				/>
			)}
			<GazeDebugOverlay controller={controller} />
		</div>
	);
}
