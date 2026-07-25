"use client";

import { useState } from "react";
import { useOnboarding } from "@/lib/useOnboarding";
import CallSlip from "./CallSlip";
import { Button } from "./ui";
import StepTrade from "./steps/StepTrade";
import StepBusiness from "./steps/StepBusiness";
import StepCalendar from "./steps/StepCalendar";
import StepReview from "./steps/StepReview";

export default function Wizard() {
  const o = useOnboarding();
  const [done, setDone] = useState(false);
  const isLast = o.stepIndex === o.steps.length - 1;

  return (
    <div className="relative min-h-dvh">
      {/* Pastel mesh bleeding off the top edge, as in the reference hero. */}
      <div
        aria-hidden="true"
        className="mesh-top pointer-events-none absolute inset-x-0 top-0 h-[260px] opacity-70"
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
        <Header steps={o.steps} stepIndex={o.stepIndex} goToStep={o.goToStep} />

        <div className="mt-10 grid gap-8 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
          <main className="min-w-0">
            {!o.hydrated ? (
              <Restoring />
            ) : done ? (
              <Done onRestart={() => setDone(false)} />
            ) : (
              <>
                <StepBody o={o} onFinish={() => setDone(true)} />
                {!isLast && <Nav o={o} />}
              </>
            )}
          </main>

          {o.hydrated && o.trade && !done && (
            <CallSlip
              trade={o.trade}
              slip={o.slip}
              filledCount={o.filledCount}
              fromWebsiteCount={o.fromWebsiteCount}
              documents={o.documents}
              calendar={o.calendar}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StepBody({ o, onFinish }) {
  switch (o.step.id) {
    case "trade":
      return <StepTrade trade={o.trade} chooseTrade={o.chooseTrade} />;
    case "business":
      return (
        <StepBusiness
          trade={o.trade}
          needs={o.needs}
          answers={o.answers}
          setAnswer={o.setAnswer}
          showErrors={o.showErrors}
          missingRequired={o.missingRequired}
          fieldSource={o.fieldSource}
          suggestions={o.suggestions}
          acceptSuggestion={o.acceptSuggestion}
          scrape={o.scrape}
          readWebsite={o.readWebsite}
          documents={o.documents}
          addDocument={o.addDocument}
          removeDocument={o.removeDocument}
        />
      );
    case "calendar":
      return <StepCalendar calendar={o.calendar} setCalendar={o.setCalendar} />;
    case "review":
      return (
        <StepReview
          trade={o.trade}
          slip={o.slip}
          answers={o.answers}
          setAnswer={o.setAnswer}
          fieldSource={o.fieldSource}
          suggestions={o.suggestions}
          acceptSuggestion={o.acceptSuggestion}
          documents={o.documents}
          calendar={o.calendar}
          websiteUrl={o.websiteUrl}
          synthesis={o.synthesis}
          runSynthesis={o.runSynthesis}
          goToStep={o.goToStep}
          onFinish={onFinish}
        />
      );
    default:
      return null;
  }
}

function Header({ steps, stepIndex, goToStep }) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink text-[15px] text-white"
        >
          ✂
        </span>
        <span className="text-[15px] font-medium tracking-[-0.015em] text-ink">
          Call Slip
        </span>
      </div>

      {/* Pill tab bar, straight off the reference. */}
      <nav aria-label="Setup steps">
        <ol className="flex flex-wrap items-center gap-1 rounded-full bg-canvas/80 p-1 backdrop-blur-sm">
          {steps.map((step, i) => {
            const active = i === stepIndex;
            const cleared = i < stepIndex;
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={i > stepIndex}
                  aria-current={active ? "step" : undefined}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                    active
                      ? "bg-paper text-ink shadow-lift"
                      : cleared
                        ? "text-ink-soft hover:bg-paper/70"
                        : "cursor-default text-faint"
                  }`}
                >
                  {step.short}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}

function Nav({ o }) {
  return (
    <div className="mt-10 flex items-center justify-between gap-4 border-t border-line pt-6">
      {o.canGoBack ? (
        <Button variant="ghost" onClick={o.back}>
          Back
        </Button>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-4">
        {o.showErrors && o.blockers.length > 0 ? (
          <span role="alert" className="hidden text-[13px] text-flag sm:block">
            {o.blockers.length === 1
              ? o.blockers[0]
              : `${o.blockers.length} things still needed`}
          </span>
        ) : (
          <span className="hidden max-w-[34ch] text-right sm:block">
            <SaveState save={o.save} />
          </span>
        )}
        <Button onClick={o.next} chevron>
          Continue
        </Button>
      </div>
    </div>
  );
}

function Restoring() {
  return (
    <div className="py-6" aria-live="polite">
      <p className="text-[15px] text-muted">Picking up where you left off…</p>
    </div>
  );
}

/*
  A save that fails silently is worse than no save, because the whole promise of
  this phase is that a refresh doesn't cost you anything.
*/
function SaveState({ save }) {
  if (save.status === "error") {
    return (
      <span role="alert" className="text-[12.5px] leading-snug text-flag">
        Not saved — {save.error} A refresh will lose this.
      </span>
    );
  }
  if (save.status === "saving") {
    return <span className="text-[12.5px] text-faint">Saving…</span>;
  }
  if (save.status === "saved") {
    return <span className="text-[12.5px] text-faint">Saved</span>;
  }
  return null;
}

function Done({ onRestart }) {
  return (
    <div className="py-6">
      <h1 className="display max-w-[24ch] text-[32px] sm:text-[42px]">
        That&apos;s the slip written.
      </h1>
      <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-muted">
        Next up is reading your documents back and filling the gaps — that&apos;s
        Phase 3. For now nothing is stored, so a refresh starts you over.
      </p>
      <div className="mt-7">
        <Button variant="secondary" onClick={onRestart}>
          Back to the review
        </Button>
      </div>
    </div>
  );
}
