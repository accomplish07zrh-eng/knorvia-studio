// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { KNORVIA_AGENT_PROVIDER, type KnorviaTaskMeta } from "@knorvia/shared";
import type {
  KnorviaSessionStoreState,
  WorkspaceKnorviaUIState,
} from "../src/store/sessionStoreTypes.js";

export function storeUrl(name: string): string {
  return process.env.KNORVIA_UI_B4_STORE_DIR
    ? pathToFileURL(
        resolve(
          process.env.KNORVIA_UI_B4_STORE_DIR,
          `${name}.${process.env.KNORVIA_UI_B4_STORE_EXT ?? "ts"}`,
        ),
      ).href
    : new URL(`../src/store/${name}.js`, import.meta.url).href;
}

export const types: typeof import("../src/store/sessionStoreTypes.js") = await import(
  storeUrl("sessionStoreTypes")
);

export function workspace(): WorkspaceKnorviaUIState {
  return types.createDefaultWorkspaceState(KNORVIA_AGENT_PROVIDER);
}

export function state(
  workspaces: KnorviaSessionStoreState["workspaces"],
): KnorviaSessionStoreState {
  return { workspaces } as KnorviaSessionStoreState;
}

export function task(taskId: string, workspaceIdentity?: string): KnorviaTaskMeta {
  return {
    taskId,
    traceId: `trace:${taskId}`,
    title: `Title:${taskId}`,
    workspacePath: "/synthetic",
    workspaceIdentity,
    createdAt: 1,
    updatedAt: 2,
    mode: "build",
    provider: KNORVIA_AGENT_PROVIDER,
  };
}

export function value<T>(input: unknown): T {
  return input as T;
}

export function freeze<T>(input: T, seen = new WeakSet<object>()): T {
  if (input !== null && typeof input === "object" && !seen.has(input)) {
    seen.add(input);
    for (const key of Object.keys(input)) freeze((input as Record<string, unknown>)[key], seen);
    Object.freeze(input);
  }
  return input;
}
