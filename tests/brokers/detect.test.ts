import { describe, it, expect } from "vitest";
import { detectBroker } from "@/lib/brokers/detect";

describe("detectBroker", () => {
  it("detects IBKR from CSV statement marker", () => {
    const bytes = new TextEncoder().encode("Statement,Header,Field Name,Field Value\nStatement,Data,BrokerName,Interactive Brokers\n");
    expect(detectBroker({ fileName: "x.csv", bytes })).toBe("INTERACTIVE_BROKERS");
  });
  it("detects Freedom from JSON shape", () => {
    const bytes = new TextEncoder().encode('{"trades":{"detailed":[]},"cash_flows":{"detailed":[]}}');
    expect(detectBroker({ fileName: "x.json", bytes })).toBe("FREEDOM_FINANCE");
  });
  it("returns null when unknown", () => {
    const bytes = new TextEncoder().encode("hello world");
    expect(detectBroker({ fileName: "x.txt", bytes })).toBeNull();
  });
  it("detects Freedom24 reports where a base64 logo pushes 'trades' past the old 2 KB sniff window", () => {
    const preamble =
      '{"date_start":"2024-01-01","date_end":"2024-12-31","companyDetails":{"companyName":"Freedom24","image":"data:image/svg+xml;base64,' +
      "X".repeat(6_000) + // simulate the embedded logo
      '"},"trades":{"detailed":[]},"cash_flows":{"detailed":[]}}';
    const bytes = new TextEncoder().encode(preamble);
    expect(detectBroker({ fileName: "x.json", bytes })).toBe("FREEDOM_FINANCE");
  });
});
