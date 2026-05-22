import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for at-rest encryption of OAuth refresh tokens. The master
 * key lives in COINBASE_TOKEN_KEY (base64, 32 bytes) and never touches the
 * database. A fresh 12-byte IV is generated per record; the GCM auth tag
 * is appended to the ciphertext so a single column round-trips cleanly.
 */

const ALGO = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.COINBASE_TOKEN_KEY;
  if (!raw) {
    throw new Error("COINBASE_TOKEN_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`COINBASE_TOKEN_KEY must decode to ${KEY_BYTES} bytes; got ${key.length}`);
  }
  cachedKey = key;
  return key;
}

export function resetKeyCache(): void {
  cachedKey = null;
}

export type EncryptedRecord = { ciphertext: string; iv: string };

export function encryptString(plaintext: string): EncryptedRecord {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([enc, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptString(record: EncryptedRecord): string {
  const key = loadKey();
  const iv = Buffer.from(record.iv, "base64");
  if (iv.length !== IV_BYTES) {
    throw new Error("encrypted record has wrong IV length");
  }
  const buf = Buffer.from(record.ciphertext, "base64");
  if (buf.length < TAG_BYTES + 1) {
    throw new Error("encrypted record is too short");
  }
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const enc = buf.subarray(0, buf.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

export function generateMasterKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}
