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

const initScript = ({ maxSec, sr }) => {
  let vt = 0;
  const base = Date.now();
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
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(initScript, { maxSec: TOTAL + 15, sr: SR });
  await page.goto('file://' + path.resolve(htmlPath), { waitUntil: 'load' });
  await page.waitForTimeout(1500); // let CDN modules finish (real time; the virtual clock is paused)

  const cdp = await page.context().newCDPSession(page);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', tmp + '.video.mp4'], { stdio: ['pipe', 'inherit', 'inherit'] });

  const dt = 1000 / FPS, n = Math.round(TOTAL * FPS), clickAt = Math.round(PRE * FPS);
  const t0 = Date.now();
  let lastReal = Date.now();
  for (let i = 0; i < n; i++) {
    if (i === clickAt) { await page.mouse.click(W / 2, H / 2); await page.evaluate(() => document.body.click()).catch(() => {}); }
    await page.evaluate((d) => window.__vt.step(d), dt);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93 });
    if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    const now = Date.now(), real = now - lastReal; lastReal = now;
    if (i % (FPS * 5) === 0) console.log(`[${path.basename(outPath)}] frame ${i}/${n}  ${(real).toFixed(0)}ms/frame  elapsed ${((now - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));

  const info = await page.evaluate((s) => window.__vt.renderAudio(s), TOTAL);
  console.log('audio', info, 'contexts', await page.evaluate(() => window.__vt.contexts()));
  const chunks = [], CH = 4 << 20;
  for (let o = 0; o < info.bytes; o += CH) chunks.push(Buffer.from(await page.evaluate(([a, b]) => window.__vt.wavChunk(a, b), [o, CH]), 'base64'));
  fs.writeFileSync(tmp + '.wav', Buffer.concat(chunks));
  await browser.close();

  await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp + '.video.mp4', '-i', tmp + '.wav',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', outPath], { stdio: 'inherit' }).on('close', (c) => (c ? rej(c) : res())));
  fs.unlinkSync(tmp + '.video.mp4');
  console.log('done', outPath, 'errors:', errors.slice(0, 10));
})();
