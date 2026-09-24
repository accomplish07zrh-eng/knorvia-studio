import { backgroundFileError } from "./preferences.js";

export interface BackgroundImageRepository {
  read(id: string): Promise<Blob | undefined>;
  write(id: string, blob: Blob): Promise<void>;
  remove(id: string): Promise<void>;
}
async function withImages<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("knorvia-appearance", 1);
    let abandoned = false;
    request.onupgradeneeded = () => request.result.createObjectStore("images");
    request.onsuccess = () => {
      // 升级被旧窗口阻塞后可能迟到成功；已报错的连接必须关闭，避免继续阻塞升级。
      if (abandoned) request.result.close();
      else {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      }
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      abandoned = true;
      reject(new Error("saveFailed"));
    };
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction("images", mode);
      const request = operation(transaction.objectStore("images"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? new Error("saveFailed"));
      transaction.onerror = () => reject(transaction.error ?? new Error("saveFailed"));
    });
  } finally {
    db.close();
  }
}
export const backgroundImages: BackgroundImageRepository = {
  read: (id) => withImages("readonly", (store) => store.get(id)),
  write: async (id, blob) => {
    await withImages("readwrite", (store) => store.put(blob, id));
  },
  remove: async (id) => {
    await withImages("readwrite", (store) => store.delete(id));
  },
};

/** Decode only supported local images; strip metadata and bound the retained texture. */
export async function prepareBackgroundImage(file: File): Promise<Blob> {
  const error = backgroundFileError(
    file.size,
    new Uint8Array(await file.slice(0, 12).arrayBuffer()),
  );
  if (error) throw new Error(error);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error("invalidImage");
    });
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 48_000_000
    )
      throw new Error("dimensions");
    const scale = Math.min(1, 2560 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("invalidImage");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("invalidImage"))),
        "image/webp",
        0.9,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
