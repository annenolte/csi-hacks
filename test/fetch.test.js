import { describe, expect, it } from "vitest";
import { addressIsPrivate, normaliseUrl, ScrapeError } from "@/lib/scrape/fetch";

/*
  The URL is supplied by whoever fills in the form, so the guard is a security
  control, not a nicety. If these ever go green-to-red, the scrape route can be
  pointed at anything the server can reach.
*/

describe("normaliseUrl", () => {
  it("assumes https when no scheme is given", () => {
    expect(normaliseUrl("noltesons.com").href).toBe("https://noltesons.com/");
    expect(normaliseUrl("  noltesons.com/services ").href).toBe(
      "https://noltesons.com/services",
    );
  });

  it("keeps an explicit http scheme", () => {
    expect(normaliseUrl("http://noltesons.com").protocol).toBe("http:");
  });

  it("rejects non-http schemes", () => {
    for (const bad of ["file:///etc/passwd", "ftp://x.com", "javascript:alert(1)"]) {
      expect(() => normaliseUrl(bad), bad).toThrow(ScrapeError);
    }
  });

  it("rejects bare hostnames with no dot", () => {
    expect(() => normaliseUrl("localhost")).toThrow(ScrapeError);
    expect(() => normaliseUrl("http://localhost:5432")).toThrow(ScrapeError);
  });

  it("rejects empty input", () => {
    expect(() => normaliseUrl("")).toThrow(ScrapeError);
    expect(() => normaliseUrl(null)).toThrow(ScrapeError);
  });
});

describe("addressIsPrivate", () => {
  it("blocks loopback, private and link-local IPv4", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "100.64.0.1", // carrier-grade NAT
      "0.0.0.0",
      "224.0.0.1",
    ]) {
      expect(addressIsPrivate(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.169.0.1"]) {
      expect(addressIsPrivate(ip), ip).toBe(false);
    }
  });

  it("blocks loopback, unique-local and link-local IPv6", () => {
    for (const ip of ["::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(addressIsPrivate(ip), ip).toBe(true);
    }
  });

  it("allows public IPv6", () => {
    expect(addressIsPrivate("2606:4700:4700::1111")).toBe(false);
  });

  it("refuses anything it cannot parse", () => {
    expect(addressIsPrivate("not-an-ip")).toBe(true);
    expect(addressIsPrivate("")).toBe(true);
  });
});
