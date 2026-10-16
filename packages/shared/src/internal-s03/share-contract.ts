// SPDX-License-Identifier: Apache-2.0
// Outbound share bodies are strict (extra fields are local bugs). Inbound wire objects stay open.
import { z } from "zod";
import type { ZodRawShape } from "zod";
import type { Locale } from "../protocol.js";
import type { ConversationRow } from "../protocol-v4/rows.js";
import { conversationArtifactTypeSchema, conversationRowSchema } from "../protocol-v4/rows.js";

const SHARE_SCHEMA_VERSION = 1;
export const CONVERSATION_SHARE_SCHEMA_VERSION = SHARE_SCHEMA_VERSION;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SHARE_ARTIFACT_REF = /^knorvia-artifact:\/\/share\/[A-Za-z0-9._~-]+$/u;
const SHARE_PATH = /^\/(cn\/)?share\/([^/]+)\/?$/u;

// 3202 is not a known code; the gap is part of the frozen list.
const KNOWN_ERROR_CODES = [
  3001, 3002, 3200, 3201, 3203, 3204, 3205, 3206, 3207, 3208, 3209, 3210, 3211, 3212, 3213, 3214,
  3215,
] as const;

export type ConversationShareApiErrorCode = (typeof KNOWN_ERROR_CODES)[number];

const ACCESS_MODE_VALUES = ["private", "public_readonly", "public_importable"] as const;

type Parsed<Schema extends z.ZodType> = z.infer<Schema>;

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

export function parseConversationSharePathname(pathname: string) {
  const matched = SHARE_PATH.exec(pathname);
  const rawCode = matched?.[2];
  if (matched === null || rawCode === undefined) return null;
  const locale: Locale = matched[1] === undefined ? "en-US" : "zh-CN";
  return { rawCode, locale };
}

function shareUrlOf(shareUrl: string): URL | undefined {
  if (!URL.canParse(shareUrl)) return undefined;
  return new URL(shareUrl);
}

export function localizeConversationShareUrl(shareUrl: string, locale: Locale) {
  const url = shareUrlOf(shareUrl);
  if (url === undefined) return shareUrl;
  const pathParts = parseConversationSharePathname(url.pathname);
  if (pathParts === null) return shareUrl;
  url.pathname = `${localePrefix(locale)}/share/${pathParts.rawCode}`;
  return url.href;
}

const trimmed = () => z.string().trim().min(1);
const rawMinText = () => z.string().min(1);
const count = () => z.number().int().nonnegative();
const positive = () => z.number().int().positive();
const webUrl = () => z.string().url();
const sha256 = () => z.string().regex(SHA256_PATTERN);
const plainString = () => z.string();

const currentState = z.literal("current");
const preparingStatus = z.literal("preparing");
const confirmedStatus = z.literal("confirmed");
const uploadedStatus = z.literal("uploaded");
const shareSchemaVersion = z.literal(SHARE_SCHEMA_VERSION);
const disclosureVersion = z.literal(1);
const acknowledgedNoSecretDetection = z.literal(true);
const successCode = z.literal(0);
const integerCode = z.number().int();
const unknownRows = z.array(z.unknown());
const uploadableType = conversationArtifactTypeSchema;

function openObject<Shape extends ZodRawShape>(shape: Shape) {
  return z.object(shape);
}

function closedObject<Shape extends ZodRawShape>(shape: Shape) {
  return z.object(shape).strict();
}

export const conversationShareAccessModeSchema = z.enum(ACCESS_MODE_VALUES);
export type ConversationShareAccessMode = Parsed<typeof conversationShareAccessModeSchema>;

const accessMode = conversationShareAccessModeSchema;
const knownAccessModes = z.array(accessMode);
const looseTextList = z.array(trimmed());

// Positive int, not a literal: a newer schema_version must parse so callers can ask for an upgrade.
const inboundSchemaVersion = positive();

export function isConversationShareSchemaVersionSupported(version: number) {
  return version <= SHARE_SCHEMA_VERSION;
}

function rowKindLabel(row: unknown): string {
  if (typeof row !== "object" || row === null || !("kind" in row)) return "unknown";
  const kind = row.kind;
  if (typeof kind !== "string") return "unknown";
  const label = kind.trim();
  return label.length > 0 ? label : "unknown";
}

function rememberLabel(labels: string[], label: string): void {
  if (labels.includes(label)) return;
  labels.push(label);
}

function takeShareRow(row: unknown, accepted: ConversationRow[], rejected: string[]): boolean {
  const verdict = conversationRowSchema.safeParse(row);
  if (!verdict.success) {
    rememberLabel(rejected, rowKindLabel(row));
    return false;
  }
  accepted.push(verdict.data);
  return true;
}

export function decodeConversationShareRows(rows: readonly unknown[]) {
  const accepted: ConversationRow[] = [];
  const rejected: string[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (takeShareRow(row, accepted, rejected)) continue;
    skipped += 1;
  }
  const unsupportedCount = skipped;
  const unsupportedKinds = rejected;
  return { rows: accepted, unsupportedCount, unsupportedKinds };
}

export const conversationShareSha256Schema = sha256();

const descriptorFields = {
  artifact_id: trimmed(),
  logical_artifact_key: trimmed(),
  producer_product_turn_id: trimmed(),
  artifact_version: positive(),
  state: currentState,
  ref: z.string().regex(SHARE_ARTIFACT_REF),
  artifact_type: uploadableType,
  display_name: trimmed(),
  original_path: rawMinText().optional(),
  extension: trimmed(),
  mime_type: trimmed(),
  size_bytes: count(),
  sha256: sha256(),
};

export const conversationShareArtifactDescriptorSchema = closedObject(descriptorFields);
export type ConversationShareArtifactDescriptor = Parsed<
  typeof conversationShareArtifactDescriptorSchema
>;

export const conversationShareInboundArtifactDescriptorSchema = openObject(descriptorFields);

const allowedArtifactWireFields = {
  type: trimmed(),
  extensions: looseTextList,
  mime_types: looseTextList,
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
  access_modes: looseTextList,
  allowed_artifacts: z.array(openObject(allowedArtifactWireFields)),
});
export type ConversationShareCapabilitiesWire = Parsed<
  typeof conversationShareCapabilitiesWireSchema
>;

const allowedArtifactDataFields = {
  type: uploadableType,
  extensions: looseTextList,
  mime_types: looseTextList,
};

export const conversationShareCapabilitiesDataSchema = closedObject({
  ...capabilityLimits,
  schema_version: inboundSchemaVersion,
  access_modes: knownAccessModes,
  allowed_artifacts: z.array(closedObject(allowedArtifactDataFields)),
});
export type ConversationShareCapabilities = Parsed<typeof conversationShareCapabilitiesDataSchema>;

function keepArtifacts(entries: ConversationShareCapabilitiesWire["allowed_artifacts"]) {
  const kept: ConversationShareCapabilities["allowed_artifacts"] = [];
  const rejected: string[] = [];
  for (const entry of entries) {
    const verdict = conversationArtifactTypeSchema.safeParse(entry.type);
    if (!verdict.success) {
      rememberLabel(rejected, entry.type);
      continue;
    }
    kept.push({ ...entry, type: verdict.data });
  }
  return { kept, rejected };
}

function keepModes(modes: readonly string[]) {
  const kept: ConversationShareAccessMode[] = [];
  const rejected: string[] = [];
  for (const mode of modes) {
    const verdict = accessMode.safeParse(mode);
    if (!verdict.success) {
      rememberLabel(rejected, mode);
      continue;
    }
    kept.push(verdict.data);
  }
  return { kept, rejected };
}

export function narrowConversationShareCapabilities(wire: ConversationShareCapabilitiesWire) {
  const artifacts = keepArtifacts(wire.allowed_artifacts);
  const modes = keepModes(wire.access_modes);
  const capabilities = {
    ...wire,
    access_modes: modes.kept,
    allowed_artifacts: artifacts.kept,
  };
  const unsupportedArtifactTypes = artifacts.rejected;
  const unsupportedAccessModes = modes.rejected;
  return { capabilities, unsupportedArtifactTypes, unsupportedAccessModes };
}

export const conversationShareConfirmDataSchema = openObject({
  share_code: trimmed(),
  share_url: webUrl(),
  access_mode: accessMode,
  expires_at: count(),
});
export type ConversationShareRecord = Parsed<typeof conversationShareConfirmDataSchema>;

export const conversationSharePreparationRequestSchema = closedObject({
  client_request_id: trimmed(),
  title: trimmed(),
  schema_version: shareSchemaVersion,
  access_mode: accessMode,
  payload_sha256: sha256(),
  artifact_count: count(),
});
export type ConversationSharePreparationRequest = Parsed<
  typeof conversationSharePreparationRequestSchema
>;

const preparationBase = {
  preparation_id: trimmed(),
  access_mode: accessMode,
  expires_at: count(),
};

const preparingBranch = openObject({ ...preparationBase, status: preparingStatus });
const confirmedBranch = openObject({
  ...preparationBase,
  status: confirmedStatus,
  share: conversationShareConfirmDataSchema,
});

export const conversationSharePreparationDataSchema = z.discriminatedUnion("status", [
  preparingBranch,
  confirmedBranch,
]);
export type ConversationSharePreparation = Parsed<typeof conversationSharePreparationDataSchema>;

export const conversationShareArtifactUploadDataSchema = openObject({
  artifact_id: trimmed(),
  size_bytes: count(),
  sha256: sha256(),
  status: uploadedStatus,
  safety_status: trimmed(),
});
export type ConversationShareArtifactUpload = Parsed<
  typeof conversationShareArtifactUploadDataSchema
>;

const integrityFields = {
  projection_sha256: sha256(),
  artifact_set_sha256: sha256(),
};

export const conversationShareIntegritySchema = openObject(integrityFields);
export type ConversationShareIntegrity = Parsed<typeof conversationShareIntegritySchema>;

const outboundIntegrity = closedObject(integrityFields);
const inboundIntegrity = conversationShareIntegritySchema;

function atLeastOne<Item extends z.ZodType>(item: Item) {
  return z.array(item).min(1);
}

export const conversationShareConfirmRequestSchema = closedObject({
  selected_product_turn_ids: atLeastOne(trimmed()),
  projection: closedObject({ rows: atLeastOne(conversationRowSchema) }),
  integrity: outboundIntegrity,
  disclosure_confirmation: closedObject({
    version: disclosureVersion,
    accepted_at: count(),
    acknowledged_no_secret_detection: acknowledgedNoSecretDetection,
  }),
});
export type ConversationShareConfirmRequest = Parsed<typeof conversationShareConfirmRequestSchema>;

const publicMetadataFields = {
  title: plainString(),
  access_mode: accessMode,
  created_at: count(),
  expires_at: count(),
};

const publicMetadataSchema = openObject(publicMetadataFields);

const previewArtifactFields = {
  ...descriptorFields,
  url: webUrl(),
  url_expires_at: count(),
};

export const conversationSharePreviewArtifactSchema = openObject(previewArtifactFields);
const previewArtifactList = z.array(conversationSharePreviewArtifactSchema);

export const conversationSharePreviewDataSchema = openObject({
  schema_version: inboundSchemaVersion,
  share: publicMetadataSchema,
  rows: unknownRows,
  artifacts: previewArtifactList,
  integrity: inboundIntegrity,
});
export type ConversationSharePreviewWire = Parsed<typeof conversationSharePreviewDataSchema>;

type ShareRows = ConversationRow[];
type DecodedRowFields = {
  rows: ShareRows;
  unsupportedRowCount: number;
};

export type ConversationSharePreview = Omit<ConversationSharePreviewWire, "rows"> &
  DecodedRowFields;

export const conversationShareContinuationRequestSchema = closedObject({
  schema_version: shareSchemaVersion,
  client_request_id: trimmed(),
});
export type ConversationShareContinuationRequest = Parsed<
  typeof conversationShareContinuationRequestSchema
>;

const continuationArtifactFields = {
  ...descriptorFields,
  download_url: webUrl(),
  download_url_expires_at: count(),
};

export const conversationShareContinuationArtifactSchema = openObject(continuationArtifactFields);
const continuationArtifactList = z.array(conversationShareContinuationArtifactSchema);

const continuationShare = openObject({
  ...publicMetadataFields,
  share_id: trimmed(),
});

export const conversationShareContinuationDataSchema = openObject({
  schema_version: inboundSchemaVersion,
  import_grant_id: trimmed(),
  import_grant_expires_at: count(),
  share: continuationShare,
  rows: unknownRows,
  artifacts: continuationArtifactList,
  integrity: inboundIntegrity,
});
export type ConversationShareContinuationWire = Parsed<
  typeof conversationShareContinuationDataSchema
>;

type RawRows = readonly unknown[];

export type ConversationShareContinuation = Omit<ConversationShareContinuationWire, "rows"> &
  DecodedRowFields & { rawRows: RawRows };

export const conversationShareKnownErrorCodeSchema: z.ZodType<ConversationShareApiErrorCode> =
  z.union(
    KNOWN_ERROR_CODES.map((code) => z.literal(code)) as unknown as [
      z.ZodLiteral<ConversationShareApiErrorCode>,
      z.ZodLiteral<ConversationShareApiErrorCode>,
      ...z.ZodLiteral<ConversationShareApiErrorCode>[],
    ],
  );

export const conversationShareErrorEnvelopeSchema = openObject({
  code: integerCode,
  msg: plainString(),
});
export type ConversationShareErrorEnvelope = Parsed<typeof conversationShareErrorEnvelopeSchema>;

export function createConversationShareSuccessEnvelopeSchema<PayloadSchema extends z.ZodType>(
  payload: PayloadSchema,
) {
  return openObject({
    code: successCode,
    msg: plainString(),
    data: payload,
  });
}
