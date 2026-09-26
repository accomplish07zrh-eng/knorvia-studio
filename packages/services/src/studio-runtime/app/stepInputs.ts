import type { StudioStepInput, StudioWorkspacePort } from "./ports.js";

/**
 * 把已核验的上游输出导入本次运行的隔离工作区。
 *
 * 从 `turnExecutor.ts` 拆出来只为让它留在架构策略的行数上限内；语义不变：
 * - 只对隔离工作区生效（共享项目模式下游直接看同一个项目，不需要复制）；
 * - 宿主没有实现窄范围导入能力时**失败关闭**，不退化为让下游去读上游路径；
 * - 落点：`workspace-file` 用上游相对路径，`creation-output` 用引用给出的固定落点。
 */
export async function importStudioStepInputs(params: {
  workspaces: StudioWorkspacePort;
  runId: string;
  stepId: string;
  inputs: readonly StudioStepInput[];
  isolated: boolean;
}): Promise<void> {
  if (!params.inputs.length || !params.isolated) return;
  const importReference = params.workspaces.importReference?.bind(params.workspaces);
  if (!importReference) throw new Error("宿主不支持跨隔离输入导入，无法把上游输出交给下游步骤。");
  for (const input of params.inputs)
    await importReference({
      runId: params.runId,
      stepId: params.stepId,
      relativePath: input.kind === "workspace-file" ? input.relativePath : input.targetPath,
      source:
        input.kind === "workspace-file"
          ? {
              kind: "workspace-file",
              sourceRunId: input.sourceRunId,
              sourceStepId: input.sourceStepId,
              ...(input.sha256 ? { expectedSha256: input.sha256 } : {}),
            }
          : {
              kind: "creation-output",
              sourcePath: input.sourcePath,
              sha256: input.sha256,
            },
    });
}
