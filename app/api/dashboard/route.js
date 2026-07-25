import { NextResponse } from "next/server";
import { requireBusiness } from "@/lib/auth/require";
import { getTrade } from "@/lib/trades";
import { formatNeedValue } from "@/lib/format";
import { isAnswered } from "@/lib/answered";
import { getDocuments, getFields, getSynthesis } from "@/lib/data/business";
import { connectionStatus } from "@/lib/calendar/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  Everything the dashboard renders, in one request.

  The shape here is "what the agent knows", not "what's in the database" — each
  need comes back with its value, where it came from, and the sentence it was read
  from, because the operator's job on this screen is to judge whether the agent
  believes something for a good reason before deciding to change it.
*/
export async function GET() {
  const { business, account, response } = await requireBusiness();
  if (response) return response;

  const trade = getTrade(business.industry_id);

  try {
    const [{ answers, meta }, documents, synthesis, calendar] = await Promise.all([
      getFields(business.id),
      getDocuments(business.id),
      getSynthesis(business.id),
      connectionStatus(business.id),
    ]);

    /*
      Driven by the trade's `needs` array, in its order. A need added there shows
      up here with no edit to this file — the same rule that makes it appear in
      the interview and in the extractor.
    */
    const knowledge = (trade?.needs ?? []).map((need) => ({
      key: need.key,
      label: need.label,
      hint: need.hint ?? null,
      question: need.question,
      required: Boolean(need.required),
      value: answers[need.key] ?? null,
      display: formatNeedValue(trade, need, answers[need.key]),
      answered: isAnswered(answers[need.key]),
      provenance: meta[need.key] ?? null,
      /* Both sides of a disagreement, so the operator can pick the right one. */
      conflicts: synthesis.facts
        .filter((f) => f.key === need.key && f.conflicted)
        .map((f) => ({
          display: formatNeedValue(trade, need, f.value),
          value: f.value,
          source: f.source,
          document: f.document,
          confidence: f.confidence,
        })),
    }));

    const services = trade?.services ?? [];

    return NextResponse.json({
      account: { firstName: account.firstName, email: account.email },
      business: {
        name: business.name,
        tradeId: business.industry_id,
        tradeLabel: trade?.label ?? null,
        websiteUrl: business.website_url,
        phoneNumber: business.agent_phone_number,
        status: business.onboarding_status,
      },
      knowledge,
      /* Not a need — question/answer pairs the agent composed during setup. */
      followups: Array.isArray(answers.followups) ? answers.followups : [],
      prices: synthesis.prices.map((price) => ({
        ...price,
        serviceLabel:
          services.find((s) => s.key === price.serviceKey)?.label ?? price.serviceKey,
      })),
      documents: documents.map(({ text, ...rest }) => ({
        ...rest,
        /* The body can be tens of thousands of characters; the list shows a count. */
        preview: text ? `${text.slice(0, 140).replace(/\s+/g, " ").trim()}…` : null,
      })),
      calendar,
    });
  } catch (err) {
    console.error("Couldn't load the dashboard:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
