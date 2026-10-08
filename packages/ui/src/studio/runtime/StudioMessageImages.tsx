import { useEffect, useState } from "react";
import type { IStudioRuntimeService, StudioImageInput, StudioImageRef } from "@knorvia/services";
import { StudioImageAttachments } from "../agents/StudioImageAttachments.js";
export function StudioMessageImages({
  service,
  targetId,
  runId,
  refs,
  zh,
}: {
  service?: IStudioRuntimeService;
  targetId: string;
  runId: string;
  refs: StudioImageRef[];
  zh: boolean;
}) {
  const [state, setState] = useState<{ key: string; inputs: StudioImageInput[]; error?: string }>();
  const key = JSON.stringify([targetId, runId, refs]);
  useEffect(() => {
    let current = true;
    void Promise.all(
      refs.map(async (ref) => {
        const image = (await service?.timeline(targetId, undefined, runId, ref.id))?.image;
        if (!image?.input)
          throw new Error(image?.error || (zh ? "图片内容不可用" : "Image unavailable"));
        return image.input;
      }),
    ).then(
      (inputs) => {
        if (current) setState({ key, inputs });
      },
      (error) => {
        if (current) setState({ key, inputs: [], error: String(error) });
      },
    );
    return () => {
      current = false;
    };
  }, [service, key, zh]);
  return (
    <>
      <StudioImageAttachments
        images={state?.key === key && state.inputs.length ? state.inputs : refs}
        zh={zh}
      />
      {state?.key === key && state.error && (
        <p role="alert" className="text-ui-xs text-foreground-subtle">
          {state.error}
        </p>
      )}
    </>
  );
}
