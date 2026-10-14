// Settings sheet, generated from a field list.
import type { Settings } from '../settings'
import { icon } from './icons'

type Field = { key: keyof Settings; label: string; hint?: string } & (
  | { type: 'toggle' }
  | { type: 'range'; min: number; max: number; step: number; fmt?: (v: number) => string }
  | { type: 'select'; options: [string, string][] }
)

const SECTIONS: [string, Field[]][] = [
  ['Camera', [
    { key: 'cameraId', label: 'Camera', type: 'select', options: [['', 'Default camera']] },
    { key: 'resolution', label: 'Resolution', type: 'select', options: [['480', '640 × 480'], ['720', '1280 × 720'], ['1080', '1920 × 1080']] },
    { key: 'fps', label: 'Frame rate', hint: 'Higher = lower latency, if your camera supports it', type: 'select', options: [['30', '30 fps'], ['60', '60 fps']] },
    { key: 'mirror', label: 'Mirror image', type: 'toggle' },
    { key: 'syncVideo', label: 'Lock video to tracking', hint: 'Ink sits exactly on your fingertip; video updates as fast as tracking', type: 'toggle' }
  ]],
  ['Hand tracking', [
    { key: 'drawMode', label: 'Draw gesture', hint: 'Pinch is more precise; Point matches the original', type: 'select', options: [['pinch', 'Pinch to draw'], ['point', 'Point to draw']] },
    { key: 'minCutoff', label: 'Steadiness', hint: 'Lower = smoother when moving slowly', type: 'range', min: 0.2, max: 5, step: 0.1, fmt: (v) => v.toFixed(1) },
    { key: 'beta', label: 'Responsiveness', hint: 'Higher = less lag on fast strokes', type: 'range', min: 0, max: 0.06, step: 0.001, fmt: (v) => (v * 1000).toFixed(0) },
    { key: 'prediction', label: 'Prediction', hint: 'Cursor leads the camera to hide latency', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
    { key: 'reach', label: 'Reach', hint: 'Small hand moves cover more screen', type: 'range', min: 1, max: 1.8, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
    { key: 'pinchOn', label: 'Pinch sensitivity', hint: 'Higher = pinch triggers sooner', type: 'range', min: 0.2, max: 0.7, step: 0.01, fmt: (v) => v.toFixed(2) },
    { key: 'debounceMs', label: 'Gesture debounce', type: 'range', min: 0, max: 160, step: 10, fmt: (v) => `${v} ms` },
    { key: 'showSkeleton', label: 'Show hand skeleton', type: 'toggle' }
  ]],
  ['Drawing', [
    { key: 'quickShape', label: 'QuickShape', hint: 'Hold still at the end of a stroke to snap it to a shape', type: 'toggle' },
    { key: 'eraserSize', label: 'Eraser size', type: 'range', min: 10, max: 140, step: 2, fmt: (v) => `${v}` }
  ]],
  ['Interface', [
    { key: 'theme', label: 'Appearance', type: 'select', options: [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']] },
    { key: 'reduceTransparency', label: 'Reduce transparency', hint: 'Solid panels; saves GPU on older machines', type: 'toggle' },
    { key: 'showHud', label: 'Performance HUD', type: 'toggle' }
  ]]
]

const SHORTCUTS: [string, string][] = [
  ['P M H N K E', 'Pen · Marker · Highlighter · Neon · Laser · Eraser'],
  ['L A R O T', 'Line · Arrow · Rectangle · Ellipse · Triangle'],
  ['1 – 8', 'Colours'],
  ['[  ]', 'Brush size'],
  ['Ctrl/⌘ Z', 'Undo (Shift for redo)'],
  ['C', 'Clear'],
  ['B', 'Cycle background'],
  ['Ctrl/⌘ S · O · E', 'Save · Open · Export PNG'],
  ['F9', 'Record video'],
  ['Ctrl/⌘ Shift A', 'Overlay mode (global)'],
  ['F', 'Toggle HUD'],
  ['F11', 'Full screen']
]

export class SettingsPanel {
  private inputs = new Map<keyof Settings, HTMLInputElement | HTMLSelectElement>()

  constructor(
    private root: HTMLElement,
    private settings: Settings,
    set: (k: keyof Settings, v: any) => void,
    extra: { tutorial: () => void; reset: () => void }
  ) {
    root.innerHTML = `<div class="sheet-head"><h2>Settings</h2><button class="btn sm" data-close>${icon('close')}</button></div>`
    for (const [title, fields] of SECTIONS) {
      root.insertAdjacentHTML('beforeend', `<div class="section-title">${title}</div>`)
      const rows = document.createElement('div')
      rows.className = 'rows'
      for (const f of fields) rows.append(this.row(f, set))
      root.append(rows)
    }
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="section-title">Shortcuts</div><div class="rows shortcuts">${SHORTCUTS.map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('')}</div>
       <div class="sheet-actions"><button class="pill-btn" data-tutorial>Gesture guide</button><button class="pill-btn" data-reset>Reset settings</button></div>`
    )
    root.querySelector('[data-close]')!.addEventListener('click', () => this.toggle(false))
    root.querySelector('[data-tutorial]')!.addEventListener('click', extra.tutorial)
    root.querySelector('[data-reset]')!.addEventListener('click', extra.reset)
    this.sync()
  }

  get isOpen(): boolean {
    return this.root.classList.contains('open')
  }

  toggle(open = !this.isOpen): void {
    this.root.classList.toggle('open', open)
  }

  setCameras(devices: MediaDeviceInfo[]): void {
    const sel = this.inputs.get('cameraId') as HTMLSelectElement
    sel.innerHTML = '<option value="">Default camera</option>'
    devices.forEach((d, i) => sel.add(new Option(d.label || `Camera ${i + 1}`, d.deviceId)))
    sel.value = this.settings.cameraId
  }

  /** Reflect current settings into the controls. */
  sync(): void {
    for (const [key, el] of this.inputs) {
      const v = this.settings[key]
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(v)
      else el.value = String(v)
      el.dispatchEvent(new Event('sync'))
    }
  }

  private row(f: Field, set: (k: keyof Settings, v: any) => void): HTMLElement {
    const row = document.createElement('label')
    row.className = 'row'
    row.innerHTML = `<span class="label">${f.label}${f.hint ? `<span class="hint">${f.hint}</span>` : ''}</span>`
    let el: HTMLInputElement | HTMLSelectElement
    if (f.type === 'toggle') {
      el = Object.assign(document.createElement('input'), { type: 'checkbox', className: 'switch' })
      el.addEventListener('change', () => set(f.key, (el as HTMLInputElement).checked))
    } else if (f.type === 'range') {
      const input = Object.assign(document.createElement('input'), { type: 'range', min: String(f.min), max: String(f.max), step: String(f.step) })
      const val = document.createElement('span')
      val.className = 'val'
      const show = (): void => void (val.textContent = f.fmt ? f.fmt(Number(input.value)) : input.value)
      input.addEventListener('input', () => {
        show()
        set(f.key, Number(input.value))
      })
      input.addEventListener('sync', show)
      row.append(val)
      el = input
    } else {
      const sel = document.createElement('select')
      for (const [v, label] of f.options) sel.add(new Option(label, v))
      const numeric = typeof this.settings[f.key] === 'number'
      sel.addEventListener('change', () => set(f.key, numeric ? Number(sel.value) : sel.value))
      el = sel
    }
    row.append(el)
    this.inputs.set(f.key, el)
    return row
  }
}
