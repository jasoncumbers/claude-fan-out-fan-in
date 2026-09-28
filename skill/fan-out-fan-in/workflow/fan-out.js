export const meta = {
  name: 'fan-out-fan-in',
  description: 'Parent scopes, Research finds, QA independently re-checks, Review tests the logic, Adversaries try to refute the draft, Parent synthesizes',
  whenToUse: 'Called by the fan-out-fan-in skill with args built from its config. Not meant to be launched by hand.',
  phases: [
    { title: 'Scope', detail: 'Parent writes one brief per research angle' },
    { title: 'Research', detail: 'one agent per angle' },
    { title: 'QA', detail: 'independent checkers re-verify every load-bearing claim' },
    { title: 'Review', detail: 'does the conclusion follow from the facts?' },
    { title: 'Draft', detail: 'Parent writes a draft answer' },
    { title: 'Adversarial', detail: 'lenses try to refute the draft; gaps loop back to research' },
    { title: 'Final', detail: 'Parent writes the final report' },
  ],
}

// ---------------------------------------------------------------------------
// args (built by SKILL.md):
// {
//   question, context, tier: 'quick'|'normal'|'max', output_path, today,
//   skill_dir, sensitive: bool,
//   models: { parent, research, qa, review, adversary, second_opinion|null },
//   codex: { enabled: bool, allow_api: bool }
// }
// ---------------------------------------------------------------------------

const A = args || {}
const TIER = ({ quick: 1, normal: 1, max: 1 })[A.tier] ? A.tier : 'normal'
const T = {
  quick:  { angles: '1-2', checkers: 1, lenses: ['logic+correctness+reproduce'], rounds: 1, gapCap: 0, claimCap: 5,  concurrency: 3, separateReview: false, lightEffort: 'medium' },
  normal: { angles: '3-4', checkers: 2, lenses: ['correctness', 'reproduce'],     rounds: 2, gapCap: 3, claimCap: 10, concurrency: 4, separateReview: true,  lightEffort: 'high' },
  max:    { angles: '4-6', checkers: 3, lenses: ['correctness', 'economics', 'risk', 'reproduce'], rounds: 3, gapCap: 5, claimCap: 12, concurrency: 4, separateReview: true,  lightEffort: 'high' },
}[TIER]

const M = Object.assign({
  parent: 'claude-opus-5-5', research: 'claude-sonnet-5', qa: 'claude-opus-5-5',
  review: 'claude-opus-5-5', adversary: 'claude-opus-5-5', second_opinion: null,
}, A.models || {})
const CODEX = !!(A.codex && A.codex.enabled) && !A.sensitive

// --- anti-lockout: never more than T.concurrency agents at once ---------------
// Six parallel headless runs exhausted a Claude plan's 5-hour window in ~3 hours
// during testing. The cap keeps a Max run from locking the user out.
function limiter(n) {
  let active = 0
  const q = []
  const next = () => {
    if (active >= n || !q.length) return
    active++
    const job = q.shift()
    job.fn().then(job.res, job.rej).finally(() => { active--; next() })
  }
  return fn => new Promise((res, rej) => { q.push({ fn, res, rej }); next() })
}
const slot = limiter(T.concurrency)
let agentCount = 0
const run = (prompt, opts) => slot(() => { agentCount++; return agent(prompt, opts) })

// --- shared rules every agent gets -------------------------------------------
const EVIDENCE_RULES = `
EVIDENCE RULES (non-negotiable):
- Grade every claim: MEASURED (read off a primary source today, with URL) · LOCKED (a written decision with a number in it) · INFERRED (reasoned from something measured; show the reasoning) · GUESS (placeholder) · UNVERIFIED (tried, could not establish).
- Never invent a number. A confident wrong number is the most expensive possible output.
- Prefer primary sources: official docs, filings, a vendor's own pricing page, the spec itself. Anything from a site whose business is summarizing other sites is UNVERIFIED by default.
- A vendor's headline rate is not the rate. Read the qualifiers below it.
- Demand a time series, refuse a snapshot, when the question is about a trend or a market.
- Absence of a published figure measures the page, not the world.
- Report what cuts AGAINST the emerging answer as loudly as what supports it.
- Judge facts as of TODAY (${A.today || 'the current date'}) unless the question names another date.`

const PRIVACY = A.sensitive
  ? '\nPRIVACY: this question involves private or client material. Do not paste private data into web searches; search for the general topic only.'
  : ''

const QUESTION_BLOCK = `QUESTION:\n${A.question}\n${A.context ? `\nCONTEXT FROM THE USER / PARENT RECON (a starting point, not gospel — reporting that it is wrong is valuable):\n${A.context}\n` : ''}`

// --- schemas -------------------------------------------------------------------
const S = (properties, required) => ({ type: 'object', properties, required: required || Object.keys(properties) })
const STR = { type: 'string' }, BOOL = { type: 'boolean' }, STRS = { type: 'array', items: { type: 'string' } }

const SCOPE = S({
  restated_question: STR,
  answer_shape: STR,
  angles: { type: 'array', items: S({ id: STR, title: STR, brief: STR, start_points: STRS }) },
  review_focus: STR,
})
const FINDINGS = S({
  summary: STR,
  findings: { type: 'array', items: S({
    claim: STR,
    grade: { type: 'string', enum: ['MEASURED', 'LOCKED', 'INFERRED', 'GUESS', 'UNVERIFIED'] },
    sources: STRS, load_bearing: BOOL, testable: BOOL, test_idea: STR,
  }) },
  against: STRS,
  gaps: STRS,
})
const CHECK = S({
  unavailable: BOOL,
  verdicts: { type: 'array', items: S({
    id: STR,
    verdict: { type: 'string', enum: ['CONFIRMED', 'REFUTED', 'UNVERIFIED', 'NEEDS_REAL_WORLD_TEST'] },
    reason: STR, correct_fact: STR, evidence: STRS, tested: BOOL,
  }) },
})
const REVIEW = S({
  follows: BOOL,
  problems: { type: 'array', items: S({ kind: STR, detail: STR }) },
  missing: STRS,
  research_gaps: STRS,
})
const ADVERSARY = S({
  refutations: { type: 'array', items: S({
    target: STR, why: STR, evidence: STRS,
    severity: { type: 'string', enum: ['fatal', 'major', 'minor'] },
  }) },
  gaps: STRS,
})
const FINAL = S({ path: STR, headline: STR, recommendation: STR })

// --- helpers -------------------------------------------------------------------
const claimList = cs => cs.map(c => `${c.id}: ${c.claim}`).join('\n')

const CHECK_TASK = (cs, withSources) => `You are an independent fact-checker. For EACH claim below, go and look for yourself.
${withSources ? 'The researcher cited sources (listed per claim). Verify against the PRIMARY source; do not trust the citation.' : 'You are deliberately NOT shown the researcher\'s sources. Find your own primary sources independently.'}
- CONFIRMED: you found primary evidence it is true.
- REFUTED: you found primary evidence it is false. State the correct fact.
- UNVERIFIED: you genuinely could not establish it either way. Never use "probably right".
- NEEDS_REAL_WORLD_TEST: the claim is about how software/hardware actually behaves and can only be settled by running it.
  If you CAN test it safely (run a small script in a temporary directory, no network writes, no installs outside that directory), do it and report CONFIRMED/REFUTED with tested=true.
  Web documentation alone must NOT confirm a behavioral claim that a real test could settle — say NEEDS_REAL_WORLD_TEST instead.
${EVIDENCE_RULES}${PRIVACY}

CLAIMS:
${cs.map(c => `${c.id}: ${c.claim}${withSources && c.sources && c.sources.length ? `\n   cited: ${c.sources.join(' ; ')}` : ''}`).join('\n')}

Return one verdict per claim id. Set unavailable=false.`

function codexCheck(cs, label) {
  const inner = `${CHECK_TASK(cs, false)}

Output exactly one line per claim, nothing else:
<id> | CONFIRMED|REFUTED|UNVERIFIED|NEEDS_REAL_WORLD_TEST | reason (with correct fact if REFUTED) | evidence URL(s)`
  return run(`Run this exact command with the Bash tool (set timeout to 600000 ms). Do not modify it:

bash '${A.skill_dir}/scripts/codex-check.sh'${A.codex && A.codex.allow_api ? ' --allow-api' : ''} <<'FANOUT_CODEX_EOF'
${inner}
FANOUT_CODEX_EOF

If the output starts with CODEX_UNAVAILABLE, return {"unavailable": true, "verdicts": []}.
Otherwise convert each output line into a verdict object (id, verdict, reason, correct_fact = the corrected fact or "", evidence = URLs, tested = false) and return {"unavailable": false, "verdicts": [...]}.
Do not add your own judgment — you are only transcribing the external checker's verdicts.`,
    { label, phase: 'QA', schema: CHECK, model: M.research, effort: 'low' })
}

// Which model/tool fills checker seat i (0-based). Seat 0 always sees sources.
function checkerSeat(i) {
  if (i === 1 && TIER === 'max' && M.second_opinion) return { kind: 'claude', model: M.second_opinion, name: 'second-opinion' }
  if (i === 2 && TIER === 'max' && CODEX) return { kind: 'codex', name: 'codex' }
  return { kind: 'claude', model: M.qa, name: `qa-${i + 1}` }
}

async function checkClaims(cs, tag) {
  if (!cs.length) return []
  const seats = Array.from({ length: T.checkers }, (_, i) => checkerSeat(i))
  const results = await Promise.all(seats.map(async (seat, i) => {
    const label = `check:${tag}:${seat.name}`
    let r = null
    if (seat.kind === 'codex') {
      r = await codexCheck(cs, label)
      if (!r || r.unavailable) {
        log(`Codex seat unavailable for ${tag} (limit reached or not logged in) — falling back to ${M.qa}`)
        r = await run(CHECK_TASK(cs, false), { label: `${label}-fallback`, phase: 'QA', schema: CHECK, model: M.qa, effort: 'high' })
      }
    } else {
      r = await run(CHECK_TASK(cs, i === 0), { label, phase: 'QA', schema: CHECK, model: seat.model, effort: 'high' })
    }
    return r
  }).map(p => p.catch(() => null)))
  const got = results.filter(Boolean)
  return cs.map(c => {
    const vs = got.map(r => (r.verdicts || []).find(v => v.id === c.id)).filter(Boolean)
    const n = vs.length
    const count = k => vs.filter(v => v.verdict === k).length
    const maj = Math.floor(n / 2) + 1
    let status
    if (!n) status = 'UNCHECKED'
    else if (count('REFUTED') >= maj) status = 'REFUTED'
    else if (count('REFUTED') > 0) status = 'CONTESTED'
    else if (count('CONFIRMED') >= maj) status = 'CONFIRMED'
    else if (count('NEEDS_REAL_WORLD_TEST') > 0) status = 'NEEDS_REAL_WORLD_TEST'
    else status = 'UNVERIFIED'
    return Object.assign({}, c, { status, checks: n, votes: vs })
  })
}

async function researchAngle(angle, extraNote) {
  const r = await run(`You are a researcher on ONE angle of a larger question. Other agents cover other angles — stay on yours. Your job is discovery, not judgment.

${QUESTION_BLOCK}
YOUR ANGLE: ${angle.title}
BRIEF: ${angle.brief}
${angle.start_points && angle.start_points.length ? `START FROM: ${angle.start_points.join(' ; ')}` : ''}
${extraNote || ''}
${EVIDENCE_RULES}${PRIVACY}

Return findings as atomic, checkable claims (one fact each). Mark load_bearing=true for any claim the final answer would depend on. Mark testable=true when the claim is about how software/hardware behaves and could be settled by running something; put the test in test_idea. List what cuts against the likely answer in "against", and anything you could not reach in "gaps".`,
    { label: `research:${angle.id}`, phase: 'Research', schema: FINDINGS, model: M.research, effort: T.lightEffort })
  if (!r) return { angle, summary: '(research agent failed)', findings: [], against: [], gaps: [`Angle "${angle.title}" returned nothing`] }
  const all = (r.findings || []).map((f, i) => Object.assign({ id: `${angle.id}.${i + 1}` }, f))
  const lb = all.filter(f => f.load_bearing)
  const toCheck = lb.slice(0, T.claimCap)
  if (lb.length > toCheck.length) log(`Angle ${angle.id}: ${lb.length - toCheck.length} load-bearing claims over the cap of ${T.claimCap} were NOT independently checked`)
  const checked = await checkClaims(toCheck, angle.id)
  const unchecked = all.filter(f => !toCheck.includes(f)).map(f => Object.assign({}, f, { status: 'NOT_CHECKED' }))
  return { angle, summary: r.summary, findings: checked.concat(unchecked), against: r.against || [], gaps: r.gaps || [] }
}

const ledger = results => results.map(r =>
  `## Angle ${r.angle.id}: ${r.angle.title}\n${r.summary}\n` +
  r.findings.map(f => `- [${f.status}${f.checks ? ` ${f.checks} checks` : ''}] (${f.id}, ${f.grade}) ${f.claim}` +
    (f.votes && f.votes.some(v => v.verdict !== 'CONFIRMED')
      ? `\n    checker notes: ${f.votes.filter(v => v.verdict !== 'CONFIRMED').map(v => `${v.verdict}: ${v.reason}${v.correct_fact ? ` → ${v.correct_fact}` : ''}${v.evidence && v.evidence.length ? ` [${v.evidence.join(', ')}]` : ''}`).join(' | ')}` : '') +
    (f.sources && f.sources.length ? `\n    sources: ${f.sources.join(', ')}` : '')).join('\n') +
  (r.against.length ? `\nCuts against: ${r.against.join(' ; ')}` : '') +
  (r.gaps.length ? `\nGaps: ${r.gaps.join(' ; ')}` : '')).join('\n\n')

// =============================================================================
phase('Scope')
log(`Tier: ${TIER.toUpperCase()} · checkers per claim: ${T.checkers} · adversary rounds ≤ ${T.rounds} · max ${T.concurrency} agents at once${A.sensitive ? ' · SENSITIVE: external vendors off' : ''}`)

const scope = await run(`You are the PARENT of a research team. Scope this question and brief the Research team.

${QUESTION_BLOCK}
Write ${T.angles} research angles. Each angle must be DISTINCT and narrowly defined — never give two agents overlapping briefs. Name the real open questions and concrete starting points (URLs, docs, files) in each brief. A generic brief produces generic work.
Also state the shape a good answer must take (answer_shape) and what the Review team should scrutinize (review_focus).
Use short ids like a, b, c.`,
  { label: 'parent:scope', phase: 'Scope', schema: SCOPE, model: M.parent, effort: 'high' })
if (!scope || !scope.angles || !scope.angles.length) {
  return { error: 'Parent failed to scope the question', agents: agentCount }
}

// Research → QA per angle, no barrier between angles
phase('Research')
let results = (await Promise.all(scope.angles.map(a => researchAngle(a).catch(() => null)))).filter(Boolean)

// Review (needs all findings at once)
phase('Review')
let review = null
if (T.separateReview) {
  review = await run(`You are the REVIEW team. QA already checked whether the facts are TRUE. Your job is whether the reasoning FOLLOWS.

${QUESTION_BLOCK}
Answer shape the Parent expects: ${scope.answer_shape}
Focus: ${scope.review_focus}

FINDINGS LEDGER (status from independent QA):
${ledger(results)}

Ask: Does the likely conclusion actually follow, or was it assumed and decorated? Is the framing right — is this even the question that needed answering? What is MISSING (a source unread, a modality not run, a claim unverified)? Did researchers agree too easily (agreement is not evidence; consensus resting on one upstream source is one source)? Is a metric doing sleight of hand? Put anything that needs more research in research_gaps (max ${T.gapCap}).`,
    { label: 'review', phase: 'Review', schema: REVIEW, model: M.review, effort: 'high' })
}

const reviewText = r => !r ? '(no separate review at this tier)' :
  `follows=${r.follows}\n${(r.problems || []).map(p => `- ${p.kind}: ${p.detail}`).join('\n')}\nMissing: ${(r.missing || []).join(' ; ')}`

async function fillGaps(gaps, round) {
  if (!T.gapCap) { if (gaps.length) log(`Round ${round}: ${gaps.length} research gaps noted but not pursued at the ${TIER} tier — they go in the report as open questions`); return [] }
  const gs = gaps.slice(0, T.gapCap)
  if (gaps.length > gs.length) log(`Round ${round}: ${gaps.length - gs.length} research gaps over the cap of ${T.gapCap} were not pursued`)
  const extra = await Promise.all(gs.map((g, i) => researchAngle(
    { id: `g${round}${String.fromCharCode(97 + i)}`, title: `Gap: ${g}`, brief: `Close this specific gap raised by review/adversaries: ${g}`, start_points: [] },
    'This is a follow-up on a gap found after the first pass. Be specific and primary-sourced.').catch(() => null)))
  return extra.filter(Boolean)
}

// Research gaps from review, before drafting
if (review && review.research_gaps && review.research_gaps.length) {
  phase('Research')
  results = results.concat(await fillGaps(review.research_gaps, 0))
}

// Draft
phase('Draft')
const draftPrompt = (prior, attacks) => `You are the PARENT. Write the answer to the question from the ledger below.

${QUESTION_BLOCK}
Answer shape: ${scope.answer_shape}

LEDGER (every load-bearing claim was independently checked; status is the checkers' consensus):
${ledger(results)}

REVIEW:
${reviewText(review)}
${prior ? `\nYOUR PREVIOUS DRAFT:\n${prior}\n\nADVERSARIES RAISED (address each: fix, rebut with evidence, or concede):\n${attacks}` : ''}

Rules: state the answer as a POSITION ("it's nuanced" is a failed synthesis). Build only on CONFIRMED claims; anything CONTESTED must be resolved by the primary source, never by picking the more confident agent. Never present an UNVERIFIED, NOT_CHECKED or NEEDS_REAL_WORLD_TEST claim as fact — label it. Return the draft as markdown, with a short "Key claims this answer rests on" list at the end.`

let draft = await run(draftPrompt(null, null), { label: 'parent:draft', phase: 'Draft', model: M.parent, effort: T.lightEffort })

// Adversarial loop — always on
phase('Adversarial')
const LENS = {
  'correctness': 'CORRECTNESS: is any stated fact wrong, outdated, or unsupported by its source?',
  'economics': 'ECONOMICS: are costs, prices, limits, or ROI claims wrong, missing qualifiers, or computed on a misleading denominator?',
  'risk': 'RISK & SECURITY: what could go wrong that the draft ignores — legal, security, privacy, lock-in, irreversibility?',
  'reproduce': 'DOES IT REPRODUCE: which claims about how something BEHAVES rest only on documentation? Try to reproduce them (run a small test in a temp dir) or flag them as needing a real-world test.',
  'logic+correctness+reproduce': 'LOGIC, CORRECTNESS & REPRODUCIBILITY: does the conclusion follow? is any fact wrong? is any behavioral claim untested?',
}
const raised = []
let roundsRun = 0
for (let round = 1; round <= T.rounds; round++) {
  roundsRun = round
  const attacks = (await Promise.all(T.lenses.map((lens, i) =>
    run(`You are an ADVERSARY. You are paid to REFUTE this draft, not to check it. Default to skepticism.
Lens: ${LENS[lens]}

${QUESTION_BLOCK}
DRAFT:
${draft}

LEDGER THE DRAFT WAS BUILT FROM:
${ledger(results)}
${raised.length ? `\nALREADY RAISED IN EARLIER ROUNDS (do NOT repeat; report only NEW problems):\n${raised.map(r => `- ${r.target}: ${r.why}`).join('\n')}` : ''}
${EVIDENCE_RULES}${PRIVACY}

Return refutations with primary-source evidence and a severity. Put anything that needs new research in gaps. If you find nothing new of substance, return empty arrays — that is a valid, valuable answer.`,
      { label: `adversary:r${round}:${lens}`, phase: 'Adversarial', schema: ADVERSARY, effort: 'high',
        model: (TIER === 'max' && i === 0 && M.second_opinion) ? M.second_opinion : M.adversary })))).filter(Boolean)

  const fresh = attacks.flatMap(a => a.refutations || []).filter(r => r.severity !== 'minor')
  const gaps = attacks.flatMap(a => a.gaps || [])
  log(`Round ${round}: ${fresh.length} major/fatal refutations, ${gaps.length} gaps`)
  if (!fresh.length && !gaps.length) break
  raised.push(...fresh)
  if (gaps.length) results = results.concat(await fillGaps(gaps, round))
  draft = await run(draftPrompt(draft, fresh.map(r => `- [${r.severity}] ${r.target}: ${r.why} ${r.evidence && r.evidence.length ? `[${r.evidence.join(', ')}]` : ''}`).join('\n') || '(only new research gaps; see ledger)'),
    { label: `parent:redraft:r${round}`, phase: 'Draft', model: M.parent, effort: T.lightEffort })
}

// Final
phase('Final')
const all = results.flatMap(r => r.findings)
const tally = k => all.filter(f => f.status === k).length
const stats = {
  tier: TIER, agents: agentCount + 1, rounds: roundsRun,
  claims_checked: all.filter(f => f.checks).length,
  confirmed: tally('CONFIRMED'), refuted: tally('REFUTED'), contested: tally('CONTESTED'),
  unverified: tally('UNVERIFIED'), needs_real_world_test: tally('NEEDS_REAL_WORLD_TEST'), not_checked: tally('NOT_CHECKED'),
}
const final = await run(`You are the PARENT. Write the FINAL report and save it with the Write tool to exactly this path: ${A.output_path}

${QUESTION_BLOCK}
FINAL DRAFT (survived ${roundsRun} adversarial round(s)):
${draft}

LEDGER:
${ledger(results)}

REFUTATIONS RAISED DURING ADVERSARIAL REVIEW:
${raised.map(r => `- [${r.severity}] ${r.target}: ${r.why}`).join('\n') || '(none of substance)'}

RUN STATS: ${JSON.stringify(stats)}

The report is a SYNTHESIS, not a summary. Sections, in order:
1. The answer — a position, stated plainly.
2. Consensus findings that survived QA (note where consensus rests on one upstream source).
3. Strong single findings that survived QA and adversarial review.
4. What died, and why — every REFUTED claim and conceded refutation. This list is part of the deliverable.
5. Contradictions, and how the primary source resolved them.
6. Needs a real-world test — behavioral claims web evidence could not settle, with the cheapest test for each.
7. Still unknown, and the cheapest thing that would settle it.
8. Recommended next action — concrete.
9. Method — tier, models used per seat, checks per claim, rounds, and the run stats above. Keep it short.
Grade claims inline (MEASURED/INFERRED/…) and cite URLs. Write for a smart non-specialist: plain English, jargon translated.
Return {path, headline (one sentence), recommendation (one sentence)}.`,
  { label: 'parent:final', phase: 'Final', schema: FINAL, model: M.parent, effort: 'high' })

return Object.assign({}, final || { path: A.output_path, headline: '(final writer failed — draft below)', recommendation: '' }, { stats, draft: final ? undefined : draft })
