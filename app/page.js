import Link from "next/link";
import Wordmark from "@/components/Wordmark";
import Mark from "@/components/Mark";
import { ScriptNote } from "@/components/ui";
import FloatingNav from "@/components/landing/FloatingNav";
import HoverRoll from "@/components/landing/HoverRoll";
import Reveal from "@/components/landing/Reveal";
import ShimmerButton from "@/components/landing/ShimmerButton";
import SplitText from "@/components/landing/SplitText";
import DashboardMock from "@/components/landing/DashboardMock";
import CallMock from "@/components/landing/CallMock";
import Faq from "@/components/landing/Faq";
import PressSpace from "@/components/landing/PressSpace";
import AutoScroll from "@/components/landing/AutoScroll";
import { PRODUCT_NAME } from "@/lib/brand";
import { TRADES } from "@/lib/trades";
import { ACCEPT_SUMMARY } from "@/lib/documents/formats";
import { currentAccount } from "@/lib/auth/session";

/*
  The landing page, modelled closely on the Merlin marketing site in
  design/references/*.png — the same shape of page, section for section, in our
  own tokens and about our own product.

  What is borrowed is the construction, and it is all in the components:
  SplitText (headline arrives a character at a time), HoverRoll (link labels
  roll up to a duplicate), ShimmerButton (a conic gradient turning behind a
  pill), Cursor (a dot trailing the pointer), FloatingNav (a translucent pill
  that appears once the hero is behind you) and PressSpace (the footer
  shortcut). The reference ships GSAP, Lenis and Framer Motion to do those;
  none of them are dependencies here.

  AutoScroll is ours rather than the reference's: double-tap S and the page
  tours itself, top to bottom and back, until S S stops it. It draws nothing.

  What isn't borrowed is anything that would be a lie. The reference lines up
  customer logos under "Used by professionals at" — those are other companies'
  marks, and we have no customers to name — so that band shows what the reader
  actually hands over instead: the file formats we read. Everything the page
  claims is something this repo does.

  Server component, so the nav can say "Dashboard" to someone already signed in
  rather than inviting them to create a second account.
*/

export default async function Home() {
  const account = await currentAccount();

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden">
      <div
        aria-hidden="true"
        className="mesh-top pointer-events-none absolute inset-x-0 top-0 h-[340px]"
      />

      <AutoScroll />
      <FloatingNav account={account} />
      <TopBar account={account} />

      <main className="relative flex-1">
        <Hero account={account} />
        <Imagine />
        <OneAnswer />
        <TwoUp />
        <Trades />
        <HowItWorks />
        <Comparison account={account} />
        <Manifesto />
        <Trust />
        <Closer account={account} />
        <Questions />
      </main>

      <Footer account={account} />
    </div>
  );
}

/*
  A quiet top bar, kept because the floating pill is deliberately absent for
  the whole first screen and someone who lands signed-out still needs a way in.
*/
function TopBar({ account }) {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
      <Wordmark href="/" />

      <nav className="flex items-center gap-5">
        {account ? (
          <Link
            href="/dashboard"
            className="rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition-transform duration-200 hover:-translate-y-px"
          >
            Go to dashboard
          </Link>
        ) : (
          <>
            <span className="hidden text-[14px] text-ink-soft sm:block">
              <HoverRoll href="/signin">Sign in</HoverRoll>
            </span>
            <Link
              href="/signup"
              className="rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-white transition-transform duration-200 hover:-translate-y-px"
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
    <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-20 pt-10 text-center sm:pt-16">
      <p className="flex items-center gap-2 text-[13.5px] text-muted">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-script-green" />
        The average trade business misses one call in four
      </p>

      <h1 className="display mt-8 text-[42px] font-normal leading-[0.98] tracking-[-0.045em] sm:text-[70px]">
        <SplitText lines={["A phone line that"]} />
        {/* The mark sits in the sentence the way the reference sets its own —
            a tile on the baseline, arriving in the stagger's own rhythm. */}
        <span className="block">
          <SplitText lines={["already"]} delay={408} block={false} />
          <span
            aria-hidden="true"
            className="char mx-[0.16em] inline-grid h-[0.8em] w-[0.8em] translate-y-[0.06em] place-items-center rounded-[0.2em] bg-ink text-white"
            style={{ "--i": 25 }}
          >
            <Mark className="h-[0.54em] w-[0.54em]" />
          </span>
          <SplitText lines={["knows"]} delay={624} block={false} />
        </span>
        <SplitText lines={["the job"]} delay={768} />
      </h1>

      <p className="mt-8 max-w-[48ch] text-[16.5px] leading-relaxed text-muted">
        Hand over the website and the documents you&apos;d give a new hire.{" "}
        {PRODUCT_NAME}{" "}
        reads all of it, asks about whatever&apos;s missing, and answers your phone with
        the answers you&apos;d have given yourself.
      </p>

      <div className="mt-12 flex flex-col items-center gap-1">
        <ScriptNote className="self-start sm:-ml-24">About ten minutes, once</ScriptNote>
        <ShimmerButton href={account ? "/dashboard" : "/signup"}>
          {account ? "Go to dashboard" : "Create an account"}
        </ShimmerButton>
      </div>

      <FormatsBand />
    </section>
  );
}

/*
  The band the reference fills with customer logos. We have no customers to
  name and their logos aren't ours to print, so it carries the one thing a
  reader wants to know before signing up: whether we can read what they have.
  The list comes from lib/documents/formats.js, so it can't drift from what
  /api/documents/extract will actually accept.
*/
function FormatsBand() {
  return (
    <Reveal className="mt-20 w-full" delay={120}>
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
        <p className="text-[10.5px] uppercase tracking-[0.12em] text-muted">
          Reads what you already have
        </p>
        <span aria-hidden="true" className="h-px flex-1 bg-line" />
      </div>

      <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-9 gap-y-3">
        {["Your website", "PDF", "Word", "Excel", "PowerPoint", "Plain text"].map((f) => (
          <li key={f} className="text-[15px] font-medium tracking-[-0.01em] text-faint">
            {f}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[12px] text-faint">{ACCEPT_SUMMARY}</p>
    </Reveal>
  );
}

function Imagine() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-24 sm:px-8">
      <Reveal>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
          <div className="shrink-0 pt-1">
            <ScriptNote color="blue">Imagine</ScriptNote>
          </div>
          <p className="display max-w-[26ch] text-[26px] sm:max-w-[32ch] sm:text-[36px]">
            <span className="text-ink">A caller at 7pm on a Sunday getting a real answer:</span>{" "}
            <span className="text-muted">
              your hours, your patch, what you charge for a drain, and a slot in your
              calendar before they call the next number on the list.
            </span>
          </p>
        </div>
      </Reveal>

      <Reveal delay={140} className="dot-grid mt-14 rounded-[32px] border border-line p-4 sm:p-10">
        <DashboardMock />
      </Reveal>
    </section>
  );
}

function OneAnswer() {
  return (
    <section className="border-y border-line bg-cream">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:px-8">
        <Reveal>
          <h2 className="display max-w-[24ch] text-[30px] sm:text-[42px]">
            Your website, your documents &amp; your calendar, finally one answer
          </h2>
          <p className="mt-4 max-w-[60ch] text-[16px] leading-relaxed text-muted">
            {PRODUCT_NAME} reads the lot in one pass, quotes the sentence each fact came
            from, and hands a caller the same answer you would have.
          </p>
        </Reveal>

        <Reveal delay={140} className="mt-12">
          <CallMock />
        </Reveal>
      </div>
    </section>
  );
}

const PANELS = [
  {
    eyebrow: "Read, not guessed",
    title: "Every answer has a source",
    body:
      "Each fact carries the sentence it came from. When two documents disagree, you get both and pick. Nothing is averaged into a number a caller would be quoted.",
    background: "linear-gradient(155deg,#f8ede2 0%,#f1e7de 46%,#e9e7e3 100%)",
  },
  {
    eyebrow: "Not-found is an answer",
    title: "It asks rather than invents",
    body:
      "If your documents never said it, the agent doesn't say it either. The gap becomes a question you answer once, in a conversation, not a field you'd never have filled in.",
    background: "linear-gradient(155deg,#c3e5fb 0%,#dbe8f2 48%,#e7e6e3 100%)",
  },
];

function TwoUp() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 sm:px-8">
      <div className="grid gap-5 md:grid-cols-2">
        {PANELS.map((panel, i) => (
          <Reveal
            key={panel.title}
            delay={i * 120}
            className="min-h-[340px]"
          >
            <div
              className="flex h-full min-h-[340px] flex-col justify-end rounded-[28px] p-8 sm:p-10"
              style={{ background: panel.background }}
            >
              <p className="text-[12px] uppercase tracking-[0.1em] text-ink-soft/60">
                {panel.eyebrow}
              </p>
              <h3 className="display mt-3 text-[26px] sm:text-[32px]">{panel.title}</h3>
              <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft/80">
                {panel.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Trades() {
  return (
    <section id="trades" className="mx-auto w-full max-w-6xl px-6 pb-24 sm:px-8">
      <Reveal>
        <h2 className="display max-w-[24ch] text-[28px] sm:text-[36px]">
          <span className="text-ink">One agent per trade.</span>{" "}
          <span className="text-muted">
            You wouldn&apos;t hire a SaaS sales rep to answer a trade line.
          </span>
        </h2>
      </Reveal>

      <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TRADES.map((trade, i) => (
          <Reveal
            key={trade.id}
            as="li"
            delay={i * 90}
            className="rounded-[var(--radius-card)] border border-line bg-paper p-5 shadow-lift transition-transform duration-300 hover:-translate-y-1 hover:shadow-pop"
          >
            <span
              aria-hidden="true"
              className="grid h-10 w-10 place-items-center rounded-xl bg-canvas text-[19px]"
            >
              {trade.icon}
            </span>
            <div className="mt-3">
              <h3 className="text-[15.5px] font-medium tracking-[-0.01em] text-ink">
                {trade.label}
              </h3>
            </div>
            <p className="mt-1 text-[13.5px] leading-snug text-muted">{trade.blurb}</p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Pick your trade",
    body:
      "Your specialised agent already knows the work and what callers ring about. You're not training it from nothing, you're telling it about your business.",
  },
  {
    n: "02",
    title: "Hand over what you have",
    body:
      "Your website, your price list, the induction notes you give a new hire. Drop them into the chat and it reads all of it at once.",
  },
  {
    n: "03",
    title: "Answer what's missing",
    body:
      "It comes back with the gaps, the things no document covered, and asks about those one at a time. Nothing you've already answered gets asked twice.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="border-y border-line bg-paper/60">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:px-8">
        <Reveal>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:gap-8">
            <ScriptNote color="blue" className="shrink-0">
              How it works
            </ScriptNote>
            <div>
              <h2 className="display max-w-[20ch] text-[28px] sm:text-[36px]">
                <span className="text-ink">Setup is a conversation,</span>{" "}
                <span className="text-muted">not a form.</span>
              </h2>
              <p className="mt-4 max-w-[56ch] text-[15.5px] leading-relaxed text-muted">
                You talk it through once, the way you&apos;d brief someone on their
                first day. No fields to tab between, nothing to fill in twice, and it
                asks about a thing only if your own documents left it out.
              </p>
            </div>
          </div>
        </Reveal>

        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal
              key={step.n}
              as="li"
              delay={i * 120}
              className="rounded-[var(--radius-card)] border border-line bg-paper p-6 shadow-lift"
            >
              <span className="script text-[24px] text-script-green">{step.n}</span>
              <h3 className="mt-2 text-[17px] font-medium tracking-[-0.015em] text-ink">
                {step.title}
              </h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">{step.body}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

const COMPARISON = [
  [
    "Answers at 7pm on a Sunday, in your words.",
    "Takes a message, if they leave one. Most don't.",
  ],
  [
    "Quotes the drain price your own price list states.",
    "Can't quote anything. The caller rings the next number.",
  ],
  [
    "Knows your patch and says no to jobs outside it.",
    "Books nothing and screens nothing.",
  ],
  [
    "Sees your calendar and offers the first slot that's free.",
    "Leaves you to ring back and start the diary from scratch.",
  ],
  [
    "Sends the jobs it shouldn't quote, sewer and repipe, straight to you.",
    "Sends everything to you, tomorrow, out of order.",
  ],
  [
    "Reads a new price list the day you upload it.",
    "Never learns anything.",
  ],
];

function Comparison({ account }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 sm:px-8">
      <Reveal className="text-center">
        <h2 className="display text-[34px] sm:text-[52px]">What the caller gets</h2>
        <p className="mx-auto mt-3 max-w-[52ch] text-[16px] text-muted">
          A missed call is a customer who has already dialled someone else. Here is the
          same Sunday evening, twice.
        </p>
      </Reveal>

      <div className="mx-auto mt-14 grid max-w-4xl gap-8 sm:grid-cols-2">
        <Reveal className="overflow-hidden rounded-[36px] border border-line bg-paper shadow-lift">
          <ColumnHead>{PRODUCT_NAME}</ColumnHead>
          <ul>
            {COMPARISON.map(([ours]) => (
              <Row key={ours} icon={<Tick />}>
                {ours}
              </Row>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={120} className="overflow-hidden rounded-[36px] border border-line bg-paper">
          <ColumnHead>Voicemail</ColumnHead>
          <ul>
            {COMPARISON.map(([, theirs]) => (
              <Row key={theirs} icon={<Cross />}>
                {theirs}
              </Row>
            ))}
          </ul>
        </Reveal>
      </div>

      <Reveal delay={200} className="mt-12 flex justify-center">
        <Link
          href={account ? "/dashboard" : "/signup"}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-6 py-3 text-[14px] font-medium text-ink-soft shadow-lift transition-all duration-200 hover:-translate-y-px hover:shadow-pop"
        >
          Give your callers the first one
          <Chevron />
        </Link>
      </Reveal>
    </section>
  );
}

function ColumnHead({ children }) {
  return (
    <p className="bg-canvas px-6 py-5 text-center text-[19px] font-medium tracking-[-0.015em] text-ink">
      {children}
    </p>
  );
}

function Row({ icon, children }) {
  return (
    <li className="flex items-start gap-3 border-t border-line px-6 py-5 text-[14px] leading-relaxed text-ink-soft">
      <span className="mt-0.5 shrink-0">{icon}</span>
      {children}
    </li>
  );
}

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8.4l3.2 3.2L13 4.8"
        stroke="var(--color-accent)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="var(--color-faint)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* The reference's one-line manifesto, set big with a script aside and a
   highlighter stroke through the word the whole sentence turns on. */
function Manifesto() {
  return (
    <section className="border-y border-line bg-cream">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-32 text-center">
        <Reveal>
          <span className="script -ml-4 block -rotate-2 text-[22px] text-script-red sm:-ml-40">
            Of every call you&apos;ll take this year,
          </span>
          <p className="display mt-3 text-[34px] leading-[1.06] sm:text-[54px]">
            the one that pays for this
            <br />
            is the one you{" "}
            <span className="relative inline-block">
              <span
                aria-hidden="true"
                className="absolute inset-x-[-0.12em] bottom-[0.08em] top-[0.18em] -rotate-1 rounded-[3px] bg-sky/70"
              />
              <span className="relative">didn&apos;t</span>
            </span>{" "}
            hear ring.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

const TRUST = [
  ["Sourced", "Every fact quotes the sentence it came from."],
  ["Never guessed", "Below 0.7 confidence, it asks instead of answering."],
  ["Always human", "Sewer and repipe go to you, whatever a document says."],
];

/* Where the reference puts its compliance badges. Ours are not certifications
   — they're the three rules in lib/synthesis that decide what the agent is
   allowed to say out loud, which is the thing an owner is actually risking. */
function Trust() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 sm:px-8">
      <Reveal className="rounded-[var(--radius-card)] border border-line bg-paper p-8 shadow-lift sm:p-12">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="display text-[26px] sm:text-[32px]">
              <span className="text-muted">Your words.</span>{" "}
              <span className="text-ink">Not the model&apos;s.</span>
            </h2>
            <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted">
              A guessed answer gets repeated to a real caller as though your business had
              promised it. So a fact that isn&apos;t in your documents never becomes one.
              It becomes a question, and you answer it once.
            </p>
          </div>

          <ul className="grid shrink-0 gap-3 sm:grid-cols-3 lg:max-w-[520px]">
            {TRUST.map(([title, body]) => (
              <li
                key={title}
                className="rounded-[var(--radius-inner)] border border-line bg-canvas px-5 py-4"
              >
                <p className="text-[13.5px] font-medium text-ink">{title}</p>
                <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}

const CLOSER_STEPS = [
  ["1", "Sign up and pick your trade", "A minute to sign up, and no card."],
  ["2", "Talk it through once", "Paste your site, drop your documents, answer the gaps."],
  ["3", "Hand out the number", "It's on your dashboard, with everything the agent knows."],
];

function Closer({ account }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 pb-24 sm:px-8">
      <Reveal className="rounded-[36px] bg-[linear-gradient(180deg,#ffffff_0%,#f0f8f1_58%,#dcefdf_100%)] px-6 py-16 text-center sm:px-12">
        <ScriptNote className="mb-2">Ten minutes</ScriptNote>
        <h2 className="display mx-auto max-w-[16ch] text-[34px] sm:text-[52px]">
          Stop losing the ones who don&apos;t leave a message
        </h2>

        <ol className="mx-auto mt-14 grid max-w-4xl gap-8 text-center sm:grid-cols-3">
          {CLOSER_STEPS.map(([n, title, body]) => (
            <li key={n}>
              <span
                aria-hidden="true"
                className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-ink text-[14px] font-medium text-white"
              >
                {n}
              </span>
              <h3 className="mt-3 text-[15.5px] font-medium tracking-[-0.01em] text-ink">
                {title}
              </h3>
              <p className="mx-auto mt-1.5 max-w-[30ch] text-[13.5px] leading-relaxed text-muted">
                {body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-14 flex justify-center">
          <ShimmerButton
            href={account ? "/dashboard" : "/signup"}
            background="#2fa84f"
            shimmerColor="#ffffff"
          >
            {account ? "Go to dashboard" : "Create an account"}
          </ShimmerButton>
        </div>
      </Reveal>
    </section>
  );
}

const FAQ = [
  {
    q: `What exactly does ${PRODUCT_NAME} do?`,
    a:
      "It builds the knowledge a voice agent needs to answer your phone: it reads your website and your documents, asks about whatever they didn't cover, and keeps the result somewhere you can edit it. This is a working prototype, so the number on your dashboard doesn't ring a carrier yet.",
  },
  {
    q: "What do I actually have to hand over?",
    a: `Your website address, and whatever you'd give a new hire on their first day: a price list, a service-area note, the induction sheet. ${ACCEPT_SUMMARY} There's no minimum, and it will tell you what it couldn't find rather than making it up.`,
  },
  {
    q: "What happens when two of my documents disagree?",
    a:
      "You get both values and the sentence each one came from, and you pick. Nothing conflicting is promoted into what the agent will say, because a caller quoted the average of two prices has been quoted a price nobody wrote down.",
  },
  {
    q: "Will it quote prices to customers?",
    a:
      "Only the ones it can quote safely. A bare number from your price list is quotable; a range, an hourly rate or anything hedged is read out as a range and nothing more. Sewer line and repipe always go to a human, whatever a document claims.",
  },
  {
    q: "Do I have to connect my calendar?",
    a:
      "No, but booking is most of the point: an agent that can't see your diary can only take messages. It's the last step of the conversation, it uses Google's own consent screen, and you can skip it and connect later.",
  },
  {
    q: "Can I change what it knows afterwards?",
    a:
      "Yes. Every fact is an editable row on your dashboard, and adding or removing a document re-reads the whole set, so a price list you delete takes its prices with it rather than leaving them behind.",
  },
];

function Questions() {
  return (
    <section className="border-t border-line bg-canvas">
      <div className="mx-auto w-full max-w-5xl px-6 py-24 sm:px-8">
        <Reveal>
          <h2 className="display text-[28px] sm:text-[38px]">
            <span className="text-ink">Questions?</span>{" "}
            <span className="text-muted">We had them too.</span>
          </h2>
          <p className="mt-3 max-w-[60ch] text-[15px] text-muted">
            The things every owner asks in the first five minutes, answered before you
            have to.
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-10">
          <Faq items={FAQ} />
        </Reveal>
      </div>
    </section>
  );
}

function Footer({ account }) {
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto w-full max-w-6xl px-6 pb-10 pt-16 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <PressSpace href={account ? "/dashboard" : "/signup"}>
            {account ? "to open your dashboard" : "to create an account"}
          </PressSpace>

          <nav className="flex gap-12 text-[13.5px] text-muted" aria-label="Footer">
            <div className="flex flex-col gap-2.5">
              <HoverRoll href="/#how">How it works</HoverRoll>
              <HoverRoll href="/#trades">Trades</HoverRoll>
            </div>
            <div className="flex flex-col gap-2.5">
              <HoverRoll href="/signin">Sign in</HoverRoll>
              <HoverRoll href="/signup">Create an account</HoverRoll>
            </div>
          </nav>
        </div>

        <p className="mt-10 text-[12px] text-faint">
          © {new Date().getFullYear()} {PRODUCT_NAME}. A working prototype, not a live
          phone service.
        </p>

        {/* The reference signs off with its wordmark set enormous, bleeding to
            the container edges. Decorative: the name is already in the nav. */}
        <div
          aria-hidden="true"
          className="mt-10 flex select-none items-center gap-4 text-ink sm:gap-6"
        >
          <span className="grid aspect-square w-[13%] min-w-[64px] place-items-center rounded-[22%] bg-ink text-white">
            <Mark className="h-[58%] w-[58%]" />
          </span>
          <span className="display text-[clamp(48px,14.5vw,182px)] leading-none tracking-[-0.055em]">
            {PRODUCT_NAME.toLowerCase()}
          </span>
        </div>
      </div>
    </footer>
  );
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
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
