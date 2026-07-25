# Plan

The product is the layer that briefs a voice agent. Someone else is building the
agent that answers the phone; our job ends at a clean, agreed seam.

Three pages, one conversation, one handoff.

---

## Built

### Landing, sign in, create an account

Marketing page off the Merlin references. Signup takes first name, last name,
company name, email and password. Auth is application-managed rather than Supabase
Auth — deliberately basic, but the passwords are scrypt-hashed and the sessions
are real database rows, so signing out actually revokes access.

Signup creates the account *and* its business in one go, so nothing downstream
needs a "not set up yet" branch.

### Onboarding as a conversation

Not a form. A specialist agent — the trade is chosen first, from cards — walks the
owner through setup and puts a structured input under each thing it asks.

The script is a state machine in `lib/onboarding/engine.js`:

```
industry -> website -> reading -> documents -> studying
         -> gaps -> drafting -> followups -> finishing -> done
```

The engine decides what happens; Claude writes what the agent says. Stages ending
in `-ing` take no input — the client shows "reading your website" and asks the
server to carry on, which turns a 40-second extraction into visible progress
instead of a frozen page.

Two things fall out of that split and are worth keeping:

- **It can't get stuck.** The model never chooses the next stage, so there is no
  path where a conversation wanders off and leaves someone at step three.
- **It can still surprise you.** The `drafting` stage asks Claude what *else* it
  would want to know about this specific business, and composes up to three
  questions — multiple choice where the answers are a closed set. That is the one
  place the model invents structure, and it is bounded.

### Reading what they already have

The website is fetched once (behind the SSRF guard), extracted, and joins the
corpus. Uploaded documents join it too. Then the whole corpus goes into one prompt
— no chunking, no embeddings — and comes back as facts with verbatim citations,
plus every price with the sentence it appeared in.

Prices are classified **in code**, never by the model: a bare number is quotable,
a hedge or a rate or a range is a rough figure only, and sewer line and repipe are
always a human no matter what a document claims. That is deterministic, testable,
and cannot be talked out of by a price list that says "flat $4,000 for sewer work".

Facts are promoted into what the agent knows only when a single document states
them at 0.7 confidence or better. Everything else — conflicts, low confidence,
silence — becomes a question the agent asks. A missing answer is correct and
useful; a guessed one gets repeated to real callers.

### The number

Generated at the end of setup from the 555-01xx block, the range reserved for
fiction. Nothing is provisioned with a carrier. `lib/onboarding/phone.js` is the
one file that changes when it stops being pretend.

### Dashboard

Two tabs. **Overview**: the number, the Google Calendar connection, and the
documents the agent has read — adding or removing one re-reads the whole corpus.
**What it knows**: every fact, with where it came from and the sentence it was
read from, editable in place. Conflicts show both values as buttons, because the
operator is the only one who can settle them.

### Google Calendar

Real OAuth, read and write. Free/busy and event creation are implemented and
waiting for the API below. This exists ahead of the voice agent on purpose:
consent, refresh tokens and timezones are much cheaper to get wrong now than
during an integration week.

---

## Next: the agent API

**Blocked, and correctly so.** The teammate's voice agent already exists and
already consumes a knowledge shape. Designing our endpoints without knowing that
shape is the most likely way this project breaks — it costs twenty minutes to ask
and a rewrite to guess.

`docs/voice-agent-integration-request.md` is the prompt for their side. It asks
their agent to document what its fake agent currently reads, its latency budget,
what it would send to book a job, how it escalates when it isn't allowed to quote,
and to finish with a concrete proposed contract.

When that document arrives:

1. Build `/api/agent/v1/brief` to the shape it names.
2. Add availability and booking on top of `busyPeriods` and `createEvent`, which
   already work.
3. Add authentication. The endpoints are currently unauthenticated because both
   sides are still building — fine on localhost, unsafe anywhere else. A
   per-business bearer token is about thirty lines and should land before anything
   is deployed.

Once the field names are agreed in writing, don't rename or reshape them
unilaterally.

---

## Two things not to lose track of

**Name alone is never verification.** When customer lookup lands, matching on a
spoken name and reading back an address means anyone who knows a neighbour's name
can learn where they live and when they'll be out. Match on the inbound number,
and require one non-public detail before the agent says anything specific. It is
one conditional, and it is the difference between a product and a liability.

**More trades.** Only plumbing has a real definition. Adding electrical is a new
object in `lib/trades.js` — services, needs, always-human rules — and nothing
else, which is the whole point of that file. If adding a trade requires touching
anything outside it, something has drifted.
