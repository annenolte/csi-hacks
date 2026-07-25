import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentAccount } from "@/lib/auth/session";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata = { title: `Create an account — ${PRODUCT_NAME}` };

export default async function SignUpPage() {
  /* Already signed in? Signing up again would orphan the first business. */
  if (await currentAccount()) redirect("/dashboard");

  return <AuthForm mode="signup" />;
}
