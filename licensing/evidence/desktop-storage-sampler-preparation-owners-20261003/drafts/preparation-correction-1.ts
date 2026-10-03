import { Worker } from 'node:worker_threads';
import { createInterface } from 'node:readline';
import { realpath } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { z } from 'zod';
import {
  type DatabaseMigrationFacts,
  type DatabaseStartupErrorCode,
  type DatabaseStartupState,
  databaseMigrationFactsSchema,
  databaseStartupErrorCodeSchema,
  databaseStartupErrorDetailsSchema,
  knorviaStoragePreparationFrameSchema,
} from '@knorvia/shared';
import { resolveDefaultKnorviaAgentCommand } from '@knorvia/services/storage-startup';

type Phase = NonNullable<DatabaseStartupState['databasePhase']>;

type PreparationErrorDetails = {
  sqliteCode?: number;
  systemCode?: string;
  migrationId?: string;
  migration?: DatabaseMigrationFacts;
};

const preparationMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('progress'),
    migration: databaseMigrationFactsSchema.optional(),
    phase: z.enum([
      'checking',
      'waiting_for_lock',
      'migrating',
      'committing',
      'maintaining',
      'ready',
    ]),
  }).strict(),
  z.object({
    type: z.literal('done'),
  }).strict(),
  z.object({
    type: z.literal('failed'),
    errorCode: databaseStartupErrorCodeSchema,
    migration: databaseMigrationFactsSchema.optional(),
    ...databaseStartupErrorDetailsSchema.shape,
  }).strict(),
]);

function statusError(
  kind: DatabaseStartupErrorCode,
  details?: PreparationErrorDetails,
  databaseId?: string,
) {
  return Object.assign(new Error('Storage preparation failed: ' + kind), {
    kind,
    errcode: details?.sqliteCode,
    code: details?.systemCode,
    migrationId: details?.migrationId,
    migrationUpdate: databaseId && details?.migration
      ? { databaseId, migration: details.migration }
      : undefined,
  });
}

export function prepareHostStorage(
  path: string,
  report: (phase: Phase, migration?: DatabaseMigrationFacts) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const worker = new Worker(new URL('./tasksStorageWorker.js', import.meta.url), {
      workerData: { path },
    });
    let validMessage = false;
    let done = false;
    let failure: unknown;
    const timer = setTimeout(() => {
      failure = statusError('startup_status_timeout');
      worker.terminate();
    }, 30000);
    const abort = () => {
      failure = statusError('transport_closed');
      worker.terminate();
    };

    signal.addEventListener('abort', abort, { once: true });
    worker.on('message', (raw: unknown) => {
      const result = preparationMessageSchema.safeParse(raw);
      if (!result.success) {
        failure = statusError('transport_closed');
        worker.terminate();
        return;
      }
      validMessage = true;
      clearTimeout(timer);
      const message = result.data;
      if (message.type === 'progress') {
        report(message.phase, message.migration);
      } else if (message.type === 'done') {
        done = true;
      } else {
        failure = statusError(message.errorCode, message, 'tasks-index');
      }
    });
    worker.once('error', (error) => {
      failure = error;
    });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (done && code === 0 && !failure && validMessage) {
        resolve();
      } else {
        reject(failure ?? statusError('transport_closed'));
      }
    });
    if (signal.aborted) {
      abort();
    }
  });
}

export async function prepareSessionStorage(options: {
  cwd: string;
  env?: Record<string, string>;
  signal: AbortSignal;
  report: (phase: Phase, details?: {
    databaseId: string;
    migration?: DatabaseMigrationFacts;
  }) => void;
  preparedPaths?: Set<string>;
  observePath: (path: string) => Promise<void>;
}): Promise<void> {
  const command = resolveDefaultKnorviaAgentCommand({
    workspacePath: options.cwd,
    workspaceKey: options.cwd,
    presentationSurface: 'desktop',
  });
  if (!command || !command.supportsStorageStartup || !command.storagePreparationEntry) {
    throw statusError('unsupported_runtime');
  }
  const entry = command.storagePreparationEntry;

  await new Promise<void>((resolve, reject) => {
    const child = new Worker(entry, {
      argv: ['app-server', '--stdio', '--prepare-storage', '--cwd', command.cwd ?? options.cwd],
      env: { ...process.env, ...options.env, ...command.env },
      stdin: true,
      stdout: true,
      stderr: true,
    });
    const input = child.stdin!;
    const lines = createInterface({ input: child.stdout! });
    let pathReceived = false;
    let prepared = false;
    let preparedPath: string | undefined;
    let settled = false;
    let failure: unknown;
    const timer = setTimeout(() => {
      failure = statusError('startup_status_timeout');
      child.terminate();
    }, 30000);
    const abort = () => {
      failure ??= statusError('transport_closed');
      child.terminate();
    };

    options.signal.addEventListener('abort', abort, { once: true });
    child.stderr!.resume();
    input.on('error', (error) => {
      failure ??= error;
      child.terminate();
    });
    lines.on('line', (line) => {
      try {
        if (line.length > 65536) {
          throw statusError('transport_closed');
        }
        const frame = knorviaStoragePreparationFrameSchema.parse(JSON.parse(line));
        clearTimeout(timer);
        if (frame.method === 'startup/storagePath') {
          if (pathReceived) {
            throw statusError('transport_closed');
          }
          pathReceived = true;
          void (async () => {
            const canonical = await realpath(frame.params.path).catch((error: NodeJS.ErrnoException) => {
              if (error.code === 'ENOENT') {
                return resolvePath(frame.params.path);
              }
              throw error;
            });
            preparedPath = canonical;
            if (settled || failure || options.signal.aborted) {
              return;
            }
            const reuse = options.preparedPaths?.has(canonical) ?? false;
            if (!reuse) {
              await options.observePath(frame.params.path);
            }
            if (!settled && !failure && !options.signal.aborted) {
              input.write(JSON.stringify({ method: 'startup/storagePathReady', reuse }) + '\n');
            }
          })().catch((error) => {
            failure ??= error;
            child.terminate();
          });
        } else if (frame.method === 'startup/storagePrepared') {
          prepared = pathReceived;
          input.end();
        } else if (frame.params.phase === 'failed') {
          failure ??= statusError(
            frame.params.errorCode ?? 'sql_failed',
            frame.params,
            frame.params.databaseId,
          );
        } else {
          options.report(frame.params.phase, {
            databaseId: frame.params.databaseId,
            migration: frame.params.migration,
          });
        }
      } catch (error) {
        failure ??= error;
        child.terminate();
      }
    });
    child.once('error', (error) => {
      failure ??= error;
    });
    child.once('exit', (code) => {
      settled = true;
      clearTimeout(timer);
      options.signal.removeEventListener('abort', abort);
      lines.close();
      if (code === 0 && prepared && !failure) {
        if (preparedPath) {
          options.preparedPaths?.add(preparedPath);
        }
        resolve();
      } else {
        reject(failure ?? statusError('transport_closed'));
      }
    });
    if (options.signal.aborted) {
      abort();
    }
  });
}
