#!/usr/bin/env bash
# Installs the fan-out-fan-in skill for Claude Code into your own ~/.claude folder.
# It only writes to:  ~/.claude/skills/fan-out-fan-in/
# Your settings live separately in ~/.config/fan-out-fan-in/ and are never touched here.
# Run uninstall.sh to remove it.
#
#   ./install.sh           copy the skill in
#   ./install.sh --force   replace an existing copy (the old one is backed up)
#   ./install.sh --link    symlink instead of copy, so a `git pull` here updates the skill
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/skill/fan-out-fan-in"
CLAUDE_DIR="${CLAUDE_HOME:-$HOME/.claude}"
DEST="$CLAUDE_DIR/skills/fan-out-fan-in"
MODE="copy"; FORCE=0
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --link)  MODE="link" ;;
    *) echo "Unknown option: $a"; exit 1 ;;
  esac
done

if [[ -e "$DEST" || -L "$DEST" ]]; then
  if [[ "$FORCE" != 1 ]]; then
    echo "A fan-out-fan-in skill already exists at $DEST."
    echo "Re-run with --force to replace it (your existing copy will be backed up first)."
    exit 1
  fi
  # Back up OUTSIDE the skills folder, or Claude Code would load the backup as a duplicate skill.
  mkdir -p "$CLAUDE_DIR/skill-backups"
  BACKUP="$CLAUDE_DIR/skill-backups/fan-out-fan-in.$(date +%Y%m%d-%H%M%S)"
  mv "$DEST" "$BACKUP"
  echo "Backed up the existing skill to $BACKUP"
fi

mkdir -p "$CLAUDE_DIR/skills"
if [[ "$MODE" == "link" ]]; then
  ln -s "$SRC" "$DEST"
else
  cp -R "$SRC" "$DEST"
fi
chmod +x "$DEST/scripts/"*.sh

echo "Installed fan-out-fan-in into $DEST ($MODE)"
echo "Open a NEW Claude Code session and ask for research, e.g.:  fan out on <your question>"
echo "The first run walks you through a one-minute setup."
