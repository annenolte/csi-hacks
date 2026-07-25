"use client";

import { useRef, useState } from "react";
import { Button } from "./ui";

/*
  Files only. The website address is asked for once, by WebsiteAutofill — it used
  to be asked for again here, which is what made the wizard feel like it had
  forgotten what you'd already told it.

  Phase 1 reads the text in the browser and holds it in memory. The shape stored
  here is what Phase 2 posts, so it matches the `documents` table.
*/

const ACCEPTED = [".txt", ".md"];

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export default function DocumentUpload({ documents, addDocument, removeDocument }) {
  const [rejected, setRejected] = useState([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

  const ingest = async (fileList) => {
    const files = Array.from(fileList);
    const bad = files.filter((f) => !ACCEPTED.includes(extensionOf(f.name)));
    setRejected(bad.map((f) => f.name));

    for (const file of files) {
      if (bad.includes(file)) continue;
      const text = await file.text();
      addDocument({
        id: crypto.randomUUID(),
        kind: "file",
        name: file.name,
        source: file.name,
        text,
        chars: text.length,
      });
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <section>
      <h2 className="text-[15.5px] font-medium tracking-[-0.01em] text-ink">
        Anything else you&apos;ve already written
      </h2>
      <p className="mt-1 max-w-[58ch] text-[13.5px] leading-relaxed text-muted">
        A price list, the FAQ you typed once and never touched again. Optional —
        it just gives the agent more to answer from.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          ingest(e.dataTransfer.files);
        }}
        className={`mt-3.5 rounded-[var(--radius-card)] border-2 border-dashed p-6 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-paper"
        }`}
      >
        <p className="text-[14.5px] font-medium text-ink">Drop files here, or</p>
        <div className="mt-2.5">
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInput.current?.click()}
          >
            Choose files
          </Button>
        </div>
        <p className="mt-2.5 text-[13px] text-muted">
          Plain text and Markdown only, for now — {ACCEPTED.join(" and ")}
        </p>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPTED.join(",")}
          className="sr-only"
          onChange={(e) => ingest(e.target.files)}
        />
      </div>

      {rejected.length > 0 && (
        <p role="alert" className="mt-3 text-[13.5px] leading-snug text-flag">
          Couldn&apos;t take {rejected.join(", ")}. We only read{" "}
          {ACCEPTED.join(" and ")} right now — paste the text into a .txt file and
          try again.
        </p>
      )}

      {documents.length > 0 && (
        <ul className="mt-3 space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-3 rounded-[var(--radius-inner)] border border-line bg-paper px-4 py-3"
            >
              <span
                aria-hidden="true"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-canvas text-[14px]"
              >
                📄
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ink">
                  {doc.name}
                </span>
                <span className="block text-[12.5px] text-muted">
                  {doc.chars.toLocaleString()} characters
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeDocument(doc.id)}
                className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
