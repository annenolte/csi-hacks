"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTrade } from "./trades";
import { isAnswered } from "./answered";

export { isAnswered };

/*
  Phase 2: the wizard saves after each step, so a refresh doesn't lose everything.

  Precedence between the website and the person filling in the form:
    - A scrape fills every field the person hasn't typed in themselves.
    - Once they edit a field it is theirs; a later scrape offers its value but
      never overwrites. They can take the website's version explicitly.
  `fieldSource` is what records that: "website" or "manual", per field, and it is
  persisted so the distinction survives a reload.
*/

export const STEPS = [
  { id: "trade", label: "Your trade", short: "Trade" },
  { id: "business", label: "Your business", short: "Business" },
  { id: "calendar", label: "Your calendar", short: "Calendar" },
  { id: "review", label: "Review", short: "Review" },
];

const EMPTY = {};
const EMPTY_CALENDAR = { provider: null, connected: false };

export function useOnboarding() {
  const [stepIndex, setStepIndex] = useState(0);
  const [tradeId, setTradeId] = useState(null);
  const [answers, setAnswers] = useState(EMPTY);
  const [fieldSource, setFieldSource] = useState(EMPTY);
  const [suggestions, setSuggestions] = useState(EMPTY);
  const [documents, setDocuments] = useState([]);
  const [calendar, setCalendar] = useState(EMPTY_CALENDAR);
  const [websiteUrl, setWebsiteUrl] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [scrape, setScrape] = useState({ status: "idle", url: null, error: null });
  const [synthesis, setSynthesis] = useState({ status: "idle", error: null });
  const [hydrated, setHydrated] = useState(false);
  const [save, setSave] = useState({ status: "idle", error: null });

  /*
    Which fields the person has typed themselves. A ref, not state, because a
    fetch takes seconds and anything they type while one is in flight has to count
    — reading this out of a closure would miss it and overwrite their input.
  */
  const manualKeys = useRef(new Set());

  /*
    Latest values for the save payload, so persisting never needs stale closures.
    Synced in an effect rather than during render — a render-phase write is unsafe
    under concurrent rendering. Anything that changes state and saves in the same
    handler passes the new values through `persist`'s overrides instead of relying
    on this, since the effect hasn't run yet at that point.
  */
  const stateRef = useRef({});
  useEffect(() => {
    stateRef.current = { tradeId, answers, fieldSource, suggestions, calendar, websiteUrl };
  });

  const hydratedRef = useRef(false);

  const applyServerState = useCallback((state) => {
    setTradeId(state.tradeId ?? null);
    setAnswers(state.answers ?? EMPTY);
    setFieldSource(state.fieldSource ?? EMPTY);
    setSuggestions(state.suggestions ?? EMPTY);
    setDocuments(state.documents ?? []);
    setCalendar(state.calendar ?? EMPTY_CALENDAR);
    setWebsiteUrl(state.websiteUrl ?? null);

    manualKeys.current = new Set(
      Object.entries(state.fieldSource ?? {})
        .filter(([, source]) => source === "manual")
        .map(([key]) => key),
    );
  }, []);

  /* Restore whatever was saved before touching anything. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/onboarding");
        if (!res.ok) throw new Error("load failed");
        const state = await res.json();
        if (!cancelled) applyServerState(state);
      } catch {
        /* Start empty rather than block — an unsaved wizard still works. */
        if (!cancelled) setSave({ status: "error", error: "Working without saving." });
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyServerState]);

  /** Posts the current state. Never runs before the initial load has finished. */
  const persist = useCallback(async (overrides = {}) => {
    if (!hydratedRef.current) return;

    setSave({ status: "saving", error: null });
    try {
      const res = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...stateRef.current, ...overrides }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Couldn't save.");
      setSave({ status: "saved", error: null });
    } catch (err) {
      setSave({ status: "error", error: err.message });
    }
  }, []);

  /*
    Typing is also saved, shortly after it stops. Step transitions cover the main
    flow, but the review screen's gap interview is the last step and has no
    Continue button — without this, answering a gap and refreshing would lose it.
  */
  const dirty = useRef(false);
  useEffect(() => {
    if (!hydrated || !dirty.current) return;
    const timer = setTimeout(() => {
      dirty.current = false;
      persist();
    }, 800);
    return () => clearTimeout(timer);
  }, [answers, fieldSource, hydrated, persist]);

  /* Anything typed by hand is marked manual and is never overwritten by a scrape. */
  const setAnswer = useCallback((key, value) => {
    dirty.current = true;
    manualKeys.current.add(key);
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setFieldSource((prev) => ({ ...prev, [key]: "manual" }));
  }, []);

  const chooseTrade = useCallback(
    (id) => {
      if (tradeId === id) return;

      const switching = Boolean(tradeId);
      if (switching) {
        /* Different trade means a different needs list, so nothing maps across. */
        manualKeys.current = new Set();
        setAnswers(EMPTY);
        setFieldSource(EMPTY);
        setSuggestions(EMPTY);
        setScrape({ status: "idle", url: null, error: null });
        setWebsiteUrl(null);
        setShowErrors(false);
      }
      setTradeId(id);

      persist({
        tradeId: id,
        ...(switching
          ? { answers: {}, fieldSource: {}, suggestions: {}, websiteUrl: null, clearFields: true }
          : {}),
      });
    },
    [tradeId, persist],
  );

  /** Take one suggestion the user had previously overridden. */
  const acceptSuggestion = useCallback(
    (key) => {
      const suggestion = suggestions[key];
      if (!suggestion) return;
      manualKeys.current.delete(key);
      setAnswers((prev) => ({ ...prev, [key]: suggestion.value }));
      setFieldSource((prev) => ({ ...prev, [key]: "website" }));
    },
    [suggestions],
  );

  const readWebsite = useCallback(
    async (url) => {
      const trade = stateRef.current.tradeId;
      if (!trade) return;
      setScrape({ status: "loading", url, error: null });

      let payload;
      try {
        const res = await fetch("/api/scrape", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url, tradeId: trade }),
        });
        payload = await res.json();
        if (!res.ok) throw new Error(payload?.error ?? "We couldn't read that page.");
      } catch (err) {
        setScrape({ status: "error", url, error: err.message });
        return;
      }

      const fields = payload.fields ?? {};
      const applicable = Object.entries(fields).filter(
        ([key]) => !manualKeys.current.has(key),
      );

      const nextSuggestions = { ...stateRef.current.suggestions, ...fields };
      const nextFieldSource = { ...stateRef.current.fieldSource };
      const nextAnswers = { ...stateRef.current.answers };
      for (const [key, field] of applicable) {
        nextFieldSource[key] = "website";
        nextAnswers[key] = field.value;
      }

      setSuggestions(nextSuggestions);
      setFieldSource(nextFieldSource);
      setAnswers(nextAnswers);
      setWebsiteUrl(payload.url ?? url);

      setScrape({
        status: "done",
        url: payload.url ?? url,
        error: null,
        extractor: payload.extractor,
        filled: applicable.length,
        kept: Object.keys(fields).length - applicable.length,
      });

      /* A scrape can fill most of the form — worth saving without waiting for Next. */
      persist({
        answers: nextAnswers,
        fieldSource: nextFieldSource,
        suggestions: nextSuggestions,
        websiteUrl: payload.url ?? url,
      });
    },
    [persist],
  );

  /* Documents are discrete actions, so they save immediately. */
  const addDocument = useCallback(async (doc) => {
    setDocuments((prev) => [...prev, doc]);
    try {
      const res = await fetch("/api/onboarding/documents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(doc),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Couldn't save that file.");
      const state = await res.json();
      setDocuments(state.documents ?? []);
      setSave({ status: "saved", error: null });
    } catch (err) {
      setSave({ status: "error", error: err.message });
    }
  }, []);

  const removeDocument = useCallback(async (id) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    try {
      const res = await fetch(`/api/onboarding/documents?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Couldn't remove that file.");
      const state = await res.json();
      setDocuments(state.documents ?? []);
    } catch (err) {
      setSave({ status: "error", error: err.message });
    }
  }, []);

  const updateCalendar = useCallback(
    (next) => {
      setCalendar(next);
      persist({ calendar: next });
    },
    [persist],
  );

  /*
    Phase 3: read every uploaded document in one pass. Slow (two model calls over
    the whole corpus), so it is explicitly triggered rather than automatic.
  */
  const runSynthesis = useCallback(async () => {
    setSynthesis((prev) => ({ ...prev, status: "running", error: null }));
    try {
      const res = await fetch("/api/synthesis", { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error ?? "Couldn't read your documents.");
      setSynthesis({ status: "done", error: null, ...payload });
    } catch (err) {
      setSynthesis((prev) => ({ ...prev, status: "error", error: err.message }));
    }
  }, []);

  const trade = useMemo(() => (tradeId ? getTrade(tradeId) : null), [tradeId]);
  const needs = useMemo(() => trade?.needs ?? [], [trade]);
  const step = STEPS[stepIndex];

  /* Derived once, read by the call slip, the review screen and the nav guard. */
  const slip = useMemo(
    () =>
      needs.map((need) => ({
        need,
        value: answers[need.key],
        filled: isAnswered(answers[need.key]),
        source: fieldSource[need.key] ?? null,
        suggestion: suggestions[need.key] ?? null,
      })),
    [needs, answers, fieldSource, suggestions],
  );

  const missingRequired = useMemo(
    () => slip.filter((row) => row.need.required && !row.filled),
    [slip],
  );

  const filledCount = slip.filter((row) => row.filled).length;
  const fromWebsiteCount = slip.filter((row) => row.filled && row.source === "website").length;

  const blockers = useMemo(() => {
    if (step.id === "trade") return trade ? [] : ["Pick a trade to carry on."];
    if (step.id === "business") return missingRequired.map((row) => row.need.label);
    return [];
  }, [step.id, trade, missingRequired]);

  const canGoNext = stepIndex < STEPS.length - 1 && blockers.length === 0;
  const canGoBack = stepIndex > 0;

  const next = useCallback(() => {
    if (blockers.length > 0) {
      setShowErrors(true);
      return false;
    }
    setShowErrors(false);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    persist();
    return true;
  }, [blockers.length, persist]);

  const back = useCallback(() => {
    setShowErrors(false);
    setStepIndex((i) => Math.max(i - 1, 0));
    persist();
  }, [persist]);

  const goToStep = useCallback(
    (index) => {
      if (index <= stepIndex) {
        setShowErrors(false);
        setStepIndex(index);
        persist();
      }
    },
    [stepIndex, persist],
  );

  return {
    hydrated,
    save,
    step,
    stepIndex,
    steps: STEPS,
    trade,
    chooseTrade,
    needs,
    answers,
    setAnswer,
    fieldSource,
    suggestions,
    acceptSuggestion,
    scrape,
    websiteUrl,
    readWebsite,
    synthesis,
    runSynthesis,
    documents,
    addDocument,
    removeDocument,
    calendar,
    setCalendar: updateCalendar,
    slip,
    filledCount,
    fromWebsiteCount,
    missingRequired,
    blockers,
    showErrors,
    next,
    back,
    goToStep,
    canGoNext,
    canGoBack,
  };
}
