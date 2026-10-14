# Air Writing Pro

Draw in mid-air with one hand. Your webcam tracks your fingers; the app renders at your display's refresh rate (120Hz+ where available) with a frosted-glass UI. Works on Windows and macOS, fully offline.

## Run it (no install)

- **Windows:** double-click `AirWritingPro-2.0.0-portable.exe`. Nothing to install. The first launch takes a few seconds while it unpacks.
- **macOS:** unzip `AirWritingPro-2.0.0-mac-universal.zip`, then right-click **Air Writing Pro.app** → **Open**. Right-click is only needed the first time, because the app isn't notarized yet. Allow camera access when asked.

## Gestures

| Gesture | Action |
|---|---|
| 🤏 Pinch thumb + index | Draw. Pinch on a button to press it. |
| ☝ Index finger only | Move the cursor. Draws in *Point* mode (Settings). |
| ✌ Index + middle | Select. Hold on a button to press it; hold still on the canvas for the tool wheel. |
| 🤟 Index + middle + ring | Erase |
| ✊ Fist | Pause |
| 🖐 Open palm, hold | Clear the canvas (Ctrl/⌘+Z brings it back) |

Mouse and pen tablets work too: left button draws, right button erases.

**Ctrl/⌘+Shift+A** toggles overlay mode, which lets you draw over any app or slide deck.

## Features

- **Tools:** pen, marker, highlighter, neon, laser pointer, eraser; line, arrow, rectangle, ellipse, triangle.
- **QuickShape:** finish a stroke and hold still to snap it to a clean line, circle, rectangle or triangle.
- **History:** unlimited undo/redo.
- **Backgrounds:** camera, blurred camera, dimmed camera, whiteboard, blackboard.
- **Export:** PNG (transparent or board), SVG (vector), `.airboard` project files and WebM screen recording.

## Precision and smoothness

- **Lock video to tracking** (on by default): shows exactly the camera frame the hand was found in, so ink sits on your fingertip in every frame.
- **Hand tracking:** MediaPipe in a background worker. It benchmarks GPU against CPU on first start and keeps the faster one.
- **Gestures:** read from MediaPipe's 3D landmarks, so tilting or bending your hand doesn't break a pinch. A pinch that flickers open briefly doesn't break the stroke.
- **Strokes:** each stroke is a spline through filtered samples (One Euro filter), drawn with pressure-style ink.
- **Tuning:** the HUD (press **F**) shows render fps, tracking Hz, latency and model time. Tune Steadiness, Responsiveness, Prediction, Reach and Pinch sensitivity in Settings.

## Develop

```bash
npm install          # also copies MediaPipe WASM + downloads the hand model
npm run dev          # run with hot reload
npm test             # unit tests (gestures, filter, shapes, scene, SVG)
npm run typecheck
npm run build:win    # → dist/AirWritingPro-<version>-portable.exe
npm run build:mac    # → dist/AirWritingPro-<version>-mac-universal.zip (must run on a Mac)
```

If `npm install` skipped install scripts, run `node node_modules/electron/install.js && node scripts/setup-assets.mjs`.

No Mac? Push a `v*` tag to GitHub. `.github/workflows/build.yml` builds both the `.exe` and the Mac `.zip` on free GitHub runners.
