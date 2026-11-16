# Glass & Brass: one prompt, two models

Two sub-agents got the identical creative brief in [`PROMPT.md`](PROMPT.md) and each built a musical marble machine as a single self-contained HTML file (three.js from a CDN, all sound made with Web Audio).

| Build | Model | Page | Video |
|---|---|---|---|
| Brass "lantern": screw lift, 11 gated spiral tracks, Brahms' Lullaby | Opus 5.5, high effort | [`opus-5.5-high/index.html`](opus-5.5-high/index.html) | [`videos/opus-5.5-high.mp4`](videos/opus-5.5-high.mp4) |
| Spiral staircase of 32 bars, Frère Jacques as a four-voice round | Fable 5.2, medium effort | [`fable-5.2-medium/index.html`](fable-5.2-medium/index.html) | [`videos/fable-5.2-medium.mp4`](videos/fable-5.2-medium.mp4) |

[`videos/comparison.mp4`](videos/comparison.mp4) (85 s): title, each build solo with its own audio, then side by side with Opus in the left ear and Fable in the right.

Open either `index.html` in a desktop browser and click to start.

## Four-way comparison

Two more builds from the same brief were added later: Sol 6.1 (high) in [`sol-6.1-high/`](sol-6.1-high/index.html) and Gemini Hydrogen in [`gemini-hydrogen/`](gemini-hydrogen/index.html). Each has its own recording in `videos/`.

[`videos/comparison-4way.mp4`](videos/comparison-4way.mp4) (59 s) opens on all four in a 2×2 grid, zooms into each in turn with its own audio and a review card, and ends on the grid with every score.

| Model | Tune | Score |
|---|---|---|
| Fable 5.2 (medium) | Frère Jacques, as a round | 8.5 |
| Opus 5.5 (high) | Brahms' Lullaby, with bass | 8.0 |
| Gemini Hydrogen | Brahms' Lullaby | 7.0 |
| Sol 6.1 (high) | Ode to Joy | 6.5 |

The ranking above is the project owner's. The comments on each card in [`recording/reviews.json`](recording/reviews.json) were written by Claude Opus 5.5, which is also one of the four contestants. They rest on frames from across each recording and on the notes detected in each soundtrack ([`recording/notes.py`](recording/notes.py)). Volumes were evened out so no build sounds better just for being louder.

## How the videos were made

Headless Chromium renders WebGL in software at 1–5 s per frame, so the recorder ([`recording/record.cjs`](recording/record.cjs)) runs the page on a virtual clock. `requestAnimationFrame`, timers, `performance.now`, CSS animations and every `AudioContext` (swapped for an `OfflineAudioContext`) advance exactly 1/30 s per captured frame. The audio is rendered offline afterwards, so every note is sample-aligned with the frame where the marble strikes its bar. Each recording is 4 s of the still intro, a click, then 60 s of the performance at 1280×720.

[`recording/build_comparison.sh`](recording/build_comparison.sh) assembles the comparison video with ffmpeg.
