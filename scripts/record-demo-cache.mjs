import { copyFile, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

import { documentKey } from "../lib/cache/keys.js";

/*
  Turns this machine's cache into the recording that ships with the repo.

  Run one demo through — saviorplumbing.com, then every file in demo/documents —
  and `.cache/` fills with what that run produced. This copies the parts of it
  that belong to the demo into demo/recordings/, where they are checked in and
  every later run replays them, on any machine, from a fresh clone.

    npm run demo:record

  It copies deliberately rather than moving the whole directory. `.cache/` also
  holds documents belonging to whoever else has used this dev server, and those
  are somebody's business's files: they don't go in the repo. The three
  model-backed namespaces are only ever written on the demo path (see
  lib/demo/site.js), so they're taken whole; documents are taken by name, one per
  file in demo/documents.

  Nothing here does any work of its own. If an entry is missing it is because
  that step didn't run, and the fix is to run it, not to hand-write a file.
*/

const root = path.join(import.meta.dirname, "..");
const cacheDir = path.join(root, ".cache");
const recordingsDir = path.join(root, "demo", "recordings");
const documentsDir = path.join(root, "demo", "documents");

/* Only ever written by a business whose website is the demo site. */
const WHOLE_NAMESPACES = ["website", "synthesis", "followups"];

/*
  Work out the whole set before touching anything.

  A recording is all or nothing. Replacing it one file at a time would mean an
  incomplete run — a crashed browser, a step nobody got to — could half-overwrite
  a good recording with a worse one, and the way you'd find out is a demo that
  stops to think in front of an audience.
*/
async function main() {
  const found = [];
  const missing = [];

  for (const namespace of WHOLE_NAMESPACES) {
    const entries = await listEntries(path.join(cacheDir, namespace));
    if (entries.length === 0) {
      missing.push(`${namespace}: nothing in .cache — that step never ran`);
    }
    for (const entry of entries) {
      found.push({ namespace, entry, label: entry });
    }
  }

  for (const file of await documentSet()) {
    const entry = `${documentKey(file)}.json`;
    if (await exists(path.join(cacheDir, "documents", entry))) {
      found.push({ namespace: "documents", entry, label: file.name });
    } else {
      missing.push(`documents: ${file.name} was never read on this machine`);
    }
  }

  if (missing.length) {
    for (const line of missing) console.log(`  MISSING   ${line}`);
    console.log(
      "\nNothing written — the recording you have is untouched." +
        "\nRun the demo through once (see demo/README.md) and try again.",
    );
    process.exitCode = 1;
    return;
  }

  await rm(recordingsDir, { recursive: true, force: true });

  let bytes = 0;
  for (const { namespace, entry, label } of found) {
    bytes += await take(namespace, entry);
    console.log(`  recorded  ${namespace}/${label}`);
  }

  console.log(`\n${found.length} entries, ${Math.round(bytes / 1024)} KB in demo/recordings.`);
}

async function take(namespace, entry) {
  const from = path.join(cacheDir, namespace, entry);
  const to = path.join(recordingsDir, namespace, entry);
  await mkdir(path.dirname(to), { recursive: true });
  await copyFile(from, to);
  const { size } = await stat(to);
  return size;
}

async function listEntries(dir) {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

/** Every file in demo/documents, as the upload route would see it. */
async function documentSet() {
  const names = (await readdir(documentsDir)).filter((name) => !name.startsWith("."));
  return Promise.all(
    names.sort().map(async (name) => ({
      name,
      bytes: new Uint8Array(await readFile(path.join(documentsDir, name))),
    })),
  );
}

const exists = (file) =>
  stat(file).then(
    () => true,
    () => false,
  );

await main();
