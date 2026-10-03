import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { applyPatch, type StructuredPatch } from "diff";
import { RewindScope, RewindStrategy, SessionEventType, getCurrentTraceContext, isFileSystemPortError, parseWorkspaceCheckpointArtifact, traceContextToLogContext, } from "../deps.js";
import type { CheckpointCreatedPayload, MessageId, TraceContext, TurnId, WorkspaceCheckpointArtifact, } from "../deps.js";
import { selectCheckpointForRewind, selectCheckpointsForMessages, throwIfTurnAborted, } from "../helpers/index.js";
import type { WorkspaceFileRewindApplyResult, WorkspaceFileRewindIgnoredFile, WorkspaceFileRewindPreview, WorkspaceFileRewindSafeFile, WorkspaceFileRewindUnsafeFile, WorkspaceFileRewindUnsafeReason, } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
