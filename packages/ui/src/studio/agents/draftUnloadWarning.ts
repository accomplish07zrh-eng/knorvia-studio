interface DraftStore {
  getState(): { dirty: boolean };
  subscribe(listener: (state: { dirty: boolean }) => void): () => void;
}
interface UnloadTarget {
  addEventListener(type: "beforeunload", listener: (event: BeforeUnloadEvent) => void): void;
  removeEventListener(type: "beforeunload", listener: (event: BeforeUnloadEvent) => void): void;
}

/** 警告跟随窗口级草稿所有者，不能随着聊天组件切页而消失。 */
export function watchStudioDraftUnload(store: DraftStore, target: UnloadTarget): () => void {
  let listening = false;
  const warn = (event: BeforeUnloadEvent) => {
    if (!store.getState().dirty) return;
    event.preventDefault();
    event.returnValue = "";
  };
  const sync = ({ dirty }: { dirty: boolean }) => {
    if (dirty === listening) return;
    listening = dirty;
    if (dirty) target.addEventListener("beforeunload", warn);
    else target.removeEventListener("beforeunload", warn);
  };
  sync(store.getState());
  const unsubscribe = store.subscribe(sync);
  return () => {
    unsubscribe();
    if (listening) target.removeEventListener("beforeunload", warn);
  };
}
