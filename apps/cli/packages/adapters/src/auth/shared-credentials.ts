// SPDX-License-Identifier: MIT
// Independent reimplementation; review pending.

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { atomicWritePrivateTextFile, backupCorruptFile, withFileLock } from "@knorvia/shared/node";

import {
  createKnorviaCredentialCipher,
  type KnorviaCredentialCipher,
} from "./credential-cipher.js";

export interface SharedKnorviaCredentialStoreOptions {
  baseDir?: string;
  cipher?: KnorviaCredentialCipher;
  env?: Record<string, string | undefined>;
  filePath?: string;
}

export interface SharedKnorviaCredentialStore {
  readonly filePath: string;
  delete(key: string): Promise<void>;
  deleteIfValue(key: string, expectedValue: string): Promise<boolean>;
  deleteIfValues(
    expectedValues: Readonly<Record<string, string>>,
  ): Promise<Record<string, boolean>>;
  deleteManyIfValue(
    guardKey: string,
    expectedGuardValue: string,
    keysToDelete: readonly string[],
  ): Promise<boolean>;
  load(key: string): Promise<string | null>;
  loadMany(keys: readonly string[]): Promise<Record<string, string | null>>;
  onDidChange?(listener: () => void | Promise<void>): () => void;
  save(key: string, value: string): Promise<void>;
  saveMany(entries: Readonly<Record<string, string>>): Promise<void>;
  saveReplacing(key: string, value: string, replacedKeys: readonly string[]): Promise<void>;
}

type CredentialRecord = Record<string, string>;
type ChangeListener = () => void | Promise<void>;

const CREDENTIAL_DIRECTORY = ".knorvia-studio";
const CREDENTIAL_VERSION_DIRECTORY = "v2";
const CREDENTIAL_FILE_NAME = "credentials.json";
const listenersByFile = new Map<string, Set<ChangeListener>>();

function expandUserPath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return resolve(homedir(), value.slice(2));
  return resolve(value);
}

export function resolveSharedKnorviaCredentialsPath(
  options: SharedKnorviaCredentialStoreOptions = {},
): string {
  if (options.filePath) return expandUserPath(options.filePath);
  const env = options.env ?? process.env;
  const baseDir = options.baseDir ?? env.KNORVIA_DATA_BASE_DIR ?? homedir();
  return join(
    expandUserPath(baseDir),
    CREDENTIAL_DIRECTORY,
    CREDENTIAL_VERSION_DIRECTORY,
    CREDENTIAL_FILE_NAME,
  );
}

function normalizeKey(key: string): string {
  const normalized = key.trim();
  if (normalized.length === 0) throw new Error("Credential key must not be empty");
  return normalized;
}

function requireValue(value: string): string {
  if (value.length === 0) throw new Error("Credential value must not be empty");
  return value;
}

function setRecordValue<Value>(record: Record<string, Value>, key: string, value: Value): void {
  Object.defineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function parseCredentialRecord(text: string): CredentialRecord {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Credential record must be an object");
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      throw new Error(`Credential record value must be a string: ${key}`);
    }
  }
  return parsed as CredentialRecord;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function readCredentialRecord(filePath: string): Promise<CredentialRecord> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return {};
    throw new Error(`Unable to read shared Knorvia Studio credentials: ${filePath}`, {
      cause: error,
    });
  }

  try {
    return parseCredentialRecord(text);
  } catch (error) {
    let backupPath: string | undefined;
    try {
      backupPath = await backupCorruptFile(filePath);
    } catch {
      // The original corrupt file remains the evidence when backup itself fails.
    }
    const backupSuffix = backupPath === undefined ? "" : ` Backup: ${backupPath}`;
    throw new Error(`Shared Knorvia Studio credentials are corrupt: ${filePath}.${backupSuffix}`, {
      cause: error,
    });
  }
}

async function writeCredentialRecord(filePath: string, record: CredentialRecord): Promise<void> {
  await atomicWritePrivateTextFile(filePath, `${JSON.stringify(record, null, 2)}\n`);
}

async function notifyListeners(filePath: string): Promise<void> {
  const snapshot = [...(listenersByFile.get(filePath) ?? [])];
  await Promise.allSettled(snapshot.map((listener) => Promise.resolve().then(listener)));
}

async function mutateRecord<T>(
  filePath: string,
  mutate: (record: CredentialRecord) => T | Promise<T>,
): Promise<T> {
  const result = await withFileLock(filePath, async () => {
    const record = await readCredentialRecord(filePath);
    const mutationResult = await mutate(record);
    await writeCredentialRecord(filePath, record);
    return mutationResult;
  });
  await notifyListeners(filePath);
  return result;
}

function subscribe(filePath: string, listener: ChangeListener): () => void {
  let listeners = listenersByFile.get(filePath);
  if (listeners === undefined) {
    listeners = new Set();
    listenersByFile.set(filePath, listeners);
  }
  listeners.add(listener);
  return () => {
    const current = listenersByFile.get(filePath);
    if (current === undefined) return;
    current.delete(listener);
    if (current.size === 0) listenersByFile.delete(filePath);
  };
}

export function createSharedKnorviaCredentialStore(
  options: SharedKnorviaCredentialStoreOptions = {},
): SharedKnorviaCredentialStore {
  const filePath = resolveSharedKnorviaCredentialsPath(options);
  const cipher = options.cipher ?? createKnorviaCredentialCipher({ env: options.env });

  return {
    filePath,
    async load(key) {
      const normalizedKey = normalizeKey(key);
      const record = await readCredentialRecord(filePath);
      const storedValue = record[normalizedKey];
      return storedValue === undefined ? null : cipher.decrypt(storedValue);
    },
    async loadMany(keys) {
      const normalizedKeys = keys.map(normalizeKey);
      const record = await readCredentialRecord(filePath);
      const result: Record<string, string | null> = {};
      for (const key of normalizedKeys) {
        const storedValue = record[key];
        setRecordValue(result, key, storedValue === undefined ? null : cipher.decrypt(storedValue));
      }
      return result;
    },
    async save(key, value) {
      const normalizedKey = normalizeKey(key);
      const encryptedValue = cipher.encrypt(requireValue(value));
      await mutateRecord(filePath, (record) => {
        setRecordValue(record, normalizedKey, encryptedValue);
      });
    },
    async saveMany(entries) {
      const encryptedEntries: CredentialRecord = {};
      for (const [key, value] of Object.entries(entries)) {
        setRecordValue(encryptedEntries, normalizeKey(key), cipher.encrypt(requireValue(value)));
      }
      await mutateRecord(filePath, (record) => {
        for (const [entryKey, encryptedValue] of Object.entries(encryptedEntries)) {
          setRecordValue(record, entryKey, encryptedValue);
        }
      });
    },
    async saveReplacing(key, value, replacedKeys) {
      const normalizedKey = normalizeKey(key);
      const normalizedReplacedKeys = replacedKeys.map(normalizeKey);
      const encryptedValue = cipher.encrypt(requireValue(value));
      await mutateRecord(filePath, (record) => {
        setRecordValue(record, normalizedKey, encryptedValue);
        for (const replacedKey of normalizedReplacedKeys) {
          if (replacedKey !== normalizedKey) delete record[replacedKey];
        }
      });
    },
    async delete(key) {
      const normalizedKey = normalizeKey(key);
      await mutateRecord(filePath, (record) => {
        delete record[normalizedKey];
      });
    },
    async deleteIfValue(key, expectedValue) {
      const normalizedKey = normalizeKey(key);
      requireValue(expectedValue);
      return await mutateRecord(filePath, (record) => {
        const storedValue = record[normalizedKey];
        const matches = storedValue !== undefined && cipher.decrypt(storedValue) === expectedValue;
        if (matches) delete record[normalizedKey];
        return matches;
      });
    },
    async deleteIfValues(expectedValues) {
      const normalizedExpectedValues: Record<string, string> = {};
      for (const [key, value] of Object.entries(expectedValues)) {
        setRecordValue(normalizedExpectedValues, normalizeKey(key), requireValue(value));
      }
      if (Object.keys(normalizedExpectedValues).length === 0) return {};
      return await mutateRecord(filePath, (record) => {
        const result: Record<string, boolean> = {};
        for (const [key, expectedValue] of Object.entries(normalizedExpectedValues)) {
          const storedValue = record[key];
          const matches =
            storedValue !== undefined && cipher.decrypt(storedValue) === expectedValue;
          if (matches) delete record[key];
          setRecordValue(result, key, matches);
        }
        return result;
      });
    },
    async deleteManyIfValue(guardKey, expectedGuardValue, keysToDelete) {
      const normalizedGuardKey = normalizeKey(guardKey);
      requireValue(expectedGuardValue);
      const normalizedKeysToDelete = keysToDelete.map(normalizeKey);
      return await mutateRecord(filePath, (record) => {
        const storedGuard = record[normalizedGuardKey];
        const matches =
          storedGuard !== undefined && cipher.decrypt(storedGuard) === expectedGuardValue;
        if (matches) {
          for (const key of normalizedKeysToDelete) delete record[key];
        }
        return matches;
      });
    },
    onDidChange(listener) {
      return subscribe(filePath, listener);
    },
  };
}

export function loadSharedKnorviaCredentialSync(
  key: string,
  options: SharedKnorviaCredentialStoreOptions = {},
): string | undefined {
  try {
    const normalizedKey = normalizeKey(key);
    const filePath = resolveSharedKnorviaCredentialsPath(options);
    const record = parseCredentialRecord(readFileSync(filePath, "utf8"));
    const storedValue = record[normalizedKey];
    if (storedValue === undefined) return undefined;
    const cipher = options.cipher ?? createKnorviaCredentialCipher({ env: options.env });
    const decrypted = cipher.decrypt(storedValue);
    return decrypted.trim().length === 0 ? undefined : decrypted;
  } catch {
    return undefined;
  }
}
