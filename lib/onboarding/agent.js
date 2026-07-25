import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/*
  The two model calls that make onboarding feel like a conversation.

    composeTurn   — writes what the agent says at this point in the script
    draftFollowups — composes questions nothing in the script anticipated

  What the model does NOT decide: which stage comes next, which component gets
  rendered, or whether an answer was good enough. That is the script's job
  (lib/onboarding/engine.js), and keeping it there is why this can't wander off
  or strand someone halfway through.
*/

const MODEL = "claude-opus-5";

export function claudeIsConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SPECIALIST_SYSTEM = `You are a setup specialist for a phone-answering service. You are onboarding the owner of a small trade business so that an AI agent can answer their phone.

You have worked with hundreds of businesses in this trade. You know what callers actually ask, so you know which details matter and which don't. Write like a competent person doing an intake, not like a chatbot.

How to write:
- Two or three sentences. Sometimes one. Never a wall of text.
- Plain sentences. No bullet points, no headings, no markdown, no emoji.
- Say what you just did or found before you ask the next thing, so the person can see the work happening.
- Never invent a fact about their business. You are told everything you know; if something isn't in what you were told, you don't know it.
- Don't thank them for every answer, don't say "great!", don't recap what they just typed back at them.
- The input control is rendered for you directly below your message. Refer to it naturally ("drop them in below") — never describe a button you can't see and never ask them to type something the control already handles.
- British or American spelling: match whatever the business's own words use, and default to American.`;

async function callModel({ system, prompt, schema, maxTokens = 2000 }) {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    /*
      Low effort on purpose. This is short conversational prose with all the facts
      supplied — the work is in the extraction calls, not here, and every extra
      second of thinking is a second the person sits watching a typing indicator.
      max_tokens has to cover thinking as well as the reply, hence the headroom.
    */
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The setup agent declined to answer.");
  }

  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("The setup agent returned nothing.");

  return JSON.parse(block.text);
}

/* ------------------------------------------------------------- what to say */

const TURN_SCHEMA = {
  type: "object",
  properties: {
    message: {
      type: "string",
      description:
        "What you say next. Two or three sentences of plain prose. No markdown.",
    },
  },
  required: ["message"],
  additionalProperties: false,
};

/**
 * Writes one agent turn.
 *
 * `fallback` is the line to use if the model call fails. This is wording, not
 * substance — every fact in the message is supplied by the caller, so falling
 * back to a plainer sentence loses polish and nothing else. Extraction failures
 * are a different matter and are never swallowed like this.
 */
export async function composeTurn({ trade, business, situation, instruction, fallback }) {
  if (!claudeIsConfigured()) return fallback;

  const prompt = [
    `Trade: ${trade?.label ?? "unknown"}`,
    `Business name: ${business.name}`,
    "",
    "What just happened:",
    situation,
    "",
    "What to say now:",
    instruction,
  ].join("\n");

  try {
    const result = await callModel({
      system: SPECIALIST_SYSTEM,
      prompt,
      schema: TURN_SCHEMA,
    });
    return result.message?.trim() || fallback;
  } catch (err) {
    console.error("Couldn't compose an agent turn:", err);
    return fallback;
  }
}

/* -------------------------------------------------------- follow-up drafting */

const FOLLOWUPS_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      description:
        "Between 0 and 3 questions. Zero is a perfectly good answer when nothing important is missing.",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Short lowercase slug, e.g. parking_access or callout_fee.",
          },
          prompt: {
            type: "string",
            description:
              "The question, addressed to the owner. One sentence. No preamble.",
          },
          why: {
            type: "string",
            description:
              "One short clause on what a caller would ask that makes this matter. Shown under the question.",
          },
          kind: {
            type: "string",
            enum: ["choice", "text"],
            description:
              "Use choice when the realistic answers are a small closed set. Use text when the answer is genuinely open.",
          },
          options: {
            type: "array",
            description:
              "For kind=choice, 2 to 4 short options. Empty array for kind=text.",
            items: {
              type: "object",
              properties: {
                value: { type: "string", description: "Short lowercase slug." },
                label: { type: "string", description: "What the owner reads." },
              },
              required: ["value", "label"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "prompt", "why", "kind", "options"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

const FOLLOWUPS_SYSTEM = `${SPECIALIST_SYSTEM}

Right now you are deciding what else to ask. You have already collected the standard details for this trade. Your job is to spot what is missing that a real caller would ask about and that nothing you have been given covers.

Rules:
1. Ask at most three questions, and fewer is better. An unnecessary question costs the owner's patience and buys nothing.
2. Never ask about something you already know. Everything you know is listed for you.
3. Ask only about things that change what you would say on a phone call. Not marketing, not preferences, not anything you would never need mid-call.
4. Prefer multiple choice when the realistic answers are a small closed set — it is faster to answer and cleaner to act on. Use free text only when the answer genuinely varies.
5. If nothing important is missing, return an empty list. That is a good outcome, not a failure.`;

/**
 * Composes the questions the standard need list never thought to ask — the
 * trade-specific gaps that only show up once you can see what this particular
 * business does and doesn't say.
 */
export async function draftFollowups({ trade, business, known, documentNames }) {
  if (!claudeIsConfigured()) return [];

  const prompt = [
    `Trade: ${trade.label}`,
    `Business: ${business.name}`,
    "",
    "What you already know about this business:",
    known.length
      ? known.map((k) => `- ${k.label}: ${k.value}`).join("\n")
      : "- Nothing yet.",
    "",
    "Documents you have read:",
    documentNames.length ? documentNames.map((n) => `- ${n}`).join("\n") : "- None.",
    "",
    "What would you still need to know to answer this business's phone well? Ask at most three questions. Return an empty list if nothing important is missing.",
  ].join("\n");

  try {
    const result = await callModel({
      system: FOLLOWUPS_SYSTEM,
      prompt,
      schema: FOLLOWUPS_SCHEMA,
      maxTokens: 4000,
    });

    return (result.questions ?? [])
      .filter((q) => q?.id && q?.prompt)
      .slice(0, 3)
      .map((q) => ({
        id: String(q.id),
        prompt: q.prompt,
        why: q.why ?? null,
        /* A choice with no options is unanswerable — degrade it to free text. */
        kind: q.kind === "choice" && q.options?.length >= 2 ? "choice" : "text",
        options: q.kind === "choice" ? (q.options ?? []).slice(0, 4) : [],
      }));
  } catch (err) {
    /*
      Follow-ups are a bonus round on top of a complete standard interview. If the
      model can't draft them, finishing setup without them is far better than
      blocking someone at the last step.
    */
    console.error("Couldn't draft follow-up questions:", err);
    return [];
  }
}
