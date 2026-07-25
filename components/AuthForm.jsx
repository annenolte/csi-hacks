"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PRODUCT_NAME } from "@/lib/brand";
import { Button, inputClass } from "./ui";

/*
  Both auth screens are the same form with a different field list, so they are one
  component. Splitting them duplicates the error handling, the submit state, and
  the layout — and those are exactly the parts that rot when they exist twice.
*/

const SIGNUP_FIELDS = [
  { name: "firstName", label: "First name", autoComplete: "given-name", half: true },
  { name: "lastName", label: "Last name", autoComplete: "family-name", half: true },
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
  { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
];

export default function AuthForm({ mode }) {
  const signup = mode === "signup";
  const fields = signup ? SIGNUP_FIELDS : SIGNIN_FIELDS;

  const router = useRouter();
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
      const response = await fetch(`/api/auth/${signup ? "signup" : "signin"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data.errors) setErrors(data.errors);
        if (data.error) setFormError(data.error);
        if (!data.errors && !data.error) setFormError("Something went wrong. Try again.");
        return;
      }

      /*
        A full navigation rather than router.push: the session cookie was just set
        on this response, and a client-side transition can render the next page
        from a cache that predates it.
      */
      window.location.href = data.next ?? "/dashboard";
    } catch {
      setFormError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div
        aria-hidden="true"
        className="mesh-top pointer-events-none absolute inset-x-0 top-0 h-[300px] opacity-70"
      />

      <div className="relative mx-auto w-full max-w-[440px] px-6 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 text-[15px] font-medium tracking-[-0.015em] text-ink"
        >
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink text-[15px] text-white"
          >
            ✂
          </span>
          {PRODUCT_NAME}
        </Link>

        <div className="mt-12 rounded-[var(--radius-card)] border border-line bg-paper p-7 shadow-lift sm:p-8">
          <h1 className="display text-[30px]">
            {signup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted">
            {signup
              ? "Four details, then you'll talk to the agent that answers your phone."
              : "Sign in to pick up where you left off."}
          </p>

          <form onSubmit={submit} noValidate className="mt-7 space-y-4">
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
                      setValues((v) => ({ ...v, [field.name]: e.target.value }))
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
                      <p className="mt-1.5 text-[12.5px] text-faint">{field.hint}</p>
                    )
                  )}
                </div>
              ))}
            </div>

            {formError && (
              <p role="alert" className="text-[13px] leading-snug text-flag">
                {formError}
              </p>
            )}

            <Button type="submit" disabled={busy} className="w-full">
              {busy
                ? signup
                  ? "Creating…"
                  : "Signing in…"
                : signup
                  ? "Create account"
                  : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-[14px] text-muted">
          {signup ? "Already have an account? " : "No account yet? "}
          <Link
            href={signup ? "/signin" : "/signup"}
            className="font-medium text-accent hover:underline"
          >
            {signup ? "Sign in" : "Create one"}
          </Link>
        </p>
      </div>
    </div>
  );
}
