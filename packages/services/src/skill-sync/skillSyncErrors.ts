import {
  SKILL_SYNC_SIZE_LIMIT_ERROR_CODE,
  type SkillSyncSizeLimitErrorData,
} from "@knorvia/shared";

export function createSkillSyncSizeLimitError(data: SkillSyncSizeLimitErrorData): Error & {
  code: typeof SKILL_SYNC_SIZE_LIMIT_ERROR_CODE;
  data: SkillSyncSizeLimitErrorData;
} {
  const error = new Error(
    `skill sync size limit exceeded: ${data.actualBytes}/${data.maxBytes} (${data.phase})`,
  );
  error.name = "SkillSyncSizeLimitError";
  return Object.assign(error, { code: SKILL_SYNC_SIZE_LIMIT_ERROR_CODE, data });
}
