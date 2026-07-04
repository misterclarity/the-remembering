#!/usr/bin/env bash
# Serve The Remembering to the Quest 2 over the tailnet.
# WebXR needs a secure origin, so plain LAN http won't work from the headset;
# `tailscale serve` fronts the local server with a valid HTTPS cert.
set -u
cd "$(dirname "$0")"
PORT=8473

cleanup() {
  [ -n "${PYPID:-}" ] && kill "$PYPID" 2>/dev/null
  tailscale serve reset 2>/dev/null
}
trap cleanup EXIT INT TERM

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
PYPID=$!

if tailscale serve --bg "http://127.0.0.1:$PORT"; then
  echo
  echo "Open the https://...ts.net URL above in the Quest browser (headset must be"
  echo "on the tailnet), then press the goggles icon to enter VR."
  echo "Ctrl-C here stops serving."
else
  echo
  echo "tailscale serve refused (operator permission). One-time fix, run by hand:"
  echo "  bash $(pwd)/allow-tailscale-serve.sh"
fi

wait "$PYPID"
