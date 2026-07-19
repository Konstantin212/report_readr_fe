import type { BrokerId } from "./types";

/** Local zip-file header — `PK\x03\x04`. Every .xlsx starts with it. */
function isZipContainer(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function detectBroker(input: { fileName: string; bytes: Uint8Array }): BrokerId | null {
  // Revolut is the only broker exporting .xlsx, and an xlsx is a zip — its
  // bytes are compressed, so the text sniffing below can never match it.
  // Which of Revolut's three workbooks this is gets decided later, from the
  // sheet shape (see revolut/detect.ts).
  if (isZipContainer(input.bytes)) return "REVOLUT";

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
