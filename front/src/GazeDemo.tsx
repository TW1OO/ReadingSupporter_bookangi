import { useState } from "react";
import { useGaze, CalibrationOverlay, GazeDebugOverlay } from "./modules/gaze";

const TEXT = [
	"그는 좌고우면하느라 결정을 내리지 못했다. 주변의 시선이 부담스러웠기 때문이다.",
	"책을 읽다 보면 모르는 단어를 만나 흐름이 끊기곤 한다. 그럴 때마다 앱을 바꾸는 일은 번거롭다.",
	"시선은 문단과 줄까지만 추정하고, 단어는 손으로 가리켜 고르는 것이 이 서비스의 약속이다.",
];

export default function GazeDemo() {
	const { controller, status, error, start } = useGaze();
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
						setCal(false);
					}}
				/>
			)}
			<GazeDebugOverlay controller={controller} />
		</div>
	);
}
