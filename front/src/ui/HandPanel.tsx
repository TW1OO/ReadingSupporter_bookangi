import type { RefObject } from 'react'
import type { HandFrame, HandGuide, HandPointer } from '@/modules/hand'

const FINGERS = [
  ['thumb', '엄지'],
  ['index', '검지'],
  ['middle', '중지'],
  ['ring', '약지'],
  ['pinky', '새끼'],
] as const

// 웹캠 미리보기 + 자세 안내 + 포인터 점. 모듈 로직은 넣지 않는다.
export function HandPanel(props: {
  videoRef: RefObject<HTMLVideoElement>
  enabled: boolean
  onToggle: () => void
  guide: HandGuide | null
  pointer: HandPointer | null
  error: string | null
  frame: HandFrame | null
  events: string[]
}) {
  const { videoRef, enabled, onToggle, guide, pointer, error, frame, events } = props
  return (
    <>
      <aside style={{ position: 'fixed', right: 16, bottom: 16, width: 240, zIndex: 20 }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            width: '100%',
            transform: 'scaleX(-1)',
            borderRadius: 8,
            background: '#000',
            display: enabled ? 'block' : 'none',
          }}
        />
        {guide && guide.level !== 'ok' && (
          <div
            style={{
              marginTop: 6,
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 13,
              background: guide.level === 'block' ? '#e65100' : '#fdd835',
              color: guide.level === 'block' ? '#fff' : '#222',
            }}
          >
            {guide.msg}
          </div>
        )}
        {enabled && (
          <div style={{ marginTop: 6, padding: 8, borderRadius: 6, background: '#111', color: '#eee', fontSize: 12, fontFamily: 'monospace' }}>
            {frame ? (
              <>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {frame.count === 0 ? '주먹' : `${frame.count}개`}
                  {frame.blocked ? ' (대기)' : ''}
                </div>
                <div>
                  {FINGERS.map(([k, label]) => (
                    <span key={k} style={{ color: frame.up[k] ? '#7cfc00' : '#666', marginRight: 6 }}>
                      {frame.up[k] ? '■' : '□'}{label}
                    </span>
                  ))}
                </div>
                <div>확신도 {frame.score.toFixed(2)}</div>
              </>
            ) : (
              <div>손이 안 보임</div>
            )}
            {events.length > 0 && (
              <div style={{ marginTop: 6, color: '#9f9' }}>
                {events.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
          </div>
        )}
        {error && <div style={{ marginTop: 6, color: '#c62828', fontSize: 13 }}>{error}</div>}
        <button onClick={onToggle} style={{ marginTop: 6, width: '100%' }}>
          {enabled ? '손 인식 끄기' : '손 인식 켜기'}
        </button>
      </aside>
      {pointer && (
        <div
          style={{
            position: 'fixed',
            left: pointer.x,
            top: pointer.y,
            width: 22,
            height: 22,
            borderRadius: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 30,
            background: `rgba(255, 77, 77, ${0.35 + 0.65 * pointer.progress})`,
            boxShadow: `0 0 0 ${Math.round(pointer.progress * 8)}px rgba(255, 77, 77, 0.25)`,
          }}
        />
      )}
    </>
  )
}
