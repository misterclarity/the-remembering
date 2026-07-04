# The Remembering

A quiet WebXR game about finding out who you are — not by being told, but by
moving. Built with A-Frame for the Meta Quest 2 (touch controllers).

You wake in a dark, foggy field with standing stones. The game never gives
instructions. Seven "magical gestures" are hidden in your own body; when you
happen upon one, the world answers — light, sound, and a few lines of text —
and the place permanently changes. There are no stats, no score, no failure.
After long quiet stretches the game whispers an oblique hint, never a command.
When all seven have been found, the words you earned orbit you and the sky
turns toward dawn.

## Play it

Easiest: open **https://misterclarity.github.io/the-remembering/** in the
Quest browser and tap the goggles icon. Deployed automatically from `main`
by the Pages workflow.

Local/offline alternative:

```
bash ~/the-remembering/serve.sh
```

Then open the printed `https://<host>.<tailnet>.ts.net/` URL in the Quest
browser (headset joined to the tailnet) and tap the goggles icon.
WebXR requires HTTPS, which is why the script uses `tailscale serve`; if it
complains about permissions, run `allow-tailscale-serve.sh` by hand once.

Desktop preview: `python3 -m http.server 8473` and browse to
`http://localhost:8473` — WASD + mouse to walk around. Keys **1–7** force the
seven discoveries, **9** raises awareness by a third (for testing;
controllers obviously can't be simulated).

## Spoilers — the seven gestures

| Gesture (do it, hold ~1s)                          | Word    | Answer |
|----------------------------------------------------|---------|--------|
| Raise both hands above your head                   | Upward  | stars wake, aurora |
| Bring both hands together at your chest            | Tender  | warm pulsing light, embers |
| Spread your arms wide at shoulder height           | Vast    | horizon ring, blossom lights |
| Reach a hand down to the ground (crouch/bend)      | Rooted  | rings ripple out underfoot |
| Trace a circle in the air with one hand            | Whole   | a glowing ring hangs where you drew it |
| Hold both hands completely still for ~5 seconds    | Still   | fireflies gather, fog thins |
| Turn yourself a full 360°                          | Joyful  | petals fall forever |

### The Listening Circle

A ring of six stones glows faintly through the fog, off to the northwest
(left stick to walk, right stick to snap-turn 45°). Near it, a slow
heartbeat starts — 72 bpm, with the stones' glow keeping visual time.
Stand inside the circle and **move in sync with the pulse** (hands or head,
any motion that peaks on the beat, ±0.22 s window). Four beats in a row
locks you in; the music blooms (hats, then a pentatonic bell melody) as
long as you keep time, and *awareness* grows.

Awareness is never shown as a number. It thins the fog, reveals a hidden
layer of drifting wisps everywhere, makes the whispered hints come sooner,
and passes through three felt milestones. Fully awake, the ending gains an
eighth orbiting word: **Awake**. Off-beat flailing breaks the streak;
simply standing and listening never punishes.

Fully awake, a quieter triangle tick hides **between** the beats — sync to
those offbeats eight in a row for a rare, once-only answer.

### Body and feel

- **Haptics**: both controllers thump with the circle's heartbeat (stronger
  up close) and buzz on every discovery and echo.
- **Light trails** follow both hands, brighter with awareness — you can see
  the shapes you draw.
- **Warmth ramp**: while a hold-gesture is in progress the hands glow and a
  quiet tone swells, so near-misses feel like *something waking*.
- **Echoes**: repeating a found gesture answers with a quiet chime, shimmer
  burst, and a soft buzz (per-gesture cooldown).
- **Guide wisps**: at higher awareness, hints stop being words — a wisp
  performs the missing gesture near you (rises skyward, two merge at the
  chest, traces a circle, orbits you...).
- **Hand tracking**: put the controllers down and play with bare hands
  (`hand-tracking-controls`); the gesture engine reads whichever source is
  live. Locomotion still needs the sticks.
- **Positional audio**: the heartbeat is *located* at the circle (hunt it
  by ear), chimes come from where things happen.
- **Comfort**: vignette during smooth locomotion and snap turns; the
  near-floor threshold for the ground gesture scales with your measured
  head height, so seated play works.

### The mirror pond

A still disc of water to the southeast wears the sky's color. At the
ending it fills with your earned words as a constellation on the surface —
and the ending poem itself is assembled from how you actually played:
which gesture came first and last, which hand drew the circle, how quiet
or restless you were, whether you learned to keep time.

## Tuning

Everything lives in `game.js`:

- Gesture text/hints/chime notes: the `GESTURES` table at the top.
- Detection thresholds: `sense()` (pose holds), `circleSweep()` (circle
  strictness), the `6.0` radians in the spin check, `5.0` s stillness.
- Hint cadence: the `50` s check in `maybeHint()`.
- Listening Circle: `this.grove` (position/radius), `beatPeriod` (tempo),
  the `0.22` s hit window and `0.035` awareness-per-beat in `tickGrove()`,
  music layers in `scheduleBeat()`.
- Locomotion: speed and snap angle in `tickMove()`.
- All visuals: the `fx*` functions.

Audio is synthesized (WebAudio drone + pentatonic chimes) — no assets
beyond the vendored `vendor/aframe.min.js`, so the game is fully
self-contained and works without any CDN.
