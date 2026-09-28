---
name: fan-out-fan-in
description: Rigorous multi-agent research. A Parent (Opus) scopes the question and briefs a Research team; every load-bearing claim is re-checked by independent QA agents; a Review team tests the logic; adversaries try to refute the draft, and anything they kill loops back to research; the Parent writes the final synthesis. Three tiers — Quick, Normal, Max. Use when a task needs researching multiple threads, comparing options, surveying a solution space, or verifying claims before a decision. Triggers on "fan out", "fan-in", "parallel research", "research this", "multiple angles", "survey approaches", "quick research", "max research", "verify this thoroughly".
---

# Fan-Out / Fan-In

One question in, one verified answer out — built by a small team that is structurally unable to accept its own first answer.

```
PARENT (Opus) scopes → RESEARCH (Sonnet, one angle each)
      → QA (independent checkers re-verify every load-bearing claim)
      → REVIEW (does the conclusion follow?)
      → PARENT drafts
      → ADVERSARIES try to refute the draft ⟲ kills and gaps loop back to research
      → PARENT writes the final report, including what died
```

**Why this shape:** in blind testing, one checker caught ~91% of planted errors; two *independent* checkers caught ~96%. A second independent check matters more than which model does it. And no amount of web reading caught errors about how hardware and software actually behave — only running the thing did. So every tier checks claims independently, and behavioral claims must be tested or labeled "needs a real-world test."

## Step 0 — Config and first run

`SKILL_DIR` = this skill's base directory (shown when the skill loads).

Read `~/.config/fan-out-fan-in/config.json`.
- **Missing** (first run), or the user says "re-run fan-out setup": follow `SKILL_DIR/references/setup.md` — welcome message, vendor detection, a few questions, write the config. Then continue with the user's original request.
- Present: use it silently.

## Step 1 — Pick the tier

The user's words win: "quick" → Quick; "normal" → Normal; "max", "thorough", "comprehensive", "audit", "be certain" → Max.
Otherwise choose, and say which in one line before launching (the user can override):

| Tier | Use for | Agents per run | Checks per important claim | Adversary rounds | Follow-up research | Typical time |
|---|---|---|---|---|---|---|
| **Quick** | A basic fact or narrow question | 5–9 | 1 | 1 | none | ~10–15 min |
| **Normal** | Most research | 14–31 | 2, independent | up to 2 | up to 3 per run | ~20–40 min |
| **Max** | Complex projects, anything expensive, hard to reverse, or outward-facing | 25–63 | 3, from different models where available | up to 3 | up to 5 per run | ~45–75 min |

Follow-up research is one budget for the whole run, not per round. Gaps raised in the final adversary round, or after the budget is spent, become open questions in the report. They never start another loop.

Default to **Max** when the work is a complex project decision (architecture, vendor or money choices, strategy); **Quick** for simple lookups; **Normal** otherwise. If `config.default_tier` is set to a tier, use it when the request doesn't say.

Every tier runs at most 3–4 agents at a time. This is deliberate: it keeps a Max run from exhausting the user's Claude plan usage window and locking them out of their own work.

## Step 2 — Sensitivity

Set `sensitive: true` when the question or context contains client or customer data, personal information, private code, credentials, or unreleased business details. When sensitive, external (non-Anthropic) vendors are switched off for the run and researchers search the general topic, never the private specifics. Also apply every rule in `config.privacy_rules`.

## Step 3 — Build the run

1. **Models.** Read `SKILL_DIR/models.json`. Map seats → model IDs. Then apply config:
   - `config.vendors.fable` false → `second_opinion: null` (its seats fall back to the QA model).
   - Codex runs only when `config.vendors.codex.enabled` is true and the run is not sensitive. Its script falls back to Claude automatically if Codex is out of allowance or logged out.
2. **Output path.** `<project root>/<config.output_dir>/<YYYY-MM-DD>-<short-slug>.md` as an absolute path; `mkdir -p` the folder.
3. **Recon (cheap, optional).** If the question is about local files or a codebase, gather the minimal context the researchers need (file list, key facts, versions) into `context`. Never include secrets.

## Step 4 — Launch

Call the **Workflow** tool with `scriptPath: SKILL_DIR/workflow/fan-out.js` and `args`:

```json
{
  "question": "<the user's question, verbatim plus any clarifications>",
  "context": "<recon, or empty>",
  "tier": "quick | normal | max",
  "sensitive": false,
  "output_path": "<absolute path>",
  "today": "<YYYY-MM-DD>",
  "skill_dir": "<SKILL_DIR>",
  "models": { "parent": "...", "research": "...", "qa": "...", "review": "...", "adversary": "...", "second_opinion": "... or null" },
  "codex": { "enabled": true, "allow_api": false }
}
```

Tell the user in one line: tier, rough time, and that it runs in the background.

If the Workflow tool is unavailable, run the same shape with the Agent tool — same seats and models, never more than 4 agents at once, and never skip QA or the adversarial pass.

## Step 5 — Report back

Relay, briefly: the headline, the recommendation, how many claims were confirmed / refuted / flagged as needing a real-world test, and the report path. Do not paste the whole report. If it's something the user will share, offer to publish it as a page.

## Rules that never bend

- **Never a flat fan-out.** Every research agent gets a distinct, narrow brief.
- **QA is not Review.** QA asks "is this fact true?"; Review asks "does the conclusion follow?" A true number can be recruited for a false conclusion.
- **Agreement is not evidence.** Consensus resting on one upstream source is one source.
- **Default verdict on anything that can't be confirmed is UNVERIFIED** — never "probably right."
- **What died is part of the deliverable.** Refuted claims are reported, not hidden.
- **The adversarial pass always runs**, at every tier.
