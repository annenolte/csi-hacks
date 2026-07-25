/*
  Emptiness is per-type, so anything that checks a need off — the call slip, the
  review screen, the gap calculation — can do it without knowing field names.

  Its own module because both the client hook and the server-side synthesis need
  it, and importing it from useOnboarding would pull React into a server bundle.
*/
export function isAnswered(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") {
    return Object.values(value).some((v) => isAnswered(v));
  }
  return true;
}
