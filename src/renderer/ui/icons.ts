// Stroke icons on a 24×24 grid, drawn for this app.
const P: Record<string, string> = {
  pen: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>',
  marker: '<path d="M14.5 4.5l5 5L11 18H6v-5z"/><path d="M6 18l-2.5 2.5"/><path d="M12 7l5 5"/>',
  highlighter: '<path d="M8.5 13.5L5 17v2.5h5l3.5-3.5"/><path d="M8 12.5L15.5 4l5 5L12 16.5z"/><path d="M14 21h7"/>',
  neon: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16v4M17 18h4"/>',
  laser: '<circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.7 5.7l2.1 2.1M16.2 16.2l2.1 2.1M5.7 18.3l2.1-2.1M16.2 7.8l2.1-2.1"/>',
  eraser: '<path d="M8 20h12"/><path d="M4.8 14.6l9.4-9.4a2 2 0 0 1 2.8 0l2.8 2.8a2 2 0 0 1 0 2.8L12 18.6a2 2 0 0 1-1.4.6H8.4a2 2 0 0 1-1.4-.6l-2.2-2.2a1.8 1.8 0 0 1 0-1.8z"/><path d="M9.5 10l5 5"/>',
  line: '<path d="M5 19L19 5"/>',
  arrow: '<path d="M5 19L19 5"/><path d="M9 5h10v10"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
  triangle: '<path d="M12 4.5l8.5 15h-17z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  background: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-10 9"/>',
  record: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" stroke="none"/>',
  export: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  settings: '<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.3"/><circle cx="9.5" cy="17" r="2.3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7"/><path d="M12 17.2h.01"/>',
  overlay: '<rect x="3" y="4" width="18" height="13" rx="2.5"/><path d="M8.5 21h7M12 17v4"/><path d="M7 13.5c2-3.5 4-1 5-3s3-2.5 5-1"/>',
  minimize: '<path d="M6 12h12"/>',
  maximize: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  close: '<path d="M7 7l10 10M17 7L7 17"/>',
  open: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  save: '<path d="M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z"/><path d="M7.5 3.5v4.5h8V3.5M7 20.5v-6.5h10v6.5"/>',
  minus: '<path d="M6 12h12"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.5-1.9-.4-1.3.5-2.6 1.9-2.6h1.7a3.4 3.4 0 0 0 3.4-3.4C20.5 7.6 16.7 3.5 12 3.5z"/><circle cx="7.8" cy="11" r="1.1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor"/><circle cx="14.8" cy="7.8" r="1.1" fill="currentColor"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M3.5 15l4.5-4 4 3.5 3-2.5 5 4"/>',
  vector: '<path d="M4 18c4-1 6-12 16-12"/><rect x="2.5" y="16.5" width="3" height="3" rx=".6"/><rect x="18.5" y="4.5" width="3" height="3" rx=".6"/>'
}

export function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`
}

/** Fill every [data-icon] element under root with its SVG. */
export function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon!))
  })
}
