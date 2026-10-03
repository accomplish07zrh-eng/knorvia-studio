import type {ControlledView} from './browserCommandTypes.js';
import type {BrowserCommand,BrowserCommandResult} from '@knorvia/shared';
type Done=(partial:Omit<BrowserCommandResult,'elapsedMs'>)=>BrowserCommandResult;
export declare function handlePlaywrightAction(view:ControlledView,action:unknown,done:Done,signal?:AbortSignal):Promise<BrowserCommandResult>;
