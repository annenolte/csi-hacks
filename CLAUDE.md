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
lib/onboarding/describe.js an answer in words and in files — the transcript line, on both sides
lib/onboarding/stream.js   how the agent's words reach the browser as it writes them
lib/onboarding/phone.js    the generated number (555-01xx, reserved for fiction)
lib/synthesis/run.js       whole-corpus read, shared by onboarding and the dashboard
lib/synthesis/classify.js  the price classifier — read this before touching prices
lib/documents/formats.js   what an upload may be — one table, read by both sides
lib/documents/convert.js   a reader per format; server-only, and no OCR by design
lib/documents/text.js      tables, unwrapping, tidying — the judgement calls
lib/scrape/fetch.js        fetch one page + the SSRF guard; HTML → text
lib/scrape/claude.js       single-page extraction
lib/calendar/google.js     OAuth, token refresh, free/busy, event creation
lib/cache/store.js         read-through cache for slow work that is a pure function
lib/cache/keys.js          every cache key, built in one place
lib/demo/site.js           the one hostname whose setup replays that cache
demo/                      the demo set and its recording — read demo/README.md
lib/fieldSchema.js         need → JSON Schema, shared by both extractors
components/NeedField.jsx   renders any need from its type alone
components/onboarding/     the chat and the structured inputs it renders
components/dashboard/      overview and knowledge tabs
components/landing/        the marketing page's motion — no animation library
components/Mark.jsx        the brand glyph, in currentColor, drawn once
components/AppHeader.jsx   the header every signed-in screen shares
components/AuthForm.jsx    both auth screens; one form, two field lists
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

**A turn is streamed, and the stream is a preview.** `/api/onboarding/turn`
answers with newline-delimited JSON: any number of `delta` frames carrying the
agent's words as the model writes them, then exactly one `done` frame with the
saved messages and the next component. The client draws the deltas and throws
them away when `done` lands, which is what makes it safe for a failed model call
to fall back to different wording halfway through a sentence. `composeTurn` finds
its reader through `lib/onboarding/stream.js` rather than taking a callback, so
the script stays ignorant of whether anyone is watching.

The client also echoes the answer into the transcript on click, before the server
has confirmed anything, using the same `describeAnswer` and `attachmentsIn` the
server writes with. Both sides calling one function is the point: a bubble whose
wording changed a second after it appeared would be worse than the wait it
removed.

**Uploaded files are shown as files.** An upload answers with no sentence at all
— `describeAnswer` returns null for it — and the transcript draws a card per
document instead, name, format badge and size, on the person's own side. A
document is a thing someone recognises on sight, where
`prices.pdf, hours.docx, induction.docx` is a line of text to be parsed. The
message stores names and sizes only: the text of a forty-page PDF is already
stored as a document, and a second copy in the transcript would be megabytes in a
row whose only reader draws a box with a filename on it.

**The interview asks what it has to, and no more.** `interviewQueue` keeps the
needs marked `required` plus anything two documents disagreed about; an optional
need nothing answered is left to the dashboard, one field on a page the owner is
about to land on. `draftFollowups` is capped at `MAX_FOLLOWUPS` (2). Both limits
are about the same thing — every extra question is one more chance to lose
someone one step from the end — and neither reads a need's key.

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

**A disagreement in the UI is always a real one**, and three rules in
`lib/synthesis/report.js` keep it that way. Lists can't conflict: a corpus naming
each service in its own sentence has stated one list, not five competing answers,
and `isMultiValue`/`mergeMultiValues` fold those before the conflict logic sees
them. Neither can prose (`isProse`): a handbook that describes the business over a
page and a price list that describes it in a line have not contradicted each
other — one said more, so the fuller one wins and both sentences stay as its
sources. And restating an answer isn't disagreeing with it, so values that differ
only in case, spacing, trailing punctuation, or list order collapse into the
best-supported one. Telling an owner their documents say two different things and
then showing them the same answer twice makes the extraction look broken and
costs them a question they had no reason to be asked.

**A document change re-reads everything.** Adding or removing a document re-runs
the whole corpus rather than diffing. A removed document has to take its facts
with it, and a new one can contradict an old one — neither is expressible as an
incremental update, and a stale fact here is one the agent states on a call.

**The cache only ever holds our own output, keyed by its own input.**
`lib/cache/store.js` is a read-through cache — memory, then `.cache/`, then the
checked-in recording in `demo/recordings/` — and everything in it is work we
could do again: a file turned into text, a page fetched and extracted, a corpus
read. A miss does the real work; a hit replays that work's own result, conflicts
and quoted sentences and all. It is never a source of facts, and nothing in this
repo may hand it an answer that wasn't produced by the thing it stands in for —
which is why `demo/recordings/` is filled by `npm run demo:record` copying a real
run out of `.cache/`, and never by hand. A failure is never cached: a dropped
connection must not become a document that can never be read again.

Every key is built in `lib/cache/keys.js` and nowhere else. A key is a promise
that one input produced one output, and two callers computing the same key
slightly differently is how a cache starts answering with the wrong thing — the
recorder in particular looks entries up by the same functions the app writes them
with. Changing what goes into one of these calls means bumping its `.vN` tag,
which retires every recording made under the old one at a stroke.

Reading a file is cached for everyone, because the text of a PDF is a function of
its bytes and nothing else. The three model-backed reads — single-page
extraction, whole-corpus extraction, follow-up drafting — are cached **only when
the business's website is `lib/demo/site.js`'s one hostname**. That gate is a
hostname rather than an environment variable on purpose: a flag left on would
serve a real customer someone else's reading of their documents, where a hostname
can only ever match the business whose site it is. On that same path the agent's
prose comes from each turn's `fallback` instead of the model — the one thing on
the demo path that isn't a recording, and safe only because a turn's wording
carries no facts. Everything a demo shows on the dashboard is the real
extractor's real output. `demo/README.md` is how to run one, and how to re-record
after changing a prompt, a reader, or the trade definition.

**Documents are read, never guessed at.** PDF, Word, Excel, PowerPoint, HTML and
plain text all go through `lib/documents/`: `formats.js` is the one table of what
we take, `convert.js` holds a reader per kind, `text.js` holds the shaping. Every
reader pulls the author's own characters out of the file — pdf.js reads the text
layer, mammoth reads Word's own styles, the .pptx reader walks `<a:t>` runs. **There
is no OCR and there must not be**, because we quote these sentences back as the
source of every fact and a misread digit in a price is a number a real caller
gets quoted. A PDF with no text layer is refused by name; the old binary formats
(.doc, .xls) and the iWork ones are refused with the export that would work.

Two shaping decisions are load-bearing and covered by `test/documents.test.js`.
Tables stay tables (`toMarkdownTable`) — a price list flattened to loose cells
has lost which number belongs to which service. And `unwrapLines` rejoins
hard-wrapped prose but is deliberately timid about it: it only joins when the
break is unambiguously mid-clause, because merging two rows of a price list is
worse than an ugly line break.

Conversion happens on the server, in `/api/documents/extract`, which stores
nothing. Onboarding and the dashboard both post files there and carry on with the
`{ name, text }` they already handled. The browser parses nothing — one reader is
one set of rules about what a document says.

One request per file, and the route reads a batch in parallel. A drop is only as
slow as its own worst file rather than the sum of all of them, and each upload
card can settle when its own file is read — the .txt doesn't sit hidden behind
the forty-page PDF. `readFile` never rejects; a batch drop is routinely part
right, and four price lists read with one scanned invoice refused is a useful
outcome rather than a failed upload.

**The generated phone number is from the 555-01xx block.** That range is reserved
by the numbering plan for fiction and is the only one guaranteed never to ring a
real person. A realistic-looking number would mean printing a stranger's phone
number on a dashboard and telling a business to hand it to customers.

**Google needs `access_type=offline` and `prompt=consent`.** Without both, Google
omits the refresh token on every authorisation after the first, and the connection
works today and silently breaks within the hour. `completeConnection` refuses to
store a connection without one.

**Onboarding asks for the calendar, and the callback comes back to it.** Booking
is what the agent is for, and an agent that can't see the diary can only take
messages — so the offer is the last step of the conversation, not something to
find on the dashboard later. Connecting means leaving the page, so where Google
returns to is a **closed list** in `lib/calendar/return-to.js`, keyed by a cookie
set when the flow starts: `next` arrives in a query string, and redirecting to a
path someone else wrote is the one bug that turns this route into an open
redirect. The conversation is answered on the person's behalf from the flag in
the URL — but the transcript line and the stage both come from the stored
connection, never from that flag, so a failed hand-off can't leave a transcript
claiming a calendar that isn't connected. If Google isn't configured on the
server, or it's already connected, the stage is skipped rather than shown dead.

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

### The landing page's motion

`app/page.js` follows the reference section for section, and the six pieces that
give it that feel live in `components/landing/`: `SplitText` (the headline
arrives a character at a time), `HoverRoll` (a link label rolls up and a
duplicate takes its place), `ShimmerButton` (a conic gradient turning behind a
pill, clipped to a ring), `Cursor` (a dot trailing the pointer), `FloatingNav`
(a translucent pill that appears once the hero is behind you) and `PressSpace`
(the footer shortcut). `Reveal` fades sections up as they arrive.

`CallMock` plays rather than sits there: the exchange starts when the panel is
on screen and lands a line at a time, with the agent thinking before it answers.
Every bubble is in the DOM at its final size from the first paint and only its
opacity changes, so nothing below the panel moves while the call runs, and the
whole thing stays aria-hidden under a figure label that already describes the
call end to end — a screen reader gets the exchange at once rather than on a
timer.

**None of it is a dependency.** The site being copied ships GSAP, Lenis and
Framer Motion to do these six things; here they are CSS in `globals.css` plus a
`requestAnimationFrame` loop in `Cursor`. Adding an animation library to extend
this page is a trade nobody has asked for yet.

Three rules keep the motion from costing anything. Every effect decorates
content that is already readable, so the `prefers-reduced-motion` block can turn
all of it off. `Cursor` rides alongside the native pointer instead of replacing
it — hiding the real cursor means a dropped frame leaves someone clicking blind.
And `PressSpace` only binds Space while the footer is on screen and never while
focus is in a field or on a control, because Space in a text box types a space.

**Double-tap S tours the page.** `AutoScroll` crawls at a fixed 120 px/s, holds
at the bottom, smooth-rewinds to the top and goes again until S S stops it (or
Escape does). It renders nothing — the page moving is the indication, and a
badge pinned over a corner would be on screen for every second of the tour it
exists to caption. Two taps rather than one, plus the same field-and-control
guard `PressSpace` uses, is what makes binding a bare letter safe. The crawl
reads `window.scrollY` fresh each frame instead of integrating its own position,
so scrolling by hand mid-tour moves where it carries on from rather than
fighting it; during the rewind, the one stretch with a fixed destination, a
wheel or a touch hands control straight back.

### One surface, four screens

The landing page's language runs through the auth screens, the conversation and
the dashboard, and the pieces that carry it are shared rather than copied:
`Mark` is the only definition of the glyph, `Wordmark` the only pairing of it
with the name, `AppHeader` the only header on a signed-in screen, and `Cursor`
is mounted once in `app/layout.js` rather than per page.

Three judgement calls in that carry-over are worth keeping:

**The cursor knows what it is over.** A ring over links and buttons, nothing at
all over a text field. The dot is decoration, and a 24px disc sitting on the
insertion point while someone types their password costs more than the
decoration is worth.

**The form comes before the pitch on a phone.** `AuthForm` places three grid
cells rather than stacking them: headline, form, then the sales copy. Someone
who arrived to sign in should not have to scroll past a three-step explanation
of the product they already use. From `lg` the copy moves into the left column
and the form spans both rows, which is what a wide screen wanted anyway.

**Loading is the shape of the answer.** The dashboard's first paint is a fetch
away on every visit, so `Skeleton` draws the cards that are coming instead of
the word "Loading" — the layout doesn't jump when the data lands.

**No em dashes in anything the landing page renders.** House style, and it
covers the copy, the illustrations' text and the page title in `app/layout.js`.
A colon, a comma or a full stop says the same thing; if a sentence only works
with a dash, it wants splitting. Code comments are prose for us, not for the
reader, and are left alone.

Watch for one JSX trap that has bitten this file twice: `{PRODUCT_NAME} reads`
with the expression at the start of a source line loses the space after it once
Prettier rewraps the line. Write `{PRODUCT_NAME}{" "}` when a brand token is
followed by prose.

**The page never claims what the product hasn't got.** The reference lines up
customer logos under "Used by professionals at"; those are other companies'
trademarks and we have no customers to name, so that band lists the file formats
we read — from `ACCEPT_SUMMARY`, so it can't drift from what
`/api/documents/extract` accepts. `DashboardMock` and `CallMock` are drawings of
our own screens rather than borrowed photography, they agree with each other on
every number, and they say in their `aria-label` that they are illustrations.

## Security rule for customer lookup

Name alone is never verification. Matching a caller on a spoken name and reading
back an address lets anyone who knows a neighbour's name learn where they live and
when they'll be out. Match on the inbound phone number, and require one non-public
detail before the agent discloses anything specific to an account. This has to
hold on the voice-agent side too — it is section 7 of
`docs/voice-agent-integration-request.md` for exactly that reason.
