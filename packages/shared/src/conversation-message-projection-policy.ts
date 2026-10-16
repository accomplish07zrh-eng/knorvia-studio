// SPDX-License-Identifier: Apache-2.0
export type {
  ConversationMessageProjectionPolicy,
  ConversationProjectionMessage,
  ConversationProjectionMessageSemantics,
  ConversationProjectionPart,
} from "./internal-s03/projection-decision.js";
export {
  getConversationMessageProjectionPolicy,
  getConversationModelOnlyTurnTriggerSource,
  isConversationHiddenSyntheticMessage,
  isConversationProviderContextOnlyMessage,
  isConversationRealUserTurnStarter,
  isConversationTimelineOnlyMessage,
} from "./internal-s03/projection-decision.js";
