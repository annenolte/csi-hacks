import "server-only";

import { db, unwrap } from "../supabase";

/*
  The onboarding interview, persisted turn by turn.

  Two reasons it lives in the database rather than in React state: a refresh
  halfway through shouldn't cost the owner the conversation, and later the
  operator can see what the agent was told and by whom. The wizard this replaced
  lost everything on reload, which made testing it miserable.
*/

const now = () => new Date().toISOString();

export async function getOrCreateConversation(businessId) {
  const existing = unwrap(
    await db()
      .from("conversations")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(1),
    "Couldn't load the conversation",
  );

  if (existing[0]) return existing[0];

  const created = unwrap(
    await db().from("conversations").insert({ business_id: businessId }).select(),
    "Couldn't start the conversation",
  );

  return created[0];
}

export async function updateConversation(conversationId, patch) {
  const rows = unwrap(
    await db()
      .from("conversations")
      .update({ ...patch, updated_at: now() })
      .eq("id", conversationId)
      .select(),
    "Couldn't save the conversation",
  );
  return rows[0] ?? null;
}

export async function getMessages(conversationId) {
  const rows = unwrap(
    await db()
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("id", { ascending: true }),
    "Couldn't load the conversation",
  );

  return rows.map(toMessage);
}

export async function appendMessage(conversationId, message) {
  const rows = unwrap(
    await db()
      .from("messages")
      .insert({
        conversation_id: conversationId,
        role: message.role,
        body: message.body ?? null,
        component: message.component ?? null,
        answer: message.answer ?? null,
      })
      .select(),
    "Couldn't save that message",
  );

  return toMessage(rows[0]);
}

function toMessage(row) {
  return {
    id: String(row.id),
    role: row.role,
    body: row.body,
    component: row.component,
    answer: row.answer,
    createdAt: row.created_at,
  };
}
