import { z } from "zod";

export const localDiagnosticRequestSchema = z.object({
  inspection: z.enum(["complete", "checking", "failed"]),
  kernels: z.array(z.object({
    id: z.string().min(1).max(96).refine((id) => !id.startsWith("ssh:") && !/[\\/]/.test(id)),
    name: z.string().min(1).max(120),
    installed: z.boolean(),
    version: z.string().max(80).optional(),
    origin: z.enum(["builtin", "managed", "external", "missing"]),
  }).strict()).max(64),
}).strict();

export type LocalDiagnosticRequest = z.infer<typeof localDiagnosticRequestSchema>;

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
