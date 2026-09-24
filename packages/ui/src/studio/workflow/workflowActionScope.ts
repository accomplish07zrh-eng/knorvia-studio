/** Acknowledgements may finish their own save but never navigate a newer view. */
export function createWorkflowActionScope(
  read: () => { selectedId: string | null; service: unknown },
) {
  let generation = 0;
  let active = true;
  return {
    invalidate() {
      generation++;
    },
    activate() {
      active = true;
      generation++;
    },
    dispose() {
      active = false;
      generation++;
    },
    capture() {
      const { selectedId, service } = read();
      const captured = generation;
      return () =>
        active &&
        captured === generation &&
        read().selectedId === selectedId &&
        read().service === service;
    },
  };
}
