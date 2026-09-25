import type { StudioCommand, StudioCommandResult } from "../contract.js";
import { activeRunStates, validateStudioCommand, validWorkspace } from "../domain/validation.js";
import type { StudioConversation, StudioMessage } from "../types.js";
import type { StudioKernelConfig } from "../kernelTypes.js";
import type { StudioGroupDefinition, StudioWorkflowDefinition } from "../workflowTypes.js";
import type { StoredInteraction, StoredRun, StudioClock, StudioRepository } from "./storePort.js";
import { studioProjectKey } from "../domain/projectIdentity.js";
import { hasUnknownStudioRun } from "./runQueries.js";
import { recordGroupWorkspaceGeneration } from "./groupWorkspaceIdentity.js";
import { parseRemoteStudioKernelId } from "../domain/remoteAgentIdentity.js";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function admitStudioCommand(
  db: StudioRepository,
  clock: StudioClock,
  command: StudioCommand,
): StudioCommandResult {
  validateStudioCommand(command);
  return db.transaction(() => {
    const payload = canonical(command);
    const previous = db.read<{ payload: string; result: StudioCommandResult }>(
      "command",
      command.commandId,
    );
    if (previous) {
      if (previous.payload !== payload) throw new Error("同一请求编号不能提交不同操作");
      return previous.result;
    }
    const id = applyCommand(db, clock, command);
    const result = { id, revision: db.revision() + 1 };
    db.write("command", command.commandId, { payload, result });
    return result;
  });
}

function applyCommand(db: StudioRepository, clock: StudioClock, command: StudioCommand): string {
  const now = clock.now();
  switch (command.type) {
    case "configure":
      db.write("config", command.kernel, command.config);
      // 自定义 ACP 内核不是固定候选；索引与配置同事务提交，重开后仍能投影到界面。
      if (command.kernel.startsWith("acp:") || parseRemoteStudioKernelId(command.kernel))
        db.write("config-index", command.kernel, { id: command.kernel });
      return command.kernel;
    case "create-conversation": {
      const old = db.read<StudioConversation>("conversation", command.id);
      if (old) {
        if (old.kernel !== command.kernel || old.workspacePath !== command.workspacePath)
          throw new Error("会话已有独立的内核和项目，请新建会话");
        return old.id;
      }
      db.write<StudioConversation>("conversation", command.id, {
        id: command.id,
        kernel: command.kernel,
        workspacePath: command.workspacePath,
        title: "新对话",
        createdAt: now,
        updatedAt: now,
      });
      return command.id;
    }
    case "save-group":
    case "save-workflow": {
      const isGroup = command.type === "save-group";
      const definition = isGroup ? command.group : command.workflow;
      if (
        command.onlyIfAbsent &&
        db.read("deleted", `${isGroup ? "group" : "workflow"}:${definition.id}`)
      )
        return definition.id;
      if (command.onlyIfAbsent && db.read(isGroup ? "group" : "workflow", definition.id))
        return definition.id;
      if (command.baseUpdatedAt !== undefined) {
        // 多窗口或手机同时编辑时，只允许基于当前服务端版本的保存，拒绝静默覆盖他人修改。
        const current = db.read<{ updatedAt: number }>(
          isGroup ? "group" : "workflow",
          definition.id,
        );
        const label = isGroup ? "群聊" : "工作流";
        if (!current) throw new Error(`此${label}已被删除`);
        if (current.updatedAt !== command.baseUpdatedAt)
          throw new Error(`此${label}已在其他窗口修改，请重新打开后再保存`);
      }
      if (db.list<{ targetId: string }>("active").some((run) => run.targetId === definition.id)) {
        const previous = db.read<Record<string, unknown>>(
          isGroup ? "group" : "workflow",
          definition.id,
        );
        // 保存未改动的草稿不会改变运行快照；允许用户在成员忙碌时继续排队发言。
        if (
          previous &&
          canonical({ ...previous, updatedAt: 0 }) === canonical({ ...definition, updatedAt: 0 })
        )
          return definition.id;
        throw new Error("请先停止运行，再修改成员、项目或流程");
      }
      if (isGroup)
        recordGroupWorkspaceGeneration(
          db,
          clock,
          definition as StudioGroupDefinition,
          db.read<StudioGroupDefinition>("group", definition.id),
        );
      db.write(isGroup ? "group" : "workflow", definition.id, definition);
      return definition.id;
    }
    case "delete": {
      if (db.list<{ targetId: string }>("active").some((run) => run.targetId === command.id))
        throw new Error("请先停止运行，再删除");
      db.remove(command.kind, command.id);
      db.write("deleted", `${command.kind}:${command.id}`, { deletedAt: now });
      // Historical execution records remain available for audit; no native session files are deleted.
      return command.id;
    }
    case "send":
      return queueRun(db, clock, command);
    case "steer": {
      const run = requiredRun(db, command.runId);
      if (
        run.kind !== "group" ||
        !run.taskMode ||
        !activeRunStates.has(run.state) ||
        run.cancelRequested
      )
        throw new Error("当前群任务已结束，请发送新的消息");
      const id = clock.id();
      db.write("steering", id, { id, runId: run.id, text: command.text, state: "pending" }, run.id);
      db.write<StudioMessage>(
        "message",
        id,
        {
          id,
          runId: run.id,
          targetId: run.targetId,
          sender: "user",
          kind: "text",
          text: command.text,
          createdAt: now,
          updatedAt: now,
        },
        run.targetId,
      );
      return run.id;
    }
    case "cancel": {
      const run = requiredRun(db, command.runId);
      if (!activeRunStates.has(run.state)) return run.id;
      run.cancelRequested = true;
      if (run.state === "queued") {
        run.state = "cancelled";
        db.remove("active", run.id);
      }
      run.updatedAt = now;
      db.write("run", run.id, run, run.targetId);
      if (run.kind === "group") {
        // 群聊停止同时撤销尚未派发的后续输入，防止活跃成员结束后旧队列又唤醒整个群。
        for (const entry of db.list<{ id: string; targetId: string }>("active")) {
          if (entry.targetId !== run.targetId || entry.id === run.id) continue;
          const queued = requiredRun(db, entry.id);
          if (queued.state !== "queued") continue;
          db.write(
            "run",
            queued.id,
            {
              ...queued,
              state: "cancelled",
              cancelRequested: true,
              resultKnown: true,
              updatedAt: now,
            },
            queued.targetId,
          );
          db.remove("active", queued.id);
        }
      }
      return run.id;
    }
    case "resume": {
      const run = requiredRun(db, command.runId);
      const acknowledgingUnknown =
        run.state === "interrupted" && run.resultKnown !== true && command.retryUncertain;
      if (!acknowledgingUnknown && hasUnknownStudioRun(db, run.targetId, run.id))
        throw new Error("此会话还有结果不确定的任务，请先检查并重试该任务");
      const project =
        run.definition?.workspacePath ??
        db.read<StudioConversation>("conversation", run.targetId)?.workspacePath;
      if (project && db.read("apply-lock", studioProjectKey(project)))
        throw new Error("项目修改正在应用或等待恢复，请先检查修改记录");
      if (!["interrupted", "failed"].includes(run.state))
        throw new Error("只有失败或中断的任务可以继续");
      if (run.state === "interrupted" && run.resultKnown !== true && !command.retryUncertain)
        throw new Error("该步骤结果不确定，请检查项目后明确选择重试");
      for (const [id, step] of Object.entries(run.checkpoint.steps)) {
        if (!["succeeded", "skipped"].includes(step.status)) delete run.checkpoint.steps[id];
      }
      run.state = "queued";
      run.owner = undefined;
      run.error = undefined;
      run.resultKnown = undefined;
      run.cancelRequested = false;
      run.attempt += 1;
      run.updatedAt = now;
      db.write("run", run.id, run, run.targetId);
      db.write("active", run.id, { id: run.id, targetId: run.targetId });
      return run.id;
    }
    case "answer": {
      const interaction = db.read<StoredInteraction>("interaction", command.interactionId);
      if (!interaction || interaction.status !== "pending") throw new Error("此问题已回答或已失效");
      const run = requiredRun(db, interaction.runId);
      if (!activeRunStates.has(run.state) || run.cancelRequested) throw new Error("此任务已停止");
      const answer = command.answer;
      if (!answer || ![undefined, "allow-once", "allow-session", "deny"].includes(answer.decision))
        throw new Error("无效的审批答案");
      // UI 选项不是权限边界；owner 也必须拒绝当前原生请求未提供的许可范围。
      if (
        interaction.kind === "approval" &&
        (!answer.decision ||
          (interaction.choices && !interaction.choices.includes(answer.decision)))
      )
        throw new Error("此请求不支持该审批选项");
      if (interaction.kind === "question" && answer.decision !== "deny") {
        for (const question of interaction.questions ?? []) {
          const values = answer.answers?.[question.id];
          if (
            !Array.isArray(values) ||
            !values.length ||
            values.some((value) => typeof value !== "string" || value.length > 16000)
          )
            throw new Error("请回答全部问题");
        }
      }
      interaction.answer = answer;
      interaction.status = "answered";
      db.write("interaction", interaction.id, interaction, run.targetId);
      return interaction.id;
    }
  }
}

function queueRun(
  db: StudioRepository,
  clock: StudioClock,
  command: Extract<StudioCommand, { type: "send" }>,
): string {
  if (hasUnknownStudioRun(db, command.targetId))
    throw new Error("此会话有结果不确定的步骤，请先检查并继续该任务，或新建独立会话");
  const active = db.list<{ targetId: string }>("active");
  if (
    active.length >= 100 ||
    active.filter((run) => run.targetId === command.targetId).length >= 20
  )
    throw new Error("等待队列已满，请等待部分任务结束");
  const kind = command.kind === "chat" ? "conversation" : command.kind;
  const definition = db.read<StudioConversation | StudioGroupDefinition | StudioWorkflowDefinition>(
    kind,
    command.targetId,
  );
  if (!definition) throw new Error("找不到会话或工作流，请刷新重试");
  validWorkspace(definition.workspacePath);
  if (db.read("apply-lock", studioProjectKey(definition.workspacePath!)))
    throw new Error("项目修改正在应用或上次应用意外中断，请先打开任务的修改记录检查恢复");
  const now = clock.now();
  const id = clock.id();
  const chat = command.kind === "chat" ? (definition as StudioConversation) : undefined;
  const selection = command.selection ?? chat?.selection;
  const defaults = chat
    ? (command.kernelConfig ??
      db.read<StudioKernelConfig>("config", chat.kernel) ?? {
        executablePath: "",
        permission: "ask" as const,
      })
    : undefined;
  const run: StoredRun = {
    id,
    kind: command.kind,
    targetId: command.targetId,
    state: "queued",
    input: command.text,
    createdAt: now,
    updatedAt: now,
    attempt: 1,
    taskMode: command.taskMode === true,
    workspaceGeneration:
      command.kind === "group"
        ? recordGroupWorkspaceGeneration(
            db,
            clock,
            definition as StudioGroupDefinition,
            definition as StudioGroupDefinition,
          )
        : undefined,
    kernelConfig: defaults
      ? {
          ...defaults,
          ...(selection
            ? {
                model: selection.model || undefined,
                reasoningEffort: selection.reasoningEffort || undefined,
              }
            : {}),
        }
      : undefined,
    checkpoint: { steps: {}, values: {}, completedRounds: 0 },
    definition:
      command.kind === "chat"
        ? undefined
        : (definition as StudioGroupDefinition | StudioWorkflowDefinition),
  };
  db.write("run", id, run, run.targetId);
  db.write("active", id, { id, targetId: run.targetId });
  if (command.text.trim())
    db.write<StudioMessage>(
      "message",
      `${id}:user`,
      {
        id: `${id}:user`,
        targetId: run.targetId,
        runId: id,
        sender: "user",
        kind: "text",
        text: command.text,
        createdAt: now,
        updatedAt: now,
      },
      run.targetId,
    );
  if (command.kind === "chat") {
    const conversation = definition as StudioConversation;
    db.write("conversation", conversation.id, {
      ...conversation,
      selection: selection ?? conversation.selection,
      title: conversation.title === "新对话" ? command.text.slice(0, 80) : conversation.title,
      updatedAt: now,
    });
  }
  return id;
}

export function requiredRun(db: StudioRepository, id: string): StoredRun {
  const run = db.read<StoredRun>("run", id);
  if (!run) throw new Error("任务不存在");
  return run;
}
