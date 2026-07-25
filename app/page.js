import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import { ScriptNote } from "@/components/ui";
import { PRODUCT_NAME } from "@/lib/brand";
import { TRADES } from "@/lib/trades";
import { currentAccount } from "@/lib/auth/session";

/*
  The landing page, built from design/references/*.png: pastel mesh bleeding off
  the top edge, one enormous two-tone headline, handwritten asides, pill geometry,
  hairline borders. Light only — the reference has no dark mode and this should
  read as paper.

  Server component so the nav can say "Dashboard" to someone already signed in
  rather than inviting them to create a second account.
*/

export default async function Home() {
  const account = await currentAccount();

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden">
      <div
        aria-hidden="true"
        className="mesh-top pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-80"
      />

      <Nav account={account} />

      <main className="relative flex-1">
        <Hero account={account} />
        <Imagine />
        <HowItWorks />
        <Specialists />
        <Closer account={account} />
      </main>

      <Footer />
    </div>
  );
}

function Nav({ account }) {
  return (
    <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
      <Wordmark href="/" />

      <nav className="flex items-center gap-1.5">
        {account ? (
          <Link
            href="/dashboard"
            className="rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-white shadow-lift transition-all hover:-translate-y-px hover:shadow-pop"
          >
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/signin"
              className="rounded-full px-4 py-2.5 text-[14px] font-medium text-ink-soft transition-colors hover:bg-paper/70 hover:text-ink"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-white shadow-lift transition-all hover:-translate-y-px hover:shadow-pop"
            >
              Create an account
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

function Hero({ account }) {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 pb-24 pt-16 text-center sm:pt-24">
      <p className="flex items-center gap-2 text-[14px] text-muted">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-flag" />
        The average trade business misses one call in four
      </p>

      <h1 className="display mt-7 text-[44px] sm:text-[68px]">
        A phone line that
        <br />
        already knows
        <br />
        the job
      </h1>

      <p className="mt-8 max-w-[48ch] text-[17px] leading-relaxed text-muted">
        Hand over the website and the documents you&apos;d give a new hire. An
        agent reads all of it, asks about whatever&apos;s missing, and answers your
        phone with the answers you&apos;d have given yourself.
      </p>

      <div className="mt-12 flex flex-col items-center gap-2">
        <ScriptNote className="self-start sm:-ml-20">
          About ten minutes, once
        </ScriptNote>
        <Link
          href={account ? "/dashboard" : "/signup"}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-8 py-4 text-[16px] font-medium text-white shadow-lift transition-all hover:-translate-y-px hover:shadow-pop"
        >
          {account ? "Go to dashboard" : "Create an account"}
          <Chevron />
        </Link>
      </div>
    </section>
  );
}

function Imagine() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20 sm:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
        <div className="shrink-0 pt-1">
          <ScriptNote color="blue">Imagine</ScriptNote>
        </div>
        <p className="display max-w-[26ch] text-[28px] sm:max-w-[30ch] sm:text-[38px]">
          <span className="text-ink">
            A caller at 7pm on a Sunday getting a real answer:
          </span>{" "}
          <span className="text-muted">
            your hours, your patch, what you charge for a drain — and a slot in
            your calendar before they call the next number on the list.
          </span>
        </p>
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Pick your trade",
    body: "A plumbing agent already knows what a caller with a burst pipe needs. You're not training it from nothing — you're telling it about your business.",
  },
  {
    n: "02",
    title: "Hand over what you have",
    body: "Your website, your price list, the induction notes you give a new hire. It reads all of it at once and pulls out what a caller would actually ask.",
  },
  {
    n: "03",
    title: "Answer what's missing",
    body: "It comes back with the gaps — the things no document covered — and asks about those specifically. Nothing you've already answered gets asked twice.",
  },
];

function HowItWorks() {
  return (
    <section className="border-y border-line bg-paper/60">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:px-8">
        <h2 className="display max-w-[20ch] text-[28px] sm:text-[34px]">
          <span className="text-ink">Setup is a conversation,</span>{" "}
          <span className="text-muted">not a form.</span>
        </h2>

        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-[var(--radius-card)] border border-line bg-paper p-6 shadow-lift"
            >
              <span className="script text-[24px] text-script-green">{step.n}</span>
              <h3 className="mt-2 text-[17px] font-medium tracking-[-0.015em] text-ink">
                {step.title}
              </h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Specialists() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:px-8">
      <h2 className="display max-w-[24ch] text-[28px] sm:text-[34px]">
        <span className="text-ink">One agent per trade.</span>{" "}
        <span className="text-muted">
          You wouldn&apos;t hire a SaaS sales rep to run a plumbing line.
        </span>
      </h2>

      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TRADES.map((trade) => (
          <li
            key={trade.id}
            className={`rounded-[var(--radius-card)] border border-line bg-paper p-5 ${
              trade.available ? "shadow-lift" : "opacity-60"
            }`}
          >
            <span
              aria-hidden="true"
              className="grid h-10 w-10 place-items-center rounded-xl bg-canvas text-[19px]"
            >
              {trade.icon}
            </span>
            <div className="mt-3 flex items-center gap-2">
              <h3 className="text-[15.5px] font-medium tracking-[-0.01em] text-ink">
                {trade.label}
              </h3>
              {!trade.available && (
                <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted">
                  Soon
                </span>
              )}
            </div>
            <p className="mt-1 text-[13.5px] leading-snug text-muted">
              {trade.blurb}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Closer({ account }) {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 pb-28 pt-8 text-center">
      <h2 className="display text-[32px] sm:text-[44px]">
        Stop losing the ones
        <br />
        who don&apos;t leave a message
      </h2>
      <div className="mt-10 flex justify-center">
        <Link
          href={account ? "/dashboard" : "/signup"}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-8 py-4 text-[16px] font-medium text-white shadow-lift transition-all hover:-translate-y-px hover:shadow-pop"
        >
          {account ? "Go to dashboard" : "Create an account"}
          <Chevron />
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Wordmark href="/" />
        <p className="text-[13px] text-faint">
          {PRODUCT_NAME} — a working prototype, not a live phone service.
        </p>
      </div>
    </footer>
  );
}

function Chevron() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M5 3l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
