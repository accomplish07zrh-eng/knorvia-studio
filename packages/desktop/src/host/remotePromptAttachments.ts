import type { IRemoteBackend, RemoteUploadOptions } from "@knorvia/server/remote";

import { quotePosixPathArg } from "@knorvia/server/remote/posixShell.js";

import type { TraceId, KnorviaPromptAttachment } from "@knorvia/shared";

import { randomUUID } from "node:crypto";

interface RemotePromptAttachmentMaterializeInput {
  taskId?: string;
  content: string;
  traceId: TraceId | string;
  attachments?: KnorviaPromptAttachment[];
}

interface RemotePromptAttachmentMaterializeResult {
  content: string;
  attachments?: KnorviaPromptAttachment[];
  uploadedCount: number;
}

type RemoteCommands = Pick<IRemoteBackend, "exec">;
type Materializer = (
  params: RemotePromptAttachmentMaterializeInput & {
    taskId: string;
  },
) => Promise<Pick<RemotePromptAttachmentMaterializeResult, "content" | "attachments">>;

const literalStagingRoot = "~/.knorvia-studio/tmp/prompt-attachments";

async function commandCompletion(backend: RemoteCommands, command: string): Promise<void> {
  const handle = await backend.exec(command);
  return new Promise<void>((resolve, reject) => {
    handle.onClose((code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`remote command failed with exit code ${code}: ${command}`));
    });
  });
}

async function absoluteStagingRoot(backend: RemoteCommands): Promise<string> {
  const command = 'printf %s "$HOME"';
  const handle = await backend.exec(command);
  let output = "";
  let diagnostic = "";
  handle.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  handle.stderr.on("data", (chunk) => {
    diagnostic += chunk.toString();
  });
  await new Promise<void>((resolve, reject) => {
    handle.onClose((code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const suffix = diagnostic ? `: ${diagnostic}` : "";
      reject(new Error(`remote command failed with exit code ${code}: ${command}${suffix}`));
    });
  });
  const home = output.trim().replace(/\/+$/, "");
  if (!home.startsWith("/")) {
    throw new Error("remote HOME is not an absolute path");
  }
  return `${home}/.knorvia-studio/tmp/prompt-attachments`;
}

function pathUnder(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

function pathPart(value: string): string {
  const cleaned = value
    .split("\0")
    .join("-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "attachment";
}

function destinationFor(
  root: string,
  traceId: TraceId | string,
  position: number,
  filename: string,
): string {
  const trace = pathPart(String(traceId)).slice(0, 80) || "trace";
  const nonce = pathPart(randomUUID()).slice(0, 64);
  const segments = filename.split(/[\\/]/).filter((segment) => segment.length > 0);
  const basename = segments[segments.length - 1] || filename;
  const safeFilename = (pathPart(basename) || "attachment").slice(0, 160);
  const ordinal = String(position + 1).padStart(2, "0");
  return `${root}/${trace}/${nonce}/${ordinal}-${safeFilename}`;
}

function directoryOf(path: string): string {
  const boundary = path.lastIndexOf("/");
  return boundary > 0 ? path.slice(0, boundary) : literalStagingRoot;
}

function directorySetup(root: string, directory: string): string {
  const ancestors = [root];
  let current = root;
  for (const component of directory.slice(root.length).split("/")) {
    if (component.length === 0) {
      continue;
    }
    current = `${current}/${component}`;
    ancestors.push(current);
  }
  const quotedAncestors = ancestors.map((ancestor) => quotePosixPathArg(ancestor)).join(" ");
  return `mkdir -p ${quotePosixPathArg(directory)} && command chmod 700 ${quotedAncestors}`;
}

export async function materializeRemotePromptAttachments(
  input: RemotePromptAttachmentMaterializeInput,
  options: {
    backend: Pick<IRemoteBackend, "exec" | "upload">;
    uploadOptions?: RemoteUploadOptions;
  },
): Promise<RemotePromptAttachmentMaterializeResult> {
  const attachments = input.attachments;
  if (!attachments || attachments.length === 0) {
    return { ...input, uploadedCount: 0 };
  }
  let resolvedRoot: string | undefined;
  let uploadedCount = 0;
  const nextAttachments: KnorviaPromptAttachment[] = [];
  const replacements = new Map<string, string>();

  // entries 保留上传序号和 live 迭代顺序，也直接携带当前附件，避免未收窄的索引读取。
  for (const [position, attachment] of attachments.entries()) {
    const localPath = attachment.localPath;
    if (!localPath?.trim() || pathUnder(literalStagingRoot, localPath)) {
      nextAttachments.push(attachment);
      continue;
    }
    if (resolvedRoot === undefined) {
      resolvedRoot = await absoluteStagingRoot(options.backend);
    }
    if (pathUnder(resolvedRoot, localPath)) {
      nextAttachments.push(attachment);
      continue;
    }
    const remotePath = destinationFor(resolvedRoot, input.traceId, position, attachment.filename);
    const directory = directoryOf(remotePath);
    try {
      await commandCompletion(options.backend, directorySetup(resolvedRoot, directory));
      if (options.uploadOptions) {
        await options.backend.upload(localPath, remotePath, options.uploadOptions);
      } else {
        await options.backend.upload(localPath, remotePath);
      }
      await commandCompletion(
        options.backend,
        `command chmod 600 ${quotePosixPathArg(remotePath)}`,
      );
    } catch (error) {
      try {
        await cleanupRemotePromptAttachment(options.backend, remotePath);
      } catch {
        // 清理失败不能替换本次上传失败的原始原因。
      }
      throw new Error(`远端附件上传失败：${attachment.filename}`, { cause: error });
    }
    nextAttachments.push({ ...attachment, localPath: remotePath });
    replacements.set(localPath, remotePath);
    uploadedCount += 1;
  }

  let content = input.content;
  const ordered = [...replacements.entries()].sort(([a], [b]) => b.length - a.length);
  for (const [localPath, remotePath] of ordered) {
    content = content.split(localPath).join(remotePath);
  }
  return {
    content,
    attachments: uploadedCount === 0 ? attachments : nextAttachments,
    uploadedCount,
  };
}

export async function cleanupRemotePromptAttachment(
  backend: Pick<IRemoteBackend, "exec">,
  remotePath: string,
): Promise<void> {
  const root = await absoluteStagingRoot(backend);
  if (!pathUnder(literalStagingRoot, remotePath) && !pathUnder(root, remotePath)) {
    return;
  }
  const directory = directoryOf(remotePath);
  await commandCompletion(
    backend,
    `rm -f ${quotePosixPathArg(remotePath)} && rmdir ${quotePosixPathArg(directory)} 2>/dev/null || true`,
  );
}

export async function cleanupStaleRemotePromptAttachments(
  backend: Pick<IRemoteBackend, "exec">,
  olderThanMinutes = 24 * 60,
): Promise<void> {
  const root = await absoluteStagingRoot(backend);
  const minutes = Math.max(1, Math.floor(olderThanMinutes));
  const quoted = quotePosixPathArg(root);
  await commandCompletion(
    backend,
    `if [ -d ${quoted} ]; then find ${quoted} -type f -mmin +${minutes} -delete; find ${quoted} -mindepth 1 -depth -type d -empty -delete; fi`,
  );
}

function promptProxy<T extends object>(
  service: T,
  capturedMaterializer: Materializer,
  kind: "task" | "session",
): T {
  const callbackOwner = { materializePromptAttachments: capturedMaterializer };
  return new Proxy(service, {
    get(target, property, receiver) {
      const method = Reflect.get(target, property, receiver);
      const intercept =
        typeof property === "string" &&
        (property === "sendPrompt" || (kind === "task" && property === "enqueueTaskCommand"));
      if (!intercept || typeof method !== "function") {
        return method;
      }
      return async (...argumentsList: unknown[]) => {
        const first = argumentsList[0];
        if (first === null || typeof first !== "object") {
          return method.apply(target, argumentsList);
        }
        const params = first as Record<string, unknown>;
        const content = params.content;
        const taskId = kind === "task" ? params.taskId : params.sessionId;
        let traceId: unknown;
        if (kind === "task") {
          traceId = params.traceId;
        } else {
          const inputId = params.inputId;
          traceId =
            (typeof inputId === "string" ? inputId : undefined) ??
            (typeof taskId === "string" ? taskId : undefined);
        }
        if (
          typeof content !== "string" ||
          typeof taskId !== "string" ||
          !taskId ||
          typeof traceId !== "string" ||
          !traceId
        ) {
          return method.apply(target, argumentsList);
        }
        const attachments = params.attachments;
        const prepared = await callbackOwner.materializePromptAttachments({
          taskId,
          traceId,
          content,
          attachments: Array.isArray(attachments) ? attachments : undefined,
        });
        const nextParams: Record<string, unknown> = { ...params, content: prepared.content };
        if ("attachments" in params || prepared.attachments !== undefined) {
          nextParams.attachments = prepared.attachments;
        }
        return method.call(target, nextParams);
      };
    },
  });
}

export function createRemotePromptAttachmentTaskService<T extends object>(
  service: T,
  options: {
    materializePromptAttachments: (
      params: RemotePromptAttachmentMaterializeInput & {
        taskId: string;
      },
    ) => Promise<Pick<RemotePromptAttachmentMaterializeResult, "content" | "attachments">>;
  },
): T {
  return promptProxy(service, options.materializePromptAttachments, "task");
}

export function createRemotePromptAttachmentSessionService<T extends object>(
  service: T,
  options: {
    materializePromptAttachments: (
      params: RemotePromptAttachmentMaterializeInput & {
        taskId: string;
      },
    ) => Promise<Pick<RemotePromptAttachmentMaterializeResult, "content" | "attachments">>;
  },
): T {
  return promptProxy(service, options.materializePromptAttachments, "session");
}
