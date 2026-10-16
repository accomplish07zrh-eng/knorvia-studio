// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

import { strictFields } from "./internal-s03/strict-shape.js";
import { WORKSPACE_HOOK_EVENT_NAMES } from "./workspace-hook-config.js";

const TRUST_V1 = 1 as const;
export const WORKSPACE_HOOK_TRUST_STORE_SCHEMA_VERSION = TRUST_V1;

const trimmedText = z.string().trim().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/u);
const wholeCount = z.number().int().nonnegative();
const isoInstant = z.string().datetime();
const eventName = z.enum(WORKSPACE_HOOK_EVENT_NAMES);
const UNIQUE_GRANT = "workspace identity and declaration digest keys must be unique";

// 列顺序就是解析后对象的键序。
const TRUST_COLUMNS: ReadonlyArray<readonly [string, z.ZodType]> = [
  ["workspaceIdentity", trimmedText],
  ["hookDeclarationDigest", sha256Hex],
  ["digestAlgorithm", z.literal("sha256")],
  ["decision", z.literal("trusted")],
  ["grantedAt", isoInstant],
  ["lastUsedAt", isoInstant.optional()],
  ["bundleDigestAtGrant", sha256Hex.optional()],
  ["eventAtGrant", eventName],
  ["displayCommandAtGrant", trimmedText],
  ["sourcePathAtGrant", trimmedText],
  ["sourceDiscoveryOrderAtGrant", wholeCount.optional()],
  ["matcherAtGrant", z.string().nullable().optional()],
  ["matcherIndexAtGrant", wholeCount.optional()],
  ["hookIndexAtGrant", wholeCount.optional()],
  ["appVersionAtGrant", trimmedText.optional()],
];

function columnsToShape(columns: ReadonlyArray<readonly [string, z.ZodType]>) {
  const shape: z.ZodRawShape = {};
  for (const [key, schema] of columns) shape[key] = schema;
  return strictFields(shape);
}

export const workspaceHookTrustRecordSchema = columnsToShape(TRUST_COLUMNS);

export type WorkspaceHookTrustRecord = z.output<typeof workspaceHookTrustRecordSchema>;

function duplicateGrant(
  store: { records: readonly WorkspaceHookTrustRecord[] },
  context: z.RefinementCtx,
) {
  const seen = new Set<string>();
  for (const record of store.records) {
    const key = `${record.workspaceIdentity}\u0000${record.hookDeclarationDigest}`;
    if (!seen.has(key)) {
      seen.add(key);
      continue;
    }
    context.addIssue({ code: "custom", path: ["records"], message: UNIQUE_GRANT });
    return;
  }
}

const trustFileShape = columnsToShape([
  ["schemaVersion", z.literal(WORKSPACE_HOOK_TRUST_STORE_SCHEMA_VERSION)],
  ["records", z.array(workspaceHookTrustRecordSchema)],
]);

export const workspaceHookTrustStoreFileSchema = trustFileShape.superRefine(duplicateGrant);

export type WorkspaceHookTrustStoreFile = z.output<typeof workspaceHookTrustStoreFileSchema>;

type OkTrust = { status: "ok"; file: WorkspaceHookTrustStoreFile };
type BadTrust = { status: "invalid" };
export type WorkspaceHookTrustStoreParseResult = OkTrust | BadTrust;

function invalid(): BadTrust {
  const rejected: BadTrust = { status: "invalid" };
  return rejected;
}

export function parseWorkspaceHookTrustStoreContent(
  content: string,
): WorkspaceHookTrustStoreParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return invalid();
  }
  const verdict = workspaceHookTrustStoreFileSchema.safeParse(parsed);
  if (!verdict.success) return invalid();
  const parsedFile: WorkspaceHookTrustStoreParseResult = { status: "ok", file: verdict.data };
  return parsedFile;
}
