import type { MessagePart } from "@knorvia/contracts";
import type { KnorviaMessagePart } from "@knorvia/shared";
import { projectRecord, type RecordRecipe } from "./message-record-projection.js";
import { TIMELINE_FIELDS, projectCompactionMetadata } from "./message-timeline-projection.js";
import { projectToolPartMetadata, projectToolState } from "./message-tool-projection.js";

type StoredPart<Kind extends MessagePart["type"]> = Extract<MessagePart, { type: Kind }>;
type PublicPart<Kind extends KnorviaMessagePart["type"]> = Extract<
  KnorviaMessagePart,
  { type: Kind }
>;
type PartIdentity = Pick<KnorviaMessagePart, "messageId" | "partId" | "sessionId">;

const IDENTITY_FIELDS: RecordRecipe<MessagePart, PartIdentity> = [
  ["messageId", (part) => String(part.messageID)],
  ["partId", (part) => String(part.id)],
  ["sessionId", (part) => String(part.sessionID)],
];

function partReader<Source extends MessagePart, Result extends KnorviaMessagePart>(
  fields: RecordRecipe<Source, Omit<Result, keyof PartIdentity>>,
): (part: MessagePart) => KnorviaMessagePart {
  // 每个公开 part 都含相同三个 string 身份字段；payload recipe 用具体 discriminant 校验。
  const recipe = [...IDENTITY_FIELDS, ...fields] as RecordRecipe<Source, Result>;
  return (part) => projectRecord(part as Source, recipe);
}

const PARTS = new Map<MessagePart["type"], (part: MessagePart) => KnorviaMessagePart>([
  [
    "text",
    partReader<StoredPart<"text">, PublicPart<"text">>([
      ["ignored", (part) => part.ignored],
      ["metadata", (part) => part.metadata],
      ["synthetic", (part) => part.synthetic],
      ["text", (part) => part.text],
      // 固定标签的返回类型显式保留字面量，不把字段 recipe 放宽为 string。
      ["type", (): "text" => "text"],
    ]),
  ],
  [
    "reasoning",
    partReader<StoredPart<"reasoning">, PublicPart<"reasoning">>([
      ["metadata", (part) => part.metadata],
      ["text", (part) => part.text],
      ["type", (): "reasoning" => "reasoning"],
    ]),
  ],
  [
    "file",
    partReader<StoredPart<"file">, PublicPart<"file">>([
      ["filename", (part) => part.filename],
      ["metadata", (part) => part.metadata as Record<string, unknown> | undefined],
      ["mime", (part) => part.mime],
      ["type", (): "file" => "file"],
      ["url", (part) => part.url],
    ]),
  ],
  [
    "tool",
    partReader<StoredPart<"tool">, PublicPart<"tool">>([
      ["callId", (part) => part.callID],
      ["metadata", (part) => projectToolPartMetadata(part.metadata)],
      ["state", (part) => projectToolState(part.state)],
      ["tool", (part) => part.tool],
      ["type", (): "tool" => "tool"],
    ]),
  ],
  [
    "step-start",
    partReader<StoredPart<"step-start">, PublicPart<"step-start">>([
      ["snapshot", (part) => part.snapshot],
      ["type", (): "step-start" => "step-start"],
    ]),
  ],
  [
    "step-finish",
    partReader<StoredPart<"step-finish">, PublicPart<"step-finish">>([
      ["cost", (part) => part.cost],
      ["reason", (part) => part.reason],
      ["snapshot", (part) => part.snapshot],
      ["tokens", (part) => part.tokens],
      ["type", (): "step-finish" => "step-finish"],
    ]),
  ],
  [
    "snapshot",
    partReader<StoredPart<"snapshot">, PublicPart<"snapshot">>([
      ["snapshot", (part) => part.snapshot],
      ["type", (): "snapshot" => "snapshot"],
    ]),
  ],
  [
    "patch",
    partReader<StoredPart<"patch">, PublicPart<"patch">>([
      ["files", (part) => part.files],
      ["hash", (part) => part.hash],
      ["type", (): "patch" => "patch"],
    ]),
  ],
  [
    "compaction",
    partReader<StoredPart<"compaction">, PublicPart<"compaction">>([
      ["auto", (part) => part.auto],
      ["metadata", (part) => projectCompactionMetadata(part)],
      ["reason", (part) => part.reason],
      ["summaryMessageId", (part) => part.summaryMessageId],
      ["type", (): "compaction" => "compaction"],
    ]),
  ],
  ["timeline", partReader<StoredPart<"timeline">, PublicPart<"timeline">>(TIMELINE_FIELDS)],
  [
    "subtask",
    partReader<StoredPart<"subtask">, PublicPart<"subagent">>([
      ["agent", (part) => part.agent],
      ["command", (part) => part.command],
      ["description", (part) => part.description],
      ["model", (part) => part.model],
      ["prompt", (part) => part.prompt],
      ["type", (): "subagent" => "subagent"],
    ]),
  ],
  [
    "agent",
    partReader<StoredPart<"agent">, PublicPart<"agent">>([
      ["name", (part) => part.name],
      ["type", (): "agent" => "agent"],
    ]),
  ],
  [
    "retry",
    partReader<StoredPart<"retry">, PublicPart<"retry">>([
      ["attempt", (part) => part.attempt],
      ["error", (part) => ({ name: part.error.name, data: part.error.data })],
      ["type", (): "retry" => "retry"],
    ]),
  ],
]);

export function projectMessagePart(part: MessagePart): KnorviaMessagePart | undefined {
  return PARTS.get(part.type)?.(part);
}
