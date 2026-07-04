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

## Run it

```
bash ~/the-remembering/serve.sh
```

Then open the printed `https://<host>.<tailnet>.ts.net/` URL in the Quest
browser (headset joined to the tailnet) and tap the goggles icon.
WebXR requires HTTPS, which is why the script uses `tailscale serve`; if it
complains about permissions, run `allow-tailscale-serve.sh` by hand once.

Desktop preview: `python3 -m http.server 8473` and browse to
`http://localhost:8473` — WASD + mouse to walk around. Keys **1–7** force the
seven discoveries (for testing; controllers obviously can't be simulated).

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

## Tuning

Everything lives in `game.js`:

- Gesture text/hints/chime notes: the `GESTURES` table at the top.
- Detection thresholds: `sense()` (pose holds), `circleSweep()` (circle
  strictness), the `6.0` radians in the spin check, `5.0` s stillness.
- Hint cadence: the `50` s check in `maybeHint()`.
- All visuals: the `fx*` functions.

Audio is synthesized (WebAudio drone + pentatonic chimes) — no assets, the
whole game is `index.html` + `game.js` and works offline once A-Frame is
cached (swap the CDN `<script>` for a local copy of `aframe.min.js` to be
fully self-contained).
