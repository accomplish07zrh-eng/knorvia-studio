// SPDX-License-Identifier: Apache-2.0
// 渲染器动作追踪的线格式：OTLP/HTTP 导出、配置、span 与批次的严格 schema。
// 服务名、批量上限、目录分组与各字段枚举取值在 ./rendererActionTrace-data.js。

import { z } from "zod";
import {
  DISABLED_RENDERER_ACTION_TRACE_CONFIG as DISABLED_CONFIG_DATA,
  RENDERER_ACTION_TRACE_ADMISSION_RESULTS,
  RENDERER_ACTION_TRACE_AUTOMATION_KINDS,
  RENDERER_ACTION_TRACE_DEPLOYMENT_ENVIRONMENTS,
  RENDERER_ACTION_TRACE_GROUPS,
  RENDERER_ACTION_TRACE_MAX_BATCH_BYTES,
  RENDERER_ACTION_TRACE_MAX_BATCH_SPANS,
  RENDERER_ACTION_TRACE_MAX_SAMPLE_RATIO,
  RENDERER_ACTION_TRACE_OPERATION_KINDS,
  RENDERER_ACTION_TRACE_OUTCOMES,
  RENDERER_ACTION_TRACE_REMOTE_KINDS,
  RENDERER_ACTION_TRACE_RESULT_SOURCES,
  RENDERER_ACTION_TRACE_SERVICE_NAME,
  RENDERER_ACTION_TRACE_SPAN_STATUSES,
  RENDERER_ACTION_TRACE_STATE_AFTER,
  RENDERER_ACTION_TRACE_TRIGGERS,
  RENDERER_ACTION_TRACE_WORKSPACE_KINDS,
} from "./rendererActionTrace-data.js";

export {
  RENDERER_ACTION_TRACE_MAX_BATCH_BYTES,
  RENDERER_ACTION_TRACE_MAX_BATCH_SPANS,
  RENDERER_ACTION_TRACE_MAX_SAMPLE_RATIO,
  RENDERER_ACTION_TRACE_SERVICE_NAME,
};

/** 目录组是 UI 侧的稳定分区；新增分组要同时改采样配置的默认值。 */
export const rendererActionTraceGroupSchema = z.enum(RENDERER_ACTION_TRACE_GROUPS);

export type RendererActionTraceGroup = z.output<typeof rendererActionTraceGroupSchema>;

const groupCount = RENDERER_ACTION_TRACE_GROUPS.length;

const IDENTIFIER_CHARS = new RegExp("^[A-Za-z0-9._:-]{1,128}$", "u");
const VALUE_CHARS = new RegExp("^[A-Za-z0-9._:-]{1,64}$", "u");
const ANY_TEXT = new RegExp("^[\\s\\S]{1,128}$", "u");

const boundedText = (pattern: RegExp) => z.string().trim().regex(pattern);

const identifierSchema = () => boundedText(IDENTIFIER_CHARS);
const valueSchema = () => boundedText(VALUE_CHARS);
const uuid = () => z.string().uuid();
const hex = (length: 16 | 32) => z.string().regex(new RegExp(`^[0-9a-f]{${length}}$`, "u"));

const flag = () => z.boolean();
const optionalFlag = () => flag().optional();

const configShape = () => ({
  enabled: flag(),
  localTtftEnabled: optionalFlag(),
  sampleRatio: z.number().finite().min(0).max(RENDERER_ACTION_TRACE_MAX_SAMPLE_RATIO),
  enabledGroups: z.array(rendererActionTraceGroupSchema).max(groupCount),
  configVersion: boundedText(ANY_TEXT),
});

export const rendererActionTraceConfigSchema = z.object(configShape()).strict();

export type RendererActionTraceConfigV1 = z.output<typeof rendererActionTraceConfigSchema>;

export const DISABLED_RENDERER_ACTION_TRACE_CONFIG: RendererActionTraceConfigV1 =
  DISABLED_CONFIG_DATA;

/** 可选项统一在此登记；必需项单独列出，避免两者混排后看不出必填边界。 */
const optionalAttributes = () => ({
  result_source: z.enum(RENDERER_ACTION_TRACE_RESULT_SOURCES).optional(),
  failure_stage: identifierSchema().optional(),
  state_after: z.enum(RENDERER_ACTION_TRACE_STATE_AFTER).optional(),
  configured: optionalFlag(),
  requires_restart: optionalFlag(),
  section_id: identifierSchema().optional(),
  value_after: valueSchema().optional(),
  workspace_kind: z.enum(RENDERER_ACTION_TRACE_WORKSPACE_KINDS).optional(),
  remote_kind: z.enum(RENDERER_ACTION_TRACE_REMOTE_KINDS).optional(),
  admission_result: z.enum(RENDERER_ACTION_TRACE_ADMISSION_RESULTS).optional(),
  automation_kind: z.enum(RENDERER_ACTION_TRACE_AUTOMATION_KINDS).optional(),
});

const attributeShape = () => ({
  feature_id: identifierSchema(),
  action: identifierSchema(),
  catalog_group: rendererActionTraceGroupSchema,
  operation_kind: z.enum(RENDERER_ACTION_TRACE_OPERATION_KINDS),
  surface: identifierSchema(),
  trigger: z.enum(RENDERER_ACTION_TRACE_TRIGGERS),
  outcome: z.enum(RENDERER_ACTION_TRACE_OUTCOMES),
  ...optionalAttributes(),
  action_id: uuid(),
});

export const rendererActionTraceAttributesSchema = z.object(attributeShape()).strict();

export type RendererActionTraceAttributes = z.output<typeof rendererActionTraceAttributesSchema>;

const spanWindowOk = (span: { startTimeUnixMs: number; endTimeUnixMs: number }): boolean =>
  span.endTimeUnixMs >= span.startTimeUnixMs;

const timestamp = () => z.number().finite().nonnegative();

const spanFields = () => ({
  traceId: hex(32),
  spanId: hex(16),
  name: z.literal("ui_action"),
  startTimeUnixMs: timestamp(),
  endTimeUnixMs: timestamp(),
  status: z.enum(RENDERER_ACTION_TRACE_SPAN_STATUSES),
  attributes: rendererActionTraceAttributesSchema,
});

const spanObjectSchema = z.object(spanFields()).strict();

export const rendererActionTraceSpanSchema = spanObjectSchema.superRefine((span, context) => {
  if (spanWindowOk(span as { startTimeUnixMs: number; endTimeUnixMs: number })) return;
  context.addIssue({
    code: "custom",
    message: "endTimeUnixMs must be greater than or equal to startTimeUnixMs",
    path: ["endTimeUnixMs"],
  });
});

export type RendererActionTraceSpanV1 = z.output<typeof rendererActionTraceSpanSchema>;

const resourceShape = () => ({
  serviceName: z.literal(RENDERER_ACTION_TRACE_SERVICE_NAME),
  serviceVersion: identifierSchema(),
  deploymentEnvironment: z.enum(RENDERER_ACTION_TRACE_DEPLOYMENT_ENVIRONMENTS),
  rendererInstanceId: identifierSchema(),
});

export const rendererActionTraceResourceSchema = z.object(resourceShape()).strict();

export type RendererActionTraceResourceV1 = z.output<typeof rendererActionTraceResourceSchema>;

const counter = () => z.number().int().nonnegative();

const batchFields = () => ({
  version: z.literal(1),
  rendererInstanceId: identifierSchema(),
  sequence: counter(),
  droppedSinceLastFlush: counter(),
  resource: rendererActionTraceResourceSchema,
  spans: z.array(rendererActionTraceSpanSchema).max(RENDERER_ACTION_TRACE_MAX_BATCH_SPANS),
});

const batchObjectSchema = z.object(batchFields()).strict();

type BatchWindow = { rendererInstanceId: string; resource: { rendererInstanceId: string } };

export const rendererActionTraceBatchSchema = batchObjectSchema.superRefine((batch, context) => {
  const checked = batch as BatchWindow;
  if (checked.resource.rendererInstanceId === checked.rendererInstanceId) return;
  context.addIssue({
    code: "custom",
    message: "rendererInstanceId must match the resource",
    path: ["resource", "rendererInstanceId"],
  });
});

export type RendererActionTraceBatchV1 = z.output<typeof rendererActionTraceBatchSchema>;
