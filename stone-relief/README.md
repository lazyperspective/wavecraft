# Two Faces in Stone

One brief ([PROMPT.md](PROMPT.md)), given word for word to two models:

| Build | Model | Recording |
|---|---|---|
| [opus-5.5-high/index.html](opus-5.5-high/index.html) | Opus 5.5, high effort | [videos/opus-5.5-high.mp4](videos/opus-5.5-high.mp4) |
| [fable-5.2-medium/index.html](fable-5.2-medium/index.html) | Fable 5.2, medium effort | [videos/fable-5.2-medium.mp4](videos/fable-5.2-medium.mp4) |

[videos/comparison.mp4](videos/comparison.mp4) (1 min 47 s) shows each one alone for 32 s, then both
side by side over the same 30 s of scrolling.

Both recordings run the same 45 s scroll script: down to the second face (3–15 s), back up to the
first (20–32 s), then half way down again (37–43 s). They were captured with
`../marble-machine/recording/record.cjs` in headless Chromium with software WebGL and a virtual
clock, so the motion is smooth even though each Opus frame took about 25 s to render.
