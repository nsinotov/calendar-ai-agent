import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function loadEncryptionKey(hex: string): Buffer {
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_LENGTH) {
    throw new Error(`SECRETS_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters)`);
  }

  return key;
}

export function encrypt(plaintext: string, key: Buffer): EncryptedValue {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decrypt(value: EncryptedValue, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}

