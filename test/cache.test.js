import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { _resetMemory, cached } from "@/lib/cache/store";
import { corpusKey, documentKey, fingerprint } from "@/lib/cache/keys";
import { DEMO_WEBSITE, isDemoSite } from "@/lib/demo/site";

const root = await mkdtemp(path.join(tmpdir(), "csi-cache-"));
process.env.CACHE_DIR = root;

afterAll(() => rm(root, { recursive: true, force: true }));

beforeEach(() => _resetMemory());

describe("fingerprint", () => {
  it("is stable for the same parts", () => {
    expect(fingerprint("a", "b")).toBe(fingerprint("a", "b"));
  });

  it("does not collide across a part boundary", () => {
    /* The whole reason parts carry their length: "ab"+"c" is not "a"+"bc". */
    expect(fingerprint("ab", "c")).not.toBe(fingerprint("a", "bc"));
  });

  it("reads bytes as well as strings", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(fingerprint("x", bytes)).toBe(fingerprint("x", new Uint8Array([1, 2, 3])));
    expect(fingerprint("x", bytes)).not.toBe(fingerprint("x", new Uint8Array([1, 2, 4])));
  });
});

describe("cache keys", () => {
  /*
    The recorder looks entries up by these same functions, so a document read
    during a demo and the file the recorder copies have to agree on what "the
    same file" is.
  */
  it("reads a document by its bytes and extension, not its name", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(documentKey({ name: "prices.pdf", bytes })).toBe(
      documentKey({ name: "a-copy-of-prices.pdf", bytes }),
    );
    expect(documentKey({ name: "prices.pdf", bytes })).not.toBe(
      documentKey({ name: "prices.docx", bytes }),
    );
    expect(documentKey({ name: "prices.pdf", bytes })).not.toBe(
      documentKey({ name: "prices.pdf", bytes: new Uint8Array([1, 2, 4]) }),
    );
  });

  /* Drop order isn't part of what a corpus says. */
  it("reads a corpus regardless of the order the files arrived in", () => {
    const docs = [
      { name: "notes.txt", text: "we close at 4:30" },
      { name: "prices.xlsx", text: "drain clearing $149" },
    ];

    expect(corpusKey({ tradeId: "plumbing", documents: docs })).toBe(
      corpusKey({ tradeId: "plumbing", documents: [...docs].reverse() }),
    );
    expect(corpusKey({ tradeId: "plumbing", documents: docs })).not.toBe(
      corpusKey({ tradeId: "plumbing", documents: docs.slice(0, 1) }),
    );
  });
});

describe("cached", () => {
  it("does the work once and replays it after that", async () => {
    let runs = 0;
    const produce = async () => {
      runs += 1;
      return { text: "read once" };
    };

    const key = fingerprint("replay", runs);
    expect(await cached("test", key, produce)).toEqual({ text: "read once" });

    /* Second call in the same process: the memory layer. */
    expect(await cached("test", key, produce)).toEqual({ text: "read once" });

    /* Third with memory dropped: the disk layer, which is what survives a restart. */
    _resetMemory();
    expect(await cached("test", key, produce)).toEqual({ text: "read once" });

    expect(runs).toBe(1);
  });

  it("collapses two identical reads that arrive together", async () => {
    let runs = 0;
    const produce = async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return runs;
    };

    const key = fingerprint("concurrent");
    const [a, b] = await Promise.all([
      cached("test", key, produce),
      cached("test", key, produce),
    ]);

    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(runs).toBe(1);
  });

  it("keeps different keys apart", async () => {
    expect(await cached("test", fingerprint("one"), async () => "first")).toBe("first");
    expect(await cached("test", fingerprint("two"), async () => "second")).toBe("second");
  });

  /*
    A failure is not an answer. Caching one would turn a dropped connection into
    a document that can never be read again.
  */
  it("never caches a failure", async () => {
    let attempts = 0;
    const key = fingerprint("flaky");

    const produce = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("that page returned a 502");
      return "read on the retry";
    };

    await expect(cached("test", key, produce)).rejects.toThrow("502");
    expect(await cached("test", key, produce)).toBe("read on the retry");
    expect(attempts).toBe(2);
  });
});

describe("isDemoSite", () => {
  it("matches the site however it was typed", () => {
    for (const written of [
      DEMO_WEBSITE,
      `www.${DEMO_WEBSITE}`,
      `https://${DEMO_WEBSITE}`,
      `http://www.${DEMO_WEBSITE}/contact`,
      `  HTTPS://SaviorPlumbing.com/  `,
    ]) {
      expect(isDemoSite(written), written).toBe(true);
    }
  });

  it("does not match a domain that merely starts the same way", () => {
    /*
      The one that matters: anyone can register saviorplumbing.com.example.net,
      and a suffix check without the dot would hand them the cached reading of
      someone else's business.
    */
    for (const written of [
      `${DEMO_WEBSITE}.example.net`,
      "notsaviorplumbing.com",
      "saviorplumbing.co",
      "example.com",
      "",
      null,
      undefined,
    ]) {
      expect(isDemoSite(written), String(written)).toBe(false);
    }
  });
});
