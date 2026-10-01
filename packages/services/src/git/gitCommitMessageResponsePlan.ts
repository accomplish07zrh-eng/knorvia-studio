// Source-exposed validation structure. Grammar, decorations, trim/slice and preview
// expressions are retained compatibility content; no new output policy.
type Validation =
  | { ok: true; message: string }
  | { ok: false; reason: "empty" | "invalid"; preview?: string };

const CONVENTIONAL_COMMIT_RE =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?: .{1,100}$/;

const DECORATION_STEPS: readonly ((value: string) => string)[] = [
  (value) => /^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/.exec(value)?.[1] ?? value,
  (value) => value.replace(/^commit message:\s*/i, "").trim(),
  (value) =>
    (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))
      ? value.slice(1, -1)
      : value,
];

const REJECTION_STEPS: readonly ((message: string) => Extract<Validation, { ok: false }> | null)[] =
  [
    (message) => (!message ? { ok: false, reason: "empty" } : null),
    (message) => {
      const subject = message.split(/\r?\n/, 1)[0]?.trim() ?? "";
      return CONVENTIONAL_COMMIT_RE.test(subject)
        ? null
        : { ok: false, reason: "invalid", preview: subject || message.slice(0, 120) };
    },
  ];

export function interpretGitCommitMessageResponse(rawMessage: string): Validation {
  let decorated = rawMessage.trim();
  for (const transform of DECORATION_STEPS) decorated = transform(decorated);
  const message = decorated.trim().slice(0, 1_000).trim();
  for (const reject of REJECTION_STEPS) {
    const rejection = reject(message);
    if (rejection) return rejection;
  }
  return { ok: true, message };
}
