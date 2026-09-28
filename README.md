# fan-out-fan-in — rigorous multi-agent research for Claude Code

Ask one question. Get back one answer that a small team of agents has already tried, and failed, to prove wrong.

Most "deep research" takes the first plausible answer and decorates it. This skill is built so it can't: every important claim is re-checked by independent agents, a reviewer tests whether the conclusion actually follows, and adversaries attack the draft. Anything they kill goes back for more research before you see a word.

Built by Jason Cumbers.

## How it works

```
PARENT (Opus) — scopes the question, writes a distinct brief per angle
   │
   ▼
RESEARCH (Sonnet) — one agent per angle; discovery, not judgment
   │
   ▼
QA — independent checkers re-verify every load-bearing claim
     · checkers don't see each other's work
     · a claim about how software/hardware BEHAVES must be tested, or flagged "needs a real-world test"
   │
   ▼
REVIEW — does the conclusion actually follow from the facts?
   │
   ▼
PARENT drafts an answer
   │
   ▼
ADVERSARIES — paid to refute the draft (correctness · cost · risk · does-it-reproduce)
     └─ anything killed, and any gap, loops back to research ⟲
   │
   ▼
PARENT writes the final report — including everything that died, and why
```

The report states a position, lists what survived, what was refuted, what needs a real-world test, what's still unknown, and a concrete next step.

## Three tiers

| Tier | For | Checks per important claim | Adversary rounds | Typical time |
|---|---|---|---|---|
| **Quick** | A basic fact or narrow question | 1 | 1 | ~10–15 min |
| **Normal** | Most research | 2, independent | up to 2 | ~20–35 min |
| **Max** | Big decisions: architecture, vendors, money, strategy | 3, from different models where available | up to 3 | ~35–60 min |

Say "quick", "max" or "be thorough" to choose one. Otherwise the skill picks, tells you which it picked, and you can override it.

**It won't lock you out of your own plan.** Every tier caps how many agents run at once, so even a Max run leaves room in your Claude usage window for your normal work.

## Why it's built this way

The design came from blind testing: real past research drafts, each seeded with errors that were known to be false, checked repeatedly by several models.

- **A second independent check is the biggest lever.** One checker caught about 91% of the planted errors. Two independent checkers caught about 96%. Which model did the second check mattered much less.
- **Different models miss different things.** That's why Max adds checkers from a different model or company when you have them.
- **Web reading can't settle how things behave.** No checker caught errors about real device behavior from documentation alone. So the skill tests those claims, or labels them "needs a real-world test" instead of passing them.

## Requirements

- **[Claude Code](https://claude.com/claude-code).** That's the only requirement.
- macOS or Linux, with `bash` and `git`.

**Optional, used only in Max runs:**

| Extra | What it adds | Cost notes |
|---|---|---|
| **Claude Fable 5.1** | A second Claude model as an extra checker and adversary | Included on some Claude plans; on others it uses extra usage credits |
| **[OpenAI Codex CLI](https://github.com/openai/codex)** | A checker from a different AI company | Runs on your ChatGPT subscription. The skill **never bills an OpenAI API key** unless you allow it during setup |

Don't have them? Every seat falls back to Claude Opus or Sonnet and everything still works.

## Install

```bash
git clone https://github.com/jasoncumbers/claude-fan-out-fan-in.git
cd claude-fan-out-fan-in
./install.sh
```

This copies one folder into `~/.claude/skills/fan-out-fan-in/` and touches nothing else.

- **Already have a skill with this name?** The installer stops. Re-run with `--force`; your old copy is backed up first.
- **Want `git pull` to update the skill?** Use `./install.sh --link` instead.

## First run

Open a new Claude Code session and ask for research:

```
fan out on: which hosted Postgres should a two-person team pick in 2026?
```

The first time, the skill shows a short welcome and checks which optional tools you have. It asks two quick questions, then saves your answers to `~/.config/fan-out-fan-in/config.json`. It won't ask again. To change your answers later, say *"re-run fan-out setup."*

## Privacy

- If a question involves private code, client data or personal information, the skill keeps the run **inside Claude**: outside vendors are switched off, and researchers search only the general topic.
- You can add your own rules in `config.json` under `privacy_rules`, written in plain English. They apply to every run.
- Reports are saved inside **your** project (in `research/`, by default) and go nowhere else.

## Which model sits where

`skill/fan-out-fan-in/models.json` maps each seat (parent, research, QA, review, adversary, second opinion, Codex) to a model. Model choices are updated after testing. A newer model is not automatically better at a given job.

## Update / uninstall

```bash
git pull && ./install.sh --force   # update (or just `git pull` if you installed with --link)
./uninstall.sh                     # remove the skill
./uninstall.sh --purge             # remove the skill and your settings
```

## License

MIT. See [LICENSE](LICENSE).
