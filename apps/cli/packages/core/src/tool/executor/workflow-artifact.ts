import { serializeWorkflowArtifact } from "@knorvia/contracts";
export { serializeWorkflowArtifact };

interface WorkflowReportsNotificationSection {
  count: number;
  shown: number;
  preview: string;
}

function reportText(item: unknown, maximum: number): string {
  const serialized = serializeWorkflowArtifact(item) ?? "";
  return serialized.length <= maximum ? serialized : serialized.slice(0, maximum - 1) + "…";
}

export function buildWorkflowReportsNotificationSection(
  items: readonly unknown[] | undefined,
): WorkflowReportsNotificationSection | undefined {
  if (items === undefined || items.length === 0) return undefined;
  const lines: string[] = [];
  let charged = 0;
  for (const [index, item] of items.entries()) {
    const line = `[${index + 1}] ${reportText(item, 2000)}`;
    const cost = line.length + 1;
    if (lines.length > 0 && charged + cost > 8000) break;
    lines.push(line);
    charged += cost;
  }
  return { count: items.length, shown: lines.length, preview: lines.join("\n") };
}

export function buildWorkflowReportsManifestSection(
  items: readonly unknown[] | undefined,
): { count: number; shown: number; preview: string[] } | undefined {
  if (items === undefined || items.length === 0) return undefined;
  const preview: string[] = [];
  for (const item of items) {
    if (preview.length === 8) break;
    preview.push(reportText(item, 500));
  }
  return { count: items.length, shown: preview.length, preview };
}
