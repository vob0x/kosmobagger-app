#!/usr/bin/env python3
"""Rendert die Soundeffekte als echte WAV-Dateien (numpy-DSP, lizenzfrei, offline).
    python3 make_sfx.py   ->   assets/sfx/*.wav
Du kannst jede Datei durch einen freien CC0-Sound gleichen Namens ersetzen
(z. B. von Kenney.nl) — die App lädt einfach assets/sfx/<name>.wav.
"""
import numpy as np, wave, os
sr = 44100
OUT = "assets/sfx"; os.makedirs(OUT, exist_ok=True)
np.random.seed(7)


def expenv(n, atk, dec):
    a = max(1, int(sr * atk)); e = np.ones(n)
    e[:a] = np.linspace(0, 1, a)
    e[a:] = np.exp(-np.arange(n - a) / (sr * dec))
    return e


def sine(f, dur, atk=0.004, dec=0.12):
    n = int(sr * dur); tt = np.arange(n) / sr
    return np.sin(2 * np.pi * f * tt) * expenv(n, atk, dec)


def sweep(f0, f1, dur, kind="sine", atk=0.004, dec=0.12):
    n = int(sr * dur); f = np.linspace(f0, f1, n); ph = 2 * np.pi * np.cumsum(f) / sr
    s = np.sin(ph) if kind == "sine" else 2 * ((ph / (2 * np.pi)) % 1) - 1
    return s * expenv(n, atk, dec)


def noise(dur, atk=0.002, dec=0.1):
    n = int(sr * dur); return (np.random.rand(n) * 2 - 1) * expenv(n, atk, dec)


def lp(x, cut, order=2):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / sr)
    return np.fft.irfft(X / (1 + (f / cut) ** (2 * order)), len(x))


def hp(x, cut, order=2):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / sr)
    return np.fft.irfft(X / (1 + (cut / np.maximum(f, 1)) ** (2 * order)), len(x))


def bell(f, dur, dec=0.5, I=3.2):
    n = int(sr * dur); tt = np.arange(n) / sr
    me = np.exp(-tt / (dec * 0.5))
    sig = np.sin(2 * np.pi * f * tt + I * me * np.sin(2 * np.pi * f * 2.01 * tt))
    return sig * expenv(n, 0.002, dec)


def reverb(x, dur=0.7, decay=4.0, wet=0.28):
    n = int(sr * dur); imp = (np.random.rand(n) * 2 - 1) * np.exp(-np.arange(n) / (sr * dur / decay))
    w = np.convolve(x, imp); w /= (np.max(np.abs(w)) + 1e-9)
    out = np.zeros(len(w)); out[:len(x)] += x; out += wet * w
    return out


def add(*sigs):
    m = max(len(s) for s in sigs)
    return sum(np.pad(s, (0, m - len(s))) for s in sigs)


def buf(dur): return np.zeros(int(sr * dur))
def mix(b, s, at=0.0):
    i = int(sr * at); L = min(len(s), len(b) - i)
    if L > 0: b[i:i + L] += s[:L]
    return b


def save(name, x, gain=0.92):
    x = np.nan_to_num(x); x = x / (np.max(np.abs(x)) + 1e-9) * gain
    x = np.tanh(x * 1.1)
    with wave.open(f"{OUT}/{name}.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    print(f"  {name}.wav  {len(x)/sr:.2f}s")


# ---- UI ----
save("click", add(lp(noise(0.05, dec=0.02), 3000) * 0.6, sweep(680, 440, 0.06, dec=0.04) * 0.7))
save("tick", sweep(1050, 900, 0.045, "square", dec=0.03) * 0.8)

# ---- Karte legen: Thock + kurzer Whoosh ----
place = add(sweep(190, 60, 0.16, dec=0.09) * 1.0, lp(noise(0.11, dec=0.05), 1600) * 0.7, sine(520, 0.06, dec=0.03) * 0.3)
save("place", reverb(place, wet=0.15))

# ---- Aufdecken: Whoosh + Shimmer ----
rev = add(hp(lp(noise(0.34, atk=0.05, dec=0.18), 5200), 500) * 1.0, sweep(200, 1000, 0.4, dec=0.18) * 0.5)
save("reveal", reverb(rev, wet=0.3))

# ---- Aufprall: Sub + Rausch-Impact + Metall-Ring ----
clash = sweep(150, 34, 0.55, dec=0.28) * 1.2
clash = mix(np.pad(clash, (0, sr)), lp(noise(0.2, dec=0.1), 2600) * 1.1)
clash = mix(clash, np.tanh(sweep(320, 110, 0.22, "square", dec=0.12) * 2) * 0.5)
clash = mix(clash, bell(900, 0.3, dec=0.18, I=6) * 0.35)
save("clash", reverb(clash, dur=1.0, wet=0.4))

# ---- Punkt: Kristall-Glocken aufwaerts ----
score = buf(1.0)
for i, f in enumerate([784, 988, 1319, 1568]):
    score = mix(score, bell(f, 0.6, dec=0.4) * (0.9 - i * 0.06), 0.075 * i)
save("score", reverb(score, wet=0.4))

# ---- Sieg: Akkord-Stabs I-IV-V-I + Glocken-Krone ----
def chord(fs, dur, dec):
    n = int(sr * dur); s = np.zeros(n)
    for f in fs: s += sweep(f, f, dur, "saw", dec=dec)
    return lp(s / len(fs), 3500)
win = buf(2.4)
for i, fs in enumerate([[262, 330, 392], [349, 440, 523], [392, 494, 587], [523, 659, 784]]):
    win = mix(win, chord(fs, 0.55, 0.4) * 0.8, i * 0.18)
for i, f in enumerate([1047, 1319, 1568, 2093]):
    win = mix(win, bell(f, 0.7, dec=0.5) * 0.5, 0.8 + i * 0.11)
save("win", reverb(win, dur=1.2, wet=0.45))

# ---- Niederlage: absteigende Saegezaehne ----
lose = buf(1.3)
for i, f in enumerate([392, 311, 262, 196]):
    lose = mix(lose, sweep(f, f * 0.6, 0.4, "saw", dec=0.2) * 0.8, i * 0.14)
save("lose", reverb(lp(lose, 2400), wet=0.35))

print("SFX gerendert in", OUT)
