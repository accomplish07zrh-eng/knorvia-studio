import type { KnorviaApp } from "../src/app/types.js";
import {
  SessionEventType,
  type MessageWithParts,
  type SessionEvent,
  type SessionGoal,
  type SessionProjection,
} from "@knorvia/contracts";

export function projection(overrides: Partial<SessionProjection> = {}): SessionProjection {
  return {
    id: "fixture-session",
    createdAt: new Date(10),
    updatedAt: new Date(20),
    mode: "build",
    status: "idle",
    turnCount: 0,
    totalTokenCount: 0,
    contextUsed: 0,
    contextWindow: 1000,
    pendingPermissions: [],
    pendingSteerInputs: [],
    activeToolCalls: [],
    streamingToolLedger: [],
    backgroundTasks: [],
    targetCompletionVerifications: [],
    targetCompletionVerificationTimeline: [],
    ...overrides,
  } as unknown as SessionProjection;
}

export function goal(overrides: Partial<SessionGoal> = {}): SessionGoal {
  return {
    sessionID: "fixture-session",
    targetID: "fixture-goal",
    objective: "make a fixture",
    summaryTitle: null,
    status: "active",
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    time: { created: 100, updated: 100 },
    ...overrides,
  } as unknown as SessionGoal;
}

export function event(
  type: SessionEvent["type"] = SessionEventType.SessionCreated,
  payload: unknown = {},
  time = 100,
  seq = 1,
): SessionEvent {
  return {
    id: "fixture-event-" + seq,
    sessionId: "fixture-session",
    traceId: "fixture-trace",
    timestamp: new Date(time),
    sequenceNumber: seq,
    type,
    payload,
  } as unknown as SessionEvent;
}

export function message(
  role: "user" | "assistant",
  created = 100,
  parts: MessageWithParts["parts"] = [],
): MessageWithParts {
  const identity = { id: "fixture-message-" + created, sessionID: "fixture-session", role };
  const info =
    role === "user"
      ? { ...identity, time: { created } }
      : {
          ...identity,
          time: { created, completed: created + 1000 },
          parentID: "fixture-parent",
          mode: "build",
          modelId: "fixture-model",
          providerId: "fixture-provider",
          cost: 0,
          tokens: { input: 10, output: 2, reasoning: 3, cache: { read: 4, write: 1 } },
        };
  return { info, parts } as unknown as MessageWithParts;
}

export function filePart(
  url = "knorvia-artifact://fixture-session/image",
  mime = "image/png",
  metadata?: Record<string, unknown>,
): MessageWithParts["parts"][number] {
  return {
    type: "file",
    id: "fixture-part",
    sessionID: "fixture-session",
    messageID: "fixture-message",
    mime,
    url,
    metadata,
  } as unknown as MessageWithParts["parts"][number];
}

export function todoPart(
  todos: unknown,
  options: { source?: string; end?: number } = {},
): MessageWithParts["parts"][number] {
  return {
    type: "tool",
    id: "fixture-tool",
    sessionID: "fixture-session",
    messageID: "fixture-message",
    callID: "fixture-call",
    tool: "Todo_Write",
    ...(options.source ? { metadata: { source: options.source } } : {}),
    state: {
      status: "completed",
      input: { todos },
      output: "",
      title: "",
      time: { start: 100, end: options.end ?? 200 },
      metadata: {},
    },
  } as unknown as MessageWithParts["parts"][number];
}

export function appFixture(state = projection()) {
  const calls: string[] = [];
  const selection = {
    providerId: "fixture-provider",
    modelId: "fixture-model",
    options: { reasoningLevel: "high" },
  };
  const model = {
    ref: selection,
    label: "Fixture model",
    contextWindow: 1000,
    properties: { inputFormat: ["text"], outputFormat: ["text"] },
  };
  const app = {
    sessionId: "fixture-session",
    traceId: "fixture-trace",
    runtime: {
      getProjection: async () => {
        calls.push("projection");
        return state;
      },
      getActiveTurnInfo: () => {
        calls.push("active");
        return undefined;
      },
      getSessionModelSelection: () => {
        calls.push("selection");
        return selection;
      },
    },
    listThoughtLevels: () => {
      calls.push("levels");
      return ["low", "high"];
    },
    getThoughtLevel: () => {
      calls.push("chosen");
      return "high";
    },
    getDefaultThoughtLevel: () => {
      calls.push("default");
      return "low";
    },
    getModel: () => {
      calls.push("model");
      return "fixture-provider/fixture-model";
    },
    getCurrentModelOption: () => {
      calls.push("option");
      return model;
    },
    listModels: () => {
      calls.push("catalog");
      return [model];
    },
    getMode: () => {
      calls.push("mode");
      return "build";
    },
    readToolResultArtifact: async (uri: string) => {
      calls.push("artifact");
      return { uri, content: "AA==", contentType: "image/png", bytes: 4 };
    },
  } as unknown as KnorviaApp;
  return { app, calls, state, selection, model };
}
