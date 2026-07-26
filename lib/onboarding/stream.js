import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/*
  The channel that lets the agent's words reach the browser while the model is
  still writing them.

  The alternative was threading an `onDelta` callback through every stage
  function in engine.js, which would put a transport concern into the one file
  whose whole job is deciding what happens next. Async local storage keeps the
  script ignorant of whether anyone is watching: `composeTurn` looks for a sink,
  and if there isn't one — a background call, a test — it just returns the text.

  One sink per request. A turn writes exactly one agent message, so there is
  never a question of which stream a delta belongs to.
*/

const storage = new AsyncLocalStorage();

/** Runs `fn` with a sink attached, so composeTurn's deltas reach `emit`. */
export function withTurnStream(emit, fn) {
  return storage.run({ emit }, fn);
}

/** Sends one chunk of the agent's message, if anything is listening. */
export function emitTurnDelta(text) {
  if (!text) return;
  const sink = storage.getStore();
  if (!sink) return;
  try {
    sink.emit(text);
  } catch {
    /* The reader hung up mid-turn. The turn still finishes and still saves. */
  }
}

/** True when this turn is being streamed to someone. */
export function isStreamingTurn() {
  return Boolean(storage.getStore());
}
