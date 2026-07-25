import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentAccount } from "@/lib/auth/session";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata = { title: `Sign in — ${PRODUCT_NAME}` };

export default async function SignInPage() {
  if (await currentAccount()) redirect("/dashboard");

  return <AuthForm mode="signin" />;
}
