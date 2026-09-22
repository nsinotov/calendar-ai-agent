import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { decrypt, encrypt, loadEncryptionKey } from "./crypto.js";

function testKey(): Buffer {
  return randomBytes(32);
}

test("encrypt() then decrypt() round-trips the plaintext", () => {
  const key = testKey();
  const encrypted = encrypt("refresh-token-value", key);

  assert.equal(decrypt(encrypted, key), "refresh-token-value");
});

test("ciphertext does not contain the plaintext", () => {
  const key = testKey();
  const encrypted = encrypt("super-secret-token", key);

  assert.ok(!encrypted.ciphertext.includes("super-secret-token"));
});

test("two encryptions of the same plaintext produce different ciphertext (random IV)", () => {
  const key = testKey();
  const first = encrypt("same-value", key);
  const second = encrypt("same-value", key);

  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.notEqual(first.iv, second.iv);
});

test("decrypt() fails with the wrong key", () => {
  const encrypted = encrypt("secret", testKey());

  assert.throws(() => decrypt(encrypted, testKey()));
});

test("decrypt() fails if the ciphertext was tampered with", () => {
  const key = testKey();
  const encrypted = encrypt("secret", key);
  const tampered = { ...encrypted, ciphertext: encrypt("different", key).ciphertext };

  assert.throws(() => decrypt(tampered, key));
});

test("loadEncryptionKey() rejects a key of the wrong length", () => {
  assert.throws(() => loadEncryptionKey("too-short"));
});

test("loadEncryptionKey() accepts a valid 32-byte hex key", () => {
  const hex = randomBytes(32).toString("hex");

  assert.equal(loadEncryptionKey(hex).length, 32);
});

