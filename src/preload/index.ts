import { contextBridge, ipcRenderer } from 'electron'

type Filter = { name: string; extensions: string[] }

const api = {
  platform: process.platform,
  saveFile: (name: string, filters: Filter[], data: string | ArrayBuffer): Promise<string | null> =>
    ipcRenderer.invoke('file:save', { name, filters, data }),
  openFile: (filters: Filter[]): Promise<string | null> => ipcRenderer.invoke('file:open', filters),
  win: (action: 'minimize' | 'maximize' | 'fullscreen' | 'close' | 'overlay') => ipcRenderer.send('win', action),
  onOverlay: (cb: (on: boolean) => void) => ipcRenderer.on('overlay', (_e, on: boolean) => cb(on)),
  onWinState: (cb: (s: { maximized: boolean }) => void) => ipcRenderer.on('win:state', (_e, s) => cb(s))
}

export type Api = typeof api
contextBridge.exposeInMainWorld('api', api)
