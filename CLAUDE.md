# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Next.js dev server (Turbopack)
npm run build        # production build — also the fastest full typecheck
npm run lint         # eslint (eslint-config-next)
npm test             # vitest, single run
npm run test:watch   # vitest, watch mode
npx vitest run test/trades.test.js          # one file
npx vitest run -t "collapses consecutive"   # one test by name
```

Next 16 (App Router, JavaScript not TypeScript), React 19, Tailwind v4, Vitest,
`@anthropic-ai/sdk`. Tailwind v4 has no `tailwind.config.js` — design tokens live in the
`@theme` block in `app/globals.css`.

`ANTHROPIC_API_KEY` is optional. Unset, the scraper runs hand-written heuristics; set (in
`.env.local`), the same route runs Claude instead. Both return the same shape, so nothing
downstream branches on which one ran.

SQLite lives in `call-slip.db` (gitignored); override with `DATABASE_FILE`. The schema is
applied idempotently on first open — there is no migrate step to run, and deleting the file
is how you start over.

## What this is

A voice-agent backend for trade businesses (starting with plumbing). A business owner
completes an onboarding wizard and hands over their existing materials; an LLM pass extracts
structured facts from that corpus; the approved facts compile into a compact brief that a
teammate's voice agent consumes over an HTTP contract to answer calls and book jobs.

`PLAN.md` defines four sequential phases with explicit done-conditions. Finish one before
starting the next. **Phase 1 (the wizard, local state only) is built. Phase 2 onward is not.**

1. ~~**Onboarding form**~~ — four-screen wizard.
2. ~~**Persistence**~~ — SQLite + Drizzle, saves after each step.
3. ~~**Synthesis**~~ — whole-corpus extraction, price classifier, gap interview.
4. **Agent endpoints** — `/api/agent/v1/brief`, availability, booking, call simulator. **Next.**

Phase 4 is blocked on one thing that isn't in this repo: `stages/01-agent-api-contract.md`,
the frozen field names. Don't invent them — ask.

`stages/` — the detailed spec folder, including the frozen contract at
`stages/01-agent-api-contract.md` — is referenced by `PLAN.md` but is **not in this repo**.
Ask for it rather than reconstructing it. Same for the original `onboarding.jsx` prototype;
the wizard here was built fresh.

## Layout

```
lib/trades.js            the trade definition — the source of truth (read this first)
lib/useOnboarding.js     all wizard state, one hook
lib/format.js            type-driven display formatting for any need's value
lib/scrape/fetch.js      fetch one page + the SSRF guard; HTML → text
lib/scrape/heuristics.js regex extractors, one per named strategy
lib/scrape/claude.js     the same extraction via Claude, when a key is present
lib/fieldSchema.js       need → JSON Schema, shared by both extractors
lib/answered.js          isAnswered, shared by client and server
lib/synthesis/classify.js  the price classifier — read this before touching prices
lib/synthesis/corpus.js  every document into one prompt
lib/synthesis/extract.js the two Claude calls (fields, prices)
lib/synthesis/report.js  facts + conflicts + gaps
lib/db/schema.js         drizzle tables
lib/db/index.js          the connection + idempotent DDL + BUSINESS_ID
lib/db/onboarding.js     the only file that maps wizard shape ↔ rows
app/api/scrape/route.js  POST { url, tradeId } → { fields }
app/api/onboarding/      GET/PATCH state; documents/ POST + DELETE
components/Wizard.jsx    shell: pill step nav, two-column layout, next/back guard
components/NeedField.jsx renders any need from its type alone, plus provenance
components/CallSlip.jsx  the right rail, checks off against needs
components/steps/        the four screens
design/references/       screenshots the visual language is taken from
```

**The wizard is four screens: trade → business → calendar → review.** Everything about the
business lives on one screen (`StepBusiness.jsx`): the website bar, the fields it fills, the
file upload, and the free-text notes. It used to be two screens that *both* asked for the
website, which read as the form having forgotten what you'd told it. There is exactly one
place a website URL is entered — `WebsiteAutofill.jsx`. Don't add a second.

## Architecture invariants

These are the decisions that are expensive to reverse. Preserve them.

**`PLUMBING.needs` in `lib/trades.js` drives everything.** One array feeds five consumers:
the wizard fields (the business screen), the call slip's checklist, the website scraper (via each need's
`scrape` strategy name), Phase 3's extraction targets (via `extract`), and the Phase 3 gap
interview (which uses each need's `question` verbatim). Adding a need there must make it
appear in all five with no other edit.

`NeedField.jsx` switches on `need.type` and never reads `need.key`; `CallSlip.jsx` and
`StepReview.jsx` map over `slip` generically; `heuristics.js` is a registry keyed by strategy
name, and `claude.js` generates its JSON schema from `needs`. **If you find yourself typing a
need's key into JSX or into an extractor, that's the bug** — fix the generic code instead.
`test/trades.test.js` guards the schema shape so a malformed need fails loudly rather than
rendering blank.

**Website values fill; typed values win.** A scrape fills every field the person hasn't typed
themselves, and offers its value on the ones they have (`Provenance` in `NeedField.jsx`).
The manual set lives in a **ref**, not state, in `useOnboarding` — a fetch takes seconds, and
reading it out of a closure would miss anything typed mid-flight and clobber it.

**The scrape route is an SSRF sink.** `url` comes from whoever is filling in the form, so
`lib/scrape/fetch.js` resolves every host and rejects private ranges (loopback, RFC1918,
`169.254.169.254`, CGNAT, IPv6 ULA/link-local) before any request goes out, re-checking on
each redirect hop. `test/fetch.test.js` covers this — treat those tests as a security control,
not a nicety.

**Whole corpus in one prompt** (Phase 3). No chunking, no embeddings, no vector search. A
small trade business's entire document set fits in a single context, which buys better
extraction and exact verbatim citations. Two calls: one for `needs` fields, one for services
and prices. Every extracted fact carries `value`, `confidence`, and its source sentence.

**Not-found is a valid answer.** If the corpus doesn't state something, return `found: false`.
Conflicting documents return both values rather than picking. A missing answer becomes a gap
the owner fills; a guessed one poisons the agent. The review screen says this to the user, so
don't quietly add fallbacks that contradict it. The gap interview lives on the review screen
and renders `NeedField` — the same component the form uses, because both read the same `needs`
array — asking with each need's `question` rather than its `label`.

**Price classification happens in code, never in the prompt** — `lib/synthesis/classify.js`.
Bare number → `quotable`; hedged, ranged, or an hourly rate → `range_only`; everything else,
and anything below `PLUMBING.confidenceFloor` (0.7) → `human_required`. `PLUMBING.alwaysHuman`
(`sewer_line`, `repipe`) overrides any price in any document. The extraction prompt is
explicitly told *not* to judge safety and to preserve qualifying words verbatim, because the
classifier reads them — normalising "$95 per hour" to "$95" would promote a rate to a flat
quote. The unknown case defaults to `human_required`: a shape we don't recognise is one we
don't quote. `test/classify.test.js` covers this, including the "flat $4,000 for sewer work"
case `PLAN.md` names.

**Two extraction paths, one schema.** `lib/scrape/claude.js` reads one page and picks the
best-supported value; `lib/synthesis/extract.js` reads the whole corpus and keeps conflicts.
Both build their JSON Schema with `buildFieldsSchema` in `lib/fieldSchema.js`. That shape —
`found` plus a possibly-empty `values` array — is not incidental: an earlier nullable
`anyOf: [<value>, null]` returned a **500 on every request**. Don't reintroduce nullable
unions over enum/array types.

**List fields can't conflict.** A corpus naming each service in its own sentence has stated
one list, not five competing answers. `isMultiValue`/`mergeMultiValues` fold those before the
conflict logic sees them, so a disagreement in the UI is always a real one.

**Keep `business_id` even without auth.** There is one hardcoded business (`BUSINESS_ID` in
`lib/db/index.js`), but every table carries the column and every query in
`lib/db/onboarding.js` is scoped by it, so accounts become a change of *where the id comes
from* rather than a rewrite. The id is applied server-side and never sent by the client —
there's nothing to tamper with when auth lands. `test/db.test.js` asserts the scoping holds.

**Answers are one row per field, not a JSON blob.** This is the one table `PLAN.md` doesn't
name, and the reason is provenance: each value carries its source (`manual`/`website`),
confidence, and the sentence it was read from. Phase 3 returns exactly that shape per field —
and may return two conflicting values for one key rather than picking — so this is where it
lands. `suggested_value` keeps the website's version even after the owner types over it, which
is what lets the form still offer "use that instead" after a reload.

**Save cadence:** after each step (`next`/`back`/`goToStep`), plus immediately on the discrete
events — trade choice, calendar choice, a completed scrape, and document add/remove. Typing
alone doesn't save; the step transition catches it. `persist()` reads a ref synced in an
effect, so anything that changes state *and* saves in the same handler must pass the new
values through `persist`'s overrides rather than relying on the ref.

**The agent API contract is frozen.** Field names are agreed in writing with the teammate
building the voice agent before either side builds against them. Don't rename or reshape
contract fields unilaterally. Build the endpoints and the call simulator before the voice
agent exists, not after.

## Design language

Taken from `design/references/*.png` (the Merlin marketing site). Tokens are in the `@theme`
block of `app/globals.css`; use those rather than raw hex.

Warm off-white canvas (`canvas`) with white cards, near-black ink, one blue accent. Pill
geometry for buttons, nav tabs and chips. Hairline `line` borders with `shadow-lift` /
`shadow-pop`. Headlines use the `display` utility (tight tracking) and the two-tone trick —
black lead clause, grey continuation, via `StepHeading` in `components/steps/StepTrade.jsx`.
Handwritten asides use `ScriptNote` (Caveat, with a hand-drawn arrow). The pastel mesh that
bleeds off the top edge is the `mesh-top` utility.

Light mode only, on purpose — the reference has no dark mode and the wizard should read as
paper.

## State

Phase 1 is deliberately in-memory: `useOnboarding` holds everything and a refresh starts over.
Keep `answers` flat and serialisable, because Phase 2 posts this exact shape after each step.
Uploaded files are read client-side into `{ kind, name, source, text }`, which is the
`documents` row shape.

## Security rule for customer lookup

Name alone is never verification. Matching a caller on a spoken name and reading back an
address lets anyone who knows a neighbour's name learn where they live and when they'll be
out. Match on the inbound phone number, and require one non-public detail before the agent
discloses anything specific to an account.
