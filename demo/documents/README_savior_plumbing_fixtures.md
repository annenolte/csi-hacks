# Savior Plumbing — Onboarding Test Fixtures

Sample "training documents" for the onboarding upload step, modeled on
[saviorplumbing.com](https://www.saviorplumbing.com/). Use these to exercise document
ingestion → consolidation → gap detection → clarifying-question generation.

**All content is fictional.** Company name, phone, service area, and service list are taken
from the public site so the URL-scrape step has something real to reconcile against. Everything
else — prices, staff names, extensions, policies — is invented. Each file carries a
"SAMPLE / FICTIONAL" marker.

---

## The files

| File | Format | Plays the role of | Why it's here |
|---|---|---|---|
| `Savior_Plumbing_Flat_Rate_Price_Book_2026.xlsx` | XLSX, 5 sheets | Price list | Multi-sheet extraction, currency parsing, section headers inside tables, empty cells that mean "call for quote" |
| `Savior_Plumbing_New_Hire_Induction.docx` | DOCX, 5 pages | Induction packet | Headings, checkboxes, nested tables, signature blocks |
| `Savior_Plumbing_Phone_Intake_and_Dispatch_Guide.pdf` | PDF, 5 pages | Service/call-handling notes | **The highest-value doc for a voice agent.** Triage matrix, scripts, escalation rules, explicit do-not-say list |
| `office-notes-front-desk-DO-NOT-DELETE.txt` | Plain text | Scrappy internal notes | Deliberately messy. Typos, ALL-CAPS, inline TODOs, unresolved questions — what SMBs actually upload |

The format spread is intentional: four different extraction paths.

---

## Deliberate gaps

The documents do **not** cover the following. If your gap-detection step doesn't surface most
of these, it isn't working.

| Gap | Where it should be noticed |
|---|---|
| After-hours / weekend pricing | Flagged "TBD" in three separate docs |
| Accepted payment methods | Intake guide says "NOT DOCUMENTED"; notes are uncertain |
| Financing | Notes say a past provider may be inactive |
| Home warranty companies | Notes say "nobody wrote it down" |
| Insurance billing for water damage | Intake guide flags it, nothing resolves it |
| Senior / military discounts | Flagged, never answered |
| Commercial pricing | Absent from the price book entirely, by design |
| Permit fees by city | Water Heaters tab says the list was never compiled |
| Deposit policy on large jobs | Notes give conflicting percentages |
| Net-30 property manager list | Notes say it needs writing down |
| Holiday closures | Partial list, with an open question about Presidents Day |
| After-hours phone number | Referred to as "posted in the shop" |

---

## Deliberate conflicts

Two sources disagree on purpose. A good consolidation step should flag these rather than
silently pick one.

| Conflict | Source A | Source B |
|---|---|---|
| Diagnostic fee | Price book: **$89** | Notes: **$95**, "been saying 95 since January" |
| Closing time | Website + induction: **4:30pm** | Notes: Thursdays run to **5pm** |
| Voicemail greeting | Notes admit it says **8–5**, which is wrong | Actual hours 7:30–4:30 |
| Savior Care Plan | Notes describe a $199/yr membership | Absent from website and every other doc |

The membership plan is the interesting one: it exists in exactly one low-authority source and
is explicitly "not on the website." Good behavior is to ask about it, not to assert it.

---

## What extraction should produce

A rough golden record for assertions:

- **Business:** Savior Plumbing Inc., family-owned, operating since 2000
- **Phone:** (925) 232-8896, accepts calls and texts
- **Service area:** Alameda + Contra Costa counties. Explicit exclusions: Tracy, Manteca,
  Stockton, anything across a bridge
- **Hours:** Mon–Fri 7:30am–4:30pm; closed weekends; Sunday and after-hours by appointment
- **Services:** residential, commercial, water heaters (tank/tankless/hybrid), leak detection
  (gas/sewer/water/slab), drain and sewer clearing, hydro jetting, camera inspection, repiping,
  disposals, water purification, sump pumps, sewer ejectors, code correction
- **Explicit non-services:** septic, well pumps, appliance repair, HVAC, fire sprinklers,
  drywall closing, pool plumbing
- **Differentiators:** 2-year labor warranty, Diamond Certified 14 years, voted best in
  Pleasanton, bilingual English/Spanish, flat-rate pricing, free estimates on most services
- **Triage:** active flooding / sewage backup / gas smell = emergency. Gas smell routes to
  PG&E (1-800-743-5000) **before** us
- **Hard rules for a phone agent:** never quote hourly; never promise same-day; never quote
  after-hours or commercial pricing; never confirm warranty coverage without checking history

---

## Suggested clarifying questions

If your agent generates questions from these documents, something close to this set is the
target. The multiple-choice ones are the better test of structured-component generation.

1. **Multiple choice** — After-hours and weekend work: (a) flat surcharge, (b) multiplier on
   the standard rate, (c) quoted case by case, (d) we don't take after-hours work.
2. **Multi-select** — Which payment methods do you accept? Visa / Mastercard / Amex / check /
   cash / Zelle or Venmo / online portal.
3. **Open** — Your price book lists $89 for a diagnostic; your front-desk notes say $95. Which
   should the agent quote?
4. **Yes/no + follow-up** — Do you currently accept home warranty companies?
5. **Open** — Is the Savior Care Plan still sold, still honored for existing members, or
   discontinued?
6. **Open** — How should the agent handle a caller just outside the service area?
7. **Yes/no** — Should the agent ever book a weekend job directly, or always take a message?
8. **Open** — Which property managers are on net-30 terms?
9. **Multiple choice** — When no technician is available same-day for an emergency, should the
   agent: (a) book next available, (b) escalate to the on-call phone, (c) take a message for
   the supervisor?

Question 3 is worth special attention — it requires noticing a contradiction across two
documents rather than a missing field. That's a meaningfully harder capability than gap
detection, and it's the one most likely to be quietly skipped.

---

## Notes on realism

The notes file is scruffy on purpose: lowercase, typos, unresolved TODOs, second-person asides
to colleagues. If your pipeline was tuned on clean documents it will likely do worse here, and
that's the point — this is closer to what a plumbing company actually has lying around than a
polished handbook is.

Two things worth considering as you build:

- **Source authority.** The notes file contradicts the price book and is more recent. Whether
  "more recent" or "more official" wins is a product decision, and these fixtures force you to
  make it explicitly rather than by accident.
- **Confidence in the handoff.** Since this knowledge base gets passed to a live calling agent,
  it's probably worth tagging each extracted fact as confirmed / inferred / conflicted rather
  than flattening everything into one trusted blob. A voice agent confidently quoting the wrong
  diagnostic fee to a real customer is the failure mode these fixtures are designed to catch.
