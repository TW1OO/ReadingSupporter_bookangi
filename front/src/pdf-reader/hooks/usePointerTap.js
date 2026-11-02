import { useRef } from 'react';

const TAP_SLOP_PX = 10; // 손가락이 이보다 움직였으면 탭이 아니라 스크롤이다

// 마우스 클릭·드래그와 손가락 탭을 같은 방식으로 받는다.
// iOS 는 글자 위를 탭해도 mouseup 을 보내지 않을 수 있어 포인터 이벤트를 쓴다.
export function usePointerTap(onEnd) {
  const start = useRef(null);
  return {
    onPointerDown: (e) => { start.current = { x: e.clientX, y: e.clientY }; },
    onPointerUp: (e) => {
      const s = start.current;
      start.current = null;
      if (e.pointerType !== 'mouse' && s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > TAP_SLOP_PX) return;
      onEnd({ x: e.clientX, y: e.clientY });
    },
    // 길게 눌러 글자를 고르면 포인터가 취소된다. 위치 없이 선택만 확인한다.
    onPointerCancel: () => { start.current = null; onEnd(); },
  };
}
