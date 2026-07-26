import { describe, expect, it } from "vitest";
import { PLUMBING } from "@/lib/trades";
import { COMPONENT, isAuto, working, needField } from "@/lib/onboarding/components";
import { toE164, _AREA_CODES } from "@/lib/onboarding/phone";
import { attachmentsIn, describeAnswer } from "@/lib/onboarding/describe";
import { returnKey, returnPath } from "@/lib/calendar/return-to";
import { answerForFollowup, interviewQueue } from "@/lib/onboarding/engine";
import { MAX_FOLLOWUPS } from "@/lib/onboarding/agent";

describe("component vocabulary", () => {
  it("marks working stages as auto-continue and nothing else", () => {
    expect(isAuto(working("Reading"))).toBe(true);
    expect(isAuto(needField("hours"))).toBe(false);
    expect(isAuto(null)).toBe(false);
    expect(isAuto(undefined)).toBe(false);
  });

  /*
    A conflict question that shows an empty box asks someone to settle an
    argument they can't see. Both sides have to reach the component.
  */
  it("carries both sides of a disagreement, and what's already known", () => {
    const component = needField("hours", {
      current: { mon: { open: "08:00", close: "17:00" } },
      conflicts: [
        { value: "a", display: "Mon–Fri 8am–5pm", document: "prices.txt" },
        { value: "b", display: "Mon–Sat 7am–6pm", document: "faq.md" },
      ],
    });

    expect(component.needKey).toBe("hours");
    expect(component.current).toEqual({ mon: { open: "08:00", close: "17:00" } });
    expect(component.conflicts).toHaveLength(2);
  });

  it("defaults to no prefill and no conflict when there isn't one", () => {
    const component = needField("hours");
    expect(component.current).toBeNull();
    expect(component.conflicts).toEqual([]);
  });
});

/*
  The generated number is fiction on purpose: 555-01xx is the block the numbering
  plan reserves for it. A "realistic-looking" number would mean printing a
  stranger's phone number on a dashboard and telling a business to hand it out.
*/
describe("phone numbers", () => {
  it("converts a displayed number to E.164 for the voice agent", () => {
    expect(toE164("(503) 555-0142")).toBe("+15035550142");
    expect(toE164("503-555-0142")).toBe("+15035550142");
  });

  it("returns null rather than a wrong number when it can't parse one", () => {
    for (const bad of ["", null, undefined, "555-0142", "not a number", "+44 20 7946 0000"]) {
      expect(toE164(bad)).toBeNull();
    }
  });

  it("only draws from real, dialable area codes", () => {
    for (const code of _AREA_CODES) {
      expect(code).toMatch(/^[2-9]\d\d$/);
    }
  });
});

describe("describeAnswer", () => {
  const trade = PLUMBING;

  it("shows the label of a picked card, not its slug", () => {
    const component = {
      kind: COMPONENT.CARDS,
      options: [{ value: "plumbing", label: "Plumbing" }],
    };
    expect(describeAnswer({ trade, component, answer: { value: "plumbing" } })).toBe(
      "Plumbing",
    );
  });

  it("renders a skipped website as what the person actually chose", () => {
    const component = { kind: COMPONENT.URL };
    expect(describeAnswer({ trade, component, answer: { skip: true } })).toBe(
      "We don't have a website",
    );
    expect(describeAnswer({ trade, component, answer: { url: "a.com" } })).toBe("a.com");
  });

  /*
    Uploaded files are drawn as files, so there is no sentence to write for them.
    An empty upload is the one case with something to say, because there is
    nothing to show.
  */
  it("leaves uploaded documents to the cards, and speaks only when there are none", () => {
    const component = { kind: COMPONENT.DOCUMENTS };
    expect(
      describeAnswer({
        trade,
        component,
        answer: { documents: [{ name: "prices.txt" }, { name: "faq.md" }] },
      }),
    ).toBe(null);
    expect(describeAnswer({ trade, component, answer: { documents: [] } })).toBe(
      "Nothing to add",
    );
  });

  /* Formatting is type-driven, so this works for a need added tomorrow too. */
  it("formats a need's value the way the rest of the app displays it", () => {
    const component = { kind: COMPONENT.NEED, needKey: "service_area" };
    expect(
      describeAnswer({ trade, component, answer: { value: ["Portland", "Beaverton"] } }),
    ).toBe("Portland, Beaverton");

    const hours = { kind: COMPONENT.NEED, needKey: "hours" };
    expect(
      describeAnswer({
        trade,
        component: hours,
        answer: {
          value: {
            mon: { open: "08:00", close: "17:00" },
            tue: { open: "08:00", close: "17:00" },
          },
        },
      }),
    ).toBe("Mon–Tue 8am–5pm");
  });

  it("says a need was skipped rather than showing a blank line", () => {
    const component = { kind: COMPONENT.NEED, needKey: "business_notes" };
    expect(describeAnswer({ trade, component, answer: { value: null } })).toBe("Skipped");
  });

  it("shows the chosen label of a model-composed follow-up", () => {
    const component = {
      kind: COMPONENT.FOLLOWUP,
      question: {
        kind: "choice",
        options: [
          { value: "yes", label: "Yes, always" },
          { value: "no", label: "No" },
        ],
      },
    };
    expect(describeAnswer({ trade, component, answer: { value: "yes" } })).toBe(
      "Yes, always",
    );
  });

  /*
    The calendar answer arrives from a redirect rather than a click, so this is
    the only case where the transcript line is written from a query string.
  */
  it("says which way the calendar offer went", () => {
    const component = { kind: COMPONENT.CALENDAR };
    expect(describeAnswer({ trade, component, answer: { connected: true } })).toBe(
      "Connected my Google Calendar",
    );
    expect(describeAnswer({ trade, component, answer: { connected: false } })).toBe(
      "Not right now",
    );
  });

  it("has nothing to say about a working stage", () => {
    expect(
      describeAnswer({ trade, component: working("Reading"), answer: undefined }),
    ).toBeNull();
    expect(describeAnswer({ trade, component: null, answer: {} })).toBeNull();
  });
});

/*
  The other half of the transcript line: the files themselves. Both sides call
  this — the browser on click, the server when it saves the message — so a card
  that appears immediately is the same card that is there after a reload.
*/
describe("attachmentsIn", () => {
  it("keeps the files in the order they were sent, with their sizes", () => {
    expect(
      attachmentsIn({
        documents: [
          { name: "prices.pdf", bytes: 240_000, text: "…" },
          { name: "induction.docx", bytes: 18_000, text: "…" },
        ],
      }),
    ).toEqual([
      { name: "prices.pdf", bytes: 240_000 },
      { name: "induction.docx", bytes: 18_000 },
    ]);
  });

  /* A message saved before sizes were recorded still has to draw its cards. */
  it("takes a file with no size", () => {
    expect(attachmentsIn({ documents: [{ name: "faq.md" }] })).toEqual([
      { name: "faq.md", bytes: null },
    ]);
  });

  it("finds nothing in any other answer", () => {
    expect(attachmentsIn({ value: "Portland" })).toEqual([]);
    expect(attachmentsIn({ documents: [] })).toEqual([]);
    expect(attachmentsIn(undefined)).toEqual([]);
    expect(attachmentsIn(null)).toEqual([]);
  });
});

/*
  Follow-up answers end up in the brief a voice agent reads out, so an
  unrecognised value would be spoken to a caller verbatim.
*/
describe("answerForFollowup", () => {
  const choice = {
    kind: "choice",
    options: [
      { value: "give_number", label: "Give them the after-hours number" },
      { value: "call_back", label: "Take details, we call back" },
    ],
  };

  it("stores the label of a listed option", () => {
    expect(answerForFollowup(choice, "call_back")).toBe("Take details, we call back");
  });

  it("refuses anything that isn't one of the options", () => {
    expect(answerForFollowup(choice, "Yes")).toBeNull();
    expect(answerForFollowup(choice, "(503) 555-0199")).toBeNull();
    expect(answerForFollowup(choice, null)).toBeNull();
  });

  it("takes trimmed free text for an open question", () => {
    const text = { kind: "text" };
    expect(answerForFollowup(text, "  $89, waived on booking ")).toBe(
      "$89, waived on booking",
    );
    expect(answerForFollowup(text, "   ")).toBeNull();
    expect(answerForFollowup(text, { evil: true })).toBeNull();
  });

  it("has no answer when there is no question", () => {
    expect(answerForFollowup(null, "anything")).toBeNull();
  });
});

/*
  How long the interview is allowed to get. Every question here is one a person
  has to sit through before they see the thing they signed up for, so the two
  limits are worth pinning down rather than leaving to drift.
*/
describe("how much the interview asks", () => {
  const allKeys = PLUMBING.needs.map((n) => n.key);

  it("asks about everything the agent can't take a call without", () => {
    const queue = interviewQueue({ trade: PLUMBING, unresolved: allKeys });
    const required = PLUMBING.needs.filter((n) => n.required).map((n) => n.key);

    expect(queue).toEqual(required);
  });

  it("leaves an optional need to the dashboard rather than asking", () => {
    const optional = PLUMBING.needs.filter((n) => !n.required).map((n) => n.key);
    expect(optional.length).toBeGreaterThan(0);

    const queue = interviewQueue({ trade: PLUMBING, unresolved: allKeys });
    for (const key of optional) expect(queue).not.toContain(key);
  });

  /* Unless the documents disagreed about it — that's a real question. */
  it("still asks about an optional need two documents disagree on", () => {
    const optional = PLUMBING.needs.find((n) => !n.required).key;
    const queue = interviewQueue({
      trade: PLUMBING,
      unresolved: allKeys,
      conflicts: { [optional]: [{ value: "a" }, { value: "b" }] },
    });

    expect(queue).toContain(optional);
  });

  it("keeps the model-composed tail short", () => {
    expect(MAX_FOLLOWUPS).toBe(2);
  });
});

/*
  The calendar step sends someone to Google and Google sends them back here. The
  page to return to arrives as a query parameter, which makes this route the one
  place in the app that could be talked into redirecting somewhere else.
*/
describe("where the calendar flow returns to", () => {
  it("takes the two pages that ask for a calendar", () => {
    expect(returnPath(returnKey("onboarding"))).toBe("/onboarding");
    expect(returnPath(returnKey("dashboard"))).toBe("/dashboard");
  });

  it("refuses to be pointed anywhere else", () => {
    for (const hostile of [
      "https://evil.example.com",
      "//evil.example.com",
      "/dashboard/../../etc",
      "onboarding.evil.com",
      "",
      null,
      undefined,
      "__proto__",
      "constructor",
    ]) {
      expect(returnKey(hostile), String(hostile)).toBe("dashboard");
      expect(returnPath(hostile), String(hostile)).toBe("/dashboard");
    }
  });
});
