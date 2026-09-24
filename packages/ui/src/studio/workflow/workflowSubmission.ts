/** A stop accepted while saving must also invalidate the not-yet-admitted run. */
export async function submitWorkflowRun({
  save,
  send,
  canSubmit,
}: {
  save: () => Promise<void>;
  send: () => Promise<unknown>;
  canSubmit: () => boolean;
}): Promise<boolean> {
  if (!canSubmit()) return false;
  await save();
  if (!canSubmit()) return false;
  await send();
  return true;
}
