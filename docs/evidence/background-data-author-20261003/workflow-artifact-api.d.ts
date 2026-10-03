import { serializeWorkflowArtifact } from "@knorvia/contracts";
export { serializeWorkflowArtifact };
interface WorkflowReportsNotificationSection {
  count: number;
  shown: number;
  preview: string;
}
export declare function buildWorkflowReportsNotificationSection(
  items: readonly unknown[] | undefined,
): WorkflowReportsNotificationSection | undefined;
export declare function buildWorkflowReportsManifestSection(items: readonly unknown[] | undefined):
  | {
      count: number;
      shown: number;
      preview: string[];
    }
  | undefined;
