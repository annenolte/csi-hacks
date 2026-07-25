import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth/require";
import { getMessages, getOrCreateConversation } from "@/lib/data/conversation";
import { openingTurn } from "@/lib/onboarding/engine";
import { claudeIsConfigured } from "@/lib/onboarding/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* The opening turn is a model call; the default budget would cut it off. */
export const maxDuration = 120;

/*
  GET -> the conversation so far, plus the input to render next.

  On a fresh conversation this also writes the opening turn, so loading the page
  for the first time and reloading it halfway through are the same code path.
  There is no separate "start" endpoint to drift out of sync with this one.
*/
export async function GET() {
  const { business, response } = await requireBusiness();
  if (response) return response;

  if (!claudeIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Setting up an agent needs an ANTHROPIC_API_KEY. Add one to .env.local and " +
          "restart the server — see docs/SETUP.md.",
      },
      { status: 503 },
    );
  }

  let messages;

  try {
    const conversation = await getOrCreateConversation(business.id);
    messages = await getMessages(conversation.id);

    if (messages.length === 0) {
      await openingTurn({ business, conversation });
      messages = await getMessages(conversation.id);
    }
  } catch (err) {
    console.error("Couldn't load onboarding:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  return NextResponse.json({
    business: {
      name: business.name,
      tradeId: business.industry_id,
      phoneNumber: business.agent_phone_number,
      status: business.onboarding_status,
    },
    messages,
    /* The live input is whatever the most recent agent turn put up. */
    component: [...messages].reverse().find((m) => m.component)?.component ?? null,
  });
}
