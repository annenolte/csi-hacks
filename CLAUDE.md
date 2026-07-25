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
`@anthropic-ai/sdk`, `@supabase/supabase-js`. Tailwind v4 has no
`tailwind.config.js` — design tokens live in the `@theme` block in `app/globals.css`.

**Setup is not optional.** `ANTHROPIC_API_KEY` and Supabase credentials are both
required; the app tells you which is missing rather than half-working.
`docs/SETUP.md` is the walkthrough — Supabase project, `supabase/schema.sql`, and
the Google Cloud OAuth client. `supabase/schema.sql` is idempotent: re-running it
is how you apply a schema change, and there is no migration tool.

## What this is

A voice-agent backend for trade businesses (starting with plumbing). An owner
signs up, talks to a specialist onboarding agent that reads their website and
their documents, answers whatever it couldn't find, and gets a phone number to
give customers. The knowledge it collects is what a teammate's voice agent will
read before it answers a call.

**We are not building the calling agent.** We build the layer that gets handed to
it. Three pages:

1. **Landing** (`app/page.js`) — marketing, sign in, create an account.
2. **Onboarding** (`app/onboarding/`) — a conversation, not a form.
3. **Dashboard** (`app/dashboard/`) — the number, the calendar, the documents, and
   an editable view of everything the agent knows.

### What isn't built

The agent API itself — `/api/agent/v1/brief`, availability, booking. It is
deliberately not built yet: the shape of that seam depends on the voice agent
that already exists on the teammate's side, and guessing at field names is the
single most likely way this project breaks.
`docs/voice-agent-integration-request.md` is the prompt sent to that side asking
their agent to document what it consumes. **Build the endpoints when that document
comes back, not before, and don't invent field names in the meantime.**

The read/write pieces the API will need already exist and are tested by use:
`busyPeriods` and `createEvent` in `lib/calendar/google.js`.

## Layout

```
lib/trades.js              the trade definition — the source of truth (read this first)
lib/brand.js               product name; it is a placeholder, renamed in one line
lib/supabase.js            the only place the service-role key is read
lib/data/business.js       the only file mapping app shapes to rows
lib/data/conversation.js   onboarding transcript persistence
lib/auth/password.js       scrypt hashing — a security control, not a utility
lib/auth/session.js        signed httpOnly cookie + a sessions row
lib/auth/require.js        where business_id comes from. Every data route starts here
lib/onboarding/engine.js   the script: stages, side effects, what happens next
lib/onboarding/agent.js    the two model calls that make it read as a conversation
lib/onboarding/components.js  the closed set of inputs the agent can render
lib/onboarding/phone.js    the generated number (555-01xx, reserved for fiction)
lib/synthesis/run.js       whole-corpus read, shared by onboarding and the dashboard
lib/synthesis/classify.js  the price classifier — read this before touching prices
lib/scrape/fetch.js        fetch one page + the SSRF guard; HTML → text
lib/scrape/claude.js       single-page extraction
lib/calendar/google.js     OAuth, token refresh, free/busy, event creation
lib/fieldSchema.js         need → JSON Schema, shared by both extractors
components/NeedField.jsx   renders any need from its type alone
components/onboarding/     the chat and the structured inputs it renders
components/dashboard/      overview and knowledge tabs
supabase/schema.sql        the whole schema, idempotent, RLS on with no policies
```

## Architecture invariants

These are the decisions that are expensive to reverse. Preserve them.

**`PLUMBING.needs` in `lib/trades.js` drives everything.** One array feeds five
consumers: the questions the onboarding agent asks (using each need's `question`
verbatim), the dashboard's knowledge rows, the website scraper (via `scrape`),
whole-corpus extraction (via `extract`), and the gap queue. Adding a need there
must make it appear in all five with no other edit.

`NeedField.jsx` switches on `need.type` and never reads `need.key`;
`Knowledge.jsx` maps over the needs list generically; `claude.js` and `extract.js`
generate their JSON schema from `needs`. **If you find yourself typing a need's
key into JSX or into an extractor, that's the bug** — fix the generic code
instead. `test/trades.test.js` guards the schema shape.

The one deliberate exception is the `followups` key: model-composed
question-and-answer pairs that aren't needs and don't pretend to be. They get
their own block on the dashboard rather than being flattened into a row.

**The script is code; the words are the model's.** `lib/onboarding/engine.js`
decides which stage comes next, which component renders, and what gets written.
`lib/onboarding/agent.js` writes the prose. That split is why the conversation
can feel open-ended without ever skipping a question or stranding someone. If you
are tempted to let the model choose the next stage, don't — a conversation that
can wander is a conversation that can lose someone at step three. The one place
the model composes structure is `draftFollowups`, and even there it picks from
`choice` or `text` and nothing else.

**business_id comes from the session, never from the client.** `requireBusiness()`
in `lib/auth/require.js` is the only place it is decided. No route reads a
business id from a body or a query string, which is what makes one shared
service-role connection safe. Adding a route that takes a business id from the
client re-opens every account to every other.

**The service-role key bypasses RLS, so `lib/supabase.js` is `server-only`.** The
schema enables RLS on every table with no policies — it fails closed. The browser
never talks to Supabase. Never prefix the service-role key with `NEXT_PUBLIC_`.

**The scrape path is an SSRF sink.** The URL comes from whoever is filling in the
form, so `lib/scrape/fetch.js` resolves every host and rejects private ranges
(loopback, RFC1918, `169.254.169.254`, CGNAT, IPv6 ULA/link-local) before any
request goes out, re-checking on each redirect hop. `test/fetch.test.js` covers
this — treat those tests as a security control, not a nicety.

**Whole corpus in one prompt.** No chunking, no embeddings, no vector search. A
small trade business's entire document set fits in one context, which buys better
extraction and exact verbatim citations. Two calls: one for `needs` fields, one
for services and prices. Every extracted fact carries `value`, `confidence`, and
its source sentence.

**Not-found is a valid answer.** If the corpus doesn't state something, the
extractor returns `found: false`. Conflicting documents return both values rather
than picking. A missing answer becomes a question the owner answers; a guessed one
gets repeated to real callers as though the business had promised it. Only facts
that are unconflicted *and* at or above 0.7 confidence are promoted into
`business_fields` (`lib/synthesis/run.js`) — everything else becomes a question.
Don't add fallbacks that contradict this.

**Price classification happens in code, never in the prompt** —
`lib/synthesis/classify.js`. Bare number → `quotable`; hedged, ranged, or an
hourly rate → `range_only`; everything else, and anything below
`PLUMBING.confidenceFloor` (0.7) → `human_required`. `PLUMBING.alwaysHuman`
(`sewer_line`, `repipe`) overrides any price in any document. The extraction
prompt is explicitly told *not* to judge safety and to preserve qualifying words
verbatim, because the classifier reads them — normalising "$95 per hour" to "$95"
would promote a rate to a flat quote. The unknown case defaults to
`human_required`: a shape we don't recognise is one we don't quote.
`test/classify.test.js` covers this, including "flat $4,000 for sewer work".

**Two extraction paths, one schema.** `lib/scrape/claude.js` reads one page and
picks the best-supported value; `lib/synthesis/extract.js` reads the whole corpus
and keeps conflicts. Both build their JSON Schema with `buildFieldsSchema` in
`lib/fieldSchema.js`. That shape — `found` plus a possibly-empty `values` array —
is not incidental: an earlier nullable `anyOf: [<value>, null]` returned a **500
on every request**. Don't reintroduce nullable unions over enum/array types.

**List fields can't conflict.** A corpus naming each service in its own sentence
has stated one list, not five competing answers. `isMultiValue`/`mergeMultiValues`
fold those before the conflict logic sees them, so a disagreement in the UI is
always a real one.

**A document change re-reads everything.** Adding or removing a document re-runs
the whole corpus rather than diffing. A removed document has to take its facts
with it, and a new one can contradict an old one — neither is expressible as an
incremental update, and a stale fact here is one the agent states on a call.

**Text documents only.** We quote sentences back as the source of every fact.
Accepting a PDF and silently extracting a mangled text layer would put
unattributable quotes in front of the owner as if they were verbatim.

**The generated phone number is from the 555-01xx block.** That range is reserved
by the numbering plan for fiction and is the only one guaranteed never to ring a
real person. A realistic-looking number would mean printing a stranger's phone
number on a dashboard and telling a business to hand it to customers.

**Google needs `access_type=offline` and `prompt=consent`.** Without both, Google
omits the refresh token on every authorisation after the first, and the connection
works today and silently breaks within the hour. `completeConnection` refuses to
store a connection without one.

## Design language

Taken from `design/references/*.png` (the Merlin marketing site). Tokens are in
the `@theme` block of `app/globals.css`; use those rather than raw hex.

Warm off-white canvas (`canvas`) with white cards, near-black ink, one blue
accent. Pill geometry for buttons, nav tabs and chips. Hairline `line` borders
with `shadow-lift` / `shadow-pop`. Headlines use the `display` utility (tight
tracking) and the two-tone trick — black lead clause, grey continuation, via
`Heading` in `components/ui.jsx`. Handwritten asides use `ScriptNote` (Caveat,
with a hand-drawn arrow). The pastel mesh that bleeds off the top edge is the
`mesh-top` utility.

Light mode only, on purpose — the reference has no dark mode and the product
should read as paper.

## Security rule for customer lookup

Name alone is never verification. Matching a caller on a spoken name and reading
back an address lets anyone who knows a neighbour's name learn where they live and
when they'll be out. Match on the inbound phone number, and require one non-public
detail before the agent discloses anything specific to an account. This has to
hold on the voice-agent side too — it is section 7 of
`docs/voice-agent-integration-request.md` for exactly that reason.
