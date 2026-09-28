#!/usr/bin/env bash
# Removes the fan-out-fan-in skill. Add --purge to also delete your settings.
set -euo pipefail
CLAUDE_DIR="${CLAUDE_HOME:-$HOME/.claude}"
DEST="$CLAUDE_DIR/skills/fan-out-fan-in"
if [[ -e "$DEST" || -L "$DEST" ]]; then rm -rf "$DEST"; echo "Removed $DEST"; else echo "No skill found at $DEST"; fi
if [[ "${1:-}" == "--purge" ]]; then rm -rf "$HOME/.config/fan-out-fan-in"; echo "Removed your settings (~/.config/fan-out-fan-in)"; fi
