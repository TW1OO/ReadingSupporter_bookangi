import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { InputEvent } from '@/shared/events'
import { fingersUp, type FingerName } from './fingers'
import { PostureGuard, type GuideLevel } from './posture'
import {
  HOLD_MS,
  HoldStabilizer,
  SMOOTH,
  VOTE_N,
  majority,
  nearestWord,
  toGesture,
  toViewport,
  type WordRect,
} from './gestures'

export interface HandGuide {
  level: GuideLevel
  msg: string
}

export interface HandPointer {
  x: number
  y: number
  wordId: string | null
  progress: number // 0~1, 같은 단어를 가리키며 유지한 정도
}

// 프레임마다 전달하는 인식 결과 (화면 출력/디버그용)
export interface HandFrame {
  count: number // 다수결로 정한 펴진 손가락 개수
  up: Record<FingerName, boolean>
  blocked: boolean
  score: number // MediaPipe 손 인식 확신도
}

export interface HandOptions {
  video: HTMLVideoElement
  // 현재 phase. 포인팅은 idle 일 때만, 메뉴 선택·취소는 idle 이 아닐 때만 방출한다.
  getPhase: () => 'idle' | 'menu' | 'result'
  // 포인터가 스냅할 단어 사각형들 (뷰포트 좌표)
  getWordRects: () => WordRect[]
  onPointer?: (p: HandPointer | null) => void
  onGuide?: (g: HandGuide) => void
  onFrame?: (f: HandFrame | null) => void // 손이 안 보이면 null
  onError?: (e: Error) => void
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
const WASM_DIR = `${BASE}/mediapipe/wasm`
const MODEL_PATH = `${BASE}/mediapipe/hand_landmarker.task`

// 2단계: 웹캠 → MediaPipe(브라우저) → InputEvent. gaze 모듈을 import 하지 않는다.
//  - 검지만 펴고 같은 단어 위에서 유지 → WORD_POINTED (idle 에서만)
//  - 메뉴·결과 상태에서 1/2/3 유지 → MENU_SELECTED (결과에서는 탭 전환)
//  - 주먹 유지 → CANCEL (idle 이 아닐 때)
// 반환값을 호출하면 카메라와 모델을 정리한다.
export function startHandInput(emit: (ev: InputEvent) => void, opts: HandOptions): () => void {
  let stopped = false
  let raf = 0
  let stream: MediaStream | null = null
  let hands: HandLandmarker | null = null

  const run = async () => {
    const vision = await FilesetResolver.forVisionTasks(WASM_DIR)
    const make = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      })
    let landmarker: HandLandmarker
    try {
      landmarker = await make('GPU')
    } catch {
      landmarker = await make('CPU')
    }
    hands = landmarker
    if (stopped) return

    const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } })
    stream = s
    if (stopped) return
    const { video } = opts
    video.srcObject = s
    await video.play()

    let prevUp: Partial<Record<FingerName, boolean>> = {}
    const votes: number[] = []
    const guard = new PostureGuard()
    const stab = new HoldStabilizer()
    let lastGuideKey: string | null = null
    let px: number | null = null
    let py: number | null = null
    let lastT = -1

    // 포인팅 확정용: 같은 단어를 가리킨 시간
    let pointWord: string | null = null
    let pointSince = 0
    let pointFired = false

    const clearHand = () => {
      prevUp = {}
      votes.length = 0
      px = py = null
      pointWord = null
      pointFired = false
      stab.reset()
      guard.reset()
      if (lastGuideKey !== null) {
        lastGuideKey = null
        opts.onGuide?.({ level: 'ok', msg: '' })
      }
      opts.onPointer?.(null)
      opts.onFrame?.(null)
    }

    const loop = () => {
      if (stopped) return
      const now = performance.now()
      if (video.currentTime !== lastT) {
        lastT = video.currentTime
        const res = landmarker.detectForVideo(video, now)
        if (!res.landmarks.length) {
          clearHand()
        } else {
          const lm = res.landmarks[0]
          const aspect = video.videoWidth / video.videoHeight
          const f = fingersUp(res.worldLandmarks[0], lm, prevUp, aspect)
          prevUp = f.up
          votes.push(f.count)
          if (votes.length > VOTE_N) votes.shift()
          const count = majority(votes)

          // 자세 점검: 인식을 믿기 어려운 상태면 확정을 막고 안내
          const hd = res.handedness?.[0]?.[0]
          const g = guard.update(lm, f, hd ? hd.score : 1, aspect, now)
          if (g.key !== lastGuideKey) {
            lastGuideKey = g.key
            opts.onGuide?.({ level: g.level, msg: g.msg })
          }

          opts.onFrame?.({ count, up: f.up, blocked: g.blocked, score: g.score })

          const phase = opts.getPhase()
          const gesture = toGesture(count)

          // 포인터: 검지만 폈을 때
          if (count === 1 && f.up.index) {
            const t = toViewport(lm[8].x, lm[8].y, innerWidth, innerHeight)
            px = px === null ? t.x : px + (t.x - px) * SMOOTH
            py = py === null ? t.y : py + (t.y - py) * SMOOTH
            const wordId = nearestWord(opts.getWordRects(), px, py)
            if (wordId !== pointWord) {
              pointWord = wordId
              pointSince = now
              pointFired = false
            }
            let progress = 0
            if (phase === 'idle' && wordId && !g.blocked) {
              progress = Math.min(1, (now - pointSince) / HOLD_MS)
              if (progress >= 1 && !pointFired) {
                pointFired = true
                emit({ type: 'WORD_POINTED', wordId, source: 'hand' })
              }
            }
            opts.onPointer?.({ x: px, y: py, wordId, progress })
          } else {
            pointWord = null
            pointFired = false
            opts.onPointer?.(null)
          }

          // 메뉴 선택 / 취소. 한 번 확정되면 손 모양이 바뀌어야 다시 확정된다.
          const done = stab.update(count, now, g.blocked)
          if (done !== null) {
            if (gesture.kind === 'fist' && phase !== 'idle') emit({ type: 'CANCEL' })
            else if (gesture.kind === 'menu' && phase !== 'idle')
              emit({ type: 'MENU_SELECTED', choice: gesture.choice })
          }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
  }

  run().catch((e) => {
    if (!stopped) opts.onError?.(e instanceof Error ? e : new Error(String(e)))
  })

  return () => {
    stopped = true
    cancelAnimationFrame(raf)
    stream?.getTracks().forEach((t) => t.stop())
    opts.video.srcObject = null
    hands?.close()
    opts.onPointer?.(null)
    opts.onFrame?.(null)
  }
}
