import type { BrowserScreenshotActivityLease as ActivityLease } from './browserScreenshotSurfaceContracts.js';
import {
    DesktopBrowserScreenshotTransientRetry,
    isTransientScreenshotCaptureError,
} from './browserScreenshotTransientRetry.js';
import {
    startBrowserScreenshotTransparentWindowBootstrap,
    TRANSPARENT_WINDOW_PRESENTATION_GRACE_MS,
} from './browserTransparentWindowBootstrap.js';
import type {
    BrowserWindowForTransparentBootstrap,
    TransparentWindowBootstrap,
} from './browserTransparentWindowBootstrap.js';

type Target = 'owner' | 'guest';
type Outcome = { readonly ok: true } | { readonly ok: false; readonly transient: boolean };

interface CapturingWebContents {
    id: number;
    isDestroyed(): boolean;
    capturePage(rect: { x: number; y: number; width: number; height: number }): Promise<unknown>;
}

interface WindowForActivity extends BrowserWindowForTransparentBootstrap {
    webContents: CapturingWebContents;
}

interface GuestForActivity extends CapturingWebContents {
    readonly hostWebContents: { id: number } | null;
}

interface ControllerOptions {
    fromId(windowId: number): WindowForActivity | null;
    fromWebContentsId(id: number): GuestForActivity | null;
    allowTransparentWindowBootstrap?: boolean;
    hideTaskbarDuringTransparentWindowBootstrap?: boolean;
    log?(message: string): void;
}

interface Runtime {
    running: boolean;
    wakeDelay?: () => void;
    transientRetry: DesktopBrowserScreenshotTransientRetry;
}

interface ActivityState {
    key: string;
    windowId: number;
    webContentsId: number;
    tokens: Map<symbol, { prepared: boolean }>;
    restoreGeneration: number;
    active: boolean;
    invalidationController: AbortController;
    bootstrap?: TransparentWindowBootstrap;
    pumpsAllowed: boolean;
    bootstrapGraceTimer?: ReturnType<typeof setTimeout>;
    owner: Runtime;
    guest: Runtime;
}

const captureRect = { x: 0, y: 0, width: 1, height: 1 };
const success: Outcome = { ok: true };
const fatal: Outcome = { ok: false, transient: false };
const transient: Outcome = { ok: false, transient: true };

export class DesktopBrowserScreenshotActivityController {
    private readonly states = new Map<string, ActivityState>();

    constructor(private readonly options: ControllerOptions) {}

    acquire(input: {
        windowId: number;
        webContentsId: number;
        requestId: string;
        reason: 'browser-screenshot';
    }): ActivityLease | undefined {
        const { windowId, webContentsId, requestId } = input;
        const key = `${windowId}:${webContentsId}`;
        let state = this.states.get(key);

        if (state && !state.active) {
            this.states.delete(key);
            state = undefined;
        }

        if (!state) {
            const targets = this.resolveTargets(windowId, webContentsId);
            if (!targets) {
                this.options.log?.(
                    `[browser-screenshot-activity] acquire skipped windowId=${windowId} webContentsId=${webContentsId} requestId=${requestId}`,
                );
                return undefined;
            }

            const bootstrap = startBrowserScreenshotTransparentWindowBootstrap({
                win: targets.ownerWindow,
                enabled: this.options.allowTransparentWindowBootstrap === true,
                windowId,
                webContentsId,
                requestId,
                hideTaskbarDuringBootstrap:
                    this.options.hideTaskbarDuringTransparentWindowBootstrap === true,
                log: this.options.log,
            });
            if (bootstrap === false) return undefined;

            state = {
                key,
                windowId,
                webContentsId,
                tokens: new Map(),
                restoreGeneration: 0,
                active: true,
                invalidationController: new AbortController(),
                bootstrap,
                pumpsAllowed: !bootstrap,
                owner: {
                    running: false,
                    transientRetry: new DesktopBrowserScreenshotTransientRetry({ log: this.options.log }),
                },
                guest: {
                    running: false,
                    transientRetry: new DesktopBrowserScreenshotTransientRetry({ log: this.options.log }),
                },
            };
            this.states.set(key, state);
            if (bootstrap) this.scheduleBootstrapGrace(state);
        } else {
            state.restoreGeneration += 1;
            state.owner.transientRetry.reset();
            state.guest.transientRetry.reset();
        }

        const token = Symbol(requestId);
        state.tokens.set(token, { prepared: false });
        this.wakePumps(state);
        if (state.pumpsAllowed) {
            this.ensurePump(state, 'owner');
            this.ensurePump(state, 'guest');
        }

        let released = false;
        return {
            invalidated: state.invalidationController.signal,
            markPrepared: () => {
                if (released) return;
                const entry = state.tokens.get(token);
                if (!entry || entry.prepared) return;
                entry.prepared = true;
                this.maybeReleaseBootstrap(state);
                this.wakePumps(state);
                if (state.pumpsAllowed) {
                    this.ensurePump(state, 'owner');
                    this.ensurePump(state, 'guest');
                }
            },
            release: () => {
                if (released) return;
                released = true;
                this.releaseToken(state, token);
            },
        };
    }

    private resolveTargets(
        windowId: number,
        webContentsId: number,
    ): { ownerWindow: WindowForActivity; owner: CapturingWebContents; guest: GuestForActivity } | undefined {
        const ownerWindow = this.options.fromId(windowId);
        if (!ownerWindow || ownerWindow.isDestroyed() || ownerWindow.webContents.isDestroyed()) {
            return undefined;
        }
        const guest = this.options.fromWebContentsId(webContentsId);
        if (
            !guest ||
            guest.isDestroyed() ||
            guest.id !== webContentsId ||
            guest.hostWebContents?.id !== ownerWindow.webContents.id
        ) {
            return undefined;
        }
        return { ownerWindow, owner: ownerWindow.webContents, guest };
    }

    private mode(state: ActivityState, target: Target): 'stopped' | 'continuous' | 'paced' {
        if (!state.active || state.tokens.size === 0) return 'stopped';
        for (const token of state.tokens.values()) {
            if (!token.prepared) return 'continuous';
        }
        return target === 'owner' ? 'stopped' : 'paced';
    }

    private ensurePump(state: ActivityState, target: Target): void {
        const runtime = state[target];
        if (runtime.running || this.mode(state, target) === 'stopped') return;
        void this.runPump(state, target, runtime);
    }

    private async runPump(state: ActivityState, target: Target, runtime: Runtime): Promise<void> {
        runtime.running = true;
        let pendingStartedAt = Date.now();
        let pending: Promise<Outcome> | undefined = this.captureOnce(state, target);
        try {
            while (pending) {
                const mode = this.mode(state, target);
                if (mode === 'stopped') {
                    const outcome = await pending;
                    if (!outcome.ok) this.invalidate(state, target);
                    pending = undefined;
                    continue;
                }

                if (mode === 'continuous') {
                    const nextStartedAt = Date.now();
                    const next = this.captureOnce(state, target);
                    const outcome = await pending;
                    if (!outcome.ok) {
                        if (!outcome.transient) {
                            this.invalidate(state, target);
                            continue;
                        }
                        const recovered = await this.recoverContinuousTransient(state, target, runtime, next);
                        pending = recovered?.pending;
                        continue;
                    }
                    runtime.transientRetry.reset();
                    pending = next;
                    pendingStartedAt = nextStartedAt;
                    if (this.mode(state, target) === 'continuous') {
                        await this.waitWakeable(runtime, 0);
                    }
                    continue;
                }

                const outcome = await pending;
                if (!outcome.ok) {
                    this.invalidate(state, target);
                    pending = undefined;
                    continue;
                }
                pending = undefined;
                const remaining = Math.max(0, 200 - (Date.now() - pendingStartedAt));
                if (this.mode(state, target) === 'paced' && remaining !== 0) {
                    await this.waitWakeable(runtime, remaining);
                }
                if (this.mode(state, target) === 'stopped') continue;
                pendingStartedAt = Date.now();
                pending = this.captureOnce(state, target);
            }
        } finally {
            runtime.wakeDelay = undefined;
            runtime.running = false;
            if (this.mode(state, target) !== 'stopped') this.ensurePump(state, target);
        }
    }

    private async recoverContinuousTransient(
        state: ActivityState,
        target: Target,
        runtime: Runtime,
        next: Promise<Outcome>,
    ): Promise<{ pending: Promise<Outcome> } | undefined> {
        const nextOutcome = await next;
        if (nextOutcome.ok) {
            runtime.transientRetry.reset();
            return { pending: this.captureOnce(state, target) };
        }
        if (
            !nextOutcome.transient ||
            !runtime.transientRetry.schedule({
                target,
                windowId: state.windowId,
                webContentsId: state.webContentsId,
            })
        ) {
            this.invalidate(state, target);
            return undefined;
        }
        if (this.mode(state, target) !== 'stopped') {
            await this.waitWakeable(runtime, runtime.transientRetry.retryDelayMs());
        }
        if (this.mode(state, target) === 'stopped') return undefined;
        return { pending: this.captureOnce(state, target) };
    }

    private async captureOnce(state: ActivityState, target: Target): Promise<Outcome> {
        const targets = this.resolveTargets(state.windowId, state.webContentsId);
        if (!targets) return fatal;
        try {
            await targets[target].capturePage(captureRect);
            return success;
        } catch (error) {
            this.options.log?.(
                `[browser-screenshot-activity] capture failed target=${target} windowId=${state.windowId} webContentsId=${state.webContentsId} error=${error instanceof Error ? error.message : String(error)}`,
            );
            return isTransientScreenshotCaptureError(error) ? transient : fatal;
        }
    }

    private waitWakeable(runtime: Runtime, delayMs: number): Promise<void> {
        return new Promise((resolve) => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (runtime.wakeDelay === finish) runtime.wakeDelay = undefined;
                resolve();
            };
            const timer = setTimeout(finish, delayMs);
            runtime.wakeDelay = finish;
        });
    }

    private wakePumps(state: ActivityState): void {
        state.owner.wakeDelay?.();
        state.guest.wakeDelay?.();
    }

    private releaseToken(state: ActivityState, token: symbol): void {
        if (this.states.get(state.key) !== state || !state.tokens.delete(token)) return;
        this.wakePumps(state);
        if (state.tokens.size !== 0) return;
        const generation = ++state.restoreGeneration;
        queueMicrotask(() => {
            if (
                this.states.get(state.key) !== state ||
                state.tokens.size !== 0 ||
                state.restoreGeneration !== generation
            ) return;
            state.active = false;
            this.releaseBootstrap(state);
            this.wakePumps(state);
            if (this.states.get(state.key) === state) this.states.delete(state.key);
        });
    }

    private scheduleBootstrapGrace(state: ActivityState): void {
        state.bootstrapGraceTimer = setTimeout(() => {
            state.bootstrapGraceTimer = undefined;
            if (!state.active || this.states.get(state.key) !== state) return;
            state.pumpsAllowed = true;
            this.ensurePump(state, 'owner');
            this.ensurePump(state, 'guest');
            this.maybeReleaseBootstrap(state);
        }, TRANSPARENT_WINDOW_PRESENTATION_GRACE_MS);
    }

    private maybeReleaseBootstrap(state: ActivityState): void {
        if (!state.pumpsAllowed) return;
        for (const token of state.tokens.values()) {
            if (!token.prepared) return;
        }
        this.releaseBootstrap(state);
    }

    private releaseBootstrap(state: ActivityState): void {
        if (state.bootstrapGraceTimer) {
            clearTimeout(state.bootstrapGraceTimer);
            state.bootstrapGraceTimer = undefined;
        }
        state.bootstrap?.release();
        state.bootstrap = undefined;
    }

    private invalidate(state: ActivityState, target: Target): void {
        if (!state.active || state.tokens.size === 0) return;
        state.active = false;
        this.releaseBootstrap(state);
        this.wakePumps(state);
        if (this.states.get(state.key) === state) this.states.delete(state.key);
        if (!state.invalidationController.signal.aborted) {
            state.invalidationController.abort(
                new Error(`browser screenshot activity capture failed for ${target}`),
            );
        }
    }
}
