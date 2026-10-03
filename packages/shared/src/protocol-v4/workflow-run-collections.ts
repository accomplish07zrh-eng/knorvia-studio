export interface WorkflowInstanceIdentity {
  siteId: string;
  ordinal: number;
}

export function workflowRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function workflowText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function workflowReference(value: unknown): WorkflowInstanceIdentity | undefined {
  const fields = workflowRecord(value);
  if (!fields) return undefined;
  const siteId = workflowText(fields.siteId);
  const ordinal = fields.ordinal;
  if (siteId === undefined || typeof ordinal !== "number") return undefined;
  return { siteId, ordinal };
}

export function sameWorkflowInstance(
  left: WorkflowInstanceIdentity,
  right: WorkflowInstanceIdentity,
): boolean {
  return left.siteId === right.siteId && left.ordinal === right.ordinal;
}

export function workflowPreview(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/** 本次转换的只读输入表；统一做首槽替换/拒新，身份相等仍由所属表明确给定。 */
export class BoundedWorkflowRows<Row, Identity> {
  constructor(
    private readonly source: readonly Row[],
    private readonly limit: number,
    private readonly identity: (row: Row) => Identity,
    private readonly equals: (left: Identity, right: Identity) => boolean,
  ) {}

  lookup(key: Identity): Row | undefined {
    const slot = this.position(key);
    return slot < 0 ? undefined : this.source[slot];
  }

  write(row: Row): { rows: Row[]; newIdentity: boolean; overflow: boolean } {
    const slot = this.position(this.identity(row));
    const rows = [...this.source];
    const newIdentity = slot < 0;
    const overflow = newIdentity && this.source.length >= this.limit;
    if (!newIdentity) rows[slot] = row;
    else if (!overflow) rows.push(row);
    return { rows, newIdentity, overflow };
  }

  private position(key: Identity): number {
    return this.source.findIndex((row) => this.equals(this.identity(row), key));
  }
}
