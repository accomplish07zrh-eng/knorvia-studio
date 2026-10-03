// Selected public reference types/ports only; opaque actual schemas and helpers, no standalone semantic closure.
// Original public port/type owner: apps/cli/packages/contracts/src/tools/saved-workflow.ts
import { z } from "zod";
export declare const SavedWorkflowMetaSchema: any;
export type SavedWorkflowMeta = z.infer<typeof SavedWorkflowMetaSchema>;

// Original yaml public identities, existing locked package; return data is schema-owned.
export declare function parseYaml(value: string): unknown;
export declare function stringifyYaml(value: unknown): string;
