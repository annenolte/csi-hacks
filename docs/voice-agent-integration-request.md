# Prompt for the voice-agent side

Send this to your teammate. He pastes it into his Claude agent, in his voice-agent repo.
It asks his agent to write one document describing his side of the seam. He sends that
document back to us, and we build our API to fit it rather than guessing.

Why this direction: he already has a working voice system with a fake agent handling
calls. It is cheaper to shape our API around the consumer that exists than to hand him
field names and ask him to adapt.

---

## Copy everything below this line

You are documenting an existing voice-agent codebase so that a second team can build the
backend API that feeds it. That team has a web app where a trade business (starting with
plumbing) signs up, hands over its website and internal documents, and an LLM pass
consolidates all of it into structured knowledge — hours, service area, services offered,
prices with a per-price "is the agent allowed to quote this" tier, and free-text notes
about the business. They also have the business's Google Calendar connected with read and
write access. None of that is wired to your voice agent yet.

Read this repository and write a single markdown file, `VOICE_AGENT_INTEGRATION.md`, that
answers the questions below. Where the answer is "we haven't decided," say so explicitly
rather than inventing something — an honest gap is more useful than a plausible guess,
because the other team will build against whatever you write.

Do not change any code. This task is documentation only.

### 1. What the system is

- The stack and framework (Twilio, Vapi, LiveKit, Retell, Pipecat, something custom?).
- Which model handles the conversation, and whether it is prompt-driven, tool-driven, or a
  scripted state machine.
- Where the code lives — the file that owns the call loop, and the file that owns the
  agent's instructions.

### 2. Where the fake agent's knowledge lives right now

This is the single most important section. Be concrete and quote real code.

- Show the actual object, constant, prompt string, or fixture that currently stands in for
  a real business's information. Paste it verbatim, with its file path.
- For each piece of it, give the field name, the type, and an example value.
- Say which fields the agent actually reads during a call versus which are decorative.
- If the knowledge is embedded in a prompt template rather than structured data, paste the
  template and mark the interpolation points.

### 3. How it would fetch that knowledge

- Would you rather receive one consolidated "brief" document at the start of a call, or
  call granular endpoints mid-conversation as tool calls (look up a price, check
  availability, book a slot)? Say which and why, given how your agent is built.
- If a brief: is it fetched once per call, cached across calls, or refreshed on a timer?
  What is the largest payload you can accept without hurting time-to-first-word?
- If tool calls: what is your latency budget for a single tool call before the caller
  notices dead air? Give a number in milliseconds.
- Do you want JSON, or pre-rendered natural-language text the model can read directly?

### 4. Identifying the business

- When a call arrives, what does your system know? The dialed number, a config value, an
  environment variable, something else?
- If we generate a phone number per business and the business gives it to its customers,
  is the dialed number available to you, and in what format (E.164?)?

### 5. Booking and availability

- Do you want to offer specific appointment slots on the call, or take a request and let a
  human confirm later?
- What exactly would you send us to book a job? List every field: caller name, callsback
  number, address, description of the problem, urgency, preferred window, anything else.
- What do you need back to say something useful out loud — a confirmed time, a reference
  number, both?
- How do you want to express a time window, and how do you handle timezones today?
- What should happen if the slot is taken between offering it and booking it?

### 6. Prices and the things the agent must not say

Our side classifies every price in code into one of three tiers:

- `quotable` — a firm number the agent may state.
- `range_only` — hedged, a range, or an hourly rate; the agent may indicate rough scale but
  must not state a total.
- `human_required` — the agent must not quote at all and should route to a person. Some job
  types (sewer line, repipe) are always this tier no matter what the business's own
  documents claim.

Questions:

- Does your agent have a way to represent "I know a number but I'm not allowed to say it"?
  If not, what would it take?
- How does it currently escalate to a human, and what does it say while doing so?
- If a fact is simply missing from the business's knowledge, what does it say? We
  deliberately return "not found" rather than a guess, so this case will happen.

### 7. Returning callers

We have a security rule we will not relax, and your side needs to match it: **a spoken name
is never verification.** Matching a caller on name alone and then reading back their address
lets anyone who knows a neighbour's name learn where they live and when they'll be out.
Callers are matched on the inbound phone number, and the agent must require one non-public
detail before disclosing anything account-specific.

- Do you do any caller lookup today?
- Can you read the inbound caller ID, and does your framework expose it reliably?
- Is there a place in your flow where a verification challenge could sit?

### 8. Operational shape

- Auth: what can you send on a request — a bearer token, a header, mTLS, nothing? Note for
  context: our endpoints are currently unauthenticated while both sides build, which we
  intend to fix before anything is deployed.
- What should your agent do if our API is slow or down mid-call? Is there a fallback?
- Do you need webhooks from us (knowledge updated, calendar changed), or is polling fine?
- Rough call volume you're designing for.

### 9. Your proposed contract

Finish with a concrete proposal, not just answers: for each endpoint you want, give the
method, path, an example request body, and an example response body with realistic values.
Mark anything you consider negotiable versus anything that would be expensive for you to
change. We will build to this or come back with specific objections.

---

## What happens when he sends it back

Give the file to us. We already have the knowledge extraction, the price classifier, and
the Google Calendar connection working — what's missing is only the shape of the seam. We
expect to have follow-up questions once we read it.
