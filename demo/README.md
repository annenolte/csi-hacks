# The demo

One business, one recorded run. Onboarding for `saviorplumbing.com` replays that
recording instead of paying for it again, which is what makes a demo take
seconds rather than two minutes and cost nothing.

```
demo/documents/    the five files to upload — the demo set
demo/recordings/   what one real run of that set produced. Checked in.
```

## Running one

1. Create an account. Any name and email; they don't appear in anything cached.
2. Pick **Plumbing**.
3. Website: **saviorplumbing.com**. This is the switch — nothing is replayed for
   any other address.
4. Drop in **all five files** from `demo/documents`.
5. On the hours question, pick the **first** option, `Mon–Fri 7:30am–4:30pm`.
   See "what the answers change" below.

From a fresh clone, with no local cache at all: the website read lands in ~3s,
the five files in under a second between them, and the whole-corpus read in ~2s.
The only model calls are the opening line and the trade acknowledgement, both of
which happen before anyone has said which website this is.

## What the documents are

Fictional fixtures modelled on the real site — see
`documents/README_savior_plumbing_fixtures.md`, which is itself one of the five.
They carry deliberate gaps and deliberate contradictions, and the demo is better
for it: the price book says a diagnostic is $89 where the front-desk notes say
$95, and the notes have Thursdays running to 5pm where the website says 4:30.
Those become the questions the agent asks, which is the part worth showing.

## What's real here, and what isn't

Everything on the dashboard at the end is the real extractor's real output —
recorded from a real run, quoted sentences and conflicts and all. Nothing in
`recordings/` was written by hand, and nothing should be: if an entry is wrong,
the fix is to do the run again and re-record.

The one thing that isn't a recording is the agent's wording. On this path each
turn uses its own fallback line rather than calling the model, because a turn's
wording carries no facts. It reads a little plainer than a live run.

## What the answers change

Two of the recordings depend on how the interview was answered when it was made:
the follow-up questions are drafted from everything known at that point, so
answering the hours conflict the other way produces a different prompt and one
real model call (~10s) instead of a replay. Everything else — the website, the
files, the corpus read — depends only on the inputs and replays regardless.

## Re-recording

After changing an extraction prompt, the trade definition, a document reader, or
the demo set:

```bash
rm -rf .cache        # so the run can't quietly replay what you just changed
npm run dev          # then do a full run-through, as above
npm run demo:record
```

`demo:record` copies this machine's `.cache/` into `recordings/`. It takes the
three model-backed namespaces whole — they are only ever written on the demo path
— and takes documents one per file in `demo/documents`, so nobody else's uploads
end up in the repo. It prints what it couldn't find rather than inventing it: a
`MISSING` line means that step never actually ran.

Recording is a deliberate act. `.cache/` shadows `recordings/`, so a change you
make locally works immediately for you and reaches everyone else only when you
record it.
