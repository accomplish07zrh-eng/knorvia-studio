import type { MessageWithParts } from "@knorvia/contracts";
import type { KnorviaMessageWithParts } from "@knorvia/shared";
import { projectRecord, type RecordRecipe } from "./message-record-projection.js";

type StoredInfo<Role extends "user" | "assistant"> = Extract<MessageWithParts["info"], { role: Role }>;
type PublicInfo<Role extends "user" | "assistant"> = Extract<KnorviaMessageWithParts["info"], { role: Role }>;

const USER_INFO: RecordRecipe<StoredInfo<"user">, PublicInfo<"user">> = [
  ["agent", (info) => info.agent],
  ["messageId", (info) => String(info.id)],
  ["model", (info) => info.modelSelection],
  ["metadata", (info) => info.metadata],
  ["role", () => "user"],
  ["semantics", (info) => info.semantics],
  ["sessionId", (info) => String(info.sessionID)],
  ["source", (info) => info.source],
  ["system", (info) => info.system],
  ["synthetic", (info) => info.synthetic],
  ["time", (info) => info.time],
  ["tools", (info) => info.tools],
  ["visibility", (info) => info.visibility],
];

const ASSISTANT_INFO: RecordRecipe<StoredInfo<"assistant">, PublicInfo<"assistant">> = [
  ["agent", (info) => info.agent],
  ["cost", (info) => info.cost],
  ["error", (info) => info.error ? { name: info.error.name, data: info.error.data } : undefined],
  ["finish", (info) => info.finish],
  ["messageId", (info) => String(info.id)],
  ["model", (info) => {
    if (!info.providerId || !info.modelId) return undefined;
    const model: NonNullable<PublicInfo<"assistant">["model"]> = {
      providerId: info.providerId,
      modelId: info.modelId,
    };
    if (info.reasoningLevel) model.options = { reasoningLevel: info.reasoningLevel };
    return model;
  }],
  ["parentMessageId", (info) => String(info.parentID)],
  ["path", (info) => info.path],
  ["role", () => "assistant"],
  ["semantics", (info) => info.semantics],
  ["sessionId", (info) => String(info.sessionID)],
  ["structured", (info) => info.structured],
  ["time", (info) => info.time],
  ["tokens", (info) => info.tokens],
];

export function projectMessageInfo(info: MessageWithParts["info"]): KnorviaMessageWithParts["info"] {
  return info.role === "user"
    ? projectRecord(info, USER_INFO)
    : projectRecord(info, ASSISTANT_INFO);
}
