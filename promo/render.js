// Rendert den Trailer: Bilder per window.seek(t), Ton per audio.py, Mux per ffmpeg.
//
//   node promo/render.js                       # komplettes MP4 → promo/out/gaudi-games-trailer.mp4
//   node promo/render.js --stills 0,2.5,20     # nur Einzelbilder (Kontrolle), kein Video
//   node promo/render.js --audio-only          # nur Ton → promo/out/mix.wav
//
// Voraussetzung: promo/record.js ist gelaufen (promo/clips/), Playwright mit Chromium.

import { createRequire } from 'node:module';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, 'out');
const PORT = 5175;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.css': 'text/css',
};

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };

function serve() {
  const srv = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = resolve(here, '.' + (path === '/' ? '/spot.html' : path));
    if (!file.startsWith(here) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((r) => srv.listen(PORT, '127.0.0.1', () => r(srv)));
}

function run(cmd, a) {
  const r = spawnSync(cmd, a, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} fehlgeschlagen (${r.status})`);
}

async function main() {
  const timeline = JSON.parse(readFileSync(join(here, 'timeline.json'), 'utf8'));
  const total = timeline.beats * 60 / timeline.bpm;
  const frames = Math.round(total * timeline.fps);
  mkdirSync(OUT, { recursive: true });

  const srv = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('Seitenfehler:', e.message));
  const canvas = page.locator('#c');
  try {
    await page.goto(`http://127.0.0.1:${PORT}/spot.html`, { waitUntil: 'load' });
    await page.evaluate(() => window.ready);
    await page.evaluate(() => document.fonts.ready);

    const sfx = await page.evaluate(() => window.SFX);
    const sfxPath = join(OUT, 'sfx.json');
    writeFileSync(sfxPath, JSON.stringify(sfx, null, 1));

    const wavPath = join(OUT, 'mix.wav');
    const audio = () => run('python3', ['-I', join(here, 'audio.py'), '--sfx', sfxPath, '--music', join(here, timeline.music.file),
      '--start', String(timeline.music.startSec), '--dur', String(total), '--out', wavPath]);

    if (flag('--audio-only')) {
      audio();
      console.log('Ton:', wavPath);
      return;
    }

    const stills = opt('--stills');
    if (stills) {
      const dir = join(OUT, 'stills');
      mkdirSync(dir, { recursive: true });
      for (const t of stills.split(',').map(Number)) {
        await page.evaluate((x) => window.seek(x), t);
        const file = join(dir, `still-${t.toFixed(2)}s.jpg`);
        await canvas.screenshot({ path: file, type: 'jpeg', quality: 92 });
        console.log('Bild:', file);
      }
      return;
    }

    // Vollrender: jedes Bild per seek(t), dann Ton und Mux.
    const framesDir = join(OUT, 'frames');
    rmSync(framesDir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });
    for (let i = 0; i < frames; i++) {
      await page.evaluate((t) => window.seek(t), i / timeline.fps);
      await canvas.screenshot({ path: join(framesDir, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 95 });
      if (i % 120 === 0) console.log(`Bild ${i}/${frames}`);
    }

    audio();

    const mp4 = join(OUT, 'gaudi-games-trailer.mp4');
    run('ffmpeg', [
      '-v', 'error', '-y',
      '-framerate', String(timeline.fps), '-i', join(framesDir, '%05d.jpg'),
      '-i', wavPath,
      '-map', '0:v', '-map', '1:a',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(timeline.fps),
      '-movflags', '+faststart',
      '-c:a', 'aac', '-b:a', '192k', '-af', 'loudnorm=I=-14:TP=-2:LRA=11', '-ar', '48000',
      '-t', String(total), mp4,
    ]);
    console.log('Video:', mp4);
  } finally {
    await browser.close();
    srv.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
