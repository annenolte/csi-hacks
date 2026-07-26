/*
  Where the Google callback is allowed to send someone afterwards.

  A closed list, not a validated URL. The page that starts the flow says which
  one it is, and the callback redirects to whatever comes back out of the cookie
  — the one bug that would turn this into an open redirect is trusting a path
  someone else wrote. Two pages ask for a calendar, so there are two entries.
*/

export const RETURN_COOKIE = "fd_oauth_next";

const DESTINATIONS = {
  onboarding: "/onboarding",
  dashboard: "/dashboard",
};

/** The key to store, given whatever the query string asked for. */
export function returnKey(value) {
  return value && Object.hasOwn(DESTINATIONS, value) ? value : "dashboard";
}

/** The path to redirect to, given whatever came back out of the cookie. */
export function returnPath(key) {
  return DESTINATIONS[returnKey(key)];
}
