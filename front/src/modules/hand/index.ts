import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { WIDE_VIDEO } from '@/shared/camera'
import type { InputEvent, TargetWord } from '@/shared/events'
import { fingersUp, thumbOpen, type FingerName } from './fingers'
import { PostureGuard, type GuideLevel } from './posture'
import { CalibrationGestureTracker, GestureTracker, OK_PINCH, VOTE_N, classifyShape, majority, tiltDeg, type CalibrationGesture, type Intent, type Phase, type Shape } from './gestures'

export interface HandGuide {
  level: GuideLevel
  msg: string
}

// 프레임마다 전달하는 인식 결과 (화면 출력/디버그용)
export interface HandFrame {
  count: number // 펴진 손가락 개수
  shape: Shape // 다수결로 정한 손 모양
  thumbDeg: number // 엄지 기울기. 양수면 오른쪽
  center: { x: number; y: number } // 손바닥 중심 (거울 화면 기준, 0~1)
  up: Record<FingerName, boolean>
  blocked: boolean
  score: number // MediaPipe 손 인식 확신도
  fps: number // 초당 처리한 프레임 수 (느릴 때 원인 확인용)
  ms: number // 한 프레임 인식에 걸린 시간
  delegate: 'GPU' | 'CPU' // CPU 로 돌면 크게 느려진다
}

export interface HandOptions {
  video: HTMLVideoElement
  getPhase: () => Phase
  // 엄지를 들었을 때 지정할 단어 목록과 후보 위치. 없으면 null (손 모듈은 시선을 모른다)
  getTarget?: () => { words: TargetWord[]; index: number } | null
  // 읽는 중 손바닥을 유지했을 때. 쪽 넘기기 여부는 앱이 시선을 보고 정한다
  onPalmHeld?: () => void
  // 시선 보정 중인가. 이때는 읽기 제스처를 내지 않고 보정 제스처만 알린다
  isCalibrating?: () => boolean
  onCalibrationGesture?: (g: CalibrationGesture) => void
  onGuide?: (g: HandGuide) => void
  onFrame?: (f: HandFrame | null) => void // 손이 안 보이면 null
  onError?: (e: Error) => void
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
const WASM_DIR = `${BASE}/mediapipe/wasm`
const MODEL_PATH = `${BASE}/mediapipe/hand_landmarker.task`
const HAND_INPUT_WIDTH = 640

// 웹캠 → MediaPipe(브라우저) → InputEvent. gaze 모듈을 import 하지 않는다. 동작은 docs/INTERACTION.md.
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
    let delegate: 'GPU' | 'CPU' = 'GPU'
    try {
      landmarker = await make('GPU')
    } catch {
      delegate = 'CPU'
      landmarker = await make('CPU')
    }
    hands = landmarker
    if (stopped) return

    const s = await navigator.mediaDevices.getUserMedia({ video: WIDE_VIDEO })
    stream = s
    if (stopped) return
    const { video } = opts
    video.srcObject = s
    await video.play()

    let prevUp: Partial<Record<FingerName, boolean>> = {}
    const votes: Shape[] = []
    let wasThumbOpen = false
    const guard = new PostureGuard()
    const tracker = new GestureTracker()
    const calibration = new CalibrationGestureTracker()
    let lastGuideKey: string | null = null
    let lastT = -1

    // 카메라는 시선과 같은 1280×720 으로 받되, 손 인식에는 줄여서 넣는다. 손 모델 입력은 어차피 작아서
    // 정확도는 그대로이고 프레임마다 옮기는 영상이 줄어든다(시선 모델과 같이 돌 때 특히).
    const frame = document.createElement('canvas')
    frame.width = HAND_INPUT_WIDTH
    frame.height = Math.round(HAND_INPUT_WIDTH / ((video.videoWidth / video.videoHeight) || 16 / 9))
    const frameCtx = frame.getContext('2d')
    let fps = 0
    let ms = 0
    let lastFrameAt = 0

    const clearHand = () => {
      prevUp = {}
      votes.length = 0
      wasThumbOpen = false
      tracker.reset()
      guard.reset()
      if (lastGuideKey !== null) {
        lastGuideKey = null
        opts.onGuide?.({ level: 'ok', msg: '' })
      }
      opts.onFrame?.(null)
    }

    const act = (i: Intent) => {
      if (i.kind === 'lock') {
        const t = opts.getTarget?.()
        if (t) emit({ type: 'TARGET_LOCKED', ...t, source: 'thumb' })
      } else if (i.kind === 'palm') opts.onPalmHeld?.()
      else if (i.kind === 'move') emit({ type: 'TARGET_MOVED', direction: i.direction })
      else if (i.kind === 'back') emit({ type: 'TARGET_BACK' })
      else if (i.kind === 'confirm') emit({ type: 'TARGET_CONFIRMED' })
      else if (i.kind === 'menu') emit({ type: 'MENU_SELECTED', choice: i.choice })
      else if (i.kind === 'close') emit({ type: 'CLOSE' })
      else emit({ type: 'CANCEL' })
    }

    const loop = () => {
      if (stopped) return
      const now = performance.now()
      if (video.currentTime !== lastT) {
        lastT = video.currentTime
        const t0 = performance.now()
        let res
        if (frameCtx) {
          frameCtx.drawImage(video, 0, 0, frame.width, frame.height)
          res = landmarker.detectForVideo(frame, now)
        } else {
          res = landmarker.detectForVideo(video, now)
        }
        // 최근 값 쪽으로 천천히 따라가는 평균
        ms += (performance.now() - t0 - ms) * 0.1
        if (lastFrameAt) fps += (1000 / (now - lastFrameAt) - fps) * 0.1
        lastFrameAt = now
        const calibrating = opts.isCalibrating?.() ?? false
        const calibrationInput = (shape: Shape) => {
          const g = calibration.update(shape, now)
          if (g) opts.onCalibrationGesture?.(g)
        }
        if (!res.landmarks.length) {
          clearHand()
          if (calibrating) calibrationInput('none')
        } else {
          const lm = res.landmarks[0]
          const aspect = video.videoWidth / video.videoHeight
          const f = fingersUp(res.worldLandmarks[0], lm, prevUp, aspect)
          prevUp = f.up
          wasThumbOpen = thumbOpen(f.m, wasThumbOpen)
          votes.push(classifyShape(f.up, wasThumbOpen, f.m.thumb.pinch < OK_PINCH))
          if (votes.length > VOTE_N) votes.shift()
          const shape = majority(votes)
          const thumbDeg = tiltDeg(lm[2], lm[4], aspect)

          // 자세 점검: 인식을 믿기 어려운 상태면 확정을 막고 안내
          const hd = res.handedness?.[0]?.[0]
          const g = guard.update(lm, f, hd ? hd.score : 1, aspect, now)
          // 엄지 자세는 손을 옆으로 세우는 게 정상이라 '손바닥을 보여 달라'는 안내를 하지 않는다
          const guideKey = g.level === 'hint' && (shape === 'thumb' || shape === 'confirm') ? null : g.key
          if (guideKey !== lastGuideKey) {
            lastGuideKey = guideKey
            opts.onGuide?.(guideKey === g.key ? { level: g.level, msg: g.msg } : { level: 'ok', msg: '' })
          }

          opts.onFrame?.({ count: f.count, shape, thumbDeg, center: { x: 1 - lm[9].x, y: lm[9].y }, up: f.up, blocked: g.blocked, score: g.score, fps: Math.round(fps), ms: Math.round(ms), delegate })

          if (calibrating) {
            // 보정 중에는 접고 펴는 것이 정상 동작이라 흔들림 차단을 적용하지 않는다
            calibrationInput(g.outOfRange ? 'none' : shape)
          } else {
            const intent = tracker.update(
              { shape, thumbDeg, palmDeg: tiltDeg(lm[0], lm[9], aspect) },
              opts.getPhase(),
              now,
              g.blocked,
              // 엄지를 기울이는 동안 엄지 판정이 흔들려 손가락 개수가 바뀌는 것은 정상이라 흔들림 차단을 빼고 본다
              g.outOfRange,
            )
            if (intent) act(intent)
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
    opts.onFrame?.(null)
  }
}
