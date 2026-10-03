import type { TurnId, ModelMessageContent } from "@knorvia/contracts";
// Dependency declarations only; implementations remain unchanged.
export declare function createTurnId(): TurnId;
export declare const CoreErrorType: { readonly InvalidTurnPhase: "invalid_turn_phase" };
export declare function createCoreError(
  type: string,
  message: string,
  options: { context: Record<string, unknown>; recoverable: boolean },
): unknown;
export declare function modelMessageContentToText(content: ModelMessageContent): string;
// Native Date construction and crypto.randomUUID are the existing clock/ID seams.
