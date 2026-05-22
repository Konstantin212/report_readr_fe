import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decryptString, encryptString, generateMasterKey, resetKeyCache } from "@/lib/crypto/aes";

const PREV_KEY = process.env.COINBASE_TOKEN_KEY;

beforeEach(() => {
  process.env.COINBASE_TOKEN_KEY = generateMasterKey();
  resetKeyCache();
});

afterEach(() => {
  if (PREV_KEY === undefined) delete process.env.COINBASE_TOKEN_KEY;
  else process.env.COINBASE_TOKEN_KEY = PREV_KEY;
  resetKeyCache();
});

describe("crypto/aes", () => {
  it("round-trips a plaintext through AES-256-GCM", () => {
    const plain = "refresh-token-abc123";
    const rec = encryptString(plain);
    expect(rec.ciphertext).not.toContain(plain);
    expect(decryptString(rec)).toBe(plain);
  });

  it("emits a fresh IV per call", () => {
    const a = encryptString("same-plaintext");
    const b = encryptString("same-plaintext");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const rec = encryptString("payload");
    const tampered = Buffer.from(rec.ciphertext, "base64");
    tampered[0] ^= 0xff;
    expect(() => decryptString({ ciphertext: tampered.toString("base64"), iv: rec.iv })).toThrow();
  });

  it("rejects decryption under a different master key", () => {
    const rec = encryptString("only-decryptable-with-original-key");
    process.env.COINBASE_TOKEN_KEY = generateMasterKey();
    resetKeyCache();
    expect(() => decryptString(rec)).toThrow();
  });

  it("throws if the master key is missing", () => {
    delete process.env.COINBASE_TOKEN_KEY;
    resetKeyCache();
    expect(() => encryptString("x")).toThrow(/COINBASE_TOKEN_KEY/);
  });

  it("throws if the master key is the wrong size", () => {
    process.env.COINBASE_TOKEN_KEY = Buffer.from("too-short").toString("base64");
    resetKeyCache();
    expect(() => encryptString("x")).toThrow(/32 bytes/);
  });
});
