import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth/require";
import { getTrade } from "@/lib/trades";
import {
  appendMessage,
  getMessages,
  getOrCreateConversation,
} from "@/lib/data/conversation";
import { getBusiness } from "@/lib/data/business";
import { describeAnswer, runTurn } from "@/lib/onboarding/engine";
import { COMPONENT } from "@/lib/onboarding/components";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
  The studying stage reads the whole corpus in two model calls. Half a minute is
  normal and a minute isn't unusual; the platform default would cut it off partway
  and leave the conversation stuck on a stage that never completes.
*/
export const maxDuration = 300;

/*
  POST { answer } -> the agent's reply and the next input.

  The client never says which stage it's on and never says which business it is.
  Both come from the server — the stage from the conversation row, the business
  from the session — so a replayed or hand-crafted request can't jump the script
  or reach another account's data.
*/
export async function POST(request) {
  const { business, response } = await requireBusiness();
  if (response) return response;

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* An empty body is how the client says "carry on" during a working stage. */
  }

  try {
    const conversation = await getOrCreateConversation(business.id);
    const trade = getTrade(business.industry_id);

    /*
      The component the answer was given to is whatever the last agent turn put
      up — stored on the message, so the transcript can show what the person
      chose rather than the raw value behind it.
    */
    const history = await getMessages(conversation.id);
    const component = [...history].reverse().find((m) => m.component)?.component ?? null;

    if (body.answer !== undefined && component?.kind !== COMPONENT.WORKING) {
      const described = describeAnswer({ trade, component, answer: body.answer });
      if (described) {
        await appendMessage(conversation.id, {
          role: "user",
          body: described,
          answer: body.answer,
        });
      }
    }

    const result = await runTurn({ business, conversation, answer: body.answer });

    /*
      Re-read the business: the turn may have set the trade, the website, or the
      phone number, and the client renders all three.
    */
    const updated = await getBusiness(business.id);

    return NextResponse.json({
      business: {
        name: updated.name,
        tradeId: updated.industry_id,
        phoneNumber: updated.agent_phone_number,
        status: updated.onboarding_status,
      },
      messages: await getMessages(conversation.id),
      component: result.component,
    });
  } catch (err) {
    console.error("Onboarding turn failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
