// Nimmt echte App-Abläufe per CDP-Screencast auf: die Handy-Ausschnitte im Trailer.
//
//   node promo/record.js                 # alle Clips
//   node promo/record.js werwolf-lobby   # nur einen Clip
//
// Ergebnis: promo/clips/<name>/f0000.jpg … + clip.json (Frame-Zeiten, Tipp-Positionen).
// Die App-Dateien bleiben unverändert. Für Multi-Handy startet dieses Skript einen
// eigenen Vite-Server, der @supabase/supabase-js durch promo/record/mock-supabase.js
// ersetzt. Demo-Spieler sind reine Presence-Bots im Raum. Es wird nichts in eine
// echte Datenbank geschrieben, und es gibt keinen Login.

import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

// Playwright ist global installiert (NODE_PATH), darum per require statt import.
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const OUT = resolve(here, 'clips');
const PORT = 5174;
const APP = `http://127.0.0.1:${PORT}`;
const PHONE = { width: 390, height: 844, dpr: 2 };

const HOST = { id: 'demo-host', name: 'Lena', avatar: '🦊', color: '#ff2e88' };
const BOTS = [
  { id: 'demo-max', name: 'Max', avatar: '🐸', color: '#19e3ff', noAlcohol: false },
  { id: 'demo-jonas', name: 'Jonas', avatar: '🤖', color: '#3dff6e', noAlcohol: false },
  { id: 'demo-sara', name: 'Sara', avatar: '👽', color: '#ffe03a', noAlcohol: true },
  { id: 'demo-tom', name: 'Tom', avatar: '🦄', color: '#a64dff', noAlcohol: false },
];
const STORE = {
  players: [HOST, ...BOTS.slice(0, 3)].map(({ id, name, avatar, color, noAlcohol }) => ({ id, name, avatar, color, noAlcohol: Boolean(noAlcohol) })),
  // Nur Platzhalter, damit die Multi-Handy-Seite startet. Der Mock ignoriert sie.
  settings: { supabaseUrl: 'https://demo.supabase.co', supabaseKey: 'demo-anon-key-for-promo-recording' },
  stats: {},
  custom: {},
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wird vor jedem Seitenaufruf ausgeführt, schreibt die Demo-Daten nur einmal pro Tab. */
function seedInit({ store, host }) {
  if (sessionStorage.getItem('promo-seeded')) return;
  localStorage.setItem('gaudi-games-v1', JSON.stringify(store));
  localStorage.setItem('gaudi-identity', JSON.stringify(host));
  sessionStorage.setItem('promo-seeded', '1');
}

/** Startet ein Spiel auf der Spielseite (Setup-Button). */
async function startGame(page) {
  await page.locator('button', { hasText: /Los|Start|Spielen|Starten|EINSTEIGEN/i }).first().click();
  await sleep(700);
}

class Recorder {
  constructor(page, dir) {
    this.page = page;
    this.dir = dir;
    this.frames = [];
    this.taps = [];
    this.writes = [];
    this.n = 0;
    this.t0 = 0;
  }

  /** Sekunden seit Aufnahmestart. */
  now() {
    return Date.now() / 1000 - this.t0;
  }

  async start() {
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on('Page.screencastFrame', (ev) => {
      const file = `f${String(this.n++).padStart(4, '0')}.jpg`;
      this.frames.push({ t: +(ev.metadata.timestamp - this.t0).toFixed(3), file });
      this.writes.push(writeFile(resolve(this.dir, file), Buffer.from(ev.data, 'base64')));
      this.cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
    });
    this.t0 = Date.now() / 1000;
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
  }

  /** Wartet, bis die Aufnahmezeit `sec` erreicht ist. */
  async wait(sec) {
    await sleep(Math.max(0, (this.t0 + sec - Date.now() / 1000) * 1000));
  }

  /** Tipp auf ein Element. Die Position landet mit Zeitstempel in clip.json (für den Ripple). */
  async tap(locator) {
    await locator.first().scrollIntoViewIfNeeded();
    const box = await locator.first().boundingBox();
    if (!box) throw new Error('tap: Element nicht sichtbar');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    this.taps.push({ t: +this.now().toFixed(3), x: Math.round(x), y: Math.round(y) });
    await this.page.mouse.click(x, y);
  }

  async stop() {
    await this.cdp.send('Page.stopScreencast');
    await Promise.all(this.writes);
    writeFileSync(
      resolve(this.dir, 'clip.json'),
      JSON.stringify({ phone: PHONE, duration: +this.now().toFixed(3), frames: this.frames, taps: this.taps }, null, 1),
    );
  }
}

/** Ein Demo-Spieler als Presence-Bot im Raum: läuft in der Host-Seite, teilt den Mock-Kanal. */
async function joinBot(page, code, bot) {
  await page.evaluate(
    async ({ code, bot }) => {
      const { createClient } = await import('/promo/record/mock-supabase.js');
      const ch = createClient().channel(`gaudi-room-${code}`, { config: { presence: { key: bot.id } } });
      ch.on('presence', { event: 'sync' }, () => {});
      ch.subscribe((s) => {
        if (s === 'SUBSCRIBED') ch.track({ ...bot, host: false, joinedAt: Date.now() });
      });
      (window.__bots ??= []).push(ch);
    },
    { code, bot },
  );
}

const CLIPS = {
  // Gaudi-Mix: wir klicken durch die Karten, bis eine Virus-Karte kommt, und nehmen
  // dann Karte + Weiter auf. Das ist der „Wow“-Moment: die Regel bleibt aktiv.
  'gaudi-virus': async ({ page, rec }) => {
    await page.goto(`${APP}/#/spiel/gaudi-mix`, { waitUntil: 'networkidle' });
    await startGame(page);
    for (let i = 0; i < 80; i++) {
      if (await page.locator('.card-kicker', { hasText: /Virus/ }).first().isVisible().catch(() => false)) break;
      await page.locator('button', { hasText: 'Weiter' }).first().click();
      await sleep(350);
    }
    await rec.start();
    await rec.wait(1.2);
    await rec.tap(page.locator('button', { hasText: 'Weiter' }));
    await rec.wait(3.0);
    await rec.stop();
  },

  // Werwolf im Multi-Handy-Raum: Host öffnet den Raum, Demo-Spieler treten nacheinander bei,
  // dann wird Werwolf gewählt.
  'werwolf-lobby': async ({ page, rec }) => {
    await page.goto(`${APP}/#/online`, { waitUntil: 'networkidle' });
    await page.locator('button', { hasText: 'Neuen Raum öffnen' }).click();
    await page.locator('.code-display').first().waitFor();
    const code = (await page.locator('.code-display').first().innerText()).replace(/\s/g, '');
    await sleep(500);
    await rec.start();
    const joins = [0.4, 0.95, 1.5, 2.05];
    for (const [i, bot] of BOTS.entries()) {
      await rec.wait(joins[i]);
      await joinBot(page, code, bot);
    }
    await rec.wait(2.6);
    await rec.tap(page.locator('button', { hasText: /Werwolf/ }));
    await rec.wait(3.4);
    await rec.stop();
  },

  // Busfahrer: erste Runde „Rot oder Schwarz?“, Antwort tippen, Karte dreht sich.
  busfahrer: async ({ page, rec }) => {
    await page.goto(`${APP}/#/spiel/busfahrer`, { waitUntil: 'networkidle' });
    await startGame(page);
    await rec.start();
    await rec.wait(1.0);
    await rec.tap(page.locator('button', { hasText: /Rot/ }));
    await rec.wait(3.0);
    await rec.stop();
  },
};

async function runClip(browser, name, fn) {
  const dir = resolve(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: PHONE.width, height: PHONE.height },
    deviceScaleFactor: PHONE.dpr,
    isMobile: true,
    hasTouch: true,
    locale: 'de-AT',
  });
  await context.addInitScript(seedInit, { store: STORE, host: HOST });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await fn({ page, rec: new Recorder(page, dir) });
  } catch (e) {
    console.error(`[${name}] Fehler:`, e.message);
    console.error('[' + name + '] Buttons:', await page.locator('button').allInnerTexts().catch(() => []));
    process.exitCode = 1;
  } finally {
    if (errors.length) console.error(`[${name}] Seitenfehler:`, errors.slice(0, 5));
    await context.close();
  }
}

async function main() {
  const want = process.argv.slice(2);
  const server = await createServer({
    configFile: false,
    root: ROOT,
    base: './',
    plugins: [react()],
    logLevel: 'warn',
    resolve: { alias: { '@supabase/supabase-js': resolve(here, 'record/mock-supabase.js') } },
    server: { host: '127.0.0.1', port: PORT, strictPort: true },
  });
  await server.listen();
  const browser = await chromium.launch();
  try {
    for (const [name, fn] of Object.entries(CLIPS)) {
      if (want.length && !want.includes(name)) continue;
      console.log('nehme auf:', name);
      await runClip(browser, name, fn);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
