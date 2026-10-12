// SPDX-License-Identifier: Apache-2.0
// JSON schema 常量：模型请求 / 内容块 / 状态事件的对外 schema。
// 组织方式：对象骨架、非空字符串、枚举、带下界数值各有一个构造器，schema 只声明差异部分；
// 键顺序与既有输出保持一致（`type` → `required` → `additionalProperties` → `properties`）。
// 本文件由 model/index.ts 的运行时声明拆出；模型面类型仍从 ./index.js 导出。

import type { JsonSchema } from "./index.js";
import { ModelFailureReason, ModelTransportKind } from "./runtime-tables_core.js";

/** 对象骨架；`required` 缺省表示不写这个键（不是空数组）。 */
function objectSchema(
  properties: Record<string, JsonSchema>,
  required?: readonly string[],
  additionalProperties: boolean | JsonSchema = false,
): JsonSchema {
  return {
    type: "object",
    ...(required ? { required: [...required] } : {}),
    additionalProperties,
    properties,
  };
}

/** 非空字符串属性。 */
function nonEmptyString(): JsonSchema {
  return { type: "string", minLength: 1 };
}

/** 枚举属性；取值顺序即既有顺序。 */
function valueEnum(values: readonly string[]): JsonSchema {
  return { enum: [...values] };
}

/** 无约束的字符串属性。 */
function stringProperty(): JsonSchema {
  return { type: "string" };
}

/** 无约束的数值属性。 */
function numberProperty(): JsonSchema {
  return { type: "number" };
}

/** 无约束的布尔属性。 */
function booleanProperty(): JsonSchema {
  return { type: "boolean" };
}

/** 无约束的对象属性。 */
function objectProperty(): JsonSchema {
  return { type: "object" };
}

/** 数组属性；不给 `items` 表示元素不约束。 */
function arrayProperty(items?: JsonSchema): JsonSchema {
  return items ? { type: "array", items } : { type: "array" };
}

/** 字符串字典属性（键任意、值为字符串）。 */
function stringMapProperty(): JsonSchema {
  return { type: "object", additionalProperties: { type: "string" } };
}

/** 带下界的数值属性。 */
function boundedNumber(minimum: number): JsonSchema {
  return { type: "number", minimum };
}

export const modelSelectionJsonSchema = objectSchema(
  {
    providerId: nonEmptyString(),
    modelId: nonEmptyString(),
    options: objectSchema({
      reasoningLevel: nonEmptyString(),
      maxOutputTokens: boundedNumber(1),
    }),
  },
  ["providerId", "modelId"],
);

export const attachmentRefJsonSchema = objectSchema(
  {
    id: nonEmptyString(),
    kind: valueEnum(["local_file", "resource", "inline"]),
    uri: stringProperty(),
    path: stringProperty(),
    mimeType: stringProperty(),
    sizeBytes: numberProperty(),
    sha256: stringProperty(),
    placeholder: stringProperty(),
  },
  ["id", "kind"],
);

/** 内容块的判别联合：每个分支只写自己那几项，骨架交给 objectSchema。 */
export const modelMessageContentBlockJsonSchema = {
  oneOf: [
    objectSchema({ type: valueEnum(["text"]), text: stringProperty() }, ["type", "text"]),
    objectSchema(
      {
        type: valueEnum(["reasoning"]),
        text: stringProperty(),
        providerOptions: objectProperty(),
      },
      ["type", "text"],
    ),
    objectSchema(
      {
        type: valueEnum(["image"]),
        mediaType: nonEmptyString(),
        dataUrl: nonEmptyString(),
        detail: valueEnum(["auto", "low", "high", "original"]),
        source: attachmentRefJsonSchema,
      },
      ["type", "mediaType", "dataUrl"],
    ),
    objectSchema(
      {
        type: valueEnum(["video"]),
        mediaType: nonEmptyString(),
        dataUrl: nonEmptyString(),
        source: attachmentRefJsonSchema,
      },
      ["type", "mediaType", "dataUrl"],
    ),
    objectSchema(
      {
        type: valueEnum(["file"]),
        mediaType: nonEmptyString(),
        name: stringProperty(),
        uri: stringProperty(),
        dataUrl: stringProperty(),
        text: stringProperty(),
        source: attachmentRefJsonSchema,
      },
      ["type", "mediaType"],
    ),
    objectSchema(
      {
        type: valueEnum(["resource_link"]),
        uri: nonEmptyString(),
        name: stringProperty(),
        title: stringProperty(),
      },
      ["type", "uri"],
    ),
  ],
} satisfies JsonSchema;

/** 内容既可以是纯文本，也可以是内容块数组。 */
export const modelMessageContentJsonSchema = {
  oneOf: [stringProperty(), { type: "array", items: modelMessageContentBlockJsonSchema }],
} satisfies JsonSchema;

export const modelInputMessageJsonSchema = objectSchema(
  {
    role: valueEnum(["system", "user", "assistant", "tool"]),
    content: modelMessageContentJsonSchema,
    cacheControl: objectSchema(
      {
        type: valueEnum(["ephemeral"]),
        ttl: valueEnum(["5m", "1h"]),
        scope: valueEnum(["global", "org"]),
      },
      ["type"],
    ),
    toolCalls: arrayProperty(),
    toolCallId: stringProperty(),
    toolName: stringProperty(),
    isError: booleanProperty(),
    providerId: nonEmptyString(),
    modelId: nonEmptyString(),
  },
  ["role", "content"],
);

export const modelToolChoiceJsonSchema = {
  oneOf: [
    valueEnum(["auto", "none", "required"]),
    objectSchema({ type: valueEnum(["tool"]), toolName: nonEmptyString() }, ["type", "toolName"]),
  ],
} satisfies JsonSchema;

export const modelTextRequestJsonSchema = objectSchema(
  {
    messages: arrayProperty(modelInputMessageJsonSchema),
    tools: arrayProperty(),
    toolChoice: modelToolChoiceJsonSchema,
    temperature: numberProperty(),
    maxOutputTokens: numberProperty(),
    topP: numberProperty(),
    topK: numberProperty(),
    presencePenalty: numberProperty(),
    frequencyPenalty: numberProperty(),
    stopSequences: arrayProperty(stringProperty()),
    seed: numberProperty(),
    responseJsonSchema: objectProperty(),
    providerOptions: objectProperty(),
    metadata: objectProperty(),
  },
  ["messages"],
);

/** 网络状态事件的必填字段；写成一段清单再切开，顺序即既有顺序。 */
const NETWORK_STATUS_REQUIRED_FIELDS =
  "type timestamp traceId requestId model transport attempt maxAttempts".split(" ");

/** 网络状态事件的 schema：允许额外字段，因为事件可能带新的诊断键。 */
export const modelNetworkStatusEventJsonSchema = objectSchema(
  {
    type: valueEnum([
      "model_request_started",
      "model_request_completed",
      "model_request_failed",
      "model_retry_scheduled",
      "model_stream_stalled",
    ]),
    timestamp: nonEmptyString(),
    traceId: nonEmptyString(),
    sessionId: nonEmptyString(),
    turnId: nonEmptyString(),
    querySource: nonEmptyString(),
    requestId: nonEmptyString(),
    model: modelSelectionJsonSchema,
    transport: valueEnum(Object.values(ModelTransportKind)),
    attempt: boundedNumber(1),
    // 0 = 无上限重试预算，故下界是 0 而不是 1。
    maxAttempts: boundedNumber(0),
    delayMs: boundedNumber(0),
    durationMs: boundedNumber(0),
    idleMs: boundedNumber(0),
    nextAttempt: boundedNumber(1),
    reason: valueEnum(Object.values(ModelFailureReason)),
    retryable: booleanProperty(),
    message: stringProperty(),
    statusCode: numberProperty(),
    requestHeaders: stringMapProperty(),
    responseHeaders: stringMapProperty(),
    requestHeaderCount: boundedNumber(0),
    responseHeaderCount: boundedNumber(0),
    streamRecovery: objectSchema(
      {
        attemptId: nonEmptyString(),
        retryNumber: boundedNumber(1),
        maxRetries: boundedNumber(0),
        recoveredFromRequestId: nonEmptyString(),
        anchorId: nonEmptyString(),
      },
      ["attemptId", "retryNumber", "maxRetries"],
    ),
    timeoutMs: boundedNumber(0),
  },
  NETWORK_STATUS_REQUIRED_FIELDS,
  true,
);
