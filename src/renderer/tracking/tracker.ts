// Main-thread client for the hand-tracking worker (GPU delegate, CPU fallback inside the worker).
import TrackerWorker from './tracker.worker?worker'

export interface TrackResult {
  /** 21 image landmarks, flat x,y, normalized — where the fingertip is on screen */
  pts: Float32Array | null
  /** 21 world landmarks, flat x,y,z in metres — the hand's true 3D pose, for gestures */
  world: Float32Array | null
  /** performance.now() when the frame was captured */
  ts: number
  w: number
  h: number
}

export class Tracker {
  backend = 'loading'
  /** Smoothed model inference time in ms. */
  inferMs = 0
  onResult: (r: TrackResult) => void = () => {}
  private inFlight = 0
  /** Frames handed to the worker at once. 2 = one queued behind the one being processed, so the
   *  model never idles waiting for the camera (higher rate, ~1 frame more latency). */
  maxInFlight = 2
  private worker: Worker | null = null

  init(base: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const w = new TrackerWorker()
      const fail = (msg: string): void => {
        this.backend = 'unavailable'
        w.terminate()
        reject(new Error(msg))
      }
      const timer = setTimeout(() => fail('Hand tracking took too long to start'), 30000)
      w.onerror = (e) => {
        clearTimeout(timer)
        fail(e.message || 'Hand tracking worker crashed')
      }
      w.onmessage = (e) => {
        const m = e.data
        clearTimeout(timer)
        if (m.type === 'error') return fail(m.message)
        this.backend = m.backend
        this.worker = w
        w.onmessage = (ev) => {
          const d = ev.data
          if (d.type === 'log') return console.warn(d.message)
          if (d.type === 'bench') {
            console.info(`Tracker benchmark: GPU ${d.gpu.toFixed(1)}ms, CPU ${d.cpu.toFixed(1)}ms → ${d.backend}`)
            return
          }
          this.inFlight--
          this.backend = d.backend
          if (d.ms) this.inferMs += (d.ms - this.inferMs) * 0.1
          this.onResult(d as TrackResult)
        }
        resolve()
      }
      w.postMessage({ type: 'init', base })
    })
  }

  get ready(): boolean {
    return this.worker !== null
  }

  /** Hand a camera frame to the tracker (takes ownership). Returns false and drops it if the tracker is full. */
  process(frame: VideoFrame, ts: number): boolean {
    if (this.inFlight >= this.maxInFlight || !this.worker) {
      frame.close()
      return false
    }
    this.inFlight++
    this.worker.postMessage({ type: 'frame', frame, ts }, [frame])
    return true
  }
}
