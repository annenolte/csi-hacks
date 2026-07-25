import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/*
  scrypt from Node's standard library. No dependency, deliberately slow, and
  memory-hard — which is the property that makes a stolen hash expensive to attack
  with GPUs.

  The user asked for auth that isn't Supabase Auth. That's a fine call for a demo,
  but "not real auth" is not a licence to store passwords badly: a leaked database
  of plaintext or fast-hashed passwords hurts people on every *other* site where
  they reused that password, long after this project is forgotten.

  Stored format is `scrypt$N$r$p$salt$hash`, all hex. The parameters are in the
  string rather than in a constant so that raising them later doesn't invalidate
  every existing password — an old hash still verifies against its own parameters.
*/

const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    /* scrypt's default maxmem is too small for N=16384; raise it or it throws. */
    maxmem: 64 * 1024 * 1024,
  });

  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("hex"),
    derived.toString("hex"),
  ].join("$");
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== "string") return false;

  const [scheme, n, r, p, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");

  let derived;
  try {
    derived = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 64 * 1024 * 1024,
    });
  } catch {
    return false;
  }

  /*
    Constant-time compare. A byte-by-byte `===` leaks how much of the hash matched
    through timing, which is enough to reconstruct it one byte at a time.
  */
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
