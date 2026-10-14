// Runs hand detection off the main thread so the 120Hz render loop never waits on inference.
// Starts on the GPU, then benchmarks the CPU path too and keeps whichever is faster on this machine
// (on many integrated GPUs MediaPipe's WASM-SIMD CPU path wins because it skips GPU readback).
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

type Backend = 'GPU' | 'CPU'

const SAMPLE = 30 // frames timed per backend during auto-selection
const GOOD_ENOUGH_MS = 12 // GPU at or under this is kept without trying CPU

let base = ''
let lm: HandLandmarker | null = null
let backend: Backend = 'GPU'
let lastTs = 0
let bench: { phase: 'gpu' | 'switching' | 'cpu'; gpu: number; times: number[]; gpuLm?: HandLandmarker } | null = null

async function create(delegate: Backend): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(base, true) // ES-module WASM build: this is a module worker
  // MediaPipe consumes (deletes) globalThis.ModuleFactory after the first load, and a re-import of the
  // cached module doesn't set it again — restore it so a second engine (the CPU benchmark) can start.
  const g = globalThis as { ModuleFactory?: unknown }
  if (lm && !g.ModuleFactory) g.ModuleFactory = (await import(/* @vite-ignore */ fileset.wasmLoaderPath)).default
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: `${base}/hand_landmarker.task`, delegate },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5
  })
}

const median = (a: number[]): number => a.slice().sort((x, y) => x - y)[a.length >> 1]

/** Auto-selection: time GPU, then CPU if GPU is slow, then keep the faster one. */
async function benchStep(ms: number): Promise<void> {
  const b = bench
  if (!b || b.phase === 'switching') return // frames keep flowing while the CPU tracker loads
  b.times.push(ms)
  if (b.times.length < SAMPLE) return
  const m = median(b.times)
  b.times = []
  if (b.phase === 'gpu') {
    b.gpu = m
    if (m <= GOOD_ENOUGH_MS) return void (bench = null)
    b.phase = 'switching'
    try {
      const cpu = await create('CPU')
      b.gpuLm = lm!
      lm = cpu
      backend = 'CPU'
      b.phase = 'cpu'
    } catch (err) {
      postMessage({ type: 'log', message: `CPU tracker failed to start: ${err}` })
      bench = null
    }
    return
  }
  const keepCpu = m < b.gpu
  if (keepCpu) b.gpuLm!.close()
  else {
    lm!.close()
    lm = b.gpuLm!
    backend = 'GPU'
  }
  postMessage({ type: 'bench', gpu: b.gpu, cpu: m, backend })
  bench = null
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data
  if (m.type === 'init') {
    base = m.base
    let error = ''
    for (const b of ['GPU', 'CPU'] as Backend[]) {
      try {
        lm = await create(b)
        backend = b
        if (b === 'GPU') bench = { phase: 'gpu', gpu: 0, times: [] }
        postMessage({ type: 'ready', backend })
        return
      } catch (err) {
        error = String(err)
      }
    }
    postMessage({ type: 'error', message: error })
  } else if (m.type === 'frame') {
    const frame: VideoFrame = m.frame
    const w = frame.displayWidth, h = frame.displayHeight
    let pts: Float32Array | null = null
    let world: Float32Array | null = null // metric 3D landmarks: rotation/tilt-proof gesture input
    let ms = 0
    // the main thread keeps at most one frame in flight, so no queueing here
    try {
      if (!lm) throw new Error('not ready')
      // full resolution: the landmark model crops the hand from this frame, so more pixels = more precise points
      const ts = Math.max(m.ts, lastTs + 1) // MediaPipe needs strictly increasing timestamps
      lastTs = ts
      const t0 = performance.now()
      const res = lm.detectForVideo(frame, ts)
      const hand = res.landmarks[0]
      const w3 = res.worldLandmarks[0]
      ms = performance.now() - t0
      frame.close()
      if (hand && w3) {
        pts = new Float32Array(42)
        world = new Float32Array(63)
        for (let i = 0; i < 21; i++) {
          pts[i * 2] = hand[i].x
          pts[i * 2 + 1] = hand[i].y
          world[i * 3] = w3[i].x
          world[i * 3 + 1] = w3[i].y
          world[i * 3 + 2] = w3[i].z
        }
      }
    } catch {
      frame.close()
      pts = world = null
    }
    postMessage({ type: 'result', pts, world, ts: m.ts, w, h, ms, backend }, pts && world ? [pts.buffer, world.buffer] : [])
    if (ms) void benchStep(ms)
  }
}
