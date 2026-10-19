// SPDX-License-Identifier: Apache-2.0
import { REPORT_CAPS } from "../facade/report-caps.js";
import { declaredPresetIds, isDeclaredPreset } from "./engine-artifacts.js";
import type { EngineState } from "./engine-state.js";
import { inputHash } from "./hash.js";
import { hashMismatch } from "./scheduler.js";
import type { InstanceRef } from "./types.js";
import { refToString, WorkflowError } from "./types.js";

// 一次 report 调用的全部输入；内部阶段共享它，避免同一组参数在函数间反复传递。
type ReportDraft = {
  engine: EngineState;
  at: InstanceRef;
  item: unknown;
  tag: string | undefined;
};

// 准备阶段的归宿：已经落过库、获准落库、或一条要交给 failRun 的错误。
type Prepared =
  | { stage: "replay" }
  | { stage: "record"; fingerprint: string }
  | { stage: "refuse"; error: WorkflowError };

// JSON 探针的两种终点：可度量的文本，或一条待上报的失败。
type Snapshot = { text: string } | { fault: WorkflowError };

// stringify 一次回答两件事：item 能否被 JSON 表示，以及用于字节上限的文本。
// 放在 canonicalJson 之前——环与 BigInt 会抛错，undefined / 函数 / symbol 返回 undefined，
// 两种残缺都必须在这里变成可读失败，而不是被全函数的 canonicalJson 折成 "null"。
function inspectJson(item: unknown, where: string): Snapshot {
  try {
    const text = JSON.stringify(item);
    if (text !== undefined) return { text };
  } catch (failure) {
    const detail = `report() item cannot be serialized to JSON (a cycle or a bigint) at ${where}. Report a plain JSON value.`;
    return { fault: new WorkflowError("DriverError", detail, { cause: failure }) };
  }
  const detail = `report() item is not a JSON value (undefined, a function or a symbol) at ${where}. Report a plain JSON value.`;
  return { fault: new WorkflowError("DriverError", detail) };
}

// 标签只能指向已声明的预置：看板是 journal 的投影，未声明的 id 永远投影不出点。
function requireDeclaredPreset(
  engine: EngineState,
  tag: string,
  where: string,
): WorkflowError | undefined {
  if (!isDeclaredPreset(engine, tag)) {
    const known = declaredPresetIds(engine);
    const list = known.length === 0 ? "(none)" : known.join(", ");
    const detail = `report() tag "${tag}" is not a declared preset artifact (at ${where}). Declare it once at the top of the script, e.g. artifact.chart("${tag}", …), before tagging reports with it. Declared presets: ${list}.`;
    return new WorkflowError("ArtifactUndeclared", detail);
  }
}

// 两道上限：单条按 UTF-8 字节，run 级按条数。都通过才占掉本 run 的一个名额。
function reserveReport(
  engine: EngineState,
  where: string,
  text: string,
): WorkflowError | undefined {
  const { maxItemSerializedBytes: byteLimit, maxItemsPerRun: countLimit } = REPORT_CAPS;
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > byteLimit) {
    const detail = `report() item at ${where} is ${bytes} bytes, over the ${byteLimit}-byte limit. Report a summary instead.`;
    return new WorkflowError("ReportCapExceeded", detail);
  }
  if (engine.reportCount() >= countLimit) {
    const detail = `This run already reported ${countLimit} items, the maximum. Report findings, not chatter.`;
    return new WorkflowError("ReportCapExceeded", detail);
  }
  engine.countReport();
}

// 判定分三步：探针 → replay 比对 → 标签与上限。返回结论，不在这里改写 run 状态。
function prepareReport(draft: ReportDraft): Prepared {
  const { engine, at, item, tag } = draft;
  const where = refToString(at);
  const snapshot = inspectJson(item, where);
  if ("fault" in snapshot) return { stage: "refuse", error: snapshot.fault };
  const fingerprint = inputHash(item);
  const prior = engine.journal.getNode(engine.runId, at.siteId, at.ordinal);
  if (prior !== undefined) {
    return prior.inputHash === fingerprint
      ? { stage: "replay" }
      : { stage: "refuse", error: hashMismatch(at, prior.inputHash, fingerprint) };
  }
  const tagFault = tag === undefined ? undefined : requireDeclaredPreset(engine, tag, where);
  const refusal = tagFault ?? reserveReport(engine, where, snapshot.text);
  return refusal === undefined
    ? { stage: "record", fingerprint }
    : { stage: "refuse", error: refusal };
}

// 一次写：completed 行与 report 事件成对出现，可选的标签同时进入两边。
function commitReport(draft: ReportDraft, fingerprint: string): void {
  const { engine, at, item, tag } = draft;
  const marker = tag === undefined ? {} : { artifactId: tag };
  const place = {
    runId: engine.runId,
    siteId: at.siteId,
    ordinal: at.ordinal,
    kind: "report" as const,
  };
  const body = { status: "completed" as const, inputHash: fingerprint, result: item };
  engine.journal.putNode({ ...place, ...body, ...marker });
  engine.record({ type: "report", instance: at, item, ...marker });
}

// 同步、即发即忘。标签刻意不进哈希：它是站点上的字面量，脚本哈希已保证同一站点不会换标签。
export function publishReport(
  state: EngineState,
  siteId: string,
  item: unknown,
  artifactId?: string,
): void {
  if (state.isRunSettled()) return;
  const draft: ReportDraft = {
    engine: state,
    at: { siteId, ordinal: state.nextOrdinal(siteId) },
    item,
    tag: artifactId,
  };
  const prepared = prepareReport(draft);
  if (prepared.stage === "refuse") state.failRun(prepared.error);
  else if (prepared.stage === "record") commitReport(draft, prepared.fingerprint);
}
