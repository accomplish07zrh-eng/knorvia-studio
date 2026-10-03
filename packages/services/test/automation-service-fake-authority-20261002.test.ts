import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { AutomationRepo } from "../src/session/automationRepo.js";
import type { KnorviaAutomation } from "@knorvia/shared";

test("synthetic automation lifecycle validates before writes and preserves workspace/count authority", async () => {
  const trace: unknown[][] = [];
  const denied = new Error("synthetic repository denied");
  let fail = false,
    count: number | null = 0,
    missing = false;
  const existing = {
    automationId: "synthetic-id",
    workspacePath: "/synthetic-workspace",
    cronExpr: "0 * * * *",
    recurring: false,
    maxRuns: 2,
    runCount: 99,
    nextRunAt: 200,
    endAt: undefined,
    lifecycleStatus: "completed",
  } as unknown as KnorviaAutomation;
  const rule = { unit: "minute" as const, interval: 2, hour: 0, minute: 0, anchorAt: 10 };
  class InvalidCronExprError extends Error {}
  class InvalidAutomationMaxRunsUpdateError extends Error {}
  class InvalidAutomationRelativeDelayError extends Error {}
  class InvalidAutomationIntervalCarrierError extends Error {}
  mock.module("@knorvia/shared", {
    namedExports: {
      resolveWorkspaceKey: (scope: unknown) => {
        trace.push(["scope", scope]);
        return "remote:synthetic";
      },
    },
  });
  mock.module(new URL("../src/session/automationRepo.ts", import.meta.url).href, {
    namedExports: {
      AutomationRepo: class {
        constructor() {
          assert.fail("no real database");
        }
      },
    },
  });
  mock.module(new URL("../src/session/automationValidation.ts", import.meta.url).href, {
    namedExports: {
      InvalidCronExprError,
      InvalidAutomationMaxRunsUpdateError,
      InvalidAutomationRelativeDelayError,
      assertValidAutomationScheduleRule: () => {},
    },
  });
  mock.module(new URL("../src/session/automationIntervalCarrier.ts", import.meta.url).href, {
    namedExports: {
      InvalidAutomationIntervalCarrierError,
      assertValidAutomationIntervalCarrier: () => {},
      forceIntervalCarrierRecurring: (params: object) => ({
        ...params,
        recurring: true,
        maxRuns: null,
      }),
    },
  });
  mock.module(new URL("../src/session/automationCron.ts", import.meta.url).href, {
    namedExports: {
      isValidCronExpr: (cron: string) => cron !== "invalid",
      buildRelativeDelaySchedule: () => ({ cronExpr: "relative-cron", scheduleRule: rule }),
      buildIntervalScheduleRule: () => rule,
      inferMinuteIntervalScheduleRule: () => undefined,
      scheduleRuleDefinition: () => "same-rule",
      computeInitialAutomationNextRunAt: () => 200,
      computeAutomationNextRunAt: (...args: unknown[]) => {
        trace.push(["next", ...args]);
        return 300;
      },
    },
  });
  const repo = {
    create: async (...args: unknown[]) => {
      trace.push(["create", ...args]);
      if (fail) throw denied;
      return existing;
    },
    get: async (...args: unknown[]) => {
      trace.push(["get", ...args]);
      if (fail) throw denied;
      return missing ? null : existing;
    },
    getScheduledRunCount: async (...args: unknown[]) => {
      trace.push(["scheduled-count", ...args]);
      return count;
    },
    update: async (...args: unknown[]) => {
      trace.push(["update", ...args]);
      if (fail) throw denied;
      return existing;
    },
    restart: async (...args: unknown[]) => {
      trace.push(["restart", ...args]);
    },
    runNow: async (...args: unknown[]) => {
      trace.push(["manual", ...args]);
      return { automation: existing, run: {} };
    },
    delete: async (...args: unknown[]) => {
      trace.push(["delete", ...args]);
      return true;
    },
  } as unknown as AutomationRepo;
  const {
    AutomationService,
    InvalidCronExprError: exportedCron,
    InvalidAutomationIntervalCarrierError: exportedCarrier,
  } = await import("../src/session/automationService.js");
  assert.equal(exportedCron, InvalidCronExprError);
  assert.equal(exportedCarrier, InvalidAutomationIntervalCarrierError);
  const service = new AutomationService(repo);
  const scope = { workspacePath: "/synthetic-workspace", workspaceIdentity: "remote:synthetic" };
  const params = {
    ...scope,
    title: "synthetic-title",
    prompt: "synthetic-prompt",
    cronExpr: "invalid",
    recurring: false,
  };
  await assert.rejects(service.create(params), (e) => e instanceof InvalidCronExprError);
  assert.ok(!trace.some((v) => v[0] === "create"));
  await assert.rejects(
    service.create({ ...params, cronExpr: "0 * * * *", relativeDelayMinutes: 0 }),
    (e) => e instanceof InvalidAutomationRelativeDelayError,
  );
  trace.length = 0;
  fail = true;
  await assert.rejects(service.create({ ...params, cronExpr: "0 * * * *" }), (e) => e === denied);
  fail = false;
  trace.length = 0;
  await service.create({ ...params, cronExpr: "0 * * * *", relativeDelayMinutes: 5 });
  const created = trace.find((v) => v[0] === "create")?.[1] as Record<string, unknown>;
  assert.equal(created.relativeDelayMinutes, undefined);
  assert.equal(created.intervalUnit, undefined);
  assert.equal(created.recurring, false);
  trace.length = 0;
  await assert.rejects(
    service.update("synthetic-id", { maxRuns: null }, scope),
    (e) => e instanceof InvalidAutomationMaxRunsUpdateError,
  );
  assert.ok(!trace.some((v) => v[0] === "update"));
  trace.length = 0;
  await service.update("synthetic-id", { maxRuns: 3 }, scope);
  assert.deepEqual(
    trace.find((v) => v[0] === "get"),
    ["get", "synthetic-id", "remote:synthetic"],
  );
  assert.deepEqual(
    trace.find((v) => v[0] === "scheduled-count"),
    ["scheduled-count", "synthetic-id", "remote:synthetic"],
  );
  const update = trace.find((v) => v[0] === "update");
  assert.ok(update);
  assert.equal(update[4], "remote:synthetic");
  assert.equal((update[3] as Record<string, unknown>).lifecycleStatus, "active");
  trace.length = 0;
  existing.lifecycleStatus = "active";
  await service.update("synthetic-id", { maxRuns: 3 }, scope);
  assert.ok(!trace.some((v) => v[0] === "next"));
  trace.length = 0;
  existing.lifecycleStatus = "completed";
  count = 3;
  await service.update("synthetic-id", { maxRuns: 3 }, scope);
  assert.ok(!trace.some((v) => v[0] === "next"));
  const completedUpdate = trace.find((v) => v[0] === "update");
  assert.ok(completedUpdate);
  assert.equal((completedUpdate[3] as Record<string, unknown>).lifecycleStatus, "completed");
  count = 0;
  trace.length = 0;
  count = null;
  assert.equal(await service.update("synthetic-id", { maxRuns: 3 }, scope), null);
  assert.ok(!trace.some((v) => v[0] === "update"));
  count = 0;
  trace.length = 0;
  await service.restart("synthetic-id", scope);
  assert.ok(!trace.some((v) => v[0] === "restart"));
  existing.lifecycleStatus = "failed";
  await service.restart("synthetic-id", scope);
  assert.equal(trace.find((v) => v[0] === "restart")?.[3], "remote:synthetic");
  trace.length = 0;
  missing = true;
  assert.equal(await service.runNow("synthetic-id", scope), null);
  assert.ok(!trace.some((v) => v[0] === "manual"));
  missing = false;
  trace.length = 0;
  await service.delete("synthetic-id", scope);
  assert.deepEqual(trace.at(-1), ["delete", "synthetic-id", "remote:synthetic"]);
});
