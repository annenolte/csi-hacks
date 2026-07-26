/*
  The structured inputs the onboarding agent can put in front of someone.

  This list is deliberately short and closed. The agent writes the words; the
  script decides which of these to render. That split is the whole design: a
  conversation that can't get stuck, can't render something broken, and can't
  skip a step — while still reading like talking to someone rather than filling
  in a form.

  The one exception is FOLLOWUP, where the model genuinely composes the question
  and its options. Even there it picks from `choice` or `text` and nothing else.
*/

export const COMPONENT = {
  /** The industry picker. Options come from the trade list. */
  CARDS: "cards",
  /** A website URL, with a way to say there isn't one. */
  URL: "url",
  /** Drag-and-drop for training documents, with a way to say there aren't any. */
  DOCUMENTS: "documents",
  /**
   * One need from the trade definition, rendered by the same NeedField the
   * dashboard uses. The agent asks with the need's `question`, not its `label`.
   */
  NEED: "need",
  /** A model-composed follow-up: multiple choice, or free text. */
  FOLLOWUP: "followup",
  /** Connect Google Calendar, or say not now. */
  CALENDAR: "calendar",
  /** The agent is working. The client re-posts to continue; no input is taken. */
  WORKING: "working",
  /** Nothing to answer — onboarding is finished. */
  DONE: "done",
};

export const cards = (options) => ({ kind: COMPONENT.CARDS, options });

export const urlField = () => ({
  kind: COMPONENT.URL,
  placeholder: "yourbusiness.com",
  skipLabel: "We don't have a website",
});

/*
  Note what isn't here: which file formats the picker offers.

  Every component built here is written to the conversation row and replayed on
  the next page load, which makes it durable state — and durable state is exactly
  the wrong home for a list that changes whenever a reader is added. A component
  stored last week would go on offering last week's formats to someone who is
  mid-conversation, with no way to tell from the screen that it was stale.

  So the list lives in lib/documents/formats.js, beside the readers that honour
  it, and Composer reads it at render time.
*/
export const documentsField = () => ({
  kind: COMPONENT.DOCUMENTS,
  skipLabel: "Nothing to add",
});

/**
 * One need from the trade definition.
 *
 * `current` prefills the field with what's already known, and `conflicts` carries
 * both sides when two documents disagreed. Without them a conflict question shows
 * an empty box under a message saying two documents disagree, which asks someone
 * to settle an argument they can't see.
 */
export const needField = (needKey, { current = null, conflicts = [] } = {}) => ({
  kind: COMPONENT.NEED,
  needKey,
  current,
  conflicts,
});

export const followup = (question) => ({ kind: COMPONENT.FOLLOWUP, question });

/*
  The calendar hand-off.

  It carries no OAuth detail — the connect link is a route, and where Google
  sends someone afterwards is decided by the server. A component is replayed out
  of the conversation row on every page load, and a stored redirect URL is the
  kind of thing that goes stale and sends someone to the wrong place a week later.
*/
export const calendarField = () => ({
  kind: COMPONENT.CALENDAR,
  skipLabel: "Not right now",
});

export const working = (label) => ({ kind: COMPONENT.WORKING, label });

export const done = (phoneNumber) => ({ kind: COMPONENT.DONE, phoneNumber });

/** True when the client should immediately ask the server to continue. */
export const isAuto = (component) => component?.kind === COMPONENT.WORKING;
