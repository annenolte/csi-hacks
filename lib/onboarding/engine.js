import "server-only";

import { getTrade, optionsForNeed, TRADES } from "../trades";
import { sanitiseAnswer } from "../fieldSchema";
import { formatNeedValue } from "../format";
import { isAnswered } from "../answered";
import { ScrapeError, fetchPageText } from "../scrape/fetch";
import { extractWithClaude } from "../scrape/claude";
import { runSynthesis } from "../synthesis/run";
import {
  addDocument,
  getDocuments,
  getFields,
  setField,
  updateBusiness,
} from "../data/business";
import { appendMessage, updateConversation } from "../data/conversation";
import { composeTurn, draftFollowups } from "./agent";
import { assignPhoneNumber } from "./phone";
import * as ui from "./components";

/*
  The onboarding script.

  A fixed sequence of stages. The model writes what the agent says at each one;
  this file decides what happens. That division is deliberate and load-bearing —
  it is why the conversation can feel open-ended without ever being able to skip
  a question, render a broken input, or leave someone stuck at step three.

    industry -> website -> reading -> documents -> studying
             -> gaps (one need at a time) -> drafting -> followups -> finishing -> done

  Stages ending in -ing take no input: the client sees a "working" component and
  immediately asks the server to continue, which is what puts a real progress
  state in front of a call that takes half a minute.
*/

export const STAGE = {
  INDUSTRY: "industry",
  WEBSITE: "website",
  READING: "reading",
  DOCUMENTS: "documents",
  STUDYING: "studying",
  GAPS: "gaps",
  DRAFTING: "drafting",
  FOLLOWUPS: "followups",
  FINISHING: "finishing",
  DONE: "done",
};

/* --------------------------------------------------------------- the opener */

/**
 * The first thing the agent says, before anything has been chosen. Called when a
 * conversation has no messages yet.
 */
export async function openingTurn({ business, conversation }) {
  const message = await composeTurn({
    trade: null,
    business,
    situation: `They have just created an account for "${business.name}". You know nothing else about them yet. Trade agents are shown as cards below your message; only Plumbing is available so far.`,
    instruction:
      "Introduce yourself in one sentence: you're the specialist who'll set up their phone agent, and you'll be quick about it. Then ask them to pick their trade from the cards.",
    fallback: `I'll get your phone agent set up — it takes about ten minutes and most of it is me reading things you already have. First, which trade is ${business.name}?`,
  });

  const component = ui.cards(
    TRADES.map((t) => ({
      value: t.id,
      label: t.label,
      blurb: t.blurb,
      icon: t.icon,
      available: Boolean(t.available),
    })),
  );

  await appendMessage(conversation.id, { role: "agent", body: message, component });
  return { component };
}

/* ------------------------------------------------------------- the main loop */

/**
 * Applies an answer and advances one stage.
 * Returns the messages to show and the component to render next.
 */
export async function runTurn({ business, conversation, answer }) {
  const stage = conversation.stage ?? STAGE.INDUSTRY;
  const state = conversation.state ?? {};

  switch (stage) {
    case STAGE.INDUSTRY:
      return chooseIndustry({ business, conversation, state, answer });
    case STAGE.WEBSITE:
      return takeWebsite({ business, conversation, state, answer });
    case STAGE.READING:
      return readWebsite({ business, conversation, state });
    case STAGE.DOCUMENTS:
      return takeDocuments({ business, conversation, state, answer });
    case STAGE.STUDYING:
      return study({ business, conversation, state });
    case STAGE.GAPS:
      return answerGap({ business, conversation, state, answer });
    case STAGE.DRAFTING:
      return draft({ business, conversation, state });
    case STAGE.FOLLOWUPS:
      return answerFollowup({ business, conversation, state, answer });
    case STAGE.FINISHING:
      return finish({ business, conversation, state });
    default:
      return { component: ui.done(business.agent_phone_number), messages: [] };
  }
}

/* ------------------------------------------------------------------ industry */

async function chooseIndustry({ business, conversation, state, answer }) {
  const trade = getTrade(answer?.value);

  if (!trade?.available) {
    return say({
      conversation,
      state,
      stage: STAGE.INDUSTRY,
      body: "That one isn't ready yet — plumbing is the only trade I'm trained on so far. Pick plumbing and I'll carry on.",
      component: ui.cards(
        TRADES.map((t) => ({
          value: t.id,
          label: t.label,
          blurb: t.blurb,
          icon: t.icon,
          available: Boolean(t.available),
        })),
      ),
    });
  }

  await updateBusiness(business.id, {
    industry_id: trade.id,
    onboarding_status: "in_progress",
  });

  const message = await composeTurn({
    trade,
    business,
    situation: `They picked ${trade.label}. You now want their website so you can read it yourself instead of making them type things out.`,
    instruction:
      "Say you'll start by reading their website so they don't have to type out what's already on it, and ask for the address. Mention there's a way to say they don't have one.",
    fallback: `Good — I know plumbing calls well. Let's start with your website: I'll read it and pull out what I can, so you're not typing in things you've already written down. What's the address?`,
  });

  return say({
    conversation,
    state,
    stage: STAGE.WEBSITE,
    body: message,
    component: ui.urlField(),
  });
}

/* ------------------------------------------------------------------- website */

async function takeWebsite({ business, conversation, state, answer }) {
  if (answer?.skip) {
    const trade = getTrade(business.industry_id);
    const message = await composeTurn({
      trade,
      business,
      situation:
        "They said they don't have a website. Nothing has been read yet, so everything has to come from documents or from them directly.",
      instruction:
        "Acknowledge it in a few words without making it a problem, then ask for whatever they'd hand a new hire on their first day — price list, service area notes, induction sheet. Say plain text or markdown files.",
      fallback:
        "No problem. Then let's use whatever you'd hand a new employee on day one — a price list, notes on where you'll travel, anything like that. Plain text or markdown files, dropped in below.",
    });

    return say({
      conversation,
      state,
      stage: STAGE.DOCUMENTS,
      body: message,
      component: ui.documentsField(),
    });
  }

  /* Stash the URL and hand back a working state — the fetch happens next turn. */
  return say({
    conversation,
    state: { ...state, pendingUrl: answer?.url ?? "" },
    stage: STAGE.READING,
    body: null,
    component: ui.working("Reading your website"),
  });
}

async function readWebsite({ business, conversation, state }) {
  const trade = getTrade(business.industry_id);
  const url = state.pendingUrl;

  let page;
  let failure = null;

  try {
    page = await fetchPageText(url);
  } catch (err) {
    /*
      A bad URL is not a dead end. Say what went wrong and move on to documents —
      stranding someone on step two because their site is down would be absurd.
    */
    failure =
      err instanceof ScrapeError
        ? err.message
        : "Something went wrong reading that page.";
  }

  let found = [];

  if (page) {
    await updateBusiness(business.id, { website_url: page.url });

    /* The page joins the corpus, so synthesis reads it alongside the documents. */
    await addDocument(business.id, {
      kind: "url",
      name: page.title || page.url,
      source: page.url,
      text: page.text,
    });

    try {
      const { html, url: finalUrl, ...rest } = page;
      const fields = await extractWithClaude({ trade, page: rest, url: finalUrl });

      for (const [key, field] of Object.entries(fields)) {
        const need = trade.needs.find((n) => n.key === key);
        if (!need) continue;

        await setField(business.id, key, field.value, {
          source: "website",
          confidence: field.confidence,
          sentence: field.source,
          document: page.url,
        });

        found.push(`${need.label}: ${formatNeedValue(trade, need, field.value)}`);
      }
    } catch (err) {
      console.error("Website extraction failed:", err);
      failure = "I could open the page but couldn't make sense of it.";
    }
  }

  const situation = failure
    ? `You tried to read ${url} and it didn't work: ${failure}`
    : found.length
      ? `You read their website and found these:\n${found.map((f) => `- ${f}`).join("\n")}`
      : "You read their website but it didn't state anything useful — no hours, no service area, nothing you could quote.";

  const message = await composeTurn({
    trade,
    business,
    situation,
    instruction:
      "Report what happened in one or two sentences — name one or two of the things you found rather than listing them all, since they can see the list. Then ask for whatever they'd give a new hire on their first day: price list, service area notes, induction sheet. Say plain text or markdown files.",
    fallback: failure
      ? `${failure} We can work around it. What would you hand a new employee on their first day — a price list, notes on your patch, anything like that? Plain text or markdown.`
      : `Read it. ${found.length ? `Got ${found.length} thing${found.length === 1 ? "" : "s"} off it.` : "There wasn't much on there I could use."} Now the more useful part: what would you hand a new employee on their first day? A price list, notes on where you'll travel, an induction sheet.`,
  });

  return say({
    conversation,
    state: { ...state, pendingUrl: null },
    stage: STAGE.DOCUMENTS,
    body: message,
    component: ui.documentsField(),
  });
}

/* ----------------------------------------------------------------- documents */

async function takeDocuments({ business, conversation, state, answer }) {
  const docs = Array.isArray(answer?.documents) ? answer.documents : [];

  for (const doc of docs) {
    if (typeof doc?.text !== "string" || !doc.text.trim()) continue;
    await addDocument(business.id, {
      kind: "file",
      name: doc.name,
      source: doc.name,
      text: doc.text,
    });
  }

  return say({
    conversation,
    state,
    stage: STAGE.STUDYING,
    body: null,
    component: ui.working(
      docs.length ? "Reading everything you've given me" : "Going back over what I have",
    ),
  });
}

/* ------------------------------------------------------------------ studying */

async function study({ business, conversation, state }) {
  const trade = getTrade(business.industry_id);

  const { corpus, report, promoted, unresolved, conflicts, failure } =
    await runSynthesis({ business, trade });

  const conflictCount = Object.keys(conflicts).length;

  const situation = [
    failure
      ? `Reading the documents failed: ${failure}`
      : corpus.isEmpty
        ? "They gave you no documents at all, so everything still has to come from them."
        : `You read ${corpus.documents.length} document${corpus.documents.length === 1 ? "" : "s"}.`,
    promoted.length
      ? `You settled these from what you read:\n${promoted.map((p) => `- ${p.label}: ${p.display}`).join("\n")}`
      : null,
    report?.prices?.length
      ? `You also found ${report.prices.length} price${report.prices.length === 1 ? "" : "s"}.`
      : null,
    conflictCount
      ? `${conflictCount} thing${conflictCount === 1 ? " was" : "s were"} stated two different ways in different documents, so you can't settle ${conflictCount === 1 ? "it" : "them"} yourself.`
      : null,
    unresolved.length
      ? `${unresolved.length} question${unresolved.length === 1 ? "" : "s"} left that nothing you have answers.`
      : "Nothing is left unanswered.",
  ]
    .filter(Boolean)
    .join("\n");

  return advanceToGaps({
    business,
    conversation,
    trade,
    state: { ...state, gapQueue: unresolved, conflicts },
    situation,
    instruction:
      "Say what you got out of what they gave you, in one or two sentences — a number and one concrete example, not a list. Then ask the first question below. Ask it as a question, in your own words.",
  });
}

/* ---------------------------------------------------------------------- gaps */

async function advanceToGaps({ business, conversation, trade, state, situation, instruction }) {
  const [nextKey, ...rest] = state.gapQueue ?? [];

  if (!nextKey) {
    /* Nothing standard left — go and think about what the script didn't cover. */
    const message = await composeTurn({
      trade,
      business,
      situation,
      instruction:
        "Say briefly what you've got, then say you're going to check whether anything else is worth asking about. Do not ask a question — there's nothing for them to answer yet.",
      fallback: "That's the standard set covered. Let me see if anything else is worth asking.",
    });

    return say({
      conversation,
      state: { ...state, gapQueue: [] },
      stage: STAGE.DRAFTING,
      body: message,
      component: ui.working("Working out what else to ask"),
    });
  }

  const need = trade.needs.find((n) => n.key === nextKey);

  /*
    Read the answers fresh rather than threading them through every caller. A gap
    question can be about something the website already filled in — if two
    documents then disagreed with it, the owner is choosing between three things,
    and showing them none of the three would be absurd.
  */
  const { answers } = await getFields(business.id);
  const conflicts = state.conflicts?.[nextKey] ?? [];

  const conflictNote = conflicts.length
    ? `\n\nTwo of their documents disagree about this. Name both values in your question and ask which is right:\n${conflicts
        .map((c) => `- "${c.display}"${c.document ? ` (from ${c.document})` : ""}`)
        .join("\n")}`
    : "";

  const message = await composeTurn({
    trade,
    business,
    situation,
    instruction: `${instruction}\n\nThe question to ask, in your own words, is: "${need.question}"${need.hint ? `\nWhy it matters: ${need.hint}` : ""}${conflictNote}`,
    fallback: conflicts.length
      ? `Your documents say two different things here — ${conflicts.map((c) => `"${c.display}"`).join(" and ")}. ${need.question}`
      : need.question,
  });

  return say({
    conversation,
    state: { ...state, gapQueue: [nextKey, ...rest] },
    stage: STAGE.GAPS,
    body: message,
    component: ui.needField(nextKey, {
      current: answers[nextKey] ?? null,
      conflicts,
    }),
  });
}

async function answerGap({ business, conversation, state, answer }) {
  const trade = getTrade(business.industry_id);
  const [currentKey, ...rest] = state.gapQueue ?? [];
  const need = trade.needs.find((n) => n.key === currentKey);

  /*
    Validate before storing. Everything downstream — the dashboard, the next
    turn's prompt, and eventually the brief a voice agent reads to a caller —
    trusts whatever lands here, and the endpoint accepts arbitrary JSON.
  */
  const value = need ? sanitiseAnswer(trade, need, answer?.value) : null;

  if (need && isAnswered(value)) {
    await setField(business.id, need.key, value, { source: "operator" });
  } else if (need?.required && !isAnswered(value)) {
    /*
      A required need with no answer is the one place the script pushes back. The
      agent can't do its job without it, and pretending otherwise just moves the
      failure to a live phone call.
    */
    return say({
      conversation,
      state,
      stage: STAGE.GAPS,
      body: `I do need this one — it comes up on nearly every call. ${need.question}`,
      component: ui.needField(need.key),
    });
  }

  return advanceToGaps({
    business,
    conversation,
    trade,
    state: { ...state, gapQueue: rest },
    situation: need
      ? `They just answered "${need.label}". You're working through the remaining questions.`
      : "You're working through the remaining questions.",
    instruction:
      "Ask the next question. Don't thank them or repeat their answer back — just move on. One sentence of connective tissue at most.",
  });
}

/* ----------------------------------------------------------------- followups */

async function draft({ business, conversation, state }) {
  const trade = getTrade(business.industry_id);
  const { answers } = await getFields(business.id);
  const documents = await getDocuments(business.id);

  const known = trade.needs
    .filter((need) => isAnswered(answers[need.key]))
    .map((need) => ({
      label: need.label,
      value: formatNeedValue(trade, need, answers[need.key]),
    }));

  const questions = await draftFollowups({
    trade,
    business,
    known,
    documentNames: documents.map((d) => d.name),
  });

  if (questions.length === 0) {
    return say({
      conversation,
      state: { ...state, followups: [], followupAnswers: [] },
      stage: STAGE.FINISHING,
      body: null,
      component: ui.working("Setting up your number"),
    });
  }

  const [first, ...rest] = questions;

  const message = await composeTurn({
    trade,
    business,
    situation: `You've got everything standard. You've thought of ${questions.length} more thing${questions.length === 1 ? "" : "s"} worth asking, specific to this business.`,
    instruction: `Say you have ${questions.length === 1 ? "one more thing" : `${questions.length} more things`} you'd want to know, then ask the first: "${first.prompt}"`,
    fallback:
      questions.length === 1
        ? "One more thing I'd want to know."
        : `${questions.length} more things I'd want to know.`,
  });

  return say({
    conversation,
    state: { ...state, followups: [first, ...rest], followupAnswers: [] },
    stage: STAGE.FOLLOWUPS,
    body: message,
    component: ui.followup(first),
  });
}

async function answerFollowup({ business, conversation, state, answer }) {
  const trade = getTrade(business.industry_id);
  const [current, ...rest] = state.followups ?? [];

  const collected = [...(state.followupAnswers ?? [])];

  /*
    Same rule as the needs above: a choice answer that isn't one of the offered
    options is not an answer. These pairs end up in the brief a voice agent reads
    out, so an unrecognised value would be spoken to a caller verbatim.
  */
  const answered = answerForFollowup(current, answer?.value);
  if (current && answered !== null) {
    collected.push({ id: current.id, question: current.prompt, answer: answered });
  }

  if (rest.length > 0) {
    const [next] = rest;
    const message = await composeTurn({
      trade,
      business,
      situation: `They answered "${current?.prompt}". You have ${rest.length} more question${rest.length === 1 ? "" : "s"}.`,
      instruction: `Ask the next one, in your own words: "${next.prompt}"`,
      fallback: next.prompt,
    });

    return say({
      conversation,
      state: { ...state, followups: rest, followupAnswers: collected },
      stage: STAGE.FOLLOWUPS,
      body: message,
      component: ui.followup(next),
    });
  }

  /*
    Follow-up answers aren't needs, so they don't belong in the needs-driven part
    of the record. They live under one key as question/answer pairs, which keeps
    them attributable — the dashboard can show what was asked, not just what was
    said, and the brief can pass both to the voice agent.
  */
  if (collected.length > 0) {
    await setField(business.id, "followups", collected, { source: "operator" });
  }

  return say({
    conversation,
    state: { ...state, followups: [], followupAnswers: collected },
    stage: STAGE.FINISHING,
    body: null,
    component: ui.working("Setting up your number"),
  });
}

/* --------------------------------------------------------------------- done */

async function finish({ business, conversation, state }) {
  const trade = getTrade(business.industry_id);

  const phoneNumber = await assignPhoneNumber(business.id, business.agent_phone_number);
  await updateBusiness(business.id, { onboarding_status: "complete" });

  const message = await composeTurn({
    trade,
    business,
    situation: `Setup is finished. Their agent's number is ${phoneNumber}. This is the number they give to customers; calls to it are answered by the agent you just briefed.`,
    instruction:
      "Tell them setup is done and that this is the number to give customers. One more sentence: anything they change on the dashboard, the agent knows on the next call. Don't repeat the number — it's displayed below in large type.",
    fallback:
      "That's you set up. The number below is the one to give customers — calls to it come to your agent. Anything you change on the dashboard, it'll know on the very next call.",
  });

  return say({
    conversation,
    state,
    stage: STAGE.DONE,
    body: message,
    component: ui.done(phoneNumber),
  });
}

/* ------------------------------------------------------------------- helpers */

/** Persists the agent's turn and the new stage, and returns what to render. */
async function say({ conversation, state, stage, body, component }) {
  await updateConversation(conversation.id, { stage, state });

  const messages = [];
  if (body) {
    messages.push(await appendMessage(conversation.id, { role: "agent", body, component }));
  }

  return { messages, component, stage };
}

/**
 * A human-readable version of what the user just answered, for the transcript.
 * Rendered as their own message so the conversation reads back as a conversation.
 */
export function describeAnswer({ trade, component, answer }) {
  if (!component) return null;

  switch (component.kind) {
    case ui.COMPONENT.CARDS:
      return component.options.find((o) => o.value === answer?.value)?.label ?? null;

    case ui.COMPONENT.URL:
      return answer?.skip ? "We don't have a website" : (answer?.url ?? null);

    case ui.COMPONENT.DOCUMENTS: {
      const docs = answer?.documents ?? [];
      if (!docs.length) return "Nothing to add";
      return docs.map((d) => d.name).join(", ");
    }

    case ui.COMPONENT.NEED: {
      const need = trade?.needs.find((n) => n.key === component.needKey);
      if (!need) return null;
      return formatNeedValue(trade, need, answer?.value) ?? "Skipped";
    }

    case ui.COMPONENT.FOLLOWUP: {
      const question = component.question;
      if (question?.kind === "choice") {
        return (
          question.options.find((o) => o.value === answer?.value)?.label ??
          answer?.value ??
          null
        );
      }
      return answer?.value ?? null;
    }

    default:
      return null;
  }
}

/**
 * The readable answer to a model-composed follow-up, or null if there isn't one.
 * Exported so the shape is testable without a database behind it.
 */
export function answerForFollowup(question, value) {
  if (!question) return null;

  if (question.kind === "choice") {
    const option = (question.options ?? []).find((o) => o.value === value);
    return option ? option.label : null;
  }

  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Options for a need, for the client to render a choice without the trade file. */
export function needSpec(trade, needKey) {
  const need = trade?.needs.find((n) => n.key === needKey);
  if (!need) return null;
  return { ...need, options: optionsForNeed(trade, need) };
}
