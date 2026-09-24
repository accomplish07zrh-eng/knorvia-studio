import { isStudioKernelId, type StudioKernelId } from "@/studio/types.js";

const FIRST_MESSAGE_ACCEPTED = "knorvia:studio-first-message-accepted";
const SELECT_LOCAL_KERNEL = "knorvia:studio-first-run-select-kernel";

export function reportStudioFirstMessageAccepted(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FIRST_MESSAGE_ACCEPTED));
}

export function onStudioFirstMessageAccepted(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(FIRST_MESSAGE_ACCEPTED, listener);
  return () => window.removeEventListener(FIRST_MESSAGE_ACCEPTED, listener);
}

export function requestStudioLocalKernel(id: StudioKernelId): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SELECT_LOCAL_KERNEL, { detail: id }));
  }
}

export function onStudioLocalKernelRequested(listener: (id: StudioKernelId) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) => {
    const id: unknown = (event as CustomEvent<unknown>).detail;
    if (isStudioKernelId(id) && id !== "knorvia" && !id.startsWith("ssh:")) listener(id);
  };
  window.addEventListener(SELECT_LOCAL_KERNEL, handle);
  return () => window.removeEventListener(SELECT_LOCAL_KERNEL, handle);
}
