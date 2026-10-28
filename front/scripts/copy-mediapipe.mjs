// @mediapipe/tasks-vision 의 wasm 을 public/mediapipe/wasm 으로 복사한다 (용량이 커서 git 에는 올리지 않음).
import { cpSync, mkdirSync } from 'node:fs'

mkdirSync('public/mediapipe', { recursive: true })
cpSync('node_modules/@mediapipe/tasks-vision/wasm', 'public/mediapipe/wasm', { recursive: true })
