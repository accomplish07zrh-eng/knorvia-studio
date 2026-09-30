// SPDX-License-Identifier: MIT
// Independent reimplementation; review pending.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { homedir, platform, userInfo } from "node:os";

export interface KnorviaCredentialCipher {
  decrypt(value: string): string;
  encrypt(value: string): string;
}

export interface KnorviaCredentialCipherOptions {
  env?: Record<string, string | undefined>;
}

const ENCRYPTED_PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";
const INITIALIZATION_VECTOR_BYTES = 12;
const AUTHENTICATION_TAG_BYTES = 16;
const SECRET_ENVIRONMENT_KEY = "KNORVIA_CREDENTIAL_SECRET";
const UNKNOWN_USERNAME = "unknown";
const INVALID_FORMAT_MESSAGE = "Credential decrypt failed: invalid ciphertext format";
const INVALID_IV_MESSAGE = "Credential decrypt failed: invalid IV length";
const INVALID_TAG_MESSAGE = "Credential decrypt failed: invalid auth tag length";
const AUTHENTICATION_FAILURE_MESSAGE =
  "Credential decrypt failed: key mismatch or corrupted ciphertext";

function hostUsername(): string {
  try {
    return userInfo().username;
  } catch {
    return UNKNOWN_USERNAME;
  }
}

function resolveSecret(env: Record<string, string | undefined>): string {
  const configured = env[SECRET_ENVIRONMENT_KEY]?.trim();
  if (configured) return configured;
  // 兼容密钥的三个系统字段须来自同一个 OS 端口，避免混入宿主进程的平台值。
  return `knorvia-studio-credential-fallback:${platform()}:${homedir()}:${hostUsername()}`;
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

function encodeBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function isEncryptedKnorviaCredentialValue(value: string): boolean {
  return value.startsWith(ENCRYPTED_PREFIX);
}

export function createKnorviaCredentialCipher(
  options: KnorviaCredentialCipherOptions = {},
): KnorviaCredentialCipher {
  const key = deriveKey(resolveSecret(options.env ?? process.env));

  return {
    encrypt(value) {
      const initializationVector = randomBytes(INITIALIZATION_VECTOR_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, initializationVector);
      const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      const authenticationTag = cipher.getAuthTag();
      return [
        `${ENCRYPTED_PREFIX}${encodeBase64Url(initializationVector)}`,
        encodeBase64Url(authenticationTag),
        encodeBase64Url(encrypted),
      ].join(".");
    },
    decrypt(value) {
      if (!isEncryptedKnorviaCredentialValue(value)) return value;
      const fields = value.slice(ENCRYPTED_PREFIX.length).split(".");
      if (fields.length !== 3 || fields.some((field) => field.length === 0)) {
        throw new Error(INVALID_FORMAT_MESSAGE);
      }

      const [ivText, tagText, ciphertextText] = fields as [string, string, string];
      const initializationVector = decodeBase64Url(ivText);
      if (initializationVector.length !== INITIALIZATION_VECTOR_BYTES) {
        throw new Error(INVALID_IV_MESSAGE);
      }
      const authenticationTag = decodeBase64Url(tagText);
      if (authenticationTag.length !== AUTHENTICATION_TAG_BYTES) {
        throw new Error(INVALID_TAG_MESSAGE);
      }

      try {
        const decipher = createDecipheriv(ALGORITHM, key, initializationVector);
        decipher.setAuthTag(authenticationTag);
        const decrypted = Buffer.concat([
          decipher.update(decodeBase64Url(ciphertextText)),
          decipher.final(),
        ]);
        return decrypted.toString("utf8");
      } catch (error) {
        throw new Error(AUTHENTICATION_FAILURE_MESSAGE, { cause: error });
      }
    },
  };
}
