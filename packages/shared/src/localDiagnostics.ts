import { z } from "zod";

/**
 * 分层探测的阶段顺序（opt-in 诊断字段）。`packages/services` 的
 * `adapters/kernels/probeResult.ts` 导出 `PROBE_STAGES` 是唯一词表；
 * 这里只为诊断请求的形状固定同样的键与顺序，不复制任何探测行为。
 */
export const LOCAL_DIAGNOSTIC_PROBE_STAGES = ["locate", "version", "protocol", "auth"] as const;

const localDiagnosticProbeStageSchema = z
  .object({
    status: z.enum(["ok", "failed", "skipped", "cancelled", "timeout"]),
    code: z.string().min(1).max(64).optional(),
    reason: z.string().min(1).max(240).optional(),
    ms: z.number().int().min(0).max(600_000),
  })
  .strict();

const localDiagnosticProbeSchema = z
  .object({
    stages: z
      .object({
        locate: localDiagnosticProbeStageSchema,
        version: localDiagnosticProbeStageSchema,
        protocol: localDiagnosticProbeStageSchema,
        auth: localDiagnosticProbeStageSchema,
      })
      .strict(),
    durationMs: z.number().int().min(0).max(600_000),
    probedAt: z.number().int().min(0).max(8_640_000_000_000_000),
    cached: z.boolean().optional(),
  })
  .strict();

export const localDiagnosticRequestSchema = z
  .object({
    inspection: z.enum(["complete", "checking", "failed"]),
    kernels: z
      .array(
        z
          .object({
            id: z
              .string()
              .min(1)
              .max(96)
              .refine((id) => !id.startsWith("ssh:") && !/[\\/]/.test(id)),
            name: z.string().min(1).max(120),
            installed: z.boolean(),
            version: z.string().max(80).optional(),
            origin: z.enum(["builtin", "managed", "external", "missing"]),
            /** 用户显式勾选诊断阶段时才带上；缺失即不导出阶段信息。 */
            probe: localDiagnosticProbeSchema.optional(),
          })
          .strict(),
      )
      .max(64),
  })
  .strict();

export type LocalDiagnosticRequest = z.infer<typeof localDiagnosticRequestSchema>;
export type LocalDiagnosticProbe = NonNullable<LocalDiagnosticRequest["kernels"][number]["probe"]>;
export type LocalDiagnosticProbeStage = LocalDiagnosticProbe["stages"]["locate"];

export interface LocalDiagnosticPreviewFile {
  path: string;
  bytes: number;
  sha256: string;
  snippet: string;
  snippetTruncated: boolean;
}

export interface LocalDiagnosticPreview {
  id: string;
  createdAt: string;
  files: LocalDiagnosticPreviewFile[];
}

export interface LocalDiagnosticExportResult {
  success: boolean;
  path?: string;
  error?: string;
}
