import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    // Module worker in dev and build alike; MediaPipe loads its ES-module WASM build there.
    worker: { format: 'es' },
    build: { target: 'esnext' }
  }
})
