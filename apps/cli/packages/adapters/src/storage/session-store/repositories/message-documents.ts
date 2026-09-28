// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { MessageInfo, MessagePart, ModelSelection } from "@knorvia/contracts";

export const LEGACY_FIELDS = {
  message: ["model", "providerID", "modelID", "variant"],
  part: ["fromModel", "toModel", "model"],
} as const;

function withoutIdentity(input: object, fields: readonly string[]): Record<string, unknown> {
  const document: Record<string, unknown> = { ...input };
  for (const field of fields) delete document[field];
  return document;
}

function legacyModel(selection: ModelSelection | undefined): Record<string, unknown> {
  if (!selection) return {};
  return {
    providerID: selection.providerId,
    modelID: selection.modelId,
    ...(selection.options?.reasoningLevel ? { variant: selection.options.reasoningLevel } : {}),
  };
}

export function messageDocument(input: MessageInfo): Record<string, unknown> {
  const document = withoutIdentity(input, ["id", "sessionID"]);
  if (input.role === "user") document.model = legacyModel(input.modelSelection);
  return document;
}

export function partDocument(input: MessagePart): Record<string, unknown> {
  const document = withoutIdentity(input, ["id", "sessionID", "messageID"]);
  if (input.type === "timeline" && input.timelineType === "model_change") {
    delete document.fromModel;
    delete document.toModel;
    document.toModel = input.toModel
      ? { ...legacyModel(input.toModel), label: input.toModel.label }
      : {};
    document.fromModelSelection = input.fromModel;
    document.toModelSelection = input.toModel;
  } else if (input.type === "subtask") {
    delete document.model;
    document.modelSelection = input.model;
  }
  return document;
}

export function applyLegacySnapshot(
  document: Record<string, unknown>,
  encoded: string,
  table: keyof typeof LEGACY_FIELDS,
): Record<string, unknown> {
  const snapshot = JSON.parse(encoded) as Record<string, unknown>;
  for (const field of LEGACY_FIELDS[table]) {
    if (Object.hasOwn(snapshot, field)) document[field] = snapshot[field];
  }
  return document;
}
