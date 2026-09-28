#!/usr/bin/env bash
# Run one read-only, web-enabled Codex fact-check. Prompt comes on stdin.
# Prints Codex's final answer. Exit 0 = ok, 3 = usage limit, 2 = other failure.
#
# By default this strips OPENAI_API_KEY / CODEX_API_KEY so Codex can only use a
# ChatGPT subscription login — it can never bill a usage-priced API key by
# accident. Pass --allow-api to permit API-key billing.
set -u
ALLOW_API=0
[ "${1:-}" = "--allow-api" ] && ALLOW_API=1

if ! command -v codex >/dev/null 2>&1; then
  echo "CODEX_UNAVAILABLE: codex CLI not installed"; exit 2
fi

dir=$(mktemp -d "${TMPDIR:-/tmp}/fanout-codex.XXXXXX")
prompt=$(cat)
model="${FANOUT_CODEX_MODEL:-gpt-6-astra}"
effort="${FANOUT_CODEX_EFFORT:-high}"

cmd=(codex exec --skip-git-repo-check --ephemeral -s read-only -C "$dir"
     -m "$model" -c "model_reasoning_effort=\"$effort\"" -c 'web_search="live"'
     --json -o "$dir/out.md" "$prompt")

if [ "$ALLOW_API" = 1 ]; then
  "${cmd[@]}" </dev/null >"$dir/events.jsonl" 2>"$dir/err.log"
else
  env -u OPENAI_API_KEY -u CODEX_API_KEY "${cmd[@]}" </dev/null >"$dir/events.jsonl" 2>"$dir/err.log"
fi

if [ -s "$dir/out.md" ]; then
  cat "$dir/out.md"; rm -rf "$dir"; exit 0
fi
if grep -qi "usage limit" "$dir/events.jsonl" 2>/dev/null; then
  echo "CODEX_UNAVAILABLE: usage limit reached"; rm -rf "$dir"; exit 3
fi
echo "CODEX_UNAVAILABLE: codex failed"
tail -n 5 "$dir/err.log" 2>/dev/null
rm -rf "$dir"; exit 2
