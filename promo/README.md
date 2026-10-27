# Promo-Trailer (Gaudi Games)

Ein 24-Sekunden-Trailer im Hochformat (1080×1920, 60 fps, mit Ton) für Reels, TikTok und WhatsApp-Status.
Er funktioniert auch stumm. Die App selbst wird dafür nicht verändert: alles liegt in `promo/`, das die App nicht lädt.

## Aufbau

| Datei | Zweck |
|---|---|
| `spot.html` | Komposition auf Canvas 2D. Jedes Bild ist eine reine Funktion der Zeit: `window.seek(t)`. Pixel-Raster 270×480, nearest-neighbor ×4. |
| `timeline.json` | Tempo, Szenen (in Schlägen), Clip-Titel, Musik und Credit. Alle Animationszeiten sind in Schlägen angegeben. |
| `record.js` | Nimmt die echte App per CDP-Screencast auf (Handy-Ausschnitte) und protokolliert Tipps für den Ripple. |
| `record/mock-supabase.js` | Nur für die Aufnahme: ersetzt `@supabase/supabase-js` durch einen Mock auf `BroadcastChannel`. Demo-Spieler sind Presence-Bots. Es wird nichts in eine echte Datenbank geschrieben. |
| `render.js` | Rendert die Bilder per `seek(t)`, ruft `audio.py` auf und muxt mit ffmpeg (libx264 `-crf 18`, yuv420p, faststart, AAC 192k, `loudnorm` I=-14 TP=-1.5). |
| `audio.py` | 8-Bit-Effekte mit numpy (Blip, Coin, Whoosh, Riser, Impact, Powerup), Hall, Ducking der Musik bei Whooshes. |
| `music/level-3-cut.mp3` | 25 s Ausschnitt aus „Level 3“ von HoliznaCC0 (CC0 1.0). |
| `fonts/` | Press Start 2P und VT323 (SIL Open Font License, Lizenztexte liegen dabei). |

## Ablauf

```bash
npm ci                          # einmalig, für Vite und den Plugin-React
node promo/record.js            # Handy-Ausschnitte → promo/clips/  (dauert ~30 s)
node promo/render.js --stills 0.5,6.5,10.5,19.5   # Kontrollbilder → promo/out/stills/
node promo/render.js            # komplettes MP4 → promo/out/gaudi-games-trailer.mp4
```

Weitere Optionen: `--audio-only` schreibt nur `promo/out/mix.wav`.

## Szenenplan (120 bpm, 1 Schlag = 0,5 s)

| Zeit | Szene |
|---|---|
| 0–2 s | Hook: „INSERT BEER TO START“ tippt sich hin, Glitch vor dem Drop |
| 2–4 s | Drop: Blitz, Shake, Logo poppt, Sonne steigt |
| 4–6 s | Spielmoment 1: GAUDI-MIX, Karten fliegen rein, eine dreht sich auf VIRUS |
| 6–9 s | App-Ausschnitt Gaudi-Mix (Virus-Karte, Regel bleibt aktiv) |
| 9–11 s | Spielmoment 2: WERWOLF, der Wolf heult |
| 11–14 s | App-Ausschnitt Werwolf-Raum mit fünf Handys (Demo-Spieler treten live bei) |
| 14–16 s | Spielmoment 3: BUSFAHRER |
| 16–19 s | App-Ausschnitt Busfahrer, Frage 1 |
| 19–24 s | Finale: Logo, „EINE RUNDE GAUDI?“, Link, Verantwortungs-Hinweis, Credit |

## Musik und Credit

- Titel: „Level 3“ von HoliznaCC0, Lizenz CC0 1.0 Universal.
- Quelle: https://freemusicarchive.org/music/holiznacc0/chiptunes/level-3/
- Der Ausschnitt startet bei 134,45 s des Originals, also auf dem Takt vor dem Drop. Das Tempo (119,8 BPM) wurde gemessen, der Drop liegt bei etwa 136 s.
- Die Datei kam vom Stream-Link der Track-Seite (der Download-Button verlangt einen Login).
- Credit für die Beschreibung: „Musik: „Level 3“ by HoliznaCC0, CC0 1.0 Universal“. Im Video steht er klein am Ende.

## Vor dem Veröffentlichen

- `timeline.json` → `link`: die Live-Adresse der App. Der Platzhalter `speedpeed.github.io/partyspiele` ist eine Annahme aus der README und liefert derzeit 404.
- Ton anhören. Die Effekte sind synthetisch und wurden nicht gehört.
- Lautheit prüfen: `ffmpeg -i promo/out/gaudi-games-trailer.mp4 -af ebur128 -f null -`
