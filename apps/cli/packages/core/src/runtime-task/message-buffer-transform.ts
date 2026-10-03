import type { RuntimeTaskPendingMessage, RuntimeTaskSnapshot } from "./registry.js";

interface MessageDrainProjection {
  messages: RuntimeTaskPendingMessage[];
  replacement?: RuntimeTaskSnapshot;
}

function projectMessageBuffer(
  snapshot: RuntimeTaskSnapshot,
  produce: () => RuntimeTaskPendingMessage[],
): RuntimeTaskSnapshot {
  // 先物化字段，再读取/迭代原消息；自有可写槽避免 getter 临时安装的原型 setter 拦截写入。
  const projection: RuntimeTaskSnapshot = { ...snapshot, pendingMessages: undefined };
  projection.pendingMessages = produce();
  return projection;
}

export function pendingMessageAppender(
  message: RuntimeTaskPendingMessage,
): (snapshot: RuntimeTaskSnapshot) => RuntimeTaskSnapshot {
  return (snapshot) =>
    projectMessageBuffer(snapshot, () => [...(snapshot.pendingMessages ?? []), message]);
}

export function pendingMessageDrain(
  snapshot: RuntimeTaskSnapshot | undefined,
): MessageDrainProjection {
  // presence、length、返回身份是不同的 getter 阶段，不能缓存首次读到的数组。
  if (!snapshot || !snapshot.pendingMessages || snapshot.pendingMessages.length === 0) {
    return { messages: [] };
  }
  return {
    messages: snapshot.pendingMessages,
    replacement: projectMessageBuffer(snapshot, () => []),
  };
}
