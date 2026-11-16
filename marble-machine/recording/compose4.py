#!/usr/bin/env python3
"""Four-way comparison video.

Opens on a 2x2 grid of all four builds, then zooms into each one in turn with
its review card and its own audio, zooms back out, and ends on the grid with
every score shown.

usage: compose4.py <reviews.json> <cards_dir> <out.mp4> [stills: t1,t2,...]
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

spec_path, cards_dir, out_path = sys.argv[1:4]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = json.load(open(spec_path))
boxes = json.load(open(os.path.join(cards_dir, 'boxes.json')))

W, H, FPS, SR = 1920, 1080, 30, 48000
SRC_W, SRC_H = 1280, 720
SRC_START = 4.0                     # the click happens 4 s into every recording
BG = (13, 12, 11)
GRID0, ZIN, HOLD, ZOUT, FINAL = 2.0, 1.1, 10.5, 1.0, 6.5
SEG = ZIN + HOLD + ZOUT
TOTAL = GRID0 + len(spec) * SEG + FINAL
N = int(round(TOTAL * FPS))

FONT = '/usr/share/fonts/opentype/inter/Inter-{}.otf'
f_name = ImageFont.truetype(FONT.format('SemiBold'), 26)
f_eff = ImageFont.truetype(FONT.format('Light'), 18)
f_score = ImageFont.truetype(FONT.format('SemiBold'), 40)
f_of = ImageFont.truetype(FONT.format('Light'), 20)

GAP = 24
CW, CH = (W - 3 * GAP) // 2, ((W - 3 * GAP) // 2) * 9 // 16
GY = (H - (2 * CH + GAP)) // 2
CELLS = [(GAP, GY), (2 * GAP + CW, GY), (GAP, GY + CH + GAP), (2 * GAP + CW, GY + CH + GAP)]
CELLS = [(x, y, CW, CH) for x, y in CELLS]
FW = 1300; FH = FW * 9 // 16
FOCUS = (48, (H - FH) // 2, FW, FH)
CARD_X = FOCUS[0] + FW + 40


def ease(t):
    t = min(1, max(0, t))
    return 4 * t ** 3 if t < .5 else 1 - (-2 * t + 2) ** 3 / 2


def smooth(t):
    t = min(1, max(0, t))
    return t * t * (3 - 2 * t)


def lerp_rect(a, b, z):
    return tuple(int(round(a[i] + (b[i] - a[i]) * z)) for i in range(4))


_masks = {}
def rmask(w, h, r):
    k = (w, h, r)
    if k not in _masks:
        m = Image.new('L', (w, h), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=255)
        _masks[k] = m
        if len(_masks) > 64:
            _masks.pop(next(iter(_masks)))
    return _masks[k]


def chip(m):
    """Name chip shown on each grid cell."""
    pad = 16
    w = int(max(f_name.getlength(m['name']), f_eff.getlength(m['effort']))) + pad * 2
    im = Image.new('RGBA', (w, 78), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, 77), 12, fill=(14, 12, 10, 190), outline=(221, 187, 119, 60))
    d.text((pad, 11), m['name'], font=f_name, fill=(245, 238, 226))
    d.text((pad, 46), m['effort'], font=f_eff, fill=(245, 238, 226, 160))
    return im


def badge(m, best):
    txt = f"{m['score']:.1f}"
    w = int(f_score.getlength(txt) + f_of.getlength(' / 10')) + 40
    im = Image.new('RGBA', (w, 66), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    fill = (244, 215, 156, 245) if best else (20, 17, 14, 225)
    ink = (28, 22, 14) if best else (244, 215, 156)
    d.rounded_rectangle((0, 0, w - 1, 65), 33, fill=fill, outline=(221, 187, 119, 120))
    d.text((20, 9), txt, font=f_score, fill=ink)
    d.text((20 + f_score.getlength(txt), 25), ' / 10', font=f_of, fill=ink + (200,) if not best else (60, 46, 26))
    return im


def with_alpha(im, a):
    if a >= 1:
        return im
    r = im.copy()
    r.putalpha(r.getchannel('A').point(lambda v: int(v * a)))
    return r


chips = [chip(m) for m in spec]
best_score = max(m['score'] for m in spec)
badges = [badge(m, m['score'] == best_score) for m in spec]
cards = [(Image.open(os.path.join(cards_dir, m['key'] + '.png')).convert('RGBA'),
          Image.open(os.path.join(cards_dir, m['key'] + '_bg.png')).convert('RGBA'),
          boxes[m['key']]) for m in spec]


def card_image(k, t_hold):
    """Card k with its rows faded in one after another."""
    full, bg, bx = cards[k]
    out = bg.copy()
    for i, (a, b) in enumerate(bx['rows']):
        r = smooth((t_hold - 0.35 - i * 0.55) / 0.45)
        if r <= 0:
            continue
        strip = full.crop((0, a, full.width, b))
        base = out.crop((0, a, out.width, b))
        out.paste(Image.blend(base, strip, r), (0, a))
    return out


def state(t):
    """(focused index or None, zoom 0..1, time into hold or None, phase)."""
    if t < GRID0:
        return None, 0, None, 'grid'
    u = t - GRID0
    k = int(u // SEG)
    if k >= len(spec):
        return None, 0, None, 'final'
    v = u - k * SEG
    if v < ZIN:
        return k, ease(v / ZIN), None, 'in'
    if v < ZIN + HOLD:
        return k, 1, v - ZIN, 'hold'
    return k, 1 - ease((v - ZIN - HOLD) / ZOUT), None, 'out'


def draw(t, frames):
    k, z, th, ph = state(t)
    canvas = Image.new('RGB', (W, H), BG)

    for i, (x, y, w, h) in enumerate(CELLS):
        if i == k:
            continue
        canvas.paste(frames[i].resize((w, h), Image.LANCZOS), (x, y), rmask(w, h, 14))
        cw = chips[i]
        canvas.paste(cw, (x + 16, y + h - cw.height - 16), cw)
        if ph == 'final':
            a = smooth((t - (TOTAL - FINAL) - 0.4 - i * 0.35) / 0.5)
            if a > 0:
                bd = with_alpha(badges[i], a)
                canvas.paste(bd, (x + w - bd.width - 18, y + 18), bd)
                if spec[i]['score'] == best_score:
                    ring = Image.new('RGBA', (w + 8, h + 8), (0, 0, 0, 0))
                    ImageDraw.Draw(ring).rounded_rectangle((0, 0, w + 7, h + 7), 18, outline=(244, 215, 156, int(255 * a)), width=3)
                    canvas.paste(ring, (x - 4, y - 4), ring)

    if k is not None:
        if z > 0:
            canvas = Image.blend(canvas, bgimg, z)
        x, y, w, h = lerp_rect(CELLS[k], FOCUS, z)
        canvas.paste(frames[k].resize((w, h), Image.LANCZOS), (x, y), rmask(w, h, int(14 + 4 * z)))
        if z < 1:
            cw = with_alpha(chips[k], 1 - z)
            canvas.paste(cw, (x + 16, y + h - cw.height - 16), cw)
        # the card: slides in at the start of the hold, fades out as the zoom reverses
        if ph == 'hold' or ph == 'out':
            if ph == 'hold':
                a = smooth(th / 0.5)
                card = card_image(k, th)
            else:
                a = z
                card = card_image(k, HOLD)
            if a > 0:
                card = with_alpha(card, a)
                cy = (H - card.height) // 2
                canvas.paste(card, (CARD_X + int(36 * (1 - a)), cy), card)

    fade = min(1, t / 0.5, (TOTAL - t) / 1.0)
    if fade < 1:
        canvas = Image.blend(black, canvas, max(0, fade))
    return canvas


black = Image.new('RGB', (W, H), (0, 0, 0))
bgimg = Image.new('RGB', (W, H), BG)
STILLS = [float(v) for v in sys.argv[4].split(',')] if len(sys.argv) > 4 else None
if STILLS:  # quick layout check: render a few moments as PNGs instead of the video
    for t in STILLS:
        frames = [Image.frombuffer('RGB', (SRC_W, SRC_H), subprocess.run(
            ['ffmpeg', '-loglevel', 'error', '-ss', str(SRC_START + t), '-i', os.path.join(ROOT, m['video']),
             '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout) for m in spec]
        draw(t, frames).save(out_path.replace('.mp4', f'_{t:05.1f}.png'))
    sys.exit(0)

# ---------- audio ----------
def load_audio(path):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-ss', str(SRC_START), '-i', path, '-t', str(TOTAL),
                          '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    a = np.frombuffer(raw, np.float32).reshape(-1, 2)
    n = int(TOTAL * SR)
    if len(a) < n:
        a = np.vstack([a, np.zeros((n - len(a), 2), np.float32)])
    return a[:n]


tracks = [load_audio(os.path.join(ROOT, m['video'])) for m in spec]
TARGET_RMS = 10 ** (-21 / 20)
for i, a in enumerate(tracks):
    rms = np.sqrt(np.mean(a[int(4 * SR):] ** 2))
    tracks[i] = a * (TARGET_RMS / max(rms, 1e-6))
    print(f"{spec[i]['key']}: rms {20 * np.log10(rms):.1f} dBFS, gain {20 * np.log10(TARGET_RMS / rms):+.1f} dB")

GRID_GAIN = 0.42
times = np.arange(0, TOTAL, 0.01)
gains = np.zeros((len(spec), len(times)))
for j, t in enumerate(times):
    k, z, _, ph = state(t)
    for i in range(len(spec)):
        if ph == 'grid':
            g = GRID_GAIN
        elif ph == 'final':
            g = GRID_GAIN * min(1, (TOTAL - t) / 2.0)
        else:
            g = GRID_GAIN + (1 - GRID_GAIN) * z if i == k else GRID_GAIN * (1 - z)
        gains[i, j] = g
ts = np.arange(int(TOTAL * SR)) / SR
mix = np.zeros_like(tracks[0])
for i, a in enumerate(tracks):
    mix += a * np.interp(ts, times, gains[i])[:, None]
mix *= np.clip(ts / 0.5, 0, 1)[:, None]
over = np.abs(mix) > 0.85                      # gentle soft clip above -1.4 dBFS
mix[over] = np.sign(mix[over]) * (0.85 + 0.15 * np.tanh((np.abs(mix[over]) - 0.85) / 0.15))
wav = out_path.replace('.mp4', '.wav')
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', wav],
               input=mix.astype(np.float32).tobytes(), check=True)
print('audio peak', float(np.abs(mix).max()))

# ---------- video ----------
decoders = [subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-ss', str(SRC_START), '-i', os.path.join(ROOT, m['video']),
                              '-t', str(TOTAL + 1), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
            for m in spec]
enc = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                        '-r', str(FPS), '-i', '-', '-i', wav, '-map', '0:v', '-map', '1:a',
                        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
                        '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out_path],
                       stdin=subprocess.PIPE)
FS = SRC_W * SRC_H * 3
last = [None] * len(spec)

for f in range(N):
    t = f / FPS
    frames = []
    for i, d in enumerate(decoders):
        b = d.stdout.read(FS)
        if len(b) == FS:
            last[i] = Image.frombuffer('RGB', (SRC_W, SRC_H), b)
        frames.append(last[i])
    enc.stdin.write(draw(t, frames).tobytes())
    if f % 150 == 0:
        print(f'frame {f}/{N}', flush=True)

enc.stdin.close()
enc.wait()
for d in decoders:
    d.kill()
os.remove(wav)
print('wrote', out_path, f'{TOTAL:.1f}s')
