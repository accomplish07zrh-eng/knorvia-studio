/* eslint-disable max-lines */
import { randomUUID } from "node:crypto";
import { mkdir, open, rm, writeFile, type FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  BrowserWindow,
  MessageChannelMain,
  session,
  type MessagePortMain,
  type Session,
  type WebFrameMain,
} from "electron";
import type {
  BrowserWebmRecorderFactory,
  BrowserWebmRecorderFactoryInput,
  BrowserWebmRecorderSession,
} from "./browserVideoRecorder.js";

const CHANNEL = "knorvia-browser-video-recorder:port";
const START_TIMEOUT_MS = 15000;
const STOP_TIMEOUT_MS = 15000;

const RECORDER_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'">
</head>
<body>
<script>
(() => {
    const channel = 'knorvia-browser-video-recorder:port';
    let port;
    let recorder = null;
    let captureStream = null;
    let canvasStream = null;
    let video = null;
    let canvas = null;
    let drawTimer = null;
    let chunkQueue = Promise.resolve();
    let cancelling = false;

    const errorText = (error) => error instanceof Error ? error.message : String(error);
    const send = (message) => port.postMessage(message);
    const diagnostic = (message) => send({ type: 'diagnostic', message });

    const stopTracks = () => {
        for (const track of captureStream?.getTracks?.() ?? []) {
            track.stop();
        }
        for (const track of canvasStream?.getTracks?.() ?? []) {
            track.stop();
        }
        captureStream = null;
        canvasStream = null;
        if (drawTimer !== null) {
            clearInterval(drawTimer);
        }
        drawTimer = null;
        video?.remove();
        canvas?.remove();
        video = null;
        canvas = null;
    };

    window.addEventListener('message', (event) => {
        if (event.source !== window || event.data !== channel) {
            return;
        }
        port = event.ports[0];
        if (!port) {
            return;
        }
        port.onmessage = async (messageEvent) => {
            const data = messageEvent.data;
            if (data?.type === 'start') {
                try {
                    const mimeType = ['video/webm;codecs=vp8', 'video/webm']
                        .find((candidate) => MediaRecorder.isTypeSupported(candidate));
                    if (!mimeType) {
                        throw new Error('Chromium does not support VP8 WebM MediaRecorder');
                    }
                    const fps = Number(data.fps) || 25;
                    const width = Number(data.width);
                    const height = Number(data.height);
                    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
                        throw new Error('invalid recorder viewport');
                    }

                    captureStream = await navigator.mediaDevices.getDisplayMedia({
                        video: { frameRate: fps },
                        audio: false,
                    });
                    const [track] = captureStream.getVideoTracks();
                    diagnostic('track=' + JSON.stringify({
                        active: captureStream.active,
                        muted: track?.muted,
                        readyState: track?.readyState,
                        settings: track?.getSettings?.(),
                    }));
                    track?.addEventListener('mute', () => diagnostic('track muted'));
                    track?.addEventListener('unmute', () => diagnostic('track unmuted'));
                    track?.addEventListener('ended', () => diagnostic('track ended'));

                    video = document.createElement('video');
                    video.muted = true;
                    video.playsInline = true;
                    video.srcObject = captureStream;
                    video.style.position = 'fixed';
                    video.style.opacity = '0';
                    document.body.append(video);
                    await video.play();

                    canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const context = canvas.getContext('2d', { alpha: false });
                    if (!context) {
                        throw new Error('2D canvas recorder is unavailable');
                    }
                    const draw = () => context.drawImage(video, 0, 0, width, height);
                    draw();
                    drawTimer = setInterval(draw, Math.max(1, Math.round(1000 / fps)));
                    canvasStream = canvas.captureStream(fps);
                    recorder = new MediaRecorder(canvasStream, { mimeType });

                    recorder.addEventListener('dataavailable', (chunkEvent) => {
                        diagnostic('dataavailable bytes=' + chunkEvent.data?.size);
                        if (!chunkEvent.data || chunkEvent.data.size === 0) {
                            return;
                        }
                        chunkQueue = chunkQueue.then(async () => {
                            const bytes = await chunkEvent.data.arrayBuffer();
                            send({ type: 'chunk', data: bytes });
                        });
                    });
                    recorder.addEventListener('error', (event) => {
                        send({ type: 'error', message: errorText(event.error ?? 'MediaRecorder error') });
                    });
                    recorder.addEventListener('stop', async () => {
                        try {
                            await chunkQueue;
                            send({ type: cancelling ? 'cancelled' : 'stopped' });
                        } catch (error) {
                            send({ type: 'error', message: errorText(error) });
                        } finally {
                            stopTracks();
                        }
                    }, { once: true });
                    recorder.start(1000);
                    send({ type: 'started', mimeType: recorder.mimeType || mimeType });
                } catch (error) {
                    stopTracks();
                    send({ type: 'error', message: errorText(error) });
                }
            } else if (data?.type === 'stop') {
                if (recorder && (recorder.state === 'recording' || recorder.state === 'paused')) {
                    recorder.stop();
                } else {
                    send({ type: 'error', message: 'MediaRecorder is not recording' });
                }
            } else if (data?.type === 'cancel') {
                cancelling = true;
                if (recorder && (recorder.state === 'recording' || recorder.state === 'paused')) {
                    recorder.stop();
                } else {
                    stopTracks();
                    send({ type: 'cancelled' });
                }
            }
        };
        port.start();
        send({ type: 'ready' });
    }, { once: true });
})();
</script>
</body>
</html>`;

function recorderError(message: string): Error {
  return new Error("Electron WebM recorder failed: " + message);
}

function abortError(): DOMException {
  return new DOMException("Browser recording cancelled", "AbortError");
}

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
}

function deferred(): Deferred {
  let resolvePromise!: () => void;
  let rejectPromise!: (error: Error) => void;
  let settled = false;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  void promise.catch(() => undefined);
  return {
    promise,
    resolve: () => {
      if (!settled) {
        settled = true;
        resolvePromise();
      }
    },
    reject: (error) => {
      if (!settled) {
        settled = true;
        rejectPromise(error);
      }
    },
  };
}

async function awaitPhase(phase: Deferred, timeoutMs: number, message: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      phase.promise,
      new Promise<void>((_resolve, reject) => {
        timer = setTimeout(() => reject(recorderError(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function createElectronBrowserWebmRecorder(
  input: BrowserWebmRecorderFactoryInput,
  debug?: (message: string) => void,
): Promise<BrowserWebmRecorderSession> {
  if (input.signal.aborted) {
    throw abortError();
  }
  const targetFrame = input.targetFrame as WebFrameMain | null;
  if (
    !targetFrame ||
    typeof targetFrame.isDestroyed !== "function" ||
    targetFrame.isDestroyed() ||
    targetFrame.detached
  ) {
    throw recorderError("target WebFrameMain is unavailable");
  }

  await mkdir(dirname(input.outputPath), { recursive: true });
  const recorderDocument = join(
    dirname(input.outputPath),
    `.${randomUUID()}-browser-video-recorder.html`,
  );
  const recorderSession: Session = session.fromPartition(
    `knorvia-browser-video-recorder-${randomUUID()}`,
  );
  const recorderWindow = new BrowserWindow({
    show: false,
    width: Math.max(1, input.viewport.width),
    height: Math.max(1, input.viewport.height),
    webPreferences: {
      session: recorderSession,
      preload: join(import.meta.dirname, "../preload/browserVideoRecorder.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      webSecurity: true,
    },
  });
  recorderWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const channel = new MessageChannelMain();
  const mainPort: MessagePortMain = channel.port1;
  const rendererPort: MessagePortMain = channel.port2;
  const ready = deferred();
  const started = deferred();
  const stopped = deferred();
  let fileHandle: FileHandle | undefined;
  let writeError: unknown;
  let writeChain: Promise<void> = Promise.resolve();
  let closed = false;
  let stopping = false;

  const fail = (error: unknown): Error => {
    const failure = error instanceof Error ? error : recorderError(String(error));
    ready.reject(failure);
    started.reject(failure);
    stopped.reject(failure);
    return failure;
  };

  const onMessage = (event: Electron.MessageEvent): void => {
    const data = event.data;
    if (!data || typeof (data as { type?: unknown }).type !== "string") {
      return;
    }
    const message = data as Record<string, unknown>;
    debug?.(`[browser-recording] recorder message type=${message.type}`);
    if (message.type === "ready") {
      ready.resolve();
    } else if (message.type === "started") {
      if (message.mimeType !== "video/webm;codecs=vp8" && message.mimeType !== "video/webm") {
        fail(recorderError("unexpected MediaRecorder MIME type: " + String(message.mimeType)));
      } else {
        started.resolve();
      }
    } else if (message.type === "chunk") {
      const value = message.data;
      let bytes: Buffer | null = null;
      if (value instanceof ArrayBuffer) {
        bytes = Buffer.from(value);
      } else if (ArrayBuffer.isView(value)) {
        bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      } else if (Buffer.isBuffer(value)) {
        bytes = value;
      }
      if (!bytes || bytes.byteLength === 0) {
        debug?.(
          "[browser-recording] ignored empty chunk value=" +
            Object.prototype.toString.call(message.data),
        );
        return;
      }
      debug?.(`[browser-recording] received WebM chunk bytes=${bytes.byteLength}`);
      writeChain = writeChain
        .then(async () => {
          if (!fileHandle) {
            throw recorderError("output file is already closed");
          }
          await fileHandle.write(bytes);
        })
        .catch((error: unknown) => {
          writeError ??= error;
        });
    } else if (message.type === "stopped") {
      stopped.resolve();
    } else if (message.type === "error") {
      fail(recorderError(typeof message.message === "string" ? message.message : "unknown error"));
    } else if (message.type === "diagnostic") {
      debug?.("[browser-recording] " + String(message.message ?? ""));
    }
  };
  const onPortClose = (): void => {
    if (!closed) {
      fail(recorderError("recorder MessagePort closed unexpectedly"));
    }
  };
  const onRendererGone = (_event: unknown, details: { reason?: string }): void => {
    if (!closed) {
      fail(recorderError(`recorder renderer exited: ${details.reason ?? "unknown"}`));
    }
  };
  const onConsoleMessage = (details: { level?: string; message?: string }): void => {
    debug?.(
      `[browser-recording] recorder console level=${details.level ?? "unknown"} message=${details.message ?? ""}`,
    );
  };
  mainPort.on("message", onMessage);
  mainPort.on("close", onPortClose);
  mainPort.start();
  recorderWindow.webContents.on("render-process-gone", onRendererGone);
  recorderWindow.webContents.on("console-message", onConsoleMessage);

  const cleanup = async (cancel: boolean): Promise<void> => {
    if (closed) {
      return;
    }
    closed = true;
    input.signal.removeEventListener("abort", onAbort);
    if (cancel) {
      try {
        mainPort.postMessage({ type: "cancel" });
      } catch {
        // The renderer may already be gone.
      }
    }
    await writeChain.catch(() => undefined);
    await fileHandle?.close().catch(() => undefined);
    fileHandle = undefined;
    mainPort.removeListener("message", onMessage);
    try {
      mainPort.close();
    } catch {
      // The port may already be closed.
    }
    try {
      rendererPort.close();
    } catch {
      // The port may already be closed.
    }
    try {
      recorderSession.setDisplayMediaRequestHandler(null);
    } catch {
      // The session may already be unavailable.
    }
    recorderWindow.webContents.removeListener("render-process-gone", onRendererGone);
    recorderWindow.webContents.removeListener("console-message", onConsoleMessage);
    if (!recorderWindow.isDestroyed()) {
      recorderWindow.destroy();
    }
    await rm(recorderDocument, { force: true }).catch(() => undefined);
  };
  const onAbort = (): void => {
    fail(abortError());
    void cleanup(true);
  };
  input.signal.addEventListener("abort", onAbort, { once: true });

  try {
    await writeFile(recorderDocument, RECORDER_HTML, { encoding: "utf8", mode: 0o600 });
    recorderSession.setDisplayMediaRequestHandler((request, callback) => {
      if (
        closed ||
        request.frame !== recorderWindow.webContents.mainFrame ||
        !request.videoRequested ||
        request.audioRequested ||
        targetFrame.isDestroyed() ||
        targetFrame.detached
      ) {
        callback({});
        return;
      }
      callback({ video: targetFrame });
    });
    fileHandle = await open(input.outputPath, "w");
    await recorderWindow.loadFile(recorderDocument);
    await rm(recorderDocument, { force: true }).catch(() => undefined);
    recorderWindow.webContents.postMessage(CHANNEL, null, [rendererPort]);
    await awaitPhase(ready, START_TIMEOUT_MS, "recorder renderer did not become ready");
    mainPort.postMessage({
      type: "start",
      fps: input.fps,
      width: input.viewport.width,
      height: input.viewport.height,
    });
    await awaitPhase(started, START_TIMEOUT_MS, "MediaRecorder did not start");
  } catch (error) {
    fail(error);
    await cleanup(true);
    throw error;
  }

  return {
    stop: async (): Promise<void> => {
      if (closed) {
        throw recorderError("recorder is already closed");
      }
      if (stopping) {
        await awaitPhase(stopped, STOP_TIMEOUT_MS, "MediaRecorder did not stop");
        return;
      }
      stopping = true;
      mainPort.postMessage({ type: "stop" });
      try {
        await awaitPhase(stopped, STOP_TIMEOUT_MS, "MediaRecorder did not stop");
        await writeChain;
        if (writeError) {
          throw writeError;
        }
      } finally {
        await cleanup(false);
      }
    },
    cancel: () => cleanup(true),
  };
}

export const defaultElectronBrowserWebmRecorder: BrowserWebmRecorderFactory =
  createElectronBrowserWebmRecorder;
