const root = (): HTMLElement => document.getElementById('toasts')!

export function toast(message: string, detail = '', kind: 'info' | 'error' = 'info', ms = 2600): void {
  const el = document.createElement('div')
  el.className = `toast glass ${kind}`
  el.textContent = message
  if (detail) {
    const s = document.createElement('small')
    s.textContent = detail
    el.append(s)
  }
  const r = root()
  r.append(el)
  while (r.children.length > 3) r.firstElementChild!.remove()
  setTimeout(() => {
    el.classList.add('out')
    el.addEventListener('animationend', () => el.remove(), { once: true })
  }, ms)
}
