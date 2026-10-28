import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { InputEvent } from "@/shared/events";
import { initialState, reduce } from "@/modules/state/machine";
import { Reader } from "@/modules/viewer/Reader";
import {
	startHandInput,
	type HandFrame,
	type HandGuide,
	type HandPointer,
} from "@/modules/hand";
import type { WordRect } from "@/modules/hand/gestures";
import { HandPanel } from "@/ui/HandPanel";

function wordRects(): WordRect[] {
	return Array.from(
		document.querySelectorAll<HTMLElement>("[data-word-id]"),
	).map((el) => {
		const r = el.getBoundingClientRect();
		return {
			id: el.dataset.wordId!,
			left: r.left,
			top: r.top,
			right: r.right,
			bottom: r.bottom,
		};
	});
}

export function App() {
	const [state, dispatch] = useReducer(reduce, initialState);
	const phaseRef = useRef(state.phase);
	phaseRef.current = state.phase;

	const videoRef = useRef<HTMLVideoElement>(null);
	const [handOn, setHandOn] = useState(false);
	const [guide, setGuide] = useState<HandGuide | null>(null);
	const [pointer, setPointer] = useState<HandPointer | null>(null);
	const [frame, setFrame] = useState<HandFrame | null>(null);
	const [events, setEvents] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);

	const onPointer = useCallback((p: HandPointer | null) => setPointer(p), []);

	useEffect(() => {
		if (!handOn || !videoRef.current) return;
		setError(null);
		const emit = (ev: InputEvent) => {
			const label =
				ev.type === "MENU_SELECTED"
					? `${ev.type} ${ev.choice}`
					: ev.type === "WORD_POINTED"
						? `${ev.type} ${ev.wordId}`
						: ev.type;
			setEvents((es) =>
				[`${new Date().toLocaleTimeString()} ${label}`, ...es].slice(0, 5),
			);
			dispatch(ev);
		};
		const stop = startHandInput(emit, {
			video: videoRef.current,
			getPhase: () => phaseRef.current,
			getWordRects: wordRects,
			onPointer,
			onGuide: setGuide,
			onFrame: setFrame,
			onError: (e) => {
				setError(`손 인식 시작 실패: ${e.message}`);
				setHandOn(false);
			},
		});
		return () => {
			stop();
			setGuide(null);
		};
	}, [handOn, onPointer]);

	return (
		<>
			<Reader state={state} dispatch={dispatch} hoverWordId={pointer?.wordId} />
			<HandPanel
				videoRef={videoRef}
				enabled={handOn}
				onToggle={() => setHandOn((v) => !v)}
				guide={guide}
				pointer={pointer}
				error={error}
				frame={frame}
				events={events}
			/>
		</>
	);
}
