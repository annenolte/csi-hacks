import { requireBusiness } from "@/lib/auth/require";
import { getTrade } from "@/lib/trades";
import {
  appendMessage,
  getMessages,
  getOrCreateConversation,
} from "@/lib/data/conversation";
import { getBusiness } from "@/lib/data/business";
import { runTurn } from "@/lib/onboarding/engine";
import { attachmentsIn, describeAnswer } from "@/lib/onboarding/describe";
import { withTurnStream } from "@/lib/onboarding/stream";
import { COMPONENT } from "@/lib/onboarding/components";
import { connectionStatus } from "@/lib/calendar/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
  The studying stage reads the whole corpus in two model calls. Half a minute is
  normal and a minute isn't unusual; the platform default would cut it off partway
  and leave the conversation stuck on a stage that never completes.
*/
export const maxDuration = 300;

/*
  POST { answer } -> a stream of the agent's reply, then the next input.

  The response is newline-delimited JSON rather than one object, so the words
  reach the screen as the model writes them:

    {"type":"delta","text":"Read it. "}          zero or more
    {"type":"done","messages":[…],"component":…} exactly one, last
    {"type":"error","error":"…"}                 instead of done, on failure

  The `done` frame is the authority. Deltas are a preview the client throws away
  once the saved turn arrives, which is what makes it safe for a failed model
  call to fall back to different wording halfway through.

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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (frame) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(frame)}\n`));
      };

      try {
        const conversation = await getOrCreateConversation(business.id);
        const trade = getTrade(business.industry_id);

        /*
          The component the answer was given to is whatever the last agent turn
          put up — stored on the message, so the transcript can show what the
          person chose rather than the raw value behind it.
        */
        const history = await getMessages(conversation.id);
        const component =
          [...history].reverse().find((m) => m.component)?.component ?? null;

        /*
          The calendar answer is the one the client can't be the authority on:
          it says "connected" because Google redirected it back saying so. The
          stored connection is what the agent will read at call time, so it is
          also what the transcript records — otherwise a failed hand-off could
          leave a line saying a calendar was connected above a message
          explaining that none was.
        */
        let answer = body.answer;
        if (component?.kind === COMPONENT.CALENDAR && answer !== undefined) {
          answer = { connected: (await connectionStatus(business.id)).connected };
        }

        if (answer !== undefined && component?.kind !== COMPONENT.WORKING) {
          const described = describeAnswer({ trade, component, answer });
          const attachments = attachmentsIn(answer);

          if (described || attachments.length) {
            await appendMessage(conversation.id, {
              role: "user",
              body: described,
              /*
                An upload is recorded as the files it was, not as the files it
                carried. The text of a forty-page PDF is already stored as a
                document — keeping a second copy in the transcript would put
                megabytes into a row whose only reader draws a card with a name
                and a size on it.
              */
              answer: attachments.length ? { documents: attachments } : answer,
            });
          }
        }

        const result = await withTurnStream(
          (text) => send({ type: "delta", text }),
          () => runTurn({ business, conversation, answer }),
        );

        /*
          Re-read the business: the turn may have set the trade, the website, or
          the phone number, and the client renders all three.
        */
        const updated = await getBusiness(business.id);

        send({
          type: "done",
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
        send({ type: "error", error: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      /* Nginx and friends will otherwise buffer the whole turn and defeat this. */
      "x-accel-buffering": "no",
    },
  });
}
