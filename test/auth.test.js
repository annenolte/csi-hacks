import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { validateSignup } from "@/lib/auth/accounts";

/*
  Password hashing is a security control, not a utility. These tests exist so that
  a refactor which quietly turns it into something fast and reversible fails here
  rather than in a breach notification.
*/
describe("password hashing", () => {
  it("verifies a password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("Correct horse battery staple", hash)).toBe(false);
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("never stores the password itself", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash).not.toContain("hunter2");
    expect(hash.startsWith("scrypt$")).toBe(true);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    /* Both still verify — the salt is stored alongside, not lost. */
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("carries its own parameters, so raising them later doesn't lock anyone out", async () => {
    const hash = await hashPassword("whatever");
    const [scheme, n, r, p] = hash.split("$");
    expect(scheme).toBe("scrypt");
    expect(Number(n)).toBeGreaterThanOrEqual(16384);
    expect(Number(r)).toBeGreaterThan(0);
    expect(Number(p)).toBeGreaterThan(0);
  });

  it("returns false rather than throwing on a malformed stored value", async () => {
    for (const bad of ["", "not-a-hash", "scrypt$$$$", null, undefined, "bcrypt$1$2$3$a$b"]) {
      expect(await verifyPassword("x", bad)).toBe(false);
    }
  });
});

describe("validateSignup", () => {
  const good = {
    firstName: "Anne",
    lastName: "Nolte",
    company: "Nolte & Sons Plumbing",
    email: "anne@example.com",
    password: "at least eight",
  };

  it("accepts a complete signup", () => {
    expect(validateSignup(good).ok).toBe(true);
  });

  it("requires every field", () => {
    for (const key of ["firstName", "lastName", "company", "email", "password"]) {
      const result = validateSignup({ ...good, [key]: "" });
      expect(result.ok).toBe(false);
      expect(result.errors[key]).toBeTruthy();
    }
  });

  it("rejects a password shorter than eight characters", () => {
    expect(validateSignup({ ...good, password: "short" }).ok).toBe(false);
    expect(validateSignup({ ...good, password: "exactly8" }).ok).toBe(true);
  });

  /*
    Deliberately permissive. Over-strict email validation rejects real addresses,
    and the only thing that proves an address works is sending mail to it.
  */
  it("accepts real-world addresses a stricter regex would reject", () => {
    for (const email of [
      "anne+plumbing@example.co.uk",
      "a@b.io",
      "first.last@sub.domain.example",
      "anne@example.plumbing",
    ]) {
      expect(validateSignup({ ...good, email }).ok).toBe(true);
    }
  });

  it("still rejects things that clearly aren't addresses", () => {
    for (const email of ["anne", "anne@", "@example.com", "anne example.com", "a@b"]) {
      expect(validateSignup({ ...good, email }).ok).toBe(false);
    }
  });
});
