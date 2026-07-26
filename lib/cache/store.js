import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/*
  A read-through cache for work that is slow, expensive, and a pure function of
  its input.

  Everything it holds is something we produced ourselves and could produce again
  — a PDF turned into text, a page fetched and extracted, a corpus read. Nothing
  here invents an answer: a miss does the real work, and a hit replays the same
  work's own output. That distinction is the whole licence for this file. A cache
  that made something up would be indistinguishable, to the owner reading a quote
  on their dashboard, from an extractor that hallucinated.

  Three layers, because they fail at different times.

    memory            per process; dies with a restart or a hot reload
    .cache/           per machine; survives both, gitignored, written to
    demo/recordings/  in the repo; survives a fresh clone, never written to

  The last one is the difference between a demo that is fast on this laptop and a
  demo that is fast anywhere. It holds one recorded run of the Savior Plumbing
  set — see demo/README.md — put there by `npm run demo:record` after a real run
  filled `.cache/`. It is checked in for the same reason a test fixture is: so
  the behaviour it produces doesn't depend on what happens to be on your disk.

  Cache failures are never call failures. If the directory is read-only, or the
  file on disk is half-written, we do the work again — slower, and correct.
*/

/** Bounded so a long-lived process can't accumulate every document ever read. */
const MAX_MEMORY_ENTRIES = 300;

const memory = new Map();

/*
  Read lazily rather than at import: tests point this at a temp directory, and a
  constant captured at module load would ignore them.
*/
const cacheRoot = () =>
  process.env.CACHE_DIR ?? path.join(process.cwd(), ".cache");

/** The checked-in recording. Read from, never written to. */
export const RECORDINGS_DIR = "demo/recordings";

const seedRoot = () => path.join(process.cwd(), RECORDINGS_DIR);


/**
 * Returns the cached value for `key`, or runs `produce` and remembers it.
 *
 * `produce` rejecting is passed straight through and nothing is written: a
 * failure is not an answer, and caching one would turn a transient network error
 * into a permanent state of that document being unreadable.
 */
export async function cached(namespace, key, produce) {
  const slot = `${namespace}/${key}`;

  /*
    The map holds promises, not values. Two identical uploads arriving together —
    which is exactly what a batch drop of duplicate files looks like — then share
    one read instead of racing to do it twice.
  */
  const live = memory.get(slot);
  if (live) return live;

  const pending = (async () => {
    const fromDisk = await readEntry(namespace, key);
    if (fromDisk) return fromDisk.value;

    const value = await produce();
    await writeEntry(namespace, key, value);
    return value;
  })();

  remember(slot, pending);

  try {
    return await pending;
  } catch (err) {
    /* Don't leave a rejected promise in the map for the next caller to await. */
    memory.delete(slot);
    throw err;
  }
}

function remember(slot, pending) {
  memory.set(slot, pending);
  /* Oldest first — Map iterates in insertion order, so the first key is the eldest. */
  while (memory.size > MAX_MEMORY_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

const entryPath = (root, namespace, key) =>
  path.join(root, namespace, `${key}.json`);

/*
  This machine's cache first, then the checked-in recording.

  That order is what lets a re-recording be corrected by simply doing the work
  again on the machine you're on: the local copy shadows the committed one until
  someone records over it. The reverse order would make a stale recording
  impossible to get past without deleting a file from the repo.
*/
async function readEntry(namespace, key) {
  for (const root of [cacheRoot(), seedRoot()]) {
    try {
      const raw = await readFile(entryPath(root, namespace, key), "utf8");
      return { value: JSON.parse(raw) };
    } catch {
      /* Missing, unreadable, or truncated. All three mean: try the next one. */
    }
  }
  return null;
}

async function writeEntry(namespace, key, value) {
  if (value === undefined) return;
  try {
    /* Only ever this machine's cache. The recording is written by the recorder. */
    const file = entryPath(cacheRoot(), namespace, key);
    await mkdir(path.dirname(file), { recursive: true });
    /*
      Write beside the target and rename. A process killed mid-write would
      otherwise leave a truncated file that parses as valid JSON often enough to
      matter, and a half-read document is worse than no cache at all.
    */
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(value), "utf8");
    await rename(temporary, file);
  } catch {
    /* An unwritable cache directory costs speed, not correctness. */
  }
}

/** Drops the in-memory layer. For tests; the disk layer is unaffected. */
export function _resetMemory() {
  memory.clear();
}
