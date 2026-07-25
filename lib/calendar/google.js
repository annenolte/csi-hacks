import "server-only";

import {
  getCalendarConnection,
  saveCalendarConnection,
  updateCalendarTokens,
} from "../data/business";

/*
  Google Calendar, read and write.

  This exists ahead of the voice agent on purpose. Booking a job is the point of
  the whole product, and the awkward parts — consent, token refresh, timezones —
  are much cheaper to get wrong now than during an integration week. The read and
  write helpers at the bottom are what the agent API will call once the contract
  with the voice-agent side is settled.

  Setup walkthrough (Google Cloud Console, scopes, redirect URI): docs/SETUP.md.
*/

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

const SCOPES = [
  /* Read and write. Booking needs write; offering slots needs read. */
  "https://www.googleapis.com/auth/calendar",
  /* Only so the dashboard can say which Google account is connected. */
  "https://www.googleapis.com/auth/userinfo.email",
];

export function googleIsConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI,
  );
}

function config() {
  if (!googleIsConfigured()) {
    throw new Error(
      "Google Calendar isn't configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET " +
        "and GOOGLE_REDIRECT_URI in .env.local — see docs/SETUP.md section 3.",
    );
  }
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  };
}

/* -------------------------------------------------------------- the OAuth dance */

export function authorizeUrl(state) {
  const { clientId, redirectUri } = config();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    /*
      offline + consent is what actually returns a refresh token. Without
      access_type=offline you get an access token that dies in an hour and no way
      to renew it; without prompt=consent, Google silently omits the refresh token
      on every authorisation after the first, so re-connecting an account leaves
      you with a connection that works today and breaks tomorrow.
    */
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  return `${AUTH_ENDPOINT}?${params}`;
}

async function postToken(body) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error_description || data.error || "Google rejected the token request.",
    );
  }

  return data;
}

const expiryFrom = (seconds) =>
  new Date(Date.now() + (Number(seconds) || 3600) * 1000).toISOString();

/** Exchanges the one-time code for tokens and stores the connection. */
export async function completeConnection(businessId, code) {
  const { clientId, clientSecret, redirectUri } = config();

  const tokens = await postToken({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  if (!tokens.refresh_token) {
    /*
      Storing a connection with no refresh token would look connected on the
      dashboard and stop working within the hour, which is worse than not
      connecting at all. Revoking at myaccount.google.com/permissions makes the
      next attempt return one.
    */
    throw new Error(
      "Google didn't return a refresh token. Remove this app at " +
        "myaccount.google.com/permissions and connect again.",
    );
  }

  let email = null;
  try {
    const info = await fetch(USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (info.ok) email = (await info.json()).email ?? null;
  } catch {
    /* Cosmetic. A connection without a display address still works. */
  }

  await saveCalendarConnection(businessId, {
    email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: expiryFrom(tokens.expires_in),
    scope: tokens.scope ?? SCOPES.join(" "),
  });

  return { email };
}

/**
 * A usable access token, refreshed if it's close to expiring.
 * The 60-second margin is for the request that's about to be made with it — a
 * token valid for another two seconds is not a usable token.
 */
async function accessTokenFor(businessId) {
  const connection = await getCalendarConnection(businessId);
  if (!connection) return null;

  const expiresAt = connection.expires_at ? new Date(connection.expires_at) : null;
  const stillGood = expiresAt && expiresAt.getTime() - Date.now() > 60_000;

  if (stillGood && connection.access_token) return connection.access_token;

  const { clientId, clientSecret } = config();

  const tokens = await postToken({
    refresh_token: connection.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  await updateCalendarTokens(businessId, {
    accessToken: tokens.access_token,
    expiresAt: expiryFrom(tokens.expires_in),
  });

  return tokens.access_token;
}

async function calendarFetch(businessId, path, init = {}) {
  const token = await accessTokenFor(businessId);
  if (!token) throw new Error("No calendar is connected.");

  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message ?? "Google Calendar rejected the request.");
  }

  return data;
}

/* --------------------------------------------- what the voice agent will call */

/**
 * The busy blocks in a window. Deliberately returns busy rather than free: what
 * counts as free depends on the business's own hours, which live in
 * `business_fields`, not in Google.
 */
export async function busyPeriods(businessId, { from, to, calendarId = "primary" }) {
  const data = await calendarFetch(businessId, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      items: [{ id: calendarId }],
    }),
  });

  return (data.calendars?.[calendarId]?.busy ?? []).map((slot) => ({
    start: slot.start,
    end: slot.end,
  }));
}

/**
 * Writes a job into the calendar.
 *
 * `timeZone` is required rather than defaulted. Google interprets a naive local
 * time in the calendar's own zone, so a booking taken by an agent in one zone for
 * a business in another lands at the wrong hour — silently, and only noticed when
 * a plumber turns up three hours late.
 */
export async function createEvent(
  businessId,
  { summary, description, start, end, timeZone, location, calendarId = "primary" },
) {
  if (!timeZone) throw new Error("A booking needs an explicit time zone.");

  return calendarFetch(businessId, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify({
      summary,
      description,
      location,
      start: { dateTime: new Date(start).toISOString(), timeZone },
      end: { dateTime: new Date(end).toISOString(), timeZone },
    }),
  });
}

/** For the dashboard: connected, and to which account. */
export async function connectionStatus(businessId) {
  const connection = await getCalendarConnection(businessId);
  return {
    configured: googleIsConfigured(),
    connected: Boolean(connection),
    email: connection?.google_email ?? null,
    calendarId: connection?.calendar_id ?? null,
    connectedAt: connection?.created_at ?? null,
  };
}
