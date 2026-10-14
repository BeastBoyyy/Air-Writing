import './styles.css'
import { exportPNG, exportSVG, openProject, Recorder, saveProject } from './ink/export'
import type { Tool } from './ink/geometry'
import { Pen } from './ink/pen'
import { InkLayer } from './ink/render'
import { Scene } from './ink/scene'
import { DEFAULTS, loadSettings, saveSettings, type Background, type Settings } from './settings'
import { Camera } from './tracking/camera'
import { PointFilter } from './tracking/filter'
import { GestureTracker, pinchCloseness, pointer, type Gesture } from './tracking/gestures'
import { Tracker, type TrackResult } from './tracking/tracker'
import { AirPointer } from './ui/air'
import { PALETTE, setupDock } from './ui/dock'
import { hydrateIcons } from './ui/icons'
import { showOnboarding } from './ui/onboarding'
import { SettingsPanel } from './ui/panel'
import { Radial } from './ui/radial'
import { toast } from './ui/toast'

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T

const CLEAR_HOLD_MS = 1200
const MAX_LEAD_MS = 80 // enough to extrapolate across a whole gap between ~15Hz samples
const CURSOR_EASE_MS = 14 // live mode only: hides the small correction jump when a new sample lands
const HAND_TIMEOUT_MS = 300 // no hand for this long = really gone (single dropped frames are normal at speed)
// Fast writing blurs the camera image: for a frame or few the hand can vanish or the pinch can read as open.
// Within this window the stroke stays alive; if the pinch returns, the motion seen meanwhile is replayed.
const LIFT_GRACE_MS = 160
const BG_COLOR: Partial<Record<Background, string>> = { white: '#F5F5F7', black: '#14161B' }
const BG_ORDER: Background[] = ['camera', 'blur', 'dim', 'white', 'black']
const RESOLUTION = { '480': [640, 480], '720': [1280, 720], '1080': [1920, 1080] } as const

// ───────────── state ─────────────
const settings = loadSettings()
const stage = $('#stage')
const video = $<HTMLVideoElement>('#video')
const inkCanvas = $<HTMLCanvasElement>('#ink')
const liveCanvas = $<HTMLCanvasElement>('#live')
const live = liveCanvas.getContext('2d')!

const scene = new Scene()
const ink = new InkLayer(inkCanvas, scene)
const pen = new Pen(scene, ink, () => settings)
const camera = new Camera(video)
const tracker = new Tracker()
const gestures = new GestureTracker(settings)
const filter = new PointFilter(settings.minCutoff, settings.beta)
const recorder = new Recorder(compose)

let W = 0, H = 0, dpr = 1
let penSource: 'hand' | 'mouse' | null = null
let penGesture: Gesture = 'NONE'
let liftT = 0
let held: number[] = [] // x, y, t samples seen during a possible lift
let sampleDirty = true
const hand = { present: false, lastSeen: 0, gesture: 'NONE' as Gesture, pts: null as Float32Array | null, fw: 1280, fh: 720 }
const palm = { start: 0, progress: 0, fired: false }
const raw = { x: 0, y: 0 }
const cur = { x: 0, y: 0 }
const target = { x: 0, y: 0 }
let cursorFresh = true
let liveDirty = true
let lastFrameT = 0
const stats = { frames: 0, results: 0, latency: 0, latN: 0, last: 0 }

// ───────────── settings ─────────────
function set<K extends keyof Settings>(k: K, v: Settings[K]): void {
  if (settings[k] === v) return
  settings[k] = v
  apply(k)
  saveSettings(settings)
}

function apply(k: keyof Settings): void {
  switch (k) {
    case 'cameraId': case 'resolution': case 'fps':
      void startCamera()
      break
    case 'minCutoff': filter.minCutoff = settings.minCutoff; break
    case 'beta': filter.beta = settings.beta; break
    case 'mirror': stage.classList.toggle('mirror', settings.mirror); break
    case 'syncVideo':
      stage.classList.toggle('synced', settings.syncVideo)
      tracker.maxInFlight = settings.syncVideo ? 2 : 1 // live video: keep latency minimal instead
      while (shownFrames.length) shownFrames.pop()!.close()
      break
    case 'reach': stage.style.setProperty('--reach', String(settings.reach)); break // video zooms with reach so ink stays on the fingertip
    case 'theme': applyTheme(); break
    case 'reduceTransparency': document.body.classList.toggle('reduce-transparency', settings.reduceTransparency); break
    case 'showHud': $('#hud').hidden = !settings.showHud; break
    case 'drawMode': gestures.reset(); break
    case 'background':
      stage.className = stage.className.replace(/\bbg-\w+/g, '').trim() + ` bg-${settings.background}`
      break
  }
  refreshUI()
}

const themeQuery = matchMedia('(prefers-color-scheme: dark)')
function applyTheme(): void {
  document.documentElement.dataset.theme = settings.theme === 'system' ? (themeQuery.matches ? 'dark' : 'light') : settings.theme
}
themeQuery.addEventListener('change', applyTheme)

// ───────────── UI ─────────────
const actions: Record<string, () => void> = {
  undo: () => void (scene.undo() || toast('Nothing to undo')),
  redo: () => void (scene.redo() || toast('Nothing to redo')),
  clear: () => {
    if (scene.clear()) toast('Canvas cleared', 'Ctrl/⌘+Z to undo')
  },
  sizeDown: () => set('size', Math.max(1, settings.size - 1)),
  sizeUp: () => set('size', Math.min(40, settings.size + 1)),
  record: () => void toggleRecording(),
  settings: () => panel.toggle(),
  help: () => openGuide(),
  exportPng: () => void run(() => exportPNG(scene, W, H, dpr), 'PNG saved'),
  exportPngWhite: () => void run(() => exportPNG(scene, W, H, dpr, BG_COLOR.white), 'PNG saved'),
  exportPngBlack: () => void run(() => exportPNG(scene, W, H, dpr, BG_COLOR.black), 'PNG saved'),
  exportSvg: () => void run(() => exportSVG(scene, W, H), 'SVG saved'),
  saveProject: () => void run(() => saveProject(scene, W, H), 'Project saved'),
  openProject: () => void run(async () => ((await openProject(scene)) ? 'ok' : null), 'Project opened')
}

async function run(task: () => Promise<string | null>, done: string): Promise<void> {
  try {
    const path = await task()
    if (path) toast(done, path === 'ok' ? '' : path.split(/[\\/]/).pop())
  } catch (err) {
    toast('Something went wrong', err instanceof Error ? err.message : String(err), 'error', 4000)
  }
}

const dock = setupDock(settings, set, actions)
const radial = new Radial($('#radial'), () => settings.tool, (t: Tool) => set('tool', t))
const air = new AirPointer(radial)
const panel = new SettingsPanel($('#settings'), settings, set, {
  tutorial: () => openGuide(),
  reset: () => {
    const keep = { onboarded: true, cameraId: settings.cameraId }
    Object.assign(settings, DEFAULTS, keep)
    saveSettings(settings)
    for (const k of Object.keys(settings) as (keyof Settings)[]) if (k !== 'cameraId') apply(k)
    panel.sync()
    toast('Settings reset')
  }
})
hydrateIcons()

function refreshUI(): void {
  dock.refresh({ canUndo: scene.canUndo, canRedo: scene.canRedo, recording: recorder.active })
}
scene.on(refreshUI)

function openGuide(): void {
  panel.toggle(false)
  showOnboarding($('#onboarding'), settings.drawMode, () => set('onboarded', true))
}

let inking = false
function setInking(on: boolean): void {
  if (on === inking) return
  inking = on
  document.body.classList.toggle('inking', on)
}

const gestureChip = $('#st-gesture')
const GESTURE_LABEL: Record<Gesture, [string, string]> = {
  DRAW: ['Drawing', '#32D74B'],
  HOVER: ['Ready', '#0A84FF'],
  SELECT: ['Select', '#FFD60A'],
  ERASE: ['Erasing', '#FF9F0A'],
  PALM: ['Hold to clear', '#FF453A'],
  FIST: ['Paused', '#8E8E93'],
  NONE: ['Hand detected', '#0A84FF']
}
let shownStatus = ''
function setStatus(text: string, color: string): void {
  const key = text + color
  if (key === shownStatus) return
  shownStatus = key
  gestureChip.querySelector('b')!.textContent = text
  gestureChip.style.setProperty('--c', color)
}

let hintShown = false
function setHint(show: boolean): void {
  if (show === hintShown) return
  hintShown = show
  $('#hint').classList.toggle('show', show)
}

// ───────────── camera + tracking ─────────────
async function startCamera(): Promise<void> {
  const [width, height] = RESOLUTION[settings.resolution] ?? RESOLUTION['720']
  setStatus('Starting camera…', '#8E8E93')
  try {
    await camera.start({ deviceId: settings.cameraId, width, height, fps: settings.fps }, onCameraFrame)
    panel.setCameras(await Camera.devices())
    if (!hand.present) setStatus('No hand', '#8E8E93')
  } catch (err) {
    const name = err instanceof DOMException ? err.name : ''
    const fix =
      window.api.platform === 'darwin'
        ? 'Allow it in System Settings › Privacy & Security › Camera'
        : 'Allow it in Settings › Privacy & security › Camera'
    if (name === 'NotAllowedError') toast('Camera access was blocked', fix, 'error', 8000)
    else if (name === 'NotFoundError' || name === 'OverconstrainedError') toast('No camera found', 'Plug one in or pick another in Settings', 'error', 8000)
    else toast('Camera could not start', err instanceof Error ? err.message : String(err), 'error', 8000)
    setStatus('No camera', '#FF453A')
  }
}

// "Lock video to tracking": show exactly the frame the hand was found in, at the moment its result
// arrives, so ink and cursor sit on the fingertip in every displayed frame (no latency gap to predict).
const cameraCanvas = $<HTMLCanvasElement>('#camera')
const cameraCtx = cameraCanvas.getContext('2d', { alpha: false })!
const shownFrames: VideoFrame[] = [] // copies of frames in the tracker, in order; results come back in order

function drawCamera(f: VideoFrame): void {
  if (cameraCanvas.width !== f.displayWidth || cameraCanvas.height !== f.displayHeight) {
    cameraCanvas.width = f.displayWidth
    cameraCanvas.height = f.displayHeight
  }
  cameraCtx.drawImage(f, 0, 0)
}

function onCameraFrame(f: VideoFrame, ts: number): void {
  if (!settings.syncVideo) return void tracker.process(f, ts)
  if (!tracker.ready) {
    drawCamera(f) // tracker still loading: just show live frames
    return void tracker.process(f, ts)
  }
  const copy = f.clone()
  if (tracker.process(f, ts)) shownFrames.push(copy)
  else copy.close()
}

/** Normalized camera coords → screen px, matching the <video>'s object-fit: cover + mirror, scaled by reach. */
function toScreen(p: { x: number; y: number }): void {
  const s = Math.max(W / hand.fw, H / hand.fh)
  const dw = hand.fw * s, dh = hand.fh * s
  const x = (settings.mirror ? 1 - p.x : p.x) * dw + (W - dw) / 2
  const y = p.y * dh + (H - dh) / 2
  p.x = W / 2 + (x - W / 2) * settings.reach
  p.y = H / 2 + (y - H / 2) * settings.reach
}

tracker.onResult = (r: TrackResult) => {
  const shown = shownFrames.shift()
  if (shown) {
    drawCamera(shown)
    shown.close()
  }
  stats.results++
  sampleDirty = true
  stats.latency += performance.now() - r.ts
  stats.latN++
  if (!r.pts) {
    // dropped frame (often motion blur): hold the pen, let the grace timer decide; the frame loop
    // declares the hand lost after HAND_TIMEOUT_MS
    if (penSource === 'hand' && !liftT) liftT = r.ts
    return
  }
  hand.present = true
  hand.lastSeen = performance.now()
  hand.pts = r.pts
  hand.fw = r.w
  hand.fh = r.h
  const g = gestures.update(r.world!, r.ts)
  pointer(r.pts, raw, settings.drawMode === 'pinch' ? pinchCloseness(gestures.pinchRatio, settings.pinchOn) : 0)
  toScreen(raw)
  filter.update(raw.x, raw.y, r.ts)
  onHandSample(g, filter.x, filter.y, r.ts)
  hand.gesture = g
}

function endHandPen(): boolean {
  if (penSource !== 'hand') return false
  pen.end()
  penSource = null
  liftT = 0
  held = []
  setInking(false)
  return true
}

function onHandSample(g: Gesture, x: number, y: number, t: number): void {
  const prev = hand.gesture
  const wantsPen = g === 'DRAW' || g === 'ERASE'
  let restart = false
  if (penSource === 'hand') {
    if (g === penGesture) {
      if (liftT) {
        // it was a glitch, not a lift: keep the motion it hid
        for (let i = 0; i < held.length; i += 3) pen.move(held[i], held[i + 1], held[i + 2])
        held = []
        liftT = 0
      }
      pen.move(x, y, t)
    } else if (wantsPen) restart = endHandPen() // switched between drawing and erasing
    else {
      if (!liftT) liftT = t
      held.push(x, y, t) // the frame loop ends the stroke once the grace period runs out
    }
  }
  if (wantsPen && penSource === null && (g !== prev || restart)) {
    const target = g === 'DRAW' && !restart ? air.current(x, y) : null
    if (radial.isOpen) {
      if (g === 'DRAW') radial.pickHot() // pinch picks the highlighted tool instantly
    } else if (target) air.press(target) // pinch-tap on a button
    else {
      pen.begin(x, y, t, g === 'ERASE' ? 'eraser' : undefined)
      penSource = 'hand'
      penGesture = g
      setInking(true)
    }
  }

  if (g === 'PALM' && !scene.isEmpty) {
    palm.start ||= t
    palm.progress = Math.min((t - palm.start) / CLEAR_HOLD_MS, 1)
    if (palm.progress >= 1 && !palm.fired) {
      palm.fired = true
      actions.clear()
    }
  } else {
    palm.start = palm.progress = 0
    palm.fired = false
  }
}

function handLost(): void {
  if (!hand.present) return
  endHandPen()
  liveDirty = true
  hand.present = false
  hand.gesture = 'NONE'
  hand.pts = null
  filter.reset()
  gestures.reset()
  air.reset()
  palm.start = palm.progress = 0
  palm.fired = false
}

// ───────────── mouse / pen tablet ─────────────
stage.addEventListener('contextmenu', (e) => e.preventDefault())
stage.addEventListener('pointerdown', (e) => {
  if (penSource || ![0, 2, 5].includes(e.button)) return
  dock.closeMenus()
  stage.setPointerCapture(e.pointerId)
  pen.begin(e.clientX, e.clientY, e.timeStamp, e.button === 0 ? undefined : 'eraser')
  penSource = 'mouse'
  setInking(true)
})
stage.addEventListener('pointermove', (e) => {
  if (penSource !== 'mouse') return
  for (const ev of e.getCoalescedEvents?.() ?? [e]) pen.move(ev.clientX, ev.clientY, ev.timeStamp)
})
const mouseUp = (): void => {
  if (penSource !== 'mouse') return
  pen.end()
  penSource = null
  setInking(false)
}
stage.addEventListener('pointerup', mouseUp)
stage.addEventListener('pointercancel', mouseUp)

// ───────────── render loop ─────────────
function resize(): void {
  W = innerWidth
  H = innerHeight
  dpr = devicePixelRatio || 1
  ink.resize(W, H, dpr)
  liveCanvas.width = Math.round(W * dpr)
  liveCanvas.height = Math.round(H * dpr)
  liveDirty = true
}
window.addEventListener('resize', resize)

let animating = true
const hudEl = $('#hud')
const recChip = $('#st-rec')

function frame(now: number): void {
  requestAnimationFrame(frame)
  stats.frames++

  if (hand.present && now - hand.lastSeen > HAND_TIMEOUT_MS) handLost()
  const showCursor = hand.present && filter.ready
  const dt = now - lastFrameT
  lastFrameT = now
  if (!showCursor) cursorFresh = true
  else if (settings.syncVideo) {
    // video shows the tracked frame, so the cursor belongs exactly at that frame's fingertip
    cur.x = filter.x
    cur.y = filter.y
    cursorFresh = false
  } else {
    filter.predict(now, MAX_LEAD_MS, settings.prediction, target)
    const a = cursorFresh ? 1 : 1 - Math.exp(-dt / CURSOR_EASE_MS)
    cur.x += (target.x - cur.x) * a
    cur.y += (target.y - cur.y) * a
    cursorFresh = false
  }
  const dwell = showCursor ? air.update(cur.x, cur.y, hand.gesture, now) : 0
  pen.tick(now)
  if (liftT && now - liftT > LIFT_GRACE_MS) endHandPen()

  // Repaint the overlay only when something on it changed. In locked-video mode that's once per
  // tracking result; skipping idle repaints keeps the GPU free for the hand-tracking model.
  const gliding = showCursor && !settings.syncVideo
  if (gliding || sampleDirty || dwell > 0 || animating || penSource === 'mouse' || liveDirty) {
    live.setTransform(1, 0, 0, 1, 0, 0)
    live.clearRect(0, 0, liveCanvas.width, liveCanvas.height)
    live.setTransform(dpr, 0, 0, dpr, 0, 0)
    animating = pen.drawLive(live, penSource === 'hand' && !settings.syncVideo ? cur : null, now)
    if (settings.showSkeleton && hand.pts) drawSkeleton(hand.pts)
    if (showCursor) drawCursor(cur.x, cur.y, hand.gesture, dwell)
    sampleDirty = liveDirty = false
  }

  recorder.frame(now)

  if (now - stats.last >= 500) {
    const k = 1000 / (now - stats.last || 1)
    if (settings.showHud) {
      const lat = stats.latN ? Math.round(stats.latency / stats.latN) : 0
      hudEl.textContent = `${Math.round(stats.frames * k)} fps · ${Math.round(stats.results * k)} Hz · ${lat} ms · ${tracker.backend} ${tracker.inferMs.toFixed(0)}ms`
    }
    if (recorder.active) {
      const s = Math.floor((now - recorder.startedAt) / 1000)
      recChip.querySelector('b')!.textContent = `REC ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    }
    stats.frames = stats.results = stats.latency = stats.latN = 0
    stats.last = now
    if (camera.stream) {
      if (hand.present) {
        const [label, color] = GESTURE_LABEL[hand.gesture]
        setStatus(label, color)
      } else setStatus('No hand', '#8E8E93')
    }
    setHint(Boolean(camera.stream) && !hand.present && !document.body.classList.contains('overlay'))
  }
}

function drawCursor(x: number, y: number, g: Gesture, dwell: number): void {
  const c = live
  c.save()
  c.lineWidth = 2
  const ring = (r: number, color: string, fill?: string): void => {
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    if (fill) {
      c.fillStyle = fill
      c.fill()
    }
    c.strokeStyle = color
    c.stroke()
  }
  c.shadowColor = 'rgba(0,0,0,.45)'
  c.shadowBlur = 6
  const erasing = g === 'ERASE' || (g === 'DRAW' && settings.tool === 'eraser')
  if (erasing) ring(settings.eraserSize / 2, 'rgba(255,255,255,.95)', 'rgba(255,255,255,.12)')
  else if (g === 'DRAW') ring(Math.max(4, settings.size / 2), '#fff', settings.color)
  else if (g === 'HOVER') {
    ring(Math.max(7, settings.size / 2 + 4), settings.color)
    ring(1.5, '#fff', '#fff')
  } else if (g === 'SELECT') ring(11, '#FFD60A', 'rgba(255,214,10,.18)')
  else if (g === 'FIST') ring(8, 'rgba(200,200,205,.8)')
  else if (g === 'PALM') ring(14, 'rgba(255,255,255,.75)')
  else ring(8, 'rgba(255,255,255,.5)')

  c.shadowBlur = 0
  const arc = (r: number, p: number, color: string, w: number): void => {
    c.beginPath()
    c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p)
    c.strokeStyle = color
    c.lineWidth = w
    c.lineCap = 'round'
    c.stroke()
  }
  if (dwell > 0) {
    arc(20, 1, 'rgba(255,255,255,.2)', 3)
    arc(20, dwell, '#fff', 3)
  }
  if (palm.progress > 0) {
    arc(36, 1, 'rgba(255,255,255,.18)', 5)
    arc(36, palm.progress, '#FF453A', 5)
  }
  c.restore()
}

const BONES = [0, 1, 1, 2, 2, 3, 3, 4, 0, 5, 5, 6, 6, 7, 7, 8, 5, 9, 9, 10, 10, 11, 11, 12, 9, 13, 13, 14, 14, 15, 15, 16, 13, 17, 0, 17, 17, 18, 18, 19, 19, 20]
const bone = { x: 0, y: 0 }
const joints = new Float32Array(42)
function drawSkeleton(pts: Float32Array): void {
  for (let i = 0; i < 21; i++) {
    bone.x = pts[i * 2]
    bone.y = pts[i * 2 + 1]
    toScreen(bone)
    joints[i * 2] = bone.x
    joints[i * 2 + 1] = bone.y
  }
  const c = live
  c.save()
  c.strokeStyle = 'rgba(255,255,255,.55)'
  c.lineWidth = 1.5
  c.beginPath()
  for (let i = 0; i < BONES.length; i += 2) {
    c.moveTo(joints[BONES[i] * 2], joints[BONES[i] * 2 + 1])
    c.lineTo(joints[BONES[i + 1] * 2], joints[BONES[i + 1] * 2 + 1])
  }
  c.stroke()
  c.fillStyle = '#0A84FF'
  for (let i = 0; i < 21; i++) c.fillRect(joints[i * 2] - 2, joints[i * 2 + 1] - 2, 4, 4)
  c.restore()
}

// ───────────── recording ─────────────
function compose(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const bg = settings.background
  ctx.save()
  ctx.filter = 'none'
  const src: CanvasImageSource = settings.syncVideo ? cameraCanvas : video
  const sw = settings.syncVideo ? cameraCanvas.width : video.videoWidth
  const sh = settings.syncVideo ? cameraCanvas.height : video.videoHeight
  if (BG_COLOR[bg] || !sw || !sh) {
    ctx.fillStyle = BG_COLOR[bg] ?? '#000'
    ctx.fillRect(0, 0, w, h)
  } else {
    const s = Math.max(w / sw, h / sh) * (bg === 'blur' ? 1.08 : 1) * settings.reach
    const dw = sw * s, dh = sh * s
    if (settings.mirror) {
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
    }
    if (bg === 'blur') ctx.filter = `blur(${Math.round(24 * (w / W))}px) saturate(1.2) brightness(.85)`
    ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.filter = 'none'
    if (bg === 'dim') {
      ctx.fillStyle = 'rgba(0,0,0,.55)'
      ctx.fillRect(0, 0, w, h)
    }
  }
  ctx.drawImage(inkCanvas, 0, 0, w, h)
  ctx.drawImage(liveCanvas, 0, 0, w, h)
  ctx.restore()
}

async function toggleRecording(): Promise<void> {
  if (!recorder.active) {
    try {
      recorder.start()
      recChip.hidden = false
      toast('Recording', 'F9 to stop')
    } catch (err) {
      toast('Recording failed', err instanceof Error ? err.message : String(err), 'error')
    }
  } else {
    recChip.hidden = true
    const blob = await recorder.stop()
    refreshUI()
    const data = await blob.arrayBuffer()
    await run(() => window.api.saveFile(`air-recording-${Date.now()}.webm`, [{ name: 'WebM video', extensions: ['webm'] }], data), 'Video saved')
  }
  refreshUI()
}

// ───────────── keyboard ─────────────
const KEY_TOOLS: Record<string, Tool> = { p: 'pen', m: 'marker', h: 'highlighter', n: 'neon', k: 'laser', e: 'eraser', l: 'line', a: 'arrow', r: 'rect', o: 'ellipse', t: 'triangle' }
window.addEventListener('keydown', (e) => {
  if ((e.target as Element).closest('input, select')) return
  const mod = e.ctrlKey || e.metaKey
  const k = e.key.toLowerCase()
  const handled = (fn: () => void): void => {
    e.preventDefault()
    fn()
  }
  if (mod) {
    if (k === 'z') handled(e.shiftKey ? actions.redo : actions.undo)
    else if (k === 'y') handled(actions.redo)
    else if (k === 's') handled(actions.saveProject)
    else if (k === 'o') handled(actions.openProject)
    else if (k === 'e') handled(actions.exportPng)
    return
  }
  if (e.key === 'Escape') {
    panel.toggle(false)
    dock.closeMenus()
  } else if (KEY_TOOLS[k]) set('tool', KEY_TOOLS[k])
  else if (k >= '1' && k <= '8') set('color', PALETTE[Number(k) - 1])
  else if (k === '[') actions.sizeDown()
  else if (k === ']') actions.sizeUp()
  else if (k === 'c') actions.clear()
  else if (k === 'b') set('background', BG_ORDER[(BG_ORDER.indexOf(settings.background) + 1) % BG_ORDER.length])
  else if (k === 'f') set('showHud', !settings.showHud)
  else if (k === ',') actions.settings()
  else if (e.key === 'F1' || k === '?') handled(actions.help)
  else if (e.key === 'F9') handled(actions.record)
  else if (e.key === 'F11') handled(() => window.api.win('fullscreen'))
})

// ───────────── overlay mode ─────────────
window.api.onOverlay((on) => {
  document.body.classList.toggle('overlay', on)
  panel.toggle(false)
  dock.closeMenus()
  const shortcut = window.api.platform === 'darwin' ? '⌘+Shift+A' : 'Ctrl+Shift+A'
  toast(on ? 'Overlay mode on' : 'Overlay mode off', on ? `Draw over any app · ${shortcut} to exit` : '', 'info', on ? 4000 : 1800)
})

// ───────────── boot ─────────────
for (const k of ['mirror', 'syncVideo', 'reach', 'theme', 'reduceTransparency', 'showHud', 'background'] as const) apply(k)
resize()
requestAnimationFrame(frame)
if (!settings.onboarded) openGuide()

const base = new URL('mediapipe', location.href).href
tracker
  .init(base)
  .then(() => console.info(`Hand tracking ready (${tracker.backend})`))
  .catch((err) => toast('Hand tracking unavailable', err instanceof Error ? err.message : String(err), 'error', 8000))
void startCamera()
