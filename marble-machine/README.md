# Glass & Brass: one prompt, two models

Two sub-agents got the identical creative brief in [`PROMPT.md`](PROMPT.md) and each built a musical marble machine as a single self-contained HTML file (three.js from a CDN, all sound made with Web Audio).

| Build | Model | Page | Video |
|---|---|---|---|
| Brass "lantern": screw lift, 11 gated spiral tracks, Brahms' Lullaby | Opus 5.5, high effort | [`opus-5.5-high/index.html`](opus-5.5-high/index.html) | [`videos/opus-5.5-high.mp4`](videos/opus-5.5-high.mp4) |
| Spiral staircase of 32 bars, Frère Jacques as a four-voice round | Fable 5.2, medium effort | [`fable-5.2-medium/index.html`](fable-5.2-medium/index.html) | [`videos/fable-5.2-medium.mp4`](videos/fable-5.2-medium.mp4) |

[`videos/comparison.mp4`](videos/comparison.mp4) (85 s): title, each build solo with its own audio, then side by side with Opus in the left ear and Fable in the right.

Open either `index.html` in a desktop browser and click to start.

## How the videos were made

Headless Chromium renders WebGL in software at 1–5 s per frame, so the recorder ([`recording/record.cjs`](recording/record.cjs)) runs the page on a virtual clock. `requestAnimationFrame`, timers, `performance.now`, CSS animations and every `AudioContext` (swapped for an `OfflineAudioContext`) advance exactly 1/30 s per captured frame. The audio is rendered offline afterwards, so every note is sample-aligned with the frame where the marble strikes its bar. Each recording is 4 s of the still intro, a click, then 60 s of the performance at 1280×720.

[`recording/build_comparison.sh`](recording/build_comparison.sh) assembles the comparison video with ffmpeg.
