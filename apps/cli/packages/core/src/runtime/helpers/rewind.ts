// SPDX-License-Identifier: Apache-2.0
// rewind/fork 检查点选择与提示文本的兼容面（B43）：实现见 ./session/rewind-support.js。
import * as rewindSupport from "./session/rewind-support.js";

export const WORKSPACE_CHECKPOINT_CONTENT_TYPE = rewindSupport.WORKSPACE_CHECKPOINT_CONTENT_TYPE;
export const getFileMutationCheckpointCandidate = rewindSupport.getFileMutationCheckpointCandidate;
export const stringifyWorkspaceCheckpointArtifact =
  rewindSupport.stringifyWorkspaceCheckpointArtifact;
export const selectCheckpointForRewind = rewindSupport.selectCheckpointForRewind;
export const selectCheckpointForMessage = rewindSupport.selectCheckpointForMessage;
export const selectCheckpointsForMessages = rewindSupport.selectCheckpointsForMessages;
export const activeSuffixMessageIdsForRewind = rewindSupport.activeSuffixMessageIdsForRewind;
export const previewTextFromMessage = rewindSupport.previewTextFromMessage;
export const buildMessageRewindEvaluationItems = rewindSupport.buildMessageRewindEvaluationItems;
export const buildRewindEvaluationItems = rewindSupport.buildRewindEvaluationItems;
export const formatWorkspaceRewindNoticeBody = rewindSupport.formatWorkspaceRewindNoticeBody;
export const formatWorkspaceForkNoticeBody = rewindSupport.formatWorkspaceForkNoticeBody;
export const formatWorkspaceForkAtMessageNoticeBody =
  rewindSupport.formatWorkspaceForkAtMessageNoticeBody;
export const formatConversationForkNoticeBody = rewindSupport.formatConversationForkNoticeBody;
export const formatUnavailableRewindResponse = rewindSupport.formatUnavailableRewindResponse;
