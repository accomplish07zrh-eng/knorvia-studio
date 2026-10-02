import { decodeCustomModelValue, encodeCustomModelValue } from "./custom-model-value.js";

import {
  migrateLegacyModelProviderId,
  migrateLegacyOfficialGlmModelId,
} from "./legacy-model-provider-identity.js";

import { parseModelPickerValue, type ModelSelection } from "./model-selection.js";

export function parseSubagentMarkdownSelection(
  frontmatter: Record<string, unknown>,
): ModelSelection | undefined {
  if (typeof frontmatter.model !== "string") return undefined;

  const value = frontmatter.model.trim();
  if (
    value === "" ||
    value === "inherit" ||
    value === "main" ||
    value === "sonnet" ||
    value === "opus" ||
    value === "haiku"
  ) {
    return undefined;
  }

  // 正式读取只接受模型字段；旧身份迁移由存储边界负责，不读取过渡字段。
  const custom = decodeCustomModelValue(value);
  let selection: ModelSelection;
  if (custom) {
    const providerId = custom.providerId.trim();
    const modelId = custom.modelName?.trim();
    if (!providerId || !modelId) return undefined;
    selection = { providerId, modelId };
  } else {
    try {
      selection = parseModelPickerValue(value);
    } catch {
      return undefined;
    }
  }

  const reasoningLevel =
    typeof frontmatter.thoughtLevel === "string" ? frontmatter.thoughtLevel.trim() : "";
  if (reasoningLevel) {
    return { ...selection, options: { reasoningLevel } };
  }
  return selection;
}

export function formatSubagentMarkdownModel(selection: ModelSelection): string {
  const { providerId, modelId } = selection;
  if (providerId.startsWith("custom:") || providerId.includes("/") || modelId.includes("$")) {
    return encodeCustomModelValue(providerId, modelId);
  }
  return `${providerId}/${modelId}`;
}

function migrateStoredModel(value: string): string {
  if (value.startsWith("custom:")) {
    const decoded = decodeCustomModelValue(value);
    if (!decoded?.modelName || !decoded.providerId.startsWith("builtin:")) return value;

    const providerId = migrateLegacyModelProviderId(decoded.providerId);
    if (!providerId || providerId === decoded.providerId) return value;

    const modelId = migrateLegacyOfficialGlmModelId(decoded.providerId, decoded.modelName);
    const payload = value.slice("custom:".length);
    const separator = payload.indexOf(":", payload.startsWith("builtin:") ? "builtin:".length : 0);
    if (separator < 0) return value;

    // 模型未变时保留原始编码字节，包括转义大小写，避免存储迁移改写无关内容。
    const modelPayload =
      modelId === decoded.modelName ? payload.slice(separator + 1) : encodeURIComponent(modelId);
    return `custom:${encodeURIComponent(providerId)}:${modelPayload}`;
  }

  const separator = value.indexOf("/");
  if (separator < 1) return value;
  const oldProviderId = value.slice(0, separator);
  if (!oldProviderId.startsWith("builtin:")) return value;

  const providerId = migrateLegacyModelProviderId(oldProviderId);
  if (!providerId) return value;

  const remainder = value.slice(separator + 1);
  const reasoningBoundary = remainder.indexOf("$");
  // 第一个 $ 起属于推理后缀；只迁移它之前的模型名，后缀原样保留。
  const modelName = reasoningBoundary < 0 ? remainder : remainder.slice(0, reasoningBoundary);
  const suffix = reasoningBoundary < 0 ? "" : remainder.slice(reasoningBoundary);
  const modelId = migrateLegacyOfficialGlmModelId(oldProviderId, modelName);
  return `${providerId}/${modelId}${suffix}`;
}

export function migrateSubagentMarkdownProvider(content: string): string {
  const frontmatter = /^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u.exec(
    content,
  );
  if (!frontmatter) return content;

  const body = frontmatter[1]!;
  const migratedBody = body.replace(
    /^(model[ \t]*:[ \t]*)([^\r\n]*)/gmu,
    (line, prefix: string, scalar: string) => {
      const parts = /^("(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[^#]*?)([ \t]+#.*|[ \t]*)$/u.exec(scalar);
      if (!parts) return line;

      const token = parts[1]!;
      const trailing = parts[2]!;
      let value: string;
      if (token.startsWith('"')) {
        try {
          value = JSON.parse(token) as string;
        } catch {
          return line;
        }
      } else if (token.startsWith("'")) {
        value = token.slice(1, -1).replace(/''/gu, "'");
      } else {
        value = token;
      }

      const migratedValue = migrateStoredModel(value);
      if (migratedValue === value) return line;

      let replacement: string;
      if (token.startsWith('"')) {
        replacement = JSON.stringify(migratedValue);
      } else if (token.startsWith("'")) {
        replacement = `'${migratedValue.replace(/'/gu, "''")}'`;
      } else {
        replacement = migratedValue;
      }
      return `${prefix}${replacement}${trailing}`;
    },
  );

  if (migratedBody === body) return content;
  // 只替换捕获的正文，保留 BOM、换行、边界标记和其余 Markdown 的原始字节。
  const bodyOffset = content.indexOf("\n") + 1;
  return content.slice(0, bodyOffset) + migratedBody + content.slice(bodyOffset + body.length);
}
