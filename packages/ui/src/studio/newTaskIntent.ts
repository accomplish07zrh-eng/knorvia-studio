const STUDIO_NEW_TASK_EVENT = "knorvia:studio-new-task";

/** A visible frontend draft page may consume New Task before the native runtime path. */
export function requestStudioNewTask(): boolean {
  if (typeof window === "undefined") return false;
  return !window.dispatchEvent(new Event(STUDIO_NEW_TASK_EVENT, { cancelable: true }));
}

export function addStudioNewTaskListener(handle: () => boolean): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    if (!event.defaultPrevented && handle()) event.preventDefault();
  };
  window.addEventListener(STUDIO_NEW_TASK_EVENT, listener);
  return () => window.removeEventListener(STUDIO_NEW_TASK_EVENT, listener);
}
