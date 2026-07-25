"use client";

import { useState } from "react";
import { Button, ScriptNote, inputClass } from "./ui";

/*
  Sits at the top of the basics step. Reading a page fills every field the person
  hasn't typed themselves — see the precedence note in lib/useOnboarding.js.
*/
export default function WebsiteAutofill({ scrape, onRead, needCount }) {
  const [url, setUrl] = useState("");
  const busy = scrape.status === "loading";

  const submit = () => {
    const trimmed = url.trim();
    if (trimmed && !busy) onRead(trimmed);
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-cream p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em] text-ink">
          Save yourself the typing
        </h2>
        <ScriptNote color="blue" className="hidden sm:inline-flex">
          Start here
        </ScriptNote>
      </div>
      <p className="mt-1 max-w-[58ch] text-[13.5px] leading-relaxed text-muted">
        Paste your website and we&apos;ll read it, then fill in whatever it says.
        You can change anything we get wrong — and anything you&apos;ve already
        typed stays yours.
      </p>

      <div className="mt-3.5 flex flex-col gap-2 sm:flex-row">
        <input
          className={inputClass}
          placeholder="noltesons.com"
          value={url}
          disabled={busy}
          aria-label="Your website address"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button onClick={submit} disabled={busy || !url.trim()} className="sm:shrink-0">
          {busy ? "Reading…" : "Read my site"}
        </Button>
      </div>

      <Status scrape={scrape} needCount={needCount} />
    </section>
  );
}

function Status({ scrape, needCount }) {
  if (scrape.status === "loading") {
    return (
      <p className="mt-2.5 text-[13px] text-muted" aria-live="polite">
        Fetching {scrape.url}…
      </p>
    );
  }

  if (scrape.status === "error") {
    return (
      <p role="alert" className="mt-2.5 text-[13px] leading-snug text-flag">
        {scrape.error} You can fill the form in by hand instead.
      </p>
    );
  }

  if (scrape.status === "done") {
    const { filled = 0, kept = 0 } = scrape;
    return (
      <p className="mt-2.5 text-[13px] leading-snug text-muted" aria-live="polite">
        {filled === 0 && kept === 0 ? (
          <>
            We read that page but it didn&apos;t state any of these directly, so
            nothing was filled in. That&apos;s a real answer — better than a guess.
          </>
        ) : (
          <>
            Filled {filled} of {needCount} from that page. Check each one — a
            website is often out of date before its owner is.
            {kept > 0 && (
              <>
                {" "}
                Left {kept} alone because you&apos;d already answered
                {kept === 1 ? " it" : " them"}.
              </>
            )}
          </>
        )}
      </p>
    );
  }

  return null;
}
