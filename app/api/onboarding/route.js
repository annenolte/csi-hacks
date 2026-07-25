import { NextResponse } from "next/server";
import { loadOnboarding, saveOnboarding } from "@/lib/db/onboarding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  GET  -> the whole saved wizard state, for restoring on load
  PATCH -> a partial save; the wizard posts after each step

  No auth in Phase 2 — one hardcoded business id, applied server-side. The client
  never names a business, so there is nothing to tamper with when accounts land.
*/

export async function GET() {
  try {
    return NextResponse.json(await loadOnboarding());
  } catch (err) {
    console.error("Failed to load onboarding state:", err);
    return NextResponse.json({ error: "Couldn't load your saved answers." }, { status: 500 });
  }
}

export async function PATCH(request) {
  let patch;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }

  try {
    return NextResponse.json(await saveOnboarding(patch));
  } catch (err) {
    console.error("Failed to save onboarding state:", err);
    return NextResponse.json({ error: "Couldn't save that." }, { status: 500 });
  }
}
