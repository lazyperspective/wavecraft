#!/usr/bin/env node
// Deterministic A/V recorder for a WebGL + Web Audio page.
//
// Headless Chromium renders WebGL in software, far slower than real time, so a
// live screen capture would stutter. Instead this script takes over the page's
// clock: requestAnimationFrame, timers, performance.now and Date.now all run on
// a virtual clock that advances exactly one frame per captured screenshot.
// Every AudioContext is swapped for an OfflineAudioContext whose currentTime
// follows the same virtual clock, so all notes the page schedules land at the
// right moment. Afterwards the audio is rendered offline and muxed with the frames.
//
// usage: node record.cjs <page.html> <out.mp4> [--pre 3] [--dur 60] [--fps 30] [--w 1280] [--h 720]
//        add --from F --to T to record only frames [F,T) (earlier frames are fast-forwarded without drawing)
//        add --wheel "3:15:2500,20:32:-2500" to scroll with the mouse wheel; --no-click to skip the start click
//        add --hz 60 to give the page a 60 Hz animation clock while capturing at --fps
//        add --audio-only <existing.mp4> to re-render just the sound (draw calls stubbed) onto existing frames

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? Number(argv[i + 1]) : d; };
const [htmlPath, outPath] = argv;
const PRE = opt('pre', 3), DUR = opt('dur', 60), FPS = opt('fps', 30), W = opt('w', 1280), H = opt('h', 720);
const TOTAL = PRE + DUR;
const SR = 48000;
const FROM = opt('from', 0); const TO_ARG = opt('to', 0); // chunked recording: frames [from, to); no mux, keeps .video.mp4 + .wav
// --wheel "t0:t1:px,..." sends px of mouse-wheel scrolling (negative = up) between t0 and t1 seconds,
// eased in and out, with the pointer at the viewport centre. --no-click skips the start click.
const wi = argv.indexOf('--wheel');
const WHEEL = wi >= 0 ? argv[wi + 1].split(',').map((g) => g.split(':').map(Number)) : [];
const NO_CLICK = argv.includes('--no-click');
// --hz 60: the page sees a 60 Hz display (two animation steps per captured frame; the
// in-between step skips its draw calls), so pages that adapt quality to frame time aren't misled
const HZ = opt('hz', 0);
const ai = argv.indexOf('--audio-only'); const AUDIO_ONLY = ai >= 0 ? argv[ai + 1] : null; // existing silent/old video to re-mux

const initScript = ({ maxSec, sr, audioOnly }) => {
  let vt = 0;
  const base = 1767225600000; // fixed epoch: identical runs
  let seed = 0x9e3779b9; // mulberry32: identical randomness in every run
  Math.random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  performance.now = () => vt;
  Date.now = () => base + vt;

  let rafQ = [], nextId = 1;
  window.requestAnimationFrame = (cb) => { const id = nextId++; rafQ.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { rafQ = rafQ.filter((r) => r.id !== id); };

  const timers = new Map();
  const addTimer = (cb, ms, args, interval) => {
    const id = nextId++;
    if (typeof cb !== 'function') return id;
    const d = Math.max(0, Number(ms) || 0);
    timers.set(id, { t: vt + d, cb, args, interval: interval ? Math.max(1, d) : 0 });
    return id;
  };
  window.setTimeout = (cb, ms, ...args) => addTimer(cb, ms, args, false);
  window.setInterval = (cb, ms, ...args) => addTimer(cb, ms, args, true);
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);

  const ctxs = [];
  // An offline context applies every graph change before rendering starts, so a
  // node disconnected after its note ends would be silent for the whole render.
  // Keep everything connected; finished sources simply output silence.
  AudioNode.prototype.disconnect = function () {};
  // while fast-forwarding (audio-only, before a chunk's first frame, or between --hz sub-steps) skip on-screen draws
  let drawOn = !audioOnly;
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext])
    for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) {
      const orig = C.prototype[m];
      // offscreen passes (render targets, shadow maps, baked textures) always run, since pages
      // may cache them across frames; only the final on-screen draw is skipped
      if (orig) C.prototype[m] = function (...a) {
        if (drawOn || (!audioOnly && this.getParameter(this.FRAMEBUFFER_BINDING) !== null)) return orig.apply(this, a);
      };
    }
  const animStart = new WeakMap();
  function FakeAudioContext() {
    const c = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil(sr * maxSec), sampleRate: sr });
    const t0 = vt;
    Object.defineProperty(c, 'currentTime', { get: () => Math.max(0, (vt - t0) / 1000) });
    Object.defineProperty(c, 'state', { get: () => 'running' });
    c.resume = () => Promise.resolve();
    c.suspend = () => Promise.resolve();
    c.close = () => Promise.resolve();
    c.baseLatency = 0; c.outputLatency = 0;
    c.getOutputTimestamp = () => ({ contextTime: (vt - t0) / 1000, performanceTime: vt });
    c.createMediaStreamDestination = () => { const g = c.createGain(); g.stream = new MediaStream(); return g; };
    ctxs.push({ c, t0 });
    return c;
  }
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;

  window.__vt = {
    step(dt) {
      const target = vt + dt;
      for (;;) {
        let best = null;
        for (const [id, tm] of timers) if (tm.t <= target && (!best || tm.t < best[1].t)) best = [id, tm];
        if (!best) break;
        const [id, tm] = best;
        vt = Math.max(vt, tm.t);
        if (tm.interval) tm.t += tm.interval; else timers.delete(id);
        try { tm.cb(...tm.args); } catch (e) { console.error(e); }
      }
      vt = target;
      const q = rafQ; rafQ = [];
      for (const r of q) { try { r.cb(vt); } catch (e) { console.error(e); } }
      // CSS transitions/animations follow the virtual clock too
      for (const a of document.getAnimations()) {
        let s = animStart.get(a);
        if (s === undefined) { s = vt - dt; animStart.set(a, s); a.pause(); }
        a.currentTime = Math.max(0, vt - s);
      }
    },
    now: () => vt,
    setDraw(on) { drawOn = on; },
    contexts: () => ctxs.length,
    async renderAudio(totalSec) {
      const len = Math.ceil(totalSec * sr);
      const L = new Float32Array(len), R = new Float32Array(len);
      for (const { c, t0 } of ctxs) {
        const buf = await c.startRendering();
        const off = Math.round((t0 / 1000) * sr);
        const l = buf.getChannelData(0), r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
        for (let i = 0; i < l.length && i + off < len; i++) { L[i + off] += l[i]; R[i + off] += r[i]; }
      }
      // 16-bit PCM WAV
      const ab = new ArrayBuffer(44 + len * 4), dv = new DataView(ab);
      const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      ws(0, 'RIFF'); dv.setUint32(4, 36 + len * 4, true); ws(8, 'WAVE'); ws(12, 'fmt ');
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
      dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true);
      ws(36, 'data'); dv.setUint32(40, len * 4, true);
      let peak = 0;
      for (let i = 0; i < len; i++) {
        peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
        dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
        dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
      }
      window.__wav = new Uint8Array(ab);
      return { bytes: ab.byteLength, peak };
    },
    wavChunk(start, size) {
      const u = window.__wav.subarray(start, start + size);
      let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return btoa(s);
    },
  };
};

(async () => {
  const tmp = outPath.replace(/\.mp4$/, '');
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-smooth-scrolling'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(initScript, { maxSec: TOTAL + 15, sr: SR, audioOnly: !!AUDIO_ONLY });
  await page.goto('file://' + path.resolve(htmlPath), { waitUntil: 'load' });
  await page.waitForTimeout(1500); // let CDN modules finish (real time; the virtual clock is paused)

  const cdp = await page.context().newCDPSession(page);
  if (AUDIO_ONLY) fs.copyFileSync(AUDIO_ONLY, tmp + '.src.mp4');
  const ff = AUDIO_ONLY ? null : spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', tmp + '.video.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });

  const dt = 1000 / FPS, n = TO_ARG || Math.round(TOTAL * FPS), clickAt = Math.round(PRE * FPS);
  const CHUNK = FROM > 0 || TO_ARG > 0;
  if (FROM > 0) await page.evaluate(() => window.__vt.setDraw(false));
  const t0 = Date.now();
  let lastReal = Date.now();
  await page.mouse.move(W / 2, H / 2);
  const easeW = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  let wheelCarry = 0;
  for (let i = 0; i < n; i++) {
    if (WHEEL.length) {
      const a = (i * dt) / 1000, b = ((i + 1) * dt) / 1000;
      for (const [t0, t1, px] of WHEEL) wheelCarry += px * (easeW((b - t0) / (t1 - t0)) - easeW((a - t0) / (t1 - t0)));
      const d = Math.trunc(wheelCarry);
      if (d) { wheelCarry -= d; await page.mouse.wheel(0, d); }
    }
    if (i === clickAt && !NO_CLICK) { await page.mouse.click(W / 2, H / 2); await page.evaluate(() => document.body.click()).catch(() => {}); }
    if (FROM > 0 && i === FROM - 1 && !AUDIO_ONLY) await page.evaluate(() => window.__vt.setDraw(true)); // draw the frame before, so effects with history (trails, bloom) are warm
    if (HZ > FPS && i >= FROM) {
      const sub = Math.round(HZ / FPS);
      await page.evaluate(([d, k]) => { window.__vt.setDraw(false); for (let j = 0; j < k - 1; j++) window.__vt.step(d / k); window.__vt.setDraw(true); window.__vt.step(d / k); }, [dt, sub]);
    } else if (HZ > FPS) {
      const sub = Math.round(HZ / FPS);
      await page.evaluate(([d, k]) => { for (let j = 0; j < k; j++) window.__vt.step(d / k); }, [dt, sub]);
    } else await page.evaluate((d) => window.__vt.step(d), dt);
    if (ff && i >= FROM) {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93 });
      if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    }
    const now = Date.now(), real = now - lastReal; lastReal = now;
    if (i % (FPS * 5) === 0) console.log(`[${path.basename(outPath)}] frame ${i}/${n}  ${(real).toFixed(0)}ms/frame  elapsed ${((now - t0) / 1000).toFixed(0)}s`);
  }
  if (ff) { ff.stdin.end(); await new Promise((r) => ff.on('close', r)); }
  else fs.renameSync(tmp + '.src.mp4', tmp + '.video.mp4');

  const info = await page.evaluate((s) => window.__vt.renderAudio(s), TOTAL);
  console.log('audio', info, 'contexts', await page.evaluate(() => window.__vt.contexts()));
  const chunks = [], CH = 4 << 20;
  for (let o = 0; o < info.bytes; o += CH) chunks.push(Buffer.from(await page.evaluate(([a, b]) => window.__vt.wavChunk(a, b), [o, CH]), 'base64'));
  fs.writeFileSync(tmp + '.wav', Buffer.concat(chunks));
  await browser.close();
  if (CHUNK) { console.log('chunk done', tmp + '.video.mp4', tmp + '.wav', 'errors:', errors.slice(0, 10)); return; }

  await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp + '.video.mp4', '-i', tmp + '.wav',
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', outPath], { stdio: 'inherit' }).on('close', (c) => (c ? rej(c) : res())));
  fs.unlinkSync(tmp + '.video.mp4');
  console.log('done', outPath, 'errors:', errors.slice(0, 10));
})();
