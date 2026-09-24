interface FieldSnapshot {
  value: string;
  baseline: string;
  dirty: boolean;
  pending: boolean;
  saved: boolean;
  error: string;
}

/** 一个字段拥有输入快照；保存回执不能覆盖提交后继续输入的内容。 */
export function createAsyncSettingField(initial: string, normalize: (value: string) => string) {
  let snapshot: FieldSnapshot = {
    value: initial,
    baseline: normalize(initial),
    dirty: false,
    pending: false,
    saved: false,
    error: "",
  };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<FieldSnapshot>) => {
    const next = { ...snapshot, ...patch };
    snapshot = { ...next, dirty: normalize(next.value) !== next.baseline };
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    edit(value: string) {
      update({ value, error: "", saved: false });
    },
    sync(value: string) {
      const baseline = normalize(value);
      if (baseline === snapshot.baseline) return;
      update({ baseline, value: snapshot.dirty ? snapshot.value : value });
    },
    async save(commit: (value: string) => Promise<void>): Promise<boolean> {
      // Enter 和按钮同步竞争时，第二次调用也必须在发请求前被拒绝。
      if (snapshot.pending || !snapshot.dirty) return false;
      const submitted = snapshot.value;
      const normalized = normalize(submitted);
      update({ pending: true, saved: false, error: "" });
      try {
        await commit(normalized);
        update({
          baseline: normalized,
          value: snapshot.value === submitted ? normalized : snapshot.value,
          pending: false,
          saved: true,
        });
        return true;
      } catch (cause) {
        update({
          pending: false,
          error: cause instanceof Error ? cause.message : String(cause),
        });
        return false;
      }
    },
  };
}

/** 服务对象界定窗口/连接边界；切页复用字段所有者，不丢 pending、错误和未保存输入。 */
export function createAsyncSettingFieldRegistry() {
  const owners = new WeakMap<object, Map<string, ReturnType<typeof createAsyncSettingField>>>();
  return {
    get(owner: object, id: string, initial: string, normalize: (value: string) => string) {
      let fields = owners.get(owner);
      if (!fields) {
        fields = new Map();
        owners.set(owner, fields);
      }
      let field = fields.get(id);
      if (!field) {
        field = createAsyncSettingField(initial, normalize);
        fields.set(id, field);
      }
      return field;
    },
  };
}

export const asyncSettingFields = createAsyncSettingFieldRegistry();
