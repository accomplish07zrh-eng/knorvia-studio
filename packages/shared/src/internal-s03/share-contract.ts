// SPDX-License-Identifier: Apache-2.0
// Outbound share bodies are strict (extra fields are local bugs). Inbound wire objects stay open.
import { z } from "zod";
import type { ZodRawShape } from "zod";
import type { Locale } from "../protocol.js";
import type { ConversationRow } from "../protocol-v4/rows.js";
import { conversationArtifactTypeSchema, conversationRowSchema } from "../protocol-v4/rows.js";

export const CONVERSATION_SHARE_SCHEMA_VERSION = 1;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SHARE_ARTIFACT_REF = /^knorvia-artifact:\/\/share\/[A-Za-z0-9._~-]+$/u;
const SHARE_PATHNAME = /^\/(cn\/)?share\/([^/]+)\/?$/u;

// 3202 is not a known code; the gap is part of the frozen list.
const KNOWN_ERROR_CODES = [
  3001, 3002, 3200, 3201, 3203, 3204, 3205, 3206, 3207, 3208, 3209, 3210, 3211, 3212, 3213, 3214,
  3215,
] as const;

export type ConversationShareApiErrorCode = (typeof KNOWN_ERROR_CODES)[number];

const ACCESS_MODE_VALUES = ["private", "public_readonly", "public_importable"] as const;

function localePrefix(locale: Locale): string {
  switch (locale) {
    case "zh-CN":
      return "/cn";
    case "en-US":
      return "";
    default: {
      const unreachable: never = locale;
      return unreachable;
    }
  }
}

export function parseConversationSharePathname(
  pathname: string,
): { rawCode: string; locale: Locale } | null {
  const matched = SHARE_PATHNAME.exec(pathname);
  if (matched === null) return null;
  const rawCode = matched[2];
  if (rawCode === undefined) return null;
  const locale: Locale = matched[1] ? "zh-CN" : "en-US";
  return { rawCode, locale };
}

export function localizeConversationShareUrl(shareUrl: string, locale: Locale): string {
  let url: URL;
  try {
    url = new URL(shareUrl);
  } catch {
    return shareUrl;
  }
  const parsed = parseConversationSharePathname(url.pathname);
  if (parsed === null) return shareUrl;
  url.pathname = `${localePrefix(locale)}/share/${parsed.rawCode}`;
  return url.toString();
}

const trimmed = () => z.string().trim().min(1);
const rawMinText = () => z.string().min(1);
const count = () => z.number().int().nonnegative();
const positive = () => z.number().int().positive();
const webUrl = () => z.string().url();
const sha256 = () => z.string().regex(SHA256_PATTERN);
const plainString = () => z.string();

function openObject<Shape extends ZodRawShape>(shape: Shape) {
  return z.object(shape);
}

function closedObject<Shape extends ZodRawShape>(shape: Shape) {
  return z.object(shape).strict();
}

export const conversationShareAccessModeSchema = z.enum(ACCESS_MODE_VALUES);
export type ConversationShareAccessMode = z.infer<typeof conversationShareAccessModeSchema>;

// Positive int, not a literal: a newer schema_version must parse so callers can ask for an upgrade.
const inboundSchemaVersion = positive();

export function isConversationShareSchemaVersionSupported(version: number): boolean {
  const ceiling = CONVERSATION_SHARE_SCHEMA_VERSION;
  return version <= ceiling;
}

function rowKindLabel(row: unknown): string {
  if (typeof row !== "object" || row === null || !("kind" in row)) return "unknown";
  const kind = row.kind;
  if (typeof kind !== "string") return "unknown";
  const label = kind.trim();
  return label.length > 0 ? label : "unknown";
}

export function decodeConversationShareRows(rows: readonly unknown[]): {
  rows: ConversationRow[];
  unsupportedCount: number;
  unsupportedKinds: string[];
} {
  const decoded: ConversationRow[] = [];
  const unsupportedKinds: string[] = [];
  let unsupportedCount = 0;
  for (const row of rows) {
    const parsed = conversationRowSchema.safeParse(row);
    if (parsed.success) {
      decoded.push(parsed.data);
      continue;
    }
    unsupportedCount += 1;
    const label = rowKindLabel(row);
    if (!unsupportedKinds.includes(label)) unsupportedKinds.push(label);
  }
  return { rows: decoded, unsupportedCount, unsupportedKinds };
}

export const conversationShareSha256Schema = sha256();

const descriptorFields = {
  artifact_id: trimmed(),
  logical_artifact_key: trimmed(),
  producer_product_turn_id: trimmed(),
  artifact_version: positive(),
  state: z.literal("current"),
  ref: z.string().regex(SHARE_ARTIFACT_REF),
  artifact_type: conversationArtifactTypeSchema,
  display_name: trimmed(),
  original_path: rawMinText().optional(),
  extension: trimmed(),
  mime_type: trimmed(),
  size_bytes: count(),
  sha256: sha256(),
};

export const conversationShareArtifactDescriptorSchema = closedObject(descriptorFields);
export type ConversationShareArtifactDescriptor = z.infer<
  typeof conversationShareArtifactDescriptorSchema
>;

export const conversationShareInboundArtifactDescriptorSchema = openObject(descriptorFields);

const allowedArtifactWireFields = {
  type: trimmed(),
  extensions: z.array(trimmed()),
  mime_types: z.array(trimmed()),
};

const capabilityLimits = {
  ttl_ms: positive(),
  max_rows: positive(),
  max_payload_bytes: positive(),
  max_artifact_count: count(),
  max_artifact_bytes: positive(),
  max_total_artifact_bytes: positive(),
};

export const conversationShareCapabilitiesWireSchema = openObject({
  ...capabilityLimits,
  schema_version: inboundSchemaVersion,
  access_modes: z.array(trimmed()),
  allowed_artifacts: z.array(openObject(allowedArtifactWireFields)),
});
export type ConversationShareCapabilitiesWire = z.infer<
  typeof conversationShareCapabilitiesWireSchema
>;

const allowedArtifactDataFields = {
  type: conversationArtifactTypeSchema,
  extensions: z.array(trimmed()),
  mime_types: z.array(trimmed()),
};

export const conversationShareCapabilitiesDataSchema = closedObject({
  ...capabilityLimits,
  schema_version: inboundSchemaVersion,
  access_modes: z.array(conversationShareAccessModeSchema),
  allowed_artifacts: z.array(closedObject(allowedArtifactDataFields)),
});
export type ConversationShareCapabilities = z.infer<typeof conversationShareCapabilitiesDataSchema>;

function rememberUnique(bucket: string[], value: string): void {
  if (!bucket.includes(value)) bucket.push(value);
}

export function narrowConversationShareCapabilities(wire: ConversationShareCapabilitiesWire): {
  capabilities: ConversationShareCapabilities;
  unsupportedArtifactTypes: string[];
  unsupportedAccessModes: string[];
} {
  const supported: ConversationShareCapabilities["allowed_artifacts"] = [];
  const unsupportedArtifactTypes: string[] = [];
  for (const entry of wire.allowed_artifacts) {
    const type = conversationArtifactTypeSchema.safeParse(entry.type);
    if (type.success) {
      supported.push({ ...entry, type: type.data });
      continue;
    }
    rememberUnique(unsupportedArtifactTypes, entry.type);
  }
  const accessModes: ConversationShareAccessMode[] = [];
  const unsupportedAccessModes: string[] = [];
  for (const mode of wire.access_modes) {
    const parsed = conversationShareAccessModeSchema.safeParse(mode);
    if (parsed.success) {
      accessModes.push(parsed.data);
      continue;
    }
    rememberUnique(unsupportedAccessModes, mode);
  }
  return {
    capabilities: { ...wire, access_modes: accessModes, allowed_artifacts: supported },
    unsupportedArtifactTypes,
    unsupportedAccessModes,
  };
}

export const conversationShareConfirmDataSchema = openObject({
  share_code: trimmed(),
  share_url: webUrl(),
  access_mode: conversationShareAccessModeSchema,
  expires_at: count(),
});
export type ConversationShareRecord = z.infer<typeof conversationShareConfirmDataSchema>;

export const conversationSharePreparationRequestSchema = closedObject({
  client_request_id: trimmed(),
  title: trimmed(),
  schema_version: z.literal(CONVERSATION_SHARE_SCHEMA_VERSION),
  access_mode: conversationShareAccessModeSchema,
  payload_sha256: sha256(),
  artifact_count: count(),
});
export type ConversationSharePreparationRequest = z.infer<
  typeof conversationSharePreparationRequestSchema
>;

const preparationBase = {
  preparation_id: trimmed(),
  access_mode: conversationShareAccessModeSchema,
  expires_at: count(),
};

export const conversationSharePreparationDataSchema = z.discriminatedUnion("status", [
  openObject({ ...preparationBase, status: z.literal("preparing") }),
  openObject({
    ...preparationBase,
    status: z.literal("confirmed"),
    share: conversationShareConfirmDataSchema,
  }),
]);
export type ConversationSharePreparation = z.infer<typeof conversationSharePreparationDataSchema>;

export const conversationShareArtifactUploadDataSchema = openObject({
  artifact_id: trimmed(),
  size_bytes: count(),
  sha256: sha256(),
  status: z.literal("uploaded"),
  safety_status: trimmed(),
});
export type ConversationShareArtifactUpload = z.infer<
  typeof conversationShareArtifactUploadDataSchema
>;

const integrityFields = {
  projection_sha256: sha256(),
  artifact_set_sha256: sha256(),
};

export const conversationShareIntegritySchema = openObject(integrityFields);
export type ConversationShareIntegrity = z.infer<typeof conversationShareIntegritySchema>;

const outboundIntegrity = closedObject(integrityFields);

function atLeastOne<Item extends z.ZodType>(item: Item) {
  return z.array(item).min(1);
}

export const conversationShareConfirmRequestSchema = closedObject({
  selected_product_turn_ids: atLeastOne(trimmed()),
  projection: closedObject({ rows: atLeastOne(conversationRowSchema) }),
  integrity: outboundIntegrity,
  disclosure_confirmation: closedObject({
    version: z.literal(1),
    accepted_at: count(),
    acknowledged_no_secret_detection: z.literal(true),
  }),
});
export type ConversationShareConfirmRequest = z.infer<typeof conversationShareConfirmRequestSchema>;

const publicMetadataFields = {
  title: plainString(),
  access_mode: conversationShareAccessModeSchema,
  created_at: count(),
  expires_at: count(),
};

const publicMetadataSchema = openObject(publicMetadataFields);

export const conversationSharePreviewArtifactSchema =
  conversationShareInboundArtifactDescriptorSchema.extend({
    url: webUrl(),
    url_expires_at: count(),
  });

export const conversationSharePreviewDataSchema = openObject({
  schema_version: inboundSchemaVersion,
  share: publicMetadataSchema,
  rows: z.array(z.unknown()),
  artifacts: z.array(conversationSharePreviewArtifactSchema),
  integrity: conversationShareIntegritySchema,
});
export type ConversationSharePreviewWire = z.infer<typeof conversationSharePreviewDataSchema>;
export type ConversationSharePreview = Omit<ConversationSharePreviewWire, "rows"> & {
  rows: ConversationRow[];
  unsupportedRowCount: number;
};

export const conversationShareContinuationRequestSchema = closedObject({
  schema_version: z.literal(CONVERSATION_SHARE_SCHEMA_VERSION),
  client_request_id: trimmed(),
});
export type ConversationShareContinuationRequest = z.infer<
  typeof conversationShareContinuationRequestSchema
>;

export const conversationShareContinuationArtifactSchema =
  conversationShareInboundArtifactDescriptorSchema.extend({
    download_url: webUrl(),
    download_url_expires_at: count(),
  });

export const conversationShareContinuationDataSchema = openObject({
  schema_version: inboundSchemaVersion,
  import_grant_id: trimmed(),
  import_grant_expires_at: count(),
  share: publicMetadataSchema.extend({ share_id: trimmed() }),
  rows: z.array(z.unknown()),
  artifacts: z.array(conversationShareContinuationArtifactSchema),
  integrity: conversationShareIntegritySchema,
});
export type ConversationShareContinuationWire = z.infer<
  typeof conversationShareContinuationDataSchema
>;
export type ConversationShareContinuation = Omit<ConversationShareContinuationWire, "rows"> & {
  rows: ConversationRow[];
  rawRows: readonly unknown[];
  unsupportedRowCount: number;
};

export const conversationShareKnownErrorCodeSchema: z.ZodType<ConversationShareApiErrorCode> =
  z.union(
    KNOWN_ERROR_CODES.map((code) => z.literal(code)) as unknown as [
      z.ZodLiteral<ConversationShareApiErrorCode>,
      z.ZodLiteral<ConversationShareApiErrorCode>,
      ...z.ZodLiteral<ConversationShareApiErrorCode>[],
    ],
  );

export const conversationShareErrorEnvelopeSchema = openObject({
  code: z.number().int(),
  msg: plainString(),
});
export type ConversationShareErrorEnvelope = z.infer<typeof conversationShareErrorEnvelopeSchema>;

export function createConversationShareSuccessEnvelopeSchema<TSchema extends z.ZodType>(
  dataSchema: TSchema,
) {
  return openObject({
    code: z.literal(0),
    msg: plainString(),
    data: dataSchema,
  });
}
