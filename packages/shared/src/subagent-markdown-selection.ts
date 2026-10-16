// SPDX-License-Identifier: Apache-2.0
// Unchanged model text keeps its original bytes, including percent-encoding case.
import { decodeCustomModelValue, encodeCustomModelValue } from "./custom-model-value.js";
import {
  migrateLegacyModelProviderId,
  migrateLegacyOfficialGlmModelId,
} from "./legacy-model-provider-identity.js";
import { parseModelPickerValue, type ModelSelection } from "./model-selection.js";

const RESERVED_MODEL_NAMES = ["inherit", "main", "sonnet", "opus", "haiku"] as const;
const reservedModels = new Set<string>(RESERVED_MODEL_NAMES);

const CUSTOM_MARK = "custom:";
const BUILTIN_MARK = "builtin:";

const FRONT_MATTER = /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u;
const SCALAR = /^("(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[^#]*?)([ \t]+#.*|[ \t]*)$/u;

type Wrapped = "double" | "single" | "plain";

function absent(): undefined {
  return undefined;
}

function safely<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return absent();
  }
}

function wrapping(token: string): Wrapped {
  if (token.startsWith('"')) return "double";
  if (token.startsWith("'")) return "single";
  return "plain";
}

function unwrap(token: string): string | undefined {
  const style = wrapping(token);
  if (style === "double") {
    const parsed = safely(() => JSON.parse(token) as unknown);
    return typeof parsed === "string" ? parsed : absent();
  }
  if (style === "single") return token.slice(1, -1).replace(/''/gu, "'");
  return token;
}

function wrapScalar(style: Wrapped, text: string): string {
  if (style === "double") return JSON.stringify(text);
  if (style === "single") return `'${text.replace(/'/gu, "''")}'`;
  return text;
}

function readSelection(raw: string): ModelSelection | undefined {
  const decoded = decodeCustomModelValue(raw);
  if (decoded) {
    const providerId = decoded.providerId.trim();
    const modelId = (decoded.modelName ?? "").trim();
    if (providerId.length === 0 || modelId.length === 0) return absent();
    return { providerId, modelId };
  }
  return safely(() => parseModelPickerValue(raw));
}

function thoughtText(meta: Record<string, unknown>): string {
  const thought = meta.thoughtLevel;
  return typeof thought === "string" ? thought.trim() : "";
}

export function parseSubagentMarkdownSelection(meta: Record<string, unknown>) {
  const modelText = typeof meta.model === "string" ? meta.model.trim() : absent();
  if (modelText === undefined || modelText.length === 0 || reservedModels.has(modelText)) {
    return absent();
  }
  const picked = readSelection(modelText);
  if (!picked) return absent();
  const reasoningLevel = thoughtText(meta);
  // A non-empty thoughtLevel replaces options; the markdown field carries only reasoningLevel.
  if (reasoningLevel.length === 0) return picked;
  return { ...picked, options: { reasoningLevel } };
}

function mustEncode(picked: ModelSelection): boolean {
  const provider = picked.providerId;
  const model = picked.modelId;
  return provider.startsWith(CUSTOM_MARK) || provider.includes("/") || model.includes("$");
}

export function formatSubagentMarkdownModel(picked: ModelSelection): string {
  if (!mustEncode(picked)) return `${picked.providerId}/${picked.modelId}`;
  return encodeCustomModelValue(picked.providerId, picked.modelId);
}

function rewriteCustomForm(stored: string): string | undefined {
  if (!stored.startsWith(CUSTOM_MARK)) return absent();
  const decoded = decodeCustomModelValue(stored);
  if (!decoded?.modelName || !decoded.providerId.startsWith(BUILTIN_MARK)) return stored;
  const migratedProvider = migrateLegacyModelProviderId(decoded.providerId);
  if (!migratedProvider || migratedProvider === decoded.providerId) return stored;
  const migratedModel = migrateLegacyOfficialGlmModelId(decoded.providerId, decoded.modelName);
  const payload = stored.slice(CUSTOM_MARK.length);
  const colonFrom = payload.startsWith(BUILTIN_MARK) ? BUILTIN_MARK.length : 0;
  const colonAt = payload.indexOf(":", colonFrom);
  if (colonAt < 0) return stored;
  const modelPayload =
    migratedModel === decoded.modelName
      ? payload.slice(colonAt + 1)
      : encodeURIComponent(migratedModel);
  return `${CUSTOM_MARK}${encodeURIComponent(migratedProvider)}:${modelPayload}`;
}

function rewriteSlashForm(stored: string): string | undefined {
  const slashAt = stored.indexOf("/");
  if (slashAt < 1) return absent();
  const providerBefore = stored.slice(0, slashAt);
  if (!providerBefore.startsWith(BUILTIN_MARK)) return stored;
  const migratedProvider = migrateLegacyModelProviderId(providerBefore);
  if (!migratedProvider) return stored;
  const tail = stored.slice(slashAt + 1);
  const dollarAt = tail.indexOf("$");
  const modelPart = dollarAt < 0 ? tail : tail.slice(0, dollarAt);
  const reasoningSuffix = dollarAt < 0 ? "" : tail.slice(dollarAt);
  const migratedModel = migrateLegacyOfficialGlmModelId(providerBefore, modelPart);
  if (migratedProvider === providerBefore && migratedModel === modelPart) return stored;
  return `${migratedProvider}/${migratedModel}${reasoningSuffix}`;
}

function rewriteStoredModel(stored: string): string {
  const custom = rewriteCustomForm(stored);
  if (custom !== undefined) return custom;
  return rewriteSlashForm(stored) ?? stored;
}

function rewriteScalar(prefix: string, scalar: string, line: string): string {
  const parts = SCALAR.exec(scalar);
  const token = parts?.[1];
  const trailing = parts?.[2];
  if (token === undefined || trailing === undefined) return line;
  const decoded = unwrap(token);
  if (decoded === undefined) return line;
  const migrated = rewriteStoredModel(decoded);
  if (migrated === decoded) return line;
  return `${prefix}${wrapScalar(wrapping(token), migrated)}${trailing}`;
}

function rewriteModelLines(body: string): string {
  // Fresh lastIndex: the model-line pattern is global and must not leak across calls.
  const modelLine = /^(model[ \t]*:[ \t]*)([^\r\n]*)/gmu;
  return body.replace(modelLine, (line, prefix: string, scalar: string) =>
    rewriteScalar(prefix, scalar, line),
  );
}

export function migrateSubagentMarkdownProvider(markdown: string): string {
  const fence = FRONT_MATTER.exec(markdown);
  const body = fence?.[1];
  if (!fence || body === undefined) return markdown;
  const migratedBody = rewriteModelLines(body);
  if (migratedBody === body) return markdown;
  // The opening fence ends at the first newline; only the captured body is replaced.
  const bodyStart = markdown.indexOf("\n") + 1;
  return markdown.slice(0, bodyStart) + migratedBody + markdown.slice(bodyStart + body.length);
}
