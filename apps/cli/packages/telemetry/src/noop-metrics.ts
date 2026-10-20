// SPDX-License-Identifier: Apache-2.0
// 什么都不记的指标实现。
//
// 未启用遥测时借给运行时；调用点因此不需要判空，也不会因为观测缺席改变执行路径。
// 对象按方法名表生成：契约加一个入口，这里只要补一个名字。
import type { AgentTelemetryMetricRecorder } from "./metrics-contract.js";

/** 记录器的六个入口名，顺序与契约声明一致。 */
const SILENT_METHODS = [
  "recordCommandFirstOutput",
  "recordCreationDrop",
  "recordModelAttemptDetail",
  "recordModelCallAttempts",
  "recordModelTokenDelta",
  "recordSpanTerminal",
] as const;

/** 所有入口共享的空实现：吞掉实参，返回 undefined。 */
function silent(): undefined {
  return undefined;
}

function buildSilentRecorder(): AgentTelemetryMetricRecorder {
  const recorder: Record<string, unknown> = {};
  for (const name of SILENT_METHODS) recorder[name] = silent;
  return recorder as unknown as AgentTelemetryMetricRecorder;
}

/** 六个入口都是空操作：没有状态，可以安全共享同一实例。 */
export const NOOP_AGENT_TELEMETRY_METRICS = buildSilentRecorder();
