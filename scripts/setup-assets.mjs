// Copies MediaPipe WASM into the renderer's public dir and downloads the hand model once.
// Everything ends up bundled inside the app, so the packaged app never touches the network.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dest = join('src', 'renderer', 'public', 'mediapipe')
mkdirSync(dest, { recursive: true })

// ponytail: SIMD ES-module build only: the tracker runs in a module worker and Electron's Chromium always has SIMD.
const wasm = join('node_modules', '@mediapipe', 'tasks-vision', 'wasm')
for (const f of ['vision_wasm_module_internal.js', 'vision_wasm_module_internal.wasm']) {
  if (existsSync(join(wasm, f))) copyFileSync(join(wasm, f), join(dest, f))
}

const model = join(dest, 'hand_landmarker.task')
if (!existsSync(model)) {
  const url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
  console.log('Downloading hand model…')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Model download failed: ${res.status}`)
  writeFileSync(model, Buffer.from(await res.arrayBuffer()))
}
