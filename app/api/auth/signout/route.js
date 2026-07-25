import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

export const runtime = "nodejs";

/* POST only. A GET would let any page sign the user out with an <img> tag. */
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true, next: "/" });
}
