// Reuses the source-exposed archived caller; every port, clock and row is synthetic.
import assert from "node:assert/strict";
import {
  archive,
  emitted,
  entry,
  sha,
  clock,
  detail,
  errorShape,
  json,
  executorFixture,
  normalized,
} from "./workflow-run-summary-fixture.js";
export { entry, sha };
const compiled = archive.consumer.compiled.replace(
  /from "([^"]+)"/gu,
  (_match: string, specifier: string) => {
    const url = specifier.startsWith(".")
      ? new URL(
          specifier.replace(/\.js$/u, emitted ? ".js" : ".ts"),
          new URL(
            `../${emitted ? "dist" : "src"}/tool/handlers/get-workflow-run.${emitted ? "js" : "ts"}`,
            import.meta.url,
          ),
        ).href
      : import.meta.resolve(specifier);
    return `from ${JSON.stringify(url)}`;
  },
);
assert.equal(sha(archive.consumer.source), archive.consumer.sourceSha256);
assert.equal(sha(archive.consumer.compiled), archive.consumer.compiledSha256);
// Unlike the older summary freeze, this caller links to the accepted current summary.
export const baseline = (
  await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`)
).getWorkflowRunToolEntry;
export const rowCases = [
  "normal",
  "omitted",
  "empty",
  "sparse",
  "artifact-cap",
  "error-null",
  "questions-null",
  "question-map",
  "artifacts-null",
  "artifact-slice",
  "versions-null",
  "versions-empty",
  "error-parent",
  "provider-stop",
  "questions-parent",
  "artifacts-parent",
  "actor-name",
  "latest-bytes",
  "strict-primary",
  "question-throw",
  "bytes-throw",
] as const;
export function rows(kind: string) {
  const tape: any[] = [],
    counts = new Map<string, number>(),
    failure = new Error("Synthetic output field failure");
  let clockReads = 0,
    calls = 0;
  const read = (key: string, value: any) => {
    tape.push(key);
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (
      (kind === "question-throw" && key === "question.question") ||
      (kind === "bytes-throw" && key === "latest.bytes" && n === 2)
    )
      throw failure;
    if (kind === "provider-stop" && key === "error.providerStop") return n === 1 ? {} : undefined;
    if (kind === "actor-name" && key === "question.actorName")
      return n === 1 ? "Synthetic" : undefined;
    if (kind === "latest-bytes" && key === "latest.bytes") return n;
    return value;
  };
  const watch = (value: any, prefix: string) =>
    new Proxy(value, {
      get(t, k, r) {
        return read(`${prefix}.${String(k)}`, Reflect.get(t, k, r));
      },
    });
  const question = watch(
    {
      qid: "synthetic-q",
      actor: "synthetic-actor",
      actorName: "",
      question: "Synthetic question?",
      context: "",
      askedAt: 0,
    },
    "question",
  );
  const latest = watch({ bytes: 4 }, "latest");
  const artifact = watch(
    {
      id: "synthetic-artifact",
      kind: "file",
      title: "Synthetic artifact",
      version: 1,
      contentType: "text/plain",
      sourcePath: "synthetic.txt",
      itemCount: 1,
      versions: kind === "versions-null" ? null : kind === "versions-empty" ? [] : [latest],
      primary: kind === "strict-primary" ? 1 : true,
    },
    "artifact",
  );
  const map = (items: any[], key: string) => {
    const target = [...items];
    target.map = function (this: any, fn: any) {
      assert.equal(this, target);
      tape.push([key, fn.length, fn.name]);
      return Array.prototype.map.call(this, fn);
    };
    return target;
  };
  let questions: any = map([question], "questions.map"),
    artifacts: any = [artifact];
  artifacts.slice = function (this: any, ...args: any[]) {
    assert.equal(this, artifacts);
    tape.push(["artifacts.slice", ...args]);
    return map(Array.prototype.slice.apply(this, args), "artifacts.map");
  };
  if (kind === "sparse") {
    delete questions[0];
    delete artifacts[0];
  }
  if (kind === "artifact-cap") artifacts = Array.from({ length: 33 }, () => artifact);
  if (kind === "questions-null") questions = null;
  if (kind === "question-map") questions = { length: 1, map: 7 };
  if (kind === "artifacts-null") artifacts = null;
  if (kind === "artifact-slice") artifacts = { length: 1, slice: 7 };
  const error = watch(
    { code: "Synthetic", message: "Synthetic failure", providerStop: undefined },
    "error",
  );
  const target: any = {
    ...detail,
    error: kind === "error-null" ? null : error,
    pendingQuestions: questions,
    artifacts,
  };
  if (kind === "omitted")
    for (const key of ["error", "pendingQuestions", "artifacts"]) target[key] = undefined;
  if (kind === "empty") {
    target.pendingQuestions = [];
    target.artifacts = [];
  }
  const snapshot = new Proxy(target, {
    get(t, k, r) {
      const value = read(`detail.${String(k)}`, Reflect.get(t, k, r));
      const n = counts.get(`detail.${String(k)}`);
      if (kind === "error-parent" && k === "error")
        return watch(
          { code: `Synthetic${n}`, message: `Synthetic${n}`, providerStop: undefined },
          "error",
        );
      if (kind === "questions-parent" && k === "pendingQuestions" && n === 2) return { length: 1 };
      if (kind === "artifacts-parent" && k === "artifacts" && n === 2) return { length: 1 };
      return value;
    },
  });
  const port = {
    getRunDetail(this: any, ...args: any[]) {
      assert.equal(this, port);
      assert.deepEqual(args, ["synthetic-run"]);
      calls++;
      tape.push("journal");
      return snapshot;
    },
  };
  const OriginalNow = Date.now;
  Date.now = () => {
    clockReads++;
    tape.push("clock");
    return OriginalNow();
  };
  return {
    tape,
    failure,
    port,
    counts,
    restore: () => {
      Date.now = OriginalNow;
    },
    clocks: () => clockReads,
    calls: () => calls,
  };
}
export async function observe(kind: string, selected = entry, throughExecutor = false) {
  return clock(async () => {
    const f = rows(kind);
    try {
      let outcome: any;
      if (throughExecutor) {
        const consumer = executorFixture({}, selected);
        consumer.deps.dynamicWorkflowRunPort = f.port as any;
        outcome = normalized(consumer, await consumer.execute());
        assert.equal(consumer.terminal().length, 1);
      } else {
        try {
          const output = await selected.handler(
            { run_id: "synthetic-run" },
            {
              dynamicWorkflowRunPort: f.port,
              workingDirectory: ".",
            },
          );
          outcome = {
            output: json(output),
            keys: Object.keys(output),
            errorKeys: output.error && Object.keys(output.error),
            questionKeys: output.pendingQuestions?.map((v: any) => Object.keys(v)),
            artifactKeys: output.artifacts?.map((v: any) => Object.keys(v)),
            model: selected.formatModelContent(output),
          };
        } catch (error) {
          outcome = { error: errorShape(error), sameFailure: error === f.failure };
        }
      }
      return json({ outcome, tape: f.tape, calls: f.calls(), clocks: f.clocks() });
    } finally {
      f.restore();
    }
  });
}
