// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia contributors
import { z } from "zod";
import { browserBackendDescriptorSchema } from "./backend.js";
import { browserCommandSchema } from "./commands.js";
import { browserCommandResultSchema } from "./result.js";
import { directory, field, strict, taggedObject } from "./wire-schema.js";

export const NODE_REPL_BROWSER_BROKER_SOCKET_ENV = "KNORVIA_NODE_REPL_BROWSER_BROKER_SOCKET";
export const NODE_REPL_BROWSER_BROKER_TOKEN_ENV = "KNORVIA_NODE_REPL_BROWSER_BROKER_TOKEN";

const id = z.string().uuid();
const trace = strict({
  traceId: field.identity,
  spanId: field.identity.optional(),
  parentSpanId: field.identity.optional(),
});
const envelope = {
  id,
  runtimeScope: z.enum(["main", "subagent"]),
  token: field.text.min(32),
  sessionId: field.identity,
  turnId: field.identity.optional(),
  trace: trace.optional(),
};
const envelopeOrder = ["id", "runtimeScope", "token", "sessionId", "turnId", "trace"] as const;
export const nodeReplBrowserBrokerRequestSchema = directory(
  "op",
  {
    list: envelope,
    execute: {
      ...envelope,
      browserId: field.identity,
      browserGeneration: field.count,
      command: browserCommandSchema,
    },
  },
  { list: envelopeOrder, execute: envelopeOrder },
);

export const nodeReplBrowserBrokerResponseSchema = z.discriminatedUnion("ok", [
  taggedObject(
    "ok",
    true,
    {
      id,
      browsers: z.array(browserBackendDescriptorSchema).optional(),
      result: browserCommandResultSchema.optional(),
    },
    ["id"],
  ),
  taggedObject("ok", false, { id, error: field.nonempty }, ["id"]),
]);
export type NodeReplBrowserBrokerRequest = z.infer<typeof nodeReplBrowserBrokerRequestSchema>;
export type NodeReplBrowserBrokerResponse = z.infer<typeof nodeReplBrowserBrokerResponseSchema>;
