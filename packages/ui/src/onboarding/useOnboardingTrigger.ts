import type { useOnboardingRecordService } from "@/hooks/useOnboardingRecordService.js";
import { logger } from "../logger.js";
import { useCallback, useEffect, useRef, useState } from "react";

type OnboardingRecordService = NonNullable<ReturnType<typeof useOnboardingRecordService>>;

/** 记录只是偏好的附属历史；挂起时限不会变更已经保存的完成状态。 */
export async function appendOnboardingRecord(
  service: Pick<OnboardingRecordService, "appendRecord">,
  deviceMid: string,
  entry: Parameters<OnboardingRecordService["appendRecord"]>[1],
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => service.appendRecord(deviceMid, entry)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("appendRecord timeout")), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** 一次可取消的判定；完成引导和来源变化都必须废止在途结果。 */
export function startOnboardingCheck({
  hasStoredOccupation,
  check,
  onResult,
  onError,
}: {
  hasStoredOccupation: boolean;
  check?: () => Promise<boolean>;
  onResult: (value: boolean) => void;
  onError: (error: unknown) => void;
}): () => void {
  if (hasStoredOccupation || !check) {
    onResult(!hasStoredOccupation);
    return () => {};
  }
  let current = true;
  const fallback = () => {
    if (current) onResult(true);
  };
  const timer = setTimeout(fallback, 3000);
  void Promise.resolve()
    .then(() => (current ? check() : false))
    .then(
      (result) => {
        clearTimeout(timer);
        if (current) onResult(result);
      },
      (error: unknown) => {
        clearTimeout(timer);
        if (!current) return;
        onError(error);
        fallback();
      },
    );
  return () => {
    current = false;
    clearTimeout(timer);
  };
}

/** Local preference onboarding. No product account or identity restoration is involved. */
export function useOnboardingTrigger(options: {
  onboardingRecord: ReturnType<typeof useOnboardingRecordService>;
  hasStoredOccupation: boolean;
}): [boolean | null, () => void] {
  const { onboardingRecord, hasStoredOccupation } = options;
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const cancelCheck = useRef<() => void>(() => {});
  useEffect(() => {
    cancelCheck.current = startOnboardingCheck({
      hasStoredOccupation,
      check: onboardingRecord ? () => onboardingRecord.shouldOnboard() : undefined,
      onResult: setNeedsOnboarding,
      onError: (error) => logger.warn("[onboarding] Local preference check failed", { error }),
    });
    return () => cancelCheck.current();
  }, [onboardingRecord, hasStoredOccupation]);
  const markOnboarded = useCallback(() => {
    cancelCheck.current();
    setNeedsOnboarding(false);
  }, []);
  return [hasStoredOccupation ? false : needsOnboarding, markOnboarded];
}
