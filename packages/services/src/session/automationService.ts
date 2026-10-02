import type {
  KnorviaAutomation,
  KnorviaAutomationCreateParams,
  KnorviaAutomationRun,
  KnorviaAutomationUpdateParams,
} from "@knorvia/shared";
import { resolveWorkspaceKey } from "@knorvia/shared";

import { AutomationRepo } from "#src/session/automationRepo.js";
import {
  buildIntervalScheduleRule,
  buildRelativeDelaySchedule,
  computeAutomationNextRunAt,
  computeInitialAutomationNextRunAt,
  inferMinuteIntervalScheduleRule,
  isValidCronExpr,
  scheduleRuleDefinition,
} from "#src/session/automationCron.js";
import {
  assertValidAutomationIntervalCarrier,
  forceIntervalCarrierRecurring,
} from "#src/session/automationIntervalCarrier.js";
import {
  assertValidAutomationScheduleRule,
  InvalidAutomationMaxRunsUpdateError,
  InvalidAutomationRelativeDelayError,
  InvalidCronExprError,
} from "#src/session/automationValidation.js";

export { InvalidCronExprError } from "#src/session/automationValidation.js";
export { InvalidAutomationIntervalCarrierError } from "#src/session/automationIntervalCarrier.js";

interface AutomationWorkspaceScope {
  workspacePath: string;
  workspaceIdentity?: string;
}

export class AutomationService {
  private readonly repo: AutomationRepo;

  constructor(repo?: AutomationRepo) {
    this.repo = repo === undefined ? new AutomationRepo() : repo;
  }

  private resolveScopeKey(scope?: AutomationWorkspaceScope): string | undefined {
    if (!scope?.workspacePath) return undefined;
    return resolveWorkspaceKey({
      workspacePath: scope.workspacePath,
      workspaceIdentity: scope.workspaceIdentity,
    });
  }

  async create(params: KnorviaAutomationCreateParams): Promise<KnorviaAutomation> {
    if (params.studioWorkflowId !== undefined) {
      if (!/^[\w:-]{1,180}$/.test(params.studioWorkflowId)) {
        throw new Error("无效的 Studio 工作流标识");
      }
      if (params.targetTaskId || params.modelSelection || params.mode) {
        throw new Error("Studio 工作流计划不能绑定聊天会话或单独的模型配置");
      }
    }

    const createdAt = Date.now();
    const relativeDelayMinutes = params.relativeDelayMinutes;
    if (relativeDelayMinutes !== undefined) {
      if (
        !Number.isInteger(relativeDelayMinutes) ||
        relativeDelayMinutes < 1 ||
        relativeDelayMinutes > 525600
      ) {
        throw new InvalidAutomationRelativeDelayError("delayMinutes 必须是 1-525600 的整数");
      }
      if (params.recurring) {
        throw new InvalidAutomationRelativeDelayError("相对延迟任务必须设置 recurring=false");
      }
      if (params.maxRuns !== undefined) {
        throw new InvalidAutomationRelativeDelayError(
          "相对延迟任务固定只运行一次，不能设置 maxRuns",
        );
      }
      if (params.scheduleRule) {
        throw new InvalidAutomationRelativeDelayError("不能同时提交 delayMinutes 和 scheduleRule");
      }
    }

    const intervalUnit = params.intervalUnit;
    const interval = params.interval;
    assertValidAutomationIntervalCarrier({
      intervalUnit,
      interval,
      scheduleRule: params.scheduleRule,
      relativeDelayMinutes,
      recurring: params.recurring,
      maxRuns: params.maxRuns,
    });
    const {
      relativeDelayMinutes: _relativeDelayMinutes,
      intervalUnit: _intervalUnit,
      interval: _interval,
      ...base
    } = params;
    const delayPlan =
      relativeDelayMinutes === undefined
        ? base
        : {
            ...base,
            ...buildRelativeDelaySchedule(relativeDelayMinutes, createdAt),
            recurring: false,
          };
    const plan =
      intervalUnit !== undefined && interval !== undefined
        ? {
            ...delayPlan,
            recurring: true,
            maxRuns: undefined,
            scheduleRule: buildIntervalScheduleRule(
              intervalUnit,
              interval,
              delayPlan.cronExpr,
              createdAt,
            ),
          }
        : delayPlan;

    if (!isValidCronExpr(plan.cronExpr)) {
      throw new InvalidCronExprError(plan.cronExpr);
    }
    if (plan.scheduleRule) {
      assertValidAutomationScheduleRule(plan.scheduleRule);
    }
    const scheduleRule = plan.scheduleRule
      ? { ...plan.scheduleRule, anchorAt: createdAt }
      : inferMinuteIntervalScheduleRule(plan.cronExpr, createdAt);
    const createParams = scheduleRule ? { ...plan, scheduleRule } : plan;
    const nextRunAt = computeInitialAutomationNextRunAt(createParams, createdAt);
    const ended = createParams.endAt !== undefined && (nextRunAt ?? Infinity) > createParams.endAt;

    return this.repo.create(createParams, {
      nextRunAt: ended ? null : nextRunAt,
      ...(ended ? { lifecycleStatus: "completed" } : {}),
    });
  }

  async list(scope?: {
    workspacePath?: string;
    workspaceIdentity?: string;
  }): Promise<KnorviaAutomation[]> {
    return this.repo.list(scope);
  }

  async hasTaskBinding(scope: {
    workspacePath: string;
    workspaceIdentity?: string;
    targetTaskId: string;
  }): Promise<boolean> {
    return this.repo.hasTaskBinding(scope);
  }

  async get(
    automationId: string,
    scope?: AutomationWorkspaceScope,
  ): Promise<KnorviaAutomation | null> {
    return this.repo.get(automationId, this.resolveScopeKey(scope));
  }

  async update(
    automationId: string,
    params: KnorviaAutomationUpdateParams,
    scope?: AutomationWorkspaceScope,
  ): Promise<KnorviaAutomation | null> {
    const workspaceKey = this.resolveScopeKey(scope);
    const existing = await this.repo.get(automationId, workspaceKey);
    if (!existing) return null;

    if (
      existing.studioWorkflowId &&
      (params.modelSelection !== undefined || params.mode !== undefined)
    ) {
      throw new Error("Studio 工作流计划的内核由工作流节点决定，不能设置聊天模型或权限模式");
    }
    if (params.scheduleRule) {
      assertValidAutomationScheduleRule(params.scheduleRule);
    }
    const { intervalUnit, interval, scheduleRule: directScheduleRule, ...fields } = params;
    const hasDirectRule = directScheduleRule !== undefined;
    assertValidAutomationIntervalCarrier({
      intervalUnit,
      interval,
      scheduleRule: hasDirectRule ? directScheduleRule : undefined,
      recurring: fields.recurring,
      maxRuns: fields.maxRuns,
    });
    const hasCarrier = intervalUnit !== undefined && interval !== undefined;
    if (!hasCarrier && fields.maxRuns === null && fields.recurring !== true) {
      throw new InvalidAutomationMaxRunsUpdateError();
    }
    const nextRecurring = hasCarrier ? true : (fields.recurring ?? existing.recurring);
    if (nextRecurring && typeof fields.maxRuns === "number") {
      throw new InvalidAutomationMaxRunsUpdateError("无限循环任务不能设置有限次数 maxRuns");
    }
    const normalized = hasCarrier
      ? forceIntervalCarrierRecurring(fields)
      : nextRecurring &&
          fields.maxRuns === undefined &&
          (fields.recurring === true || existing.maxRuns !== undefined)
        ? { ...fields, maxRuns: null }
        : fields;
    const options: NonNullable<Parameters<AutomationRepo["update"]>[2]> = {};
    const cronChanged =
      normalized.cronExpr !== undefined && normalized.cronExpr !== existing.cronExpr;
    if (normalized.cronExpr !== undefined && !isValidCronExpr(normalized.cronExpr)) {
      throw new InvalidCronExprError(normalized.cronExpr);
    }

    const updatedAt = Date.now();
    const effectiveCron = normalized.cronExpr ?? existing.cronExpr;
    const carrierRule = hasCarrier
      ? buildIntervalScheduleRule(intervalUnit, interval, effectiveCron, updatedAt)
      : undefined;
    const suppliedRule = hasDirectRule ? directScheduleRule : carrierRule;
    const scheduledFields =
      suppliedRule !== undefined ? { ...normalized, scheduleRule: suppliedRule } : normalized;
    if (suppliedRule) {
      assertValidAutomationScheduleRule(suppliedRule);
    }
    const anchoredRule = suppliedRule
      ? {
          ...suppliedRule,
          anchorAt:
            existing.scheduleRule &&
            scheduleRuleDefinition(existing.scheduleRule) === scheduleRuleDefinition(suppliedRule)
              ? existing.scheduleRule.anchorAt
              : updatedAt,
        }
      : suppliedRule;
    const inferredRule =
      cronChanged && suppliedRule === undefined
        ? inferMinuteIntervalScheduleRule(effectiveCron, updatedAt)
        : undefined;
    const effectiveRule =
      suppliedRule === undefined
        ? cronChanged
          ? inferredRule
          : existing.scheduleRule
        : (anchoredRule ?? undefined);
    const updateParams =
      cronChanged && suppliedRule === undefined
        ? { ...scheduledFields, scheduleRule: inferredRule ?? null }
        : suppliedRule === undefined
          ? scheduledFields
          : { ...scheduledFields, scheduleRule: anchoredRule ?? null };

    if (cronChanged || normalized.endAt !== undefined || suppliedRule !== undefined) {
      options.nextRunAt = computeAutomationNextRunAt(
        { cronExpr: effectiveCron, scheduleRule: effectiveRule },
        updatedAt,
      );
      options.resetRetry = true;
    }
    const effectiveEnd =
      normalized.endAt === undefined ? existing.endAt : (normalized.endAt ?? undefined);
    if (
      effectiveEnd !== undefined &&
      (options.nextRunAt ?? existing.nextRunAt ?? Infinity) > effectiveEnd
    ) {
      options.nextRunAt = null;
      options.lifecycleStatus = "completed";
    } else if (
      normalized.endAt !== undefined &&
      (existing.lifecycleStatus === "completed" || existing.lifecycleStatus === "failed")
    ) {
      options.lifecycleStatus = "active";
    }

    if (normalized.recurring !== undefined || normalized.maxRuns !== undefined) {
      const nextMaxRuns =
        normalized.maxRuns === undefined ? existing.maxRuns : (normalized.maxRuns ?? undefined);
      const scheduledCount = await this.repo.getScheduledRunCount(automationId, workspaceKey);
      if (scheduledCount === null) return null;
      if (!nextRecurring && scheduledCount >= (nextMaxRuns ?? 1)) {
        options.lifecycleStatus = "completed";
      } else if (
        existing.lifecycleStatus === "completed" ||
        existing.lifecycleStatus === "failed"
      ) {
        options.lifecycleStatus = "active";
        if (options.nextRunAt === undefined) {
          options.nextRunAt = computeAutomationNextRunAt(
            { cronExpr: effectiveCron, scheduleRule: effectiveRule },
            updatedAt,
          );
        }
      }
    }

    return this.repo.update(automationId, updateParams, options, workspaceKey);
  }

  async delete(automationId: string, scope?: AutomationWorkspaceScope): Promise<boolean> {
    return this.repo.delete(automationId, this.resolveScopeKey(scope));
  }

  async setEnabled(
    automationId: string,
    enabled: boolean,
    scope?: AutomationWorkspaceScope,
  ): Promise<void> {
    return this.repo.setEnabled(automationId, enabled, this.resolveScopeKey(scope));
  }

  async restart(automationId: string, scope?: AutomationWorkspaceScope): Promise<void> {
    const workspaceKey = this.resolveScopeKey(scope);
    const existing = await this.repo.get(automationId, workspaceKey);
    if (!existing || existing.lifecycleStatus !== "failed") return;
    const nextRunAt = computeAutomationNextRunAt(existing);
    return this.repo.restart(automationId, { nextRunAt }, workspaceKey);
  }

  async runNow(
    automationId: string,
    scope?: AutomationWorkspaceScope,
  ): Promise<{ automation: KnorviaAutomation; run: KnorviaAutomationRun } | null> {
    const workspaceKey = this.resolveScopeKey(scope);
    const existing = await this.repo.get(automationId, workspaceKey);
    if (!existing) return null;
    return this.repo.runNow(automationId, { now: Date.now() }, workspaceKey);
  }

  async listRuns(
    automationId: string,
    scope?: AutomationWorkspaceScope,
  ): Promise<KnorviaAutomationRun[]> {
    return this.repo.listRuns(automationId, this.resolveScopeKey(scope));
  }

  async deleteRun(runId: string, scope?: AutomationWorkspaceScope): Promise<void> {
    return this.repo.deleteRun(runId, this.resolveScopeKey(scope));
  }
}
