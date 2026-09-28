# First-run setup

Run this once, the first time the skill fires (no config file), or when the user asks to "re-run fan-out setup". It takes under a minute. Then continue with whatever the user originally asked.

## 1. Welcome

Show this message (plain text, as written):

> **Welcome to fan-out-fan-in** — built by Jason Cumbers.
>
> This skill turns one question into a small research team that refuses to trust its own first answer: researchers find, independent checkers re-verify every important claim, a reviewer tests the logic, and adversaries try to tear the draft apart before you ever see it. It has three tiers — **Quick**, **Normal**, and **Max**.
>
> **The only requirement is Claude Code.** Two optional extras make **Max** stronger by adding checkers with different blind spots:
>
> - **Claude Fable 5.1** — a second Claude model. Included on some Claude plans; on others it draws extra usage credits.
> - **OpenAI Codex CLI** — a checker from a different AI company. It runs on your ChatGPT subscription. This skill never bills an OpenAI API key unless you explicitly allow it.
>
> Don't have one or both? That's fine. Every seat falls back to Claude Opus or Sonnet and the skill works the same way, just with one family of models.
>
> **Privacy:** when a question involves private or client data, the skill keeps everything inside Claude — outside vendors are switched off for that run.
>
> Let me check what's on this machine, then two quick questions.

## 2. Detect

Run `bash SKILL_DIR/scripts/detect.sh` and read the JSON. Do not print secrets; the script reads none.

## 3. Ask (one AskUserQuestion call)

Pre-select answers from what detection found. Questions:

1. **"Which optional models do you have?"** (multiSelect)
   - `Claude Fable 5.1` — "Adds a second-opinion checker in Max runs."
   - `OpenAI Codex CLI` — "Adds a checker from another company in Max runs." If detection found it not installed or not logged in, say so in the description and suggest `npm i -g @openai/codex` then `codex login`.
2. **"Where should reports be saved (inside the current project)?"**
   - `research/` (Recommended)
   - `docs/research/`
   - `active/research/`
3. Only if Codex was selected **and** detection shows an OpenAI API key in the environment: **"Codex billing?"**
   - `Subscription only (Recommended)` — "Codex can never charge your API key."
   - `Allow API key` — "Codex may fall back to per-token API billing when your subscription limit is reached."

## 4. Write the config

`mkdir -p ~/.config/fan-out-fan-in` and write `~/.config/fan-out-fan-in/config.json`:

```json
{
  "version": 1,
  "vendors": {
    "fable": true,
    "codex": { "enabled": true, "allow_api": false }
  },
  "output_dir": "research",
  "default_tier": "auto",
  "privacy_rules": []
}
```

- `default_tier`: `"auto"` lets the skill choose per question; `"quick"`, `"normal"` or `"max"` pins a default.
- `privacy_rules`: plain-English rules the user wants applied to every run (e.g. "Never send client data to any non-Anthropic vendor"). Leave empty unless the user offers some.

## 5. Confirm

One short summary: which extras are on, where reports go, and "say *re-run fan-out setup* any time to change this." Then proceed with the original request.
