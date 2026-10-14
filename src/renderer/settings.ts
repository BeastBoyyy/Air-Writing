import type { Tool } from './ink/geometry'
import type { DrawMode } from './tracking/gestures'

export type Background = 'camera' | 'blur' | 'dim' | 'white' | 'black'

export interface Settings {
  // drawing
  tool: Tool
  color: string
  size: number
  eraserSize: number
  customColor: string
  quickShape: boolean
  background: Background
  // input
  drawMode: DrawMode
  cameraId: string
  resolution: '480' | '720' | '1080'
  fps: number
  mirror: boolean
  syncVideo: boolean
  minCutoff: number
  beta: number
  prediction: number
  reach: number
  pinchOn: number
  debounceMs: number
  // interface
  theme: 'system' | 'dark' | 'light'
  reduceTransparency: boolean
  showHud: boolean
  showSkeleton: boolean
  onboarded: boolean
  version: number
}

export const DEFAULTS: Settings = {
  tool: 'pen',
  color: '#0A84FF',
  size: 6,
  eraserSize: 44,
  customColor: '#FF6B9A',
  quickShape: true,
  background: 'camera',
  drawMode: 'pinch',
  cameraId: '',
  resolution: '720',
  fps: 60,
  mirror: true,
  syncVideo: true,
  minCutoff: 1.5,
  beta: 0.03,
  prediction: 0.6,
  reach: 1.15,
  pinchOn: 0.45,
  debounceMs: 80,
  theme: 'system',
  reduceTransparency: false,
  showHud: true,
  showSkeleton: false,
  onboarded: false,
  version: 5
}

// Tuning keys whose defaults changed; older saved values are dropped so users get the new feel.
const RETUNED: Record<number, (keyof Settings)[]> = { 2: ['minCutoff', 'beta', 'prediction'], 3: ['pinchOn'], 4: ['debounceMs'], 5: ['pinchOn'] }

const KEY = 'awp.settings.v1'

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    for (let v = (saved.version ?? 1) + 1; v <= DEFAULTS.version; v++) for (const k of RETUNED[v] ?? []) delete saved[k]
    return { ...DEFAULTS, ...saved, version: DEFAULTS.version }
  } catch {
    return { ...DEFAULTS }
  }
}

let timer = 0
export function saveSettings(s: Settings): void {
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      /* storage unavailable: settings just won't persist */
    }
  }, 250)
}
