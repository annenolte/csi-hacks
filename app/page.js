import Link from "next/link";
import { ScriptNote } from "@/components/ui";

/* Entry point. Deliberately thin — Phase 1 is the wizard, not marketing. */
export default function Home() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div
        aria-hidden="true"
        className="mesh-top pointer-events-none absolute inset-x-0 top-0 h-[340px] opacity-80"
      />

      <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p className="flex items-center gap-2 text-[14px] text-muted">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-flag"
          />
          For trades who keep missing the phone
        </p>

        <h1 className="display mt-7 text-[42px] sm:text-[62px]">
          Your phone, answered
          <br />
          by something that
          <br />
          actually knows the job
        </h1>

        <p className="mt-7 max-w-[46ch] text-[16.5px] leading-relaxed text-muted">
          Hand over the price list and the website you already have. We read them,
          ask about what&apos;s missing, and hand your agent a brief it can answer
          calls from.
        </p>

        <div className="mt-12 flex flex-col items-center gap-2">
          <ScriptNote className="self-start sm:-ml-16">
            Takes about five minutes
          </ScriptNote>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[15px] font-medium text-white shadow-lift transition-all hover:-translate-y-px hover:shadow-pop"
          >
            Start setup
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M5 3l4 4-4 4"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </main>
    </div>
  );
}
