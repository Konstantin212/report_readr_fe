import { describe, it, expect } from "vitest";
import { parseStooqCsv } from "@/lib/quotes/stooq";

describe("parseStooqCsv", () => {
  it("parses a normal CSV row", () => {
    const csv = [
      "Symbol,Date,Time,Open,High,Low,Close,Volume",
      "COIN.US,2026-05-18,22:00:18,190.25,194.2,184.15,189.44,10399788",
    ].join("\n");
    expect(parseStooqCsv(csv)).toEqual({ date: "2026-05-18", closeRaw: "189.44" });
  });

  it("returns null when the symbol has no data (N/D)", () => {
    const csv = [
      "Symbol,Date,Time,Open,High,Low,Close,Volume",
      "UNKNOWN.XX,N/D,N/D,N/D,N/D,N/D,N/D,N/D",
    ].join("\n");
    expect(parseStooqCsv(csv)).toBeNull();
  });

  it("returns null on an empty body", () => {
    expect(parseStooqCsv("")).toBeNull();
    expect(parseStooqCsv("   \n  ")).toBeNull();
  });

  it("returns null on a header-only response", () => {
    expect(parseStooqCsv("Symbol,Date,Time,Open,High,Low,Close,Volume")).toBeNull();
  });

  // Stooq rolled out a JS proof-of-work bot challenge in mid-2026.
  // The body is HTML/JS, not CSV. The previous parser sliced cells[1]
  // and cells[6] out of the script tag and would have either crashed
  // or written nonsense into quote_cache. Detect by content shape.
  it("returns null when Stooq returns a JS bot challenge instead of CSV", () => {
    const challenge =
      `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>` +
      `<script>(async()=>{const c="AAAAAGoj4x_Nd_ffAYq__W3_Yv3ZdfXWWIYRRv2hWB6eEl9VOb0CQXZ37_0",` +
      `d=4,t="0".repeat(d),e=new TextEncoder;let n=0;while(1){const h=await crypto.subtle.digest("SHA-256",e.encode(c+n));` +
      `if(true)break;n++}const r=await fetch("/__verify",{method:"POST"});if(r.ok)location.reload()})();</script></body></html>`;
    expect(parseStooqCsv(challenge)).toBeNull();
  });

  it("returns null when the body is HTML without the CSV header", () => {
    expect(parseStooqCsv("<html><body>Service unavailable</body></html>")).toBeNull();
  });

  it("does not crash on a row missing the close cell", () => {
    const csv = [
      "Symbol,Date,Time,Open,High,Low,Close,Volume",
      "PARTIAL,2026-05-18,22:00:18,190.25",
    ].join("\n");
    expect(parseStooqCsv(csv)).toBeNull();
  });
});
