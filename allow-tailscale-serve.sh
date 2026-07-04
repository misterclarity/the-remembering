#!/usr/bin/env bash
# One-time: let this user run `tailscale serve` without sudo.
# Run this by hand (it needs the sudo password), then re-run serve.sh.
sudo tailscale set --operator="$USER"
