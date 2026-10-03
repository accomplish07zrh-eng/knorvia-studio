export function sessionRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function sessionString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function sessionInteger(value: unknown, minimum = 0): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum ? value : undefined;
}

export function normalizedHistoryText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}
