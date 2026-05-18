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
});
