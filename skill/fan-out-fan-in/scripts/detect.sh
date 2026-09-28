#!/usr/bin/env bash
# Detect which optional vendors are usable on this machine. Prints JSON.
# Reads no secrets: it only checks whether tools exist and how Codex is logged in.
set -u
codex_installed=false; codex_login="none"; codex_version=""
if command -v codex >/dev/null 2>&1; then
  codex_installed=true
  codex_version=$(codex --version 2>/dev/null | head -n1)
  status=$(env -u OPENAI_API_KEY -u CODEX_API_KEY codex login status 2>&1 | head -n1)
  case "$status" in
    *ChatGPT*) codex_login="chatgpt-subscription" ;;
    *API*)     codex_login="api-key" ;;
    *)         codex_login="not-logged-in" ;;
  esac
fi
claude_version=$(claude --version 2>/dev/null | head -n1)
cat <<EOF
{
  "claude_code": "${claude_version}",
  "codex": { "installed": ${codex_installed}, "version": "${codex_version}", "login": "${codex_login}" },
  "openai_api_key_in_env": $( [ -n "${OPENAI_API_KEY:-}" ] && echo true || echo false )
}
EOF
