# 🍺 Gaudi Games

Die Party- und Trinkspiel-App mit Retro-Arcade-Look: über 25 Spiele zum Durchreichen auf einem Handy plus 10 Spiele, bei denen sich mehrere Handys per Raum-Code verbinden. Tausende Fragen, Aufgaben und Begriffe, auf Deutsch mit österreichischem Einschlag.

Die App läuft als **Progressive Web App**: Link im Handy-Browser öffnen, dann „Zum Home-Bildschirm hinzufügen“. Danach funktioniert sie wie eine normale App, die Einzelhandy-Spiele auch offline.

## Features

- **Inhalts-Stufen**: 😇 Harmlos · 🎉 Party · 🔥 Eskalation · 🌶️ Spicy 18+ (frei kombinierbar)
- **Trinkspiel- oder Alkoholfrei-Modus**: Schlucke ↔ Strafpunkte, zusätzlich pro Spieler „alkoholfrei“ einstellbar
- **Spielerliste**: Namen werden in Aufgaben eingesetzt, Schluck-Zähler und „Hall of Fame“ mit Titeln des Abends
- **Eigene Inhalte**: eigene Fragen, Aufgaben, Regeln und Glücksrad-Felder
- Chiptune-Sounds, Vibration, Konfetti, Bildschirm bleibt beim Spielen an

### Ein Handy (durchreichen)
Gaudi-Mix (à la Piccolo) · Wahrheit oder Pflicht · Ich hab noch nie · Wer würde eher · Paranoia · Würdest du eher · Heißer Stuhl · Deep Talk · Reaktions-Duell · Ring of Fire · Busfahrer (inkl. Pyramide) · Höher oder Tiefer · Wer bin ich? (Handy an die Stirn) · Tabu · Activity · Wortbombe · Zungenbrecher · Bierpong- & Flunkyball-Turnier · Hausregel-Generator

### Mehrere Handys (Raum-Code)
Undercover · Werwolf (die App ist der Erzähler) · Spyfall · Quiz-Duell · Gaudi-Antworten (Quiplash-Stil) · Montagsmaler · Bluff · Wer würde eher (anonym) · Anonyme Beichte · Schätzmeister

### Tools
Flaschendrehen · Glücksrad · Wer fängt an? (Finger-Picker) · Würfel & Münze · 10-Sekunden-Challenge · Zufalls-Picker

## Multi-Handy einrichten (Supabase, gratis)

Die Spiele mit mehreren Handys laufen über [Supabase Realtime](https://supabase.com/docs/guides/realtime) (nur Broadcast + Presence). Tabellen braucht es keine.

1. Auf [supabase.com](https://supabase.com) registrieren und ein neues Projekt anlegen (Free-Tarif reicht).
2. Unter **Project Settings → API** (bzw. „API Keys“) die **Project URL** und den **anon / publishable Key** kopieren.
3. Eine der beiden Varianten:
   - **Fest einbauen (empfohlen):** Im GitHub-Repo unter *Settings → Secrets and variables → Actions* zwei Secrets anlegen: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`. Beim nächsten Deploy ist der Server eingebaut, niemand muss etwas eintragen.
   - **In der App:** *Einstellungen → Multi-Handy-Server* auf jedem Handy ausfüllen.

Der anon-Key darf öffentlich sein, er ist für den Browser gedacht.

## Veröffentlichen (GitHub Pages)

1. Im Repo unter *Settings → Pages* als **Source „GitHub Actions“** wählen.
2. Auf `main` pushen bzw. mergen. Die Action `.github/workflows/deploy.yml` baut und veröffentlicht automatisch.
3. Die App ist dann unter `https://<user>.github.io/<repo>/` erreichbar.

## Lokal entwickeln

```bash
npm install
npm run dev      # Entwicklungsserver
npm run build    # Typecheck + Produktions-Build nach dist/
```

Struktur:

- `src/data/` – alle Inhalte (Fragen, Aufgaben, Wörter …)
- `src/games/` – Spiele für ein Handy (`registry.ts` listet alle)
- `src/tools/` – Zufallstools
- `src/online/` – Multi-Handy-Räume (`useRoom.ts`) und Spiele (`games/`): Das Host-Handy hält den Spielstand und schickt ihn an alle.

---

Bitte trinkt verantwortungsvoll. Ab 18. Niemand muss etwas tun, das er oder sie nicht will. Wasser ist auch ein Getränk. 💧
