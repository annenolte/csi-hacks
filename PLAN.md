# Plan

Four phases. Finish one before starting the next. The `stages/` folder is the detailed
version to come back to later, not the thing to work from now.

---

## Phase 1: The onboarding form (frontend only)

**You are here.** `onboarding.jsx` is the working prototype.

Five screens: pick your trade, the basics, hand over your materials, connect a calendar,
review. Local state only. Nothing is saved anywhere yet.

Port it into your Next.js repo, one route per step or one route with step state, your call.
Add a small `useOnboarding` hook so state lives in one place.

**The one thing to keep when you port it:** the `PLUMBING` object at the top drives the
form. Its `needs` array is what the right rail checks off, and in Phase 3 it becomes the
list synthesis extracts against and the gap interview asks about. Add a field there and it
should show up everywhere automatically. If you find yourself hardcoding a field name into
JSX, stop.

Done when: you can click all five steps, back and forward, on a phone and a laptop, and the
call slip updates as you type.

---

## Phase 2: Make it save

Small phase. No AI yet.

- SQLite + Drizzle, one file
- Tables: `businesses`, `documents`
- Wizard posts after each step so a refresh does not lose everything
- File upload accepts `.txt` and `.md`, stores the text, rejects the rest with a clear
  message
- Website URL fetches one page, strips tags, stores the text

Skip auth. One hardcoded business id. Keep the `business_id` column anyway so adding real
accounts later is a migration, not a rewrite.

Done when: you complete the wizard, restart the server, and your data is still there.

---

## Phase 3: Background synthesis

The interesting part, and the reason the form exists.

One endpoint that reads every document for the business and returns structured facts. No
chunking, no embeddings, no vector search. A small plumbing company's whole corpus fits in
one prompt, and that gives you better extraction and exact quoted citations for free.

Two calls:

1. **Fields.** Corpus plus the `needs` list. Returns per field: `value`, `confidence`, and
   the verbatim sentence it came from. If two documents disagree, return both, do not pick.
   If the corpus does not say it, return `found: false`. A missing answer is correct and
   useful; a guessed one poisons the agent.
2. **Services and prices.** Every price found, with its source sentence.

Then classify each price **in code, not in the prompt**: a bare number goes to `quotable`,
anything with "starting at" or "depends" goes to `range_only`, everything else and anything
under 0.7 confidence goes to `human_required`. Sewer line and repipe are always
`human_required` no matter what a document claims.

Doing this in code is the point. It is deterministic, testable, and cannot be talked out of
by a document that says "our sewer work is a flat $4,000." Write that test.

Anything not found becomes a gap. Gaps become the interview screen, which is the same
component as the form because both are driven by `needs`.

Done when: you feed it your own fixture documents and it correctly reports what it found,
where each fact came from, and what is still missing.

---

## Phase 4: The agent endpoints

The seam with your teammate's voice agent. Details in
`stages/01-agent-api-contract.md`, they do not change.

Compile the approved facts into a brief under 6KB, serve it at `/api/agent/v1/brief`, add
availability and booking off a simple calendar table, and build the call simulator in
`stages/01` so you can demo without the voice agent existing.

Do this before your teammate is ready, not after.

---

## Two things not to lose track of

**Freeze the API contract with your teammate early.** It costs twenty minutes and it is the
most likely way this project breaks. Field names, agreed in writing, before either of you
builds against them.

**Name alone is never verification.** When you get to customer lookup, matching on a spoken
name and reading back an address means anyone who knows a neighbour's name can learn where
they live and when they will be out. Match on the inbound number, and require one
non-public detail before the agent says anything specific. It is one conditional, and it is
the difference between a product and a liability.
