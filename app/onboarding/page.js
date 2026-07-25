import { redirect } from "next/navigation";
import Conversation from "@/components/onboarding/Conversation";
import { currentAccount } from "@/lib/auth/session";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata = { title: `Set up your agent — ${PRODUCT_NAME}` };

export default async function OnboardingPage() {
  /*
    Gate on the server. Rendering the conversation and letting its first fetch
    401 would show a signed-out person a chat window that silently fails.
  */
  if (!(await currentAccount())) redirect("/signin");

  return <Conversation />;
}
