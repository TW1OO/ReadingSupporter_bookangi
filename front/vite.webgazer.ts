import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/**
 * WebGazer를 Vite 번들(esbuild 사전번들)에 넣지 않고,
 * node_modules/webgazer/dist 의 완성본을 그대로 서빙한다.
 *   /webgazer.js               → dist/webgazer.js  (전역 window.webgazer)
 *   /mediapipe/face_mesh/*     → dist/mediapipe/face_mesh/* (얼굴 모델/wasm)
 * 복사 단계도, .gitignore도 필요 없다. build 때는 dist/에 같이 emit 된다.
 */
const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.binarypb': 'application/octet-stream',
}

export function webgazerAssets(root: string): Plugin {
  const dist = path.resolve(root, 'node_modules/webgazer/dist')
  const meshDir = path.join(dist, 'mediapipe/face_mesh')

  const resolveFile = (url: string): string | null => {
    if (url === '/webgazer.js') return path.join(dist, 'webgazer.js')
    const prefix = '/mediapipe/face_mesh/'
    if (url.startsWith(prefix)) {
      const name = path.basename(decodeURIComponent(url.slice(prefix.length))) // 경로 탈출 방지
      return path.join(meshDir, name)
    }
    return null
  }

  return {
    name: 'webgazer-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        const file = resolveFile(url)
        if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next()
        res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-cache')
        fs.createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      const emit = (fileName: string, file: string) =>
        this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(file) })
      if (fs.existsSync(path.join(dist, 'webgazer.js'))) emit('webgazer.js', path.join(dist, 'webgazer.js'))
      if (fs.existsSync(meshDir)) {
        for (const f of fs.readdirSync(meshDir)) {
          const p = path.join(meshDir, f)
          if (fs.statSync(p).isFile()) emit(`mediapipe/face_mesh/${f}`, p)
        }
      }
    },
  }
}
