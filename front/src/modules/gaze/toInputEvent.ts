import type { InputEvent } from '@/shared/events';
import type { GazeInputEvent } from './types';

/**
 * 시선 이벤트 → state reducer가 받는 InputEvent.
 * 시선은 문단 단위 보조 입력이므로 gaze.region만 GAZE_PARAGRAPH로 넘긴다.
 * (단어 확정은 손 포인팅 + 스냅이 담당)
 */
export function toInputEvent(e: GazeInputEvent): InputEvent | null {
  if (e.type === 'gaze.region') {
    return { type: 'GAZE_PARAGRAPH', paragraphId: e.region?.paragraphId ?? null };
  }
  return null;
}
