#!/usr/bin/env python3
"""List the notes in a recording: onset time and pitch of each struck bar.

usage: notes.py <video.mp4> [start_s] [end_s]
"""
import subprocess, sys
import numpy as np

path = sys.argv[1]
t0 = float(sys.argv[2]) if len(sys.argv) > 2 else 0
t1 = float(sys.argv[3]) if len(sys.argv) > 3 else 1e9
SR = 24000
raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                     capture_output=True, check=True).stdout
x = np.frombuffer(raw, np.float32)
hop, win = 240, 4096
names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

def note(f):
    m = 69 + 12 * np.log2(f / 440)
    k = int(round(m))
    return f"{names[k % 12]}{k // 12 - 1}", m - k

# spectral flux onset detection (100 Hz frames)
n = len(x) // hop - win // hop
w = np.hanning(1024)
prev = None
flux = np.zeros(n)
for i in range(n):
    s = np.abs(np.fft.rfft(x[i * hop:i * hop + 1024] * w))
    if prev is not None:
        flux[i] = np.sum(np.maximum(s - prev, 0))
    prev = s
thr = np.median(flux) + 4 * np.std(flux) * 0.25
onsets = []
for i in range(2, n - 2):
    if flux[i] > thr and flux[i] == flux[i - 2:i + 3].max() and (not onsets or i - onsets[-1] > 6):
        onsets.append(i)

out = []
for i in onsets:
    t = i * hop / SR
    if not (t0 <= t <= t1):
        continue
    a = i * hop + int(0.03 * SR)
    seg = x[a:a + win]
    if len(seg) < win:
        continue
    spec = np.abs(np.fft.rfft(seg * np.hanning(win)))
    fr = np.fft.rfftfreq(win, 1 / SR)
    band = (fr > 90) & (fr < 1400)
    k = np.argmax(spec * band)
    # parabolic interpolation for a finer pitch estimate
    if 0 < k < len(spec) - 1:
        y0, y1, y2 = np.log(spec[k - 1:k + 2] + 1e-12)
        k = k + 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2)
    f = k * SR / win
    nm, cents = note(f)
    out.append((t, nm, f, cents * 100))
for t, nm, f, c in out:
    print(f"{t:6.2f}s  {nm:4s} {f:7.1f} Hz  {c:+4.0f}c")
print(f"# {len(out)} notes")
