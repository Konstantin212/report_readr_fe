import type { BrokerId } from "./types";

export function detectBroker(input: { fileName: string; bytes: Uint8Array }): BrokerId | null {
  const head = new TextDecoder().decode(input.bytes.slice(0, 2048));
  if (head.includes("Interactive Brokers") || /^Statement,Header,Field Name/.test(head)) {
    return "INTERACTIVE_BROKERS";
  }
  if (head.trim().startsWith("{") && head.includes('"trades"') && head.includes('"detailed"')) {
    return "FREEDOM_FINANCE";
  }
  return null;
}
