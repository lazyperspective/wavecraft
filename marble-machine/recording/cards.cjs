#!/usr/bin/env node
// Renders the review cards for the 4-way comparison as transparent PNGs, plus
// the bounding box of each row so the compositor can reveal rows one by one.
// usage: node cards.cjs <reviews.json> <outdir>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [specPath, outDir] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const css = `
  html, body { margin: 0; background: transparent; }
  .card { width: 492px; box-sizing: border-box; padding: 34px 36px 30px; border-radius: 22px;
    background: linear-gradient(160deg, rgba(38,32,26,.97), rgba(22,19,16,.97));
    border: 1px solid rgba(221,187,119,.26); box-shadow: inset 0 1px 0 rgba(255,240,210,.06);
    color: #f1e8d8; font-family: Inter; font-weight: 400; }
  .eyebrow { font-family: Inter; font-weight: 500; font-size: 13px; letter-spacing: 3px; color: #c9a46a; text-transform: uppercase; }
  .name { font-family: Inter; font-weight: 600; font-size: 46px; letter-spacing: -1px; margin: 10px 0 2px; }
  .effort { font-family: Inter; font-weight: 300; font-size: 19px; color: rgba(241,232,216,.62); }
  .scoreRow { display: flex; align-items: flex-end; gap: 18px; margin: 26px 0 8px; }
  .score { font-family: Inter; font-weight: 600; font-size: 84px; line-height: .8; letter-spacing: -3px; color: #f4d79c; }
  .of { font-family: Inter; font-weight: 300; font-size: 24px; color: rgba(241,232,216,.5); padding-bottom: 2px; }
  .meter { height: 5px; border-radius: 3px; background: rgba(241,232,216,.1); margin: 18px 0 6px; overflow: hidden; }
  .meter i { display: block; height: 100%; border-radius: 3px; background: linear-gradient(90deg, #a8803f, #f4d79c); }
  .tune { font-family: Inter; font-weight: 300; font-size: 16px; color: rgba(241,232,216,.6); margin-top: 12px; }
  .tune b { font-family: Inter; font-weight: 500; font-weight: normal; color: rgba(241,232,216,.88); }
  .rows { margin-top: 22px; border-top: 1px solid rgba(221,187,119,.16); }
  .row { padding: 15px 0 14px; border-bottom: 1px solid rgba(221,187,119,.1); display: grid; grid-template-columns: 26px 1fr; gap: 6px 10px; }
  .row:last-child { border-bottom: 0; padding-bottom: 0; }
  .mark { font-family: Inter; font-weight: 600; font-size: 17px; line-height: 25px; text-align: center; border-radius: 50%; width: 24px; height: 24px; margin-top: 1px; }
  .mark.good { color: #9fd3a3; background: rgba(120,190,125,.14); }
  .mark.bad { color: #e9a58f; background: rgba(230,140,110,.14); }
  .mark.mid { color: #e8cf8f; background: rgba(230,200,120,.13); }
  .text { font-size: 19px; line-height: 1.42; color: rgba(241,232,216,.9); }
  .label { font-family: Inter; font-weight: 500; font-size: 12px; letter-spacing: 2.2px; text-transform: uppercase; color: rgba(241,232,216,.45); display: block; margin-bottom: 3px; }
`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 600, height: 1000 }, deviceScaleFactor: 1 });
  const boxes = {};
  for (const m of spec) {
    const sym = { good: '+', bad: '–', mid: '~' };
    const html = `<!doctype html><html><head><meta charset=utf-8><style>${css}</style></head><body>
      <div class="card" id="card">
        <div class="row0" data-row="head">
          <div class="eyebrow">${esc(m.eyebrow)}</div>
          <div class="name">${esc(m.name)}</div>
          <div class="effort">${esc(m.effort)}</div>
        </div>
        <div data-row="score">
          <div class="scoreRow"><div class="score">${m.score.toFixed(1)}</div><div class="of">/ 10</div></div>
          <div class="meter"><i style="width:${m.score * 10}%"></i></div>
          <div class="tune">Plays <b>${esc(m.tune)}</b></div>
        </div>
        <div class="rows">
          ${m.notes.map((n) => `<div class="row" data-row="note"><div class="mark ${n.kind}">${sym[n.kind]}</div><div class="text"><span class="label">${esc(n.label)}</span>${esc(n.text)}</div></div>`).join('')}
        </div>
      </div></body></html>`;
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const card = await page.$('#card');
    const cb = await card.boundingBox();
    const rows = await page.$$eval('[data-row]', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.top, r.bottom]; }));
    await card.screenshot({ path: path.join(outDir, m.key + '.png'), omitBackground: true });
    // the same card with its rows hidden: the compositor fades each row in over this
    await page.addStyleTag({ content: '[data-row]{visibility:hidden}' });
    await card.screenshot({ path: path.join(outDir, m.key + '_bg.png'), omitBackground: true });
    boxes[m.key] = { w: Math.round(cb.width), h: Math.round(cb.height), rows: rows.map(([a, b]) => [Math.max(0, Math.floor(a - cb.y)), Math.ceil(b - cb.y)]) };
  }
  fs.writeFileSync(path.join(outDir, 'boxes.json'), JSON.stringify(boxes, null, 1));
  await browser.close();
  console.log('cards done', Object.keys(boxes));
})();
