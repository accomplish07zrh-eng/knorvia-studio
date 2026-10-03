// Selected public reference types/ports only; opaque actual schemas and helpers, no standalone semantic closure.
// Original public port/type owner: apps/cli/packages/contracts/src/tools/create-workflow.ts
import { z } from "zod";
export type CreateWorkflowDiagnostic = z.infer<typeof CreateWorkflowDiagnosticSchema>;
export declare const CreateWorkflowDiagnosticSchema: any;

