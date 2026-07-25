"use client";

import NeedField from "../NeedField";
import WebsiteAutofill from "../WebsiteAutofill";
import DocumentUpload from "../DocumentUpload";
import { StepHeading } from "./StepTrade";

/*
  One screen for everything about the business: give us the website, we fill what
  the page states, you correct it in place, and the files and the free-text notes
  sit right underneath. Previously this was two screens that both asked for the
  website.

  Nothing here knows a single field name — it maps `needs` and hands each one to
  NeedField. Adding a need to lib/trades.js makes it appear on this screen.
*/
export default function StepBusiness({
  trade,
  needs,
  answers,
  setAnswer,
  showErrors,
  missingRequired,
  fieldSource,
  suggestions,
  acceptSuggestion,
  scrape,
  readWebsite,
  documents,
  addDocument,
  removeDocument,
}) {
  const missingKeys = new Set(missingRequired.map((row) => row.need.key));

  return (
    <div>
      <StepHeading
        lead="Your business."
        rest="Whatever you skip becomes a question the agent has to dodge on a live call."
      />

      <div className="mt-8">
        <WebsiteAutofill
          scrape={scrape}
          onRead={readWebsite}
          needCount={needs.length}
        />
      </div>

      <div className="mt-8 space-y-7">
        {needs.map((need) => (
          <NeedField
            key={need.key}
            trade={trade}
            need={need}
            value={answers[need.key]}
            onChange={(value) => setAnswer(need.key, value)}
            source={fieldSource[need.key] ?? null}
            suggestion={suggestions[need.key] ?? null}
            onAcceptSuggestion={() => acceptSuggestion(need.key)}
            error={
              showErrors && missingKeys.has(need.key)
                ? `${need.label} is needed before you carry on.`
                : null
            }
          />
        ))}
      </div>

      <div className="mt-9 border-t border-line pt-8">
        <DocumentUpload
          documents={documents}
          addDocument={addDocument}
          removeDocument={removeDocument}
        />
      </div>
    </div>
  );
}
