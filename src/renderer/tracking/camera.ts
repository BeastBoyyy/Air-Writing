// Webcam capture. Frames are pulled straight off the track (MediaStreamTrackProcessor), so tracking
// doesn't depend on the <video> element being visible or composited.

declare class MediaStreamTrackProcessor {
  constructor(init: { track: MediaStreamTrack; maxBufferSize?: number })
  readable: ReadableStream<VideoFrame>
}

export interface CameraOptions {
  deviceId: string
  width: number
  height: number
  fps: number
}

export class Camera {
  stream: MediaStream | null = null
  private gen = 0

  constructor(private video: HTMLVideoElement) {}

  static async devices(): Promise<MediaDeviceInfo[]> {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput')
  }

  async start(o: CameraOptions, onFrame: (f: VideoFrame, ts: number) => void): Promise<void> {
    this.stop()
    const gen = ++this.gen
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: o.deviceId ? { exact: o.deviceId } : undefined,
        width: { ideal: o.width },
        height: { ideal: o.height },
        frameRate: { ideal: o.fps }
      }
    })
    if (gen !== this.gen) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    this.stream = stream
    this.video.srcObject = stream
    await this.video.play().catch(() => {})
    const track = stream.getVideoTracks()[0]

    if (typeof MediaStreamTrackProcessor !== 'undefined') {
      const reader = new MediaStreamTrackProcessor({ track, maxBufferSize: 1 }).readable.getReader()
      void (async () => {
        while (gen === this.gen) {
          const { value, done } = await reader.read()
          if (done || !value) break
          if (gen !== this.gen) {
            value.close()
            break
          }
          onFrame(value, performance.now())
        }
        reader.cancel().catch(() => {})
      })()
    } else {
      // Fallback: one VideoFrame per presented video frame.
      const pump = (): void => {
        if (gen !== this.gen) return
        if (this.video.readyState >= 2) onFrame(new VideoFrame(this.video), performance.now())
        this.video.requestVideoFrameCallback(pump)
      }
      this.video.requestVideoFrameCallback(pump)
    }
  }

  get info(): { width: number; height: number; fps: number } | null {
    const s = this.stream?.getVideoTracks()[0]?.getSettings()
    return s ? { width: s.width ?? 0, height: s.height ?? 0, fps: Math.round(s.frameRate ?? 0) } : null
  }

  stop(): void {
    this.gen++
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }
}
