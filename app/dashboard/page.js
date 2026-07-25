import { Suspense } from "react";
import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard/Dashboard";
import { currentAccount } from "@/lib/auth/session";
import { PRODUCT_NAME } from "@/lib/brand";

export const metadata = { title: `Dashboard — ${PRODUCT_NAME}` };

export default async function DashboardPage() {
  if (!(await currentAccount())) redirect("/signin");

  /*
    useSearchParams (for the Google callback's result) needs a Suspense boundary
    or Next refuses to build the page.
  */
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
