"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppHeader, { SignOutButton } from "../AppHeader";
import Overview from "./Overview";
import Knowledge from "./Knowledge";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "knowledge", label: "What it knows" },
];

/* No setState in here, so both the first load and every refresh can share it. */
async function fetchDashboard() {
  try {
    const response = await fetch("/api/dashboard");
    const payload = await response.json();
    if (!response.ok) return { error: payload.error ?? "Couldn't load your dashboard." };
    return { data: payload };
  } catch {
    return { error: "Couldn't reach the server." };
  }
}

export default function Dashboard() {
  const params = useSearchParams();
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((result) => {
    if (result.error) setError(result.error);
    else {
      setData(result.data);
      setError(null);
    }
    setLoading(false);
  }, []);

  const load = useCallback(async () => apply(await fetchDashboard()), [apply]);

  useEffect(() => {
    /* Ignore a response that lands after the component is gone. */
    let cancelled = false;
    fetchDashboard().then((result) => {
      if (!cancelled) apply(result);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  /* The Google callback redirects here with the outcome in the query string. */
  const calendarNotice = (() => {
    const status = params.get("calendar");
    if (status === "connected") {
      const account = params.get("account");
      return { tone: "ok", text: account ? `Connected ${account}.` : "Connected." };
    }
    if (status === "error") {
      return { tone: "error", text: params.get("reason") ?? "That didn't work." };
    }
    return null;
  })();

  return (
    <div className="relative min-h-dvh">
      <div
        aria-hidden="true"
        className="mesh-top pointer-events-none absolute inset-x-0 top-0 h-[280px]"
      />

      <div className="relative mx-auto w-full max-w-4xl px-5 py-7 sm:px-6 sm:py-10">
        <AppHeader business={data?.business} action={<SignOutButton />} />

        {/*
          The same pill geometry as the landing page's nav, at the size a tab
          wants: ink-filled for the section you are in, nothing at all for the
          one you aren't. The rail is translucent over the mesh rather than
          solid, so the gradient carries through the top of every screen.
        */}
        <nav aria-label="Dashboard sections" className="mt-9">
          <ol className="inline-flex items-center gap-1 rounded-full border border-line bg-paper/60 p-1 backdrop-blur-md">
            {TABS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setTab(item.id)}
                  aria-current={tab === item.id ? "page" : undefined}
                  className={`rounded-full px-5 py-2 text-[14px] font-medium transition-all duration-200 ${
                    tab === item.id
                      ? "bg-ink text-white shadow-lift"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <main className="mt-7 pb-20">
          {loading && <Skeleton />}

          {error && (
            <div
              role="alert"
              className="rounded-[var(--radius-card)] border border-flag/30 bg-flag/5 px-5 py-4 text-[14px] leading-relaxed text-flag"
            >
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              {data.business.status !== "complete" && <ResumeBanner />}
              {tab === "overview" ? (
                <Overview data={data} notice={calendarNotice} onRefresh={load} />
              ) : (
                <Knowledge data={data} onRefresh={load} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/*
  Cards in the shape of the ones about to replace them, rather than the word
  "Loading". The dashboard's first paint is a fetch away on every visit, and a
  layout that is already the right shape doesn't jump when the data lands.
*/
function Skeleton() {
  return (
    <div aria-hidden="true" className="space-y-5">
      <div className="rounded-[var(--radius-card)] border border-line bg-paper p-6 shadow-lift">
        <div className="mx-auto h-3 w-32 animate-pulse rounded-full bg-line" />
        <div className="mx-auto mt-4 h-10 w-64 animate-pulse rounded-full bg-line" />
        <div className="mx-auto mt-4 h-3 w-72 animate-pulse rounded-full bg-line" />
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-[var(--radius-card)] border border-line bg-paper p-6 shadow-lift"
        >
          <div className="h-3.5 w-40 animate-pulse rounded-full bg-line" />
          <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-line" />
          <div className="mt-2.5 h-3 w-2/3 animate-pulse rounded-full bg-line" />
        </div>
      ))}
      <p className="sr-only" role="status">
        Loading your dashboard.
      </p>
    </div>
  );
}

function ResumeBanner() {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-cream px-5 py-4 shadow-lift">
      <p className="flex items-center gap-2.5 text-[14px] leading-relaxed text-ink-soft">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-flag" />
        Setup isn&apos;t finished — your agent doesn&apos;t have a number yet.
      </p>
      <Link
        href="/onboarding"
        className="shrink-0 rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-white shadow-lift transition-all hover:-translate-y-px hover:shadow-pop"
      >
        Pick it back up
      </Link>
    </div>
  );
}
