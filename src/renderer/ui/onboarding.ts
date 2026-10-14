// First-run gesture guide. Buttons are real buttons, so they work with the mouse, a pinch-tap or a dwell.
import type { DrawMode } from '../tracking/gestures'

const cards = (mode: DrawMode): { art: string; title: string; body: string }[] => [
  { art: '✨', title: 'Welcome to Air Writing Pro', body: 'Draw in mid-air with one hand. Your webcam tracks your fingers, so you don’t need a touchscreen or a pen. The mouse works too.' },
  mode === 'pinch'
    ? { art: '🤏', title: 'Pinch to draw', body: 'Touch your thumb and index finger together to put the pen down. Open them to lift it. Pinch on any button to press it.' }
    : { art: '☝️', title: 'Point to draw', body: 'Raise only your index finger to draw. Switch to pinch mode in Settings for extra precision.' },
  { art: '✌️', title: 'Two fingers to select', body: 'Point with your index and middle fingers and hold over a button to press it. Hold still over the canvas to open the tool wheel.' },
  { art: '🤟', title: 'Three fingers erase · fist pauses', body: 'Raise your index, middle and ring fingers to erase. Make a fist to move your hand without drawing.' },
  { art: '🖐️', title: 'Open palm clears', body: 'Hold an open palm for a moment to clear the canvas (Ctrl+Z brings it back). Press Ctrl/⌘+Shift+A to draw over any app.' }
]

export function showOnboarding(root: HTMLElement, mode: DrawMode, onDone: () => void): void {
  const list = cards(mode)
  let i = 0
  const render = (): void => {
    const c = list[i]
    const last = i === list.length - 1
    root.innerHTML = `<div class="ob-card glass">
      <div class="ob-step"><div class="ob-art">${c.art}</div><div class="ob-title">${c.title}</div><div class="ob-body">${c.body}</div></div>
      <div class="ob-dots">${list.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
      <div class="ob-actions">
        <button class="pill-btn" data-ob="${i === 0 ? 'skip' : 'back'}">${i === 0 ? 'Skip' : 'Back'}</button>
        <button class="pill-btn primary" data-ob="${last ? 'done' : 'next'}">${last ? 'Start drawing' : 'Next'}</button>
      </div></div>`
  }
  const close = (): void => {
    root.classList.remove('open')
    root.removeEventListener('click', onClick)
    onDone()
  }
  const onClick = (e: Event): void => {
    const a = (e.target as Element).closest<HTMLElement>('[data-ob]')?.dataset.ob
    if (a === 'next') i++
    else if (a === 'back') i--
    else if (a === 'skip' || a === 'done') return close()
    else return
    render()
  }
  render()
  root.addEventListener('click', onClick)
  requestAnimationFrame(() => root.classList.add('open'))
}
