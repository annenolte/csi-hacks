"use client";

import { useState } from "react";
import Link from "next/link";
import Wordmark from "./Wordmark";
import HoverRoll from "./landing/HoverRoll";
import { ScriptNote, inputClass } from "./ui";
import { PRODUCT_NAME } from "@/lib/brand";

/*
  Both auth screens are the same form with a different field list, so they are one
  component. Splitting them duplicates the error handling, the submit state, and
  the layout — and those are exactly the parts that rot when they exist twice.

  The layout is the landing page's, folded in half: brand on the left — mesh,
  display headline, an aside in the handwritten script — and the form on the
  right. Below `lg` the brand column collapses to just the headline, because on
  a phone the only thing worth the vertical space is the fields.
*/

const SIGNUP_FIELDS = [
  {
    name: "firstName",
    label: "First name",
    autoComplete: "given-name",
    half: true,
  },
  {
    name: "lastName",
    label: "Last name",
    autoComplete: "family-name",
    half: true,
  },
  { name: "company", label: "Company name", autoComplete: "organization" },
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  {
    name: "password",
    label: "Password",
    type: "password",
    autoComplete: "new-password",
    hint: "At least 8 characters.",
  },
];

const SIGNIN_FIELDS = [
  { name: "email", label: "Email", type: "email", autoComplete: "email" },
  {
    name: "password",
    label: "Password",
    type: "password",
    autoComplete: "current-password",
  },
];

/* What the left column promises. Three lines for signup, because that is the
   side that has to be worth five fields; one for sign-in, which needs none. */
const SIGNUP_POINTS = [
  [
    "It reads first",
    "Your website and your documents, before it asks you anything.",
  ],
  ["It asks second", "Only about the gaps — and only once."],
  [
    "You get a number",
    "On your dashboard, with everything the agent knows beside it.",
  ],
];

export default function AuthForm({ mode }) {
  const signup = mode === "signup";
  const fields = signup ? SIGNUP_FIELDS : SIGNIN_FIELDS;

  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);

    try {
      const response = await fetch(
        `/api/auth/${signup ? "signup" : "signin"}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(values),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data.errors) setErrors(data.errors);
        if (data.error) setFormError(data.error);
        if (!data.errors && !data.error)
          setFormError("Something went wrong. Try again.");
        return;
      }

      /*
        A full navigation rather than router.push: the session cookie was just set
        on this response, and a client-side transition can render the next page
        from a cache that predates it.
      */
      window.location.href = data.next ?? "/dashboard";
    } catch {
      setFormError(
        "Couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-dvh">
      <div
        aria-hidden="true"
        className="mesh-top pointer-events-none absolute inset-x-0 top-0 h-[340px]"
      />

      <div className="relative mx-auto w-full max-w-6xl px-6 py-7 sm:px-8">
        <Wordmark href="/" />

        {/*
          Three cells, placed rather than stacked. On a phone the order is
          headline, form, then the pitch — the fields have to be reachable
          without scrolling past the sales copy, and someone who came here to
          sign in should never see it at all. From `lg` the headline and the
          pitch sit in the left column and the form spans both rows on the
          right, which is the same reading order a wide screen wants anyway.
        */}
        <div className="mt-12 grid items-start gap-10 pb-20 lg:mt-14 lg:grid-cols-[1fr_440px] lg:gap-x-20 lg:gap-y-10">
          <BrandHeading signup={signup} />

          <div className="w-full lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="rounded-[var(--radius-card)] border border-line bg-paper p-7 shadow-lift sm:p-8">
              <h2 className="text-[17px] font-medium tracking-[-0.015em] text-ink">
                {signup ? "Create your account" : "Sign in"}
              </h2>

              <form onSubmit={submit} noValidate className="mt-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {fields.map((field) => (
                    <div
                      key={field.name}
                      className={field.half ? "col-span-1" : "col-span-2"}
                    >
                      <label
                        htmlFor={field.name}
                        className="block text-[14px] font-medium text-ink"
                      >
                        {field.label}
                      </label>
                      <input
                        id={field.name}
                        name={field.name}
                        type={field.type ?? "text"}
                        autoComplete={field.autoComplete}
                        value={values[field.name] ?? ""}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            [field.name]: e.target.value,
                          }))
                        }
                        aria-invalid={errors[field.name] ? "true" : undefined}
                        aria-describedby={
                          errors[field.name] ? `${field.name}-error` : undefined
                        }
                        className={`${inputClass} mt-1.5 py-2.5`}
                      />
                      {errors[field.name] ? (
                        <p
                          id={`${field.name}-error`}
                          role="alert"
                          className="mt-1.5 text-[12.5px] text-flag"
                        >
                          {errors[field.name]}
                        </p>
                      ) : (
                        field.hint && (
                          <p className="mt-1.5 text-[12.5px] text-faint">
                            {field.hint}
                          </p>
                        )
                      )}
                    </div>
                  ))}
                </div>

                {formError && (
                  <p
                    role="alert"
                    className="text-[13px] leading-snug text-flag"
                  >
                    {formError}
                  </p>
                )}

                {/*
                  The landing page's shimmer, as a submit button rather than a
                  link — same three layers, same geometry, so the thing you press
                  to start is the thing you pressed to get here.
                */}
                <button
                  type="submit"
                  disabled={busy}
                  style={{
                    "--spread": "90deg",
                    "--shimmer-color": "#ffffff",
                    "--bg": "var(--color-ink)",
                    "--cut": "1.5px",
                  }}
                  className="group relative inline-flex w-full items-center justify-center overflow-hidden rounded-full px-8 py-3.5 text-[15px] font-medium text-white transition-transform duration-300 [background:var(--bg)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 z-0 overflow-hidden rounded-full"
                  >
                    <span className="shimmer-spark" />
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute z-[1] rounded-full [background:var(--bg)] [inset:var(--cut)]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 z-[2] rounded-full shadow-[inset_0_-8px_10px_rgba(255,255,255,0.12)] transition-shadow duration-300 group-hover:shadow-[inset_0_-6px_10px_rgba(255,255,255,0.28)]"
                  />
                  <span className="relative z-[3]">
                    {busy
                      ? signup
                        ? "Creating…"
                        : "Signing in…"
                      : signup
                        ? "Create account"
                        : "Sign in"}
                  </span>
                </button>
              </form>
            </div>

            <p className="mt-6 text-center text-[14px] text-muted">
              {signup ? "Already have an account? " : "No account yet? "}
              <span className="text-ink">
                <HoverRoll href={signup ? "/signin" : "/signup"}>
                  {signup ? "Sign in" : "Create one"}
                </HoverRoll>
              </span>
            </p>
          </div>

          <BrandDetail signup={signup} />
        </div>
      </div>
    </div>
  );
}

function BrandHeading({ signup }) {
  return (
    <div className="max-w-[30rem] lg:col-start-1 lg:row-start-1 lg:pt-2">
      <h1 className="display text-[38px] font-normal leading-[1] tracking-[-0.045em] sm:text-[48px]">
        {signup ? (
          <>
            <span className="block text-ink">Ten minutes now.</span>
            <span className="block text-muted">Every call after.</span>
          </>
        ) : (
          <>
            <span className="block text-ink">Welcome back.</span>
            <span className="block text-muted">It kept reading.</span>
          </>
        )}
      </h1>
    </div>
  );
}

function BrandDetail({ signup }) {
  return (
    <div className="max-w-[30rem] lg:col-start-1 lg:row-start-2">
      {signup ? (
        <>
          <p className="max-w-[38ch] text-[15.5px] leading-relaxed text-muted">
            You give {PRODUCT_NAME}{" "}
            the website and the documents you already have. It does the reading, and
            comes back with only what it couldn&apos;t find.
          </p>

          <ScriptNote className="mt-7 block">No card, no contract</ScriptNote>

          <ol className="mt-8 space-y-5 border-t border-line pt-8">
            {SIGNUP_POINTS.map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-[12.5px] font-medium text-white"
                >
                  {i + 1}
                </span>
                <div>
                  <p className="text-[14.5px] font-medium tracking-[-0.01em] text-ink">
                    {title}
                  </p>
                  <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="max-w-[42ch] text-[15.5px] leading-relaxed text-muted">
          Everything {PRODUCT_NAME}{" "}
          read for you is still there — the number, the calendar, and every fact with
          the sentence it came from.
        </p>
      )}

      <p className="mt-10 text-[13px] text-faint">
        <Link href="/" className="hover-roll">
          <span data-hover="← Back to the site">← Back to the site</span>
        </Link>
      </p>
    </div>
  );
}
