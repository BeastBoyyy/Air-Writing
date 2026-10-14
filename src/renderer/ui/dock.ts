// Tool rail, bottom dock, popover menus and window controls. All interactions are plain DOM
// clicks, so the mouse, a pinch-tap and an air dwell all go through the same path.
import type { Tool } from '../ink/geometry'
import type { Settings } from '../settings'
import { toast } from './toast'

export const PALETTE = ['#FFFFFF', '#1C1C1E', '#FF453A', '#FF9F0A', '#FFD60A', '#32D74B', '#0A84FF', '#BF5AF2']

export const TOOL_LABEL: Record<Tool, string> = {
  pen: 'Pen', marker: 'Marker', highlighter: 'Highlighter', neon: 'Neon', laser: 'Laser', eraser: 'Eraser',
  line: 'Line', arrow: 'Arrow', rect: 'Rectangle', ellipse: 'Ellipse', triangle: 'Triangle'
}

export type Actions = Record<string, () => void>

export interface Dock {
  refresh(opts: { canUndo: boolean; canRedo: boolean; recording: boolean }): void
  closeMenus(): void
}

export function setupDock(settings: Settings, set: <K extends keyof Settings>(k: K, v: Settings[K]) => void, actions: Actions): Dock {
  const swatches = document.getElementById('swatches')!
  swatches.innerHTML =
    PALETTE.map((c, i) => `<button class="swatch" data-color="${c}" style="--c:${c}" title="Colour · ${i + 1}"></button>`).join('') +
    `<button class="swatch" data-color="custom" id="custom-swatch" title="Custom colour"></button>` +
    `<button class="btn sm" data-act="pickColor" data-icon="palette" title="Pick a custom colour"></button>`
  const picker = document.createElement('input')
  picker.type = 'color'
  picker.hidden = true
  document.body.append(picker)
  picker.addEventListener('input', () => {
    set('customColor', picker.value.toUpperCase())
    set('color', picker.value.toUpperCase())
  })
  actions.pickColor = () => {
    // the OS colour picker only opens from a real click, not a hand gesture
    if (!navigator.userActivation.isActive) return toast('Use the mouse to pick a custom colour')
    picker.value = settings.customColor
    picker.click()
  }

  const size = document.getElementById('size') as HTMLInputElement
  size.addEventListener('input', () => set('size', Number(size.value)))

  const menus = [...document.querySelectorAll<HTMLElement>('.menu')]
  const closeMenus = (): void => menus.forEach((m) => m.classList.remove('open'))
  const openMenu = (id: string, anchor: HTMLElement): void => {
    const m = document.getElementById(id)!
    const wasOpen = m.classList.contains('open')
    closeMenus()
    if (wasOpen) return
    const r = anchor.getBoundingClientRect()
    m.style.left = `${r.left + r.width / 2}px`
    m.style.bottom = `${innerHeight - r.top + 14}px`
    m.classList.add('open')
  }

  document.addEventListener('click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-tool],[data-color],[data-act],[data-bg],[data-menu],[data-win]')
    if (!el) {
      if (!(e.target as Element).closest('.menu')) closeMenus()
      return
    }
    const d = el.dataset
    if (d.menu) return openMenu(d.menu, el)
    if (d.tool) set('tool', d.tool as Tool)
    else if (d.color) {
      set('color', d.color === 'custom' ? settings.customColor : d.color)
      if (settings.tool === 'eraser') set('tool', 'pen')
    } else if (d.bg) set('background', d.bg as Settings['background'])
    else if (d.win) window.api.win(d.win as 'overlay')
    else if (d.act) actions[d.act]?.()
    if (!d.act?.startsWith('size')) closeMenus()
  })

  const tools = [...document.querySelectorAll<HTMLElement>('[data-tool]')]
  const colors = [...document.querySelectorAll<HTMLElement>('[data-color]')]
  const bgs = [...document.querySelectorAll<HTMLElement>('[data-bg]')]
  const custom = document.getElementById('custom-swatch')!
  const undo = document.querySelector<HTMLButtonElement>('[data-act="undo"]')!
  const redo = document.querySelector<HTMLButtonElement>('[data-act="redo"]')!
  const rec = document.getElementById('rec-btn')!
  const sizeVal = document.getElementById('size-val')!
  const sizeDot = document.getElementById('size-dot')!
  const toolChip = document.querySelector<HTMLElement>('#st-tool')!

  return {
    closeMenus,
    refresh({ canUndo, canRedo, recording }) {
      for (const t of tools) t.classList.toggle('active', t.dataset.tool === settings.tool)
      const isCustom = !PALETTE.includes(settings.color)
      for (const c of colors) c.classList.toggle('active', c.dataset.color === 'custom' ? isCustom : c.dataset.color === settings.color)
      custom.style.setProperty('--c', settings.customColor)
      for (const b of bgs) b.classList.toggle('active', b.dataset.bg === settings.background)
      size.value = String(settings.size)
      sizeVal.textContent = String(settings.size)
      sizeDot.style.setProperty('--s', `${Math.min(settings.size, 26)}px`)
      sizeDot.style.setProperty('--c', settings.color)
      undo.disabled = !canUndo
      redo.disabled = !canRedo
      rec.classList.toggle('recording', recording)
      toolChip.style.setProperty('--c', settings.color)
      toolChip.querySelector('b')!.textContent = TOOL_LABEL[settings.tool]
    }
  }
}
