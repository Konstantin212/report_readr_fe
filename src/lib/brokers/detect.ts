import type { BrokerId } from "./types";

export function detectBroker(input: { fileName: string; bytes: Uint8Array }): BrokerId | null {
  // 16 KB is enough to catch the Freedom24-style preamble that begins with
  // a base64-encoded SVG company logo (`"trades"` ends up around byte 7.5 K
  // in those reports). 2 KB was too tight.
  const head = new TextDecoder().decode(input.bytes.slice(0, 16_384));
  if (head.includes("Interactive Brokers") || /^Statement,Header,Field Name/.test(head)) {
    return "INTERACTIVE_BROKERS";
  }
  if (head.trim().startsWith("{")) {
    // Newer Freedom24 reports brand themselves explicitly — match those
    // up front, before falling back to structural hints.
    if (head.includes('"Freedom24"') || head.includes('"companyDetails"')) {
      return "FREEDOM_FINANCE";
    }
    // Older Freedom Finance JSON layout (no embedded logo, trades section
    // surfaces near the top).
    if (head.includes('"trades"') && head.includes('"detailed"')) {
      return "FREEDOM_FINANCE";
    }
  }
  return null;
}
