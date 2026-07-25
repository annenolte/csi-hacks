"use client";

import { formatNeedValue } from "@/lib/format";
import NeedField from "../NeedField";
import SynthesisPanel from "../SynthesisPanel";
import { Button, ScriptNote } from "../ui";
import { StepHeading } from "./StepTrade";

/*
  Reads entirely off `slip`. The "still missing" list is the gap interview, and it
  renders NeedField — the same component the form uses — because both are driven
  by the same `needs` array. It asks with each need's `question` rather than its
  `label`, which is the wording written for being asked out loud.
*/
export default function StepReview({
  trade,
  slip,
  answers,
  setAnswer,
  fieldSource,
  suggestions,
  acceptSuggestion,
  documents,
  calendar,
  websiteUrl,
  synthesis,
  runSynthesis,
  goToStep,
  onFinish,
}) {
  const known = slip.filter((row) => row.filled);
  const gaps = slip.filter((row) => !row.filled);

  return (
    <div>
      <StepHeading
        lead="Here's what it knows."
        rest="Read it the way a caller would hear it."
      />

      <div className="mt-3">
        <ScriptNote>Check the prices</ScriptNote>
      </div>

      <div className="mt-8">
        <SynthesisPanel
          synthesis={synthesis}
          documents={documents}
          onRun={runSynthesis}
        />
      </div>

      <section className="mt-8">
        <SectionLabel>
          Confirmed — {known.length} of {slip.length}
        </SectionLabel>
        <dl className="mt-2.5 divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-paper">
          {known.map(({ need, value }) => (
            <div
              key={need.key}
              className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-5"
            >
              <dt className="shrink-0 text-[13px] text-muted sm:w-[38%]">
                {need.label}
              </dt>
              <dd className="min-w-0 flex-1 break-words text-[14.5px] leading-snug text-ink">
                {formatNeedValue(trade, need, value)}
              </dd>
            </div>
          ))}
          {known.length === 0 && (
            <p className="px-5 py-4 text-[14px] text-faint">Nothing yet.</p>
          )}
        </dl>
        <button
          type="button"
          onClick={() => goToStep(1)}
          className="mt-2.5 text-[13.5px] font-medium text-accent hover:underline"
        >
          Change something
        </button>
      </section>

      {/*
        The gap interview. Same fields as the form, asked as questions, so the
        owner can close the gaps without going back and hunting for them.
      */}
      {gaps.length > 0 && (
        <section className="mt-9">
          <SectionLabel>Still missing — {gaps.length}</SectionLabel>
          <p className="mt-1.5 max-w-[58ch] text-[13.5px] leading-relaxed text-muted">
            Neither you nor your documents have said. A blank is safer than a guess —
            the agent says it doesn&apos;t know and takes a message, rather than
            inventing an answer you then have to honour. Answer any of them here.
          </p>

          <div className="mt-5 space-y-7 rounded-[var(--radius-card)] border border-line bg-cream p-5">
            {gaps.map(({ need }) => (
              <div key={need.key}>
                <p className="mb-2 text-[14.5px] leading-snug text-ink">
                  {need.question}
                  {need.required && (
                    <span className="ml-2 text-[12.5px] text-flag">
                      needed before it can take calls
                    </span>
                  )}
                </p>
                <NeedField
                  trade={trade}
                  need={need}
                  value={answers[need.key]}
                  onChange={(value) => setAnswer(need.key, value)}
                  source={fieldSource[need.key] ?? null}
                  suggestion={suggestions[need.key] ?? null}
                  onAcceptSuggestion={() => acceptSuggestion(need.key)}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <SectionLabel>Reading from</SectionLabel>
        <div className="mt-2.5 rounded-[var(--radius-card)] border border-line bg-paper px-5 py-4">
          {websiteUrl || documents.length > 0 ? (
            <ul className="space-y-1.5">
              {websiteUrl && (
                <li className="break-all text-[14px] text-ink">
                  {websiteUrl}
                  <span className="ml-2 text-[12.5px] text-muted">website</span>
                </li>
              )}
              {documents.map((doc) => (
                <li key={doc.id} className="text-[14px] text-ink">
                  {doc.name}
                  <span className="ml-2 text-[12.5px] text-muted">file</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-faint">
              Nothing read — everything above came from you directly.
            </p>
          )}
          <p className="mt-3 border-t border-line pt-3 text-[13.5px] text-muted">
            Calendar:{" "}
            <span className="text-ink">
              {calendar.connected ? calendar.provider : "not connected"}
            </span>
          </p>
        </div>
      </section>

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <Button onClick={onFinish} chevron>
          Looks right
        </Button>
        <span className="text-[13px] text-muted">
          Saved as you go — the agent endpoints come next.
        </span>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <h2 className="text-[12px] font-medium uppercase tracking-[0.07em] text-faint">
      {children}
    </h2>
  );
}
