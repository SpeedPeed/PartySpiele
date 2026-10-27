#!/usr/bin/env python3
"""Ton für den Trailer: Musik-Ausschnitt plus 8-Bit-Effekte, gemischt zu einer WAV-Datei.

Aufruf (wird von render.js gestartet):
  python3 -I promo/audio.py --sfx promo/out/sfx.json --music promo/music/level-3-cut.mp3 \
      --start 0 --dur 24 --out promo/out/mix.wav

Effekte kommen aus numpy (Square/Saw, Arpeggios, Rauschkanal). Die Zeiten kommen aus
window.SFX in spot.html. Bei Whooshes wird die Musik kurz abgesenkt (Ducking).
Lautheit wird danach in render.js per loudnorm auf -14 LUFS gebracht.
"""
import argparse
import json
import subprocess
import wave

import numpy as np

SR = 48000


def square(f, n, duty=0.5):
    ph = 2 * np.pi * np.cumsum(np.broadcast_to(f, (n,))) / SR
    return np.where((ph % (2 * np.pi)) < 2 * np.pi * duty, 1.0, -1.0)


def saw(f, n):
    return 2 * (np.cumsum(np.broadcast_to(f, (n,))) / SR % 1.0) - 1


def sine(f, n):
    return np.sin(2 * np.pi * np.cumsum(np.broadcast_to(f, (n,))) / SR)


def decay(n, k):
    return np.exp(-np.arange(n) / SR * k)


def noise(n, seed):
    return np.random.default_rng(seed).uniform(-1, 1, n)


def lowpass(x, a):
    # Einpol-Tiefpass, reicht für Whoosh-Rauschen
    y = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += a * (v - acc)
        y[i] = acc
    return y


def notes(freqs, durs, gain, k):
    parts = []
    for f, d in zip(freqs, durs):
        n = int(d * SR)
        parts.append(square(f, n) * decay(n, k) * gain)
    return np.concatenate(parts)


def s_blip():
    n = int(0.06 * SR)
    return 0.2 * square(np.geomspace(880, 1320, n), n) * decay(n, 40)


def s_jump():
    n = int(0.14 * SR)
    return 0.2 * square(np.geomspace(300, 700, n), n) * decay(n, 14)


def s_coin():
    return notes([988, 1319], [0.07, 0.25], 0.2, 16)


def s_click():
    n = int(0.012 * SR)
    return 0.15 * noise(n, 1) * decay(n, 200)


def s_whoosh():
    n = int(0.5 * SR)
    x = lowpass(noise(n, 2), 0.02)
    return 0.6 * x * np.sin(np.linspace(0, np.pi, n)) ** 2


def s_riser(dur):
    n = int(dur * SR)
    env = np.linspace(0, 1, n) ** 2
    return 0.16 * saw(np.geomspace(150, 1400, n), n) * env


def s_impact():
    n = int(0.9 * SR)
    body = sine(np.geomspace(140, 35, n), n) * decay(n, 5)
    burst = noise(n, 3) * decay(n, 40) * 0.4
    return 0.8 * body + 0.25 * burst


def s_powerup():
    return notes([523, 659, 784, 1047], [0.07] * 4, 0.16, 12)


SYNTH = {
    'blip': lambda ev: s_blip(),
    'jump': lambda ev: s_jump(),
    'coin': lambda ev: s_coin(),
    'click': lambda ev: s_click(),
    'whoosh': lambda ev: s_whoosh(),
    'riser': lambda ev: s_riser(ev.get('dur', 0.5)),
    'impact': lambda ev: s_impact(),
    'powerup': lambda ev: s_powerup(),
}


def decode_music(path, start, dur):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-ss', str(start), '-t', str(dur), '-i', path,
         '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'],
        check=True, capture_output=True,
    ).stdout
    m = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)
    n = int(dur * SR)
    out = np.zeros((n, 2))
    out[: min(n, len(m))] = m[:n]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sfx', required=True)
    ap.add_argument('--music', required=True)
    ap.add_argument('--start', type=float, default=0.0)
    ap.add_argument('--dur', type=float, required=True)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    n = int(a.dur * SR)
    events = json.load(open(a.sfx))

    # Effekte mischen
    fx = np.zeros(n)
    for ev in events:
        s = SYNTH.get(ev['kind'])
        if s is None:
            continue
        sig = s(ev)
        i = int(ev['t'] * SR)
        if i >= n:
            continue
        end = min(n, i + len(sig))
        fx[i:end] += sig[: end - i]
    # Hall: zwei kurze Verzögerungen mit wenig Feedback
    for d, gain in [(int(0.09 * SR), 0.3), (int(0.17 * SR), 0.2)]:
        fx[d:] += gain * fx[:-d]
    fx = np.tanh(fx)

    # Musik + Fades + Ducking bei Whoosh/Impact
    mus = decode_music(a.music, a.start, a.dur)
    duck = np.ones(n)
    for ev in events:
        if ev['kind'] not in ('whoosh', 'impact'):
            continue
        i = int(ev['t'] * SR)
        att, hold, rel = int(0.02 * SR), int(0.18 * SR), int(0.25 * SR)
        seg = np.concatenate([np.linspace(1, 0.6, att), np.full(hold, 0.6), np.linspace(0.6, 1, rel)])
        end = min(n, i + len(seg))
        duck[i:end] = np.minimum(duck[i:end], seg[: end - i])
    mus *= duck[:, None]
    fade_in = int(0.1 * SR)
    mus[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    fade_out = int(1.0 * SR)
    mus[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]

    mix = 0.8 * mus + 0.7 * fx[:, None]
    peak = np.max(np.abs(mix))
    if peak > 0.98:
        mix *= 0.98 / peak

    pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
    with wave.open(a.out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'Ton geschrieben: {a.out} ({a.dur:.2f}s, {len(events)} Effekte, Peak {peak:.2f})')


if __name__ == '__main__':
    main()
