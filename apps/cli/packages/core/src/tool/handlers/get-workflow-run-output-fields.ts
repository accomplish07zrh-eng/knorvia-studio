import type { DynamicWorkflowRunDetail, GetWorkflowRunOutput } from "@knorvia/contracts";

type Admission = "required" | "defined" | "nonempty" | "truthy" | "true";
type Field<T extends object> = readonly [
  key: keyof T,
  read: () => unknown,
  admission?: Admission,
  project?: () => unknown,
];

// 一个同步字段程序：先决定是否在场，再求值；可选值的两次读取不能合并。
export function applyWorkflowRunOutputFields<T extends object>(
  seed: Partial<T>,
  fields: readonly Field<T>[],
): T {
  for (const [key, read, admission = "required", project = read] of fields) {
    let accepted: boolean;
    switch (admission) {
      case "required":
        accepted = true;
        break;
      case "defined":
        accepted = read() !== undefined;
        break;
      case "nonempty":
        accepted = read() !== undefined && (read() as { length: number }).length !== 0;
        break;
      case "truthy":
        accepted = !!read();
        break;
      case "true":
        accepted = read() === true;
        break;
    }
    if (accepted) {
      // 冻结反例证明普通赋值会触发继承 setter；原对象字面量创建的是自有数据属性。
      Object.defineProperty(seed, key, {
        value: project(),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  }
  return seed as T;
}

export function projectWorkflowRunError(detail: DynamicWorkflowRunDetail) {
  return applyWorkflowRunOutputFields<NonNullable<GetWorkflowRunOutput["error"]>>({}, [
    ["code", () => detail.error!.code],
    ["message", () => detail.error!.message],
    ["providerStop", () => detail.error!.providerStop, "defined"],
  ]);
}

export function projectWorkflowRunQuestion(
  pending: NonNullable<DynamicWorkflowRunDetail["pendingQuestions"]>[number],
) {
  return applyWorkflowRunOutputFields<
    NonNullable<GetWorkflowRunOutput["pendingQuestions"]>[number]
  >({}, [
    ["qid", () => pending.qid],
    ["actor", () => pending.actor],
    ["actorName", () => pending.actorName, "defined"],
    ["question", () => pending.question],
    ["context", () => pending.context, "defined"],
    ["askedAt", () => pending.askedAt],
  ]);
}

export function projectWorkflowRunArtifact(
  artifact: NonNullable<DynamicWorkflowRunDetail["artifacts"]>[number],
) {
  const latest = artifact.versions[artifact.versions.length - 1];
  return applyWorkflowRunOutputFields<NonNullable<GetWorkflowRunOutput["artifacts"]>[number]>({}, [
    ["id", () => artifact.id],
    ["kind", () => artifact.kind],
    ["title", () => artifact.title, "defined"],
    ["version", () => artifact.version],
    ["contentType", () => artifact.contentType, "defined"],
    ["bytes", () => latest?.bytes, "defined", () => latest.bytes],
    ["sourcePath", () => artifact.sourcePath, "defined"],
    ["itemCount", () => artifact.itemCount],
    ["primary", () => artifact.primary, "true", () => true],
  ]);
}
