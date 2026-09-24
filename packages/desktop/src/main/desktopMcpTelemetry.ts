import type { KnorviaMcpTelemetryEvent } from "@knorvia/shared";

/** Protocol compatibility only: the independent desktop has no product telemetry sink. */
export function reportMcpTelemetryToArms(
  _event: KnorviaMcpTelemetryEvent,
  _runtimeSurface: "local" | "remote",
): void {}
