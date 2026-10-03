import assert from "node:assert/strict";
import { contracts, trace } from "./todo-resume-fixture-20261003.mjs";
export function fixture() {
  const calls = [],
    events = [],
    attachments = [];
  const env = { cwd: "/owned/old", shell: "owned" };
  const messages = [
    { info: { id: "owned-user", role: "user", contextSnapshot: { envInfo: env } } },
    {
      info: {
        id: "owned-assistant",
        role: "assistant",
        anchor: { turnId: "owned-turn" },
        time: { completed: 123 },
      },
    },
  ];
  const session = {
    directory: "/owned/session",
    workspaceID: "owned-workspace",
    taskType: "owned-type",
    title: " Owned title ",
    time: {},
    permission: { mode: "build" },
    revert: {
      branchGeneration: 7,
      targetMessageID: "owned-cut",
      createdMessageID: "owned-rewind",
      keptMessageIDs: ["owned-user"],
      branchCutAfterMessageID: "owned-branch",
    },
  };
  const todos = [{ content: "Owned task", status: "pending", priority: "low" }];
  const target = { status: "active" },
    saved = { mode: "edit", planEnabled: true };
  const hydration = {
    appliedMessageCount: 2,
    interruptedToolCount: 1,
    messageCount: 2,
    partCount: 3,
  };
  const readHydration = {
    restoredCount: 4,
    skippedRangeReadCount: 5,
    skippedUnreadableEditCount: 6,
  };
  class OwnedHistory {
    addAttachment(name, text) {
      attachments.push([name, text]);
    }
  }
  const runtime = {
    sessionId: "owned-session",
    rootTraceContext: trace,
    config: { memory: { workspaceIdentity: "old-process" } },
    workingDirectory: "/owned/old",
    workspaceRoot: "/owned/root",
    readFileState: new Map(),
    artifactStore: {},
    messageHistory: {},
    contextBuilder: {},
    contextInitialized: true,
    sessionStore: {
      async getSession(id) {
        assert.equal(this, runtime.sessionStore);
        assert.equal(id, runtime.sessionId);
        calls.push("getSession");
        return session;
      },
      async messages(input) {
        assert.equal(this, runtime.sessionStore);
        assert.equal(input.sessionID, runtime.sessionId);
        calls.push("messages");
        return messages;
      },
      async sessionEntries(input) {
        assert.equal(this, runtime.sessionStore);
        calls.push("executionEntries");
        assert.equal(input.sessionID, runtime.sessionId);
        assert.equal(input.type, contracts.SESSION_ENTRY_EXECUTION_STATE);
        return [{ data: saved }];
      },
      async readTodos(input) {
        assert.equal(this, runtime.sessionStore);
        assert.equal(input.sessionID, runtime.sessionId);
        calls.push("todos");
        return todos;
      },
      async readTarget(input) {
        assert.equal(this, runtime.sessionStore);
        assert.equal(input.sessionID, runtime.sessionId);
        calls.push("target");
        return target;
      },
    },
    runtimeTaskRegistry: {
      setActiveBranchGeneration(value) {
        assert.equal(this, runtime.runtimeTaskRegistry);
        assert.equal(value, 7);
        calls.push("branch");
      },
    },
    async ensureContextInitialized(value) {
      assert.equal(this, runtime);
      assert.equal(value, trace);
      calls.push("context");
    },
    async recoverInterruptedCompactTimelines(value, eventTrace) {
      assert.equal(this, runtime);
      assert.equal(value, messages);
      assert.equal(eventTrace, trace);
      calls.push("compact");
      return 1;
    },
    eventStore: {
      async getEvents(id) {
        assert.equal(this, runtime.eventStore);
        assert.equal(id, runtime.sessionId);
        calls.push("events");
        return events;
      },
    },
    eventReducer: {
      reduce(value) {
        assert.equal(this, runtime.eventReducer);
        calls.push("reduce");
        assert.ok(
          value.every((e) =>
            [
              contracts.SessionEventType.SessionCreated,
              contracts.SessionEventType.SessionModeChanged,
            ].includes(e.type),
          ),
        );
        return { mode: "yolo" };
      },
    },
    async discardPersistedPendingSteerInputs(value) {
      assert.equal(this, runtime);
      assert.equal(value, trace);
      calls.push("discard-steer");
    },
    createEvent(type, payload, value) {
      assert.equal(this, runtime);
      assert.equal(value, trace);
      return { type, payload };
    },
    async appendEvent(event, value) {
      assert.equal(this, runtime);
      assert.equal(value, trace);
      calls.push("append:" + event.type);
      events.push(event);
    },
    async runSessionStartHooks(source, value, signal) {
      assert.equal(this, runtime);
      assert.equal(source, "resume");
      assert.equal(value, trace);
      calls.push("hooks");
      return { additionalContexts: [], signal };
    },
    injectHookAdditionalContextIntoMessageHistory(event, contexts) {
      assert.equal(this, runtime);
      assert.equal(event, contracts.HookEventName.SessionStart);
      assert.deepEqual(contexts, []);
      calls.push("hook-context");
    },
    logger: Object.fromEntries(
      ["warn", "info"].map((level) => [
        level,
        function (message, fields) {
          assert.equal(this, runtime.logger);
          calls.push(level + ":" + fields.event);
        },
      ]),
    ),
  };
  const deps = {
    CoreErrorType: contracts.CoreErrorType,
    HookEventName: contracts.HookEventName,
    SessionEventType: contracts.SessionEventType,
    createCoreError: contracts.createCoreError,
    traceContextToLogContext: () => ({ ownedTrace: true }),
    formatGoalStateForModel: (value) => (value ? "Owned goal state" : null),
    MessageHistoryImpl: OwnedHistory,
    activeSessionMessages(input, options) {
      assert.equal(input, messages);
      calls.push(options.includeCompactPreservedSegment === false ? "timeline" : "active");
      return messages;
    },
    async hydrateReadFileStateFromSession(input) {
      calls.push("read-hydrate");
      assert.equal(input.messages, messages);
      assert.equal(input.readFileState, runtime.readFileState);
      assert.equal(input.workingDirectory, session.directory);
      assert.equal(input.workspaceRoot, runtime.workspaceRoot);
      assert.equal(runtime.contextInitialized, false);
      return readHydration;
    },
    async hydrateMessageHistoryFromSession(input) {
      calls.push("history-hydrate");
      assert.equal(input.history, runtime.messageHistory);
      assert.ok(input.history instanceof OwnedHistory);
      assert.equal(input.messages, messages);
      assert.equal(input.artifactStore, runtime.artifactStore);
      return hydration;
    },
  };
  const modules = {
    "runtime/deps.js": deps,
    "@knorvia/shared": {
      resolveExecutionState(input) {
        calls.push("resolve-mode");
        return { mode: input.mode, planEnabled: false };
      },
      executionStateSchema: {
        safeParse(data) {
          calls.push("parse-state");
          return data ? { success: true, data } : { success: false };
        },
      },
    },
    "runtime/helpers/permission-grant-resume.js": {
      async restorePermissionGrantMarker(owner, value) {
        assert.equal(owner, runtime);
        assert.equal(value, trace);
        calls.push("grant");
      },
    },
    "runtime/helpers/index.js": {
      getLatestActiveSessionMessageId(input) {
        assert.equal(input, messages);
        return input.at(-1)?.info.id;
      },
    },
    "runtime/methods/session-shell-environment.js": {
      getSessionShellSelection: (owner) => owner.ownedShell,
      async restoreSessionShellEnvironmentSelectionForResume(owner, input) {
        assert.equal(owner, runtime);
        assert.equal(owner.workingDirectory, "/owned/old");
        assert.equal(owner.config.envInfo, env);
        calls.push("shell");
        return {};
      },
      announceSessionShellEnvironmentNoticeAfterResume(owner, input) {
        assert.equal(owner, runtime);
        calls.push("shell-notice");
      },
    },
    "runtime/helpers/persisted-remote-session-path-repair.js": {
      async repairPersistedRemoteSessionPaths(store, value, options) {
        assert.equal(store, runtime.sessionStore);
        assert.equal(value, session);
        calls.push("repair");
        return value;
      },
    },
    "runtime/methods/workspace-checkpoint-persistence.js": {
      async restoreWorkspaceCheckpointEntries(owner) {
        assert.equal(owner, runtime);
        calls.push("checkpoint");
      },
      async restoreWorkspaceFileRewindEntries(owner) {
        assert.equal(owner, runtime);
        calls.push("file-rewind");
      },
    },
    "runtime/methods/turn-model-step-usage.js": {
      mainTurnCacheHitAggregateFromMessages(input) {
        assert.equal(input.activeMessages, messages);
        assert.equal(input.persistedMessages, messages);
        calls.push("usage");
        return {};
      },
    },
  };
  return {
    runtime,
    modules,
    calls,
    events,
    attachments,
    messages,
    session,
    todos,
    target,
    saved,
    env,
    hydration,
    readHydration,
  };
}
